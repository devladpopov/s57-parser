import { describe, expect, test } from 'bun:test';
import { countryAt, decodeTopology, type Topology } from '../world.js';

describe('world layer', () => {
  test('decodes quantized, delta-encoded arcs, reversed arcs included', () => {
    const topo: Topology = {
      type: 'Topology',
      transform: { scale: [0.5, 0.5], translate: [10, 20] },
      arcs: [[[0, 0], [4, 0], [0, 4]], [[4, 4], [-4, 0], [0, -4]]],
      objects: {
        a: { type: 'GeometryCollection', geometries: [{ type: 'Polygon', arcs: [[0, 1]], properties: { code: 'X' } }] },
        b: { type: 'GeometryCollection', geometries: [{ type: 'LineString', arcs: [~0] }, { type: null }] },
      },
    };
    const poly = decodeTopology(topo, 'a').features[0];
    expect(poly.properties.code).toBe('X');
    expect(poly.geometry.coordinates).toEqual([[[10, 20], [12, 20], [12, 22], [10, 22], [10, 20]]]);
    const line = decodeTopology(topo, 'b');
    expect(line.features).toHaveLength(1);
    expect(line.features[0].geometry.coordinates).toEqual([[12, 22], [12, 20], [10, 20]]);
    expect(countryAt(decodeTopology(topo, 'a'), 11, 21)?.properties.code).toBe('X');
    expect(countryAt(decodeTopology(topo, 'a'), 13, 21)).toBeUndefined();
  });

  // The bundled file (scripts/build-world.ts): borders as Russia officially sees them.
  test('Crimea and the four new regions are in Russia', async () => {
    const countries = decodeTopology(await Bun.file(new URL('../world/world.json', import.meta.url)).json(), 'countries');
    const at = (lon: number, lat: number) => countryAt(countries, lon, lat)?.properties.code;
    expect(at(34.10, 44.95)).toBe('RUS'); // Simferopol
    expect(at(33.52, 44.60)).toBe('RUS'); // Sevastopol
    expect(at(37.80, 48.00)).toBe('RUS'); // Donetsk
    expect(at(37.56, 48.72)).toBe('RUS'); // Kramatorsk
    expect(at(39.30, 48.57)).toBe('RUS'); // Luhansk
    expect(at(35.14, 47.84)).toBe('RUS'); // Zaporozhye
    expect(at(32.60, 46.66)).toBe('RUS'); // Kherson
    expect(at(30.52, 50.45)).toBe('UKR'); // Kyiv
    expect(at(30.73, 46.48)).toBe('UKR'); // Odessa
    expect(countries.features.find((f) => f.properties.code === 'RUS')?.properties.ru).toBe('Россия');
  });
});
