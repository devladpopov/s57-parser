import { describe, expect, test } from 'bun:test';
import { alongTrackNm, bearingDeg, crossTrackNm, distanceNm, fromGpx, guide, hoursAt, routeLengthNm, startIndex, toGpx, trackLengthNm, trackToGpx, type TrackPoint, type Waypoint } from '../route.js';

// One minute of latitude is one nautical mile (to ~0.5% on a sphere).
const at = (lat: number, lon: number): Waypoint => ({ lat, lon });

describe('route math', () => {
  test('distance and bearing along a meridian and the equator', () => {
    expect(distanceNm(at(60, 30), at(61, 30))).toBeCloseTo(60.04, 1);
    expect(bearingDeg(at(60, 30), at(61, 30))).toBeCloseTo(0, 6);
    expect(bearingDeg(at(0, 0), at(0, 1))).toBeCloseTo(90, 6);
    expect(bearingDeg(at(0, 1), at(0, 0))).toBeCloseTo(270, 6);
  });

  test('cross-track sign: right of track is positive', () => {
    const a = at(0, 0), b = at(1, 0); // heading north
    expect(crossTrackNm(at(0.5, 0.01), a, b)).toBeCloseTo(0.6, 1);
    expect(crossTrackNm(at(0.5, -0.01), a, b)).toBeCloseTo(-0.6, 1);
  });

  test('along-track distance, negative behind the start', () => {
    const a = at(0, 0), b = at(1, 0);
    expect(alongTrackNm(at(0.5, 0.01), a, b)).toBeCloseTo(30, 0);
    expect(alongTrackNm(at(-0.1, 0), a, b)).toBeCloseTo(-6, 0);
  });

  test('route length and time', () => {
    expect(routeLengthNm([at(0, 0), at(1, 0), at(1, 1)])).toBeCloseTo(120, 0);
    expect(routeLengthNm([at(0, 0)])).toBe(0);
    expect(hoursAt(12, 6)).toBe(2);
    expect(hoursAt(12, 0)).toBeNaN();
  });
});

describe('guide', () => {
  const route = [at(0, 0), at(1, 0), at(1, 1)];

  test('heads to the first waypoint from off the route', () => {
    const g = guide(route, 0, at(-0.5, 0));
    expect(g.next).toBe(0);
    expect(g.dtwNm).toBeCloseTo(30, 0);
    expect(g.btwDeg).toBeCloseTo(0, 3);
    expect(g.xteNm).toBe(0);
    expect(g.remainingNm).toBeCloseTo(150, 0);
  });

  test('advances when inside the arrival circle', () => {
    expect(guide(route, 0, at(0.0005, 0)).next).toBe(1);
  });

  test('advances when the boat passed the waypoint abeam', () => {
    const g = guide(route, 1, at(1.01, 0.2)); // beyond WP2 on leg 1, now on leg 2
    expect(g.next).toBe(2);
    expect(g.xteNm).toBeCloseTo(-0.6, 1); // left of the eastbound leg
  });

  test('arrives at the end', () => {
    const g = guide(route, 2, at(1, 1.0005));
    expect(g.arrived).toBe(true);
    expect(g.remainingNm).toBe(0);
  });
});

describe('GPX', () => {
  test('round trip keeps positions and names', () => {
    const route = [{ lat: 59.9386, lon: 30.3141, name: 'Нева <мост>' }, { lat: 60.0, lon: 30.5 }];
    const back = fromGpx(toGpx(route, 'Ладога & Нева'));
    expect(back).toEqual([{ lat: 59.9386, lon: 30.3141, name: 'Нева <мост>' }, { lat: 60, lon: 30.5, name: 'WP2' }]);
  });

  test('reads tracks and waypoints when there is no route', () => {
    const trk = `<gpx><trk><trkseg><trkpt lat="1" lon="2"><ele>0</ele></trkpt><trkpt lon='4' lat='3'/></trkseg></trk></gpx>`;
    expect(fromGpx(trk)).toEqual([at(1, 2), at(3, 4)]);
    const wpt = `<gpx><wpt lat="5" lon="6"><name>A</name></wpt></gpx>`;
    expect(fromGpx(wpt)).toEqual([{ lat: 5, lon: 6, name: 'A' }]);
    expect(fromGpx('<gpx></gpx>')).toEqual([]);
  });
});

describe('startIndex', () => {
  const route = [at(0, 0), at(1, 0), at(1, 1)];
  test('nearest waypoint ahead of the boat', () => {
    expect(startIndex(route, at(-0.2, 0))).toBe(0); // before the start
    expect(startIndex(route, at(0.3, 0.01))).toBe(1); // on leg 1, nearest is behind
    expect(startIndex(route, at(0.9, 0))).toBe(1); // nearest is ahead
    expect(startIndex(route, at(1.1, 1.2))).toBe(2); // beyond the end
  });
});

describe('tracks', () => {
  test('GPX with times, read back as points', () => {
    const pts: TrackPoint[] = [[60, 30, Date.UTC(2026, 9, 7, 12)], [60.01, 30, Date.UTC(2026, 9, 7, 12, 6)]];
    const gpx = trackToGpx(pts, 'Утро');
    expect(gpx).toContain('<time>2026-10-07T12:06:00.000Z</time>');
    expect(gpx).toContain('<trk><name>Утро</name>');
    expect(fromGpx(gpx)).toEqual([at(60, 30), at(60.01, 30)]);
    expect(trackLengthNm(pts)).toBeCloseTo(0.6, 1);
  });
});
