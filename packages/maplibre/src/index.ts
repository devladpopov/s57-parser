/**
 * @s57-parser/maplibre
 *
 * MapLibre GL JS plugin for rendering S-57/S-101 marine charts.
 *
 * Two integration modes:
 * 1. GeoJSON source: add parsed chart data as a MapLibre GeoJSON source
 *    with S-52-inspired style layers.
 * 2. Custom layer: Canvas2D overlay with full S-52 rendering (higher fidelity).
 *
 * Usage (GeoJSON mode):
 * ```ts
 * import { addChartSource } from '@s57-parser/maplibre';
 * addChartSource(map, buffer, 's57-chart');
 * ```
 *
 * Usage (Canvas overlay mode):
 * ```ts
 * import { S57CanvasLayer } from '@s57-parser/maplibre';
 * const layer = new S57CanvasLayer('s57-overlay', buffer);
 * map.addLayer(layer);
 * ```
 */

export { addChartSource, addChartLayers, removeChart } from './source.js';
export type { ChartSourceOptions } from './source.js';
export { S57CanvasLayer } from './canvas-layer.js';
export type { S57CanvasLayerOptions } from './canvas-layer.js';
