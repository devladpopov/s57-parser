/**
 * Build script for demo: bundles each demo page (viewer, catalog, Leaflet and
 * MapLibre examples) into a single JS file for the browser. The Pages workflow
 * copies the HTML pages and demo/dist/*.js into the site.
 */
const result = await Bun.build({
  entrypoints: ['./demo/viewer.ts', './demo/catalog.ts', './demo/leaflet-demo.ts', './demo/maplibre-demo.ts'],
  outdir: './demo/dist',
  target: 'browser',
  format: 'esm',
  minify: false,
  sourcemap: 'inline',
});

if (!result.success) {
  for (const log of result.logs) console.error(log);
  process.exit(1);
}

console.log('Demo built to demo/dist/{viewer,catalog,leaflet-demo,maplibre-demo}.js');

