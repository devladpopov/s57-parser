import { describe, expect, test } from 'bun:test';
import { decode8bit, readNatf } from '../src/text.js';

const field = (bytes: number[]) => ({ tag: 'NATF', raw: new Uint8Array(bytes), subfields: [] });

function ucs2(s: string): number[] {
  const out: number[] = [];
  for (const ch of s) { const c = ch.charCodeAt(0); out.push(c & 0xff, c >> 8); }
  return out;
}

describe('national text', () => {
  test('UCS-2 NATF keeps code units whose bytes look like terminators', () => {
    // NOBJNM (301 = 0x012D) = "Порт Пионерский": П is U+041F, bytes 1F 04.
    const raw = [0x2d, 0x01, ...ucs2('Порт Пионерский'), 0x1f, 0x00, 0x2c, 0x01, ...ucs2('Инфо'), 0x1f, 0x00, 0x1e, 0x00];
    expect(readNatf(field(raw), 2, undefined)).toEqual([[301, 'Порт Пионерский'], [300, 'Инфо']]);
  });

  test('8-bit NATF and ATTF text in Windows-1251', () => {
    // "Нева" in Windows-1251
    const cp = [0xcd, 0xe5, 0xe2, 0xe0];
    expect(readNatf(field([0x2d, 0x01, ...cp, 0x1f, 0x1e]), 1, 'windows-1251')).toEqual([[301, 'Нева']]);
    expect(decode8bit(String.fromCharCode(...cp), 'windows-1251')).toBe('Нева');
  });

  test('8-bit text in Windows-1250 (Serbian Danube charts)', () => {
    // "Šimijan", "ĐERDAP" as written by the Serbian producer
    expect(decode8bit('\x8aimijan', 'windows-1250')).toBe('Šimijan');
    expect(decode8bit('\xd0ERDAP \x9a\x9e\xe8\xe6', 'windows-1250')).toBe('ĐERDAP šžčć');
  });

  test('default stays ISO 8859-1', () => {
    expect(decode8bit('Bah\xeda', undefined)).toBe('Bahía');
    expect(decode8bit('Plain', 'windows-1251')).toBe('Plain');
  });
});
