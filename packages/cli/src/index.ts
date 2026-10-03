#!/usr/bin/env node

/**
 * @s57-parser/cli
 *
 * Command-line tool for inspecting S-57/S-101 cells and ISO 8211 files.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { run } from './cli.js';

const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string };

process.exitCode = run(process.argv.slice(2), {
  readFile: path => readFileSync(path),
  writeFile: (path, data) => writeFileSync(path, data),
  stdout: text => process.stdout.write(text),
  stderr: text => process.stderr.write(text),
  version,
});
