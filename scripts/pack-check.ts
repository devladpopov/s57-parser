/**
 * Check what `npm publish` would ship, without publishing.
 *
 * 1. Packs every workspace package with the same manifest rewrite as
 *    publish.ts (workspace:* -> ^version) into a temporary directory.
 * 2. Checks each tarball: required files present, no tests or build state,
 *    no workspace: ranges, every exports/main/types/bin target included.
 * 3. Installs all tarballs into a fresh project and
 *    - imports them from Node and parses the sample chart,
 *    - runs the `s57` CLI binary,
 *    - type-checks a consumer file with moduleResolution node16 and bundler.
 *
 * Usage: bun scripts/pack-check.ts [--keep]   (run `bun run build` first)
 * Needs network access to the npm registry for third-party dev dependencies.
 */
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { workspacePackages, withPublishManifest, publishManifest } from './workspace.ts';

const root = resolve(import.meta.dir, '..');
const sample = join(root, 'demo/charts/US5MA12M.000');
const keep = process.argv.includes('--keep');
const work = mkdtempSync(join(tmpdir(), 's57-pack-check-'));
const failures: string[] = [];
const fail = (msg: string) => { failures.push(msg); console.error(`  FAIL ${msg}`); };

function sh(cmd: string[], cwd: string): string {
  // On Windows npm, npx and node_modules/.bin entries are .cmd shims, which
  // spawn does not resolve by itself.
  if (process.platform === 'win32') {
    if (/^(npm|npx)$/.test(cmd[0])) cmd = [`${cmd[0]}.cmd`, ...cmd.slice(1)];
    else if (existsSync(resolve(cwd, `${cmd[0]}.cmd`))) cmd = [resolve(cwd, `${cmd[0]}.cmd`), ...cmd.slice(1)];
  }
  const p = Bun.spawnSync(cmd, { cwd, stdout: 'pipe', stderr: 'pipe', env: { ...process.env, npm_config_update_notifier: 'false' } });
  if (p.exitCode !== 0) {
    throw new Error(`${cmd.join(' ')} (in ${cwd}) exited with ${p.exitCode}\n${p.stdout.toString()}${p.stderr.toString()}`);
  }
  return p.stdout.toString();
}

// ─── 1-2. Pack and inspect ──────────────────────────────────────────────────

const pkgs = workspacePackages(root);
const tarballs: string[] = [];
console.log(`Packing ${pkgs.length} packages into ${work}`);

for (const p of pkgs) {
  if (!existsSync(join(p.dir, 'dist'))) throw new Error(`${p.name}: no dist/, run \`bun run build\` first`);
  const manifest = publishManifest(p, pkgs);
  const [info] = withPublishManifest(p, pkgs, () =>
    JSON.parse(sh(['npm', 'pack', '--json', '--pack-destination', work], p.dir)));
  tarballs.push(join(work, info.filename));
  const files = new Set<string>(info.files.map((f: { path: string }) => f.path));
  console.log(`${p.name}@${p.version}: ${files.size} files, ${(info.size / 1024).toFixed(1)} kB packed`);

  const required = ['package.json', 'README.md', 'LICENSE'];
  const targets = [manifest.main, manifest.types, ...Object.values(manifest.bin ?? {}),
    ...Object.values(manifest.exports ?? {}).flatMap(e => typeof e === 'string' ? [e] : Object.values(e as object))];
  for (const t of [...required, ...targets.filter(Boolean).map(t => String(t).replace(/^\.\//, ''))]) {
    if (!files.has(t)) fail(`${p.name}: tarball is missing ${t}`);
  }
  for (const f of files) {
    if (/^(test|tests|node_modules)\/|\.tsbuildinfo$|^tsconfig\.json$|\.test\.ts$/.test(f)) fail(`${p.name}: tarball should not contain ${f}`);
  }
  if (JSON.stringify(manifest).includes('workspace:')) fail(`${p.name}: manifest still has workspace: ranges`);
  if (manifest.version !== p.version) fail(`${p.name}: version mismatch`);
}

// ─── 3. Install into a fresh consumer project ───────────────────────────────

const app = join(work, 'consumer');
mkdirSync(app);
writeFileSync(join(app, 'package.json'), JSON.stringify({ name: 'consumer', private: true, type: 'module' }, null, 2));
console.log('\nInstalling tarballs into a fresh project');
sh(['npm', 'install', '--no-audit', '--no-fund', '--loglevel=error', ...tarballs,
  'typescript@^5.8', '@types/node@^22', 'leaflet@^1.9', '@types/leaflet@^1.9', 'maplibre-gl@^5'], app);

writeFileSync(join(app, 'smoke.mjs'), `
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parse } from '@s57-parser/iso8211';
import { parseS57, toGeoJSON, typedFeatures, filterByClass } from '@s57-parser/s57';
import { isS101 } from '@s57-parser/s101';
import { renderChart, resolveColor } from '@s57-parser/s52-render';
import { addChartSource } from '@s57-parser/maplibre';

const b = readFileSync(process.argv[2]);
const buf = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);

assert.equal(parse(buf).records.length, 7086);
const ds = parseS57(buf);
assert.equal(ds.name, 'US5MA12M.000');
assert.equal(ds.features.length, 2406);
assert.equal(toGeoJSON(ds).features.length, 2406);
assert.equal(filterByClass(typedFeatures(ds.features), 'LIGHTS').length, 41);
assert.equal(isS101(buf), false);
assert.deepEqual(resolveColor('NODTA', 'NIGHT') !== undefined, true);

let calls = 0;
const ctx = new Proxy({}, { get: () => (...a) => { calls++; return { width: 10 }; }, set: () => true });
renderChart(ctx, toGeoJSON(ds), { toPixelX: x => (x + 71.08) * 3000, toPixelY: y => (42.34 - y) * 6000 }, 1000, 800);
assert.ok(calls > 1000, 'renderer drew nothing');

const sources = new Map();
const map = { addSource: (id, s) => sources.set(id, s), addLayer() {} };
addChartSource(map, buf);
assert.equal(sources.get('s57-chart').data.features.length, 2406);
console.log('node smoke test ok (' + process.version + ')');
`);

writeFileSync(join(app, 'consumer.ts'), `
import { parse, type ISO8211File } from '@s57-parser/iso8211';
import { parseS57, toGeoJSON, applyUpdate, typedFeatures, filterByClass, GeomPrimitive, type S57Dataset, type Light } from '@s57-parser/s57';
import { parseS101, isS101, type S101Dataset } from '@s57-parser/s101';
import { renderChart, type DisplayMode, type ViewTransform } from '@s57-parser/s52-render';
import { S57Layer, loadFile, type S57LayerOptions } from '@s57-parser/leaflet';
import { addChartSource, removeChart, S57CanvasLayer } from '@s57-parser/maplibre';
import type { Map as LeafletMap } from 'leaflet';
import type { Map as MaplibreMap } from 'maplibre-gl';

declare const buf: ArrayBuffer;
declare const ctx: CanvasRenderingContext2D;
declare const lmap: LeafletMap;
declare const mmap: MaplibreMap;

const iso: ISO8211File = parse(buf);
const ds: S57Dataset = applyUpdate(parseS57(buf), buf);
const lights: Light[] = filterByClass(typedFeatures(ds.features), 'LIGHTS');
const period: number | undefined = lights[0]?.sigper;
const isArea: boolean = ds.features[0].prim === GeomPrimitive.Area;
const s101: S101Dataset | null = isS101(buf) ? parseS101(buf) : null;
const view: ViewTransform = { toPixelX: lon => lon, toPixelY: lat => lat };
const mode: DisplayMode = 'DUSK';
renderChart(ctx, toGeoJSON(ds), view, 800, 600, { mode, showLabels: false });
// @ts-expect-error not an S-52 palette
renderChart(ctx, toGeoJSON(ds), view, 800, 600, { mode: 'NOON' });
const opts: S57LayerOptions = { mode: 'NIGHT', opacity: 0.8 };
new S57Layer(buf, opts).addTo(lmap);
const format: 'S-57' | 'S-101' = loadFile(buf).format;
addChartSource(mmap, buf, { sourceId: 'enc' });
mmap.addLayer(new S57CanvasLayer('enc-overlay', buf, { mode }));
removeChart(mmap, 'enc');
export { iso, period, isArea, s101, format };
`);

// maplibre-gl's own declarations do not compile under node16 resolution, so
// that run skips library checks; it still verifies that our `exports` resolve
// and that consumer code type-checks. The bundler run checks our .d.ts files.
const tsconfig = (moduleResolution: string, module: string, skipLibCheck: boolean) => JSON.stringify({
  compilerOptions: {
    strict: true, noEmit: true, target: 'ES2022', module, moduleResolution,
    lib: ['ES2022', 'DOM'], types: [], skipLibCheck,
  },
  files: ['consumer.ts'],
}, null, 2);
writeFileSync(join(app, 'tsconfig.node16.json'), tsconfig('node16', 'node16', true));
writeFileSync(join(app, 'tsconfig.bundler.json'), tsconfig('bundler', 'ES2022', false));

const step = (name: string, fn: () => string) => {
  try {
    const out = fn().trim();
    console.log(`  ok   ${name}${out ? `\n${out.replace(/^/gm, '       ')}` : ''}`);
  } catch (e) {
    fail(`${name}\n${(e as Error).message}`);
  }
};
step('import from Node', () => sh(['node', 'smoke.mjs', sample], app));
step('s57 CLI binary', () => {
  const out = sh([join(app, 'node_modules/.bin/s57'), 'info', sample], app);
  if (!out.includes('Dataset         US5MA12M.000')) throw new Error(out);
  return out.split('\n').slice(0, 3).join('\n');
});
step('types (moduleResolution node16)', () => sh(['node_modules/.bin/tsc', '-p', 'tsconfig.node16.json'], app));
step('types (moduleResolution bundler)', () => sh(['node_modules/.bin/tsc', '-p', 'tsconfig.bundler.json'], app));

if (!keep) rmSync(work, { recursive: true, force: true });
else console.log(`\nKept ${work}`);

if (failures.length) {
  console.error(`\npack check failed: ${failures.length} problem(s)`);
  process.exit(1);
}
console.log('\npack check passed');
