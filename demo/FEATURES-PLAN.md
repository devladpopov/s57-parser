# No-code user features: strategic plan (A / B / C)

Goal: turn the developer library into something non-programmers can use directly
in the browser, without changing the "static site on GitHub Pages, zero backend"
constraint. Everything runs client-side. Nothing is positioned as navigation-grade;
this is viewing / inspection / data export only.

## Stage A — Open any NOAA chart, no code

State before: the viewer already drag-drops a single `.000` base cell.

What A adds:
- ZIP exchange-set support. NOAA ships ENCs as `<CELL>.zip` containing
  `ENC_ROOT/<CELL>/<CELL>.000` plus updates `.001`, `.002`, ... A now unzips
  (via fflate), locates the base cell and its update files, and applies them in
  order with the already-existing `applyUpdate()` from `@s57-parser/s57`.
- Multi-file drop. Dropping a `.000` together with loose `.001/.002` files
  assembles and updates them too.

Payoff: a moss-simple "download from NOAA, drop the zip, see the chart" flow.
This is the no-code service the user asked for, and doubles as the best possible
advert for the library. Effort: low. Hosting: none (all client-side).

## Stage B — NOAA chart catalog gallery

A separate static page (`catalog.html`) that lists NOAA ENC cells with metadata
(id, title, scale band, usage, bounding box) from a pre-built `catalog-index.json`.

- Search / filter by id, title, scale band.
- Each row: direct NOAA download link (always works) + "Open in viewer" which
  tries a client fetch of the cell zip and, on CORS failure, falls back to the
  honest "download then drop" tip.
- `scripts/build-noaa-catalog.ts` regenerates / expands the index from NOAA's
  published product catalog when network is available; a curated seed ships so
  the gallery works out of the box.

Payoff: real utility for non-devs (browse and open US charts) and an organic
search-traffic surface (people google specific cells). Effort: medium.
Hosting: none (static index + client fetch).

## Stage C — Export GeoJSON / PNG / PDF

Export toolbar in the viewer:
- GeoJSON: the parsed feature collection is already in memory; download as a blob.
  Directly usable in QGIS / web maps.
- PNG: `canvas.toBlob()` of the current S-52 render.
- PDF: single page embedding the current render as a JPEG (hand-rolled minimal
  PDF writer, no dependency).

Payoff: the "ready-made charts people can download" ask, done honestly (data +
image exports, not navigation charts). Effort: medium. Hosting: none.

## Non-goals / deliberately skipped
- Raster MBTiles tile pyramids: competes with free official NOAA RNC, low
  differentiation, heavy. Skipped.
- Server-side conversion SaaS: ongoing infra + unclear monetisation while the
  same result is achievable fully client-side. Skipped.
