/**
 * Route navigation math and GPX for the plotter: a route is a list of
 * waypoints, the boat steers along the legs between them.
 *
 * Distances are in nautical miles, bearings in degrees true, on a sphere with
 * the mean Earth radius (good to ~0.5% at plotter scales).
 */

export interface Waypoint { lat: number; lon: number; name?: string }

const R_NM = 6371008.8 / 1852;
const RAD = Math.PI / 180;

/** Great-circle distance, nautical miles. */
export function distanceNm(a: Waypoint, b: Waypoint): number {
  const dLat = (b.lat - a.lat) * RAD;
  const dLon = (b.lon - a.lon) * RAD;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * RAD) * Math.cos(b.lat * RAD) * Math.sin(dLon / 2) ** 2;
  return 2 * R_NM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Initial great-circle bearing from a to b, 0-360 degrees true. */
export function bearingDeg(a: Waypoint, b: Waypoint): number {
  const φ1 = a.lat * RAD, φ2 = b.lat * RAD, Δλ = (b.lon - a.lon) * RAD;
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (Math.atan2(y, x) / RAD + 360) % 360;
}

/**
 * Cross-track error of p from the leg a→b, nautical miles: positive when the
 * boat is right of the track (steer left), negative when left.
 */
export function crossTrackNm(p: Waypoint, a: Waypoint, b: Waypoint): number {
  const d13 = distanceNm(a, p) / R_NM;
  const θ13 = bearingDeg(a, p) * RAD, θ12 = bearingDeg(a, b) * RAD;
  return Math.asin(Math.sin(d13) * Math.sin(θ13 - θ12)) * R_NM;
}

/** Distance from a along the leg a→b to the point abeam of p, nautical miles. */
export function alongTrackNm(p: Waypoint, a: Waypoint, b: Waypoint): number {
  const d13 = distanceNm(a, p) / R_NM;
  const xt = crossTrackNm(p, a, b) / R_NM;
  const sign = Math.cos((bearingDeg(a, p) - bearingDeg(a, b)) * RAD) < 0 ? -1 : 1;
  return sign * Math.acos(Math.min(1, Math.cos(d13) / Math.cos(xt))) * R_NM;
}

/** Total length of a route, nautical miles. */
export function routeLengthNm(route: Waypoint[]): number {
  let sum = 0;
  for (let i = 1; i < route.length; i++) sum += distanceNm(route[i - 1], route[i]);
  return sum;
}

export interface Guidance {
  /** Index of the waypoint the boat is heading to. */
  next: number;
  /** Distance and bearing to it. */
  dtwNm: number;
  btwDeg: number;
  /** Cross-track error from the active leg (0 on the first leg from the boat). */
  xteNm: number;
  /** Distance to the last waypoint via the remaining legs. */
  remainingNm: number;
  /** Route finished: the last waypoint was reached. */
  arrived: boolean;
}

/**
 * Steering data for a boat at p heading to route[next]. The active waypoint
 * counts as reached when the boat is within arrivalNm of it or has passed the
 * line square to the leg through it; then the next one becomes active.
 */
export function guide(route: Waypoint[], next: number, p: Waypoint, arrivalNm = 0.05): Guidance {
  let i = Math.max(0, Math.min(next, route.length - 1));
  while (i < route.length) {
    const wp = route[i];
    const prev = route[i - 1];
    const passed = prev && alongTrackNm(p, prev, wp) >= distanceNm(prev, wp);
    if (distanceNm(p, wp) > arrivalNm && !passed) break;
    i++;
  }
  if (i >= route.length) {
    const last = route[route.length - 1];
    return { next: route.length - 1, dtwNm: distanceNm(p, last), btwDeg: bearingDeg(p, last), xteNm: 0, remainingNm: 0, arrived: true };
  }
  const wp = route[i];
  const dtwNm = distanceNm(p, wp);
  return {
    next: i,
    dtwNm,
    btwDeg: bearingDeg(p, wp),
    xteNm: i > 0 ? crossTrackNm(p, route[i - 1], wp) : 0,
    remainingNm: dtwNm + routeLengthNm(route.slice(i)),
    arrived: false,
  };
}

/**
 * Waypoint to steer to when steering starts at p: the nearest one, or the one
 * after it when the boat is already beyond the nearest along the next leg.
 */
export function startIndex(route: Waypoint[], p: Waypoint): number {
  let best = 0;
  route.forEach((w, i) => { if (distanceNm(p, w) < distanceNm(p, route[best])) best = i; });
  return best + 1 < route.length && alongTrackNm(p, route[best], route[best + 1]) > 0 ? best + 1 : best;
}

/** Time to cover a distance at a speed, hours, or NaN without a usable speed. */
export function hoursAt(distNm: number, speedKn: number): number {
  return speedKn > 0.1 ? distNm / speedKn : NaN;
}

// ─── GPX ────────────────────────────────────────────────────────────────────

const esc = (s: string) => s.replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[c]!);

/** A GPX 1.1 document with one route. */
export function toGpx(route: Waypoint[], name = 'Route'): string {
  const pts = route.map((w, i) =>
    `    <rtept lat="${w.lat.toFixed(6)}" lon="${w.lon.toFixed(6)}"><name>${esc(w.name ?? `WP${i + 1}`)}</name></rtept>`);
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<gpx version="1.1" creator="s57-parser plotter" xmlns="http://www.topografix.com/GPX/1/1">',
    `  <rte><name>${esc(name)}</name>`,
    ...pts,
    '  </rte>',
    '</gpx>',
    '',
  ].join('\n');
}

/**
 * Waypoints from a GPX file: the first route (rtept), else the first track
 * (trkpt), else the standalone waypoints (wpt). Regex-based, so it also runs
 * outside the browser; GPX files from plotters are simple enough for it.
 */
export function fromGpx(xml: string): Waypoint[] {
  const block = (tag: string) => xml.match(new RegExp(`<${tag}[\\s>][\\s\\S]*?</${tag}>`))?.[0];
  for (const [container, pt] of [['rte', 'rtept'], ['trk', 'trkpt'], ['gpx', 'wpt']] as const) {
    const body = block(container) ?? '';
    const out: Waypoint[] = [];
    for (const m of body.matchAll(new RegExp(`<${pt}\\b([^>]*?)(/>|>([\\s\\S]*?)</${pt}>)`, 'g'))) {
      const lat = Number(m[1].match(/\blat\s*=\s*["']([^"']+)/)?.[1]);
      const lon = Number(m[1].match(/\blon\s*=\s*["']([^"']+)/)?.[1]);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
      const name = m[3]?.match(/<name>([\s\S]*?)<\/name>/)?.[1]
        ?.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&').trim();
      out.push(name ? { lat, lon, name } : { lat, lon });
    }
    if (out.length) return out;
  }
  return [];
}
