/**
 * MapLibre GeoJSON source integration for S-57/S-101 charts.
 *
 * Adds parsed chart data as a native MapLibre GeoJSON source
 * with vector rendering layers styled per S-52 conventions.
 */

import type { Map as MaplibreMap } from 'maplibre-gl';
import { parseS57 } from '@s57-parser/s57';
import { toGeoJSON as toGeoJSON57 } from '@s57-parser/s57';
import { parseS101, isS101, toGeoJSON as toGeoJSON101 } from '@s57-parser/s101';
import type { GeoJSONFeatureCollection } from '@s57-parser/s57';

export interface ChartSourceOptions {
  /** Source ID for the GeoJSON source (default: 's57-chart') */
  sourceId?: string;
  /** Whether to add default S-52-inspired style layers (default: true) */
  addLayers?: boolean;
}

/**
 * Add an S-57/S-101 chart as a MapLibre GeoJSON source.
 * Auto-detects format.
 *
 * @returns The source ID used
 */
export function addChartSource(
  map: MaplibreMap,
  buffer: ArrayBuffer,
  options: ChartSourceOptions = {}
): string {
  const sourceId = options.sourceId ?? 's57-chart';
  const geojson = parseToGeoJSON(buffer);

  map.addSource(sourceId, {
    type: 'geojson',
    data: geojson as GeoJSON.FeatureCollection,
  });

  if (options.addLayers !== false) {
    addChartLayers(map, sourceId);
  }

  return sourceId;
}

/**
 * Add S-52-inspired style layers for a chart GeoJSON source.
 */
export function addChartLayers(map: MaplibreMap, sourceId: string): void {
  // Depth areas (polygons)
  map.addLayer({
    id: `${sourceId}-depth-areas`,
    type: 'fill',
    source: sourceId,
    filter: ['==', ['get', 'OBJL'], 42], // DEPARE
    paint: {
      'fill-color': [
        'case',
        ['<', ['to-number', ['get', 'ATTL_87'], 0], 0], '#87c7b3', // DEPIT
        ['<=', ['to-number', ['get', 'ATTL_88'], 100], 5], '#abd9e3', // DEPVS
        ['<=', ['to-number', ['get', 'ATTL_88'], 100], 10], '#b8e2e9', // DEPMS
        ['<=', ['to-number', ['get', 'ATTL_88'], 100], 20], '#c6e7ed', // DEPMD
        '#dbf1f5', // DEPDW
      ],
      'fill-opacity': 0.8,
    },
  });

  // Land areas
  map.addLayer({
    id: `${sourceId}-land`,
    type: 'fill',
    source: sourceId,
    filter: ['==', ['get', 'OBJL'], 71], // LNDARE
    paint: {
      'fill-color': '#c9b99b',
      'fill-opacity': 1,
    },
  });

  // Coastline
  map.addLayer({
    id: `${sourceId}-coastline`,
    type: 'line',
    source: sourceId,
    filter: ['==', ['get', 'OBJL'], 30], // COALNE
    paint: {
      'line-color': '#543823',
      'line-width': 1.5,
    },
  });

  // Depth contours
  map.addLayer({
    id: `${sourceId}-depth-contours`,
    type: 'line',
    source: sourceId,
    filter: ['==', ['get', 'OBJL'], 43], // DEPCNT
    paint: {
      'line-color': '#5080b0',
      'line-width': 0.5,
    },
  });

  // Buoys and beacons (points)
  map.addLayer({
    id: `${sourceId}-navaids`,
    type: 'circle',
    source: sourceId,
    filter: ['in', ['get', 'OBJL'], ['literal', [5, 8, 15, 17, 19, 20]]],
    paint: {
      'circle-radius': 4,
      'circle-color': [
        'case',
        ['in', ['get', 'OBJL'], ['literal', [5, 15]]], '#e6cd32', // Cardinal: yellow
        ['in', ['get', 'OBJL'], ['literal', [17, 8]]], '#008746', // Lateral: green
        ['==', ['get', 'OBJL'], 19], '#c83232', // Safe water: red
        '#e6cd32', // Default: yellow
      ],
      'circle-stroke-width': 1,
      'circle-stroke-color': '#000',
    },
  });

  // Lights
  map.addLayer({
    id: `${sourceId}-lights`,
    type: 'circle',
    source: sourceId,
    filter: ['==', ['get', 'OBJL'], 75], // LIGHTS
    paint: {
      'circle-radius': 5,
      'circle-color': [
        'case',
        ['==', ['get', 'ATTL_75'], '3'], '#ff0000', // Red
        ['==', ['get', 'ATTL_75'], '4'], '#00c800', // Green
        '#ffff00', // Default: yellow (white on chart)
      ],
      'circle-opacity': 0.8,
    },
  });

  // Wrecks and obstructions (danger symbols)
  map.addLayer({
    id: `${sourceId}-dangers`,
    type: 'circle',
    source: sourceId,
    filter: ['in', ['get', 'OBJL'], ['literal', [86, 154, 159]]],
    paint: {
      'circle-radius': 4,
      'circle-color': '#ff0000',
      'circle-stroke-width': 1.5,
      'circle-stroke-color': '#c83232',
    },
  });

  // Restricted areas
  map.addLayer({
    id: `${sourceId}-restricted`,
    type: 'fill',
    source: sourceId,
    filter: ['==', ['get', 'OBJL'], 112], // RESARE
    paint: {
      'fill-color': '#beafD7',
      'fill-opacity': 0.3,
    },
  });
}

/**
 * Remove a chart source and all its layers from the map.
 */
export function removeChart(map: MaplibreMap, sourceId: string = 's57-chart'): void {
  const layerSuffixes = [
    'depth-areas', 'land', 'coastline', 'depth-contours',
    'navaids', 'lights', 'dangers', 'restricted',
  ];
  for (const suffix of layerSuffixes) {
    const layerId = `${sourceId}-${suffix}`;
    if (map.getLayer(layerId)) map.removeLayer(layerId);
  }
  if (map.getSource(sourceId)) map.removeSource(sourceId);
}

function parseToGeoJSON(buffer: ArrayBuffer): GeoJSONFeatureCollection {
  if (isS101(buffer)) {
    const dataset = parseS101(buffer);
    const geojson = toGeoJSON101(dataset) as GeoJSONFeatureCollection;
    for (const f of geojson.features) {
      const feat = dataset.features.find(df => df.rcid === f.properties.RCID);
      if (feat) {
        for (const [k, v] of feat.attributes) f.properties[`ATTL_${k}`] = v;
      }
    }
    return geojson;
  }

  const dataset = parseS57(buffer);
  const geojson = toGeoJSON57(dataset);
  for (const f of geojson.features) {
    const feat = dataset.features.find(df => df.rcid === f.properties.RCID);
    if (feat) {
      for (const [k, v] of feat.attributes) f.properties[`ATTL_${k}`] = v;
    }
  }
  return geojson;
}
