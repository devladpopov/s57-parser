/**
 * Licence server for the plotter.
 *
 *   POST /license  {"key": "ABCDE-FGHJK", "dev": "<device id>"}  ->  {"token": "..."} | {"error": "..."}
 *
 * Environment: LICENSE_PRIVATE_JWK (signing key, JSON), LICENSE_DB (accounts
 * file, default ./license-db.json), PORT (default 8787), ALLOWED_ORIGIN
 * (CORS, default *). Accounts are added with server/license-admin.ts.
 */
import { readFileSync, writeFileSync, existsSync, renameSync } from 'node:fs';
import { issue, type Db } from './license-store.js';

export function loadDb(path: string): Db {
  return existsSync(path) ? (JSON.parse(readFileSync(path, 'utf8')) as Db) : {};
}

export function saveDb(path: string, db: Db): void {
  writeFileSync(`${path}.tmp`, JSON.stringify(db, null, 2));
  renameSync(`${path}.tmp`, path);
}

export function handler(dbPath: string, privateJwk: JsonWebKey, origin: string, clock = () => Math.floor(Date.now() / 1000)) {
  const cors = { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods': 'POST', 'Access-Control-Allow-Headers': 'Content-Type' };
  const json = (body: unknown, status = 200) => Response.json(body, { status, headers: cors });
  // One request at a time touches the accounts file.
  let queue: Promise<unknown> = Promise.resolve();
  const serial = <T>(f: () => Promise<T>): Promise<T> => { const p = queue.then(f); queue = p.catch(() => {}); return p; };
  return async (req: Request): Promise<Response> => {
    if (new URL(req.url).pathname !== '/license') return json({ error: 'not-found' }, 404);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (req.method !== 'POST') return json({ error: 'bad-request' }, 405);
    let body: { key?: unknown; dev?: unknown };
    try {
      body = (await req.json()) as typeof body;
    } catch {
      return json({ error: 'bad-request' }, 400);
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

if (import.meta.main) {
  const jwk = process.env.LICENSE_PRIVATE_JWK;
  if (!jwk) throw new Error('LICENSE_PRIVATE_JWK is not set');
  const port = Number(process.env.PORT ?? 8787);
  Bun.serve({ port, fetch: handler(process.env.LICENSE_DB ?? './license-db.json', JSON.parse(jwk), process.env.ALLOWED_ORIGIN ?? '*') });
  console.log(`Licence server on :${port}`);
}
