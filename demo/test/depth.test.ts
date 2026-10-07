import { describe, expect, test } from 'bun:test';
import { aheadOf, depthSettings, describeHazard, routeHazards, segmentHazards, worstHazard, type ChartFeature, type Hazard } from '../depth.js';

const attrs = (o: Record<number, string>) => new Map(Object.entries(o).map(([k, v]) => [Number(k), v]));
const square = (x0: number, y0: number, x1: number, y1: number) => [[[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]];
const area = (objl: number, rings: number[][][], a: Record<number, string> = {}): ChartFeature =>
  ({ geometry: { type: 'Polygon', coordinates: rings }, properties: { OBJL: objl, _attributes: attrs(a) } });
const point = (objl: number, lon: number, lat: number, a: Record<number, string> = {}): ChartFeature =>
  ({ geometry: { type: 'Point', coordinates: [lon, lat] }, properties: { OBJL: objl, _attributes: attrs(a) } });

// Along the equator: 0.01 degrees of longitude is 0.6 nm.
const A = { lat: 0, lon: 0 }, B = { lat: 0, lon: 0.1 };
const shoal = area(42, square(0.05, -0.01, 0.06, 0.01), { 87: '1.8', 88: '5' });
const deep = area(42, square(0, -0.01, 0.1, 0.01), { 87: '10', 88: '20' });

describe('safe depth', () => {
  test('settings from draft and margin', () => {
    expect(depthSettings(1.5, 0.5)).toEqual({ shallowContour: 1.5, safetyContour: 2, deepContour: 10 });
    expect(depthSettings(4, 2).deepContour).toBe(12);
  });

  test('a depth area shallower than the safety depth is a hazard where the leg enters it', () => {
    const h = segmentHazards(A, B, [deep, shoal], 2);
    expect(h).toHaveLength(1);
    expect(h[0]).toMatchObject({ kind: 'shallow', depth: 1.8 });
    expect(h[0].lon).toBeCloseTo(0.05, 9);
    expect(h[0].distNm).toBeCloseTo(3, 1);
    expect(segmentHazards(A, B, [shoal], 1.8)).toEqual([]); // exactly the safety depth is safe
  });

  test('starting inside a shallow area or on land is a hazard at distance 0', () => {
    const h = segmentHazards({ lat: 0, lon: 0.055 }, B, [shoal], 2);
    expect(h[0].distNm).toBe(0);
    const land = area(71, square(-0.01, -0.01, 0.01, 0.01), { 116: 'Остров' });
    expect(segmentHazards(A, B, [land], 2)[0]).toMatchObject({ kind: 'land', depth: null, name: 'Остров' });
  });

  test('dangers near the leg: unknown depth counts, deep enough does not', () => {
    const rock = point(153, 0.03, 0.0003, { 179: '0.5' });         // 0.018 nm off
    const wreck = point(159, 0.04, 0, {});                           // depth unknown
    const deepWreck = point(159, 0.045, 0, { 179: '15' });
    const farRock = point(153, 0.03, 0.01, { 179: '0.5' });          // 0.6 nm off
    const h = segmentHazards(A, B, [rock, wreck, deepWreck, farRock], 2);
    expect(h.map(x => [x.kind, x.depth])).toEqual([['danger', 0.5], ['danger', null]]);
    expect(worstHazard(h)).toBe(h[1]);
    expect(worstHazard([h[0]])).toBe(h[0]);
    expect(worstHazard([])).toBeUndefined();
    const land: Hazard = { kind: 'land', depth: null, lat: 0, lon: 0, distNm: 1 };
    expect(worstHazard([h[1], land, h[0]])).toBe(land);
  });

  test('other geometry types and classes', () => {
    const multi = { geometry: { type: 'GeometryCollection', geometries: [
      { type: 'MultiPoint', coordinates: [[0.02, 0], [5, 5]] },
      { type: 'LineString', coordinates: [[0.07, -1], [0.07, 1]] },
    ] }, properties: { OBJL: 86, _attributes: attrs({ 179: '1' }) } } as ChartFeature;
    expect(segmentHazards(A, B, [multi], 2)[0].lon).toBeCloseTo(0.02, 9);
    const mline = { geometry: { type: 'MultiLineString', coordinates: [[[0.07, -1], [0.07, 1]]] }, properties: { OBJL: 71 } } as ChartFeature;
    const mpoly = { geometry: { type: 'MultiPolygon', coordinates: [square(0.08, -1, 0.09, 1)] }, properties: { OBJL: 46, _attributes: attrs({ 87: '-1' }) } } as ChartFeature;
    const other = point(75, 0.05, 0);   // a light is no hazard
    const noGeom = { geometry: null, properties: { OBJL: 71 } } as ChartFeature;
    const h = segmentHazards(A, B, [mline, mpoly, other, noGeom], 2);
    expect(h.map(x => x.kind)).toEqual(['land', 'shallow']);
    expect(h[1].depth).toBe(-1);
    const parallel = { geometry: { type: 'LineString', coordinates: [[0, 0.001], [0.1, 0.001]] }, properties: { OBJL: 71 } } as ChartFeature;
    expect(segmentHazards(A, B, [parallel], 2)).toEqual([]);
    expect(segmentHazards(A, A, [point(153, 0, 0)], 2)).toHaveLength(1); // zero-length segment
    const noDepth = area(42, square(0.05, -0.01, 0.06, 0.01));
    expect(segmentHazards(A, B, [noDepth, noDepth], 2)[0].depth).toBe(0); // bbox cached on the second pass
  });

  test('route legs and the course ahead', () => {
    const route = [A, B, { lat: 0.1, lon: 0.1 }];
    const legs = routeHazards(route, [shoal], 2);
    expect(legs).toHaveLength(1);
    expect(legs[0].leg).toBe(0);
    const p = aheadOf({ lat: 60, lon: 30 }, 90, 1);
    expect(p.lat).toBeCloseTo(60, 9);
    expect(p.lon).toBeCloseTo(30 + 1 / 30, 3);
    expect(aheadOf(A, 0, 0.6).lat).toBeCloseTo(0.01, 9);
  });

  test('descriptions', () => {
    const h = (o: Partial<Hazard>): Hazard => ({ kind: 'shallow', depth: 1.84, lat: 0, lon: 0, distNm: 0, ...o });
    expect(describeHazard(h({}), true)).toBe('мель 1.8 м');
    expect(describeHazard(h({}), false)).toBe('shoal 1.8 m');
    expect(describeHazard(h({ depth: -0.5 }), true)).toBe('осыхает 0.5 м');
    expect(describeHazard(h({ kind: 'land', depth: null, name: 'Котлин' }), true)).toBe('суша (Котлин)');
    expect(describeHazard(h({ kind: 'danger', depth: null }), false)).toBe('danger, depth unknown');
    expect(describeHazard(h({ kind: 'danger', depth: 3 }), true)).toBe('опасность 3 м');
  });
});
