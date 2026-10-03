import { describe, it, expect, afterEach } from 'bun:test';
import { loadFile, loadFromUrl } from '../src/loader.js';
import { SAMPLE_CELL, readArrayBuffer } from '../../../test-utils/fixtures.js';
import { s101Sample } from '../../../test-utils/s101-sample.js';

// The S57Layer class needs a browser (Leaflet touches window on import), so
// only the format-detecting loader is tested here.

describe('loadFile', () => {
  it('loads an S-57 cell', () => {
    const r = loadFile(readArrayBuffer(SAMPLE_CELL));
    expect(r.format).toBe('S-57');
    expect(r.name).toBe('US5MA12M.000');
    expect(r.featureCount).toBe(2406);
    expect(r.spatialCount).toBe(4678);
    expect(r.geojson.features.length).toBe(2406);
    expect(r.attributes.size).toBe(2406);
  });

  it('attaches attribute maps for S-52 conditional symbology', () => {
    const r = loadFile(readArrayBuffer(SAMPLE_CELL));
    const light = r.geojson.features.find(f => f.properties.RCID === 109)!;
    const attrs = light.properties._attributes as Map<number, string>;
    expect(attrs).toBe(r.attributes.get(109)!);
    expect(attrs.get(75)).toBe('1');
  });

  it('auto-detects S-101', () => {
    const r = loadFile(s101Sample());
    expect(r.format).toBe('S-101');
    expect(r.name).toBe('101TEST0001.000');
    expect(r.featureCount).toBe(6);
    expect(r.spatialCount).toBe(6);
    expect((r.geojson.features[0].properties._attributes as Map<number, string>).get(1)).toBe('Deer Island Light');
  });
});

describe('loadFromUrl', () => {
  const realFetch = globalThis.fetch;
  afterEach(() => { globalThis.fetch = realFetch; });

  it('fetches and parses a chart', async () => {
    const body = readArrayBuffer(SAMPLE_CELL);
    let requested = '';
    globalThis.fetch = (async (url: string) => {
      requested = url;
      return new Response(body);
    }) as typeof fetch;
    const r = await loadFromUrl('https://example.test/US5MA12M.000');
    expect(requested).toBe('https://example.test/US5MA12M.000');
    expect(r.format).toBe('S-57');
    expect(r.featureCount).toBe(2406);
  });

  it('rejects on HTTP errors', async () => {
    globalThis.fetch = (async () => new Response('missing', { status: 404 })) as unknown as typeof fetch;
    await expect(loadFromUrl('https://example.test/none.000')).rejects.toThrow('Failed to fetch https://example.test/none.000: 404');
  });
});
