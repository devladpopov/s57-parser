/**
 * Build script for demo: bundles each demo page (viewer, catalog, Leaflet and
 * MapLibre examples) into a single JS file for the browser. The Pages workflow
 * copies the HTML pages and demo/dist/*.js into the site.
 *
 * The viewer is built as a classic (IIFE) script, not an ES module, so
 * demo/index.html also works when opened straight from disk (file://), where
 * browsers refuse to load module scripts. It is additionally inlined into
 * demo/dist/s57-viewer.html: one self-contained file that can be copied
 * anywhere and opened offline (drag and drop a chart onto it).
 */
import { readFileSync, writeFileSync } from 'node:fs';

const common = { outdir: './demo/dist', target: 'browser', minify: false } as const;

const viewer = await Bun.build({
  ...common,
  entrypoints: ['./demo/viewer.ts'],
  format: 'iife',
  sourcemap: 'none',
});

const pages = await Bun.build({
  ...common,
  entrypoints: ['./demo/catalog.ts', './demo/leaflet-demo.ts', './demo/maplibre-demo.ts'],
  format: 'esm',
  sourcemap: 'none',
});

for (const result of [viewer, pages]) {
  if (!result.success) {
    for (const log of result.logs) console.error(log);
    process.exit(1);
  }
}

// Standalone single-file viewer: index.html with viewer.js inlined.
const html = readFileSync('./demo/index.html', 'utf8');
const js = readFileSync('./demo/dist/viewer.js', 'utf8').replace(/<\/script/gi, '<\\/script');
const tag = '<script defer src="./dist/viewer.js"></script>';
if (!html.includes(tag)) {
  console.error(`demo/index.html must load the viewer with: ${tag}`);
  process.exit(1);
}
writeFileSync('./demo/dist/s57-viewer.html', html.replace(tag, () => `<script>\n${js}\n</script>`));

console.log('Demo built to demo/dist/{viewer,catalog,leaflet-demo,maplibre-demo}.js and s57-viewer.html');
