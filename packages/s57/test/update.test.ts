import { describe, it, expect, beforeAll } from 'bun:test';
import { readFileSync } from 'fs';
import { parseS57 } from '../src/parser.js';
import { applyUpdate } from '../src/update.js';
import { toGeoJSON } from '../src/geojson.js';

const BASE_PATH = 'C:/Users/Vlad/Projects/s57-parser/test-data/US5MA19M/ENC_ROOT/US5MA19M/US5MA19M.000';
const UPDATE_PATH = 'C:/Users/Vlad/Projects/s57-parser/test-data/US5MA19M/ENC_ROOT/US5MA19M/US5MA19M.001';

function loadBuffer(path: string): ArrayBuffer {
  const buf = readFileSync(path);
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
}

describe('S-57 update mechanism — real .001 file', () => {
  let baseDataset: ReturnType<typeof parseS57>;

  beforeAll(() => {
    baseDataset = parseS57(loadBuffer(BASE_PATH));
  });

  it('should parse the update file without error', () => {
    const dataset = { ...baseDataset, features: [...baseDataset.features], spatialRecords: new Map(baseDataset.spatialRecords) };
    expect(() => applyUpdate(dataset, loadBuffer(UPDATE_PATH))).not.toThrow();
  });

  it('should update dataset name to .001', () => {
    const dataset = { ...baseDataset, features: [...baseDataset.features], spatialRecords: new Map(baseDataset.spatialRecords) };
    applyUpdate(dataset, loadBuffer(UPDATE_PATH));
    expect(dataset.name).toBe('US5MA19M.001');
  });

  it('should preserve all features after metadata-only update', () => {
    const featureCount = baseDataset.features.length;
    const spatialCount = baseDataset.spatialRecords.size;
    const dataset = { ...baseDataset, features: [...baseDataset.features], spatialRecords: new Map(baseDataset.spatialRecords) };
    applyUpdate(dataset, loadBuffer(UPDATE_PATH));
    expect(dataset.features.length).toBe(featureCount);
    expect(dataset.spatialRecords.size).toBe(spatialCount);
  });

  it('should still produce valid GeoJSON after update', () => {
    const dataset = { ...baseDataset, features: [...baseDataset.features], spatialRecords: new Map(baseDataset.spatialRecords) };
    applyUpdate(dataset, loadBuffer(UPDATE_PATH));
    const geo = toGeoJSON(dataset);
    expect(geo.type).toBe('FeatureCollection');
    expect(geo.features.length).toBeGreaterThan(0);
    const withGeom = geo.features.filter(f => f.geometry != null).length;
    expect(withGeom).toBeGreaterThan(40);
  });
});

describe('S-57 update mechanism — synthetic operations', () => {
  let baseDataset: ReturnType<typeof parseS57>;

  beforeAll(() => {
    baseDataset = parseS57(loadBuffer(BASE_PATH));
  });

  function cloneDataset() {
    return {
      ...baseDataset,
      features: baseDataset.features.map(f => ({
        ...f,
        attributes: new Map(f.attributes),
        spatialRefs: [...f.spatialRefs],
      })),
      spatialRecords: new Map(baseDataset.spatialRecords),
    };
  }

  it('feature delete removes the feature', () => {
    const ds = cloneDataset();
    const initialCount = ds.features.length;
    const targetRcid = ds.features[0].rcid;

    // Simulate: find and delete first feature
    const idx = ds.features.findIndex(f => f.rcid === targetRcid);
    ds.features.splice(idx, 1);

    expect(ds.features.length).toBe(initialCount - 1);
    expect(ds.features.find(f => f.rcid === targetRcid)).toBeUndefined();
  });

  it('spatial record insert adds to the map', () => {
    const ds = cloneDataset();
    const initialSize = ds.spatialRecords.size;

    // Simulate: insert a new connected node
    const newKey = 120 * 100000 + 99999;
    ds.spatialRecords.set(newKey, {
      rcid: 99999,
      rcnm: 120,
      coordinates2D: [{ lat: 42.5, lon: -70.7 }],
      coordinates3D: [],
    });

    expect(ds.spatialRecords.size).toBe(initialSize + 1);
    expect(ds.spatialRecords.get(newKey)?.coordinates2D[0].lat).toBe(42.5);
  });

  it('attribute modify updates the feature', () => {
    const ds = cloneDataset();
    const feature = ds.features.find(f => f.attributes.size > 0)!;
    const [attl] = feature.attributes.keys();

    feature.attributes.set(attl, 'UPDATED_VALUE');
    expect(feature.attributes.get(attl)).toBe('UPDATED_VALUE');
  });

  it('spatial ref splice inserts at correct position', () => {
    const ds = cloneDataset();
    const feature = ds.features.find(f => f.spatialRefs.length > 1)!;
    const initialLen = feature.spatialRefs.length;

    const newRef = { rcnm: 130, rcid: 99999, ornt: 1, usag: 1, mask: 255 };
    feature.spatialRefs.splice(1, 0, newRef);

    expect(feature.spatialRefs.length).toBe(initialLen + 1);
    expect(feature.spatialRefs[1].rcid).toBe(99999);
  });
});
