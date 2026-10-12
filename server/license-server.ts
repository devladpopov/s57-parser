/**
 * Licence server for the plotter.
 *
 *   POST /license   {"key": "ABCDE-FGHJK", "dev": "<device id>"}  ->  {"token": "..."} | {"error": "..."}
 *   POST /waitlist  {"contact": "...", survey answers}  ->  {"ok": true}
 *   /pay...         buying a key through Robokassa, see pay.ts
 *
 * All also answer under /api/ (behind the site's reverse proxy).
 *
 * Environment: LICENSE_PRIVATE_JWK (signing key, JSON), LICENSE_DB (accounts
 * file, default ./license-db.json), WAITLIST (sign-ups,
 * default ./waitlist.jsonl), PORT (default 8787), ALLOWED_ORIGIN
 * (CORS, default *), ORDERS (payments, default ./orders.json) and
 * ROBOKASSA_LOGIN, ROBOKASSA_PASS1, ROBOKASSA_PASS2, ROBOKASSA_TEST=1,
 * PAY_PAGE (payments are off without the login). Accounts can also be added
 * by hand with server/license-admin.ts.
 */
import { readFileSync, writeFileSync, existsSync, renameSync } from 'node:fs';
import { issue, type Db } from './license-store.js';
import { appendWaitlist, waitlistEntry } from './waitlist.js';
import { backToSite, confirmPayment, createOrder, loadOrders, orderStatus, saveOrders, type RobokassaConfig } from './pay.js';

export function loadDb(path: string): Db {
  return existsSync(path) ? (JSON.parse(readFileSync(path, 'utf8')) as Db) : {};
}

export function saveDb(path: string, db: Db): void {
  writeFileSync(`${path}.tmp`, JSON.stringify(db, null, 2));
  renameSync(`${path}.tmp`, path);
}

export interface PayOptions {
  ordersPath: string;
  cfg: RobokassaConfig;
}

export function handler(dbPath: string, privateJwk: JsonWebKey, origin: string, clock = () => Math.floor(Date.now() / 1000), waitlistPath = './waitlist.jsonl', pay?: PayOptions) {
  const cors = { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods': 'POST', 'Access-Control-Allow-Headers': 'Content-Type' };
  const json = (body: unknown, status = 200) => Response.json(body, { status, headers: cors });
  // One request at a time touches the accounts and orders files.
  let queue: Promise<unknown> = Promise.resolve();
  const serial = <T>(f: () => Promise<T>): Promise<T> => { const p = queue.then(f); queue = p.catch(() => {}); return p; };

  async function payRoute(path: string, req: Request, url: URL, { ordersPath, cfg }: PayOptions): Promise<Response> {
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (req.method === 'GET' && (path === '/pay/success' || path === '/pay/fail')) {
      return Response.redirect(backToSite(cfg, url, path === '/pay/fail'), 302);
    }
    if (req.method !== 'POST') return json({ error: 'bad-request' }, 405);
    if (path === '/pay/result') {
      let form: Record<string, string>;
      try {
        form = Object.fromEntries([...(await req.formData()).entries()].map(([k, v]) => [k, String(v)]));
      } catch {
        return new Response('bad request', { status: 400 });
      }
      const reply = await serial(async () => {
        const o = loadOrders(ordersPath);
        const db = loadDb(dbPath);
        const r = confirmPayment(o, db, cfg, form, clock());
        if (r) { saveDb(dbPath, db); saveOrders(ordersPath, o); }
        return r;
      });
      return new Response(reply ?? 'bad sign', { status: reply ? 200 : 400 });
    }
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return json({ error: 'bad-request' }, 400);
    }
    if (path === '/pay') {
      const r = await serial(async () => {
        const o = loadOrders(ordersPath);
        const created = createOrder(o, cfg, body, clock());
        if (created) saveOrders(ordersPath, o);
        return created;
      });
      return r ? json({ url: r.url }) : json({ error: 'bad-request' }, 400);
    }
    if (path === '/pay/status') {
      const r = orderStatus(loadOrders(ordersPath), loadDb(dbPath), body);
      return r ? json(r) : json({ error: 'not-found' }, 404);
    }
    return json({ error: 'not-found' }, 404);
  }

  return async (req: Request): Promise<Response> => {
    const url = new URL(req.url);
    const path = url.pathname.replace(/^\/api(?=\/)/, '');
    if (pay && path.startsWith('/pay')) return payRoute(path, req, url, pay);
    if (path !== '/license' && path !== '/waitlist') return json({ error: 'not-found' }, 404);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (req.method !== 'POST') return json({ error: 'bad-request' }, 405);
    let body: { key?: unknown; dev?: unknown };
    try {
      body = (await req.json()) as typeof body;
    } catch {
      return json({ error: 'bad-request' }, 400);
    }
    if (path === '/waitlist') {
      const e = waitlistEntry(body, new Date(clock() * 1000));
      if (!e) return json({ error: 'bad-request' }, 400);
      appendWaitlist(waitlistPath, e);
      return json({ ok: true });
    }
    const result = await serial(async () => {
      const db = loadDb(dbPath);
      const before = JSON.stringify(db);
      const r = await issue(db, body?.key, body?.dev, clock(), privateJwk);
      if (JSON.stringify(db) !== before) saveDb(dbPath, db);
      return r;
    });
    return json(result, 'error' in result ? (result.error === 'bad-request' ? 400 : 403) : 200);
  };
}

/** Server settings from the environment (see the top of the file). */
export function fromEnv(e: Record<string, string | undefined>) {
  const jwk = e.LICENSE_PRIVATE_JWK;
  if (!jwk) throw new Error('LICENSE_PRIVATE_JWK is not set');
  const pay: PayOptions | undefined = e.ROBOKASSA_LOGIN
    ? {
        ordersPath: e.ORDERS ?? './orders.json',
        cfg: { login: e.ROBOKASSA_LOGIN, pass1: e.ROBOKASSA_PASS1 ?? '', pass2: e.ROBOKASSA_PASS2 ?? '', test: e.ROBOKASSA_TEST === '1', page: e.PAY_PAGE ?? 'https://plotter.stadika.ru/pay/' },
      }
    : undefined;
  return {
    port: Number(e.PORT ?? 8787),
    hostname: e.HOST ?? '127.0.0.1',
    pay,
    fetch: handler(e.LICENSE_DB ?? './license-db.json', JSON.parse(jwk) as JsonWebKey, e.ALLOWED_ORIGIN ?? '*', undefined, e.WAITLIST, pay),
  };
}

if (import.meta.main) {
  const { hostname, port, pay, fetch } = fromEnv(process.env);
  Bun.serve({ hostname, port, fetch });
  console.log(`Licence server on ${hostname}:${port}${pay ? `, payments ${pay.cfg.test ? 'TEST' : 'live'}` : ''}`);
}
