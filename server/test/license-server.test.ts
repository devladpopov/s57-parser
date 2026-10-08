import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { generateKeys, verifyLicense } from '../../demo/license.js';
import { addAccount, issue, MAX_DEVICES, newKey, resetDevices, type Db } from '../license-store.js';
import { handler, loadDb, saveDb } from '../license-server.js';
import { waitlistEntry } from '../waitlist.js';

const NOW = 1_790_000_000;
let keys: Awaited<ReturnType<typeof generateKeys>>;
let dir: string;
beforeAll(async () => {
  keys = await generateKeys();
  dir = mkdtempSync(join(tmpdir(), 'lic-'));
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe('licence accounts', () => {
  test('activation keys look like ABCDE-FGHJK', () => {
    expect(newKey()).toMatch(/^[A-Z2-9]{5}-[A-Z2-9]{5}$/);
  });

  test('issues a token bound to the device with server time and the paid end', async () => {
    const db: Db = {};
    const acc = addAccount(db, 'pro', NOW + 100, 'buyer@example.com');
    expect(acc.note).toBe('buyer@example.com');
    const r = await issue(db, acc.key.toLowerCase(), 'd1', NOW, keys.privateJwk);
    if (!('token' in r)) throw new Error(r.error);
    expect(await verifyLicense(r.token, keys.publicJwk, 'd1')).toEqual({ sub: acc.key, plan: 'pro', iat: NOW, exp: NOW + 100, dev: 'd1' });
    expect(acc.devices).toEqual(['d1']);
  });

  test('refuses unknown keys, ended periods, bad input and a third device', async () => {
    const db: Db = {};
    const acc = addAccount(db, 'pro-charts', NOW + 100);
    expect(await issue(db, 'NOPE', 'd1', NOW, keys.privateJwk)).toEqual({ error: 'unknown-key' });
    expect(await issue(db, acc.key, 'd1', NOW + 100, keys.privateJwk)).toEqual({ error: 'expired' });
    expect(await issue(db, 42, 'd1', NOW, keys.privateJwk)).toEqual({ error: 'bad-request' });
    expect(await issue(db, acc.key, '', NOW, keys.privateJwk)).toEqual({ error: 'bad-request' });
    for (let i = 0; i < MAX_DEVICES; i++) expect('token' in (await issue(db, acc.key, `d${i}`, NOW, keys.privateJwk))).toBe(true);
    expect('token' in (await issue(db, acc.key, 'd0', NOW, keys.privateJwk))).toBe(true); // a known device again
    expect(await issue(db, acc.key, 'other', NOW, keys.privateJwk)).toEqual({ error: 'device-limit' });
    expect(resetDevices(db, acc.key)).toBe(true);
    expect(resetDevices(db, 'NOPE')).toBe(false);
    expect('token' in (await issue(db, acc.key, 'other', NOW, keys.privateJwk))).toBe(true);
  });
});

describe('licence server', () => {
  const post = (body: string, method = 'POST', path = '/license') =>
    new Request(`http://x${path}`, { method, body: method === 'POST' ? body : undefined, headers: { 'Content-Type': 'application/json' } });

  test('activates over HTTP and keeps the device in the accounts file', async () => {
    const path = join(dir, 'db.json');
    expect(loadDb(path)).toEqual({});
    const db: Db = {};
    const acc = addAccount(db, 'pro', NOW + 1000);
    saveDb(path, db);
    const h = handler(path, keys.privateJwk, 'https://example.org', () => NOW);
    const res = await h(post(JSON.stringify({ key: acc.key, dev: 'phone' })));
    expect(res.status).toBe(200);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://example.org');
    const { token } = (await res.json()) as { token: string };
    expect((await verifyLicense(token, keys.publicJwk, 'phone'))?.plan).toBe('pro');
    expect(loadDb(path)[acc.key].devices).toEqual(['phone']);

    const parallel = await Promise.all(['a', 'b', 'c'].map((d) => h(post(JSON.stringify({ key: acc.key, dev: d })))));
    expect(parallel.map((r) => r.status).sort()).toEqual([200, 403, 403]);
    expect(loadDb(path)[acc.key].devices).toHaveLength(MAX_DEVICES);
  });

  test('errors and preflight', async () => {
    const h = handler(join(dir, 'empty.json'), keys.privateJwk, '*');
    expect((await h(post('{"key":"NOPE","dev":"x"}'))).status).toBe(403);
    expect((await h(post('not json'))).status).toBe(400);
    expect((await h(post('{}'))).status).toBe(400);
    expect((await h(post('', 'OPTIONS'))).status).toBe(204);
    expect((await h(post('', 'GET'))).status).toBe(405);
    expect((await h(post('{}', 'POST', '/other'))).status).toBe(404);
  });
});

describe('waitlist', () => {
  const at = new Date('2026-10-08T12:00:00Z');

  test('keeps an email or a phone with the survey answers, trimmed and bounded', () => {
    const e = waitlistEntry({ contact: ' a@b.ru ', boat: 'яхта', waters: ['Ладога', 5, 'x'.repeat(99)], now: 'Navionics', pay: 'да', wish: 'w'.repeat(2000), src: 'katera' }, at);
    expect(e).toMatchObject({ time: '2026-10-08T12:00:00.000Z', contact: 'a@b.ru', boat: 'яхта', now: [], pay: 'да', src: 'katera' });
    expect(e?.waters).toEqual(['Ладога', 'x'.repeat(60)]);
    expect(e?.wish).toHaveLength(1000);
    expect(waitlistEntry({ contact: '+7 (921) 123-45-67' }, at)?.contact).toBe('+7 (921) 123-45-67');
  });

  test('refuses entries without a usable contact', () => {
    expect(waitlistEntry({ contact: 'hello' }, at)).toBeNull();
    expect(waitlistEntry({ contact: '12345' }, at)).toBeNull();
    expect(waitlistEntry(null, at)).toBeNull();
  });

  test('POST /api/waitlist appends a line', async () => {
    const path = join(dir, 'wl.jsonl');
    const h = handler(join(dir, 'db2.json'), keys.privateJwk, '*', () => NOW, path);
    const send = (body: unknown) => h(new Request('http://x/api/waitlist', { method: 'POST', body: JSON.stringify(body) }));
    expect((await send({ contact: 'a@b.ru', pay: 'да' })).status).toBe(200);
    expect((await send({ contact: 'nope' })).status).toBe(400);
    const lines = readFileSync(path, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ contact: 'a@b.ru', pay: 'да' });
  });

  test('the licence also answers under /api/', async () => {
    const h = handler(join(dir, 'db3.json'), keys.privateJwk, '*', () => NOW);
    expect((await h(new Request('http://x/api/license', { method: 'POST', body: '{"key":"NOPE","dev":"x"}' }))).status).toBe(403);
  });
});
