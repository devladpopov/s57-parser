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

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const statusEl = $('status');
const setStatus = (text: string) => { statusEl.textContent = text; };

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

const map = L.map('map', { zoomControl: false }).setView([42.35, -71.0], 12);
L.control.zoom({ position: 'bottomright' }).addTo(map);
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 18,
  attribution: '&copy; OpenStreetMap contributors',
}).addTo(map);

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
(window as unknown as { plotter: object }).plotter = { registerSource, map };

let mode: DisplayMode = 'DAY_BRIGHT';
const layers = new Map<string, S57Layer>();

// ─── Chart storage (IndexedDB) ──────────────────────────────────────────────

interface StoredChart { name: string; files: ChartFile[]; added: number }

function db(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('s57-plotter', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('charts', { keyPath: 'name' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(m: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const d = await db();
  return new Promise((resolve, reject) => {
    const req = fn(d.transaction('charts', m).objectStore('charts'));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

const saveChart = (c: StoredChart) => tx('readwrite', s => s.put(c));
const deleteChart = (name: string) => tx('readwrite', s => s.delete(name));
const allCharts = () => tx<StoredChart[]>('readonly', s => s.getAll());

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
  return { name: stemOf(set.base.name), layer: new S57Layer(geojson, { mode, opacity: 0.95 }) };
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
const cellOutline = L.polygon([], { color: '#c0f', weight: 2, fill: false, dashArray: '6 4', interactive: false });

function inRing(ring: number[], lon: number, lat: number): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 2; i < ring.length; j = i, i += 2) {
    const [xi, yi, xj, yj] = [ring[i], ring[i + 1], ring[j], ring[j + 1]];
    if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

map.on('click', async (e: L.LeafletMouseEvent) => {
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

const boat = L.circleMarker([0, 0], { radius: 8, color: '#fff', weight: 2, fillColor: '#d00', fillOpacity: 1 });
const heading = L.polyline([], { color: '#d00', weight: 2 });
const track = L.polyline([], { color: '#d00', weight: 2, opacity: 0.6, dashArray: '4 4' });
let follow = true;
let lastTrackPoint: L.LatLng | null = null;

map.on('dragstart', () => { follow = false; $('follow').classList.remove('on'); });
$('follow').addEventListener('click', () => {
  follow = true;
  $('follow').classList.add('on');
  if (map.hasLayer(boat)) map.panTo(boat.getLatLng());
});

const nav = { sog: NaN, cog: NaN, depth: NaN, src: '' };

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
  if (!lastTrackPoint || lastTrackPoint.distanceTo(ll) > 10) { track.addLatLng(ll); lastTrackPoint = ll; }
  if (Number.isFinite(nav.cog)) {
    // Course line: where the boat will be in 6 minutes at the current speed.
    const dist = (Number.isFinite(nav.sog) ? nav.sog : 0) * 1852 / 10;
    const r = nav.cog * Math.PI / 180;
    const dLat = (dist * Math.cos(r)) / 111320;
    const dLon = (dist * Math.sin(r)) / (111320 * Math.cos(lat * Math.PI / 180));
    heading.setLatLngs([ll, [lat + dLat, lon + dLon]]);
  }
  nav.src = src;
  if (follow) map.panTo(ll, { animate: false });
  renderInstruments();
}

// Device GPS
let gpsWatch: number | null = null;
$('gps').addEventListener('click', () => {
  if (gpsWatch !== null) {
    navigator.geolocation.clearWatch(gpsWatch);
    gpsWatch = null;
    $('gps').classList.remove('on');
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
})();

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('./plotter-sw.js').catch(err => console.warn('SW', err));
}
