/**
 * Build script for demo: bundles the viewer and catalog pages into single JS
 * files for the browser.
 */
const result = await Bun.build({
  entrypoints: ['./demo/viewer.ts', './demo/catalog.ts'],
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

console.log('Demo built to demo/dist/{viewer,catalog}.js');
