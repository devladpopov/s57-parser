import { describe, it, expect, beforeAll } from 'bun:test';
import { parseS57, spatialKey } from '../src/parser.js';
import { applyUpdate } from '../src/update.js';
import { toGeoJSON } from '../src/geojson.js';
import { SpatialType, type S57Dataset } from '../src/types.js';
import { SAMPLE_CELL, NOAA_US5MA19M_DIR, hasNoaaUS5MA19M, readArrayBuffer } from '../../../test-utils/fixtures.js';
import { ddr, dr, file, s57, S57_FIELDS } from '../../../test-utils/iso8211-writer.js';

// The repository has no real update file for US5MA12M, so each test applies
// a small .001 written with the S-57 update fields (FSPC, VRPC, SGCC, RUIN)
// to records that exist in the real base cell.

const INSERT = 1, DELETE = 2, MODIFY = 3;
const IN = SpatialType.IsolatedNode, CN = SpatialType.ConnectedNode, ED = SpatialType.Edge;
type Field = [string, Uint8Array];

let base: ArrayBuffer;
beforeAll(() => { base = readArrayBuffer(SAMPLE_CELL); });

const fresh = (): S57Dataset => parseS57(base);
const update = (...records: Field[][]): ArrayBuffer =>
  file(ddr(S57_FIELDS), dr([['DSID', s57.dsid('US5MA12M.001', '1')]]), ...records.map(dr));
const feature = (ds: S57Dataset, rcid: number) => ds.features.find(f => f.rcid === rcid);
const spatial = (ds: S57Dataset, rcnm: number, rcid: number) => ds.spatialRecords.get(spatialKey(rcnm, rcid));

describe('applyUpdate — dataset records', () => {
  it('renames the dataset to the update file name and returns the same object', () => {
    const ds = fresh();
    expect(applyUpdate(ds, update())).toBe(ds);
    expect(ds.name).toBe('US5MA12M.001');
  });

  it('applies DSPM parameters carried by an update', () => {
    const ds = fresh();
    applyUpdate(ds, update([['DSPM', s57.dspm(1_000_000, 100, 25000)]]));
    expect(ds.comf).toBe(1_000_000);
    expect(ds.somf).toBe(100);
  });

  it('leaves features and geometry alone when the update has no records', () => {
    const ds = fresh();
    applyUpdate(ds, update());
    expect(ds.features.length).toBe(2406);
    expect(ds.spatialRecords.size).toBe(4678);
  });
});

describe('applyUpdate — feature records', () => {
  it('deletes a feature (RUIN=2)', () => {
    const ds = fresh();
    applyUpdate(ds, update([['FRID', s57.frid(109, DELETE)]]));
    expect(feature(ds, 109)).toBeUndefined();
    expect(ds.features.length).toBe(2405);
  });

  it('inserts a feature and its isolated node (RUIN=1)', () => {
    const ds = fresh();
    applyUpdate(ds, update(
      [['VRID', s57.vrid(IN, 9001, INSERT, 1)], ['SG2D', s57.sg2d([[42.3, -71]])]],
      [
        ['FRID', s57.frid(9001, INSERT, { prim: 1, objl: 75, rver: 1 })],
        ['FOID', s57.foid(550, 123456, 1)],
        ['ATTF', s57.attf([[75, '3'], [107, '2']])],
        ['FSPT', s57.fspt([{ rcnm: IN, rcid: 9001, ornt: 255, usag: 255 }])],
      ],
    ));
    const f = feature(ds, 9001)!;
    expect(f).toMatchObject({ objl: 75, prim: 1, grup: 2, foid: { agen: 550, fidn: 123456, fids: 1 } });
    expect(Object.fromEntries(f.attributes)).toEqual({ 75: '3', 107: '2' });
    const geo = toGeoJSON(ds).features.find(g => g.properties.RCID === 9001)!;
    expect(geo.geometry).toEqual({ type: 'Point', coordinates: [-71, 42.3] });
  });

  it('modifies, adds and deletes attributes (RUIN=3)', () => {
    const ds = fresh();
    applyUpdate(ds, update([
      ['FRID', s57.frid(13, MODIFY, { prim: 1, objl: 17 })],
      ['ATTF', s57.attf([[116, 'Neponset River Buoy 6'], [142, '4'], [148, '\x7f']])],
    ]));
    const attrs = feature(ds, 13)!.attributes;
    expect(attrs.get(116)).toBe('Neponset River Buoy 6');
    expect(attrs.get(142)).toBe('4');
    expect(attrs.has(148)).toBe(false);
    expect(attrs.get(147)).toBe('20010714');
  });

  it('replaces the FOID of a modified feature', () => {
    const ds = fresh();
    applyUpdate(ds, update([['FRID', s57.frid(13, MODIFY, { prim: 1, objl: 17 })], ['FOID', s57.foid(550, 1, 2)]]));
    expect(feature(ds, 13)!.foid).toEqual({ agen: 550, fidn: 1, fids: 2 });
  });

  // Line 174 (COALNE) uses edges 129, 130, 132, 133, 134.
  const refIds = (ds: S57Dataset) => feature(ds, 174)!.spatialRefs.map(r => r.rcid);

  it('inserts spatial pointers at FSIX (FSUI=1)', () => {
    const ds = fresh();
    applyUpdate(ds, update([
      ['FRID', s57.frid(174, MODIFY, { prim: 2, objl: 30 })],
      ['FSPC', s57.control(INSERT, 2, 1)],
      ['FSPT', s57.fspt([{ rcnm: ED, rcid: 131, mask: 2, usag: 255 }])],
    ]));
    expect(refIds(ds)).toEqual([129, 131, 130, 132, 133, 134]);
  });

  it('deletes NSPT spatial pointers from FSIX (FSUI=2, no FSPT field)', () => {
    const ds = fresh();
    applyUpdate(ds, update([['FRID', s57.frid(174, MODIFY, { prim: 2, objl: 30 })], ['FSPC', s57.control(DELETE, 3, 2)]]));
    expect(refIds(ds)).toEqual([129, 130, 134]);
  });

  it('replaces spatial pointers in place (FSUI=3)', () => {
    const ds = fresh();
    applyUpdate(ds, update([
      ['FRID', s57.frid(174, MODIFY, { prim: 2, objl: 30 })],
      ['FSPC', s57.control(MODIFY, 1, 1)],
      ['FSPT', s57.fspt([{ rcnm: ED, rcid: 129, ornt: 1, mask: 2, usag: 255 }])],
    ]));
    expect(feature(ds, 174)!.spatialRefs[0]).toEqual({ rcnm: ED, rcid: 129, ornt: 1, usag: 255, mask: 2 });
    expect(refIds(ds)).toEqual([129, 130, 132, 133, 134]);
  });

  it('ignores modify and delete instructions for unknown features', () => {
    const ds = fresh();
    applyUpdate(ds, update(
      [['FRID', s57.frid(99999, DELETE)]],
      [['FRID', s57.frid(99998, MODIFY)], ['ATTF', s57.attf([[116, 'x']])]],
    ));
    expect(ds.features.length).toBe(2406);
  });
});

describe('applyUpdate — spatial records', () => {
  it('deletes a spatial record (RUIN=2)', () => {
    const ds = fresh();
    applyUpdate(ds, update([['VRID', s57.vrid(IN, 1000, DELETE)]]));
    expect(spatial(ds, IN, 1000)).toBeUndefined();
    expect(spatial(ds, IN, 999)).toBeDefined();
  });

  it('inserts an edge with its end nodes from VRPT', () => {
    const ds = fresh();
    applyUpdate(ds, update([
      ['VRID', s57.vrid(ED, 9001, INSERT, 1)],
      ['VRPT', s57.vrpt([{ rcnm: CN, rcid: 1777, topi: 1 }, { rcnm: CN, rcid: 1779, topi: 2 }])],
      ['SG2D', s57.sg2d([[42.3, -70.82]])],
    ]));
    expect(spatial(ds, ED, 9001)).toMatchObject({ rcnm: ED, startNodeRcid: 1777, endNodeRcid: 1779, coordinates2D: [{ lat: 42.3, lon: -70.82 }] });
  });

  // Edge 1 runs from node 1777 to node 1779 through 1080 vertices.
  const edge1 = (ds: S57Dataset) => spatial(ds, ED, 1)!;

  it('replaces CCNC coordinates at CCIX (CCUI=3)', () => {
    const ds = fresh();
    const before = edge1(ds).coordinates2D.slice();
    applyUpdate(ds, update([
      ['VRID', s57.vrid(ED, 1, MODIFY)],
      ['SGCC', s57.control(MODIFY, 2, 2)],
      ['SG2D', s57.sg2d([[42.31, -70.81], [42.32, -70.82]])],
    ]));
    const after = edge1(ds).coordinates2D;
    expect(after.length).toBe(1080);
    expect(after[0]).toEqual(before[0]);
    expect(after.slice(1, 3)).toEqual([{ lat: 42.31, lon: -70.81 }, { lat: 42.32, lon: -70.82 }]);
    expect(after[3]).toEqual(before[3]);
  });

  it('inserts coordinates before CCIX (CCUI=1)', () => {
    const ds = fresh();
    const before = edge1(ds).coordinates2D.slice();
    applyUpdate(ds, update([
      ['VRID', s57.vrid(ED, 1, MODIFY)],
      ['SGCC', s57.control(INSERT, 1, 1)],
      ['SG2D', s57.sg2d([[42.29, -70.81]])],
    ]));
    expect(edge1(ds).coordinates2D.length).toBe(1081);
    expect(edge1(ds).coordinates2D[0]).toEqual({ lat: 42.29, lon: -70.81 });
    expect(edge1(ds).coordinates2D[1]).toEqual(before[0]);
  });

  it('deletes coordinates without a coordinate field (CCUI=2)', () => {
    const ds = fresh();
    const before = edge1(ds).coordinates2D.slice();
    applyUpdate(ds, update([['VRID', s57.vrid(ED, 1, MODIFY)], ['SGCC', s57.control(DELETE, 1, 3)]]));
    expect(edge1(ds).coordinates2D).toEqual(before.slice(3));
  });

  it('edits sounding arrays through SG3D', () => {
    const ds = fresh();
    applyUpdate(ds, update([
      ['VRID', s57.vrid(IN, 999, MODIFY)],
      ['SGCC', s57.control(MODIFY, 1, 1)],
      ['SG3D', s57.sg3d([[42.3053, -71.0524, 1.8]])],
    ]));
    expect(spatial(ds, IN, 999)!.coordinates3D[0]).toEqual({ lat: 42.3053, lon: -71.0524, depth: 1.8 });
  });

  it('deletes soundings when the record has no SG3D field', () => {
    const ds = fresh();
    const n = spatial(ds, IN, 999)!.coordinates3D.length;
    applyUpdate(ds, update([['VRID', s57.vrid(IN, 999, MODIFY)], ['SGCC', s57.control(DELETE, 1, 2)]]));
    expect(spatial(ds, IN, 999)!.coordinates3D.length).toBe(n - 2);
  });

  it('moves an edge end node through VRPC/VRPT', () => {
    const ds = fresh();
    applyUpdate(ds, update([
      ['VRID', s57.vrid(ED, 1, MODIFY)],
      ['VRPC', s57.control(MODIFY, 2, 1)],
      ['VRPT', s57.vrpt([{ rcnm: CN, rcid: 1778, topi: 2 }])],
    ]));
    expect(edge1(ds)).toMatchObject({ startNodeRcid: 1777, endNodeRcid: 1778 });
  });

  it('ignores modifications of unknown spatial records', () => {
    const ds = fresh();
    applyUpdate(ds, update([['VRID', s57.vrid(ED, 99999, MODIFY)], ['SGCC', s57.control(DELETE, 1, 1)]]));
    expect(ds.spatialRecords.size).toBe(4678);
  });
});

describe.skipIf(!hasNoaaUS5MA19M)('applyUpdate — NOAA US5MA19M.001 (downloaded)', () => {
  it('applies the real update and still produces GeoJSON', () => {
    const ds = parseS57(readArrayBuffer(`${NOAA_US5MA19M_DIR}/US5MA19M.000`));
    const before = ds.features.length;
    applyUpdate(ds, readArrayBuffer(`${NOAA_US5MA19M_DIR}/US5MA19M.001`));
    expect(ds.name).toBe('US5MA19M.001');
    expect(ds.features.length).toBe(before);
    expect(toGeoJSON(ds).features.filter(f => f.geometry).length).toBeGreaterThan(40);
  });
});
