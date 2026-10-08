/**
 * Sign-ups from the landing page: a contact (email or phone) and optional
 * survey answers, appended as JSON lines.
 */
import { appendFileSync } from 'node:fs';

export interface WaitlistEntry {
  time: string;
  contact: string;
  boat: string;
  waters: string[];
  now: string[];
  pay: string;
  wish: string;
  src: string;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE = /^\+?[\d\s()-]{10,20}$/;

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const list = (v: unknown) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string').slice(0, 10).map((x) => x.slice(0, 60)) : []);

/** The entry to store, or null when there is no usable contact. */
export function waitlistEntry(body: unknown, now: Date): WaitlistEntry | null {
  const b = (body ?? {}) as Record<string, unknown>;
  const contact = str(b.contact, 120);
  if (!EMAIL.test(contact) && !PHONE.test(contact)) return null;
  return {
    time: now.toISOString(), contact,
    boat: str(b.boat, 60), waters: list(b.waters), now: list(b.now), pay: str(b.pay, 60),
    wish: str(b.wish, 1000), src: str(b.src, 300),
  };
}

export function appendWaitlist(path: string, e: WaitlistEntry): void {
  appendFileSync(path, `${JSON.stringify(e)}\n`);
}
