/**
 * S-101 data model types.
 *
 * S-101 is part of the S-100 framework and uses ISO 8211 encoding.
 * Key differences from S-57:
 * - Feature types use string codes (e.g. "DepthArea") mapped to numeric IDs via catalogue
 * - Complex (nested) attributes alongside simple ones
 * - Information records (metadata that features reference)
 * - Curve geometry types (arcs, composite curves)
 * - Feature associations (feature-to-feature links)
 */

/** Parsed S-101 dataset */
export interface S101Dataset {
  /** Dataset name */
  name: string;
  /** Product specification identifier (should be "S-101") */
  productSpec: string;
  /** Product specification version (e.g. "1.2.0") */
  productVersion: string;
  /** Horizontal coordinate multiplication factor */
  comf: number;
  /** Sounding multiplication factor */
  somf: number;
  /** Dataset coordinate reference system (EPSG code, default 4326 = WGS84) */
  crs: number;
  /** All feature records */
  features: S101Feature[];
  /** All information records */
  informationRecords: S101InformationRecord[];
  /** All spatial records, keyed by compound key (rcnm * 100000 + rcid) */
  spatialRecords: Map<number, S101SpatialRecord>;
}

/** S-101 Feature Record */
export interface S101Feature {
  /** Record ID */
  rcid: number;
  /** Feature type code (numeric, mapped from catalogue) */
  featureTypeCode: number;
  /** Feature type name (string, e.g. "DepthArea", "Landmark") */
  featureTypeName: string;
  /** Geometric primitive: 1=Point, 2=Curve, 3=Surface, 255=None */
  primitive: S101Primitive;
  /** Simple attributes: code -> value */
  attributes: Map<number, string>;
  /** Complex attributes: code -> array of sub-attribute maps */
  complexAttributes: Map<number, Map<number, string>[]>;
  /** Spatial references */
  spatialRefs: S101SpatialRef[];
  /** Feature association references */
  featureAssociations: S101FeatureAssociation[];
  /** Information association references */
  informationAssociations: S101InformationAssociation[];
  /** Feature object identifier */
  foid?: FeatureObjectId;
}

/** S-101 Information Record (metadata) */
export interface S101InformationRecord {
  /** Record ID */
  rcid: number;
  /** Information type code */
  typeCode: number;
  /** Information type name */
  typeName: string;
  /** Attributes */
  attributes: Map<number, string>;
  /** Complex attributes */
  complexAttributes: Map<number, Map<number, string>[]>;
}

/** Geometric primitive for S-101 */
export enum S101Primitive {
  Point = 1,
  Curve = 2,
  Surface = 3,
  None = 255,
}

/** Feature to spatial record reference */
export interface S101SpatialRef {
  rcnm: number;
  rcid: number;
  /** Orientation: 1=Forward, 2=Reverse, 255=NULL */
  ornt: number;
  /** Usage: 1=Exterior, 2=Interior, 255=NULL */
  usag: number;
  /** Masking: 1=Mask, 2=Show, 255=NULL */
  mask: number;
}

/** Feature to feature association */
export interface S101FeatureAssociation {
  /** Association type code */
  associationType: number;
  /** Role of this feature in the association */
  role: number;
  /** Referenced feature RCID */
  targetRcid: number;
}

/** Feature to information record association */
export interface S101InformationAssociation {
  /** Association type code */
  associationType: number;
  /** Referenced information record RCID */
  targetRcid: number;
}

/** Feature Object ID */
export interface FeatureObjectId {
  /** Producing agency */
  agen: number;
  /** Feature identification number */
  fidn: number;
  /** Feature identification subdivision */
  fids: number;
}

/** S-101 Spatial Record */
export interface S101SpatialRecord {
  rcid: number;
  /** Record name: 110=Point, 120=MultiPoint, 130=Curve, 140=CompositeCurve, 150=Surface */
  rcnm: S101SpatialType;
  /** 2D coordinates (lat/lon in degrees) */
  coordinates2D: Coordinate2D[];
  /** 3D coordinates (sounding points) */
  coordinates3D: Coordinate3D[];
  /** For Curve records: start node RCID */
  startNodeRcid?: number;
  /** For Curve records: end node RCID */
  endNodeRcid?: number;
  /** Curve segment type for complex geometry */
  curveType?: CurveType;
  /** For CompositeCurve: ordered list of component curve RCIDs */
  componentCurves?: number[];
}

export enum S101SpatialType {
  Point = 110,
  MultiPoint = 120,
  Curve = 130,
  CompositeCurve = 140,
  Surface = 150,
}

export enum CurveType {
  Loxodrome = 1,
  Geodesic = 2,
  CircularArc3Points = 3,
  Elliptical = 4,
}

export interface Coordinate2D {
  lat: number;
  lon: number;
}

export interface Coordinate3D extends Coordinate2D {
  depth: number;
}
