import { describe, expect, test } from 'bun:test';
import { OBJL } from '../../packages/s52-render/src/lookup.js';
import { ATTL_BY_ACRONYM } from '../../packages/s57/src/attributes.js';
import { classAcronym, describeFeature, formatLatLon, isMeta, parseLatLon } from '../feature-info.js';

const attr = (acr: string) => `ATTL_${ATTL_BY_ACRONYM.get(acr)}`;

describe('object classes', () => {
  test('agree with the renderer table on every class it knows', () => {
    for (const [acr, code] of Object.entries(OBJL)) if (code < 300) expect(classAcronym(code)).toBe(acr);
    expect(classAcronym(159)).toBe('WRECKS');
    expect(classAcronym(999)).toBe('OBJL 999');
  });

  test('meta objects', () => {
    expect(isMeta(OBJL.M_COVR)).toBe(true);
    expect(isMeta(OBJL.DEPARE)).toBe(false);
  });
});

describe('describeFeature', () => {
  test('a lateral buoy in Russian, enumerations spelled out', () => {
    const info = describeFeature({ OBJL: OBJL.BOYLAT, [attr('OBJNAM')]: '№ 12', [attr('CATLAM')]: '1', [attr('COLOUR')]: '3,4', [attr('BOYSHP')]: '2' }, true);
    expect(info.acronym).toBe('BOYLAT');
    expect(info.title).toBe('Буй латеральный');
    expect(info.rows).toEqual([['Название', '№ 12'], ['Сторона', 'левая'], ['Форма', 'цилиндрический'], ['Цвет', 'красный, зелёный']]);
  });

  test('depth area in English, unknown enum codes kept', () => {
    const info = describeFeature({ OBJL: OBJL.DEPARE, [attr('DRVAL1')]: '2', [attr('DRVAL2')]: '5', [attr('WATLEV')]: '99' }, false);
    expect(info.title).toBe('Depth area');
    expect(info.rows).toEqual([['Depth range value 1', '2'], ['Depth range value 2', '5'], ['Water level effect', '99']]);
  });

  test('a class without a Russian or English name shows its acronym', () => {
    expect(describeFeature({ OBJL: 2 }, true).title).toBe('AIRARE');
  });
});

describe('coordinates', () => {
  test('format as degrees and decimal minutes', () => {
    expect(formatLatLon(59.93860, 30.31410, false)).toBe('59°56.316′ N 030°18.846′ E');
    expect(formatLatLon(-33.5, -70.99999999, true)).toBe('33°30.000′ Ю 071°00.000′ З');
  });

  test('parse the usual ways people write a position', () => {
    const near = (s: string, lat: number, lon: number) => {
      const p = parseLatLon(s);
      expect(p).not.toBeNull();
      expect(p!.lat).toBeCloseTo(lat, 4);
      expect(p!.lon).toBeCloseTo(lon, 4);
    };
    near('59.9386, 30.3141', 59.9386, 30.3141);
    near('59,9386 30,3141', 59.9386, 30.3141);
    near('59 56.316 N 30 18.846 E', 59.9386, 30.3141);
    near('59°56.316′С 30°18.846′В', 59.9386, 30.3141);
    near('N59 56.316 E030 18.846', 59.9386, 30.3141);
    near('59°56\'18.96"N 30°18\'50.76"E', 59.9386, 30.3141);
    near('30 18.846 E 59 56.316 N', 59.9386, 30.3141);
    near('33 30 Ю 71 0 З', -33.5, -71);
    near('-33.5 -71', -33.5, -71);
  });

  test('reject what is not a position', () => {
    expect(parseLatLon('')).toBeNull();
    expect(parseLatLon('59.9')).toBeNull();
    expect(parseLatLon('95 10')).toBeNull();
    expect(parseLatLon('59 75 30 10')).toBeNull();
    expect(parseLatLon('1 2 3')).toBeNull();
  });
});
