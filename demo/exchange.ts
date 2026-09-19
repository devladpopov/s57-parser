/**
 * Exchange-set assembly for the browser demo.
 *
 * NOAA ships ENCs as a `<CELL>.zip` holding `ENC_ROOT/<CELL>/<CELL>.000` plus
 * sequential update files `.001`, `.002`, ... This module unzips such archives
 * (or a loose multi-file drop) and picks the base cell together with its ordered
 * updates so the caller can apply them via `applyUpdate()`.
 */

import { unzipSync } from 'fflate';

export interface ChartFile {
  name: string;
  buffer: ArrayBuffer;
}

export interface ExchangeSet {
  base: ChartFile;
  updates: ChartFile[];
}

const BASE_RE = /\.000$/i;
const SEQ_RE = /\.(\d{3})$/;

function fileName(path: string): string {
  const i = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
  return i >= 0 ? path.slice(i + 1) : path;
}

function toArrayBuffer(u8: Uint8Array): ArrayBuffer {
  return u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength) as ArrayBuffer;
}

/** Unzip a NOAA ENC exchange-set archive into a flat list of chart files. */
export function unzipExchangeSet(buffer: ArrayBuffer): ChartFile[] {
  const entries = unzipSync(new Uint8Array(buffer));
  const out: ChartFile[] = [];
  for (const [name, data] of Object.entries(entries)) {
    if (data.length === 0) continue; // skip directory entries
    out.push({ name, buffer: toArrayBuffer(data) });
  }
  return out;
}

/**
 * From a flat list of chart files (unzipped archive or multi-file drop), pick
 * the base `.000` cell and its ordered update files that share the same stem.
 * Returns null if no base cell is present.
 */
export function assembleExchangeSet(files: ChartFile[]): ExchangeSet | null {
  const bases = files.filter(f => BASE_RE.test(fileName(f.name)));
  if (bases.length === 0) return null;

  const base = bases[0];
  const stem = fileName(base.name).replace(BASE_RE, '');

  const updates = files
    .filter(f => {
      const n = fileName(f.name);
      const m = n.match(SEQ_RE);
      return m !== null && m[1] !== '000' && n.slice(0, n.length - 4) === stem;
    })
    .sort((a, b) => fileName(a.name).localeCompare(fileName(b.name)));

  return { base, updates };
}
