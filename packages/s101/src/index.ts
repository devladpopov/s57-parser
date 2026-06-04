/**
 * @s57-parser/s101
 *
 * S-101 ENC parser and GeoJSON converter.
 * Part of the S-100 framework, uses ISO 8211 encoding.
 *
 * Key differences from S-57:
 * - String-based feature type codes (mapped to numeric IDs via catalogue)
 * - Complex (nested) attributes
 * - Information records
 * - Feature and information associations
 * - CompositeCurve spatial type
 *
 * For rendering, S-101 features are mapped to S-57 OBJL codes
 * for compatibility with the S-52 renderer.
 */

export { parseS101, isS101, spatialKey } from './parser.js';

export { toGeoJSON } from './geojson.js';
export type { GeoJSONFeatureCollection, GeoJSONFeature, GeoJSONGeometry } from './geojson.js';

export { S101_FEATURE_CATALOGUE, S101_FEATURE_BY_NAME, S101_TO_S57_OBJL } from './catalogue.js';

export type {
  S101Dataset,
  S101Feature,
  S101InformationRecord,
  S101SpatialRecord,
  S101SpatialRef,
  S101FeatureAssociation,
  S101InformationAssociation,
  FeatureObjectId,
  Coordinate2D,
  Coordinate3D,
} from './types.js';

export { S101Primitive, S101SpatialType, CurveType } from './types.js';
