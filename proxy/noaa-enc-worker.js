/**
 * CORS proxy for NOAA ENC exchange sets, used by the s57-parser demo.
 *
 * charts.noaa.gov serves the cell zips without an Access-Control-Allow-Origin
 * header, so a browser page on another origin cannot read them. This worker
 * fetches only https://www.charts.noaa.gov/ENCs/<CELL>.zip, adds CORS headers
 * and caches the response for a day (NOAA republishes cells weekly).
 *
 * Route: GET /enc/<CELL>.zip   e.g. /enc/US3NY1BE.zip
 * Deploy: see proxy/README.md
 */

const CELL = /^\/enc\/([A-Z0-9]{8})\.zip$/;
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
  'Access-Control-Max-Age': '86400',
};

export default {
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('Method not allowed', { status: 405, headers: CORS });
    }

    const url = new URL(request.url);
    const m = CELL.exec(url.pathname);
    if (!m) {
      return new Response('Only /enc/<CELL>.zip for NOAA ENC cells is served here.', {
        status: 404,
        headers: { ...CORS, 'Content-Type': 'text/plain' },
      });
    }

    const cache = caches.default;
    const key = new Request(`https://noaa-enc-cache/${m[1]}.zip`);
    let res = await cache.match(key);
    if (!res) {
      const upstream = await fetch(`https://www.charts.noaa.gov/ENCs/${m[1]}.zip`, {
        cf: { cacheTtl: 86400, cacheEverything: true },
      });
      if (!upstream.ok) {
        return new Response(`NOAA returned ${upstream.status} for ${m[1]}`, {
          status: upstream.status === 404 ? 404 : 502,
          headers: { ...CORS, 'Content-Type': 'text/plain' },
        });
      }
      res = new Response(upstream.body, {
        headers: {
          'Content-Type': 'application/zip',
          'Cache-Control': 'public, max-age=86400',
          'Content-Disposition': `attachment; filename="${m[1]}.zip"`,
        },
      });
      ctx.waitUntil(cache.put(key, res.clone()));
    }

    const headers = new Headers(res.headers);
    for (const [k, v] of Object.entries(CORS)) headers.set(k, v);
    return new Response(request.method === 'HEAD' ? null : res.body, { status: 200, headers });
  },
};
