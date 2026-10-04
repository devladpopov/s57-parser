/**
 * Offline chartplotter prototype.
 *
 * A Leaflet map with S-57 charts on top of OSM. Charts come from the user's own
 * files (.000 + updates, or a NOAA .zip exchange set) or from NOAA by cell name,
 * and are kept in IndexedDB, so after the first visit the page works with no
 * network (the service worker caches the app shell and visited OSM tiles).
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
import type { DisplayMode } from '../packages/s52-render/src/colors.js';
import { assembleExchangeSet, unzipExchangeSet, type ChartFile } from './exchange.js';
import { fetchEncZip } from './enc-fetch.js';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const statusEl = $('status');
const setStatus = (t: string) => { statusEl.textContent = t; };

// ─── Map ────────────────────────────────────────────────────────────────────

const map = L.map('map', { zoomControl: false }).setView([42.35, -71.0], 12);
L.control.zoom({ position: 'bottomright' }).addTo(map);
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 18,
  attribution: '&copy; OpenStreetMap contributors',
}).addTo(map);

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

function buildLayer(files: ChartFile[]): { name: string; layer: S57Layer } {
  const set = assembleExchangeSet(files);
  if (!set) throw new Error('no base .000 cell');
  let dataset = parseS57(set.base.buffer);
  for (const u of set.updates) dataset = applyUpdate(dataset, u.buffer);
  const geojson = toGeoJSON(dataset);
  const byRcid = new Map(dataset.features.map(f => [f.rcid, f.attributes]));
  for (const f of geojson.features) {
    const attrs = byRcid.get(f.properties.RCID as number);
    if (attrs) f.properties._attributes = attrs;
  }
  const name = (set.base.name.split(/[\\/]/).pop() ?? set.base.name).replace(/\.000$/i, '');
  return { name, layer: new S57Layer(geojson, { mode, opacity: 0.95 }) };
}

function showChart(files: ChartFile[], fit: boolean): string {
  const { name, layer } = buildLayer(files);
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

async function addCharts(files: ChartFile[], fit = true) {
  try {
    const name = showChart(files, fit);
    await saveChart({ name, files, added: Date.now() });
    setStatus(`${name} saved for offline use`);
    renderChartList();
  } catch (err) {
    setStatus(`Could not load chart: ${(err as Error).message}`);
  }
}

$<HTMLInputElement>('file').addEventListener('change', async (e) => {
  const input = e.target as HTMLInputElement;
  const files: ChartFile[] = [];
  for (const f of Array.from(input.files ?? [])) {
    const buffer = await f.arrayBuffer();
    if (/\.zip$/i.test(f.name)) files.push(...unzipExchangeSet(buffer));
    else files.push({ name: f.name, buffer });
  }
  input.value = '';
  await addCharts(files);
});

$('noaa-go').addEventListener('click', async () => {
  const cell = $<HTMLInputElement>('noaa-cell').value.trim().toUpperCase();
  if (!/^[A-Z0-9]{8}$/.test(cell)) { setStatus('Cell name is 8 characters, e.g. US5MA12M'); return; }
  try {
    const buf = await fetchEncZip(`https://charts.noaa.gov/ENCs/${cell}.zip`, setStatus);
    await addCharts(unzipExchangeSet(buf));
  } catch (err) {
    setStatus((err as Error).message);
  }
});

async function renderChartList() {
  const list = $('charts');
  list.innerHTML = '';
  for (const c of await allCharts()) {
    const li = document.createElement('li');
    li.textContent = c.name + ' ';
    const del = document.createElement('button');
    del.textContent = 'remove';
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
  $('src').textContent = nav.src || 'no position';
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
  if (!('geolocation' in navigator)) { setStatus('No GPS in this browser'); return; }
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
  if (sk) { sk.close(); sk = null; $('sk-go').textContent = 'Connect'; return; }
  let host = $<HTMLInputElement>('sk-host').value.trim();
  if (!host) return;
  localStorage.setItem('sk-host', host);
  if (!/^wss?:\/\//.test(host)) host = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${host}`;
  const url = `${host.replace(/\/$/, '')}/signalk/v1/stream?subscribe=self`;
  setStatus(`Connecting to ${url}...`);
  sk = new WebSocket(url);
  $('sk-go').textContent = 'Disconnect';
  sk.onopen = () => setStatus('Signal K connected');
  sk.onclose = () => { setStatus('Signal K disconnected'); sk = null; $('sk-go').textContent = 'Connect'; };
  sk.onerror = () => setStatus('Signal K error: check the address (an https page needs wss://)');
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
    try { showChart(c.files, false); } catch (err) { console.warn(c.name, err); }
  }
  if (stored.length) {
    setStatus(`${stored.length} chart(s) loaded from this device`);
    const first = layers.values().next().value as S57Layer | undefined;
    if (first) fitTo(first);
  } else {
    setStatus('No charts yet: open your .000/.zip files or download a NOAA cell');
  }
  renderChartList();
  renderInstruments();
})();

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('./plotter-sw.js').catch(err => console.warn('SW', err));
}
