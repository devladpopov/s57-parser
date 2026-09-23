import L from 'leaflet';
import { S57Layer } from '../packages/leaflet/src/index.js';

const map = L.map('map');
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 18,
  attribution: '&copy; OpenStreetMap contributors',
}).addTo(map);

const status = document.getElementById('status')!;
const buf = await (await fetch('./charts/US5MA12M.000')).arrayBuffer();
const layer = new S57Layer(buf, { mode: 'DAY_BRIGHT', opacity: 0.9 });

// Frame the view on the median navigation aid (buoys, lights, beacons): they
// sit in the dense core of the harbour, whereas area features can run far
// beyond it and give a bounding box that is mostly empty.
const pts = (layer.geojson?.features ?? [])
  .filter((f) => f.geometry?.type === 'Point')
  .map((f) => f.geometry!.coordinates as number[]);
const median = (a: number[]): number => a.sort((x, y) => x - y)[Math.floor(a.length / 2)];
map.setView([median(pts.map((p) => p[1])), median(pts.map((p) => p[0]))], 14);
layer.addTo(map);
status.textContent = `${layer.name} · ${layer.format} · ${layer.geojson?.features.length} features`;
(window as unknown as { s57Layer: S57Layer }).s57Layer = layer;
