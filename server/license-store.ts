/**
 * Accounts of the licence server: an activation key (given to the buyer after
 * payment) maps to a plan, the end of the paid period and the devices it is
 * used on. Each online check of the app re-issues a signed token, which
 * restarts its 30 days of offline use.
 */
import { signLicense, type Plan } from '../demo/license.js';

export interface Account {
  key: string;
  plan: Plan;
  /** End of the paid period, seconds since epoch. */
  exp: number;
  devices: string[];
  note?: string;
}

export type Db = Record<string, Account>;

export const MAX_DEVICES = 2;

export type IssueResult = { token: string } | { error: 'unknown-key' | 'expired' | 'device-limit' | 'bad-request' };

export function newKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  const s = [...bytes].map((b) => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[b % 32]).join('');
  return `${s.slice(0, 5)}-${s.slice(5)}`;
}

export function addAccount(db: Db, plan: Plan, exp: number, note?: string): Account {
  let key = newKey();
  while (db[key]) key = newKey();
  const acc: Account = { key, plan, exp, devices: [], ...(note ? { note } : {}) };
  db[key] = acc;
  return acc;
}

/** Token for `dev` under activation key `key` at server time `now`; adds the device if there is room. */
export async function issue(db: Db, key: unknown, dev: unknown, now: number, privateJwk: JsonWebKey): Promise<IssueResult> {
  if (typeof key !== 'string' || typeof dev !== 'string' || !dev || dev.length > 64) return { error: 'bad-request' };
  const acc = db[key.trim().toUpperCase()];
  if (!acc) return { error: 'unknown-key' };
  if (now >= acc.exp) return { error: 'expired' };
  if (!acc.devices.includes(dev)) {
    if (acc.devices.length >= MAX_DEVICES) return { error: 'device-limit' };
    acc.devices.push(dev);
  }
  return { token: await signLicense({ sub: acc.key, plan: acc.plan, iat: now, exp: acc.exp, dev }, privateJwk) };
}

/** Frees the devices of an account, e.g. when the buyer changed phones. */
export function resetDevices(db: Db, key: string): boolean {
  const acc = db[key];
  if (!acc) return false;
  acc.devices = [];
  return true;
}
