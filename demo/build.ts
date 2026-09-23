/**
 * Build script for demo: bundles the viewer and catalog pages into single JS
 * files for the browser.
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

// In CI, stage the catalog page + its assets into the Pages artifact directory.
// The Pages workflow's "Assemble static site" step only copies the viewer files;
// the catalog files are copied here instead because the deploying token lacks the
// `workflow` scope needed to edit .github/workflows/pages.yml. Guarded by
// GITHUB_ACTIONS so local `bun demo/build.ts` never touches _site.
if (process.env.GITHUB_ACTIONS) {
  const { mkdirSync, copyFileSync } = await import('node:fs');
  mkdirSync('_site/dist', { recursive: true });
  copyFileSync('demo/catalog.html', '_site/catalog.html');
  copyFileSync('demo/catalog-index.json', '_site/catalog-index.json');
  copyFileSync('demo/dist/catalog.js', '_site/dist/catalog.js');
  copyFileSync('demo/leaflet.html', '_site/leaflet.html');
  copyFileSync('demo/dist/leaflet-demo.js', '_site/dist/leaflet-demo.js');
  copyFileSync('demo/maplibre.html', '_site/maplibre.html');
  copyFileSync('demo/dist/maplibre-demo.js', '_site/dist/maplibre-demo.js');
  console.log('CI: staged catalog + leaflet/maplibre demo assets into _site');
}
