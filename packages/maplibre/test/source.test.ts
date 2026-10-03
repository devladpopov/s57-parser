import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import type { Map as MaplibreMap } from 'maplibre-gl';
import { addChartSource, addChartLayers, removeChart } from '../src/source.js';
import { S57CanvasLayer } from '../src/canvas-layer.js';
import type { GeoJSONFeatureCollection } from '@s57-parser/s57';
import { SAMPLE_CELL, readArrayBuffer } from '../../../test-utils/fixtures.js';
import { s101Sample } from '../../../test-utils/s101-sample.js';
import { recordingContext, type RecordingContext } from '../../../test-utils/canvas-mock.js';

/** Just enough of maplibregl.Map for the plugin: sources, layers, projection. */
function fakeMap() {
  const sources = new Map<string, any>();
  const layers = new Map<string, any>();
  let repaints = 0;
  const glCanvas = { clientWidth: 800, clientHeight: 600 };
  const children: unknown[] = [];
  const map = {
    addSource: (id: string, s: unknown) => { sources.set(id, s); },
    getSource: (id: string) => sources.get(id),
    removeSource: (id: string) => { sources.delete(id); },
    addLayer: (l: { id: string }) => { layers.set(l.id, l); },
    getLayer: (id: string) => layers.get(id),
    removeLayer: (id: string) => { layers.delete(id); },
    triggerRepaint: () => { repaints++; },
    getCanvas: () => glCanvas,
    getCanvasContainer: () => ({ appendChild: (c: unknown) => children.push(c) }),
    project: ({ lng, lat }: { lng: number; lat: number }) => ({ x: (lng + 71.08) * 2000, y: (42.34 - lat) * 4000 }),
  };
  return { map: map as unknown as MaplibreMap, sources, layers, children, repaints: () => repaints };
}

describe('addChartSource', () => {
  it('adds an S-57 chart as a GeoJSON source with style layers', () => {
    const { map, sources, layers } = fakeMap();
    expect(addChartSource(map, readArrayBuffer(SAMPLE_CELL))).toBe('s57-chart');
    const src = sources.get('s57-chart');
    expect(src.type).toBe('geojson');
    expect(src.data.features.length).toBe(2406);
    const light = src.data.features.find((f: any) => f.properties.RCID === 109);
    expect(light.properties.ATTL_75).toBe('1');
    expect([...layers.keys()]).toEqual([
      's57-chart-depth-areas', 's57-chart-land', 's57-chart-coastline', 's57-chart-depth-contours',
      's57-chart-navaids', 's57-chart-lights', 's57-chart-dangers', 's57-chart-restricted',
    ]);
    for (const l of layers.values()) expect(l.source).toBe('s57-chart');
  });

  it('honours sourceId and addLayers: false', () => {
    const { map, sources, layers } = fakeMap();
    expect(addChartSource(map, s101Sample(), { sourceId: 'enc', addLayers: false })).toBe('enc');
    expect(sources.get('enc').data.features[0].properties).toMatchObject({ featureType: 'Light', OBJL: 75, ATTL_1: 'Deer Island Light' });
    expect(layers.size).toBe(0);
    addChartLayers(map, 'enc');
    expect(layers.size).toBe(8);
  });

  it('removeChart removes the layers and the source', () => {
    const { map, sources, layers } = fakeMap();
    addChartSource(map, readArrayBuffer(SAMPLE_CELL), { sourceId: 'x' });
    removeChart(map, 'x');
    expect(layers.size).toBe(0);
    expect(sources.size).toBe(0);
    expect(() => removeChart(map, 'x')).not.toThrow();
  });
});

describe('S57CanvasLayer', () => {
  const empty: GeoJSONFeatureCollection = { type: 'FeatureCollection', features: [] };
  let rec: RecordingContext;
  const g = globalThis as any;
  const saved = { document: g.document, window: g.window };

  beforeAll(() => {
    rec = recordingContext();
    g.window = { devicePixelRatio: 2 };
    g.document = {
      createElement: () => ({ style: {}, width: 0, height: 0, parentNode: null, getContext: () => rec.ctx }),
    };
  });
  afterAll(() => { g.document = saved.document; g.window = saved.window; });

  it('accepts GeoJSON directly', () => {
    const layer = new S57CanvasLayer('test', { type: 'FeatureCollection', features: [{ type: 'Feature', geometry: { type: 'Point', coordinates: [-70.88, 42.35] }, properties: { RCID: 1, OBJL: 75 } }] }, { mode: 'NIGHT' });
    expect(layer.id).toBe('test');
    expect(layer.type).toBe('custom');
    expect(layer.renderingMode).toBe('2d');
    expect(layer.geojson.features).toHaveLength(1);
  });

  it('parses S-57 and S-101 buffers and attaches attributes', () => {
    const s57 = new S57CanvasLayer('a', readArrayBuffer(SAMPLE_CELL));
    expect(s57.geojson.features.length).toBe(2406);
    expect(s57.geojson.features.find(f => f.properties.RCID === 109)!.properties._attributes).toBeInstanceOf(Map);
    const s101 = new S57CanvasLayer('b', s101Sample());
    expect(s101.geojson.features[0].properties.featureType).toBe('Light');
  });

  it('setMode does nothing visible before the layer is added', () => {
    expect(() => new S57CanvasLayer('test', empty).setMode('DUSK')).not.toThrow();
  });

  it('creates an overlay canvas, renders the chart and cleans up', () => {
    const { map, children, repaints } = fakeMap();
    const layer = new S57CanvasLayer('chart', readArrayBuffer(SAMPLE_CELL), { mode: 'DUSK' });
    layer.onAdd(map);
    expect(children).toHaveLength(1);
    const canvas = children[0] as { width: number; height: number; style: Record<string, string> };
    expect([canvas.width, canvas.height]).toEqual([1600, 1200]);       // 800x600 at DPR 2
    expect(canvas.style).toMatchObject({ position: 'absolute', pointerEvents: 'none', width: '800px', height: '600px' });

    layer.render();
    expect(rec.calls.find(c => c.name === 'setTransform')?.args).toEqual([2, 0, 0, 2, 0, 0]);
    expect(rec.calls.find(c => c.name === 'clearRect')?.args).toEqual([0, 0, 800, 600]);
    expect(rec.count('fill')).toBeGreaterThan(100);

    layer.setMode('NIGHT');
    expect(repaints()).toBe(1);

    layer.onRemove();
    const before = rec.calls.length;
    layer.render();
    expect(rec.calls.length).toBe(before);
  });
});
