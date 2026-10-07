import { beforeAll, describe, expect, test } from 'bun:test';
import { allows, generateKeys, licenseState, nextHighWater, signLicense, verifyLicense, type LicensePayload } from '../license.js';

const DAY = 86400;
const T0 = 1_790_000_000;
const pay = (o: Partial<LicensePayload> = {}): LicensePayload =>
  ({ sub: 'u1', plan: 'pro', iat: T0, exp: T0 + 180 * DAY, dev: 'd1', ...o });

let keys: Awaited<ReturnType<typeof generateKeys>>;
beforeAll(async () => { keys = await generateKeys(); });

describe('licence token', () => {
  test('a signed token verifies and returns its payload', async () => {
    const t = await signLicense(pay(), keys.privateJwk);
    expect(await verifyLicense(t, keys.publicJwk, 'd1')).toEqual(pay());
  });

  test('rejects another device, another key, edited payload and junk', async () => {
    const t = await signLicense(pay(), keys.privateJwk);
    expect(await verifyLicense(t, keys.publicJwk, 'd2')).toBeNull();
    const other = await generateKeys();
    expect(await verifyLicense(t, other.publicJwk, 'd1')).toBeNull();
    const forged = btoa(JSON.stringify(pay({ exp: T0 + 9999 * DAY }))).replace(/=+$/, '') + '.' + t.split('.')[1];
    expect(await verifyLicense(forged, keys.publicJwk, 'd1')).toBeNull();
    expect(await verifyLicense('abc', keys.publicJwk, 'd1')).toBeNull();
    expect(await verifyLicense('a.b.c', keys.publicJwk, 'd1')).toBeNull();
  });
});

describe('licence state', () => {
  test('no token', () => {
    expect(licenseState(null, T0, 0)).toEqual({ state: 'none' });
  });

  test('works offline up to 30 days after the last online check', () => {
    expect(licenseState(pay(), T0 + DAY, 0)).toMatchObject({ state: 'active', daysLeft: 29 });
    expect(licenseState(pay(), T0 + 30 * DAY - 1, 0).state).toBe('active');
    expect(licenseState(pay(), T0 + 30 * DAY, 0).state).toBe('offline-limit');
  });

  test('the paid period ends before the offline limit', () => {
    const p = pay({ exp: T0 + 10 * DAY });
    expect(licenseState(p, T0 + 9 * DAY, 0)).toMatchObject({ state: 'active', offlineUntil: T0 + 10 * DAY, daysLeft: 1 });
    expect(licenseState(p, T0 + 10 * DAY, 0).state).toBe('expired');
  });

  test('a clock turned back before the token or the last seen time is caught', () => {
    expect(licenseState(pay(), T0 - 2 * DAY, 0).state).toBe('clock');
    expect(licenseState(pay(), T0 + DAY, T0 + 40 * DAY).state).toBe('clock');
    expect(licenseState(pay(), T0 + DAY - 600, T0 + DAY).state).toBe('active'); // small drift is fine
  });

  test('high-water mark never moves back', () => {
    expect(nextHighWater(T0, T0 + 5)).toBe(T0 + 5);
    expect(nextHighWater(T0 + 9, T0 + 5)).toBe(T0 + 9);
  });

  test('plans', () => {
    const pro = licenseState(pay(), T0 + DAY, 0);
    const charts = licenseState(pay({ plan: 'pro-charts' }), T0 + DAY, 0);
    expect(allows(pro, 'pro')).toBe(true);
    expect(allows(pro, 'pro-charts')).toBe(false);
    expect(allows(charts, 'pro-charts')).toBe(true);
    expect(allows(licenseState(pay(), T0 + 31 * DAY, 0), 'pro')).toBe(false);
  });
});
