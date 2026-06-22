/**
 * Browser demo: S-57/S-101 chart viewer with S-52 symbology rendering.
 * Drag-drop an .000 file, see it rendered with IHO standard colors.
 * Auto-detects S-57 vs S-101 format.
 */

import { parseS57 } from '../packages/s57/src/parser.js';
import { toGeoJSON as toGeoJSON57 } from '../packages/s57/src/geojson.js';
import type { GeoJSONFeatureCollection, GeoJSONGeometry } from '../packages/s57/src/geojson.js';
import { parseS101, isS101 } from '../packages/s101/src/parser.js';
import { toGeoJSON as toGeoJSON101 } from '../packages/s101/src/geojson.js';
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
// One representative coordinate per feature, used to auto-frame the view on the
// dense core of the chart instead of on outlier coverage polygons.
let featurePoints: [number, number][] = [];
let panX = 0, panY = 0, zoom = 1;
// Smallest allowed zoom: the level at which the chart's dense core just fills
// the viewport. Zooming out past this would only reveal empty no-data margins,
// so the wheel handler clamps to it.
let minZoom = 0;
// Longitude compression factor (cos of mid-latitude) so 1° lon and 1° lat
// occupy the correct relative width — otherwise the chart is stretched
// horizontally (≈35% too wide at Boston's latitude).
let kLon = 1;
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

document.getElementById('sampleBtn')?.addEventListener('click', loadSample);

// ─── Display mode buttons ────────────────────────────────────────────────────

for (const btn of document.querySelectorAll<HTMLButtonElement>('.mode-btn')) {
  btn.addEventListener('click', () => {
    displayMode = btn.dataset.mode as DisplayMode;
    document.querySelectorAll('.mode-btn').forEach(b => b.classList.toggle('active', b === btn));
    render();
  });
}

async function loadFile(file: File) {
  const arrayBuffer = await file.arrayBuffer();
  await loadBuffer(arrayBuffer, file.name);
}

async function loadSample() {
  loading.classList.add('active');
  info.textContent = 'Downloading sample chart...';
  try {
    const resp = await fetch('./charts/US5MA12M.000');
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const arrayBuffer = await resp.arrayBuffer();
    await loadBuffer(arrayBuffer, 'US5MA12M.000');
  } catch (err) {
    info.textContent = `Error: ${(err as Error).message}`;
    loading.classList.remove('active');
  }
}

async function loadBuffer(arrayBuffer: ArrayBuffer, name: string) {
  loading.classList.add('active');
  info.textContent = `Loading ${name}...`;

  try {
    const t0 = performance.now();

    // Auto-detect S-57 vs S-101 format
    const s101 = isS101(arrayBuffer);
    let datasetName: string;
    let featureCount: number;
    let spatialCount: number;

    if (s101) {
      const dataset = parseS101(arrayBuffer);
      const t1 = performance.now();
      geojson = toGeoJSON101(dataset) as GeoJSONFeatureCollection;
      const t2 = performance.now();

      for (let i = 0; i < geojson.features.length; i++) {
        const feat = dataset.features.find(f => f.rcid === geojson!.features[i].properties.RCID);
        if (feat) geojson.features[i].properties._attributes = feat.attributes;
      }

      datasetName = `[S-101] ${dataset.name}`;
      featureCount = dataset.features.length;
      spatialCount = dataset.spatialRecords.size;
      stats.textContent = `Parse: ${Math.round(t1 - t0)}ms | GeoJSON: ${Math.round(t2 - t1)}ms`;
    } else {
      const dataset = parseS57(arrayBuffer);
      const t1 = performance.now();
      geojson = toGeoJSON57(dataset);
      const t2 = performance.now();

      for (let i = 0; i < geojson.features.length; i++) {
        const feat = dataset.features.find(f => f.rcid === geojson!.features[i].properties.RCID);
        if (feat) geojson.features[i].properties._attributes = feat.attributes;
      }

      datasetName = `[S-57] ${dataset.name}`;
      featureCount = dataset.features.length;
      spatialCount = dataset.spatialRecords.size;
      stats.textContent = `Parse: ${Math.round(t1 - t0)}ms | GeoJSON: ${Math.round(t2 - t1)}ms`;
    }

    info.textContent = `${datasetName} | ${featureCount} features | ${spatialCount} spatial records`;

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

  function firstCoord(c: unknown): [number, number] | null {
    if (!Array.isArray(c)) return null;
    if (typeof c[0] === 'number') return c as [number, number];
    for (const x of c) { const r = firstCoord(x); if (r) return r; }
    return null;
  }

  featurePoints = [];
  for (const f of geojson.features) {
    if (!f.geometry) continue;
    const geom = f.geometry as { coordinates?: unknown; geometries?: GeoJSONGeometry[] };
    if (geom.coordinates) scanCoords(geom.coordinates);
    if (geom.geometries) geom.geometries.forEach(g => {
      if ('coordinates' in g) scanCoords((g as { coordinates: unknown }).coordinates);
    });
    const gc = geom.coordinates
      ?? (geom.geometries?.[0] as { coordinates?: unknown } | undefined)?.coordinates;
    const p = firstCoord(gc);
    if (p) featurePoints.push(p);
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

  const lons = featurePoints.map(p => p[0]).sort((a, b) => a - b);
  const lats = featurePoints.map(p => p[1]).sort((a, b) => a - b);

  if (lons.length < 2) {
    const midLat = (bounds.minLat + bounds.maxLat) / 2;
    kLon = Math.cos((midLat * Math.PI) / 180) || 1;
    const dLon = (bounds.maxLon - bounds.minLon || 1) * kLon;
    const dLat = bounds.maxLat - bounds.minLat || 1;
    minZoom = Math.min(w / dLon, h / dLat);
    zoom = minZoom;
    panX = w / 2 - ((bounds.minLon + bounds.maxLon) / 2) * zoom * kLon;
    panY = h / 2 + midLat * zoom;
    return;
  }

  // Dense core = 5th–95th percentile of feature points. This excludes outlier
  // coverage / meta polygons that span far beyond the real cartographic data
  // and would otherwise shrink the chart to a thin strip.
  const q = (arr: number[], p: number) => arr[Math.floor((arr.length - 1) * p)];
  const loLon = q(lons, 0.05), hiLon = q(lons, 0.95);
  const loLat = q(lats, 0.05), hiLat = q(lats, 0.95);
  const cLon = (loLon + hiLon) / 2, cLat = (loLat + hiLat) / 2;
  kLon = Math.cos((cLat * Math.PI) / 180) || 1;
  const coreLon = (hiLon - loLon) * kLon || 1e-4;
  const coreLat = (hiLat - loLat) || 1e-4;

  // FILL the viewport with the core (crop the longer axis) instead of fitting
  // the whole extent — for a wide coastal chart, fitting leaves the data as a
  // thin strip with empty margins. The fill zoom is also the minimum zoom:
  // zooming out past it only reveals no-data margins, so the wheel handler
  // clamps to it. Centre on the core midpoint so the filled axis has no gaps.
  minZoom = Math.max(w / coreLon, h / coreLat);
  zoom = minZoom;

  panX = w / 2 - cLon * zoom * kLon;
  panY = h / 2 + cLat * zoom;
}

// ─── Coordinate transform (lon/lat → canvas pixels) ─────────────────────────

function toPixelX(lon: number): number { return lon * zoom * kLon + panX; }
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
  const rect = canvas.getBoundingClientRect();
  const mx = e.clientX - rect.left;
  const my = e.clientY - rect.top;

  // Clamp zoom-out at minZoom so the chart can never shrink below a screen-fill;
  // beyond that there is only empty no-data space. Anchor the zoom on the cursor
  // using the factor actually applied after clamping.
  const desired = zoom * (e.deltaY > 0 ? 0.9 : 1.1);
  const newZoom = Math.max(desired, minZoom);
  const factor = newZoom / zoom;
  if (factor === 1) return;

  panX = mx - (mx - panX) * factor;
  panY = my - (my - panY) * factor;
  zoom = newZoom;

  render();
}, { passive: false });

// ─── Keyboard shortcuts ─────────────────────────────────────────────────────

document.addEventListener('keydown', (e) => {
  if (e.key === 'd' || e.key === 'D') {
    // Cycle display modes: DAY → DUSK → NIGHT → DAY
    const modes: DisplayMode[] = ['DAY_BRIGHT', 'DUSK', 'NIGHT'];
    const idx = modes.indexOf(displayMode);
    displayMode = modes[(idx + 1) % modes.length];
    document.querySelectorAll<HTMLButtonElement>('.mode-btn').forEach(b =>
      b.classList.toggle('active', b.dataset.mode === displayMode));
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
