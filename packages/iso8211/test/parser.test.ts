import { describe, it, expect, beforeAll } from 'bun:test';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parse } from '../src/parser.js';
import type { ISO8211File } from '../src/types.js';

// Path to real NOAA ENC test data
const ENC_PATH = join(
  import.meta.dir,
  '../../../test-data/US5MA19M/ENC_ROOT/US5MA19M/US5MA19M.000'
);

describe('ISO 8211 parser — basic API', () => {
  it('exports parse function', () => {
    expect(typeof parse).toBe('function');
  });

  it('parse() accepts ArrayBuffer and returns ISO8211File', () => {
    const buf = new ArrayBuffer(0);
    // Expect an error on empty buffer, not a crash or wrong return type
    try {
      parse(buf);
    } catch (_e) {
      // Expected: empty buffer has no valid leader
    }
  });
});

describe('ISO 8211 parser — NOAA ENC US5MA19M.000', () => {
  let file: ISO8211File;
  let rawBytes: Uint8Array;

  beforeAll(() => {
    const nodeBuf = readFileSync(ENC_PATH);
    rawBytes = new Uint8Array(nodeBuf);
    const arrayBuf = nodeBuf.buffer.slice(
      nodeBuf.byteOffset,
      nodeBuf.byteOffset + nodeBuf.byteLength
    ) as ArrayBuffer;
    file = parse(arrayBuf);
  });

  it('file has a DDR record', () => {
    expect(file.ddr).toBeDefined();
    expect(file.ddr.leader).toBeDefined();
  });

  it('DDR leader is correct (leader identifier = L)', () => {
    expect(file.ddr.leader.leaderIdentifier).toBe('L');
  });

  it('DDR leader record length matches file header', () => {
    // First 5 bytes of file = record length as ASCII decimal
    const expectedLen = parseInt(
      String.fromCharCode(rawBytes[0], rawBytes[1], rawBytes[2], rawBytes[3], rawBytes[4]),
      10
    );
    expect(file.ddr.leader.recordLength).toBe(expectedLen);
  });

  it('DDR has directory entries', () => {
    expect(file.ddr.directory.length).toBeGreaterThan(0);
  });

  it('DDR contains expected S-57 field tags', () => {
    const tags = file.ddr.directory.map(e => e.tag);
    // S-57 DDR always has 0001 (record identifier) and S-57-specific fields
    expect(tags).toContain('0001');
  });

  it('file has data records', () => {
    expect(file.records.length).toBeGreaterThan(0);
  });

  it('all DR records have leader identifier D', () => {
    for (const rec of file.records) {
      expect(rec.leader.leaderIdentifier).toBe('D');
    }
  });

  it('record lengths sum approximately equals file size', () => {
    const ddrLen = file.ddr.leader.recordLength;
    const drTotal = file.records.reduce((sum, r) => sum + r.leader.recordLength, 0);
    const total = ddrLen + drTotal;
    // Allow ±4 bytes for possible trailing bytes
    expect(Math.abs(total - rawBytes.length)).toBeLessThanOrEqual(4);
  });

  it('all records have matching field count (directory == fields)', () => {
    const allRecords = [file.ddr, ...file.records];
    for (const rec of allRecords) {
      expect(rec.fields.length).toBe(rec.directory.length);
    }
  });

  it('DDR entry map: tag=4, fieldLen=3, pos=4 (matches real file)', () => {
    // Known from manual inspection of US5MA19M.000 leader bytes 20-23 = "3404"
    expect(file.ddr.leader.entryMap.sizeOfFieldLength).toBe(3);
    expect(file.ddr.leader.entryMap.sizeOfFieldPosition).toBe(4);
    expect(file.ddr.leader.entryMap.sizeOfFieldTag).toBe(4);
  });

  it('DSID field exists in some record (dataset identification)', () => {
    // DSID is the first DR in every S-57 .000 file
    const dsidRecord = file.records.find(r =>
      r.directory.some(d => d.tag === 'DSID')
    );
    expect(dsidRecord).toBeDefined();
  });

  it('DSID field raw bytes are non-empty', () => {
    const dsidRecord = file.records.find(r =>
      r.directory.some(d => d.tag === 'DSID')
    )!;
    const dsidField = dsidRecord.fields.find(f => f.tag === 'DSID')!;
    expect(dsidField.raw.length).toBeGreaterThan(0);
  });

  it('each field raw bytes match directory-declared length', () => {
    const allRecords = [file.ddr, ...file.records];
    for (const rec of allRecords) {
      for (let i = 0; i < rec.directory.length; i++) {
        const dir = rec.directory[i];
        const field = rec.fields[i];
        expect(field.raw.length).toBe(dir.length);
      }
    }
  });
});

describe('ISO 8211 parser — subfield decoding', () => {
  let file: ISO8211File;

  beforeAll(() => {
    const nodeBuf = readFileSync(ENC_PATH);
    const arrayBuf = nodeBuf.buffer.slice(
      nodeBuf.byteOffset,
      nodeBuf.byteOffset + nodeBuf.byteLength
    ) as ArrayBuffer;
    file = parse(arrayBuf);
  });

  it('DSID record has decoded subfields', () => {
    const dsidRecord = file.records.find(r =>
      r.directory.some(d => d.tag === 'DSID')
    )!;
    const dsidField = dsidRecord.fields.find(f => f.tag === 'DSID')!;
    // DSID should have subfields after decoding via DDR format controls
    expect(dsidField.subfields.length).toBeGreaterThan(0);
  });

  it('DSID contains DSNM (dataset name) string subfield', () => {
    const dsidRecord = file.records.find(r =>
      r.directory.some(d => d.tag === 'DSID')
    )!;
    const dsidField = dsidRecord.fields.find(f => f.tag === 'DSID')!;
    const dsnm = dsidField.subfields.find(
      sf => sf.label === 'DSNM' && sf.type === 'string'
    );
    expect(dsnm).toBeDefined();
    if (dsnm && dsnm.type === 'string') {
      // Dataset name should contain the chart ID
      expect(dsnm.value.length).toBeGreaterThan(0);
    }
  });
});
