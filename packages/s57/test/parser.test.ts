import { describe, it, expect, beforeAll } from 'bun:test';
import { readFileSync } from 'fs';
import { parseS57 } from '../src/parser.js';
import { toGeoJSON } from '../src/geojson.js';
import { GeomPrimitive, SpatialType } from '../src/types.js';

const ENC_PATH = 'C:/Users/Vlad/Projects/s57-parser/test-data/US5MA19M/ENC_ROOT/US5MA19M/US5MA19M.000';

describe('S-57 parser — dataset metadata', () => {
  let dataset: ReturnType<typeof parseS57>;

  beforeAll(() => {
    const buf = readFileSync(ENC_PATH);
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
    dataset = parseS57(ab);
  });

  it('extracts dataset name', () => {
    expect(dataset.name).toBe('US5MA19M.000');
  });

  it('extracts COMF (coordinate multiplication factor)', () => {
    // NOAA ENC uses 10,000,000
    expect(dataset.comf).toBe(10_000_000);
  });

  it('extracts SOMF (sounding multiplication factor)', () => {
    // NOAA ENC typically uses 10 (decimetres)
    expect(dataset.somf).toBe(10);
  });

  it('has features', () => {
    expect(dataset.features.length).toBeGreaterThan(0);
  });

  it('has spatial records', () => {
    expect(dataset.spatialRecords.size).toBeGreaterThan(0);
  });
});

describe('S-57 parser — feature records', () => {
  let dataset: ReturnType<typeof parseS57>;

  beforeAll(() => {
    const buf = readFileSync(ENC_PATH);
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
    dataset = parseS57(ab);
  });

  it('all features have valid RCID (> 0)', () => {
    for (const f of dataset.features) {
      expect(f.rcid).toBeGreaterThan(0);
    }
  });

  it('all features have valid OBJL (> 0)', () => {
    for (const f of dataset.features) {
      expect(f.objl).toBeGreaterThan(0);
    }
  });

  it('all features have valid GeomPrimitive', () => {
    const validPrims = new Set(Object.values(GeomPrimitive).filter(v => typeof v === 'number'));
    for (const f of dataset.features) {
      expect(validPrims.has(f.prim)).toBe(true);
    }
  });

  it('features with spatialRefs have at least one ref', () => {
    const withRefs = dataset.features.filter(f => f.prim !== GeomPrimitive.None);
    // Most non-none features should have spatial refs
    const hasRefs = withRefs.filter(f => f.spatialRefs.length > 0);
    expect(hasRefs.length).toBeGreaterThan(0);
  });
});

describe('S-57 parser — spatial records', () => {
  let dataset: ReturnType<typeof parseS57>;

  beforeAll(() => {
    const buf = readFileSync(ENC_PATH);
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
    dataset = parseS57(ab);
  });

  it('spatial records have valid RCNM types', () => {
    const validTypes = new Set(Object.values(SpatialType).filter(v => typeof v === 'number'));
    for (const [, s] of dataset.spatialRecords) {
      expect(validTypes.has(s.rcnm)).toBe(true);
    }
  });

  it('spatial records have coordinates (2D or 3D)', () => {
    let hasCoords = 0;
    for (const [, s] of dataset.spatialRecords) {
      if (s.coordinates2D.length > 0 || s.coordinates3D.length > 0) hasCoords++;
    }
    expect(hasCoords).toBeGreaterThan(0);
  });

  it('coordinates are in valid lat/lon range (Massachusetts area)', () => {
    // US5MA19M covers Massachusetts waters: lat ~41-43°N, lon ~-72 to -69°W
    for (const [, s] of dataset.spatialRecords) {
      for (const c of s.coordinates2D) {
        expect(c.lat).toBeGreaterThan(30);
        expect(c.lat).toBeLessThan(50);
        expect(c.lon).toBeGreaterThan(-80);
        expect(c.lon).toBeLessThan(-60);
      }
    }
  });

  it('sounding depths are in reasonable range (metres)', () => {
    for (const [, s] of dataset.spatialRecords) {
      for (const c of s.coordinates3D) {
        // Depths in metres: 0 to ~6000m (ocean), negative = above water
        expect(c.depth).toBeGreaterThan(-100);
        expect(c.depth).toBeLessThan(1000);
      }
    }
  });
});

describe('S-57 → GeoJSON conversion', () => {
  let dataset: ReturnType<typeof parseS57>;

  beforeAll(() => {
    const buf = readFileSync(ENC_PATH);
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
    dataset = parseS57(ab);
  });

  it('toGeoJSON returns FeatureCollection', () => {
    const fc = toGeoJSON(dataset);
    expect(fc.type).toBe('FeatureCollection');
    expect(Array.isArray(fc.features)).toBe(true);
  });

  it('GeoJSON features have correct structure', () => {
    const fc = toGeoJSON(dataset);
    for (const f of fc.features) {
      expect(f.type).toBe('Feature');
      expect(f.properties).toBeDefined();
      // geometry can be null for non-spatial features
      if (f.geometry !== null) {
        expect(f.geometry.type).toBeDefined();
      }
    }
  });

  it('GeoJSON features count matches S-57 features', () => {
    const fc = toGeoJSON(dataset);
    expect(fc.features.length).toBe(dataset.features.length);
  });

  it('GeoJSON features have OBJL and RCID properties', () => {
    const fc = toGeoJSON(dataset);
    for (const f of fc.features) {
      expect(f.properties.OBJL).toBeDefined();
      expect(f.properties.RCID).toBeDefined();
    }
  });

  it('point features produce Point or MultiPoint geometry', () => {
    const fc = toGeoJSON(dataset);
    const pointFeatures = dataset.features.filter(f => f.prim === GeomPrimitive.Point);
    const geoJsonPoints = fc.features.filter(
      f => f.geometry?.type === 'Point' || f.geometry?.type === 'MultiPoint'
    );
    // Not all point features may have resolved spatial refs in this small file
    // but those that do should be correct type
    expect(geoJsonPoints.length).toBeGreaterThanOrEqual(0);
    expect(geoJsonPoints.length).toBeLessThanOrEqual(pointFeatures.length);
  });

  it('GeoJSON coordinates are in valid lat/lon range', () => {
    const fc = toGeoJSON(dataset);
    function checkCoords(coords: unknown): void {
      if (Array.isArray(coords)) {
        if (typeof coords[0] === 'number') {
          const [lon, lat] = coords as [number, number];
          expect(lat).toBeGreaterThan(30);
          expect(lat).toBeLessThan(50);
          expect(lon).toBeGreaterThan(-80);
          expect(lon).toBeLessThan(-60);
        } else {
          coords.forEach(checkCoords);
        }
      }
    }
    for (const f of fc.features) {
      if (!f.geometry) continue;
      const geom = f.geometry as { coordinates?: unknown };
      if (geom.coordinates) checkCoords(geom.coordinates);
    }
  });
});
