#!/usr/bin/env bash
# Assemble plotter.stadika.ru in _site_plotter/: the landing page at the root
# and the plotter under app/ (the same files as the Android app). Run from the
# repository root after `bun demo/build.ts`. The base map file goes to
# app/basemap/ on the server separately.
set -euo pipefail
bash apps/android-plotter/build-www.sh
out=_site_plotter
mkdir -p "$out/app"
cp landing/index.html landing/shot.png "$out/"
cp -r apps/android-plotter/www/. "$out/app/"
echo "site ready in $out"
