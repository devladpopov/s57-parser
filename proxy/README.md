# NOAA ENC CORS proxies

`charts.noaa.gov` serves ENC cell zips without an `Access-Control-Allow-Origin`
header, so the demo cannot fetch them from the browser. Two proxies with the
same contract, `GET /enc/<CELL>.zip` only, fetch
`https://www.charts.noaa.gov/ENCs/<CELL>.zip`, add CORS headers and cache each
zip for a day:

| Proxy | Where | File |
|---|---|---|
| https://s57-noaa-enc.spamaway-api.workers.dev/enc/US3NY1BE.zip | Cloudflare Worker | `noaa-enc-worker.js` |
| https://enc.studyqa.com/enc/US3NY1BE.zip | nginx on a VPS in St Petersburg, not behind Cloudflare | `nginx-enc-mirror.conf` |

The second exists because some Russian ISPs throttle Cloudflare: a download
stalls after about 16 KB. The viewer (`demo/viewer.ts`, `tryOpenFromQuery()`)
tries the proxies in order, aborts a transfer that makes no progress for 6 s,
moves on to the next one, and finally offers a direct download from NOAA.

Deploy the Worker (Cloudflare API, no wrangler needed):

```sh
curl -X PUT "https://api.cloudflare.com/client/v4/accounts/$CF_ACCOUNT_ID/workers/scripts/s57-noaa-enc" \
  -H "X-Auth-Email: $CF_EMAIL" -H "X-Auth-Key: $CF_GLOBAL_KEY" \
  -F 'metadata={"main_module":"worker.js","compatibility_date":"2026-09-01"};type=application/json' \
  -F "worker.js=@noaa-enc-worker.js;filename=worker.js;type=application/javascript+module"
```

Deploy the nginx mirror: see the header of `nginx-enc-mirror.conf`.
