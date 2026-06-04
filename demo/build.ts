/**
 * Build script for demo: bundles viewer.ts into a single JS file for browser.
 */
await Bun.build({
  entrypoints: ['./demo/viewer.ts'],
  outdir: './demo/dist',
  target: 'browser',
  format: 'esm',
  minify: false,
  sourcemap: 'inline',
});

console.log('Demo built to demo/dist/viewer.js');
