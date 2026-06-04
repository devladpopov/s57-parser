/**
 * S-57 data model types.
 *
 * S-57 has two main record categories:
 * - Feature Records (FRID): describe real-world objects (buoys, depths, coastlines...)
 * - Spatial Records (VRID): store the geometry (nodes, edges with coordinates)
 *
 * Features reference spatial records via FSPT (Feature to Spatial Pointer Table).
 * Geometry is resolved by following these references and applying COMF scaling.
 */

/** Parsed S-57 dataset */
export interface S57Dataset {
  /** Dataset name (e.g. "US5MA19M.000") */
  name: string;
  /** Coordinate multiplication factor (typically 10_000_000) */
  comf: number;
  /** Sounding multiplication factor (typically 10) */
  somf: number;
  /** All feature records */
  features: FeatureRecord[];
  /** All spatial records, keyed by RCID */
  spatialRecords: Map<number, SpatialRecord>;
}

/** S-57 Feature Record */
export interface FeatureRecord {
  /** Record ID */
  rcid: number;
  /** Object label code (links to S-57 object catalogue, e.g. 4=AIRARE, 86=LNDARE) */
  objl: number;
  /** Geometric primitive: 1=Point, 2=Line, 3=Area, 255=None */
  prim: GeomPrimitive;
  /** Group: 1=Bathymetric/cartographic, 2=Other */
  grup: number;
  /** Attributes: ATTL (code) -> ATVL (value string) */
  attributes: Map<number, string>;
  /** References to spatial records */
  spatialRefs: SpatialRef[];
  /** Feature object ID for cross-reference */
  foid?: FeatureObjectId;
}

/** Geometric primitive */
export enum GeomPrimitive {
  Point = 1,
  Line = 2,
  Area = 3,
  None = 255,
}

/** Feature to spatial record reference */
export interface SpatialRef {
  /** RCNM+RCID packed reference: use rcid to look up spatial record */
  rcnm: number;
  rcid: number;
  /** Orientation: 1=Forward, 2=Reverse, 255=NULL */
  ornt: number;
  /** Usage: 1=Exterior, 2=Interior, 3=Exterior boundary truncated, 255=NULL */
  usag: number;
  /** Masking: 1=Mask, 2=Show, 255=NULL */
  mask: number;
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

/** S-57 Spatial Record */
export interface SpatialRecord {
  rcid: number;
  /** Record name: 110=Isolated Node, 120=Connected Node, 130=Edge, 140=Face */
  rcnm: SpatialType;
  /** 2D coordinates (lat/lon in degrees, after COMF division) */
  coordinates2D: Coordinate2D[];
  /** 3D coordinates (sounding points) */
  coordinates3D: Coordinate3D[];
}

export enum SpatialType {
  IsolatedNode = 110,
  ConnectedNode = 120,
  Edge = 130,
  Face = 140,
}

export interface Coordinate2D {
  /** Latitude in degrees */
  lat: number;
  /** Longitude in degrees */
  lon: number;
}

export interface Coordinate3D extends Coordinate2D {
  /** Depth/elevation in metres (after SOMF division) */
  depth: number;
}
