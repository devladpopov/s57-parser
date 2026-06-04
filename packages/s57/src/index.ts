/**
 * @s57-parser/s57
 *
 * S-57 ENC data model built on top of @s57-parser/iso8211.
 * Handles feature extraction, topology resolution, and GeoJSON conversion.
 */

export { parseS57, spatialKey } from './parser.js';
export { toGeoJSON } from './geojson.js';
export { applyUpdate } from './update.js';
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
export { S57_ATTRIBUTES, ATTL_BY_ACRONYM, ATTL } from './attributes.js';
export type { AttributeDef, AttrValueType } from './attributes.js';
export { typedFeature, typedFeatures, filterByClass, OBJL } from './typed-features.js';
export type {
  TypedFeature, TypedFeatureBase,
  DepthArea, DepthContour, Sounding, Coastline, LandArea,
  Light, Beacon, Buoy, Obstruction, Wreck, UnderwaterRock,
  RestrictedArea, Bridge, Landmark, AnchorageArea,
} from './typed-features.js';
