/**
 * Publish every workspace package whose current version is not on npm yet.
 *
 * Runs in .github/workflows/release.yml with npm Trusted Publishing (OIDC), so
 * no npm token is stored anywhere. Packages are published in dependency order,
 * and `workspace:*` ranges are rewritten to `^<version>` of the local package
 * right before `npm publish` (see scripts/workspace.ts).
 *
 * Usage: bun scripts/publish.ts [--dry-run]
 */
import { workspacePackages, withPublishManifest, type Pkg } from './workspace.ts';

const dryRun = process.argv.includes('--dry-run');
const order = workspacePackages();

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
  console.log(`publish  ${p.name}@${p.version}${dryRun ? ' (dry run)' : ''}`);
  if (dryRun) continue;

  withPublishManifest(p, order, () => {
    // npm is a .cmd shim on Windows, which spawn does not resolve by itself.
    const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
    const proc = Bun.spawnSync([npm, 'publish', '--access', 'public'], {
      cwd: p.dir,
      stdout: 'inherit',
      stderr: 'inherit',
    });
    if (proc.exitCode !== 0) throw new Error(`npm publish failed for ${p.name}`);
  });
  count++;
}
console.log(dryRun ? 'dry run done' : `published ${count} package(s)`);
