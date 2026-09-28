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
import { resolveColor, rgbToCSS, type DisplayMode } from '../packages/s52-render/src/colors.js';
import { assembleExchangeSet, unzipExchangeSet, type ChartFile } from './exchange.js';
import { exportGeoJSON, exportPNG, exportPDF } from './export.js';
import { fetchEncZip } from './enc-fetch.js';
import { renderLegend } from './legend.js';

// ─── DOM refs ────────────────────────────────────────────────────────────────

const canvas = document.getElementById('chart') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
const dropzone = document.getElementById('dropzone')!;
const loading = document.getElementById('loading')!;
const info = document.getElementById('info')!;
const stats = document.getElementById('stats')!;
const fileInput = document.getElementById('fileInput') as HTMLInputElement;
const exportBar = document.getElementById('exportBar');
const legendEl = document.getElementById('legend')!;
const legendList = document.getElementById('legendList')!;
const legendBtn = document.getElementById('legendBtn');
const scaleEl = document.getElementById('scale')!;
const scaleText = document.getElementById('scaleText')!;
const scaleBar = document.getElementById('scaleBar')!;
const scaleBarText = document.getElementById('scaleBarText')!;
const scaleWarn = document.getElementById('scaleWarn')!;

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
// Largest allowed zoom: a display scale of 1:1000 (1 cm on screen = 10 m).
// Harbour cells are compiled at 1:5000 and smaller, so closer than this only
// magnifies the same lines.
const MIN_SCALE = 1000;
// Metres per CSS pixel at 96 dpi, and metres per degree of latitude.
const PX_M = 0.0254 / 96;
const DEG_M = 111_320;
const maxZoom = DEG_M / (MIN_SCALE * PX_M);
// Compilation scale of the loaded cell (DSPM CSCL), for the overscale warning.
let cscl: number | undefined;
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
      cscl = undefined;
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
      cscl = dataset.cscl;
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
    legendMode = null;
    if (localStorage.getItem('s57-legend') !== 'off' && window.innerWidth > 900) setLegend(true);
    scaleEl.classList.remove('hidden');
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
  lastFull = { panX, panY, zoom };
  snapshot = null;
  updateScale();
  if (legendOpen && legendMode !== displayMode) {
    renderLegend(legendList, geojson, displayMode);
    legendMode = displayMode;
  }
}

// ─── Legend and scale ───────────────────────────────────────────────────────

let legendOpen = false;
let legendMode: DisplayMode | null = null;

function setLegend(open: boolean) {
  legendOpen = open;
  legendEl.classList.toggle('hidden', !open);
  legendBtn?.classList.toggle('active', open);
  if (open && geojson && legendMode !== displayMode) {
    renderLegend(legendList, geojson, displayMode);
    legendMode = displayMode;
  }
}

function toggleLegend() {
  setLegend(!legendOpen);
  localStorage.setItem('s57-legend', legendOpen ? 'on' : 'off');
}
legendBtn?.addEventListener('click', toggleLegend);
document.getElementById('legendClose')?.addEventListener('click', toggleLegend);

/** Display scale, zoom factor, a scale bar and the overscale warning. */
function updateScale() {
  const mPerPx = DEG_M / zoom;
  const denom = mPerPx / PX_M;
  const rounded = denom >= 100_000 ? Math.round(denom / 1000) * 1000 : Math.round(denom / 10) * 10;
  scaleText.textContent = `1:${rounded.toLocaleString('en-US')} · x${(zoom / minZoom).toFixed(1)}`;
  // Longest 1-2-5 length that fits in 100 px.
  let len = 10 ** Math.floor(Math.log10(mPerPx * 100));
  for (const k of [5, 2]) if (len * k / mPerPx <= 100) { len *= k; break; }
  scaleBar.style.width = `${Math.round(len / mPerPx)}px`;
  scaleBarText.textContent = len >= 1000 ? `${len / 1000} km` : `${len} m`;
  const over = cscl ? cscl / denom : 0;
  scaleWarn.textContent = over > 1.05 ? `overscale x${over.toFixed(1)}` : '';
  scaleWarn.title = over > 1.05 ? `Shown at a larger scale than the chart was compiled for (1:${cscl!.toLocaleString('en-US')})` : '';
}

// ─── Interactive frames ─────────────────────────────────────────────────────
//
// A full S-52 render of a harbour cell takes tens of milliseconds, while the
// mouse fires far more often than that. Rendering on every event queued work
// faster than it could be done and the view lagged by seconds on slower
// machines. During a drag or wheel zoom we therefore redraw at most once per
// animation frame, and only move and scale a copy of the last full render;
// the real render runs once the drag ends or the wheel has been idle briefly.

let lastFull = { panX: 0, panY: 0, zoom: 1 };
let snapshot: HTMLCanvasElement | null = null;
let snapState = lastFull;
let previewFrame = 0;
let fullTimer: ReturnType<typeof setTimeout> | undefined;

function drawPreview() {
  if (!snapshot) {
    snapshot = document.createElement('canvas');
    snapshot.width = canvas.width;
    snapshot.height = canvas.height;
    snapshot.getContext('2d')!.drawImage(canvas, 0, 0);
    snapState = lastFull;
  }
  const dpr = window.devicePixelRatio || 1;
  const s = zoom / snapState.zoom;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = rgbToCSS(resolveColor('NODTA', displayMode));
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.setTransform(s, 0, 0, s, (panX - snapState.panX * s) * dpr, (panY - snapState.panY * s) * dpr);
  ctx.drawImage(snapshot, 0, 0);
  updateScale();
}

function requestPreview() {
  if (!geojson || previewFrame) return;
  previewFrame = requestAnimationFrame(() => {
    previewFrame = 0;
    drawPreview();
  });
}

function requestFullRender(delayMs: number) {
  clearTimeout(fullTimer);
  fullTimer = setTimeout(() => {
    cancelAnimationFrame(previewFrame);
    previewFrame = 0;
    requestAnimationFrame(render);
  }, delayMs);
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
  requestPreview();
});

function endDrag() {
  if (!isDragging) return;
  isDragging = false;
  canvas.style.cursor = 'grab';
  requestFullRender(0);
}
canvas.addEventListener('mouseup', endDrag);
canvas.addEventListener('mouseleave', endDrag);

canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  const rect = canvas.getBoundingClientRect();
  const mx = e.clientX - rect.left;
  const my = e.clientY - rect.top;

  // Clamp zoom-out at minZoom so the chart can never shrink below a screen-fill
  // (beyond that there is only empty no-data space) and zoom-in at maxZoom.
  // Anchor the zoom on the cursor using the factor actually applied after
  // clamping. The step follows deltaY, so a trackpad pinch, which sends many
  // small deltas, zooms as smoothly as a mouse wheel's larger notches.
  const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaMode === 2 ? e.deltaY * 400 : e.deltaY;
  const desired = zoom * Math.exp(-Math.max(-300, Math.min(300, dy)) * 0.001);
  const newZoom = Math.min(Math.max(desired, minZoom), Math.max(maxZoom, minZoom));
  const factor = newZoom / zoom;
  if (factor === 1) return;

  panX = mx - (mx - panX) * factor;
  panY = my - (my - panY) * factor;
  zoom = newZoom;

  requestPreview();
  requestFullRender(150);
}, { passive: false });

// ─── Keyboard shortcuts ─────────────────────────────────────────────────────

document.addEventListener('keydown', (e) => {
  if ((e.key === 'l' || e.key === 'L') && geojson) toggleLegend();
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

// NOAA zips are fetched through CORS proxies with a fallback, see enc-fetch.ts.
async function tryOpenFromQuery() {
  const zipUrl = new URLSearchParams(location.search).get('zip');
  if (!zipUrl) return;
  loading.classList.add('active');
  const name = zipUrl.split('/').pop() ?? 'chart.zip';
  try {
    const buf = await fetchEncZip(zipUrl, text => { info.textContent = text; });
    await loadChartFiles(unzipExchangeSet(buf), name);
    return;
  } catch {
    // Every proxy failed (or a non-NOAA URL without CORS): offer a direct
    // download and the drag-and-drop route.
  }
  loading.classList.remove('active');
  info.textContent = 'Could not fetch the chart. Download the zip, then drop it here.';
  const p = document.querySelector('#dropzone .drop-content p');
  if (p) p.innerHTML =
    `The chart could not be fetched. ` +
    `<a href="${zipUrl}" download style="color:#e94560">Download ${name}</a>, then drop it here.`;
}

tryOpenFromQuery();
