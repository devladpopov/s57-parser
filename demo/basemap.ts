/**
 * Base maps under the charts, both offline:
 *
 * - the world layer: land, lakes and country borders from Natural Earth,
 *   bundled with the app (demo/world/world.json, see world.ts), borders as
 *   Russia officially sees them;
 * - the detailed map of the home waters (Gulf of Finland, Neva, Ladoga): one
 *   PMTiles file of OpenStreetMap vector tiles (Protomaps basemap), downloaded
 *   once or opened from a file and kept in the origin private file system,
 *   then drawn by protomaps-leaflet over the world layer. Its own country
 *   borders are not drawn, the world layer's show through.
 */
import L from 'leaflet';
import { leafletLayer, type PaintRule } from 'protomaps-leaflet';
import { FileSource, PMTiles } from 'pmtiles';
import { decodeTopology, type Topology } from './world.js';

/** Where the region file is published (absolute: the Android app runs from http://localhost). */
export const BASEMAP_URL = 'https://plotter.stadika.ru/app/basemap/nw-z14.pmtiles';
export const BASEMAP_BOUNDS: L.LatLngBoundsExpression = [[59.6, 27.7], [61.8, 33.1]];

const NAME = 'basemap.pmtiles';
/** Set only when the file was written completely. */
const DONE = 'basemap-ok';

type T = (en: string, ru: string) => string;

const supported = () => typeof navigator.storage?.getDirectory === 'function';

async function storedFile(): Promise<File | null> {
  if (!supported() || localStorage.getItem(DONE) !== '1') return null;
  try {
    const dir = await navigator.storage.getDirectory();
    return await (await dir.getFileHandle(NAME)).getFile();
  } catch {
    return null;
  }
}

/** Writes the stream into the stored file, reporting bytes written. */
async function store(stream: ReadableStream<Uint8Array>, onBytes: (n: number) => void): Promise<void> {
  localStorage.removeItem(DONE);
  const dir = await navigator.storage.getDirectory();
  const out = await (await dir.getFileHandle(NAME, { create: true })).createWritable();
  let n = 0;
  const reader = stream.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      await out.write(value as Uint8Array<ArrayBuffer>);
      onBytes((n += value.length));
    }
    await out.close();
  } catch (err) {
    await out.abort();
    throw err;
  }
  localStorage.setItem(DONE, '1');
}

async function remove(): Promise<void> {
  localStorage.removeItem(DONE);
  const dir = await navigator.storage.getDirectory();
  await dir.removeEntry(NAME).catch(() => {});
}

// Colours of the Protomaps light flavor, so the world layer meets the
// detailed map with no seam. The water is the map background (plotter.html).
const LAND = '#e2dfda';
const WATER = '#80deea';
const BORDER = '#9a9a9a';
/** Country names show from their Natural Earth label zoom up to this one. */
const LABEL_MAX_ZOOM = 7;

/** Draws the bundled world layer (in the app shell, so it works offline). */
export async function initWorld(map: L.Map, ru: boolean): Promise<void> {
  // Under the tile pane (200): the detailed map and the seamarks go over it.
  map.createPane('world').style.zIndex = '150';
  const renderer = L.canvas({ pane: 'world' });
  const topo = await (await fetch('./world/world.json')).json() as Topology;
  const opts = { pane: 'world', renderer, interactive: false };
  const countries = decodeTopology(topo, 'countries');
  L.geoJSON(countries as never, { ...opts, attribution: 'Natural Earth', style: { stroke: false, fillColor: LAND, fillOpacity: 1 } }).addTo(map);
  L.geoJSON(decodeTopology(topo, 'lakes') as never, { ...opts, style: { stroke: false, fillColor: WATER, fillOpacity: 1 } }).addTo(map);
  L.geoJSON(decodeTopology(topo, 'borders') as never, { ...opts, style: { color: BORDER, weight: 1 } }).addTo(map);

  const labels = countries.features.filter((f) => f.properties.ly != null).map(({ properties: p }) => {
    const text = document.createElement('span');
    text.textContent = (ru ? p.ru : p.en) ?? p.en;
    const icon = L.divIcon({ className: 'world-label', html: text, iconSize: null as never });
    return { minZoom: Number(p.mz) || 0, marker: L.marker([p.ly, p.lx], { pane: 'world', icon, interactive: false, keyboard: false }) };
  });
  const showLabels = () => {
    const z = map.getZoom();
    for (const { minZoom, marker } of labels) {
      if (z >= minZoom && z <= LABEL_MAX_ZOOM) marker.addTo(map); else marker.remove();
    }
  };
  map.on('zoomend', showLabels);
  showLabels();
}

/** Country (admin level 2) borders of the detailed map: not ours, so not drawn. */
const isCountryBorder = (props: Record<string, unknown>) =>
  props.kind === 'country' || props.kind === 'disputed' || (typeof props.kind_detail === 'number' && props.kind_detail <= 2);

const withoutCountryBorders = (rules: PaintRule[]): PaintRule[] => rules.map((rule) => rule.dataLayer !== 'boundaries' ? rule : {
  ...rule,
  filter: (z, f) => !isCountryBorder(f.props) && (rule.filter?.(z, f) ?? true),
});

const mb = (n: number) => `${(n / 1048576).toFixed(0)} MB`;

export function initBasemap(map: L.Map, t: T, ru: boolean): void {
  const stateEl = document.getElementById('bm-state')!;
  const getBtn = document.getElementById('bm-get') as HTMLButtonElement;
  const delBtn = document.getElementById('bm-del') as HTMLButtonElement;
  const fileIn = document.getElementById('bm-file') as HTMLInputElement;
  let layer: L.Layer | null = null;

  async function show(): Promise<void> {
    if (layer) map.removeLayer(layer);
    layer = null;
    const file = await storedFile();
    if (file) {
      const detailed = leafletLayer({
        url: new PMTiles(new FileSource(file)),
        flavor: 'light',
        lang: ru ? 'ru' : 'en',
        maxDataZoom: 14,
        bounds: BASEMAP_BOUNDS,
        attribution: '&copy; OpenStreetMap contributors, Protomaps',
      });
      // The flavor's rules are read at drawing time, so they can be swapped here.
      detailed.paintRules = withoutCountryBorders(detailed.paintRules);
      layer = detailed as unknown as L.Layer;
      layer.addTo(map);
    }
    stateEl.textContent = file
      ? `${t('on this device', 'на устройстве')}, ${mb(file.size)}`
      : t('not downloaded', 'не скачана');
    delBtn.hidden = !file;
  }

  async function run(work: () => Promise<void>): Promise<void> {
    getBtn.disabled = true;
    try {
      await work();
      await show();
    } catch (err) {
      await remove();
      await show();
      stateEl.textContent = `${t('Failed', 'Не удалось')}: ${(err as Error).message}`;
    } finally {
      getBtn.disabled = false;
    }
  }

  getBtn.addEventListener('click', () => run(async () => {
    const res = await fetch(BASEMAP_URL);
    if (!res.ok || !res.body) throw new Error(t('the file is not available yet', 'файл пока недоступен'));
    const total = Number(res.headers.get('Content-Length')) || 0;
    await store(res.body, (n) => {
      stateEl.textContent = `${t('downloading', 'скачивается')} ${mb(n)}${total ? ` / ${mb(total)}` : ''}`;
    });
  }));

  fileIn.addEventListener('change', () => {
    const file = fileIn.files?.[0];
    fileIn.value = '';
    if (file) void run(() => store(file.stream(), (n) => { stateEl.textContent = `${t('copying', 'копируется')} ${mb(n)}`; }));
  });

  delBtn.addEventListener('click', async () => {
    await remove();
    await show();
  });

  if (!supported()) {
    stateEl.textContent = t('this browser cannot keep it', 'этот браузер не может её хранить');
    getBtn.disabled = true;
    return;
  }
  void show();
}
