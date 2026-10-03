/**
 * Minimal ISO 8211 writer for tests.
 *
 * The repository ships one real base cell but no update (.001) or S-101
 * files, so tests build those from scratch: a DDR from field specs, then data
 * records from raw field bodies made with the `enc` helpers.
 */

const UT = 0x1f;
const FT = 0x1e;

export interface FieldSpec {
  tag: string;
  /** Human-readable field name stored in the DDR */
  name: string;
  /** Subfield labels joined with '!'; prefix with '*' for repeating groups */
  labels: string;
  /** Format controls, e.g. '(b11,b14,A)' */
  format: string;
}

/** Little-endian unsigned and signed integers, ASCII text. */
export const enc = {
  u(value: number, width: number): Uint8Array {
    const out = new Uint8Array(width);
    let v = value;
    for (let i = 0; i < width; i++) {
      out[i] = v % 256;
      v = Math.floor(v / 256);
    }
    return out;
  },
  i(value: number, width: number): Uint8Array {
    return enc.u(value < 0 ? value + 2 ** (width * 8) : value, width);
  },
  /** Variable-length text followed by a unit terminator. */
  a(text: string): Uint8Array {
    return concat(ascii(text), Uint8Array.of(UT));
  },
  /** Fixed-width text, padded with spaces. */
  af(text: string, width: number): Uint8Array {
    return ascii(text.padEnd(width).slice(0, width));
  },
  /** S-57 NAME pointer: RCNM byte followed by RCID as uint32. */
  name(rcnm: number, rcid: number): Uint8Array {
    return concat(enc.u(rcnm, 1), enc.u(rcid, 4));
  },
};

export function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

function ascii(s: string): Uint8Array {
  return Uint8Array.from(s, c => c.charCodeAt(0));
}

function record(leaderId: 'L' | 'D', fields: [string, Uint8Array][]): Uint8Array {
  const bodies = fields.map(([, b]) => concat(b, Uint8Array.of(FT)));
  let pos = 0;
  const dir = fields.map(([tag], i) => {
    const entry = tag + String(bodies[i].length).padStart(5, '0') + String(pos).padStart(5, '0');
    pos += bodies[i].length;
    return entry;
  });
  const directory = concat(ascii(dir.join('')), Uint8Array.of(FT));
  const base = 24 + directory.length;
  const length = base + pos;
  const leader = leaderId === 'L'
    ? `${String(length).padStart(5, '0')}3LE1 06${String(base).padStart(5, '0')} ! 5504`
    : `${String(length).padStart(5, '0')} D     ${String(base).padStart(5, '0')}   5504`;
  return concat(ascii(leader), directory, ...bodies);
}

/** Data Descriptive Record describing the given fields. */
export function ddr(specs: FieldSpec[]): Uint8Array {
  const fields: [string, Uint8Array][] = [['0000', ascii('0000;&   test')]];
  for (const s of specs) {
    const controls = s.labels.startsWith('*') ? '2600;&   ' : '1600;&   ';
    fields.push([s.tag, concat(ascii(controls + s.name), Uint8Array.of(UT), ascii(s.labels), Uint8Array.of(UT), ascii(s.format))]);
  }
  return record('L', fields);
}

/** Data record from raw field bodies (field terminators are appended). */
export function dr(fields: [string, Uint8Array][]): Uint8Array {
  return record('D', fields);
}

/** Join a DDR and data records into one file buffer. */
export function file(...records: Uint8Array[]): ArrayBuffer {
  const bytes = concat(...records);
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

/** S-57 field specs (IHO S-57 Edition 3.1, Part 3), including update control fields. */
export const S57_FIELDS: FieldSpec[] = [
  { tag: '0001', name: 'ISO/IEC 8211 Record Identifier', labels: '', format: '(b12)' },
  { tag: 'DSID', name: 'Data set identification field', labels: 'RCNM!RCID!EXPP!INTU!DSNM!EDTN!UPDN!UADT!ISDT!STED!PRSP!PSDN!PRED!PROF!AGEN!COMT', format: '(b11,b14,2b11,3A,2A(8),R(4),b11,2A,b11,b12,A)' },
  { tag: 'DSPM', name: 'Data set parameter field', labels: 'RCNM!RCID!HDAT!VDAT!SDAT!CSCL!DUNI!HUNI!PUNI!COUN!COMF!SOMF!COMT', format: '(b11,b14,3b11,b14,4b11,2b14,A)' },
  { tag: 'VRID', name: 'Vector record identifier field', labels: 'RCNM!RCID!RVER!RUIN', format: '(b11,b14,b12,b11)' },
  { tag: 'VRPC', name: 'Vector record pointer control field', labels: 'VPUI!VPIX!NVPT', format: '(b11,2b12)' },
  { tag: 'VRPT', name: 'Vector record pointer field', labels: '*NAME!ORNT!USAG!TOPI!MASK', format: '(B(40),4b11)' },
  { tag: 'SGCC', name: 'Coordinate control field', labels: 'CCUI!CCIX!CCNC', format: '(b11,2b12)' },
  { tag: 'SG2D', name: '2-D coordinate field', labels: '*YCOO!XCOO', format: '(2b24)' },
  { tag: 'SG3D', name: '3-D coordinate (sounding array) field', labels: '*YCOO!XCOO!VE3D', format: '(3b24)' },
  { tag: 'FRID', name: 'Feature record identifier field', labels: 'RCNM!RCID!PRIM!GRUP!OBJL!RVER!RUIN', format: '(b11,b14,2b11,2b12,b11)' },
  { tag: 'FOID', name: 'Feature object identifier field', labels: 'AGEN!FIDN!FIDS', format: '(b12,b14,b12)' },
  { tag: 'ATTF', name: 'Feature record attribute field', labels: '*ATTL!ATVL', format: '(b12,A)' },
  { tag: 'FSPC', name: 'Feature record to spatial record pointer control field', labels: 'FSUI!FSIX!NSPT', format: '(b11,2b12)' },
  { tag: 'FSPT', name: 'Feature record to spatial record pointer field', labels: '*NAME!ORNT!USAG!MASK', format: '(B(40),3b11)' },
];

/** Builders for S-57 field bodies, in the order the formats above expect. */
export const s57 = {
  dsid(dsnm: string, updn: string): Uint8Array {
    return concat(
      enc.u(10, 1), enc.u(1, 4), enc.u(1, 1), enc.u(5, 1),
      enc.a(dsnm), enc.a('32'), enc.a(updn), enc.af('20221101', 8), enc.af('20221101', 8),
      enc.af('03.1', 4), enc.u(1, 1), enc.a(''), enc.a('2.0'), enc.u(1, 1), enc.u(550, 2), enc.a(''),
    );
  },
  dspm(comf: number, somf: number, cscl: number): Uint8Array {
    return concat(
      enc.u(20, 1), enc.u(1, 4), enc.u(2, 1), enc.u(17, 1), enc.u(23, 1), enc.u(cscl, 4),
      enc.u(1, 1), enc.u(1, 1), enc.u(1, 1), enc.u(1, 1), enc.u(comf, 4), enc.u(somf, 4), enc.a(''),
    );
  },
  vrid(rcnm: number, rcid: number, ruin: number, rver = 2): Uint8Array {
    return concat(enc.u(rcnm, 1), enc.u(rcid, 4), enc.u(rver, 2), enc.u(ruin, 1));
  },
  frid(rcid: number, ruin: number, f: { prim?: number; grup?: number; objl?: number; rver?: number } = {}): Uint8Array {
    return concat(
      enc.u(100, 1), enc.u(rcid, 4), enc.u(f.prim ?? 255, 1), enc.u(f.grup ?? 2, 1),
      enc.u(f.objl ?? 0, 2), enc.u(f.rver ?? 2, 2), enc.u(ruin, 1),
    );
  },
  foid(agen: number, fidn: number, fids: number): Uint8Array {
    return concat(enc.u(agen, 2), enc.u(fidn, 4), enc.u(fids, 2));
  },
  /** Control field: instruction (1 insert, 2 delete, 3 modify), 1-based index, count. */
  control(ui: number, ix: number, n: number): Uint8Array {
    return concat(enc.u(ui, 1), enc.u(ix, 2), enc.u(n, 2));
  },
  attf(attrs: [number, string][]): Uint8Array {
    return concat(...attrs.flatMap(([attl, atvl]) => [enc.u(attl, 2), enc.a(atvl)]));
  },
  fspt(refs: { rcnm: number; rcid: number; ornt?: number; usag?: number; mask?: number }[]): Uint8Array {
    return concat(...refs.map(r => concat(enc.name(r.rcnm, r.rcid), enc.u(r.ornt ?? 1, 1), enc.u(r.usag ?? 1, 1), enc.u(r.mask ?? 255, 1))));
  },
  vrpt(refs: { rcnm: number; rcid: number; topi: number; ornt?: number }[]): Uint8Array {
    return concat(...refs.map(r => concat(enc.name(r.rcnm, r.rcid), enc.u(r.ornt ?? 255, 1), enc.u(255, 1), enc.u(r.topi, 1), enc.u(255, 1))));
  },
  sg2d(coords: [lat: number, lon: number][], comf = 10_000_000): Uint8Array {
    return concat(...coords.map(([lat, lon]) => concat(enc.i(Math.round(lat * comf), 4), enc.i(Math.round(lon * comf), 4))));
  },
  sg3d(coords: [lat: number, lon: number, depth: number][], comf = 10_000_000, somf = 10): Uint8Array {
    return concat(...coords.map(([lat, lon, d]) => concat(enc.i(Math.round(lat * comf), 4), enc.i(Math.round(lon * comf), 4), enc.i(Math.round(d * somf), 4))));
  },
};
