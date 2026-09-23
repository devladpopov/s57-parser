# NOAA ENC CORS proxy

`charts.noaa.gov` serves ENC cell zips without an `Access-Control-Allow-Origin`
header, so the demo cannot fetch them from the browser. `noaa-enc-worker.js` is
a Cloudflare Worker that serves only `GET /enc/<CELL>.zip`, fetches
`https://www.charts.noaa.gov/ENCs/<CELL>.zip`, adds CORS headers and caches the
zip for a day.

Live: https://s57-noaa-enc.spamaway-api.workers.dev/enc/US3NY1BE.zip

Deploy (Cloudflare API, no wrangler needed):

```sh
curl -X PUT "https://api.cloudflare.com/client/v4/accounts/$CF_ACCOUNT_ID/workers/scripts/s57-noaa-enc" \
  -H "X-Auth-Email: $CF_EMAIL" -H "X-Auth-Key: $CF_GLOBAL_KEY" \
  -F 'metadata={"main_module":"worker.js","compatibility_date":"2026-09-01"};type=application/json' \
  -F "worker.js=@noaa-enc-worker.js;filename=worker.js;type=application/javascript+module"
```

The viewer (`demo/viewer.ts`, `corsUrl()`) rewrites NOAA zip URLs to this proxy.
