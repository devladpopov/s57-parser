/**
 * Placement of centred symbols and labels on area features.
 *
 * S-52 places the centred symbol of an area in the middle of the part of the
 * area that is visible on screen, not at the centre of the whole polygon (a
 * large DEPARE or anchorage would otherwise have its symbol off screen). So on
 * every view change the polygon is clipped to the viewport and a point inside
 * the clipped shape is chosen. Large polygons are first simplified to a
 * tolerance of about one pixel at the current scale, with one cached version
 * per power-of-two scale level.
 */

export type Ring = [number, number][];

/** Rings simplified with Douglas-Peucker, cached by scale level. */
export class SimplifiedRings {
  private levels = new Map<number, Ring[]>();
  private readonly vertexCount: number;

  constructor(readonly rings: Ring[]) {
    this.vertexCount = rings.reduce((n, r) => n + r.length, 0);
  }

  /**
   * Rings whose deviation from the original is at most one pixel when one
   * degree spans `pxPerDegree` pixels (the larger of the two axes).
   */
  at(pxPerDegree: number): Ring[] {
    if (this.vertexCount < 64 || !(pxPerDegree > 0) || !isFinite(pxPerDegree)) return this.rings;
    const level = Math.ceil(Math.log2(pxPerDegree));
    let out = this.levels.get(level);
    if (!out) {
      const tol = 2 ** -level;
      out = this.rings.map(r => simplifyRing(r, tol));
      // Not worth keeping a copy that is barely smaller than the original.
      if (out.reduce((n, r) => n + r.length, 0) > this.vertexCount * 0.8) out = this.rings;
      this.levels.set(level, out);
    }
    return out;
  }
}

/** Douglas-Peucker simplification of a ring; keeps the first and last vertex. */
export function simplifyRing(ring: Ring, tol: number): Ring {
  const n = ring.length;
  if (n <= 4) return ring;
  const keep = new Uint8Array(n);
  keep[0] = keep[n - 1] = 1;
  const stack: [number, number][] = [[0, n - 1]];
  const tol2 = tol * tol;
  while (stack.length) {
    const [a, b] = stack.pop()!;
    let maxD = -1, idx = -1;
    for (let i = a + 1; i < b; i++) {
      const d = segDist2(ring[i], ring[a], ring[b]);
      if (d > maxD) { maxD = d; idx = i; }
    }
    if (idx >= 0 && maxD > tol2) {
      keep[idx] = 1;
      stack.push([a, idx], [idx, b]);
    }
  }
  const out: Ring = [];
  for (let i = 0; i < n; i++) if (keep[i]) out.push(ring[i]);
  // A closed ring whose first and last vertex coincide needs at least a
  // triangle; if everything collapsed, keep the extreme points.
  return out.length >= 4 ? out : ring;
}

function segDist2(p: [number, number], a: [number, number], b: [number, number]): number {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  let t = len2 > 0 ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  const x = a[0] + t * dx - p[0], y = a[1] + t * dy - p[1];
  return x * x + y * y;
}

/** Sutherland-Hodgman clip of a ring (pixel coordinates) to [0,w] x [0,h]. */
export function clipRing(ring: Ring, w: number, h: number): Ring {
  let pts = ring;
  const edges: [(p: [number, number]) => number, number][] = [
    [p => p[0], 0], [p => -p[0], -w], [p => p[1], 0], [p => -p[1], -h],
  ];
  for (const [f, lim] of edges) {
    if (pts.length === 0) break;
    const out: Ring = [];
    for (let i = 0; i < pts.length; i++) {
      const cur = pts[i], prev = pts[(i + pts.length - 1) % pts.length];
      const fc = f(cur) - lim, fp = f(prev) - lim;
      if (fc >= 0) {
        if (fp < 0) out.push(lerp(prev, cur, fp / (fp - fc)));
        out.push(cur);
      } else if (fp >= 0) {
        out.push(lerp(prev, cur, fp / (fp - fc)));
      }
    }
    pts = out;
  }
  return pts;
}

function lerp(a: [number, number], b: [number, number], t: number): [number, number] {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

/**
 * A point inside the visible part of a polygon, in pixel coordinates.
 * `rings` are already projected to pixels; the first is the exterior, the rest
 * are holes. Returns null when no part of the polygon is on screen.
 */
export function visibleAnchor(rings: Ring[], w: number, h: number): [number, number] | null {
  const clipped = rings.map(r => clipRing(r, w, h)).filter(r => r.length >= 3);
  if (clipped.length === 0) return null;

  // Area-weighted centroid; holes subtract.
  let area = 0, cx = 0, cy = 0;
  clipped.forEach((r, i) => {
    const [a, x, y] = ringMoments(r);
    const s = i === 0 ? 1 : -1;
    area += s * Math.abs(a);
    cx += s * x * Math.abs(a);
    cy += s * y * Math.abs(a);
  });
  if (area < 1) return null; // less than a pixel on screen
  cx /= area; cy /= area;
  if (insideEvenOdd(clipped, cx, cy)) return [cx, cy];

  // Concave shape or a hole around the centroid: take the middle of the widest
  // interior span on a few horizontal lines through the clipped shape.
  let minY = Infinity, maxY = -Infinity;
  for (const r of clipped) for (const p of r) { minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1]); }
  let best: [number, number] | null = null, bestW = 0;
  for (const y of [cy, ...[0.5, 0.25, 0.75, 0.125, 0.375, 0.625, 0.875].map(f => minY + (maxY - minY) * f)]) {
    const xs: number[] = [];
    for (const r of clipped) {
      for (let i = 0; i < r.length; i++) {
        const a = r[i], b = r[(i + 1) % r.length];
        if ((a[1] > y) !== (b[1] > y)) xs.push(a[0] + (y - a[1]) / (b[1] - a[1]) * (b[0] - a[0]));
      }
    }
    xs.sort((p, q) => p - q);
    for (let i = 0; i + 1 < xs.length; i += 2) {
      if (xs[i + 1] - xs[i] > bestW) { bestW = xs[i + 1] - xs[i]; best = [(xs[i] + xs[i + 1]) / 2, y]; }
    }
  }
  return best;
}

/** Signed area and centroid of a ring (shoelace). */
function ringMoments(r: Ring): [number, number, number] {
  let a = 0, x = 0, y = 0;
  for (let i = 0; i < r.length; i++) {
    const p = r[i], q = r[(i + 1) % r.length];
    const c = p[0] * q[1] - q[0] * p[1];
    a += c; x += (p[0] + q[0]) * c; y += (p[1] + q[1]) * c;
  }
  a /= 2;
  if (a === 0) return [0, 0, 0];
  return [a, x / (6 * a), y / (6 * a)];
}

function insideEvenOdd(rings: Ring[], x: number, y: number): boolean {
  let inside = false;
  for (const r of rings) {
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
      const a = r[i], b = r[j];
      if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
    }
  }
  return inside;
}
