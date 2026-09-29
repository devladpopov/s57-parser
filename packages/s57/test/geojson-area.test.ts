import { describe, it, expect } from 'bun:test';
import { toGeoJSON } from '../src/geojson.js';
import { spatialKey } from '../src/parser.js';
import { GeomPrimitive, SpatialType, type S57Dataset, type SpatialRecord, type SpatialRef } from '../src/types.js';

// Tiny topology: connected nodes at the corners, edges between them.
function dataset(nodes: Record<number, [number, number]>, edges: Record<number, [number, number]>, refs: SpatialRef[]): S57Dataset {
  const spatialRecords = new Map<number, SpatialRecord>();
  for (const [id, [lon, lat]] of Object.entries(nodes)) {
    spatialRecords.set(spatialKey(SpatialType.ConnectedNode, +id), {
      rcid: +id, rcnm: SpatialType.ConnectedNode, coordinates2D: [{ lon, lat }], coordinates3D: [],
    });
  }
  for (const [id, [a, b]] of Object.entries(edges)) {
    spatialRecords.set(spatialKey(SpatialType.Edge, +id), {
      rcid: +id, rcnm: SpatialType.Edge, coordinates2D: [], coordinates3D: [], startNodeRcid: a, endNodeRcid: b,
    });
  }
  return {
    name: 'TEST', comf: 1e7, somf: 10, spatialRecords,
    features: [{ rcid: 1, objl: 42, prim: GeomPrimitive.Area, grup: 1, attributes: new Map(), spatialRefs: refs }],
  };
}
const edge = (rcid: number, usag: number, mask = 2, ornt = 1): SpatialRef => ({ rcnm: SpatialType.Edge, rcid, ornt, usag, mask });

// Outer square 0..10 (nodes 1-4), inner square 4..6 (nodes 5-8).
const nodes: Record<number, [number, number]> = {
  1: [0, 0], 2: [10, 0], 3: [10, 10], 4: [0, 10],
  5: [4, 4], 6: [6, 4], 7: [6, 6], 8: [4, 6],
};
const edges: Record<number, [number, number]> = {
  11: [1, 2], 12: [2, 3], 13: [3, 4], 14: [4, 1],
  15: [5, 6], 16: [6, 7], 17: [7, 8], 18: [8, 5],
};

describe('area geometry', () => {
  it('chains a hole made of several edges into one ring', () => {
    const ds = dataset(nodes, edges, [
      edge(11, 1), edge(12, 1), edge(13, 1), edge(14, 1),
      edge(15, 2), edge(16, 2), edge(17, 2), edge(18, 2),
    ]);
    const g = toGeoJSON(ds).features[0].geometry as { type: 'Polygon'; coordinates: [number, number][][] };
    expect(g.coordinates).toHaveLength(2);
    expect(g.coordinates[1]).toEqual([[4, 4], [6, 4], [6, 6], [4, 6], [4, 4]]);
  });

  it('leaves out edges on the data limit and masked edges from the outline', () => {
    const ds = dataset(nodes, edges, [edge(11, 1), edge(12, 3), edge(13, 1, 1), edge(14, 1)]);
    const f = toGeoJSON(ds).features[0];
    // Fill still uses the full ring...
    expect((f.geometry as { coordinates: unknown[][] }).coordinates[0]).toHaveLength(5);
    // ...but only the two real boundary edges are stroked.
    expect(f.properties._outline).toEqual([[[0, 0], [10, 0]], [[0, 10], [0, 0]]]);
  });

  it('has no outline when every edge is a real boundary', () => {
    const ds = dataset(nodes, edges, [edge(11, 1), edge(12, 1), edge(13, 1), edge(14, 1)]);
    expect(toGeoJSON(ds).features[0].properties._outline).toBeUndefined();
  });
});
