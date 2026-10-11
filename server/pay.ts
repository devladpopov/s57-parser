/**
 * Paying for Pro through Robokassa (shop of ООО «Стадика»).
 *
 *   POST /pay          {"tariff": "month"|"season"|"year", "email": "..."}  ->  {"url": "<Robokassa payment page>"}
 *   POST /pay/result   Robokassa Result URL (form fields, signed with password #2)  ->  "OK<InvId>"
 *   GET  /pay/success  Robokassa Success URL  ->  redirect to the site's /pay/ page
 *   GET  /pay/fail     Robokassa Fail URL     ->  redirect to the site's /pay/ page
 *   POST /pay/status   {"inv": 12, "t": "<order token>"}  ->  {"paid": false} | {"paid": true, "key": "...", "exp": ...}
 *
 * The activation key is created when Robokassa confirms the payment and is
 * shown on the /pay/ page, which knows the order by its number and the random
 * token that went through Robokassa as Shp_t. Orders are kept in one JSON file.
 */
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { addAccount, type Db } from './license-store.js';

export interface Tariff {
  name: string;
  price: number;
  days: number;
}

export const TARIFFS: Record<string, Tariff> = {
  month: { name: 'Плоттер Стадики Pro, 1 месяц', price: 390, days: 31 },
  season: { name: 'Плоттер Стадики Pro, сезон (6 месяцев)', price: 1990, days: 183 },
  year: { name: 'Плоттер Стадики Pro, 1 год', price: 2490, days: 365 },
};

export interface Order {
  inv: number;
  tariff: string;
  sum: number;
  email: string;
  /** Random token that identifies the buyer's browser on the /pay/ page. */
  t: string;
  created: number;
  paid?: number;
  key?: string;
}

export interface Orders {
  next: number;
  orders: Record<string, Order>;
}

export interface RobokassaConfig {
  login: string;
  pass1: string;
  pass2: string;
  test: boolean;
  /** Where Success and Fail send the buyer, e.g. https://plotter.stadika.ru/pay/ */
  page: string;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function loadOrders(path: string): Orders {
  return existsSync(path) ? (JSON.parse(readFileSync(path, 'utf8')) as Orders) : { next: 1, orders: {} };
}

export function saveOrders(path: string, o: Orders): void {
  writeFileSync(`${path}.tmp`, JSON.stringify(o, null, 2));
  renameSync(`${path}.tmp`, path);
}

const sha512 = (s: string) => new Bun.CryptoHasher('sha512').update(s).digest('hex');

/** PHP urlencode, which Robokassa expects for the Receipt inside the signature. */
export const phpUrlencode = (s: string) =>
  encodeURIComponent(s).replace(/[!'()*~]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`).replace(/%20/g, '+');

/** A new order and the Robokassa payment page for it, or null for bad input. */
export function createOrder(o: Orders, cfg: RobokassaConfig, body: unknown, now: number): { order: Order; url: string } | null {
  const b = (body ?? {}) as Record<string, unknown>;
  const tariff = typeof b.tariff === 'string' ? TARIFFS[b.tariff] : undefined;
  const email = typeof b.email === 'string' ? b.email.trim().slice(0, 120) : '';
  if (!tariff || !EMAIL.test(email)) return null;
  const t = [...crypto.getRandomValues(new Uint8Array(12))].map((x) => x.toString(16).padStart(2, '0')).join('');
  const order: Order = { inv: o.next++, tariff: b.tariff as string, sum: tariff.price, email, t, created: now };
  o.orders[order.inv] = order;
  // Receipt for 54-FZ, as in the other shops of the company.
  const receipt = phpUrlencode(JSON.stringify({
    items: [{ name: tariff.name, quantity: 1, sum: tariff.price, tax: 'none', payment_method: 'full_payment', payment_object: 'service' }],
  }));
  const sum = tariff.price.toFixed(2);
  const sig = sha512(`${cfg.login}:${sum}:${order.inv}:${receipt}:${cfg.pass1}:Shp_t=${t}`);
  const q = new URLSearchParams({
    MerchantLogin: cfg.login, OutSum: sum, InvId: String(order.inv), Description: tariff.name,
    Receipt: receipt, Email: email, Culture: 'ru', Shp_t: t, SignatureValue: sig,
    ...(cfg.test ? { IsTest: '1' } : {}),
  });
  return { order, url: `https://auth.robokassa.ru/Merchant/Index.aspx?${q}` };
}

/**
 * Handles Robokassa's Result call: checks the signature and the sum, then
 * creates the activation key once. Returns the reply text or null when the call is not valid.
 */
export function confirmPayment(o: Orders, db: Db, cfg: RobokassaConfig, f: Record<string, string>, now: number): string | null {
  const inv = Number(f.InvId);
  const order = o.orders[inv];
  if (!order || !f.OutSum || !f.SignatureValue) return null;
  if (sha512(`${f.OutSum}:${f.InvId}:${cfg.pass2}:Shp_t=${f.Shp_t ?? ''}`).toLowerCase() !== f.SignatureValue.toLowerCase()) return null;
  if (f.Shp_t !== order.t || Number(f.OutSum) !== order.sum) return null;
  if (!order.key) {
    const acc = addAccount(db, 'pro', now + TARIFFS[order.tariff].days * 86400, `robokassa #${inv} ${order.email}`);
    order.key = acc.key;
    order.paid = now;
  }
  return `OK${inv}`;
}

/** What the /pay/ page shows for an order. */
export function orderStatus(o: Orders, db: Db, body: unknown): { paid: false } | { paid: true; key: string; exp: number; tariff: string } | null {
  const b = (body ?? {}) as Record<string, unknown>;
  const order = o.orders[Number(b.inv)];
  if (!order || typeof b.t !== 'string' || b.t !== order.t) return null;
  if (!order.key) return { paid: false };
  return { paid: true, key: order.key, exp: db[order.key]?.exp ?? 0, tariff: order.tariff };
}

/** The /pay/ page address for Success and Fail, carrying the order number and token. */
export function backToSite(cfg: RobokassaConfig, url: URL, failed: boolean): string {
  const q = new URLSearchParams({ inv: url.searchParams.get('InvId') ?? '', t: url.searchParams.get('Shp_t') ?? '' });
  if (failed) q.set('fail', '1');
  return `${cfg.page}?${q}`;
}
