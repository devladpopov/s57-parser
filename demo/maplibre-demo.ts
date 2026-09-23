import maplibregl from 'maplibre-gl';
import { addChartSource } from '../packages/maplibre/src/index.js';

const map = new maplibregl.Map({
  container: 'map',
  style: {
    version: 8,
    sources: {
      osm: {
        type: 'raster',
        tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
        tileSize: 256,
        attribution: '&copy; OpenStreetMap contributors',
      },
    },
    layers: [{ id: 'osm', type: 'raster', source: 'osm' }],
  },
  center: [-70.97, 42.315],
  zoom: 13,
});
map.addControl(new maplibregl.NavigationControl());

const status = document.getElementById('status')!;
map.on('load', async () => {
  const buf = await (await fetch('./charts/US5MA12M.000')).arrayBuffer();
  addChartSource(map, buf);
  status.textContent = 'US5MA12M.000 · S-57 · rendered as MapLibre GeoJSON layers';
});
(window as unknown as { map: maplibregl.Map }).map = map;
