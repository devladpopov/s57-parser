/**
 * Paths to the chart samples the tests run against.
 *
 * demo/charts/US5MA12M.000 is committed, so the suite always has a real NOAA
 * cell to parse. US5MA19M (base cell plus its .001 update) is downloaded by CI
 * into test-data/; tests that need it are skipped when it is absent.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export const REPO_ROOT = join(import.meta.dir, '..');

/** NOAA ENC US5MA12M (Boston Inner Harbor), edition 32, committed to the repo. */
export const SAMPLE_CELL = join(REPO_ROOT, 'demo/charts/US5MA12M.000');

/** NOAA ENC US5MA19M with its updates; present only after `test-data` download. */
export const NOAA_US5MA19M_DIR = join(REPO_ROOT, 'test-data/US5MA19M/ENC_ROOT/US5MA19M');
export const NOAA_US5MA19M = join(NOAA_US5MA19M_DIR, 'US5MA19M.000');
export const hasNoaaUS5MA19M = existsSync(NOAA_US5MA19M);

/** Read a file into a standalone ArrayBuffer (not a view into Node's buffer pool). */
export function readArrayBuffer(path: string): ArrayBuffer {
  const b = readFileSync(path);
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
}
