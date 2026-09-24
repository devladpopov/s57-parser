/**
 * Browser demo: S-57/S-101 chart viewer with S-52 symbology rendering.
 * Drag-drop an .000 file, see it rendered with IHO standard colors.
 * Auto-detects S-57 vs S-101 format.
 */

import { parseS57 } from '../packages/s57/src/parser.js';
import { applyUpdate } from '../packages/s57/src/update.js';
import { toGeoJSON as toGeoJSON57 } from '../packages/s57/src/geojson.js';
import type { GeoJSONFeatureCollection, GeoJSONGeometry } from '../packages/s57/src/geojson.js';
import { parseS101, isS101 } from '../packages/s101/src/parser.js';
import { toGeoJSON as toGeoJSON101 } from '../packages/s101/src/geojson.js';
import { renderChart } from '../packages/s52-render/src/renderer.js';
import type { DisplayMode } from '../packages/s52-render/src/colors.js';
import { assembleExchangeSet, unzipExchangeSet, type ChartFile } from './exchange.js';
import { exportGeoJSON, exportPNG, exportPDF } from './export.js';

// ─── DOM refs ────────────────────────────────────────────────────────────────

const canvas = document.getElementById('chart') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
const dropzone = document.getElementById('dropzone')!;
const loading = document.getElementById('loading')!;
const info = document.getElementById('info')!;
const stats = document.getElementById('stats')!;
const fileInput = document.getElementById('fileInput') as HTMLInputElement;
const exportBar = document.getElementById('exportBar');

// ─── State ───────────────────────────────────────────────────────────────────

let geojson: GeoJSONFeatureCollection | null = null;
// Short cell name (e.g. "US5MA12M"), used for export filenames.
let chartStem = 'chart';
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
  const files = e.dataTransfer?.files;
  if (files && files.length) loadFiles(Array.from(files));
});

fileInput.addEventListener('change', () => {
  const files = fileInput.files;
  if (files && files.length) loadFiles(Array.from(files));
});

document.getElementById('sampleBtn')?.addEventListener('click', loadSample);

// ─── Export buttons (GeoJSON / PNG / PDF) ────────────────────────────────────

document.getElementById('exportGeojson')?.addEventListener('click', () => {
  if (geojson) exportGeoJSON(geojson, `${chartStem}.geojson`);
});
document.getElementById('exportPng')?.addEventListener('click', () => {
  exportPNG(canvas, `${chartStem}.png`);
});
document.getElementById('exportPdf')?.addEventListener('click', () => {
  exportPDF(canvas, `${chartStem}.pdf`);
});

// ─── Display mode buttons ────────────────────────────────────────────────────

for (const btn of document.querySelectorAll<HTMLButtonElement>('.mode-btn')) {
  btn.addEventListener('click', () => {
    displayMode = btn.dataset.mode as DisplayMode;
    document.querySelectorAll('.mode-btn').forEach(b => b.classList.toggle('active', b === btn));
    render();
  });
}

function stemOf(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? name;
  return base.replace(/\.(zip|\d{3})$/i, '') || 'chart';
}

// Read dropped/selected files into chart files, expanding any .zip archives
// (NOAA exchange sets) into their contained cell + update files.
async function loadFiles(fileList: File[]) {
  loading.classList.add('active');
  info.textContent = 'Reading files...';
  try {
    const chartFiles: ChartFile[] = [];
    let label = fileList[0]?.name ?? 'chart';
    for (const f of fileList) {
      const buf = await f.arrayBuffer();
      if (/\.zip$/i.test(f.name)) {
        chartFiles.push(...unzipExchangeSet(buf));
        label = f.name;
      } else {
        chartFiles.push({ name: f.name, buffer: buf });
      }
    }
    await loadChartFiles(chartFiles, label);
  } catch (err) {
    info.textContent = `Error: ${(err as Error).message}`;
    console.error(err);
    loading.classList.remove('active');
  }
}

async function loadSample() {
  loading.classList.add('active');
  info.textContent = 'Downloading sample chart...';
  try {
    // Opened from disk (file://), or as the standalone s57-viewer.html without a
    // charts/ folder next to it, the relative chart is unavailable: fall back to
    // the copy on GitHub Pages, which is served with CORS headers.
    const pagesCopy = 'https://devladpopov.github.io/s57-parser/charts/US5MA12M.000';
    let resp = location.protocol === 'file:'
      ? await fetch(pagesCopy)
      : await fetch('./charts/US5MA12M.000').catch(() => null);
    if (!resp || !resp.ok) resp = await fetch(pagesCopy);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const arrayBuffer = await resp.arrayBuffer();
    await loadChartFiles([{ name: 'US5MA12M.000', buffer: arrayBuffer }], 'US5MA12M.000');
  } catch (err) {
    info.textContent = `Error: ${(err as Error).message}`;
    loading.classList.remove('active');
  }
}

// Assemble an exchange set (base cell + ordered updates), parse it, apply any
// S-57 updates, convert to GeoJSON, then frame and render.
async function loadChartFiles(files: ChartFile[], label: string) {
  loading.classList.add('active');
  info.textContent = `Loading ${label}...`;

  try {
    const set = assembleExchangeSet(files);
    if (!set) throw new Error('No base .000 cell found in the dropped files');
    chartStem = stemOf(set.base.name);

    const t0 = performance.now();
    const s101 = isS101(set.base.buffer);
    let datasetName: string;
    let featureCount: number;
    let spatialCount: number;

    if (s101) {
      const dataset = parseS101(set.base.buffer);
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
      let dataset = parseS57(set.base.buffer);
      for (const u of set.updates) dataset = applyUpdate(dataset, u.buffer);
      const t1 = performance.now();
      geojson = toGeoJSON57(dataset);
      const t2 = performance.now();

      for (let i = 0; i < geojson.features.length; i++) {
        const feat = dataset.features.find(f => f.rcid === geojson!.features[i].properties.RCID);
        if (feat) geojson.features[i].properties._attributes = feat.attributes;
      }

      const upd = set.updates.length ? ` +${set.updates.length} update(s)` : '';
      datasetName = `[S-57] ${dataset.name}${upd}`;
      featureCount = dataset.features.length;
      spatialCount = dataset.spatialRecords.size;
      stats.textContent = `Parse: ${Math.round(t1 - t0)}ms | GeoJSON: ${Math.round(t2 - t1)}ms`;
    }

    info.textContent = `${datasetName} | ${featureCount} features | ${spatialCount} spatial records`;

    computeBounds();
    dropzone.classList.add('hidden');
    exportBar?.classList.remove('hidden');
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

// ─── Deep-link: ?zip=<noaa cell url> from the catalog ────────────────────────

// charts.noaa.gov sends no CORS headers, so NOAA cell zips are fetched through
// a small Cloudflare Worker (proxy/noaa-enc-worker.js) that adds them.
const NOAA_ENC = /^https?:\/\/(?:www\.)?charts\.noaa\.gov\/ENCs\/([A-Z0-9]{8})\.zip$/i;
const ENC_PROXY = 'https://s57-noaa-enc.spamaway-api.workers.dev/enc/';

function corsUrl(url: string): string {
  const m = NOAA_ENC.exec(url);
  return m ? `${ENC_PROXY}${m[1].toUpperCase()}.zip` : url;
}

async function tryOpenFromQuery() {
  const zipUrl = new URLSearchParams(location.search).get('zip');
  if (!zipUrl) return;
  loading.classList.add('active');
  info.textContent = 'Fetching chart from NOAA...';
  try {
    const resp = await fetch(corsUrl(zipUrl));
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const buf = await resp.arrayBuffer();
    const name = zipUrl.split('/').pop() ?? 'chart.zip';
    await loadChartFiles(unzipExchangeSet(buf), name);
  } catch {
    // The proxy (or a non-NOAA URL without CORS) failed: fall back to the
    // download-then-drop instruction.
    loading.classList.remove('active');
    info.textContent = 'Could not fetch the chart. Download the zip, then drop it here.';
    const p = document.querySelector('#dropzone .drop-content p');
    const fname = zipUrl.split('/').pop();
    if (p) p.innerHTML =
      `The chart could not be fetched. ` +
      `<a href="${zipUrl}" download style="color:#e94560">Download ${fname}</a>, then drop it here.`;
  }
}

tryOpenFromQuery();
