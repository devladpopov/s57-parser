import { describe, it, expect } from 'bun:test';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { parseS57, spatialKey } from '../src/parser.js';
import { applyUpdate } from '../src/update.js';
import type { S57Dataset } from '../src/types.js';
import { hasNoaaUS5MA19M } from '../../../test-utils/fixtures.js';

const root = join(import.meta.dir, '../../..');
const read = (p: string): ArrayBuffer => {
  const b = readFileSync(join(root, p));
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
};

function load(dir: string, stem: string): S57Dataset {
  let ds = parseS57(read(`${dir}/${stem}.000`));
  for (let i = 1; existsSync(join(root, `${dir}/${stem}.${String(i).padStart(3, '0')}`)); i++) {
    ds = applyUpdate(ds, read(`${dir}/${stem}.${String(i).padStart(3, '0')}`));
  }
  return ds;
}

/** Spatial references that do not resolve, and breaks in edge chains. */
function problems(ds: S57Dataset): { missing: number; broken: number } {
  let missing = 0, broken = 0;
  for (const f of ds.features) {
    if (f.prim !== 2 && f.prim !== 3) continue;
    let prevEnd: number | undefined;
    for (const r of f.spatialRefs) {
      const e = ds.spatialRecords.get(spatialKey(r.rcnm, r.rcid));
      if (!e) { missing++; prevEnd = undefined; continue; }
      const [a, b] = r.ornt === 2 ? [e.endNodeRcid, e.startNodeRcid] : [e.startNodeRcid, e.endNodeRcid];
      if (prevEnd != null && a !== prevEnd && r.usag !== 2) broken++;
      prevEnd = b;
    }
  }
  return { missing, broken };
}

// Binary subfields may contain 0x1E (the ISO 8211 field terminator) as an
// ordinary byte: a record id of 30, or a coordinate whose low byte is 0x1E.
// Stopping on it dropped records and the tail of coordinate lists, which drew
// fans of triangles. Every reference must resolve and every edge chain connect.
describe('topology integrity on real NOAA cells', () => {
  it.skipIf(!hasNoaaUS5MA19M)('US5MA19M with its updates (downloaded)', () => {
    expect(problems(load('test-data/US5MA19M/ENC_ROOT/US5MA19M', 'US5MA19M'))).toEqual({ missing: 0, broken: 0 });
  });

  it('US5MA12M', () => {
    const ds = load('demo/charts', 'US5MA12M');
    expect(problems(ds)).toEqual({ missing: 0, broken: 0 });
    // Record ids 30, 286, 542... used to vanish: ids are contiguous now.
    expect(ds.features.some(f => f.rcid % 256 === 30)).toBe(true);
  });
});
