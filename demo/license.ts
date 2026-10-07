/**
 * Subscription licence for the plotter: the server signs a short token
 * (ECDSA P-256) each time the app is online; offline the app keeps working
 * until 30 days after the server time in the last token or the end of the
 * paid period, whichever is earlier. The clock is trusted only forward:
 * a device time earlier than the token's server time or than the latest time
 * the app has seen means the clock was turned back, and an online check is
 * required.
 *
 * Token: base64url(JSON payload) "." base64url(raw r||s signature).
 */

export type Plan = 'pro' | 'pro-charts';

export interface LicensePayload {
  /** Account id. */
  sub: string;
  plan: Plan;
  /** Server time when the token was issued, seconds since epoch. */
  iat: number;
  /** End of the paid period, seconds since epoch. */
  exp: number;
  /** Device id the token is bound to. */
  dev: string;
}

export type LicenseState =
  | { state: 'none' }
  | { state: 'active'; plan: Plan; offlineUntil: number; daysLeft: number }
  | { state: 'expired'; plan: Plan }
  | { state: 'offline-limit'; plan: Plan }
  | { state: 'clock'; plan: Plan };

export const OFFLINE_DAYS = 30;
const DAY = 86400;
/** Allowed clock drift before it counts as turned back, seconds. */
const SKEW = 3600;

const ALG = { name: 'ECDSA', namedCurve: 'P-256' } as const;
const SIG = { name: 'ECDSA', hash: 'SHA-256' } as const;

function b64url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function unb64url(s: string): Uint8Array<ArrayBuffer> {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

export async function generateKeys(): Promise<{ publicJwk: JsonWebKey; privateJwk: JsonWebKey }> {
  const pair = (await crypto.subtle.generateKey(ALG, true, ['sign', 'verify'])) as CryptoKeyPair;
  return {
    publicJwk: await crypto.subtle.exportKey('jwk', pair.publicKey),
    privateJwk: await crypto.subtle.exportKey('jwk', pair.privateKey),
  };
}

export async function signLicense(payload: LicensePayload, privateJwk: JsonWebKey): Promise<string> {
  const key = await crypto.subtle.importKey('jwk', privateJwk, ALG, false, ['sign']);
  const body = b64url(new TextEncoder().encode(JSON.stringify(payload)));
  const sig = new Uint8Array(await crypto.subtle.sign(SIG, key, new TextEncoder().encode(body)));
  return `${body}.${b64url(sig)}`;
}

/** Payload of a token with a valid signature for this device, otherwise null. */
export async function verifyLicense(token: string, publicJwk: JsonWebKey, device: string): Promise<LicensePayload | null> {
  const [body, sig, extra] = token.split('.');
  if (!body || !sig || extra !== undefined) return null;
  try {
    const key = await crypto.subtle.importKey('jwk', publicJwk, ALG, false, ['verify']);
    const ok = await crypto.subtle.verify(SIG, key, unb64url(sig), new TextEncoder().encode(body));
    if (!ok) return null;
    const p = JSON.parse(new TextDecoder().decode(unb64url(body))) as LicensePayload;
    if (p.dev !== device || (p.plan !== 'pro' && p.plan !== 'pro-charts')) return null;
    if (!Number.isFinite(p.iat) || !Number.isFinite(p.exp)) return null;
    return p;
  } catch {
    return null;
  }
}

/**
 * Licence state at device time `now` (seconds), given the latest device time
 * the app has recorded (`highWater`, seconds; 0 if none).
 */
export function licenseState(p: LicensePayload | null, now: number, highWater: number): LicenseState {
  if (!p) return { state: 'none' };
  if (now < p.iat - SKEW || now < highWater - SKEW) return { state: 'clock', plan: p.plan };
  if (now >= p.exp) return { state: 'expired', plan: p.plan };
  const offlineUntil = Math.min(p.exp, p.iat + OFFLINE_DAYS * DAY);
  if (now >= offlineUntil) return { state: 'offline-limit', plan: p.plan };
  return { state: 'active', plan: p.plan, offlineUntil, daysLeft: Math.ceil((offlineUntil - now) / DAY) };
}

/** New high-water mark: never moves back. */
export function nextHighWater(now: number, highWater: number): number {
  return Math.max(now, highWater);
}

export function allows(s: LicenseState, need: Plan): boolean {
  if (s.state !== 'active') return false;
  return need === 'pro' || s.plan === 'pro-charts';
}
