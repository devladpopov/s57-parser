/**
 * Workspace helpers shared by publish.ts and pack-check.ts: read the packages,
 * order them by dependency, and swap in a publishable package.json.
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export interface Pkg {
  dir: string;
  name: string;
  version: string;
  deps: string[];
  raw: string;
}

/** Public workspace packages in dependency order (dependencies first). */
export function workspacePackages(root = '.'): Pkg[] {
  const pkgs = new Map<string, Pkg>();
  for (const d of readdirSync(join(root, 'packages'))) {
    const dir = join(root, 'packages', d);
    const raw = readFileSync(join(dir, 'package.json'), 'utf8');
    const json = JSON.parse(raw);
    if (json.private) continue;
    const deps = Object.entries({ ...json.dependencies, ...json.peerDependencies })
      .filter(([, v]) => String(v).startsWith('workspace:'))
      .map(([k]) => k);
    pkgs.set(json.name, { dir, name: json.name, version: json.version, deps, raw });
  }

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
  return order;
}

/**
 * The package.json npm should see: `workspace:` ranges become `^<version>` of
 * the local package (npm does not understand the workspace protocol, and bun
 * resolves it from bun.lock, which can be stale).
 */
export function publishManifest(p: Pkg, all: Pkg[]): Record<string, any> {
  const json = JSON.parse(p.raw);
  for (const field of ['dependencies', 'peerDependencies'] as const) {
    for (const [k, v] of Object.entries(json[field] ?? {})) {
      if (String(v).startsWith('workspace:')) {
        const dep = all.find(q => q.name === k);
        if (!dep) throw new Error(`${p.name}: unknown workspace dependency ${k}`);
        json[field][k] = `^${dep.version}`;
      }
    }
  }
  return json;
}

/** Run fn with the publishable package.json in place, then restore the original. */
export function withPublishManifest<T>(p: Pkg, all: Pkg[], fn: () => T): T {
  const file = join(p.dir, 'package.json');
  writeFileSync(file, JSON.stringify(publishManifest(p, all), null, 2) + '\n');
  try {
    return fn();
  } finally {
    writeFileSync(file, p.raw);
  }
}
