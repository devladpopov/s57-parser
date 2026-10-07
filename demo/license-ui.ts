/**
 * Subscription panel of the plotter: keeps the device id, the activation key,
 * the last signed token and the latest device time seen in localStorage,
 * renews the token whenever the app is online (LICENSE_SERVER) and shows the
 * state. A token can also be pasted by hand.
 */
import { licenseState, nextHighWater, verifyLicense, type LicenseState } from './license.js';
import { LICENSE_PUBLIC_JWK, LICENSE_SERVER } from './license-key.js';

type T = (en: string, ru: string) => string;

const now = () => Math.floor(Date.now() / 1000);

export function deviceId(): string {
  let id = localStorage.getItem('dev-id');
  if (!id) {
    id = crypto.randomUUID().slice(0, 18);
    localStorage.setItem('dev-id', id);
  }
  return id;
}

export function describeLicense(s: LicenseState, t: T): string {
  const plan = 'plan' in s ? (s.plan === 'pro-charts' ? t('Pro with charts', 'Pro с картами') : 'Pro') : '';
  switch (s.state) {
    case 'none': return t('free version', 'бесплатная версия');
    case 'active': return `${plan}, ${t('works offline for', 'без сети работает ещё')} ${s.daysLeft} ${t('more days', 'дн.')}`;
    case 'expired': return `${plan}: ${t('the subscription has ended', 'подписка закончилась')}`;
    case 'offline-limit': return `${plan}: ${t('connect to the internet to check the subscription', 'подключитесь к интернету для проверки подписки')}`;
    case 'clock': return `${plan}: ${t('the device clock is behind, check the date and time', 'часы устройства отстают, проверьте дату и время')}`;
  }
}

export function initLicense(t: T, onChange: (s: LicenseState) => void = () => {}): () => LicenseState {
  const dev = deviceId();
  const stateEl = document.getElementById('lic-state')!;
  const input = document.getElementById('lic-in') as HTMLInputElement;
  document.getElementById('lic-dev')!.textContent = dev;
  let state: LicenseState = { state: 'none' };

  async function evaluate(): Promise<void> {
    const token = localStorage.getItem('lic-token');
    const p = token ? await verifyLicense(token, LICENSE_PUBLIC_JWK, dev) : null;
    const hw = Number(localStorage.getItem('lic-hw') ?? 0);
    state = licenseState(p, now(), hw);
    localStorage.setItem('lic-hw', String(nextHighWater(now(), hw)));
    stateEl.textContent = describeLicense(state, t);
    onChange(state);
  }

  /** Asks the server for a fresh token; returns an error text or null. */
  async function renew(key: string): Promise<string | null> {
    if (!LICENSE_SERVER) return t('The licence server is not connected yet: send us the device code', 'Сервер лицензий ещё не подключён: пришлите нам код устройства');
    try {
      const res = await fetch(`${LICENSE_SERVER}/license`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key, dev }),
      });
      const r = (await res.json()) as { token?: string; error?: string };
      if (r.token) {
        localStorage.setItem('lic-token', r.token);
        return null;
      }
      return ({
        'unknown-key': t('Unknown activation key', 'Неизвестный ключ активации'),
        expired: t('The subscription has ended', 'Подписка закончилась'),
        'device-limit': t('The key is already used on two devices', 'Ключ уже используется на двух устройствах'),
      } as Record<string, string>)[r.error ?? ''] ?? t('Activation failed', 'Не удалось активировать');
    } catch {
      return t('No connection to the licence server', 'Нет связи с сервером лицензий');
    }
  }

  document.getElementById('lic-go')!.addEventListener('click', async () => {
    const v = input.value.trim();
    if (!v) return;
    let err: string | null = null;
    if (v.includes('.')) {
      if (await verifyLicense(v, LICENSE_PUBLIC_JWK, dev)) localStorage.setItem('lic-token', v);
      else err = t('The code is not valid for this device', 'Код не подходит для этого устройства');
    } else {
      localStorage.setItem('lic-key', v);
      err = await renew(v);
    }
    await evaluate();
    if (err) stateEl.textContent = err;
    else input.value = '';
  });

  async function renewSaved(): Promise<void> {
    const key = localStorage.getItem('lic-key');
    if (key && LICENSE_SERVER && navigator.onLine && !(await renew(key))) await evaluate();
  }

  evaluate().then(renewSaved);
  window.addEventListener('online', () => void renewSaved());
  // Re-check hourly: days left and the high-water mark move with the clock.
  setInterval(() => void evaluate(), 3600_000);
  return () => state;
}
