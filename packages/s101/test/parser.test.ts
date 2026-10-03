import { describe, it, expect, beforeAll } from 'bun:test';
import { parseS101, isS101 } from '../src/parser.js';
import { toGeoJSON } from '../src/geojson.js';
import { S101Primitive, type S101Dataset } from '../src/types.js';
import { s101Sample } from '../../../test-utils/s101-sample.js';
import { SAMPLE_CELL, readArrayBuffer } from '../../../test-utils/fixtures.js';
import { ddr, dr, file, enc, concat } from '../../../test-utils/iso8211-writer.js';

describe('isS101', () => {
  it('detects the S-101 sample', () => {
    expect(isS101(s101Sample())).toBe(true);
  });

  it('rejects a real S-57 cell (DSID carries STED/EXPP)', () => {
    expect(isS101(readArrayBuffer(SAMPLE_CELL))).toBe(false);
  });

  it('returns false for data that is not ISO 8211', () => {
    expect(isS101(new ArrayBuffer(0))).toBe(false);
    expect(isS101(new TextEncoder().encode('not a chart at all, definitely not').buffer as ArrayBuffer)).toBe(false);
  });

  const dsidOnly = (labels: string, values: string[]) => file(
    ddr([{ tag: 'DSID', name: 'DSID', labels, format: `(${values.map(() => 'A').join(',')})` }]),
    dr([['DSID', concat(...values.map(v => enc.a(v)))]]),
  );

  it('recognises S-101 by PSDN or by the dataset name', () => {
    expect(isS101(dsidOnly('PSDN', ['S-101']))).toBe(true);
    expect(isS101(dsidOnly('DSNM', ['S101_SAMPLE']))).toBe(true);
    expect(isS101(dsidOnly('DSNM', ['US5MA12M.000']))).toBe(false);
  });

  it('treats a text PRSP without a version as S-100', () => {
    expect(isS101(dsidOnly('PRSP', ['INT.IHO.S-100']))).toBe(true);
  });

  it('returns false when there is no DSID', () => {
    expect(isS101(file(ddr([{ tag: 'XXXX', name: 'X', labels: 'A', format: '(A)' }]), dr([['XXXX', enc.a('x')]])))).toBe(false);
  });
});

describe('parseS101 — synthetic dataset', () => {
  let ds: S101Dataset;
  beforeAll(() => { ds = parseS101(s101Sample()); });

  it('reads dataset metadata', () => {
    expect(ds).toMatchObject({
      name: '101TEST0001.000', productSpec: 'INT.IHO.S-101.1.0', productVersion: '1.0',
      comf: 10_000_000, somf: 10, crs: 4326,
    });
  });

  it('reads spatial records, including composite curves', () => {
    expect(ds.spatialRecords.size).toBe(6);
    expect(ds.spatialRecords.get(130 * 100000 + 1)).toMatchObject({ startNodeRcid: 1, endNodeRcid: 2 });
    expect(ds.spatialRecords.get(140 * 100000 + 1)!.componentCurves).toEqual([1, 2]);
    expect(ds.spatialRecords.get(110 * 100000 + 3)!.coordinates3D).toEqual([
      { lat: 42.305, lon: -70.905, depth: 12.5 },
      { lat: 42.306, lon: -70.906, depth: 7.2 },
    ]);
  });

  it('maps feature type codes to catalogue names', () => {
    expect(ds.features.map(f => f.featureTypeName)).toEqual(['Light', 'Coastline', 'DepthArea', 'Sounding', 'DataCoverage', 'Unknown_9999']);
    expect(ds.features[4].primitive).toBe(S101Primitive.None);
  });

  it('reads simple, national and complex attributes', () => {
    const [light, , area] = ds.features;
    expect(Object.fromEntries(light.attributes)).toEqual({ 1: 'Deer Island Light', 2: '4' });
    expect(light.complexAttributes.get(500)!.map(g => Object.fromEntries(g))).toEqual([{ 501: 'Fl' }, { 502: '2.5' }]);
    expect(Object.fromEntries(area.attributes)).toEqual({ 10: '5', 11: '10', 20: 'Lower Harbour' });
  });

  it('reads associations and the feature object id', () => {
    const light = ds.features[0];
    expect(light.foid).toEqual({ agen: 550, fidn: 1001, fids: 1 });
    expect(light.featureAssociations).toEqual([{ associationType: 7, role: 1, targetRcid: 3 }]);
    expect(light.informationAssociations).toEqual([{ associationType: 9, targetRcid: 1 }]);
  });

  it('reads information records', () => {
    expect(ds.informationRecords).toHaveLength(1);
    const info = ds.informationRecords[0];
    expect(info).toMatchObject({ rcid: 1, typeCode: 5, typeName: 'Info_5' });
    expect(info.attributes.get(30)).toBe('NM 12/26');
    expect(info.complexAttributes.get(600)!.map(g => Object.fromEntries(g))).toEqual([{ 601: 'x' }]);
  });
});

describe('S-101 → GeoJSON — synthetic dataset', () => {
  it('resolves points, soundings, composite curves and surfaces', () => {
    const fc = toGeoJSON(parseS101(s101Sample()));
    const geom = Object.fromEntries(fc.features.map(f => [f.properties.featureType, f.geometry]));
    expect(geom.Light).toEqual({ type: 'Point', coordinates: [-70.9, 42.3] });
    expect(geom.Sounding).toEqual({ type: 'MultiPoint', coordinates: [[-70.905, 42.305], [-70.906, 42.306]] });
    expect(geom.Coastline).toEqual({ type: 'LineString', coordinates: [[-70.9, 42.3], [-70.91, 42.3], [-70.91, 42.31], [-70.9, 42.31], [-70.9, 42.3]] });
    expect(geom.DepthArea).toEqual({ type: 'Polygon', coordinates: [[[-70.9, 42.3], [-70.91, 42.3], [-70.91, 42.31], [-70.9, 42.31], [-70.9, 42.3]]] });
    expect(geom.DataCoverage).toBeNull();
  });

  it('adds S-57 OBJL codes for the S-52 renderer when a mapping exists', () => {
    const fc = toGeoJSON(parseS101(s101Sample()));
    const objl = Object.fromEntries(fc.features.map(f => [f.properties.featureType, f.properties.OBJL]));
    expect(objl).toMatchObject({ Light: 75, Coastline: 30, DepthArea: 42, Sounding: 129 });
    expect(objl.Unknown_9999).toBeUndefined();
  });

  it('serialises complex attributes and associations into properties', () => {
    const light = toGeoJSON(parseS101(s101Sample())).features[0];
    expect(light.properties).toMatchObject({
      ATTL_1: 'Deer Island Light', CATF_500: [{ 501: 'Fl' }, { 502: '2.5' }],
      AGEN: 550, FIDN: 1001, FIDS: 1, _featureAssociations: [{ associationType: 7, role: 1, targetRcid: 3 }],
    });
  });
});
