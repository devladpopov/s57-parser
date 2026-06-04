/**
 * Browser demo: S-57 chart viewer with S-52 symbology rendering.
 * Drag-drop an .000 file, see it rendered with IHO standard colors.
 */

import { parseS57 } from '../packages/s57/src/parser.js';
import { toGeoJSON } from '../packages/s57/src/geojson.js';
import type { GeoJSONFeatureCollection, GeoJSONGeometry } from '../packages/s57/src/geojson.js';
import { renderChart } from '../packages/s52-render/src/renderer.js';
import type { DisplayMode } from '../packages/s52-render/src/colors.js';

// ─── DOM refs ────────────────────────────────────────────────────────────────

const canvas = document.getElementById('chart') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
const dropzone = document.getElementById('dropzone')!;
const loading = document.getElementById('loading')!;
const info = document.getElementById('info')!;
const stats = document.getElementById('stats')!;
const fileInput = document.getElementById('fileInput') as HTMLInputElement;

// ─── State ───────────────────────────────────────────────────────────────────

let geojson: GeoJSONFeatureCollection | null = null;
let bounds = { minLon: 0, maxLon: 0, minLat: 0, maxLat: 0 };
let panX = 0, panY = 0, zoom = 1;
let isDragging = false, lastX = 0, lastY = 0;
let displayMode: DisplayMode = 'DAY_BRIGHT';

// ─── File handling ───────────────────────────────────────────────────────────

dropzone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropzone.classList.add('dragover');
});

dropzone.addEventListener('dragleave', () => {
  dropzone.classList.remove('dragover');
});

dropzone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropzone.classList.remove('dragover');
  const file = e.dataTransfer?.files[0];
  if (file) loadFile(file);
});

fileInput.addEventListener('change', () => {
  const file = fileInput.files?.[0];
  if (file) loadFile(file);
});

async function loadFile(file: File) {
  loading.classList.add('active');
  info.textContent = `Loading ${file.name}...`;

  try {
    const arrayBuffer = await file.arrayBuffer();
    const t0 = performance.now();
    const dataset = parseS57(arrayBuffer);
    const t1 = performance.now();
    geojson = toGeoJSON(dataset);
    const t2 = performance.now();

    // Attach raw attributes to GeoJSON properties for S-52 conditional symbology
    for (let i = 0; i < geojson.features.length; i++) {
      const feat = dataset.features.find(f => f.rcid === geojson!.features[i].properties.RCID);
      if (feat) {
        geojson.features[i].properties._attributes = feat.attributes;
      }
    }

    const parseMs = Math.round(t1 - t0);
    const geoMs = Math.round(t2 - t1);

    info.textContent = `${dataset.name} | ${dataset.features.length} features | ${dataset.spatialRecords.size} spatial records`;
    stats.textContent = `Parse: ${parseMs}ms | GeoJSON: ${geoMs}ms`;

    computeBounds();
    dropzone.classList.add('hidden');
    resizeCanvas();
    resetView();
    render();
  } catch (err) {
    info.textContent = `Error: ${(err as Error).message}`;
    console.error(err);
  } finally {
    loading.classList.remove('active');
  }
}

// ─── Geometry bounds ─────────────────────────────────────────────────────────

function computeBounds() {
  if (!geojson) return;
  let minLon = Infinity, maxLon = -Infinity;
  let minLat = Infinity, maxLat = -Infinity;

  function scanCoords(coords: unknown) {
    if (!Array.isArray(coords)) return;
    if (typeof coords[0] === 'number') {
      const [lon, lat] = coords as [number, number];
      if (lon < minLon) minLon = lon;
      if (lon > maxLon) maxLon = lon;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
    } else {
      coords.forEach(scanCoords);
    }
  }

  for (const f of geojson.features) {
    if (!f.geometry) continue;
    const geom = f.geometry as { coordinates?: unknown; geometries?: GeoJSONGeometry[] };
    if (geom.coordinates) scanCoords(geom.coordinates);
    if (geom.geometries) geom.geometries.forEach(g => {
      if ('coordinates' in g) scanCoords((g as { coordinates: unknown }).coordinates);
    });
  }

  bounds = { minLon, maxLon, minLat, maxLat };
}

function canvasCSSSize(): { w: number; h: number } {
  const rect = canvas.getBoundingClientRect();
  return { w: rect.width || 800, h: rect.height || 600 };
}

function resizeCanvas() {
  const dpr = window.devicePixelRatio || 1;
  const { w, h } = canvasCSSSize();
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
}

function resetView() {
  const { w, h } = canvasCSSSize();
  const pad = 0.05;
  const dLon = bounds.maxLon - bounds.minLon || 1;
  const dLat = bounds.maxLat - bounds.minLat || 1;

  const scaleX = w / (dLon * (1 + 2 * pad));
  const scaleY = h / (dLat * (1 + 2 * pad));
  zoom = Math.min(scaleX, scaleY);

  panX = w / 2 - ((bounds.minLon + bounds.maxLon) / 2) * zoom;
  panY = h / 2 + ((bounds.minLat + bounds.maxLat) / 2) * zoom;
}

// ─── Coordinate transform (lon/lat → canvas pixels) ─────────────────────────

function toPixelX(lon: number): number { return lon * zoom + panX; }
function toPixelY(lat: number): number { return -lat * zoom + panY; }

// ─── Rendering via S-52 ─────────────────────────────────────────────────────

function render() {
  if (!geojson) return;

  const dpr = window.devicePixelRatio || 1;
  const { w, h } = canvasCSSSize();

  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  renderChart(ctx, geojson, { toPixelX, toPixelY }, w, h, { mode: displayMode });
}

// ─── Pan & Zoom ──────────────────────────────────────────────────────────────

canvas.addEventListener('mousedown', (e) => {
  isDragging = true;
  lastX = e.clientX;
  lastY = e.clientY;
  canvas.style.cursor = 'grabbing';
});

canvas.addEventListener('mousemove', (e) => {
  if (!isDragging) return;
  panX += e.clientX - lastX;
  panY += e.clientY - lastY;
  lastX = e.clientX;
  lastY = e.clientY;
  render();
});

canvas.addEventListener('mouseup', () => {
  isDragging = false;
  canvas.style.cursor = 'grab';
});

canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  const factor = e.deltaY > 0 ? 0.9 : 1.1;
  const rect = canvas.getBoundingClientRect();
  const mx = e.clientX - rect.left;
  const my = e.clientY - rect.top;

  panX = mx - (mx - panX) * factor;
  panY = my - (my - panY) * factor;
  zoom *= factor;

  render();
}, { passive: false });

// ─── Keyboard shortcuts ─────────────────────────────────────────────────────

document.addEventListener('keydown', (e) => {
  if (e.key === 'd' || e.key === 'D') {
    // Cycle display modes: DAY → DUSK → NIGHT → DAY
    const modes: DisplayMode[] = ['DAY_BRIGHT', 'DUSK', 'NIGHT'];
    const idx = modes.indexOf(displayMode);
    displayMode = modes[(idx + 1) % modes.length];
    render();
  }
});

// ─── Resize ──────────────────────────────────────────────────────────────────

window.addEventListener('resize', () => {
  if (geojson) {
    resizeCanvas();
    resetView();
    render();
  }
});

canvas.style.cursor = 'grab';
