import { describe, it, expect } from 'bun:test';
import { clipRing, simplifyRing, visibleAnchor, SimplifiedRings, type Ring } from '../src/anchor.js';
import { renderChart } from '../src/renderer.js';
import { OBJL, ATTL } from '../src/lookup.js';

const square = (x0: number, y0: number, x1: number, y1: number): Ring =>
  [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]];

function insideRing(r: Ring, x: number, y: number): boolean {
  let inside = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const a = r[i], b = r[j];
    if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}

describe('clipRing', () => {
  it('clips a polygon to the viewport', () => {
    const c = clipRing(square(-100, -100, 50, 50), 200, 100);
    for (const [x, y] of c) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(50);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(50);
    }
  });

  it('returns nothing for a polygon off screen', () => {
    expect(clipRing(square(300, 300, 400, 400), 200, 100)).toHaveLength(0);
  });
});

describe('visibleAnchor', () => {
  it('puts the anchor in the middle of the visible part, not the whole polygon', () => {
    // Polygon 0..10000 px, centroid at 5000,5000 far off a 200x100 screen.
    const a = visibleAnchor([square(0, 0, 10000, 10000)], 200, 100)!;
    expect(a[0]).toBeCloseTo(100, 5);
    expect(a[1]).toBeCloseTo(50, 5);
  });

  it('uses the visible corner when the polygon only overlaps part of the screen', () => {
    const a = visibleAnchor([square(-1000, -1000, 40, 20)], 200, 100)!;
    expect(a[0]).toBeCloseTo(20, 5);
    expect(a[1]).toBeCloseTo(10, 5);
  });

  it('returns null when the polygon is off screen', () => {
    expect(visibleAnchor([square(500, 500, 600, 600)], 200, 100)).toBeNull();
  });

  it('stays inside a concave shape whose centroid falls outside', () => {
    // U shape: two legs joined at the bottom; the centroid lies in the gap.
    const u: Ring = [[0, 0], [30, 0], [30, 80], [70, 80], [70, 0], [100, 0], [100, 100], [0, 100], [0, 0]];
    const a = visibleAnchor([u], 200, 200)!;
    expect(insideRing(u, a[0], a[1])).toBe(true);
  });

  it('avoids a hole around the centroid', () => {
    const a = visibleAnchor([square(0, 0, 100, 100), square(20, 20, 80, 80)], 200, 200)!;
    expect(insideRing(square(0, 0, 100, 100), a[0], a[1])).toBe(true);
    expect(insideRing(square(20, 20, 80, 80), a[0], a[1])).toBe(false);
  });
});

describe('simplification', () => {
  // A jagged circle with 2000 vertices.
  const circle: Ring = [];
  for (let i = 0; i < 2000; i++) {
    const t = (i / 2000) * Math.PI * 2, r = 1 + (i % 2) * 0.0001;
    circle.push([Math.cos(t) * r, Math.sin(t) * r]);
  }
  circle.push(circle[0]);

  it('drops vertices within the tolerance and keeps the ring closed', () => {
    const s = simplifyRing(circle, 0.01);
    expect(s.length).toBeLessThan(100);
    expect(s[0]).toEqual(s[s.length - 1]);
  });

  it('picks a finer level at a larger scale and caches it', () => {
    const rings = new SimplifiedRings([circle]);
    const coarse = rings.at(50)[0].length;
    const fine = rings.at(5000)[0].length;
    expect(coarse).toBeLessThan(fine);
    expect(rings.at(50)).toBe(rings.at(60)); // same power-of-two level
    expect(rings.at(1e7)[0]).toBe(circle);   // nothing to gain: original
  });
});

describe('renderChart places area labels in the visible part', () => {
  function mockCtx() {
    const texts: { text: string; x: number; y: number }[] = [];
    const ctx = new Proxy({} as Record<string, unknown>, {
      get(target, key) {
        if (key === 'fillText') return (text: string, x: number, y: number) => texts.push({ text, x, y });
        if (key === 'measureText') return (t: string) => ({ width: t.length * 5 });
        if (key in target) return target[key as string];
        return () => {};
      },
      set(target, key, v) { target[key as string] = v; return true; },
    });
    return { ctx: ctx as unknown as CanvasRenderingContext2D, texts };
  }

  it('labels a large named area in the middle of the screen', () => {
    // A 1 x 1 degree anchorage viewed zoomed in on its south-west corner.
    const attrs = new Map<number, string>([[ATTL.OBJNAM, 'Big Anchorage']]);
    const fc = {
      type: 'FeatureCollection' as const,
      features: [{
        type: 'Feature' as const,
        geometry: { type: 'Polygon' as const, coordinates: [square(0, 0, 1, 1)] },
        properties: { OBJL: OBJL.ACHARE, _attributes: attrs },
      }],
    };
    const view = { toPixelX: (lon: number) => (lon - 0.001) * 100000, toPixelY: (lat: number) => 400 - (lat - 0.001) * 100000 };
    const { ctx, texts } = mockCtx();
    renderChart(ctx, fc as never, view, 400, 400);
    const label = texts.find(t => t.text === 'Big Anchorage');
    expect(label).toBeDefined();
    expect(label!.x).toBeCloseTo(200, 0);
    expect(label!.y).toBeCloseTo(200, 0);
  });
});
