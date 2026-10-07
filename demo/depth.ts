/**
 * Safe depth for the plotter: the boat's draft and under-keel margin give the
 * safety depth; the chart is shaded against it (S-52 safety contour) and a
 * route leg or the course ahead is checked for water shallower than it, land
 * and dangers (rocks, wrecks, obstructions) not known to be deep enough.
 *
 * Geometry is planar in nautical miles around each segment (longitude scaled
 * by the cosine of latitude), which is accurate enough for legs of tens of miles.
 */
import type { DepthSettings } from '../packages/s52-render/src/lookup.js';
import type { Waypoint } from './route.js';

/** OBJL and ATTL codes used here (S-57 object and attribute catalogues). */
const DEPARE = 42, DRGARE = 46, LNDARE = 71, OBSTRN = 86, UWTROC = 153, WRECKS = 159;
const DRVAL1 = 87, VALSOU = 179, OBJNAM = 116;

/** Depth settings for the renderer from the boat's draft and margin, metres. */
export function depthSettings(draft: number, margin: number): DepthSettings {
  const safety = draft + margin;
  return { shallowContour: draft, safetyContour: safety, deepContour: Math.max(10, 2 * safety) };
}

export interface Hazard {
  kind: 'shallow' | 'land' | 'danger';
  /** Least depth, metres (negative: dries), or null when the chart does not give it. */
  depth: number | null;
  /** Where the segment first meets it. */
  lat: number;
  lon: number;
  /** Distance from the start of the segment, nautical miles. */
  distNm: number;
  name?: string;
}

type Geo = { type: string; coordinates?: unknown; geometries?: Geo[] };
export interface ChartFeature { geometry: Geo | null; properties: Record<string, unknown> }

/** What a feature means for a boat that needs `safety` metres, or null when it is no hazard. */
function classify(f: ChartFeature, safety: number): Pick<Hazard, 'kind' | 'depth' | 'name'> | null {
  const objl = Number(f.properties.OBJL);
  const attrs = f.properties._attributes as Map<number, string> | undefined;
  const num = (code: number) => { const v = attrs?.get(code); return v ? parseFloat(v) : null; };
  const name = attrs?.get(OBJNAM) || undefined;
  if (objl === LNDARE) return { kind: 'land', depth: null, name };
  if (objl === DEPARE || objl === DRGARE) {
    const d = num(DRVAL1) ?? 0;
    return d < safety ? { kind: 'shallow', depth: d, name } : null;
  }
  if (objl === UWTROC || objl === OBSTRN || objl === WRECKS) {
    const d = num(VALSOU);
    return d === null || d < safety ? { kind: 'danger', depth: d, name } : null;
  }
  return null;
}

const RAD = Math.PI / 180;
const bboxes = new WeakMap<object, [number, number, number, number]>();

function bboxOf(g: Geo): [number, number, number, number] {
  let b = bboxes.get(g);
  if (b) return b;
  const box: [number, number, number, number] = [Infinity, Infinity, -Infinity, -Infinity];
  const walk = (c: unknown): void => {
    if (!Array.isArray(c)) return;
    if (typeof c[0] === 'number') {
      const [x, y] = c as number[];
      if (x < box[0]) box[0] = x; if (y < box[1]) box[1] = y; if (x > box[2]) box[2] = x; if (y > box[3]) box[3] = y;
    } else for (const k of c) walk(k);
  };
  walk(g.coordinates);
  for (const s of g.geometries ?? []) { const sb = bboxOf(s); walk([[sb[0], sb[1]], [sb[2], sb[3]]]); }
  bboxes.set(g, box);
  return box;
}

/** Parameter t (0..1) along p→q where it crosses r→s, or null. */
function cross(px: number, py: number, qx: number, qy: number, rx: number, ry: number, sx: number, sy: number): number | null {
  const dx = qx - px, dy = qy - py, ex = sx - rx, ey = sy - ry;
  const den = dx * ey - dy * ex;
  if (den === 0) return null;
  const t = ((rx - px) * ey - (ry - py) * ex) / den;
  const u = ((rx - px) * dy - (ry - py) * dx) / den;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? t : null;
}

function inRings(rings: number[][][], x: number, y: number): boolean {
  let inside = false;
  for (const r of rings) {
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
      const [xi, yi] = r[i], [xj, yj] = r[j];
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
  }
  return inside;
}

/**
 * Hazards on the segment a→b for a boat that needs `safety` metres of water:
 * areas it enters (shallow water, land, dangers drawn as areas), dangers within
 * `clearanceNm` of it. One hazard per chart feature, nearest first.
 */
export function segmentHazards(a: Waypoint, b: Waypoint, features: Iterable<ChartFeature>, safety: number, clearanceNm = 0.03): Hazard[] {
  const k = Math.cos(((a.lat + b.lat) / 2) * RAD); // longitude degrees to latitude degrees
  const len = Math.hypot((b.lon - a.lon) * k, b.lat - a.lat) * 60;
  const pad = clearanceNm / 60;
  const lo = [Math.min(a.lon, b.lon) - pad / k, Math.min(a.lat, b.lat) - pad];
  const hi = [Math.max(a.lon, b.lon) + pad / k, Math.max(a.lat, b.lat) + pad];
  const out: Hazard[] = [];

  // First contact of the segment with a geometry, as a parameter 0..1.
  const first = (g: Geo): number | null => {
    let best: number | null = null;
    const take = (t: number | null) => { if (t !== null && (best === null || t < best)) best = t; };
    switch (g.type) {
      case 'Point': take(nearPoint(g.coordinates as number[])); break;
      case 'MultiPoint': for (const c of g.coordinates as number[][]) take(nearPoint(c)); break;
      case 'LineString': take(firstCross([g.coordinates as number[][]])); break;
      case 'MultiLineString': take(firstCross(g.coordinates as number[][][])); break;
      case 'Polygon': take(polygon(g.coordinates as number[][][])); break;
      case 'MultiPolygon': for (const p of g.coordinates as number[][][][]) take(polygon(p)); break;
      case 'GeometryCollection': for (const s of g.geometries ?? []) take(first(s)); break;
    }
    return best;
  };
  const nearPoint = ([x, y]: number[]): number | null => {
    const dx = (b.lon - a.lon) * k, dy = b.lat - a.lat, px = (x - a.lon) * k, py = y - a.lat;
    const l2 = dx * dx + dy * dy;
    const t = l2 ? Math.max(0, Math.min(1, (px * dx + py * dy) / l2)) : 0;
    return Math.hypot(px - t * dx, py - t * dy) * 60 <= clearanceNm ? t : null;
  };
  const firstCross = (lines: number[][][]): number | null => {
    let best: number | null = null;
    for (const r of lines) {
      for (let i = 1; i < r.length; i++) {
        const t = cross(a.lon, a.lat, b.lon, b.lat, r[i - 1][0], r[i - 1][1], r[i][0], r[i][1]);
        if (t !== null && (best === null || t < best)) best = t;
      }
    }
    return best;
  };
  const polygon = (rings: number[][][]): number | null =>
    inRings(rings, a.lon, a.lat) ? 0 : firstCross(rings);

  for (const f of features) {
    if (!f.geometry) continue;
    const what = classify(f, safety);
    if (!what) continue;
    const bb = bboxOf(f.geometry);
    if (bb[0] > hi[0] || bb[2] < lo[0] || bb[1] > hi[1] || bb[3] < lo[1]) continue;
    const t = first(f.geometry);
    if (t === null) continue;
    out.push({ ...what, lat: a.lat + t * (b.lat - a.lat), lon: a.lon + t * (b.lon - a.lon), distNm: t * len });
  }
  return out.sort((x, y) => x.distNm - y.distNm);
}

export interface LegHazards { leg: number; hazards: Hazard[] }

/** Hazards on every leg of a route; leg i runs from route[i] to route[i + 1]. Legs without hazards are left out. */
export function routeHazards(route: Waypoint[], features: ChartFeature[], safety: number): LegHazards[] {
  const out: LegHazards[] = [];
  for (let i = 0; i + 1 < route.length; i++) {
    const hazards = segmentHazards(route[i], route[i + 1], features, safety);
    if (hazards.length) out.push({ leg: i, hazards });
  }
  return out;
}

/** The point `distNm` from p on a course, degrees true (rhumb line, short distances). */
export function aheadOf(p: Waypoint, courseDeg: number, distNm: number): Waypoint {
  const r = courseDeg * RAD;
  const lat = p.lat + (distNm * Math.cos(r)) / 60;
  return { lat, lon: p.lon + (distNm * Math.sin(r)) / (60 * Math.cos(((p.lat + lat) / 2) * RAD)) };
}

/** The worst of the hazards: land, then a danger of unknown depth, then the least depth. */
export function worstHazard(hazards: Hazard[]): Hazard | undefined {
  const rank = (h: Hazard) => (h.kind === 'land' ? -2e9 : h.depth === null ? -1e9 : h.depth);
  let worst: Hazard | undefined;
  for (const h of hazards) if (!worst || rank(h) < rank(worst)) worst = h;
  return worst;
}

const m = (d: number) => `${Number(d.toFixed(1))}`;

/** A short description of a hazard, e.g. "shoal 1.8 m" or "wreck, depth unknown". */
export function describeHazard(h: Hazard, ru: boolean): string {
  const t = (en: string, r: string) => (ru ? r : en);
  let s: string;
  if (h.kind === 'land') s = t('land', 'суша');
  else if (h.kind === 'shallow') s = h.depth! < 0 ? t(`dries ${m(-h.depth!)} m`, `осыхает ${m(-h.depth!)} м`) : t(`shoal ${m(h.depth!)} m`, `мель ${m(h.depth!)} м`);
  else s = h.depth === null ? t('danger, depth unknown', 'опасность, глубина неизвестна') : t(`danger ${m(h.depth)} m`, `опасность ${m(h.depth)} м`);
  return h.name ? `${s} (${h.name})` : s;
}
