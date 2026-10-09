/**
 * Offline chartplotter prototype.
 *
 * A Leaflet map with S-57 charts on top of OSM. Charts come from the user's own
 * files (.000 + updates, or a NOAA .zip exchange set) or from NOAA by cell name,
 * and are kept in IndexedDB, so after the first visit the page works with no
 * network (the service worker caches the app shell and visited OSM tiles).
 *
 * Other chart data (OpenSeaMap seamarks, later licensed services) comes from
 * chart sources, see sources.ts.
 *
 * Position comes from the device GPS (Geolocation API) or from a Signal K
 * server on the boat (WebSocket delta stream), which also provides depth,
 * speed and course from the boat's instruments.
 */
import L from 'leaflet';
import { S57Layer } from '../packages/leaflet/src/index.js';
import { parseS57 } from '../packages/s57/src/parser.js';
import { applyUpdate } from '../packages/s57/src/update.js';
import { toGeoJSON } from '../packages/s57/src/geojson.js';
import type { S57Dataset } from '../packages/s57/src/types.js';
import type { DisplayMode } from '../packages/s52-render/src/colors.js';
import { assembleExchangeSet, groupExchangeSets, unzipExchangeSet, type ChartFile, type ExchangeSet } from './exchange.js';
import { fetchEncZip } from './enc-fetch.js';
import { allSources, onSourcesChanged, registerSource, type ChartSource } from './sources.js';
import { fromGpx, guide, hoursAt, routeLengthNm, startIndex, toGpx, trackLengthNm, trackToGpx, type TrackPoint, type Waypoint } from './route.js';
import { describeFeature, formatLatLon, isMeta, parseLatLon } from './feature-info.js';
import { initLicense } from './license-ui.js';
import { initBasemap } from './basemap.js';
import { aheadOf, depthSettings, describeHazard, routeHazards, segmentHazards, worstHazard, type ChartFeature } from './depth.js';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
// Status messages pop up as a toast over the map and fade after a while;
// a tap hides them sooner.
const statusEl = $('status');
let statusTimer = 0;
const setStatus = (text: string) => {
  statusEl.textContent = text;
  statusEl.classList.toggle('show', !!text);
  clearTimeout(statusTimer);
  if (text) statusTimer = window.setTimeout(() => statusEl.classList.remove('show'), 4000 + text.length * 40);
};
statusEl.addEventListener('click', () => statusEl.classList.remove('show'));

// Russian or English UI, by the device language.
const RU = navigator.language.toLowerCase().startsWith('ru');
const t = (en: string, ru: string) => (RU ? ru : en);
if (RU) {
  document.documentElement.lang = 'ru';
  for (const el of document.querySelectorAll<HTMLElement>('[data-ru]')) el.textContent = el.dataset.ru!;
}

// ─── Map ────────────────────────────────────────────────────────────────────

// The menu starts folded on phones so the chart gets the screen.
const menu = $<HTMLDetailsElement>('menu-body');
if (window.innerWidth < 700) menu.open = false;
$('menu-btn').addEventListener('click', () => { menu.open = !menu.open; });

const map = L.map('map', { zoomControl: false }).setView([59.95, 29.95], 10);
L.control.zoom({ position: 'bottomright' }).addTo(map);
// Route, track, own ship and warnings go above the chart canvas (overlay pane).
map.createPane('nav').style.zIndex = '450';
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 18,
  attribution: '&copy; OpenStreetMap contributors',
}).addTo(map);
initBasemap(map, t, RU);

// ─── Chart sources ──────────────────────────────────────────────────────────

const sourceLayers = new Map<string, L.Layer>();

function sourceOn(src: ChartSource): boolean {
  const saved = localStorage.getItem(`src:${src.id}`);
  return saved === null ? !!src.defaultOn : saved === '1';
}

function applySource(src: ChartSource, on: boolean) {
  let layer = sourceLayers.get(src.id);
  if (on && !layer) { layer = src.layer(); sourceLayers.set(src.id, layer); }
  if (!layer) return;
  if (on) layer.addTo(map); else layer.remove();
}

function renderSources() {
  const list = $('sources');
  list.innerHTML = '';
  for (const src of allSources()) {
    const label = document.createElement('label');
    label.style.display = 'block';
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.checked = sourceOn(src);
    box.onchange = () => { localStorage.setItem(`src:${src.id}`, box.checked ? '1' : '0'); applySource(src, box.checked); };
    label.append(box, ' ', t(src.title.en, src.title.ru));
    if (src.note) label.title = t(src.note.en, src.note.ru);
    list.appendChild(label);
    applySource(src, box.checked);
  }
}

renderSources();
onSourcesChanged(renderSources);
(window as unknown as { plotter: object }).plotter = { registerSource, map, updatePosition };

let mode: DisplayMode = 'DAY_BRIGHT';
const layers = new Map<string, S57Layer>();

// Safe depth: the boat's draft plus an under-keel margin. Water shallower than
// that is shaded as unsafe, the bold safety contour bounds the safe water, and
// the route and the course ahead are checked against it (see depth.ts).
const draftIn = $<HTMLInputElement>('draft');
const marginIn = $<HTMLInputElement>('margin');
draftIn.value = localStorage.getItem('draft') ?? '1.5';
marginIn.value = localStorage.getItem('margin') ?? '0.5';
const metres = (el: HTMLInputElement) => Math.max(0, Number(el.value) || 0);
let depths = depthSettings(metres(draftIn), metres(marginIn));
for (const el of [draftIn, marginIn]) {
  el.addEventListener('change', () => {
    localStorage.setItem(el.id, el.value);
    depths = depthSettings(metres(draftIn), metres(marginIn));
    for (const l of layers.values()) l.setDepths(depths);
    checkRoute();
    const p = boatPos();
    if (p) checkAhead(p);
  });
}

/** Every feature of the loaded charts, for hazard checks. */
const chartFeatures = (): ChartFeature[] =>
  [...layers.values()].flatMap(l => (l.geojson?.features ?? []) as unknown as ChartFeature[]);

// ─── Chart storage (IndexedDB) ──────────────────────────────────────────────

interface StoredChart { name: string; files: ChartFile[]; added: number }
interface StoredTrack { id: number; points: TrackPoint[] }

let dbOpen: Promise<IDBDatabase> | null = null;
function db(): Promise<IDBDatabase> {
  return dbOpen ??= new Promise((resolve, reject) => {
    const req = indexedDB.open('s57-plotter', 2);
    req.onupgradeneeded = () => {
      const names = req.result.objectStoreNames;
      if (!names.contains('charts')) req.result.createObjectStore('charts', { keyPath: 'name' });
      if (!names.contains('tracks')) req.result.createObjectStore('tracks', { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => { dbOpen = null; reject(req.error); };
  });
}

async function tx<T>(m: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>, store = 'charts'): Promise<T> {
  const d = await db();
  return new Promise((resolve, reject) => {
    const req = fn(d.transaction(store, m).objectStore(store));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

const saveChart = (c: StoredChart) => tx('readwrite', s => s.put(c));
const deleteChart = (name: string) => tx('readwrite', s => s.delete(name));
const allCharts = () => tx<StoredChart[]>('readonly', s => s.getAll());
const saveTrack = (t: StoredTrack) => tx('readwrite', s => s.put(t), 'tracks');
const deleteTrack = (id: number) => tx('readwrite', s => s.delete(id), 'tracks');
const allTracks = () => tx<StoredTrack[]>('readonly', s => s.getAll(), 'tracks');

// ─── Chart loading ──────────────────────────────────────────────────────────

// Text encoding of 8-bit chart text. 'auto' switches to Windows-1251 when the
// names in a cell look like Cyrillic stored as 8-bit bytes (some Russian river
// and sea charts), to Windows-1250 when the text has bytes 0x80-0x9F, which
// are control codes in ISO 8859-1 but Š, Ž and the like in Windows-1250
// (Serbian and Croatian Danube charts), otherwise ISO 8859-1 as the standard says.
const encSelect = $<HTMLSelectElement>('enc');
encSelect.value = localStorage.getItem('enc') ?? 'auto';
encSelect.addEventListener('change', () => { localStorage.setItem('enc', encSelect.value); reloadStored(); });

function looksCp1251(ds: S57Dataset): boolean {
  let high = 0, letters = 0;
  for (const f of ds.features) {
    for (const v of f.attributes.values()) {
      for (let i = 0; i < v.length; i++) {
        const c = v.charCodeAt(i);
        if (c >= 0xc0 && c <= 0xff) high++;
        else if ((c | 32) >= 97 && (c | 32) <= 122) letters++;
      }
    }
  }
  return high > 20 && high > 0.3 * (high + letters);
}

function hasC1Bytes(ds: S57Dataset): boolean {
  for (const f of ds.features) for (const v of f.attributes.values()) if (/[\x80-\x9f]/.test(v)) return true;
  return false;
}

/**
 * Why a cell cannot be read, or null if it looks like plain ISO 8211. An S-63
 * cell is encrypted, so its first bytes are not an ISO 8211 leader ("...3L").
 */
function unreadableReason(set: ExchangeSet): string | null {
  const b = new Uint8Array(set.base.buffer, 0, Math.min(24, set.base.buffer.byteLength));
  const iso8211 = b.length >= 24 && b[6] === 0x4c && b[5] >= 0x31 && b[5] <= 0x33;
  return iso8211 ? null : t(
    'encrypted (S-63) or not an S-57 file: encrypted charts open only with a permit in a certified ECDIS',
    'зашифрована (S-63) или это не S-57: защищённые карты открываются только по пермиту в сертифицированной ЭКНИС');
}

function buildLayer(set: ExchangeSet): { name: string; layer: S57Layer } {
  const choice = encSelect.value;
  const parse = (enc?: string) => {
    let ds = parseS57(set.base.buffer, { textEncoding: enc });
    for (const u of set.updates) ds = applyUpdate(ds, u.buffer);
    return ds;
  };
  let dataset = parse(choice === 'auto' ? undefined : choice);
  if (choice === 'auto') {
    if (looksCp1251(dataset)) dataset = parse('windows-1251');
    else if (hasC1Bytes(dataset)) dataset = parse('windows-1250');
  }
  const geojson = toGeoJSON(dataset);
  const byRcid = new Map(dataset.features.map(f => [f.rcid, f.attributes]));
  for (const f of geojson.features) {
    const attrs = byRcid.get(f.properties.RCID as number);
    if (attrs) f.properties._attributes = attrs;
  }
  return { name: stemOf(set.base.name), layer: new S57Layer(geojson, { mode, opacity: 0.95, depths }) };
}

const stemOf = (path: string) => (path.split(/[\\/]/).pop() ?? path).replace(/\.000$/i, '');

function showChart(set: ExchangeSet, fit: boolean): string {
  const { name, layer } = buildLayer(set);
  layers.get(name)?.remove();
  layers.set(name, layer);
  layer.addTo(map);
  if (fit) fitTo(layer);
  return name;
}

/** Frame the view on a chart's point features (buoys, lights, soundings). */
function fitTo(layer: S57Layer) {
  const pts: [number, number][] = [];
  for (const f of layer.geojson?.features ?? []) {
    if (f.geometry?.type === 'Point') pts.push([f.geometry.coordinates[1], f.geometry.coordinates[0]]);
  }
  if (pts.length) map.fitBounds(L.latLngBounds(pts).pad(0.05));
}

/** Load every cell found in a set of files (one cell, a folder, a USB stick). */
async function addCharts(files: ChartFile[]) {
  const sets = groupExchangeSets(files);
  if (!sets.length) {
    const tx97 = files.some(f => /\.(tx97|tx9|txc)$/i.test(f.name));
    setStatus(tx97
      ? t('These are Transas (TX-97) charts, not S-57. They open only in Transas software.',
          'Это карты Транзас (TX-97), а не S-57. Они открываются только в программах Транзас.')
      : t('No S-57 cells (.000) found in the selected files.', 'В выбранных файлах нет карт S-57 (.000).'));
    return;
  }
  const ok: string[] = [];
  const bad: string[] = [];
  let last: string | null = null;
  for (let i = 0; i < sets.length; i++) {
    const set = sets[i];
    const name = stemOf(set.base.name);
    setStatus(`${t('Loading', 'Загрузка')} ${name} (${i + 1}/${sets.length})...`);
    await new Promise(r => setTimeout(r, 0)); // let the status repaint
    const reason = unreadableReason(set);
    if (reason) { bad.push(`${name}: ${reason}`); continue; }
    try {
      last = showChart(set, false);
      await saveChart({ name, files: [set.base, ...set.updates], added: Date.now() });
      ok.push(name);
    } catch (err) {
      bad.push(`${name}: ${(err as Error).message}`);
    }
  }
  if (last) fitTo(layers.get(last)!);
  const saved = ok.length
    ? `${t('Saved on this device', 'Сохранено на устройстве')}: ${ok.length} (${ok.slice(0, 5).join(', ')}${ok.length > 5 ? '…' : ''})`
    : '';
  setStatus([saved, ...bad.slice(0, 3)].filter(Boolean).join('. ') + (bad.length > 3 ? ` (+${bad.length - 3})` : ''));
  renderChartList();
  checkRoute();
}

async function readPicked(input: HTMLInputElement) {
  const files: ChartFile[] = [];
  for (const f of Array.from(input.files ?? [])) {
    // A chart folder also holds pictures, PDFs and text notes: skip them.
    if (!/\.(zip|\d{3}|tx97|tx9|txc)$/i.test(f.name)) continue;
    const buffer = await f.arrayBuffer();
    const path = (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name;
    if (/\.zip$/i.test(f.name)) files.push(...unzipExchangeSet(buffer));
    else files.push({ name: path, buffer });
  }
  input.value = '';
  await addCharts(files);
}

$<HTMLInputElement>('file').addEventListener('change', e => readPicked(e.target as HTMLInputElement));
$<HTMLInputElement>('folder').addEventListener('change', e => readPicked(e.target as HTMLInputElement));

// Tap on the map: find the NOAA cells that cover the point (coverage polygons
// from the NOAA product catalog, built by scripts/build-noaa-catalog.ts), put
// the most detailed one into the download field and outline it.
type Coverage = [id: string, band: number, rings: number[][]];
let coverage: Promise<Coverage[]> | null = null;
const BANDS = RU
  ? ['', 'обзорная', 'генеральная', 'прибрежная', 'подходная', 'гавань', 'причальная']
  : ['', 'overview', 'general', 'coastal', 'approach', 'harbour', 'berthing'];
const cellOutline = L.polygon([], { pane: 'nav', color: '#c0f', weight: 2, fill: false, dashArray: '6 4', interactive: false });

function inRing(ring: number[], lon: number, lat: number): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 2; i < ring.length; j = i, i += 2) {
    const [xi, yi, xj, yj] = [ring[i], ring[i + 1], ring[j], ring[j + 1]];
    if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

map.on('click', async (e: L.LeafletMouseEvent) => {
  if (editingRoute) { addWaypoint(e.latlng); return; }
  if (showObjectInfo(e.latlng)) return;
  coverage ??= fetch('./noaa-coverage.json').then(r => r.json()).then(j => j.cells as Coverage[]);
  let cells: Coverage[];
  try { cells = await coverage; } catch { coverage = null; return; }
  const lon = L.Util.wrapNum(e.latlng.lng, [-180, 180], true);
  const hits = cells.filter(([, , rings]) => rings.some(r => inRing(r, lon, e.latlng.lat)))
    .sort((a, b) => b[1] - a[1]);
  if (!hits.length) {
    cellOutline.remove();
    setStatus(t('No free NOAA charts here: NOAA covers US waters only.',
      'Здесь нет бесплатных карт NOAA: они есть только для вод США. Карты России платные, их можно открыть из файлов.'));
    return;
  }
  const [id, , rings] = hits[0];
  $<HTMLInputElement>('noaa-cell').value = id;
  cellOutline.setLatLngs(rings.map(r => { const ll: [number, number][] = []; for (let i = 0; i < r.length; i += 2) ll.push([r[i + 1], r[i]]); return ll; })).addTo(map);
  const list = hits.slice(0, 4).map(([c, b]) => `${c} (${BANDS[b] ?? b})`).join(', ');
  setStatus(`${t('NOAA charts here', 'Карты NOAA в этой точке')}: ${list}. ${t('Press Get to download', 'Нажмите «Скачать»')} ${id}.`);
  menu.open = true;
});

// Tap on a chart object: what it is (buoy, light, wreck, depth area...) with
// its attributes. Points within 16 px and lines within 8 px of the tap count,
// then the areas that contain it; meta objects (coverage, data quality) and
// soundings (their depths are not in the GeoJSON yet) are skipped.
type Geo = { type: string; coordinates?: unknown; geometries?: Geo[] };
const bboxes = new WeakMap<object, [number, number, number, number]>();

function bboxOf(g: Geo): [number, number, number, number] {
  let b = bboxes.get(g);
  if (b) return b;
  b = [Infinity, Infinity, -Infinity, -Infinity];
  const walk = (c: unknown): void => {
    if (typeof (c as number[])[0] === 'number') {
      const [x, y] = c as number[];
      if (x < b![0]) b![0] = x; if (y < b![1]) b![1] = y; if (x > b![2]) b![2] = x; if (y > b![3]) b![3] = y;
    } else for (const k of c as unknown[]) walk(k);
  };
  if (g.coordinates) walk(g.coordinates);
  for (const s of g.geometries ?? []) { const sb = bboxOf(s); walk([[sb[0], sb[1]], [sb[2], sb[3]]]); }
  bboxes.set(g, b);
  return b;
}

function segDistPx(p: L.Point, a: L.Point, b: L.Point): number {
  const dx = b.x - a.x, dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const k = len2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2)) : 0;
  return Math.hypot(p.x - a.x - k * dx, p.y - a.y - k * dy);
}

function inPolygon(rings: number[][][], lon: number, lat: number): boolean {
  let inside = false;
  for (const r of rings) {
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
      const [xi, yi] = r[i], [xj, yj] = r[j];
      if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
    }
  }
  return inside;
}

/** Distance in px from the tap to a geometry (0 inside an area), or Infinity. Rank: 0 point, 1 line, 2 area. */
function hitGeometry(g: Geo, tap: L.Point, lon: number, lat: number): [dist: number, rank: number] {
  const px = (c: number[]) => map.latLngToContainerPoint([c[1], c[0]]);
  switch (g.type) {
    case 'Point': return [px(g.coordinates as number[]).distanceTo(tap), 0];
    case 'MultiPoint': return [Math.min(...(g.coordinates as number[][]).map(c => px(c).distanceTo(tap))), 0];
    case 'LineString': {
      const pts = (g.coordinates as number[][]).map(px);
      let d = Infinity;
      for (let i = 1; i < pts.length; i++) d = Math.min(d, segDistPx(tap, pts[i - 1], pts[i]));
      return [d, 1];
    }
    case 'Polygon': return [inPolygon(g.coordinates as number[][][], lon, lat) ? 0 : Infinity, 2];
    case 'GeometryCollection': {
      let best: [number, number] = [Infinity, 3];
      for (const s of g.geometries ?? []) { const h = hitGeometry(s, tap, lon, lat); if (h[0] < best[0] || (h[0] === best[0] && h[1] < best[1])) best = h; }
      return best;
    }
  }
  return [Infinity, 3];
}

function chartObjectsAt(ll: L.LatLng): Record<string, unknown>[] {
  const tap = map.latLngToContainerPoint(ll);
  const degPerPx = (map.getBounds().getNorth() - map.getBounds().getSouth()) / map.getSize().y;
  const tolLat = 16 * degPerPx, tolLon = tolLat / Math.cos(ll.lat * Math.PI / 180);
  const lon = L.Util.wrapNum(ll.lng, [-180, 180], true);
  const hits: { props: Record<string, unknown>; dist: number; rank: number }[] = [];
  for (const layer of layers.values()) {
    for (const f of layer.geojson?.features ?? []) {
      const props = f.properties as Record<string, unknown>;
      const objl = Number(props.OBJL);
      if (!f.geometry || isMeta(objl) || objl === 129) continue;
      const b = bboxOf(f.geometry as Geo);
      if (lon < b[0] - tolLon || lon > b[2] + tolLon || ll.lat < b[1] - tolLat || ll.lat > b[3] + tolLat) continue;
      const [dist, rank] = hitGeometry(f.geometry as Geo, tap, lon, ll.lat);
      if (dist <= (rank === 0 ? 16 : rank === 1 ? 8 : 0)) hits.push({ props, dist, rank });
    }
  }
  hits.sort((a, b) => a.rank - b.rank || a.dist - b.dist);
  return hits.map(h => h.props);
}

const escHtml = (s: string) => s.replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[c]!);

function showObjectInfo(ll: L.LatLng): boolean {
  const objects = chartObjectsAt(ll);
  if (!objects.length) return false;
  const seen = new Set<string>();
  const parts: string[] = [];
  for (const props of objects) {
    const info = describeFeature(props, RU);
    const html = `<b>${escHtml(info.title)}</b>` + (info.rows.length
      ? `<table>${info.rows.map(([k, v]) => `<tr><td style="color:#666;padding-right:6px">${escHtml(k)}</td><td>${escHtml(v)}</td></tr>`).join('')}</table>`
      : '');
    if (seen.has(html)) continue; // the same area split into several features
    seen.add(html);
    parts.push(html);
    if (parts.length >= 6) break;
  }
  const div = document.createElement('div');
  div.innerHTML = parts.join('<hr style="margin:4px 0">') +
    `<p style="margin:6px 0 4px;color:#666">${formatLatLon(ll.lat, ll.lng, RU)}</p>`;
  const add = document.createElement('button');
  add.textContent = t('Add to route', 'В маршрут');
  add.onclick = () => { addWaypoint(ll); map.closePopup(); };
  div.appendChild(add);
  L.popup({ maxWidth: 280, maxHeight: Math.round(window.innerHeight * 0.45), autoPanPaddingTopLeft: [10, 90], autoPanPaddingBottomRight: [10, 110] }).setLatLng(ll).setContent(div).openOn(map);
  return true;
}

$('noaa-go').addEventListener('click', async () => {
  const cell = $<HTMLInputElement>('noaa-cell').value.trim().toUpperCase();
  if (!/^[A-Z0-9]{8}$/.test(cell)) {
    setStatus(t('Cell name is 8 characters, e.g. US5MA12M', 'Имя карты из 8 символов, например US5MA12M'));
    return;
  }
  try {
    const buf = await fetchEncZip(`https://charts.noaa.gov/ENCs/${cell}.zip`, setStatus);
    await addCharts(unzipExchangeSet(buf));
  } catch (err) {
    setStatus((err as Error).message);
  }
});

/** Re-parse every stored chart (after the text encoding setting changes). */
async function reloadStored() {
  for (const c of await allCharts()) {
    const set = assembleExchangeSet(c.files);
    if (!set) continue;
    try { showChart(set, false); } catch (err) { console.warn(c.name, err); }
  }
}

async function renderChartList() {
  const list = $('charts');
  list.innerHTML = '';
  for (const c of await allCharts()) {
    const li = document.createElement('li');
    li.textContent = c.name + ' ';
    const del = document.createElement('button');
    del.textContent = t('remove', 'удалить');
    del.onclick = async () => {
      await deleteChart(c.name);
      layers.get(c.name)?.remove();
      layers.delete(c.name);
      renderChartList();
      checkRoute();
    };
    li.appendChild(del);
    list.appendChild(li);
  }
}

$<HTMLSelectElement>('mode').addEventListener('change', (e) => {
  mode = (e.target as HTMLSelectElement).value as DisplayMode;
  for (const l of layers.values()) l.setMode(mode);
  document.body.dataset.mode = mode;
});

// ─── Own ship: position, track, instruments ────────────────────────────────

const boat = L.circleMarker([0, 0], { pane: 'nav', radius: 8, color: '#fff', weight: 2, fillColor: '#d00', fillOpacity: 1 });
const heading = L.polyline([], { pane: 'nav', color: '#d00', weight: 2 });
const track = L.polyline([], { pane: 'nav', color: '#d00', weight: 2, opacity: 0.6, dashArray: '4 4' });
let follow = true;
let lastTrackPoint: L.LatLng | null = null;

map.on('dragstart', () => { follow = false; $('follow').classList.remove('on'); });
$('follow').addEventListener('click', () => {
  follow = true;
  $('follow').classList.add('on');
  if (map.hasLayer(boat)) map.panTo(boat.getLatLng());
});

const nav = { sog: NaN, cog: NaN, depth: NaN, src: '' };
Object.assign((window as unknown as { plotter: object }).plotter, { nav }); // for tests and Signal K-less simulators

function fmt(v: number, digits: number, unit: string) {
  return Number.isFinite(v) ? `${v.toFixed(digits)} ${unit}` : '–';
}

function renderInstruments() {
  $('sog').textContent = fmt(nav.sog, 1, 'kn');
  $('cog').textContent = fmt(nav.cog, 0, '°');
  $('depth').textContent = fmt(nav.depth, 1, 'm');
  $('src').textContent = nav.src || t('no position', 'нет позиции');
}

function updatePosition(lat: number, lon: number, src: string) {
  const ll = L.latLng(lat, lon);
  if (!map.hasLayer(boat)) { boat.addTo(map); heading.addTo(map); track.addTo(map); map.setView(ll, 14); }
  boat.setLatLng(ll);
  if (!lastTrackPoint || lastTrackPoint.distanceTo(ll) > 10) { track.addLatLng(ll); lastTrackPoint = ll; recordTrack(lat, lon); }
  if (Number.isFinite(nav.cog)) {
    // Course line: where the boat will be in 6 minutes at the current speed.
    const dist = (Number.isFinite(nav.sog) ? nav.sog : 0) * 1852 / 10;
    const r = nav.cog * Math.PI / 180;
    const dLat = (dist * Math.cos(r)) / 111320;
    const dLon = (dist * Math.sin(r)) / (111320 * Math.cos(lat * Math.PI / 180));
    heading.setLatLngs([ll, [lat + dLat, lon + dLon]]);
  }
  checkAhead({ lat, lon });
  nav.src = src;
  if (follow) map.panTo(ll, { animate: false });
  renderInstruments();
  renderGuidance();
}

// Tracks: every position 10 m from the last one goes into the current track,
// saved to IndexedDB every 15 s and when the app goes to the background. A
// gap of 6 hours or the "New track" button starts a new one.
const TRACK_GAP_MS = 6 * 3600e3;
let curTrack: StoredTrack | null = null;
let trackSave: ReturnType<typeof setTimeout> | null = null;
const shownTracks = new Map<number, L.Polyline>();

function recordTrack(lat: number, lon: number) {
  const now = Date.now();
  const last = curTrack?.points.at(-1);
  if (!curTrack || (last && now - last[2] > TRACK_GAP_MS)) {
    curTrack = { id: now, points: [] };
    track.setLatLngs([[lat, lon]]);
  }
  curTrack.points.push([lat, lon, now]);
  trackSave ??= setTimeout(flushTrack, 15000);
}

async function flushTrack() {
  if (trackSave) clearTimeout(trackSave);
  trackSave = null;
  if (curTrack?.points.length) { await saveTrack(curTrack); renderTrackList(); }
}

document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushTrack(); });

const trackTitle = (tr: StoredTrack) => {
  const d = new Date(tr.id);
  const when = d.toLocaleDateString(RU ? 'ru-RU' : undefined, { day: '2-digit', month: '2-digit' }) + ' ' +
    d.toLocaleTimeString(RU ? 'ru-RU' : undefined, { hour: '2-digit', minute: '2-digit' });
  return `${when}, ${trackLengthNm(tr.points).toFixed(1)} ${t('nm', 'миль')}`;
};

let trackListGen = 0;
async function renderTrackList() {
  const gen = ++trackListGen;
  const tracks = (await allTracks()).sort((a, b) => b.id - a.id).slice(0, 20);
  if (gen !== trackListGen) return; // a newer render is on its way
  const list = $('tracks');
  list.innerHTML = '';
  for (const tr of tracks) {
    const li = document.createElement('li');
    li.textContent = trackTitle(tr) + (tr.id === curTrack?.id ? ` (${t('recording', 'пишется')}) ` : ' ');
    const show = document.createElement('button');
    show.textContent = shownTracks.has(tr.id) ? t('hide', 'скрыть') : t('show', 'показать');
    show.onclick = () => {
      const line = shownTracks.get(tr.id);
      if (line) { line.remove(); shownTracks.delete(tr.id); }
      else {
        const pl = L.polyline(tr.points.map(([la, lo]) => [la, lo] as [number, number]), { pane: 'nav', color: '#8a2be2', weight: 3, opacity: 0.8 }).addTo(map);
        shownTracks.set(tr.id, pl);
        if (tr.points.length) map.fitBounds(pl.getBounds().pad(0.1));
      }
      renderTrackList();
    };
    const gpx = document.createElement('button');
    gpx.textContent = 'GPX';
    gpx.onclick = () => download(trackToGpx(tr.points, trackTitle(tr)), `track-${new Date(tr.id).toISOString().slice(0, 16).replace(/[T:]/g, '-')}.gpx`);
    const del = document.createElement('button');
    del.textContent = t('remove', 'удалить');
    del.onclick = async () => {
      if (!confirm(t('Delete this track?', 'Удалить этот трек?'))) return;
      await deleteTrack(tr.id);
      shownTracks.get(tr.id)?.remove();
      shownTracks.delete(tr.id);
      if (tr.id === curTrack?.id) { curTrack = null; track.setLatLngs([]); lastTrackPoint = null; }
      renderTrackList();
    };
    li.append(show, ' ', gpx, ' ', del);
    list.appendChild(li);
  }
  if (!tracks.length) list.textContent = t('none yet: turn on GPS', 'пока нет: включите GPS');
}

function download(text: string, name: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/gpx+xml' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

$('track-new').addEventListener('click', async () => {
  const done = curTrack;
  curTrack = null;
  lastTrackPoint = null;
  track.setLatLngs([]);
  if (trackSave) { clearTimeout(trackSave); trackSave = null; }
  if (done?.points.length) await saveTrack(done);
  renderTrackList();
  setStatus(t('A new track starts with the next position', 'Новый трек начнётся со следующей позиции'));
});

// Device GPS
let gpsWatch: number | null = null;
$('gps').addEventListener('click', () => {
  if (gpsWatch !== null) {
    navigator.geolocation.clearWatch(gpsWatch);
    gpsWatch = null;
    $('gps').classList.remove('on');
    if (nav.src.startsWith('GPS')) { nav.sog = NaN; nav.cog = NaN; nav.src = t('GPS off', 'GPS выключен'); renderInstruments(); }
    return;
  }
  if (!('geolocation' in navigator)) { setStatus(t('No GPS in this browser', 'В этом браузере нет GPS')); return; }
  $('gps').classList.add('on');
  gpsWatch = navigator.geolocation.watchPosition(
    (p) => {
      if (p.coords.speed !== null) nav.sog = p.coords.speed * 3600 / 1852;
      if (p.coords.heading !== null && Number.isFinite(p.coords.heading)) nav.cog = p.coords.heading;
      updatePosition(p.coords.latitude, p.coords.longitude, `GPS ±${Math.round(p.coords.accuracy)} m`);
    },
    (err) => setStatus(`GPS: ${err.message}`),
    { enableHighAccuracy: true, maximumAge: 1000 },
  );
});

// Signal K (boat instruments over Wi-Fi)
let sk: WebSocket | null = null;
const RAD2DEG = 180 / Math.PI;
const MS2KN = 3600 / 1852;

$('sk-go').addEventListener('click', () => {
  if (sk) { sk.close(); sk = null; $('sk-go').textContent = t('Connect', 'Подключить'); return; }
  let host = $<HTMLInputElement>('sk-host').value.trim();
  if (!host) return;
  localStorage.setItem('sk-host', host);
  if (!/^wss?:\/\//.test(host)) host = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${host}`;
  const url = `${host.replace(/\/$/, '')}/signalk/v1/stream?subscribe=self`;
  setStatus(`${t('Connecting to', 'Подключение к')} ${url}...`);
  sk = new WebSocket(url);
  $('sk-go').textContent = t('Disconnect', 'Отключить');
  sk.onopen = () => setStatus(t('Signal K connected', 'Signal K подключён'));
  sk.onclose = () => { setStatus(t('Signal K disconnected', 'Signal K отключён')); sk = null; $('sk-go').textContent = t('Connect', 'Подключить'); };
  sk.onerror = () => setStatus(t('Signal K error: check the address (an https page needs wss://)', 'Ошибка Signal K: проверьте адрес (с https-страницы нужен wss://)'));
  sk.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    for (const upd of msg.updates ?? []) {
      for (const { path, value } of upd.values ?? []) {
        if (path === 'navigation.speedOverGround') nav.sog = value * MS2KN;
        else if (path === 'navigation.courseOverGroundTrue') nav.cog = value * RAD2DEG;
        else if (path === 'environment.depth.belowTransducer' || path === 'environment.depth.belowSurface') nav.depth = value;
        else if (path === 'navigation.position' && value) { updatePosition(value.latitude, value.longitude, 'Signal K'); continue; }
        renderInstruments();
      }
    }
  };
});
$<HTMLInputElement>('sk-host').value = localStorage.getItem('sk-host') ?? '';

// ─── Route and steering ─────────────────────────────────────────────────────
//
// "Route" button: taps on the map add waypoints, a waypoint can be dragged,
// a tap on it removes it. "Go" steers to the next waypoint: distance, bearing,
// cross-track error and arrival time (at the boat's speed, or the planning
// speed before there is one). The route is kept in localStorage.

let route: Waypoint[] = JSON.parse(localStorage.getItem('route') ?? '[]');
let nextWp = Number(localStorage.getItem('route-next') ?? 0);
let editingRoute = false;
let steering = localStorage.getItem('route-nav') === '1';
const routeLine = L.polyline([], { pane: 'nav', color: '#0060c0', weight: 3 });
const steerLine = L.polyline([], { pane: 'nav', color: '#e07000', weight: 3, dashArray: '8 6', interactive: false });
const wpMarkers = L.layerGroup().addTo(map);
routeLine.addTo(map);
const planSpeed = $<HTMLInputElement>('plan-speed');
planSpeed.value = localStorage.getItem('plan-speed') ?? '5';
planSpeed.addEventListener('change', () => { localStorage.setItem('plan-speed', planSpeed.value); renderGuidance(); });

function saveRoute() {
  localStorage.setItem('route', JSON.stringify(route));
  localStorage.setItem('route-next', String(nextWp));
  localStorage.setItem('route-nav', steering ? '1' : '0');
}

const boatPos = (): Waypoint | null => {
  if (!map.hasLayer(boat)) return null;
  const ll = boat.getLatLng();
  return { lat: ll.lat, lon: ll.lng };
};

/** Speed for arrival times: the boat's own when it moves, else the planning speed. */
const etaSpeed = () => (nav.sog > 0.5 ? nav.sog : Number(planSpeed.value));

function fmtHours(h: number): string {
  if (!Number.isFinite(h)) return '–';
  const m = Math.round(h * 60);
  return m < 60 ? `${m} ${t('min', 'мин')}` : `${Math.floor(m / 60)} ${t('h', 'ч')} ${m % 60} ${t('min', 'мин')}`;
}

const clockIn = (h: number) => Number.isFinite(h)
  ? new Date(Date.now() + h * 3600e3).toLocaleTimeString(RU ? 'ru-RU' : undefined, { hour: '2-digit', minute: '2-digit' })
  : '–';

function renderRoute() {
  routeLine.setLatLngs(route.map(w => [w.lat, w.lon]));
  wpMarkers.clearLayers();
  route.forEach((w, i) => {
    const icon = L.divIcon({ className: `wp${steering && i === nextWp ? ' next' : ''}`, html: String(i + 1), iconSize: [22, 22] });
    const m = L.marker([w.lat, w.lon], { icon, draggable: editingRoute, title: w.name ?? `WP${i + 1}` });
    m.on('dragend', () => { const ll = m.getLatLng(); route[i] = { ...route[i], lat: ll.lat, lon: ll.lng }; changed(); });
    m.on('click', () => {
      if (editingRoute) { route.splice(i, 1); if (nextWp > i) nextWp--; }
      else { nextWp = i; steering = true; }
      changed();
    });
    wpMarkers.addLayer(m);
  });
  const len = routeLengthNm(route);
  $('route-info').textContent = route.length
    ? `${route.length} ${t('pts', 'тчк')}, ${len.toFixed(1)} ${t('nm', 'миль')}, ${fmtHours(hoursAt(len, Number(planSpeed.value)))}`
    : t('none, press Route and tap the map', 'нет, нажмите «Маршрут» и ставьте точки на карте');
  $('route-nav').classList.toggle('on', steering);
  $('route-edit').classList.toggle('on', editingRoute);
  checkRoute();
  renderGuidance();
}

// Hazards on the route: red marks where a leg first enters water shallower
// than the safe depth, land, or passes a danger, and a line under the route.
const hazardMarks = L.layerGroup().addTo(map);

function checkRoute() {
  hazardMarks.clearLayers();
  const warn = $('route-warn');
  const legs = route.length > 1 ? routeHazards(route, chartFeatures(), depths.safetyContour) : [];
  warn.textContent = legs.length
    ? `${t('Danger', 'Опасно')}: ` + legs.slice(0, 3).map(({ leg, hazards }) =>
        `${leg + 1}–${leg + 2} ${describeHazard(worstHazard(hazards)!, RU)}${hazards.length > 1 ? ` (+${hazards.length - 1})` : ''}`).join('; ') +
      (legs.length > 3 ? ` (+${legs.length - 3})` : '')
    : '';
  for (const { leg, hazards } of legs) {
    for (const h of hazards.slice(0, 20)) {
      L.circleMarker([h.lat, h.lon], { pane: 'nav', radius: 6, color: '#fff', weight: 2, fillColor: '#c00', fillOpacity: 1 })
        .bindTooltip(`${leg + 1}–${leg + 2}: ${describeHazard(h, RU)}`).addTo(hazardMarks);
    }
  }
}

// The course ahead: 6 minutes at the current speed, at least 0.1 and at most
// 2 miles. A shoal, land or danger on it shows a red banner and turns the
// course line red. Not checked when the boat is (nearly) stopped.
function checkAhead(p: Waypoint) {
  const banner = $('shoal');
  const moving = Number.isFinite(nav.cog) && nav.sog > 0.5;
  const dist = Math.min(2, Math.max(0.1, nav.sog / 10));
  const h = moving ? segmentHazards(p, aheadOf(p, nav.cog, dist), chartFeatures(), depths.safetyContour)[0] : undefined;
  banner.hidden = !h;
  heading.setStyle({ color: h ? '#f00' : '#d00', weight: h ? 4 : 2 });
  if (h) banner.textContent = `${t('Ahead', 'По курсу')} ${h.distNm < 0.01 ? t('here', 'здесь') : `${h.distNm.toFixed(2)} ${t('nm', 'мили')}`}: ${describeHazard(h, RU)}`;
}

function changed() {
  nextWp = Math.max(0, Math.min(nextWp, route.length - 1));
  if (route.length < 1) steering = false;
  saveRoute();
  renderRoute();
}

function addWaypoint(ll: L.LatLng) {
  route.push({ lat: ll.lat, lon: L.Util.wrapNum(ll.lng, [-180, 180], true) });
  changed();
}

function renderGuidance() {
  const panel = $('rnav');
  const p = boatPos();
  panel.hidden = !steering || !route.length;
  if (panel.hidden) { steerLine.remove(); return; }
  if (!p) {
    $('r-wp').textContent = String(nextWp + 1);
    for (const id of ['r-dtw', 'r-btw', 'r-xte', 'r-eta']) $(id).textContent = '–';
    steerLine.remove();
    return;
  }
  const g = guide(route, nextWp, p);
  if (g.next !== nextWp) { nextWp = g.next; saveRoute(); renderRoute(); return; }
  if (g.arrived) {
    steering = false;
    saveRoute();
    renderRoute();
    setStatus(t('Route completed', 'Маршрут пройден'));
    return;
  }
  const wp = route[g.next];
  $('r-wp').textContent = wp.name ?? String(g.next + 1);
  $('r-dtw').textContent = `${g.dtwNm < 1 ? g.dtwNm.toFixed(2) : g.dtwNm.toFixed(1)} ${t('nm', 'миль')}`;
  $('r-btw').textContent = `${Math.round(g.btwDeg)}°`;
  // Right of the track: steer left (L), left of it: steer right (R).
  const side = g.xteNm > 0 ? t('L', 'Л') : t('R', 'П');
  $('r-xte').textContent = Math.abs(g.xteNm) < 0.005 ? '0' : `${Math.abs(g.xteNm).toFixed(2)} ${side}`;
  $('r-xte').title = t('steer to the shown side to get back on track', 'куда подвернуть, чтобы вернуться на линию');
  const sp = etaSpeed();
  $('r-eta').textContent = clockIn(hoursAt(g.remainingNm, sp));
  $('r-eta').title = `${t('next point', 'до точки')} ${fmtHours(hoursAt(g.dtwNm, sp))}, ${t('to the end', 'до конца')} ${fmtHours(hoursAt(g.remainingNm, sp))}`;
  steerLine.setLatLngs([[p.lat, p.lon], [wp.lat, wp.lon]]).addTo(map);
}

$('route-edit').addEventListener('click', () => {
  editingRoute = !editingRoute;
  if (editingRoute) {
    menu.open = false;
    cellOutline.remove();
    setStatus(t('Tap the map to add points. Drag a point to move it, tap it to delete. Press Route again when done.',
      'Нажимайте на карту, чтобы добавить точки. Точку можно перетащить, нажатие на точку удаляет её. Закончили: снова «Маршрут».'));
  } else {
    setStatus(route.length ? $('route-info').textContent! : '');
  }
  renderRoute();
});

$('route-nav').addEventListener('click', () => {
  if (!route.length) { setStatus(t('Put the route points on the map first', 'Сначала поставьте точки маршрута на карте')); return; }
  steering = !steering;
  if (steering) {
    const p = boatPos();
    nextWp = p ? startIndex(route, p) : 0;
    if (!p) {
      setStatus(t('Steering starts when there is a position: press GPS', 'Ведение начнётся, когда будет позиция: нажмите GPS'));
    }
  }
  saveRoute();
  renderRoute();
});

$('route-rev').addEventListener('click', () => { route.reverse(); nextWp = 0; changed(); });

$('route-clear').addEventListener('click', () => {
  if (route.length && !confirm(t('Delete the route?', 'Удалить маршрут?'))) return;
  route = [];
  steering = false;
  changed();
});

$('gpx-out').addEventListener('click', () => {
  if (route.length) download(toGpx(route, t('Route', 'Маршрут')), `route-${new Date().toISOString().slice(0, 10)}.gpx`);
});

// A waypoint typed as coordinates (from a pilot book, a friend, a forum).
$('wp-add').addEventListener('click', () => {
  const input = $<HTMLInputElement>('wp-coord');
  const p = parseLatLon(input.value);
  if (!p) {
    setStatus(t('Could not read the position. Examples: 59 56.316 N 30 18.846 E, 59.9386 30.3141',
      'Не удалось прочитать координаты. Примеры: 59 56.316 С 30 18.846 В или 59.9386 30.3141'));
    return;
  }
  input.value = '';
  addWaypoint(L.latLng(p.lat, p.lon));
  map.panTo([p.lat, p.lon]);
  setStatus(`${t('Point added', 'Точка добавлена')}: ${formatLatLon(p.lat, p.lon, RU)}`);
});

$<HTMLInputElement>('gpx-in').addEventListener('change', async (e) => {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  const pts = fromGpx(await file.text());
  if (!pts.length) { setStatus(t('No route, track or waypoints in this GPX file', 'В этом GPX нет маршрута, трека или точек')); return; }
  route = pts;
  nextWp = 0;
  steering = false;
  changed();
  map.fitBounds(L.latLngBounds(route.map(w => [w.lat, w.lon] as [number, number])).pad(0.1));
  setStatus(`${t('Route loaded', 'Маршрут загружен')}: ${file.name}, ${$('route-info').textContent}`);
});

renderRoute();

// ─── Startup ────────────────────────────────────────────────────────────────

(async () => {
  const stored = await allCharts();
  for (const c of stored) {
    const set = assembleExchangeSet(c.files);
    try { if (set) showChart(set, false); } catch (err) { console.warn(c.name, err); }
  }
  if (stored.length) {
    setStatus(`${t('Charts loaded from this device', 'Карт загружено с устройства')}: ${stored.length}`);
    const first = layers.values().next().value as S57Layer | undefined;
    if (first) fitTo(first);
  } else {
    setStatus(t('No charts yet: open your .000/.zip files or a chart folder, or download a NOAA cell', 'Карт пока нет: откройте файлы .000/.zip или папку с картами (например, с флешки) либо скачайте карту NOAA'));
  }
  renderChartList();
  renderInstruments();
  checkRoute();
  // Keep writing the last track if it was interrupted recently (app restart).
  const recent = (await allTracks()).sort((a, b) => b.id - a.id)[0];
  const last = recent?.points.at(-1);
  if (last && Date.now() - last[2] < TRACK_GAP_MS) {
    curTrack = recent;
    track.setLatLngs(recent.points.map(([la, lo]) => [la, lo] as [number, number])).addTo(map);
  }
  renderTrackList();
})();

// Subscription state; features are not gated on it yet.
initLicense(t);

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('./plotter-sw.js').catch(err => console.warn('SW', err));
}
