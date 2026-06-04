/**
 * @s57-parser/s57
 *
 * S-57 ENC data model built on top of @s57-parser/iso8211.
 * Handles feature extraction, topology resolution, and GeoJSON conversion.
 */

export { parseS57 } from './parser.js';
export { toGeoJSON } from './geojson.js';
export type {
  S57Dataset,
  FeatureRecord,
  SpatialRecord,
  SpatialRef,
  FeatureObjectId,
  Coordinate2D,
  Coordinate3D,
} from './types.js';
export { GeomPrimitive, SpatialType } from './types.js';
export type { GeoJSONFeatureCollection, GeoJSONFeature, GeoJSONGeometry } from './geojson.js';
