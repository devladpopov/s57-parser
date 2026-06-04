/**
 * ISO 8211 parser.
 *
 * Parses an ArrayBuffer containing an ISO 8211 encoded file into
 * structured records with typed subfield values.
 */

import type { ISO8211File, ISO8211Record, ISO8211Leader, ISO8211DirectoryEntry, ISO8211Field, DataDescriptiveField, FormatControl, SubfieldValue } from './types.js';

const UNIT_TERMINATOR = 0x1f;
const FIELD_TERMINATOR = 0x1e;

/** Parse an ISO 8211 file from an ArrayBuffer. */
export function parse(buffer: ArrayBuffer): ISO8211File {
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  let offset = 0;

  // Parse DDR (first record)
  const ddr = parseRecord(bytes, view, offset);
  offset += ddr.leader.recordLength;

  // Build field descriptors from DDR
  const descriptors = buildDescriptors(ddr);

  // Parse all DRs
  const records: ISO8211Record[] = [];
  while (offset < bytes.length) {
    const dr = parseRecord(bytes, view, offset);
    // Decode subfields using DDR descriptors
    decodeFields(dr, descriptors);
    records.push(dr);
    offset += dr.leader.recordLength;
  }

  return { ddr, records };
}

/** Parse a single record (DDR or DR) starting at the given offset. */
function parseRecord(bytes: Uint8Array, view: DataView, offset: number): ISO8211Record {
  const leader = parseLeader(bytes, offset);
  const directory = parseDirectory(bytes, offset, leader);
  const fields = extractFields(bytes, offset, leader, directory);
  return { leader, directory, fields };
}

/** Parse the 24-byte leader. */
function parseLeader(bytes: Uint8Array, offset: number): ISO8211Leader {
  const ascii = (start: number, len: number) =>
    String.fromCharCode(...bytes.slice(offset + start, offset + start + len));
  const num = (start: number, len: number) => parseInt(ascii(start, len), 10);

  return {
    recordLength: num(0, 5),
    interchangeLevel: ascii(5, 1),
    leaderIdentifier: ascii(6, 1),
    inlineCodeExtension: ascii(7, 1),
    versionNumber: ascii(8, 1),
    applicationIndicator: ascii(9, 1),
    fieldControlLength: num(10, 2),
    baseAddressOfFieldArea: num(12, 5),
    extendedCharSetIndicator: ascii(17, 3),
    entryMap: {
      sizeOfFieldLength: num(20, 1),
      sizeOfFieldPosition: num(21, 1),
      reserved: num(22, 1),
      sizeOfFieldTag: num(23, 1),
    },
  };
}

/** Parse the directory entries between leader and field area. */
function parseDirectory(bytes: Uint8Array, recordOffset: number, leader: ISO8211Leader): ISO8211DirectoryEntry[] {
  const { sizeOfFieldTag, sizeOfFieldLength, sizeOfFieldPosition } = leader.entryMap;
  const entrySize = sizeOfFieldTag + sizeOfFieldLength + sizeOfFieldPosition;

  // Directory starts after the 24-byte leader
  const dirStart = recordOffset + 24;
  // Directory ends at baseAddressOfFieldArea - 1 (field terminator)
  const dirEnd = recordOffset + leader.baseAddressOfFieldArea - 1;
  const dirLength = dirEnd - dirStart;
  const entryCount = Math.floor(dirLength / entrySize);

  const entries: ISO8211DirectoryEntry[] = [];
  for (let i = 0; i < entryCount; i++) {
    const pos = dirStart + i * entrySize;
    const ascii = (start: number, len: number) =>
      String.fromCharCode(...bytes.slice(start, start + len));

    const tag = ascii(pos, sizeOfFieldTag);
    const length = parseInt(ascii(pos + sizeOfFieldTag, sizeOfFieldLength), 10);
    const position = parseInt(ascii(pos + sizeOfFieldTag + sizeOfFieldLength, sizeOfFieldPosition), 10);

    entries.push({ tag, length, position });
  }

  return entries;
}

/** Extract raw field data from the field area. */
function extractFields(bytes: Uint8Array, recordOffset: number, leader: ISO8211Leader, directory: ISO8211DirectoryEntry[]): ISO8211Field[] {
  const baseAddr = recordOffset + leader.baseAddressOfFieldArea;

  return directory.map(entry => {
    const fieldStart = baseAddr + entry.position;
    const raw = bytes.slice(fieldStart, fieldStart + entry.length);
    return {
      tag: entry.tag,
      raw,
      subfields: [],
    };
  });
}

/** Build data descriptive fields from the DDR. */
function buildDescriptors(ddr: ISO8211Record): Map<string, DataDescriptiveField> {
  const map = new Map<string, DataDescriptiveField>();

  for (const field of ddr.fields) {
    if (field.tag === '0000') continue; // Skip field control field

    const desc = parseDDRField(field);
    if (desc) map.set(desc.tag, desc);
  }

  return map;
}

/** Parse a DDR field into a DataDescriptiveField. */
function parseDDRField(field: ISO8211Field): DataDescriptiveField | null {
  const raw = field.raw;
  // DDR field structure: [field controls] UT [field name] UT [array descriptor, format controls] FT
  // DDR field area structure (ISO 8211 §7.2.2):
  //   [6-byte field controls][field name][UT][subfield labels (sep by !)][UT][format controls][FT]
  //
  // The 6-byte field control prefix is always fixed-length:
  //   byte 0: data structure code
  //   byte 1: data type code
  //   bytes 2-3: auxiliary controls
  //   bytes 4-5: printable graphics

  const FIELD_CONTROLS_LEN = 6;

  // Find first UT — separates field name from subfield labels
  let utPos1 = -1;
  for (let i = 0; i < raw.length; i++) {
    if (raw[i] === UNIT_TERMINATOR) { utPos1 = i; break; }
  }
  if (utPos1 === -1) return null;

  // Find second UT — separates subfield labels from format controls
  let utPos2 = -1;
  for (let i = utPos1 + 1; i < raw.length; i++) {
    if (raw[i] === UNIT_TERMINATOR) { utPos2 = i; break; }
  }
  if (utPos2 === -1) return null;

  // Field name is between field controls and first UT
  const fieldName = decodeASCII(raw, FIELD_CONTROLS_LEN, utPos1).trim();

  // Subfield labels are between first and second UT, separated by '!'
  const labelsStr = decodeASCII(raw, utPos1 + 1, utPos2);
  const subfieldLabels = labelsStr.split('!').filter(s => s.length > 0);

  // Format controls are after second UT, before trailing FT
  const formatStr = decodeASCII(raw, utPos2 + 1, raw.length - 1); // -1 to skip FT
  const formatControls = parseFormatControls(formatStr);

  return {
    tag: field.tag,
    fieldName,
    arrayDescriptor: '',
    formatControls,
    subfieldLabels,
  };
}

/** Parse Fortran-like format controls: "(A,I(10),3b12,A)" */
function parseFormatControls(str: string): FormatControl[] {
  const controls: FormatControl[] = [];
  // Remove outer parentheses
  let s = str.trim();
  if (s.startsWith('(') && s.endsWith(')')) {
    s = s.slice(1, -1);
  }
  if (!s) return controls;

  const tokens = s.split(',');
  for (const token of tokens) {
    const t = token.trim();
    if (!t) continue;

    // Match patterns like: A, A(10), I(5), R, b11, b12, b14, b24, 3A
    const match = t.match(/^(\d*)([AIRBb])(?:\((\d+)\))?(\d*)$/i);
    if (match) {
      const repeat = parseInt(match[1] || '1', 10);
      const type = match[2];
      const width = parseInt(match[3] || match[4] || '0', 10);

      if (type === 'b' || type === 'B') {
        // Binary: b12 means unsigned(1) 2-byte, b24 means signed(2) 4-byte
        const widthStr = match[3] || match[4] || '';
        const signedness = widthStr.length >= 2 ? parseInt(widthStr[0], 10) : 1;
        const byteWidth = widthStr.length >= 2 ? parseInt(widthStr.slice(1), 10) : parseInt(widthStr, 10);
        for (let i = 0; i < repeat; i++) {
          controls.push({ type: 'b', width: byteWidth, signedness });
        }
      } else {
        for (let i = 0; i < repeat; i++) {
          controls.push({ type, width });
        }
      }
    }
  }

  return controls;
}

/** Decode fields in a DR using DDR descriptors. */
function decodeFields(record: ISO8211Record, descriptors: Map<string, DataDescriptiveField>): void {
  for (const field of record.fields) {
    const desc = descriptors.get(field.tag);
    if (!desc) continue;

    field.subfields = decodeSubfields(field.raw, desc);
  }
}

/** Decode subfields from raw field bytes using format controls. */
function decodeSubfields(raw: Uint8Array, desc: DataDescriptiveField): SubfieldValue[] {
  const values: SubfieldValue[] = [];
  let offset = 0;
  let formatIdx = 0;
  let labelIdx = 0;

  while (offset < raw.length && raw[offset] !== FIELD_TERMINATOR) {
    if (desc.formatControls.length === 0) break;

    const fmt = desc.formatControls[formatIdx % desc.formatControls.length];
    const label = desc.subfieldLabels[labelIdx % desc.subfieldLabels.length] || `field_${labelIdx}`;

    if (fmt.type === 'A' || fmt.type === 'a') {
      if (fmt.width > 0) {
        const end = Math.min(offset + fmt.width, raw.length);
        values.push({ type: 'string', label, value: decodeASCII(raw, offset, end) });
        offset = end;
      } else {
        // Variable length, read until UT or FT
        const end = findTerminator(raw, offset);
        values.push({ type: 'string', label, value: decodeASCII(raw, offset, end) });
        offset = end + 1; // skip terminator
      }
    } else if (fmt.type === 'I' || fmt.type === 'i') {
      if (fmt.width > 0) {
        const end = Math.min(offset + fmt.width, raw.length);
        const str = decodeASCII(raw, offset, end).trim();
        values.push({ type: 'int', label, value: parseInt(str, 10) || 0 });
        offset = end;
      } else {
        const end = findTerminator(raw, offset);
        const str = decodeASCII(raw, offset, end).trim();
        values.push({ type: 'int', label, value: parseInt(str, 10) || 0 });
        offset = end + 1;
      }
    } else if (fmt.type === 'R' || fmt.type === 'r') {
      if (fmt.width > 0) {
        const end = Math.min(offset + fmt.width, raw.length);
        const str = decodeASCII(raw, offset, end).trim();
        values.push({ type: 'real', label, value: parseFloat(str) || 0 });
        offset = end;
      } else {
        const end = findTerminator(raw, offset);
        const str = decodeASCII(raw, offset, end).trim();
        values.push({ type: 'real', label, value: parseFloat(str) || 0 });
        offset = end + 1;
      }
    } else if (fmt.type === 'b' || fmt.type === 'B') {
      const byteWidth = fmt.width || 1;
      const end = Math.min(offset + byteWidth, raw.length);
      const chunk = raw.slice(offset, end);

      if (fmt.signedness === 2) {
        // Signed integer
        values.push({ type: 'int', label, value: readSignedInt(chunk) });
      } else {
        // Unsigned integer
        values.push({ type: 'uint', label, value: readUnsignedInt(chunk) });
      }
      offset = end;
    }

    formatIdx++;
    labelIdx++;
  }

  return values;
}

/** Find next unit terminator or field terminator. */
function findTerminator(raw: Uint8Array, from: number): number {
  for (let i = from; i < raw.length; i++) {
    if (raw[i] === UNIT_TERMINATOR || raw[i] === FIELD_TERMINATOR) return i;
  }
  return raw.length;
}

/** Decode ASCII string from byte range. */
function decodeASCII(raw: Uint8Array, start: number, end: number): string {
  let s = '';
  for (let i = start; i < end; i++) {
    s += String.fromCharCode(raw[i]);
  }
  return s;
}

/** Read a little-endian unsigned integer from bytes. */
function readUnsignedInt(bytes: Uint8Array): number {
  let val = 0;
  for (let i = bytes.length - 1; i >= 0; i--) {
    val = val * 256 + bytes[i];
  }
  return val;
}

/** Read a little-endian signed integer from bytes. */
function readSignedInt(bytes: Uint8Array): number {
  const unsigned = readUnsignedInt(bytes);
  const bits = bytes.length * 8;
  // Use Math.pow to avoid JS bitwise 32-bit overflow (1 << 32 === 1 in JS)
  const max = Math.pow(2, bits);
  const signBit = max / 2;
  if (unsigned >= signBit) {
    return unsigned - max;
  }
  return unsigned;
}
