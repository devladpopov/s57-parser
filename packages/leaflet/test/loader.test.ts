import { describe, it, expect } from 'bun:test';
import { loadFile } from '../src/loader.js';
import { readFileSync } from 'fs';
import { join } from 'path';

// Use a real NOAA S-57 test file if available
const TEST_DATA_DIR = join(import.meta.dir, '../../../test-data');

describe('S-57/S-101 loader', () => {
  it('should load and auto-detect S-57 format', () => {
    // Try to find a test .000 file
    let buffer: ArrayBuffer;
    try {
      const raw = readFileSync(join(TEST_DATA_DIR, 'US5MA19M.000'));
      buffer = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength);
    } catch {
      // Skip test if no test data
      console.log('  (skipped: no test data at test-data/US5MA19M.000)');
      return;
    }

    const result = loadFile(buffer);
    expect(result.format).toBe('S-57');
    expect(result.geojson.type).toBe('FeatureCollection');
    expect(result.featureCount).toBeGreaterThan(0);
    expect(result.spatialCount).toBeGreaterThan(0);
    expect(result.name).toBeTruthy();
  });
});
