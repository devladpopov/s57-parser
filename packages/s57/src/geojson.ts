/**
 * GeoJSON conversion from S-57 dataset.
 *
 * Resolves feature geometry by following spatial record references.
 * Output is standard GeoJSON FeatureCollection.
 */

import type { S57Dataset, FeatureRecord, SpatialRecord, Coordinate2D } from './types.js';
import { GeomPrimitive, SpatialType } from './types.js';

export interface GeoJSONFeatureCollection {
  type: 'FeatureCollection';
  features: GeoJSONFeature[];
}

export interface GeoJSONFeature {
  type: 'Feature';
  geometry: GeoJSONGeometry | null;
  properties: Record<string, unknown>;
}

export type GeoJSONGeometry =
  | { type: 'Point'; coordinates: [number, number] }
  | { type: 'MultiPoint'; coordinates: [number, number][] }
  | { type: 'LineString'; coordinates: [number, number][] }
  | { type: 'Polygon'; coordinates: [number, number][][] }
  | { type: 'GeometryCollection'; geometries: GeoJSONGeometry[] };

/**
 * Convert an S-57 dataset to a GeoJSON FeatureCollection.
 *
 * @param dataset - Parsed S-57 dataset
 * @param objlFilter - Optional array of OBJL codes to include (undefined = all)
 */
export function toGeoJSON(
  dataset: S57Dataset,
  objlFilter?: number[]
): GeoJSONFeatureCollection {
  const features: GeoJSONFeature[] = [];

  for (const feature of dataset.features) {
    if (objlFilter && !objlFilter.includes(feature.objl)) continue;

    const geometry = resolveGeometry(feature, dataset.spatialRecords);
    const properties = buildProperties(feature);

    features.push({ type: 'Feature', geometry, properties });
  }

  return { type: 'FeatureCollection', features };
}

/** Resolve geometry for a feature by following spatial references. */
function resolveGeometry(
  feature: FeatureRecord,
  spatialRecords: Map<number, SpatialRecord>
): GeoJSONGeometry | null {
  if (feature.prim === GeomPrimitive.None || feature.spatialRefs.length === 0) {
    return null;
  }

  if (feature.prim === GeomPrimitive.Point) {
    return resolvePoint(feature, spatialRecords);
  }

  if (feature.prim === GeomPrimitive.Line) {
    return resolveLine(feature, spatialRecords);
  }

  if (feature.prim === GeomPrimitive.Area) {
    return resolveArea(feature, spatialRecords);
  }

  return null;
}

function resolvePoint(
  feature: FeatureRecord,
  spatialRecords: Map<number, SpatialRecord>
): GeoJSONGeometry | null {
  const allCoords: [number, number][] = [];

  for (const ref of feature.spatialRefs) {
    const spatial = spatialRecords.get(ref.rcid);
    if (!spatial) continue;

    // Isolated/connected nodes have either 2D or 3D coords
    if (spatial.coordinates2D.length > 0) {
      for (const c of spatial.coordinates2D) {
        allCoords.push([c.lon, c.lat]);
      }
    } else if (spatial.coordinates3D.length > 0) {
      // Sounding points — use 2D position only for basic GeoJSON
      for (const c of spatial.coordinates3D) {
        allCoords.push([c.lon, c.lat]);
      }
    }
  }

  if (allCoords.length === 0) return null;
  if (allCoords.length === 1) return { type: 'Point', coordinates: allCoords[0] };
  return { type: 'MultiPoint', coordinates: allCoords };
}

function resolveLine(
  feature: FeatureRecord,
  spatialRecords: Map<number, SpatialRecord>
): GeoJSONGeometry | null {
  const coords: [number, number][] = [];

  for (const ref of feature.spatialRefs) {
    const spatial = spatialRecords.get(ref.rcid);
    if (!spatial) continue;

    const edgeCoords = coordsFromSpatial(spatial);
    if (ref.ornt === 2) edgeCoords.reverse(); // Reverse orientation

    // Avoid duplicating connecting nodes
    if (coords.length > 0 && edgeCoords.length > 0) {
      const last = coords[coords.length - 1];
      const first = edgeCoords[0];
      if (last[0] === first[0] && last[1] === first[1]) {
        edgeCoords.shift();
      }
    }
    coords.push(...edgeCoords);
  }

  if (coords.length < 2) return null;
  return { type: 'LineString', coordinates: coords };
}

function resolveArea(
  feature: FeatureRecord,
  spatialRecords: Map<number, SpatialRecord>
): GeoJSONGeometry | null {
  // Collect exterior (usag=1) and interior (usag=2) rings
  const exteriorCoords: [number, number][] = [];
  const interiorRings: [number, number][][] = [];

  for (const ref of feature.spatialRefs) {
    const spatial = spatialRecords.get(ref.rcid);
    if (!spatial) continue;

    const edgeCoords = coordsFromSpatial(spatial);
    if (ref.ornt === 2) edgeCoords.reverse();

    if (ref.usag === 2) {
      // Interior boundary (hole)
      interiorRings.push(closeRing(edgeCoords));
    } else {
      // Exterior boundary
      if (exteriorCoords.length > 0 && edgeCoords.length > 0) {
        const last = exteriorCoords[exteriorCoords.length - 1];
        const first = edgeCoords[0];
        if (last[0] === first[0] && last[1] === first[1]) {
          edgeCoords.shift();
        }
      }
      exteriorCoords.push(...edgeCoords);
    }
  }

  if (exteriorCoords.length < 3) return null;

  const rings: [number, number][][] = [closeRing(exteriorCoords), ...interiorRings];
  return { type: 'Polygon', coordinates: rings };
}

/** Get all coordinates from a spatial record (2D or 3D). */
function coordsFromSpatial(spatial: SpatialRecord): [number, number][] {
  if (spatial.coordinates2D.length > 0) {
    return spatial.coordinates2D.map(c => [c.lon, c.lat]);
  }
  return spatial.coordinates3D.map(c => [c.lon, c.lat]);
}

/** Ensure ring is closed (first and last point identical). */
function closeRing(coords: [number, number][]): [number, number][] {
  if (coords.length < 2) return coords;
  const first = coords[0];
  const last = coords[coords.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) {
    return [...coords, first];
  }
  return coords;
}

/** Build GeoJSON properties from feature attributes and metadata. */
function buildProperties(feature: FeatureRecord): Record<string, unknown> {
  const props: Record<string, unknown> = {
    RCID: feature.rcid,
    OBJL: feature.objl,
    PRIM: feature.prim,
    GRUP: feature.grup,
  };

  // Include all attributes as ATTL_<code>: value
  for (const [code, value] of feature.attributes) {
    props[`ATTL_${code}`] = value;
  }

  if (feature.foid) {
    props.AGEN = feature.foid.agen;
    props.FIDN = feature.foid.fidn;
    props.FIDS = feature.foid.fids;
  }

  return props;
}
