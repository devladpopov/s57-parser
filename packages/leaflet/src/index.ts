/**
 * @s57-parser/leaflet
 *
 * Leaflet plugin for rendering S-57/S-101 marine charts
 * with S-52 symbology on a Leaflet map.
 *
 * Usage:
 *   import L from 'leaflet';
 *   import { S57Layer } from '@s57-parser/leaflet';
 *
 *   const layer = new S57Layer(arrayBuffer, { mode: 'DAY_BRIGHT' });
 *   layer.addTo(map);
 */

export { S57Layer } from './layer.js';
export type { S57LayerOptions } from './layer.js';
export { loadFile, loadFromUrl } from './loader.js';
