/**
 * Publish every workspace package whose current version is not on npm yet.
 *
 * Runs in .github/workflows/release.yml with npm Trusted Publishing (OIDC), so
 * no npm token is stored anywhere. Packages are published in dependency order,
 * and `workspace:*` ranges are rewritten to `^<version>` of the local package
 * right before `npm publish` (npm does not understand the workspace protocol,
 * and bun resolves it from bun.lock, which can be stale).
 *
 * Usage: bun scripts/publish.ts [--dry-run]
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

interface Pkg {
  dir: string;
  name: string;
  version: string;
  deps: string[];
  raw: string;
}

const dryRun = process.argv.includes('--dry-run');

const pkgs = new Map<string, Pkg>();
for (const d of readdirSync('packages')) {
  const file = join('packages', d, 'package.json');
  const raw = readFileSync(file, 'utf8');
  const json = JSON.parse(raw);
  if (json.private) continue;
  const deps = Object.entries({ ...json.dependencies, ...json.peerDependencies })
    .filter(([, v]) => String(v).startsWith('workspace:'))
    .map(([k]) => k);
  pkgs.set(json.name, { dir: join('packages', d), name: json.name, version: json.version, deps, raw });
}

// Topological order: a package comes after everything it depends on.
const order: Pkg[] = [];
const seen = new Set<string>();
const visit = (name: string): void => {
  if (seen.has(name)) return;
  seen.add(name);
  const p = pkgs.get(name)!;
  for (const d of p.deps) visit(d);
  order.push(p);
};
for (const name of pkgs.keys()) visit(name);

const published = async (p: Pkg): Promise<boolean> => {
  const res = await fetch(`https://registry.npmjs.org/${p.name}/${p.version}`);
  return res.ok;
};

let count = 0;
for (const p of order) {
  if (await published(p)) {
    console.log(`skip     ${p.name}@${p.version} (already on npm)`);
    continue;
  }
  const json = JSON.parse(p.raw);
  for (const field of ['dependencies', 'peerDependencies'] as const) {
    for (const [k, v] of Object.entries(json[field] ?? {})) {
      if (String(v).startsWith('workspace:')) json[field][k] = `^${pkgs.get(k)!.version}`;
    }
  }
  console.log(`publish  ${p.name}@${p.version}${dryRun ? ' (dry run)' : ''}`);
  if (dryRun) continue;

  const file = join(p.dir, 'package.json');
  writeFileSync(file, JSON.stringify(json, null, 2) + '\n');
  try {
    const proc = Bun.spawnSync(['npm', 'publish', '--access', 'public'], {
      cwd: p.dir,
      stdout: 'inherit',
      stderr: 'inherit',
    });
    if (proc.exitCode !== 0) throw new Error(`npm publish failed for ${p.name}`);
    count++;
  } finally {
    writeFileSync(file, p.raw);
  }
}
console.log(dryRun ? 'dry run done' : `published ${count} package(s)`);
