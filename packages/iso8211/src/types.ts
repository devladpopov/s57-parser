/**
 * ISO 8211 type definitions.
 *
 * Structure: File = 1 DDR (Data Descriptive Record) + N DRs (Data Records).
 * Each record = Leader (24 bytes) + Directory + Field Area.
 */

/** Parsed ISO 8211 file */
export interface ISO8211File {
  /** Data Descriptive Record (schema) */
  ddr: ISO8211Record;
  /** Data Records */
  records: ISO8211Record[];
}

/** Single record (DDR or DR) */
export interface ISO8211Record {
  leader: ISO8211Leader;
  directory: ISO8211DirectoryEntry[];
  fields: ISO8211Field[];
}

/** 24-byte record leader */
export interface ISO8211Leader {
  /** Total record length in bytes */
  recordLength: number;
  /** '1', '2', or '3' */
  interchangeLevel: string;
  /** 'L' for DDR, 'D' for DR */
  leaderIdentifier: string;
  /** Inline code extension indicator */
  inlineCodeExtension: string;
  /** Version number */
  versionNumber: string;
  /** Application indicator */
  applicationIndicator: string;
  /** Field control length (DDR only) */
  fieldControlLength: number;
  /** Offset to start of field area */
  baseAddressOfFieldArea: number;
  /** Extended character set indicator */
  extendedCharSetIndicator: string;
  /** Entry map: sizes of directory entry components */
  entryMap: {
    sizeOfFieldLength: number;
    sizeOfFieldPosition: number;
    reserved: number;
    sizeOfFieldTag: number;
  };
}

/** Directory entry pointing to a field */
export interface ISO8211DirectoryEntry {
  /** Field tag (e.g. "0000", "DSID", "VRID") */
  tag: string;
  /** Field length in bytes */
  length: number;
  /** Field position (offset from base address) */
  position: number;
}

/** Decoded field data */
export interface ISO8211Field {
  /** Field tag from directory */
  tag: string;
  /** Raw bytes of the field */
  raw: Uint8Array;
  /** Decoded subfields (available after applying DDR format controls) */
  subfields: SubfieldValue[];
}

/** A single subfield value */
export type SubfieldValue =
  | { type: 'string'; label: string; value: string }
  | { type: 'int'; label: string; value: number }
  | { type: 'uint'; label: string; value: number }
  | { type: 'real'; label: string; value: number }
  | { type: 'binary'; label: string; value: Uint8Array };

/** Data Descriptive Field from DDR (format schema) */
export interface DataDescriptiveField {
  tag: string;
  fieldName: string;
  arrayDescriptor: string;
  formatControls: FormatControl[];
  subfieldLabels: string[];
}

/** Single format control parsed from Fortran-like notation */
export interface FormatControl {
  /** Data type: 'A' (char), 'I' (int), 'R' (real), 'B' (binary), 'b' (binary with width) */
  type: string;
  /** Fixed width in bytes (0 = variable length, delimited) */
  width: number;
  /** For 'b' type: signedness (1=unsigned, 2=signed) */
  signedness?: number;
}
