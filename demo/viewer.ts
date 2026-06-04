/**
 * Browser demo: S-57 chart viewer with Canvas2D rendering.
 * Drag-drop an .000 file, see it rendered.
 */

import { parseS57 } from '../packages/s57/src/parser.js';
import { toGeoJSON } from '../packages/s57/src/geojson.js';
import type { GeoJSONFeatureCollection, GeoJSONFeature, GeoJSONGeometry } from '../packages/s57/src/geojson.js';

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

// Returns CSS pixel dimensions of canvas (independent of DPR)
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

// ─── Rendering ───────────────────────────────────────────────────────────────

// Simple colour map by OBJL code (S-57 object classes)
const OBJL_COLORS: Record<number, { fill?: string; stroke?: string }> = {
  // DEPARE (Depth Area)
  42:  { fill: 'rgba(180, 210, 240, 0.5)', stroke: '#6090c0' },
  // DEPCNT (Depth Contour)
  43:  { stroke: '#5080b0' },
  // LNDARE (Land Area)
  71:  { fill: 'rgba(220, 200, 160, 0.7)', stroke: '#b09060' },
  // LNDELV (Land Elevation)
  72:  { stroke: '#a08050' },
  // COALNE (Coastline)
  30:  { stroke: '#604020' },
  // SLCONS (Shoreline Construction)
  122: { stroke: '#806040' },
  // SOUNDG (Sounding)
  129: { fill: '#4080c0' },
  // OBSTRN (Obstruction)
  86:  { fill: '#e04040', stroke: '#c02020' },
  // WRECKS
  159: { fill: '#e04040', stroke: '#c02020' },
  // BUOYS
  14:  { fill: '#40c040' },
  17:  { fill: '#e0e040' },
  // LIGHTS
  75:  { fill: '#e0e040' },
  // M_COVR (Coverage)
  302: { stroke: 'rgba(100, 100, 255, 0.3)' },
  // M_QUAL (Quality of Data)
  308: { stroke: 'rgba(100, 100, 255, 0.2)' },
};

const DEFAULT_COLOR = { stroke: '#556677' };

function render() {
  if (!geojson) return;

  const dpr = window.devicePixelRatio || 1;
  const { w, h } = canvasCSSSize();

  // Resize only if needed (avoids resetting zoom/pan on every redraw)
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  // Background (ocean blue)
  ctx.fillStyle = '#1a2a3e';
  ctx.fillRect(0, 0, w, h);

  // Sort: areas first, then lines, then points (painter's algorithm)
  const sorted = [...geojson.features].sort((a, b) => {
    const primA = (a.properties.PRIM as number) || 0;
    const primB = (b.properties.PRIM as number) || 0;
    return primB - primA; // Area(3) → Line(2) → Point(1)
  });

  for (const feature of sorted) {
    if (!feature.geometry) continue;
    const objl = feature.properties.OBJL as number;
    const colors = OBJL_COLORS[objl] || DEFAULT_COLOR;
    renderGeometry(feature.geometry, colors);
  }
}

function renderGeometry(geom: GeoJSONGeometry, colors: { fill?: string; stroke?: string }) {
  switch (geom.type) {
    case 'Point':
      drawPoint(geom.coordinates, colors);
      break;

    case 'MultiPoint':
      for (const coord of geom.coordinates) drawPoint(coord, colors);
      break;

    case 'LineString':
      drawLine(geom.coordinates, colors);
      break;

    case 'Polygon':
      drawPolygon(geom.coordinates, colors);
      break;

    case 'GeometryCollection':
      for (const g of geom.geometries) renderGeometry(g, colors);
      break;
  }
}

function drawPoint(coord: [number, number], colors: { fill?: string; stroke?: string }) {
  const x = toPixelX(coord[0]);
  const y = toPixelY(coord[1]);
  ctx.beginPath();
  ctx.arc(x, y, 2, 0, Math.PI * 2);
  if (colors.fill) {
    ctx.fillStyle = colors.fill;
    ctx.fill();
  }
  if (colors.stroke) {
    ctx.strokeStyle = colors.stroke;
    ctx.lineWidth = 0.5;
    ctx.stroke();
  }
}

function drawLine(coords: [number, number][], colors: { fill?: string; stroke?: string }) {
  if (coords.length < 2) return;
  ctx.beginPath();
  ctx.moveTo(toPixelX(coords[0][0]), toPixelY(coords[0][1]));
  for (let i = 1; i < coords.length; i++) {
    ctx.lineTo(toPixelX(coords[i][0]), toPixelY(coords[i][1]));
  }
  ctx.strokeStyle = colors.stroke || '#556677';
  ctx.lineWidth = 1;
  ctx.stroke();
}

function drawPolygon(rings: [number, number][][], colors: { fill?: string; stroke?: string }) {
  ctx.beginPath();
  for (const ring of rings) {
    if (ring.length < 3) continue;
    ctx.moveTo(toPixelX(ring[0][0]), toPixelY(ring[0][1]));
    for (let i = 1; i < ring.length; i++) {
      ctx.lineTo(toPixelX(ring[i][0]), toPixelY(ring[i][1]));
    }
    ctx.closePath();
  }
  if (colors.fill) {
    ctx.fillStyle = colors.fill;
    ctx.fill('evenodd');
  }
  if (colors.stroke) {
    ctx.strokeStyle = colors.stroke;
    ctx.lineWidth = 0.5;
    ctx.stroke();
  }
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

// ─── Resize ──────────────────────────────────────────────────────────────────

window.addEventListener('resize', () => {
  if (geojson) {
    resizeCanvas();
    resetView();
    render();
  }
});

// Set initial cursor
canvas.style.cursor = 'grab';
