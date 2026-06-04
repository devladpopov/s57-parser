/**
 * GeoJSON conversion from S-101 dataset.
 *
 * Resolves feature geometry by following spatial record references.
 * Includes S-101-specific properties and S-57 OBJL mapping for
 * compatibility with existing S-52 renderers.
 */

import type { S101Dataset, S101Feature, S101SpatialRecord } from './types.js';
import { S101Primitive, S101SpatialType } from './types.js';
import { spatialKey } from './parser.js';
import { S101_TO_S57_OBJL } from './catalogue.js';

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
 * Convert an S-101 dataset to GeoJSON FeatureCollection.
 *
 * Properties include both S-101 feature type info and a mapped S-57 OBJL
 * code (when available) for rendering with S-52 symbology.
 */
export function toGeoJSON(
  dataset: S101Dataset,
  featureTypeFilter?: number[]
): GeoJSONFeatureCollection {
  const features: GeoJSONFeature[] = [];

  for (const feature of dataset.features) {
    if (featureTypeFilter && !featureTypeFilter.includes(feature.featureTypeCode)) continue;

    const geometry = resolveGeometry(feature, dataset.spatialRecords);
    const properties = buildProperties(feature);

    features.push({ type: 'Feature', geometry, properties });
  }

  return { type: 'FeatureCollection', features };
}

function resolveGeometry(
  feature: S101Feature,
  spatialRecords: Map<number, S101SpatialRecord>
): GeoJSONGeometry | null {
  if (feature.primitive === S101Primitive.None || feature.spatialRefs.length === 0) {
    return null;
  }

  switch (feature.primitive) {
    case S101Primitive.Point:
      return resolvePoint(feature, spatialRecords);
    case S101Primitive.Curve:
      return resolveCurve(feature, spatialRecords);
    case S101Primitive.Surface:
      return resolveSurface(feature, spatialRecords);
    default:
      return null;
  }
}

function resolvePoint(
  feature: S101Feature,
  spatialRecords: Map<number, S101SpatialRecord>
): GeoJSONGeometry | null {
  const allCoords: [number, number][] = [];

  for (const ref of feature.spatialRefs) {
    const spatial = spatialRecords.get(spatialKey(ref.rcnm, ref.rcid));
    if (!spatial) continue;

    if (spatial.coordinates2D.length > 0) {
      for (const c of spatial.coordinates2D) allCoords.push([c.lon, c.lat]);
    } else if (spatial.coordinates3D.length > 0) {
      for (const c of spatial.coordinates3D) allCoords.push([c.lon, c.lat]);
    }
  }

  if (allCoords.length === 0) return null;
  if (allCoords.length === 1) return { type: 'Point', coordinates: allCoords[0] };
  return { type: 'MultiPoint', coordinates: allCoords };
}

function resolveCurve(
  feature: S101Feature,
  spatialRecords: Map<number, S101SpatialRecord>
): GeoJSONGeometry | null {
  const coords: [number, number][] = [];

  for (const ref of feature.spatialRefs) {
    const spatial = spatialRecords.get(spatialKey(ref.rcnm, ref.rcid));
    if (!spatial) continue;

    const edgeCoords = coordsFromSpatial(spatial, spatialRecords);
    if (ref.ornt === 2) edgeCoords.reverse();

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

function resolveSurface(
  feature: S101Feature,
  spatialRecords: Map<number, S101SpatialRecord>
): GeoJSONGeometry | null {
  const exteriorCoords: [number, number][] = [];
  const interiorRings: [number, number][][] = [];

  for (const ref of feature.spatialRefs) {
    const spatial = spatialRecords.get(spatialKey(ref.rcnm, ref.rcid));
    if (!spatial) continue;

    const edgeCoords = coordsFromSpatial(spatial, spatialRecords);
    if (ref.ornt === 2) edgeCoords.reverse();

    if (ref.usag === 2) {
      interiorRings.push(closeRing(edgeCoords));
    } else {
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
  return { type: 'Polygon', coordinates: [closeRing(exteriorCoords), ...interiorRings] };
}

function coordsFromSpatial(
  spatial: S101SpatialRecord,
  spatialRecords: Map<number, S101SpatialRecord>
): [number, number][] {
  const intermediate: [number, number][] =
    spatial.coordinates2D.length > 0
      ? spatial.coordinates2D.map(c => [c.lon, c.lat])
      : spatial.coordinates3D.map(c => [c.lon, c.lat]);

  // For CompositeCurves, resolve component curves
  if (spatial.rcnm === S101SpatialType.CompositeCurve && spatial.componentCurves) {
    const allCoords: [number, number][] = [];
    for (const curveRcid of spatial.componentCurves) {
      const curve = spatialRecords.get(spatialKey(S101SpatialType.Curve, curveRcid));
      if (curve) {
        const cc = coordsFromSpatial(curve, spatialRecords);
        if (allCoords.length > 0 && cc.length > 0) {
          const last = allCoords[allCoords.length - 1];
          if (last[0] === cc[0][0] && last[1] === cc[0][1]) cc.shift();
        }
        allCoords.push(...cc);
      }
    }
    return allCoords;
  }

  if (spatial.rcnm !== S101SpatialType.Curve) return intermediate;

  // Resolve curve endpoint nodes (Point records)
  const startNode = spatial.startNodeRcid != null
    ? spatialRecords.get(spatialKey(S101SpatialType.Point, spatial.startNodeRcid)) : undefined;
  const endNode = spatial.endNodeRcid != null
    ? spatialRecords.get(spatialKey(S101SpatialType.Point, spatial.endNodeRcid)) : undefined;

  const coords = [...intermediate];
  const startCoord = startNode?.coordinates2D[0];
  const endCoord = endNode?.coordinates2D[0];
  if (startCoord) coords.unshift([startCoord.lon, startCoord.lat]);
  if (endCoord) coords.push([endCoord.lon, endCoord.lat]);

  return coords;
}

function closeRing(coords: [number, number][]): [number, number][] {
  if (coords.length < 2) return coords;
  const first = coords[0];
  const last = coords[coords.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) {
    return [...coords, first];
  }
  return coords;
}

function buildProperties(feature: S101Feature): Record<string, unknown> {
  const props: Record<string, unknown> = {
    RCID: feature.rcid,
    featureType: feature.featureTypeName,
    featureTypeCode: feature.featureTypeCode,
    PRIM: feature.primitive,
  };

  // Map to S-57 OBJL for S-52 renderer compatibility
  const s57Objl = S101_TO_S57_OBJL.get(feature.featureTypeCode);
  if (s57Objl != null) {
    props.OBJL = s57Objl;
  }

  // Include all simple attributes
  for (const [code, value] of feature.attributes) {
    props[`ATTL_${code}`] = value;
  }

  // Include complex attributes as nested objects
  for (const [code, groups] of feature.complexAttributes) {
    const serialized = groups.map(g => Object.fromEntries(g));
    props[`CATF_${code}`] = serialized;
  }

  if (feature.foid) {
    props.AGEN = feature.foid.agen;
    props.FIDN = feature.foid.fidn;
    props.FIDS = feature.foid.fids;
  }

  // Feature associations
  if (feature.featureAssociations.length > 0) {
    props._featureAssociations = feature.featureAssociations;
  }

  return props;
}
