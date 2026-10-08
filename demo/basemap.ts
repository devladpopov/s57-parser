/**
 * Offline base map of the home waters (Gulf of Finland, Neva, Ladoga): one
 * PMTiles file of OpenStreetMap vector tiles (Protomaps basemap), downloaded
 * once or opened from a file and kept in the origin private file system, then
 * drawn by protomaps-leaflet with no network. Outside its bounds the online
 * OSM tiles show as before.
 */
import L from 'leaflet';
import { leafletLayer } from 'protomaps-leaflet';
import { FileSource, PMTiles } from 'pmtiles';

/** Where the region file is published; relative to the page. */
export const BASEMAP_URL = 'basemap/nw-z14.pmtiles';
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
      layer = leafletLayer({
        url: new PMTiles(new FileSource(file)),
        flavor: 'light',
        lang: ru ? 'ru' : 'en',
        maxDataZoom: 14,
        bounds: BASEMAP_BOUNDS,
        attribution: '&copy; OpenStreetMap contributors, Protomaps',
      }) as unknown as L.Layer;
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
