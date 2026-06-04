import { describe, it, expect } from 'bun:test';
import { S57CanvasLayer } from '../src/canvas-layer.js';
import type { GeoJSONFeatureCollection } from '@s57-parser/s57';

describe('S57CanvasLayer', () => {
  it('should accept GeoJSON data directly', () => {
    const geojson: GeoJSONFeatureCollection = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [-70.88, 42.35] },
          properties: { RCID: 1, OBJL: 75 },
        },
      ],
    };

    const layer = new S57CanvasLayer('test', geojson, { mode: 'NIGHT' });
    expect(layer.id).toBe('test');
    expect(layer.type).toBe('custom');
    expect(layer.geojson.features).toHaveLength(1);
  });

  it('should expose setMode', () => {
    const geojson: GeoJSONFeatureCollection = {
      type: 'FeatureCollection',
      features: [],
    };

    const layer = new S57CanvasLayer('test', geojson);
    // setMode should not throw without a map
    expect(() => layer.setMode('DUSK')).not.toThrow();
  });
});
