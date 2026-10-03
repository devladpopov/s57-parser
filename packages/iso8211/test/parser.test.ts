import { describe, it, expect, beforeAll } from 'bun:test';
import { parse } from '../src/parser.js';
import type { ISO8211File, ISO8211Field } from '../src/types.js';
import { SAMPLE_CELL, NOAA_US5MA19M, hasNoaaUS5MA19M, readArrayBuffer } from '../../../test-utils/fixtures.js';
import { ddr, dr, file, enc, concat } from '../../../test-utils/iso8211-writer.js';

const values = (f: ISO8211Field) => f.subfields.map(s => [s.label, s.value]);
const field = (rec: ISO8211File['records'][number], tag: string) => rec.fields.find(f => f.tag === tag)!;

describe('ISO 8211 parser — basic API', () => {
  it('exports parse function', () => {
    expect(typeof parse).toBe('function');
  });

  it('parse() of an empty buffer does not return a file', () => {
    expect(() => parse(new ArrayBuffer(0))).toThrow();
  });
});

/** Structural checks that hold for any well-formed S-57 base cell. */
function structuralSuite(label: string, path: string, skip = false) {
  describe.skipIf(skip)(`ISO 8211 parser — ${label}`, () => {
    let iso: ISO8211File;
    let raw: Uint8Array;

    beforeAll(() => {
      const ab = readArrayBuffer(path);
      raw = new Uint8Array(ab);
      iso = parse(ab);
    });

    it('DDR leader identifier is L and length matches the first 5 bytes', () => {
      expect(iso.ddr.leader.leaderIdentifier).toBe('L');
      expect(iso.ddr.leader.recordLength).toBe(parseInt(String.fromCharCode(...raw.slice(0, 5)), 10));
    });

    it('DDR entry map is tag=4, length=3, position=4', () => {
      expect(iso.ddr.leader.entryMap).toEqual({ sizeOfFieldLength: 3, sizeOfFieldPosition: 4, reserved: 0, sizeOfFieldTag: 4 });
    });

    it('DDR describes the S-57 fields', () => {
      const tags = iso.ddr.directory.map(e => e.tag);
      for (const t of ['0000', '0001', 'DSID', 'DSPM', 'VRID', 'SG2D', 'FRID', 'ATTF', 'FSPT']) expect(tags).toContain(t);
    });

    it('every data record has leader D and one field per directory entry', () => {
      expect(iso.records.length).toBeGreaterThan(0);
      for (const rec of iso.records) {
        expect(rec.leader.leaderIdentifier).toBe('D');
        expect(rec.fields.length).toBe(rec.directory.length);
      }
    });

    it('record lengths add up to the file size', () => {
      const total = iso.ddr.leader.recordLength + iso.records.reduce((n, r) => n + r.leader.recordLength, 0);
      expect(total).toBe(raw.length);
    });

    it('field bytes match directory lengths and end with a field terminator', () => {
      for (const rec of [iso.ddr, ...iso.records]) {
        rec.directory.forEach((d, i) => {
          expect(rec.fields[i].raw.length).toBe(d.length);
          expect(rec.fields[i].raw[d.length - 1]).toBe(0x1e);
        });
      }
    });

    it('first data record is DSID with a decoded dataset name', () => {
      const dsid = field(iso.records[0], 'DSID');
      const dsnm = dsid.subfields.find(s => s.label === 'DSNM');
      expect(dsnm?.type).toBe('string');
      expect(String(dsnm?.value)).toMatch(/^US5MA1\dM\.000$/);
    });
  });
}

structuralSuite('NOAA US5MA12M.000 (in repo)', SAMPLE_CELL);
structuralSuite('NOAA US5MA19M.000 (downloaded)', NOAA_US5MA19M, !hasNoaaUS5MA19M);

describe('ISO 8211 parser — US5MA12M decoded values', () => {
  let iso: ISO8211File;
  beforeAll(() => { iso = parse(readArrayBuffer(SAMPLE_CELL)); });

  it('has 7086 data records', () => {
    expect(iso.records.length).toBe(7086);
  });

  it('decodes DSID text, real and binary subfields', () => {
    const dsid = field(iso.records[0], 'DSID');
    expect(values(dsid)).toEqual([
      ['RCNM', 10], ['RCID', 1], ['EXPP', 1], ['INTU', 5], ['DSNM', 'US5MA12M.000'], ['EDTN', '32'],
      ['UPDN', '0'], ['UADT', '20221013'], ['ISDT', '20221013'], ['STED', 3.1], ['PRSP', 1], ['PSDN', ''],
      ['PRED', '2.0'], ['PROF', 1], ['AGEN', 550], ['COMT', 'Produced by NOAA'],
    ]);
  });

  it('decodes DSPM scale and multiplication factors', () => {
    const dspm = field(iso.records[1], 'DSPM');
    const get = (l: string) => dspm.subfields.find(s => s.label === l)?.value;
    expect(get('CSCL')).toBe(25000);
    expect(get('COMF')).toBe(10_000_000);
    expect(get('SOMF')).toBe(10);
  });

  it('decodes signed coordinates in SG3D', () => {
    const rec = iso.records.find(r => r.fields.some(f => f.tag === 'SG3D'))!;
    const sg3d = field(rec, 'SG3D');
    expect(sg3d.subfields.length % 3).toBe(0);
    expect(sg3d.subfields[0]).toEqual({ type: 'int', label: '*YCOO', value: 423053050 });
    expect(sg3d.subfields[1]).toEqual({ type: 'int', label: 'XCOO', value: -710523730 });
  });

  it('cycles format controls and labels for repeating groups', () => {
    const rec = iso.records.find(r => r.fields.some(f => f.tag === 'FSPT'))!;
    const fspt = field(rec, 'FSPT');
    const labels = fspt.subfields.slice(0, 8).map(s => s.label);
    expect(labels).toEqual(['*NAME', 'ORNT', 'USAG', 'MASK', '*NAME', 'ORNT', 'USAG', 'MASK']);
  });
});

describe('ISO 8211 parser — format controls (synthetic records)', () => {
  const spec = (format: string, labels = 'V') => [{ tag: 'TEST', name: 'Test field', labels, format }];
  const decode = (format: string, body: Uint8Array, labels?: string) =>
    field(parse(file(ddr(spec(format, labels)), dr([['TEST', body]]))).records[0], 'TEST').subfields;

  it('reads fixed-width and variable-width A, I and R subfields', () => {
    const body = concat(enc.af('AB', 2), enc.a('xyz'), enc.af('  42', 4), enc.a('-7'), enc.af('2.50', 4), enc.a('1e3'));
    expect(decode('(A(2),A,I(4),I,R(4),R)', body, 'A1!A2!I1!I2!R1!R2')).toEqual([
      { type: 'string', label: 'A1', value: 'AB' },
      { type: 'string', label: 'A2', value: 'xyz' },
      { type: 'int', label: 'I1', value: 42 },
      { type: 'int', label: 'I2', value: -7 },
      { type: 'real', label: 'R1', value: 2.5 },
      { type: 'real', label: 'R2', value: 1000 },
    ]);
  });

  it('reads blank numeric subfields as 0', () => {
    expect(decode('(I(3),R(3))', enc.af('', 6), 'I!R').map(s => s.value)).toEqual([0, 0]);
  });

  it('reads unsigned (b1n), signed (b2n) and bit-width (B(n)) binary integers', () => {
    const body = concat(enc.u(0xffff, 2), enc.i(-2, 4), enc.i(-123456789, 4), enc.u(2 ** 32 + 5, 5));
    expect(decode('(b12,b24,b24,B(40))', body, 'U!S1!S2!B').map(s => [s.type, s.value])).toEqual([
      ['uint', 0xffff], ['int', -2], ['int', -123456789], ['uint', 2 ** 32 + 5],
    ]);
  });

  it('keeps reading binary data that contains 0x1E or 0x1F bytes', () => {
    // 30 = 0x1E (field terminator), 31 = 0x1F (unit terminator)
    const body = concat(enc.u(30, 4), enc.u(31, 4), enc.u(0x1e1e1e1e, 4));
    expect(decode('(3b14)', body, '*A').map(s => s.value)).toEqual([30, 31, 0x1e1e1e1e]);
  });

  it('expands repeat counts such as 3A and 2b11', () => {
    const body = concat(enc.a('a'), enc.a('b'), enc.a('c'), enc.u(1, 1), enc.u(2, 1));
    expect(decode('(3A,2b11)', body, 'A!B!C!D!E').map(s => s.value)).toEqual(['a', 'b', 'c', 1, 2]);
  });

  it('names subfields without labels by position', () => {
    expect(decode('(b11)', enc.u(9, 1), '').map(s => s.label)).toEqual(['field_0']);
  });

  it('leaves fields with no descriptor undecoded', () => {
    const iso = parse(file(ddr(spec('(b11)')), dr([['TEST', enc.u(1, 1)], ['XTRA', enc.u(2, 1)]])));
    expect(field(iso.records[0], 'XTRA').subfields).toEqual([]);
    expect(field(iso.records[0], 'XTRA').raw).toEqual(Uint8Array.of(2, 0x1e));
  });

  it('parses directories with non-default entry map sizes', () => {
    const iso = parse(file(ddr(spec('(b11)')), dr([['TEST', enc.u(7, 1)]])));
    expect(iso.records[0].leader.entryMap).toEqual({ sizeOfFieldLength: 5, sizeOfFieldPosition: 5, reserved: 0, sizeOfFieldTag: 4 });
    expect(iso.records[0].fields[0].subfields[0].value).toBe(7);
  });
});

describe('ISO 8211 parser — invalid input', () => {
  const valid = () => new Uint8Array(file(ddr([{ tag: 'TEST', name: 'T', labels: 'V', format: '(b11)' }]), dr([['TEST', enc.u(1, 1)]])));
  const ab = (u: Uint8Array) => u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength) as ArrayBuffer;

  it('rejects a buffer shorter than a leader', () => {
    expect(() => parse(new ArrayBuffer(10))).toThrow(/truncated record leader/);
  });

  it('rejects a zero record length instead of looping forever', () => {
    const u = valid();
    u.set([0x30, 0x30, 0x30, 0x30, 0x30], 0);
    expect(() => parse(ab(u))).toThrow(/invalid record length/);
  });

  it('rejects a record that runs past the end of the buffer', () => {
    expect(() => parse(ab(valid().slice(0, -3)))).toThrow(/invalid record length/);
  });

  it('rejects a non-numeric base address', () => {
    const u = valid();
    u.set([0x41, 0x41], 12);
    expect(() => parse(ab(u))).toThrow(/invalid base address/);
  });

  it('rejects a zero entry map', () => {
    const u = valid();
    u.set([0x30, 0x30, 0x30, 0x30], 20);
    expect(() => parse(ab(u))).toThrow(/invalid entry map/);
  });

  it('rejects arbitrary text', () => {
    expect(() => parse(ab(new TextEncoder().encode('this is not an ENC cell, just some text')))).toThrow();
  });

  it('ignores a few trailing padding bytes after the last record', () => {
    const iso = parse(ab(concat(valid(), Uint8Array.of(0, 0, 0x0a))));
    expect(iso.records.length).toBe(1);
  });
});
