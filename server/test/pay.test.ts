import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { generateKeys } from '../../demo/license.js';
import { handler, loadDb } from '../license-server.js';
import { confirmPayment, createOrder, loadOrders, orderStatus, phpUrlencode, type Orders, type RobokassaConfig } from '../pay.js';
import type { Db } from '../license-store.js';

const NOW = 1_790_000_000;
const cfg: RobokassaConfig = { login: 'plotter', pass1: 'p1', pass2: 'p2', test: true, page: 'https://plotter.stadika.ru/pay/' };
const sha512 = (s: string) => new Bun.CryptoHasher('sha512').update(s).digest('hex');
const resultSig = (sum: string, inv: number, t: string) => sha512(`${sum}:${inv}:p2:Shp_t=${t}`);

let dir: string;
beforeAll(() => { dir = mkdtempSync(join(tmpdir(), 'pay-')); });
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe('Robokassa payments', () => {
  test('urlencodes like PHP', () => {
    expect(phpUrlencode('{"a":"б в!*"}')).toBe('%7B%22a%22%3A%22%D0%B1+%D0%B2%21%2A%22%7D');
  });

  test('builds a signed payment link with a receipt', () => {
    const o: Orders = { next: 5, orders: {} };
    const r = createOrder(o, cfg, { tariff: 'season', email: ' a@b.ru ' }, NOW)!;
    expect(r.order).toMatchObject({ inv: 5, tariff: 'season', sum: 1990, email: 'a@b.ru' });
    expect(o.next).toBe(6);
    const q = new URL(r.url).searchParams;
    expect(q.get('OutSum')).toBe('1990.00');
    expect(q.get('IsTest')).toBe('1');
    expect(JSON.parse(decodeURIComponent(q.get('Receipt')!.replace(/\+/g, ' '))).items[0].sum).toBe(1990);
    expect(q.get('SignatureValue')).toBe(sha512(`plotter:1990.00:5:${q.get('Receipt')}:p1:Shp_t=${r.order.t}`));
  });

  test('refuses unknown tariffs and bad emails', () => {
    const o: Orders = { next: 1, orders: {} };
    expect(createOrder(o, cfg, { tariff: 'forever', email: 'a@b.ru' }, NOW)).toBeNull();
    expect(createOrder(o, cfg, { tariff: 'month', email: 'nope' }, NOW)).toBeNull();
    expect(o.next).toBe(1);
  });

  test('creates the key once on a valid Result call and shows it only with the token', () => {
    const o: Orders = { next: 1, orders: {} };
    const db: Db = {};
    const { order } = createOrder(o, cfg, { tariff: 'month', email: 'a@b.ru' }, NOW)!;
    expect(orderStatus(o, db, { inv: 1, t: order.t })).toEqual({ paid: false });
    const f = { OutSum: '390.000000', InvId: '1', Shp_t: order.t, SignatureValue: resultSig('390.000000', 1, order.t).toUpperCase() };
    expect(confirmPayment(o, db, cfg, f, NOW)).toBe('OK1');
    const key = o.orders[1].key!;
    expect(db[key]).toMatchObject({ plan: 'pro', exp: NOW + 31 * 86400 });
    expect(confirmPayment(o, db, cfg, f, NOW + 5)).toBe('OK1');
    expect(Object.keys(db)).toEqual([key]);
    expect(orderStatus(o, db, { inv: 1, t: order.t })).toEqual({ paid: true, key, exp: NOW + 31 * 86400, tariff: 'month' });
    expect(orderStatus(o, db, { inv: 1, t: 'guess' })).toBeNull();
  });

  test('ignores forged signatures and changed sums', () => {
    const o: Orders = { next: 1, orders: {} };
    const db: Db = {};
    const { order } = createOrder(o, cfg, { tariff: 'year', email: 'a@b.ru' }, NOW)!;
    expect(confirmPayment(o, db, cfg, { OutSum: '2490.00', InvId: '1', Shp_t: order.t, SignatureValue: 'x' }, NOW)).toBeNull();
    expect(confirmPayment(o, db, cfg, { OutSum: '1.00', InvId: '1', Shp_t: order.t, SignatureValue: resultSig('1.00', 1, order.t) }, NOW)).toBeNull();
    expect(confirmPayment(o, db, cfg, { OutSum: '2490.00', InvId: '2', Shp_t: order.t, SignatureValue: resultSig('2490.00', 2, order.t) }, NOW)).toBeNull();
    expect(db).toEqual({});
  });

  test('works end to end through the server', async () => {
    const keys = await generateKeys();
    const dbPath = join(dir, 'db.json');
    const ordersPath = join(dir, 'orders.json');
    const h = handler(dbPath, keys.privateJwk, '*', () => NOW, join(dir, 'w.jsonl'), { ordersPath, cfg });
    const post = (path: string, body: unknown) => h(new Request(`http://x/api${path}`, { method: 'POST', body: JSON.stringify(body) }));
    const { url } = (await (await post('/pay', { tariff: 'month', email: 'a@b.ru' })).json()) as { url: string };
    const t = new URL(url).searchParams.get('Shp_t')!;
    const form = new URLSearchParams({ OutSum: '390.000000', InvId: '1', Shp_t: t, SignatureValue: resultSig('390.000000', 1, t) });
    const res = await h(new Request('http://x/api/pay/result', { method: 'POST', body: form }));
    expect(await res.text()).toBe('OK1');
    const st = (await (await post('/pay/status', { inv: 1, t })).json()) as { key: string };
    expect(Object.keys(loadDb(dbPath))).toEqual([st.key]);
    expect(loadOrders(ordersPath).orders[1].paid).toBe(NOW);
    const back = await h(new Request(`http://x/api/pay/success?InvId=1&Shp_t=${t}&OutSum=390`));
    expect(back.status).toBe(302);
    expect(back.headers.get('location')).toBe(`https://plotter.stadika.ru/pay/?inv=1&t=${t}`);
    const bad = await h(new Request('http://x/api/pay/result', { method: 'POST', body: new URLSearchParams({ OutSum: '390', InvId: '1', Shp_t: t, SignatureValue: 'x' }) }));
    expect(bad.status).toBe(400);
  });

  test('server errors and preflight', async () => {
    const keys = await generateKeys();
    const h = handler(join(dir, 'db2.json'), keys.privateJwk, '*', () => NOW, join(dir, 'w.jsonl'), { ordersPath: join(dir, 'orders2.json'), cfg });
    const req = (path: string, init?: RequestInit) => h(new Request(`http://x/api${path}`, init));
    expect((await req('/pay', { method: 'OPTIONS' })).status).toBe(204);
    expect((await req('/pay')).status).toBe(405);
    expect((await req('/pay/result', { method: 'POST', body: 'x', headers: { 'Content-Type': 'multipart/form-data' } })).status).toBe(400);
    expect((await req('/pay', { method: 'POST', body: '{' })).status).toBe(400);
    expect((await req('/pay', { method: 'POST', body: JSON.stringify({ tariff: 'nope' }) })).status).toBe(400);
    expect((await req('/pay/status', { method: 'POST', body: JSON.stringify({ inv: 9, t: 'x' }) })).status).toBe(404);
    expect((await req('/pay/other', { method: 'POST', body: '{}' })).status).toBe(404);
    const fail = await req('/pay/fail?InvId=1');
    expect(fail.status).toBe(302);
  });
});
