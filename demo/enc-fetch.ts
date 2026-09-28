/**
 * Fetching NOAA ENC cell zips from the browser.
 *
 * charts.noaa.gov sends no CORS headers, so NOAA cell zips are fetched through
 * a CORS proxy. There are two with the same /enc/<CELL>.zip contract:
 * a Cloudflare Worker (proxy/noaa-enc-worker.js) and an nginx mirror on a plain
 * VPS (proxy/nginx-enc-mirror.conf). Some Russian ISPs throttle Cloudflare, and
 * NOAA itself, so a download stalls after about 16 KB; when a transfer stops
 * making progress we move on to the next proxy.
 */

const NOAA_ENC = /^https?:\/\/(?:www\.)?charts\.noaa\.gov\/ENCs\/([A-Z0-9]{8})\.zip$/i;
const ENC_PROXIES = [
  'https://s57-noaa-enc.spamaway-api.workers.dev/enc/',
  'https://enc.studyqa.com/enc/',
];
const STALL_MS = 6000;

function candidateUrls(url: string): string[] {
  const m = NOAA_ENC.exec(url);
  return m ? ENC_PROXIES.map(base => `${base}${m[1].toUpperCase()}.zip`) : [url];
}

/** Fetch a URL, aborting if no bytes arrive for STALL_MS. Reports progress. */
async function fetchWithStallTimeout(url: string, onProgress: (bytes: number) => void): Promise<ArrayBuffer> {
  const ctrl = new AbortController();
  let timer = setTimeout(() => ctrl.abort(), STALL_MS);
  const kick = () => { clearTimeout(timer); timer = setTimeout(() => ctrl.abort(), STALL_MS); };
  try {
    const resp = await fetch(url, { signal: ctrl.signal });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    if (!resp.body) return await resp.arrayBuffer();
    const reader = resp.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      total += value.length;
      onProgress(total);
      kick();
    }
    const out = new Uint8Array(total);
    let off = 0;
    for (const c of chunks) { out.set(c, off); off += c.length; }
    return out.buffer;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Fetch a cell zip, trying each proxy in turn. `onStatus` gets a short progress
 * line. Throws if every route failed.
 */
export async function fetchEncZip(url: string, onStatus: (text: string) => void): Promise<ArrayBuffer> {
  const name = url.split('/').pop() ?? 'chart.zip';
  const urls = candidateUrls(url);
  for (let i = 0; i < urls.length; i++) {
    const via = urls.length > 1 ? ` (mirror ${i + 1}/${urls.length})` : '';
    onStatus(`Fetching ${name}${via}...`);
    try {
      return await fetchWithStallTimeout(urls[i], bytes => {
        onStatus(`Fetching ${name}${via}: ${Math.round(bytes / 1024)} KB`);
      });
    } catch (err) {
      console.warn(`Chart fetch failed via ${urls[i]}:`, err);
    }
  }
  throw new Error(`Could not fetch ${name}`);
}
