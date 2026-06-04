import { describe, it, expect } from 'bun:test';
import { S101_FEATURE_CATALOGUE, S101_FEATURE_BY_NAME, S101_TO_S57_OBJL } from '../src/catalogue.js';
import { S101Primitive, S101SpatialType, CurveType } from '../src/types.js';
import { spatialKey } from '../src/parser.js';
import type { S101Dataset, S101Feature, S101SpatialRecord } from '../src/types.js';
import { toGeoJSON } from '../src/geojson.js';

describe('S-101 Feature Catalogue', () => {
  it('should contain major navigational features', () => {
    expect(S101_FEATURE_CATALOGUE.get(37)).toBe('DepthArea');
    expect(S101_FEATURE_CATALOGUE.get(27)).toBe('Coastline');
    expect(S101_FEATURE_CATALOGUE.get(73)).toBe('Light');
    expect(S101_FEATURE_CATALOGUE.get(132)).toBe('Sounding');
    expect(S101_FEATURE_CATALOGUE.get(69)).toBe('LandArea');
    expect(S101_FEATURE_CATALOGUE.get(157)).toBe('Wreck');
  });

  it('should contain meta features', () => {
    expect(S101_FEATURE_CATALOGUE.get(300)).toBe('DataCoverage');
    expect(S101_FEATURE_CATALOGUE.get(306)).toBe('SoundingDatum');
  });

  it('should have 150+ feature types', () => {
    expect(S101_FEATURE_CATALOGUE.size).toBeGreaterThan(150);
  });

  it('should have consistent reverse mapping', () => {
    for (const [code, name] of S101_FEATURE_CATALOGUE) {
      expect(S101_FEATURE_BY_NAME.get(name)).toBe(code);
    }
  });
});

describe('S-101 to S-57 OBJL mapping', () => {
  it('should map DepthArea to DEPARE (42)', () => {
    expect(S101_TO_S57_OBJL.get(37)).toBe(42);
  });

  it('should map Coastline to COALNE (30)', () => {
    expect(S101_TO_S57_OBJL.get(27)).toBe(30);
  });

  it('should map Light to LIGHTS (75)', () => {
    expect(S101_TO_S57_OBJL.get(73)).toBe(75);
  });

  it('should map Sounding to SOUNDG (129)', () => {
    expect(S101_TO_S57_OBJL.get(132)).toBe(129);
  });

  it('should map Wreck to WRECKS (159)', () => {
    expect(S101_TO_S57_OBJL.get(157)).toBe(159);
  });

  it('should map LandArea to LNDARE (71)', () => {
    expect(S101_TO_S57_OBJL.get(69)).toBe(71);
  });

  it('should have 50+ mappings', () => {
    expect(S101_TO_S57_OBJL.size).toBeGreaterThan(50);
  });
});

describe('S-101 types', () => {
  it('should define spatial types different from S-57', () => {
    expect(S101SpatialType.Point).toBe(110);
    expect(S101SpatialType.MultiPoint).toBe(120);
    expect(S101SpatialType.Curve).toBe(130);
    expect(S101SpatialType.CompositeCurve).toBe(140);
    expect(S101SpatialType.Surface).toBe(150);
  });

  it('should define primitive types', () => {
    expect(S101Primitive.Point).toBe(1);
    expect(S101Primitive.Curve).toBe(2);
    expect(S101Primitive.Surface).toBe(3);
    expect(S101Primitive.None).toBe(255);
  });

  it('should define curve types', () => {
    expect(CurveType.Loxodrome).toBe(1);
    expect(CurveType.Geodesic).toBe(2);
    expect(CurveType.CircularArc3Points).toBe(3);
  });
});

describe('spatialKey', () => {
  it('should create unique compound keys', () => {
    const pointKey = spatialKey(S101SpatialType.Point, 1);
    const curveKey = spatialKey(S101SpatialType.Curve, 1);
    expect(pointKey).not.toBe(curveKey);
  });

  it('should be deterministic', () => {
    expect(spatialKey(130, 42)).toBe(spatialKey(130, 42));
  });
});

describe('S-101 GeoJSON conversion', () => {
  function makeDataset(
    features: S101Feature[],
    spatials: S101SpatialRecord[]
  ): S101Dataset {
    const spatialRecords = new Map<number, S101SpatialRecord>();
    for (const s of spatials) spatialRecords.set(spatialKey(s.rcnm, s.rcid), s);
    return {
      name: 'TEST',
      productSpec: 'S-101',
      productVersion: '1.2.0',
      comf: 10_000_000,
      somf: 10,
      crs: 4326,
      features,
      informationRecords: [],
      spatialRecords,
    };
  }

  it('should convert point feature to GeoJSON Point', () => {
    const dataset = makeDataset(
      [{
        rcid: 1,
        featureTypeCode: 73, // Light
        featureTypeName: 'Light',
        primitive: S101Primitive.Point,
        attributes: new Map(),
        complexAttributes: new Map(),
        spatialRefs: [{ rcnm: S101SpatialType.Point, rcid: 10, ornt: 1, usag: 255, mask: 255 }],
        featureAssociations: [],
        informationAssociations: [],
      }],
      [{
        rcid: 10,
        rcnm: S101SpatialType.Point,
        coordinates2D: [{ lat: 42.35, lon: -70.88 }],
        coordinates3D: [],
      }]
    );

    const geojson = toGeoJSON(dataset);
    expect(geojson.features).toHaveLength(1);
    expect(geojson.features[0].geometry).not.toBeNull();
    expect(geojson.features[0].geometry!.type).toBe('Point');
    const coords = (geojson.features[0].geometry as { coordinates: [number, number] }).coordinates;
    expect(coords[0]).toBeCloseTo(-70.88, 2);
    expect(coords[1]).toBeCloseTo(42.35, 2);
  });

  it('should include OBJL mapping in properties', () => {
    const dataset = makeDataset(
      [{
        rcid: 1,
        featureTypeCode: 37, // DepthArea
        featureTypeName: 'DepthArea',
        primitive: S101Primitive.Surface,
        attributes: new Map(),
        complexAttributes: new Map(),
        spatialRefs: [],
        featureAssociations: [],
        informationAssociations: [],
      }],
      []
    );

    const geojson = toGeoJSON(dataset);
    expect(geojson.features[0].properties.featureType).toBe('DepthArea');
    expect(geojson.features[0].properties.OBJL).toBe(42); // DEPARE
  });

  it('should convert curve feature to LineString', () => {
    const dataset = makeDataset(
      [{
        rcid: 1,
        featureTypeCode: 27, // Coastline
        featureTypeName: 'Coastline',
        primitive: S101Primitive.Curve,
        attributes: new Map(),
        complexAttributes: new Map(),
        spatialRefs: [{ rcnm: S101SpatialType.Curve, rcid: 20, ornt: 1, usag: 255, mask: 255 }],
        featureAssociations: [],
        informationAssociations: [],
      }],
      [
        {
          rcid: 1,
          rcnm: S101SpatialType.Point,
          coordinates2D: [{ lat: 42.0, lon: -70.0 }],
          coordinates3D: [],
        },
        {
          rcid: 2,
          rcnm: S101SpatialType.Point,
          coordinates2D: [{ lat: 42.1, lon: -70.2 }],
          coordinates3D: [],
        },
        {
          rcid: 20,
          rcnm: S101SpatialType.Curve,
          coordinates2D: [
            { lat: 42.03, lon: -70.05 },
            { lat: 42.06, lon: -70.1 },
          ],
          coordinates3D: [],
          startNodeRcid: 1,
          endNodeRcid: 2,
        },
      ]
    );

    const geojson = toGeoJSON(dataset);
    expect(geojson.features[0].geometry).not.toBeNull();
    expect(geojson.features[0].geometry!.type).toBe('LineString');
    const coords = (geojson.features[0].geometry as { coordinates: [number, number][] }).coordinates;
    expect(coords.length).toBe(4); // start node + 2 intermediate + end node
    expect(coords[0][1]).toBeCloseTo(42.0, 2);  // start node lat
    expect(coords[3][1]).toBeCloseTo(42.1, 2);  // end node lat
  });

  it('should convert surface feature to Polygon', () => {
    const dataset = makeDataset(
      [{
        rcid: 1,
        featureTypeCode: 69, // LandArea
        featureTypeName: 'LandArea',
        primitive: S101Primitive.Surface,
        attributes: new Map(),
        complexAttributes: new Map(),
        spatialRefs: [
          { rcnm: S101SpatialType.Curve, rcid: 30, ornt: 1, usag: 1, mask: 255 },
          { rcnm: S101SpatialType.Curve, rcid: 31, ornt: 1, usag: 1, mask: 255 },
        ],
        featureAssociations: [],
        informationAssociations: [],
      }],
      [
        { rcid: 1, rcnm: S101SpatialType.Point, coordinates2D: [{ lat: 0, lon: 0 }], coordinates3D: [] },
        { rcid: 2, rcnm: S101SpatialType.Point, coordinates2D: [{ lat: 1, lon: 1 }], coordinates3D: [] },
        {
          rcid: 30,
          rcnm: S101SpatialType.Curve,
          coordinates2D: [{ lat: 0.3, lon: 0.3 }, { lat: 0.7, lon: 0.7 }],
          coordinates3D: [],
          startNodeRcid: 1,
          endNodeRcid: 2,
        },
        {
          rcid: 31,
          rcnm: S101SpatialType.Curve,
          coordinates2D: [{ lat: 0.7, lon: 0.3 }, { lat: 0.3, lon: 0.0 }],
          coordinates3D: [],
          startNodeRcid: 2,
          endNodeRcid: 1,
        },
      ]
    );

    const geojson = toGeoJSON(dataset);
    expect(geojson.features[0].geometry).not.toBeNull();
    expect(geojson.features[0].geometry!.type).toBe('Polygon');
    const rings = (geojson.features[0].geometry as { coordinates: [number, number][][] }).coordinates;
    expect(rings.length).toBe(1); // 1 exterior ring
    expect(rings[0].length).toBeGreaterThanOrEqual(4); // closed ring with 3+ unique points
  });

  it('should filter by feature type code', () => {
    const dataset = makeDataset(
      [
        {
          rcid: 1, featureTypeCode: 73, featureTypeName: 'Light',
          primitive: S101Primitive.Point, attributes: new Map(),
          complexAttributes: new Map(), spatialRefs: [],
          featureAssociations: [], informationAssociations: [],
        },
        {
          rcid: 2, featureTypeCode: 37, featureTypeName: 'DepthArea',
          primitive: S101Primitive.Surface, attributes: new Map(),
          complexAttributes: new Map(), spatialRefs: [],
          featureAssociations: [], informationAssociations: [],
        },
      ],
      []
    );

    const filtered = toGeoJSON(dataset, [73]);
    expect(filtered.features).toHaveLength(1);
    expect(filtered.features[0].properties.featureType).toBe('Light');
  });

  it('should include attributes in properties', () => {
    const attrs = new Map<number, string>();
    attrs.set(87, '5.0');
    attrs.set(88, '10.0');

    const dataset = makeDataset(
      [{
        rcid: 1, featureTypeCode: 37, featureTypeName: 'DepthArea',
        primitive: S101Primitive.Surface,
        attributes: attrs,
        complexAttributes: new Map(),
        spatialRefs: [],
        featureAssociations: [], informationAssociations: [],
      }],
      []
    );

    const geojson = toGeoJSON(dataset);
    expect(geojson.features[0].properties.ATTL_87).toBe('5.0');
    expect(geojson.features[0].properties.ATTL_88).toBe('10.0');
  });
});
