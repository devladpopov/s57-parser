/**
 * Command implementations, kept free of process globals so they can be tested.
 */

import { parse as parseISO8211 } from '@s57-parser/iso8211';
import type { ISO8211Field } from '@s57-parser/iso8211';
import { parseS57, applyUpdate, toGeoJSON, GeomPrimitive, SpatialType } from '@s57-parser/s57';
import type { S57Dataset } from '@s57-parser/s57';
import { parseS101, isS101, toGeoJSON as toGeoJSON101 } from '@s57-parser/s101';
import { OBJL } from '@s57-parser/s52-render';

export interface CliIO {
  readFile(path: string): Uint8Array;
  writeFile(path: string, data: string): void;
  stdout(text: string): void;
  stderr(text: string): void;
  version: string;
}

export const USAGE = `Usage: s57 <command> [options]

Commands:
  info <cell.000> [update.001 ...]      Summary: dataset, scale, extent, object classes
  geojson <cell.000> [update.001 ...]   Convert to GeoJSON (stdout, or -o <file>)
  dump <file> [--limit N]               List ISO 8211 records and decoded fields

Options:
  -o, --output <file>   Write GeoJSON to a file instead of stdout
  --pretty              Indent GeoJSON output
  --limit <n>           Number of records for dump (default 20, 0 = all)
  -h, --help            Show this help
  -v, --version         Show version

Updates are applied in the order given. S-101 cells are detected automatically
(info and geojson only; updates apply to S-57).`;

const ACRONYM: Record<number, string> = Object.fromEntries(Object.entries(OBJL).map(([k, v]) => [v, k]));

/** Run the CLI. Returns the process exit code. */
export function run(argv: string[], io: CliIO): number {
  const opts = parseArgs(argv);
  if (opts.error) {
    io.stderr(`s57: ${opts.error}\n\n${USAGE}\n`);
    return 2;
  }
  if (opts.version) {
    io.stdout(`${io.version}\n`);
    return 0;
  }
  if (opts.help || !opts.command) {
    io.stdout(`${USAGE}\n`);
    return opts.command || opts.help ? 0 : 2;
  }
  if (opts.files.length === 0) {
    io.stderr(`s57: ${opts.command} needs a file\n`);
    return 2;
  }

  try {
    switch (opts.command) {
      case 'info':
        io.stdout(info(load(opts.files, io)));
        return 0;
      case 'geojson': {
        const json = JSON.stringify(geojson(load(opts.files, io)), null, opts.pretty ? 2 : undefined);
        if (opts.output) io.writeFile(opts.output, json + '\n');
        else io.stdout(json + '\n');
        return 0;
      }
      case 'dump':
        io.stdout(dump(toArrayBuffer(io.readFile(opts.files[0])), opts.limit));
        return 0;
      default:
        io.stderr(`s57: unknown command '${opts.command}'\n\n${USAGE}\n`);
        return 2;
    }
  } catch (e) {
    io.stderr(`s57: ${e instanceof Error ? e.message : String(e)}\n`);
    return 1;
  }
}

interface Options {
  command?: string;
  files: string[];
  output?: string;
  pretty: boolean;
  limit: number;
  help: boolean;
  version: boolean;
  error?: string;
}

function parseArgs(argv: string[]): Options {
  const o: Options = { files: [], pretty: false, limit: 20, help: false, version: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '-h' || a === '--help') o.help = true;
    else if (a === '-v' || a === '--version') o.version = true;
    else if (a === '--pretty') o.pretty = true;
    else if (a === '-o' || a === '--output') {
      if (i + 1 >= argv.length) return { ...o, error: `${a} needs a file name` };
      o.output = argv[++i];
    } else if (a === '--limit') {
      const n = Number(argv[++i]);
      if (!Number.isInteger(n) || n < 0) return { ...o, error: '--limit needs a non-negative integer' };
      o.limit = n;
    } else if (a.startsWith('-')) return { ...o, error: `unknown option ${a}` };
    else if (!o.command) o.command = a;
    else o.files.push(a);
  }
  return o;
}

type Loaded =
  | { format: 'S-57'; dataset: S57Dataset }
  | { format: 'S-101'; dataset: ReturnType<typeof parseS101> };

function load(files: string[], io: CliIO): Loaded {
  const [base, ...updates] = files.map(f => toArrayBuffer(io.readFile(f)));
  if (isS101(base)) {
    if (updates.length) throw new Error('updates are only supported for S-57 cells');
    return { format: 'S-101', dataset: parseS101(base) };
  }
  const dataset = parseS57(base);
  for (const u of updates) applyUpdate(dataset, u);
  return { format: 'S-57', dataset };
}

function geojson(l: Loaded) {
  return l.format === 'S-57' ? toGeoJSON(l.dataset) : toGeoJSON101(l.dataset);
}

function info(l: Loaded): string {
  const lines: string[] = [];
  const row = (k: string, v: string | number) => lines.push(`${k.padEnd(16)}${v}`);
  const ds = l.dataset;

  row('Format', l.format);
  row('Dataset', ds.name);
  if (l.format === 'S-57' && l.dataset.cscl) row('Scale', `1:${l.dataset.cscl.toLocaleString('en-US')}`);
  row('COMF / SOMF', `${ds.comf} / ${ds.somf}`);

  const ext = extent(ds.spatialRecords.values());
  if (ext) row('Extent', `lat ${ext.minLat.toFixed(5)}..${ext.maxLat.toFixed(5)}, lon ${ext.minLon.toFixed(5)}..${ext.maxLon.toFixed(5)}`);

  row('Features', ds.features.length);
  row('Spatial records', ds.spatialRecords.size);

  if (l.format === 'S-57') {
    const prim = count(l.dataset.features, f => GeomPrimitive[f.prim] ?? String(f.prim));
    row('  by primitive', [...prim].map(([k, n]) => `${k} ${n}`).join(', '));
    const spatial = count(l.dataset.spatialRecords.values(), s => SpatialType[s.rcnm] ?? String(s.rcnm));
    row('  by type', [...spatial].map(([k, n]) => `${k} ${n}`).join(', '));
    lines.push('', 'Object classes:');
    const classes = [...count(l.dataset.features, f => f.objl)].sort((a, b) => b[1] - a[1]);
    for (const [objl, n] of classes) lines.push(`  ${String(n).padStart(6)}  ${(ACRONYM[objl] ?? '').padEnd(8)}${objl}`);
  } else {
    lines.push('', 'Feature types:');
    const types = [...count(l.dataset.features, f => f.featureTypeName)].sort((a, b) => b[1] - a[1]);
    for (const [name, n] of types) lines.push(`  ${String(n).padStart(6)}  ${name}`);
  }
  return lines.join('\n') + '\n';
}

function dump(buffer: ArrayBuffer, limit: number): string {
  const iso = parseISO8211(buffer);
  const out: string[] = [`DDR: ${iso.ddr.directory.map(d => d.tag).join(' ')}`, `Records: ${iso.records.length}`, ''];
  const records = limit === 0 ? iso.records : iso.records.slice(0, limit);
  records.forEach((rec, i) => {
    out.push(`#${i + 1} (${rec.leader.recordLength} bytes)`);
    for (const f of rec.fields) out.push(`  ${f.tag}  ${formatField(f)}`);
  });
  if (records.length < iso.records.length) out.push(`... ${iso.records.length - records.length} more (use --limit 0 for all)`);
  return out.join('\n') + '\n';
}

function formatField(f: ISO8211Field): string {
  if (f.subfields.length === 0) return `<${f.raw.length} bytes>`;
  const shown = f.subfields.slice(0, 12).map(s => {
    const v = s.type === 'binary' ? `<${s.value.length} bytes>` : s.type === 'string' ? JSON.stringify(s.value) : String(s.value);
    return `${s.label.replace(/^\*/, '')}=${v}`;
  });
  if (f.subfields.length > 12) shown.push(`... (${f.subfields.length} subfields)`);
  return shown.join(' ');
}

function count<T, K>(items: Iterable<T>, key: (t: T) => K): Map<K, number> {
  const m = new Map<K, number>();
  for (const it of items) {
    const k = key(it);
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return m;
}

function extent(records: Iterable<{ coordinates2D: { lat: number; lon: number }[]; coordinates3D: { lat: number; lon: number }[] }>) {
  let minLat = Infinity, maxLat = -Infinity, minLon = Infinity, maxLon = -Infinity;
  for (const r of records) {
    for (const c of r.coordinates2D.length ? r.coordinates2D : r.coordinates3D) {
      if (c.lat < minLat) minLat = c.lat;
      if (c.lat > maxLat) maxLat = c.lat;
      if (c.lon < minLon) minLon = c.lon;
      if (c.lon > maxLon) maxLon = c.lon;
    }
  }
  return minLat === Infinity ? null : { minLat, maxLat, minLon, maxLon };
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}
