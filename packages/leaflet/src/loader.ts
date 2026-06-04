/**
 * File loading utilities for S-57/S-101 data.
 * Auto-detects format and returns parsed GeoJSON.
 */

import { parseS57 } from '@s57-parser/s57';
import { toGeoJSON as toGeoJSON57 } from '@s57-parser/s57';
import type { GeoJSONFeatureCollection } from '@s57-parser/s57';
import { parseS101, isS101, toGeoJSON as toGeoJSON101 } from '@s57-parser/s101';

export interface LoadResult {
  geojson: GeoJSONFeatureCollection;
  format: 'S-57' | 'S-101';
  name: string;
  featureCount: number;
  spatialCount: number;
  attributes: Map<number, Map<number, string>>;
}

/**
 * Load an S-57 or S-101 file from an ArrayBuffer.
 * Auto-detects format.
 */
export function loadFile(buffer: ArrayBuffer): LoadResult {
  const s101 = isS101(buffer);

  if (s101) {
    const dataset = parseS101(buffer);
    const geojson = toGeoJSON101(dataset) as GeoJSONFeatureCollection;
    const attributes = buildAttributeMap(geojson, dataset.features);
    return {
      geojson,
      format: 'S-101',
      name: dataset.name,
      featureCount: dataset.features.length,
      spatialCount: dataset.spatialRecords.size,
      attributes,
    };
  }

  const dataset = parseS57(buffer);
  const geojson = toGeoJSON57(dataset);
  const attributes = new Map<number, Map<number, string>>();
  for (const feat of dataset.features) {
    attributes.set(feat.rcid, feat.attributes);
  }
  // Attach raw attributes for S-52 conditional symbology
  for (const f of geojson.features) {
    const rcid = f.properties.RCID as number;
    const attrs = attributes.get(rcid);
    if (attrs) f.properties._attributes = attrs;
  }

  return {
    geojson,
    format: 'S-57',
    name: dataset.name,
    featureCount: dataset.features.length,
    spatialCount: dataset.spatialRecords.size,
    attributes,
  };
}

/**
 * Load an S-57/S-101 file from a URL.
 */
export async function loadFromUrl(url: string): Promise<LoadResult> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to fetch ${url}: ${response.status}`);
  const buffer = await response.arrayBuffer();
  return loadFile(buffer);
}

function buildAttributeMap(
  geojson: GeoJSONFeatureCollection,
  features: { rcid: number; attributes: Map<number, string> }[]
): Map<number, Map<number, string>> {
  const map = new Map<number, Map<number, string>>();
  for (const feat of features) {
    map.set(feat.rcid, feat.attributes);
  }
  for (const f of geojson.features) {
    const rcid = f.properties.RCID as number;
    const attrs = map.get(rcid);
    if (attrs) f.properties._attributes = attrs;
  }
  return map;
}
