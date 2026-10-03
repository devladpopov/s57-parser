import { describe, it, expect, beforeAll } from 'bun:test';
import { parseS57, spatialKey } from '../src/parser.js';
import { toGeoJSON } from '../src/geojson.js';
import { GeomPrimitive, SpatialType, type S57Dataset } from '../src/types.js';
import type { GeoJSONFeatureCollection } from '../src/geojson.js';
import { SAMPLE_CELL, NOAA_US5MA19M, hasNoaaUS5MA19M, readArrayBuffer } from '../../../test-utils/fixtures.js';

// Boston Inner Harbor: every coordinate of US5MA12M lies inside this box.
const BOX = { minLat: 42.21, maxLat: 42.34, minLon: -71.08, maxLon: -70.73 };

describe('S-57 parser — US5MA12M.000 (in repo)', () => {
  let ds: S57Dataset;
  beforeAll(() => { ds = parseS57(readArrayBuffer(SAMPLE_CELL)); });

  it('reads dataset metadata from DSID and DSPM', () => {
    expect(ds.name).toBe('US5MA12M.000');
    expect(ds.comf).toBe(10_000_000);
    expect(ds.somf).toBe(10);
    expect(ds.cscl).toBe(25000);
  });

  it('reads every feature record', () => {
    expect(ds.features.length).toBe(2406);
    const byPrim = Object.groupBy(ds.features, f => GeomPrimitive[f.prim]);
    expect(byPrim.Point?.length).toBe(1065);
    expect(byPrim.Line?.length).toBe(750);
    expect(byPrim.Area?.length).toBe(590);
    expect(byPrim.None?.length).toBe(1);
  });

  it('reads every spatial record, keyed by spatialKey', () => {
    expect(ds.spatialRecords.size).toBe(4678);
    const count = (t: SpatialType) => [...ds.spatialRecords.values()].filter(s => s.rcnm === t).length;
    expect(count(SpatialType.IsolatedNode)).toBe(1006);
    expect(count(SpatialType.ConnectedNode)).toBe(1589);
    expect(count(SpatialType.Edge)).toBe(2083);
    for (const [key, s] of ds.spatialRecords) expect(key).toBe(spatialKey(s.rcnm, s.rcid));
  });

  it('decodes a light with its attributes, FOID and spatial pointer', () => {
    const light = ds.features.find(f => f.rcid === 109)!;
    expect(light.objl).toBe(75); // LIGHTS
    expect(light.prim).toBe(GeomPrimitive.Point);
    expect(light.foid).toEqual({ agen: 550, fidn: 33965899, fids: 50 });
    expect(light.attributes.get(75)).toBe('1');            // COLOUR = white
    expect(light.attributes.get(107)).toBe('2');           // LITCHR = flashing
    expect(light.attributes.get(141)).toBe('(1)');         // SIGGRP
    expect(light.attributes.get(142)).toBe('5');           // SIGPER
    expect(light.spatialRefs).toEqual([{ rcnm: 110, rcid: 86, ornt: 255, usag: 255, mask: 255 }]);
  });

  it('every feature has a FOID and a known primitive', () => {
    for (const f of ds.features) {
      expect(f.rcid).toBeGreaterThan(0);
      expect(f.objl).toBeGreaterThan(0);
      expect(f.foid?.agen).toBe(550);
      expect([1, 2, 3, 255]).toContain(f.prim);
    }
  });

  it('every edge knows its start and end connected nodes, and they exist', () => {
    for (const s of ds.spatialRecords.values()) {
      if (s.rcnm !== SpatialType.Edge) continue;
      expect(ds.spatialRecords.has(spatialKey(SpatialType.ConnectedNode, s.startNodeRcid!))).toBe(true);
      expect(ds.spatialRecords.has(spatialKey(SpatialType.ConnectedNode, s.endNodeRcid!))).toBe(true);
    }
  });

  it('scales coordinates by COMF and soundings by SOMF', () => {
    let soundings = 0;
    for (const s of ds.spatialRecords.values()) {
      for (const c of [...s.coordinates2D, ...s.coordinates3D]) {
        expect(c.lat).toBeGreaterThanOrEqual(BOX.minLat);
        expect(c.lat).toBeLessThanOrEqual(BOX.maxLat);
        expect(c.lon).toBeGreaterThanOrEqual(BOX.minLon);
        expect(c.lon).toBeLessThanOrEqual(BOX.maxLon);
      }
      for (const c of s.coordinates3D) {
        soundings++;
        expect(c.depth).toBeGreaterThanOrEqual(0.3);
        expect(c.depth).toBeLessThanOrEqual(39.3);
      }
    }
    expect(soundings).toBe(1698);
  });
});

describe('S-57 → GeoJSON — US5MA12M.000', () => {
  let ds: S57Dataset;
  let fc: GeoJSONFeatureCollection;
  beforeAll(() => {
    ds = parseS57(readArrayBuffer(SAMPLE_CELL));
    fc = toGeoJSON(ds);
  });

  it('emits one GeoJSON feature per S-57 feature', () => {
    expect(fc.type).toBe('FeatureCollection');
    expect(fc.features.length).toBe(ds.features.length);
  });

  it('maps primitives to geometry types', () => {
    const types = Object.groupBy(fc.features, f => f.geometry?.type ?? 'null');
    expect(types.Point?.length).toBe(1060);
    expect(types.MultiPoint?.length).toBe(5);       // sounding clusters
    expect(types.LineString?.length).toBe(750);
    expect(types.Polygon?.length).toBe(590);
    expect(types.null?.length).toBe(1);             // the one PRIM=None feature
  });

  it('puts the light at its isolated node position', () => {
    const light = fc.features.find(f => f.properties.RCID === 109)!;
    expect(light.geometry).toEqual({ type: 'Point', coordinates: [-70.99145, 42.3237333] });
  });

  it('copies identifiers and attributes into properties', () => {
    const light = fc.features.find(f => f.properties.RCID === 109)!;
    expect(light.properties).toMatchObject({
      RCID: 109, OBJL: 75, PRIM: 1, GRUP: 2, AGEN: 550, FIDN: 33965899, FIDS: 50,
      ATTL_75: '1', ATTL_107: '2', ATTL_143: '00.5+(04.5)',
    });
  });

  it('keeps features without geometry, with their attributes', () => {
    const none = fc.features.find(f => f.geometry === null)!;
    expect(none.properties).toMatchObject({ OBJL: 401, PRIM: 255, ATTL_116: 'Chapel Rocks' });
  });

  it('produces closed polygon rings, holes included', () => {
    let withHoles = 0;
    for (const f of fc.features) {
      if (f.geometry?.type !== 'Polygon') continue;
      if (f.geometry.coordinates.length > 1) withHoles++;
      for (const ring of f.geometry.coordinates) {
        expect(ring.length).toBeGreaterThanOrEqual(4);
        expect(ring[0]).toEqual(ring[ring.length - 1]);
      }
    }
    expect(withHoles).toBe(83);
  });

  it('adds _outline only to areas cut by the data limit or masked', () => {
    const withOutline = fc.features.filter(f => f.properties._outline);
    expect(withOutline.length).toBe(233);
    for (const f of withOutline) expect(f.geometry?.type).toBe('Polygon');
  });

  it('keeps every vertex inside the chart extent', () => {
    const check = (c: unknown): void => {
      if (Array.isArray(c) && typeof c[0] === 'number') {
        expect(c[0]).toBeGreaterThanOrEqual(BOX.minLon);
        expect(c[0]).toBeLessThanOrEqual(BOX.maxLon);
        expect(c[1]).toBeGreaterThanOrEqual(BOX.minLat);
        expect(c[1]).toBeLessThanOrEqual(BOX.maxLat);
      } else if (Array.isArray(c)) c.forEach(check);
    };
    for (const f of fc.features) if (f.geometry && 'coordinates' in f.geometry) check(f.geometry.coordinates);
  });

  it('filters by OBJL', () => {
    const only = toGeoJSON(ds, [75, 129]);
    expect(only.features.length).toBe(49);
    expect(new Set(only.features.map(f => f.properties.OBJL))).toEqual(new Set([75, 129]));
  });
});

describe.skipIf(!hasNoaaUS5MA19M)('S-57 parser — US5MA19M.000 (downloaded)', () => {
  it('parses metadata, features and spatial records', () => {
    const ds = parseS57(readArrayBuffer(NOAA_US5MA19M));
    expect(ds.name).toBe('US5MA19M.000');
    expect(ds.comf).toBe(10_000_000);
    expect(ds.somf).toBe(10);
    expect(ds.features.length).toBeGreaterThan(0);
    expect(ds.spatialRecords.size).toBeGreaterThan(0);
    expect(toGeoJSON(ds).features.length).toBe(ds.features.length);
  });
});
