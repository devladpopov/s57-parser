import { describe, it, expect, beforeAll } from 'bun:test';
import { renderChart, drawLegendSymbol, type ViewTransform } from '../src/renderer.js';
import { LOOKUP_TABLE, OBJL, type DepthSettings } from '../src/lookup.js';
import { resolveColor, rgbToCSS } from '../src/colors.js';
import { parseS57, toGeoJSON, type GeoJSONFeatureCollection } from '@s57-parser/s57';
import { recordingContext } from '../../../test-utils/canvas-mock.js';
import { SAMPLE_CELL, readArrayBuffer } from '../../../test-utils/fixtures.js';

const W = 1200, H = 800;
// Equirectangular view over US5MA12M (lon -71.08..-70.73, lat 42.21..42.34)
const view: ViewTransform = {
  toPixelX: lon => ((lon + 71.08) / 0.35) * W,
  toPixelY: lat => ((42.34 - lat) / 0.13) * H,
};

let chart: GeoJSONFeatureCollection;
beforeAll(() => {
  const ds = parseS57(readArrayBuffer(SAMPLE_CELL));
  chart = toGeoJSON(ds);
  const attrs = new Map(ds.features.map(f => [f.rcid, f.attributes]));
  for (const f of chart.features) f.properties._attributes = attrs.get(f.properties.RCID as number);
});

describe('renderChart — US5MA12M', () => {
  for (const mode of ['DAY_BRIGHT', 'DUSK', 'NIGHT'] as const) {
    it(`draws areas, lines, symbols and labels in ${mode}`, () => {
      const rec = recordingContext();
      renderChart(rec.ctx, chart, view, W, H, { mode });
      // Background in the palette's no-data colour
      expect(rec.calls[0]).toEqual({ name: 'fillRect', args: [0, 0, W, H] });
      expect(rec.sets[0]).toEqual({ name: 'fillStyle', value: rgbToCSS(resolveColor('NODTA', mode)) });
      expect(rec.count('fill')).toBeGreaterThan(300);
      expect(rec.count('stroke')).toBeGreaterThan(300);
      expect(rec.count('arc')).toBeGreaterThan(0);
      expect(rec.count('fillText')).toBeGreaterThan(50);
      expect(rec.count('save')).toBe(rec.count('restore'));
    });
  }

  it('uses different colours per palette', () => {
    const styles = (mode: 'DAY_BRIGHT' | 'NIGHT') => {
      const rec = recordingContext();
      renderChart(rec.ctx, chart, view, W, H, { mode });
      return new Set(rec.sets.filter(s => s.name === 'fillStyle').map(s => s.value));
    };
    const day = styles('DAY_BRIGHT'), night = styles('NIGHT');
    expect([...day].filter(c => night.has(c)).length).toBeLessThan(day.size / 2);
  });

  it('clears instead of filling when background is false', () => {
    const rec = recordingContext();
    renderChart(rec.ctx, chart, view, W, H, { background: false });
    expect(rec.calls[0]).toEqual({ name: 'clearRect', args: [0, 0, W, H] });
  });

  it('draws no text when labels are off', () => {
    const rec = recordingContext();
    renderChart(rec.ctx, chart, view, W, H, { showLabels: false });
    expect(rec.count('fillText')).toBe(0);
  });

  it('shades depth areas and draws the safety contour by the depth settings', () => {
    const fills = (depths?: DepthSettings) => {
      const rec = recordingContext();
      renderChart(rec.ctx, chart, view, W, H, { depths, showLabels: false });
      return rec.sets;
    };
    const vs = rgbToCSS(resolveColor('DEPVS', 'DAY_BRIGHT'));
    const count = (sets: { name: string; value: unknown }[], v: unknown) => sets.filter(x => x.value === v).length;
    const shallow = fills({ shallowContour: 1, safetyContour: 2, deepContour: 10 });
    const deep = fills({ shallowContour: 10, safetyContour: 20, deepContour: 30 });
    expect(count(deep, vs)).toBeGreaterThan(count(shallow, vs));
    // US5MA12M has contours in feet converted to metres; the safety contour is bold.
    const bold = (sets: { name: string; value: unknown }[]) => sets.filter(x => x.name === 'lineWidth' && x.value === 2).length;
    expect(bold(deep)).toBeGreaterThan(bold(fills({ shallowContour: 1, safetyContour: 500, deepContour: 600 })));
  });

  it('culls everything when the view is far from the chart', () => {
    const away: ViewTransform = { toPixelX: lon => view.toPixelX(lon) + 1e6, toPixelY: view.toPixelY };
    const rec = recordingContext();
    renderChart(rec.ctx, chart, away, W, H);
    expect(rec.count('stroke')).toBe(0);
    expect(rec.count('fillText')).toBe(0);
  });

  it('renders the same collection twice (cached preparation)', () => {
    const a = recordingContext(), b = recordingContext();
    renderChart(a.ctx, chart, view, W, H);
    renderChart(b.ctx, chart, view, W, H);
    expect(b.calls.length).toBe(a.calls.length);
  });

  it('copes with empty collections and features without geometry', () => {
    const rec = recordingContext();
    renderChart(rec.ctx, { type: 'FeatureCollection', features: [] }, view, W, H);
    renderChart(rec.ctx, { type: 'FeatureCollection', features: [{ type: 'Feature', geometry: null, properties: { OBJL: 75 } }] }, view, W, H);
    expect(rec.count('fillRect')).toBe(2);
  });
});

describe('drawLegendSymbol', () => {
  it('draws a sample for every lookup instruction type', () => {
    for (const [objl, instr] of LOOKUP_TABLE) {
      const rec = recordingContext();
      expect(() => drawLegendSymbol(rec.ctx, instr, 0, 0, 24, 16, 'DUSK')).not.toThrow();
      expect(rec.calls.length, `OBJL ${objl}`).toBeGreaterThan(0);
    }
  });

  it('fills a square for areas and strokes a line for lines', () => {
    const area = recordingContext();
    drawLegendSymbol(area.ctx, LOOKUP_TABLE.get(OBJL.DEPARE)!, 0, 0, 24, 16);
    expect(area.count('fill')).toBeGreaterThan(0);
    const line = recordingContext();
    drawLegendSymbol(line.ctx, LOOKUP_TABLE.get(OBJL.COALNE)!, 0, 0, 24, 16);
    expect(line.count('stroke')).toBeGreaterThan(0);
    const text = recordingContext();
    drawLegendSymbol(text.ctx, { type: 'text', priority: 1 }, 0, 0, 24, 16);
    expect(text.calls.find(c => c.name === 'fillText')?.args).toEqual(['Abc', 12, 8]);
  });
});
