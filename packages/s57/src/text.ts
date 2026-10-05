/**
 * Attribute text decoding.
 *
 * S-57 declares a lexical level for ATTF (DSSI AALL) and NATF (DSSI NALL):
 * 0 = ASCII, 1 = ISO 8859-1, 2 = UCS-2 (little-endian, unit terminator 0x1F 0x00).
 * The ISO 8211 layer decodes every `A` subfield byte by byte (Latin-1), which
 * is right for levels 0 and 1 but breaks UCS-2, where a UTF-16 code unit can
 * contain the 0x1F/0x1E terminator bytes (e.g. Cyrillic П is 1F 04). So NATF
 * is decoded here from the raw field bytes.
 *
 * Some producers write 8-bit national text (e.g. Windows-1251 Cyrillic) at
 * level 1. `textEncoding` lets the caller reinterpret those bytes.
 */

import type { ISO8211Field } from '@s57-parser/iso8211';

const UT = 0x1f;
const FT = 0x1e;

// TextDecoder exists in browsers, Node.js and Bun; the package is built
// without DOM typings, so it is declared structurally here.
interface Decoder { decode(bytes: Uint8Array): string }
const TextDecoderCtor = (globalThis as unknown as { TextDecoder?: new (label: string) => Decoder }).TextDecoder;

const decoders = new Map<string, Decoder>();

function decoder(encoding: string): Decoder | null {
  let d = decoders.get(encoding);
  if (!d) {
    if (!TextDecoderCtor) return null;
    try { d = new TextDecoderCtor(encoding); } catch { return null; }
    decoders.set(encoding, d);
  }
  return d;
}

// Windows-1251 upper half, built in: not every runtime's TextDecoder has it
// (Bun does not), and it is the common 8-bit Cyrillic encoding in charts.
const CP1251_HIGH =
  'ЂЃ‚ѓ„…†‡€‰Љ‹ЊЌЋЏђ‘’“”•–—�™љ›њќћџ ЎўЈ¤Ґ¦§Ё©Є«¬­®Ї°±Ііґµ¶·ё№є»јЅѕї' +
  'АБВГДЕЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯабвгдежзийклмнопрстуфхцчшщъыьэюя';

function isCp1251(encoding: string): boolean {
  return /^(windows-1251|cp1251|x-cp1251)$/i.test(encoding);
}

function isLatin1(encoding: string | undefined): boolean {
  return !encoding || /^(latin1|iso-8859-1|ascii|us-ascii)$/i.test(encoding);
}

/**
 * Reinterpret an 8-bit string (one char per byte, as decoded by the ISO 8211
 * layer) in the given encoding. Pure ASCII is returned unchanged.
 */
export function decode8bit(value: string, encoding: string | undefined): string {
  if (isLatin1(encoding) || !/[\x80-\xff]/.test(value)) return value;
  if (isCp1251(encoding!)) {
    let out = '';
    for (let i = 0; i < value.length; i++) {
      const c = value.charCodeAt(i) & 0xff;
      out += c < 0x80 ? value[i] : CP1251_HIGH[c - 0x80];
    }
    return out;
  }
  const d = decoder(encoding!);
  if (!d) return value;
  const bytes = new Uint8Array(value.length);
  for (let i = 0; i < value.length; i++) bytes[i] = value.charCodeAt(i) & 0xff;
  return d.decode(bytes);
}

/**
 * Decode an NATF field (repeating ATTL b12 + ATVL A) from its raw bytes.
 * `nall` is the national lexical level from DSSI.
 */
export function readNatf(field: ISO8211Field, nall: number, encoding: string | undefined): [number, string][] {
  const raw = field.raw;
  const out: [number, string][] = [];
  let i = 0;
  while (i + 2 <= raw.length) {
    if (raw[i] === FT && (nall !== 2 || i + 1 >= raw.length || raw[i + 1] === 0)) break;
    const attl = raw[i] | (raw[i + 1] << 8);
    i += 2;
    let value = '';
    if (nall === 2) {
      const units: number[] = [];
      while (i + 1 < raw.length) {
        const u = raw[i] | (raw[i + 1] << 8);
        i += 2;
        if (u === UT || u === FT) break;
        units.push(u);
      }
      value = String.fromCharCode(...units);
    } else {
      const start = i;
      while (i < raw.length && raw[i] !== UT && raw[i] !== FT) i++;
      let s = '';
      for (let k = start; k < i; k++) s += String.fromCharCode(raw[k]);
      value = decode8bit(s, encoding);
      if (i < raw.length && raw[i] === UT) i++;
    }
    out.push([attl, value]);
  }
  return out;
}
