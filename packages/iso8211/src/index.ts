/**
 * @s57-parser/iso8211
 *
 * Pure TypeScript parser for ISO/IEC 8211:1994 binary format.
 * Zero dependencies. Works in browser (ArrayBuffer) and Node.js (Buffer).
 *
 * ISO 8211 is the encoding used by S-57, S-101, and other IHO standards.
 */

export { parse } from './parser.js';
export type {
  ISO8211File,
  ISO8211Record,
  ISO8211Field,
  ISO8211Leader,
  ISO8211DirectoryEntry,
  DataDescriptiveField,
  FormatControl,
} from './types.js';
