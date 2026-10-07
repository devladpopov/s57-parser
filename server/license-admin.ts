/**
 * Licence accounts and hand-issued tokens.
 *
 *   bun server/license-admin.ts add <pro|pro-charts> <days> [note]   new activation key
 *   bun server/license-admin.ts list
 *   bun server/license-admin.ts reset <key>                          free its devices
 *   bun server/license-admin.ts token <key> <device id>              token to paste, without the server
 *
 * LICENSE_DB and LICENSE_PRIVATE_JWK as for the server.
 */
import { loadDb, saveDb } from './license-server.js';
import { addAccount, issue, resetDevices } from './license-store.js';
import type { Plan } from '../demo/license.js';

const path = process.env.LICENSE_DB ?? './license-db.json';
const db = loadDb(path);
const [cmd, a, b, c] = process.argv.slice(2);
const now = Math.floor(Date.now() / 1000);

if (cmd === 'add' && (a === 'pro' || a === 'pro-charts') && Number(b) > 0) {
  const acc = addAccount(db, a as Plan, now + Math.round(Number(b) * 86400), c);
  saveDb(path, db);
  console.log(`${acc.key}  ${acc.plan}  until ${new Date(acc.exp * 1000).toISOString().slice(0, 10)}`);
} else if (cmd === 'list') {
  for (const acc of Object.values(db)) {
    console.log(`${acc.key}  ${acc.plan}  until ${new Date(acc.exp * 1000).toISOString().slice(0, 10)}  devices ${acc.devices.length}  ${acc.note ?? ''}`);
  }
} else if (cmd === 'reset' && a) {
  console.log(resetDevices(db, a) ? 'devices freed' : 'unknown key');
  saveDb(path, db);
} else if (cmd === 'token' && a && b) {
  const jwk = process.env.LICENSE_PRIVATE_JWK;
  if (!jwk) throw new Error('LICENSE_PRIVATE_JWK is not set');
  const r = await issue(db, a, b, now, JSON.parse(jwk));
  saveDb(path, db);
  console.log('token' in r ? r.token : `error: ${r.error}`);
} else {
  console.log('usage: add <pro|pro-charts> <days> [note] | list | reset <key> | token <key> <device>');
  process.exit(1);
}
