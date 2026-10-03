import { describe, it, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { run, USAGE, type CliIO } from '../src/cli.js';
import { SAMPLE_CELL } from '../../../test-utils/fixtures.js';
import { s101Sample } from '../../../test-utils/s101-sample.js';
import { ddr, dr, file, s57, S57_FIELDS } from '../../../test-utils/iso8211-writer.js';

const files: Record<string, Uint8Array> = {
  'US5MA12M.000': readFileSync(SAMPLE_CELL),
  'US5MA12M.001': new Uint8Array(file(ddr(S57_FIELDS), dr([['DSID', s57.dsid('US5MA12M.001', '1')]]), dr([['FRID', s57.frid(109, 2)]]))),
  'S101.000': new Uint8Array(s101Sample()),
  'junk.000': new TextEncoder().encode('definitely not an ISO 8211 file'),
};

function cli(...argv: string[]) {
  let out = '', err = '';
  const written: Record<string, string> = {};
  const io: CliIO = {
    readFile: p => {
      if (!(p in files)) throw new Error(`ENOENT: no such file '${p}'`);
      return files[p];
    },
    writeFile: (p, d) => { written[p] = d; },
    stdout: t => { out += t; },
    stderr: t => { err += t; },
    version: '9.9.9',
  };
  const code = run(argv, io);
  return { code, out, err, written };
}

describe('s57 CLI', () => {
  it('prints usage with --help, and fails without a command', () => {
    expect(cli('--help')).toMatchObject({ code: 0, out: `${USAGE}\n` });
    expect(cli()).toMatchObject({ code: 2, out: `${USAGE}\n` });
  });

  it('prints the version', () => {
    expect(cli('-v')).toMatchObject({ code: 0, out: '9.9.9\n' });
  });

  it('rejects unknown commands and options, and missing arguments', () => {
    expect(cli('frobnicate', 'US5MA12M.000').code).toBe(2);
    expect(cli('info', '--nope').err).toContain('unknown option --nope');
    expect(cli('info').err).toContain('info needs a file');
    expect(cli('geojson', 'US5MA12M.000', '-o').err).toContain('-o needs a file name');
    expect(cli('dump', 'US5MA12M.000', '--limit', 'x').err).toContain('--limit needs a non-negative integer');
  });

  it('reports read and parse errors with exit code 1', () => {
    expect(cli('info', 'missing.000')).toMatchObject({ code: 1, err: "s57: ENOENT: no such file 'missing.000'\n" });
    expect(cli('info', 'junk.000')).toMatchObject({ code: 1, err: 's57: ISO 8211: invalid record length at byte 0\n' });
  });

  it('info summarises an S-57 cell', () => {
    const { code, out } = cli('info', 'US5MA12M.000');
    expect(code).toBe(0);
    expect(out).toContain('Format          S-57\n');
    expect(out).toContain('Dataset         US5MA12M.000\n');
    expect(out).toContain('Scale           1:25,000\n');
    expect(out).toContain('Extent          lat 42.21034..42.33423, lon -71.07946..-70.73167\n');
    expect(out).toContain('Features        2406\n');
    expect(out).toContain('  by type       IsolatedNode 1006, ConnectedNode 1589, Edge 2083\n');
    expect(out).toContain('     516  UWTROC  153\n');
    expect(out).toContain('      41  LIGHTS  75\n');
  });

  it('info applies updates given after the base cell', () => {
    const { out } = cli('info', 'US5MA12M.000', 'US5MA12M.001');
    expect(out).toContain('Dataset         US5MA12M.001\n');
    expect(out).toContain('Features        2405\n');
    expect(out).toContain('      40  LIGHTS  75\n');
  });

  it('info summarises an S-101 cell and refuses S-101 updates', () => {
    const { code, out } = cli('info', 'S101.000');
    expect(code).toBe(0);
    expect(out).toContain('Format          S-101\n');
    expect(out).toContain('       1  DepthArea\n');
    expect(cli('info', 'S101.000', 'US5MA12M.001').err).toContain('updates are only supported for S-57 cells');
  });

  it('geojson writes a FeatureCollection to stdout or a file', () => {
    const stdout = JSON.parse(cli('geojson', 'US5MA12M.000').out);
    expect(stdout.type).toBe('FeatureCollection');
    expect(stdout.features.length).toBe(2406);

    const { written, out } = cli('geojson', 'S101.000', '--pretty', '-o', 'out.geojson');
    expect(out).toBe('');
    expect(written['out.geojson']).toStartWith('{\n  "type": "FeatureCollection"');
    expect(JSON.parse(written['out.geojson']).features[0].properties.featureType).toBe('Light');
  });

  it('dump lists records and decoded subfields', () => {
    const { code, out } = cli('dump', 'US5MA12M.000', '--limit', '2');
    expect(code).toBe(0);
    expect(out).toStartWith('DDR: 0000 0001 DSID DSSI DSPM VRID ATTV VRPT SG2D SG3D FRID FOID ATTF NATF FFPT FSPT\nRecords: 7086\n');
    expect(out).toContain('  DSID  RCNM=10 RCID=1 EXPP=1 INTU=5 DSNM="US5MA12M.000"');
    expect(out).toContain('CSCL=25000');
    expect(out).toContain('... 7084 more (use --limit 0 for all)');
    expect(cli('dump', 'S101.000', '--limit', '0').out).not.toContain('more (use');
  });
});
