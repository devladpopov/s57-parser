#!/usr/bin/env bash
# Assemble the web assets of the Android app from the demo build.
# Run from the repository root after `bun demo/build.ts`.
#
# The app is served from http://localhost (androidScheme http), so the plotter
# can open ws:// connections to a Signal K server on the boat's Wi-Fi, which an
# https page cannot. Leaflet CSS is bundled so the first start works offline.
set -euo pipefail
out=apps/android-plotter/www
mkdir -p "$out/dist"
sed 's#https://unpkg.com/leaflet@1.9.4/dist/leaflet.css#./leaflet.css#' demo/plotter.html > "$out/index.html"
cp "$out/index.html" "$out/plotter.html"
cp demo/dist/plotter.js "$out/dist/"
cp demo/plotter-sw.js demo/plotter.webmanifest demo/plotter-icon.svg demo/noaa-coverage.json "$out/"
cp node_modules/leaflet/dist/leaflet.css "$out/"
echo "www ready: $(ls "$out" | tr '\n' ' ')"
