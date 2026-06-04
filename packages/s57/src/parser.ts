/**
 * S-57 parser: converts ISO 8211 records into S-57 domain objects.
 */

import { parse as parseISO8211 } from '@s57-parser/iso8211';
import type { ISO8211Field } from '@s57-parser/iso8211';
import type {
  S57Dataset,
  FeatureRecord,
  SpatialRecord,
  SpatialRef,
  FeatureObjectId,
  Coordinate2D,
  Coordinate3D,
} from './types.js';
import { GeomPrimitive, SpatialType } from './types.js';

/**
 * Parse an S-57 .000 file from an ArrayBuffer.
 * Returns a structured S57Dataset with features and spatial records.
 */
export function parseS57(buffer: ArrayBuffer): S57Dataset {
  const iso = parseISO8211(buffer);

  let name = '';
  let comf = 10_000_000; // default
  let somf = 10;         // default

  const features: FeatureRecord[] = [];
  const spatialRecords = new Map<number, SpatialRecord>();

  for (const rec of iso.records) {
    const fieldMap = buildFieldMap(rec.fields);

    // Dataset Identification — provides the dataset name
    const dsid = fieldMap.get('DSID');
    if (dsid) {
      name = getSubfieldStr(dsid, 'DSNM') ?? name;
    }

    // Dataset Parameter — provides COMF and SOMF
    const dspm = fieldMap.get('DSPM');
    if (dspm) {
      comf = getSubfieldNum(dspm, 'COMF') ?? comf;
      somf = getSubfieldNum(dspm, 'SOMF') ?? somf;
    }

    // Vector Record (spatial geometry)
    const vrid = fieldMap.get('VRID');
    if (vrid) {
      const spatial = parseSpatialRecord(vrid, fieldMap, comf, somf);
      if (spatial) spatialRecords.set(spatial.rcid, spatial);
    }

    // Feature Record
    const frid = fieldMap.get('FRID');
    if (frid) {
      const feature = parseFeatureRecord(frid, fieldMap);
      if (feature) features.push(feature);
    }
  }

  return { name, comf, somf, features, spatialRecords };
}

/** Build a tag → field map for quick lookup within a record. */
function buildFieldMap(fields: ISO8211Field[]): Map<string, ISO8211Field> {
  const map = new Map<string, ISO8211Field>();
  for (const f of fields) {
    map.set(f.tag, f);
  }
  return map;
}

/** Parse a spatial record from VRID and related coordinate fields. */
function parseSpatialRecord(
  vrid: ISO8211Field,
  fieldMap: Map<string, ISO8211Field>,
  comf: number,
  somf: number
): SpatialRecord | null {
  const rcnm = getSubfieldNum(vrid, 'RCNM');
  const rcid = getSubfieldNum(vrid, 'RCID');
  if (rcnm == null || rcid == null) return null;

  const coordinates2D: Coordinate2D[] = [];
  const coordinates3D: Coordinate3D[] = [];

  // SG2D: 2D coordinate group (repeating YCOO/XCOO pairs)
  const sg2d = fieldMap.get('SG2D');
  if (sg2d) {
    const subfields = sg2d.subfields;
    for (let i = 0; i + 1 < subfields.length; i += 2) {
      const ycoo = getNumericValue(subfields[i]);
      const xcoo = getNumericValue(subfields[i + 1]);
      if (ycoo != null && xcoo != null) {
        coordinates2D.push({
          lat: ycoo / comf,
          lon: xcoo / comf,
        });
      }
    }
  }

  // SG3D: 3D coordinate group (repeating YCOO/XCOO/VE3D triplets — sounding points)
  const sg3d = fieldMap.get('SG3D');
  if (sg3d) {
    const subfields = sg3d.subfields;
    for (let i = 0; i + 2 < subfields.length; i += 3) {
      const ycoo = getNumericValue(subfields[i]);
      const xcoo = getNumericValue(subfields[i + 1]);
      const ve3d = getNumericValue(subfields[i + 2]);
      if (ycoo != null && xcoo != null && ve3d != null) {
        coordinates3D.push({
          lat: ycoo / comf,
          lon: xcoo / comf,
          depth: ve3d / somf,
        });
      }
    }
  }

  return {
    rcid,
    rcnm: rcnm as SpatialType,
    coordinates2D,
    coordinates3D,
  };
}

/** Parse a feature record from FRID and related fields. */
function parseFeatureRecord(
  frid: ISO8211Field,
  fieldMap: Map<string, ISO8211Field>
): FeatureRecord | null {
  const rcid = getSubfieldNum(frid, 'RCID');
  const objl = getSubfieldNum(frid, 'OBJL');
  const prim = getSubfieldNum(frid, 'PRIM');
  const grup = getSubfieldNum(frid, 'GRUP');
  if (rcid == null || objl == null || prim == null) return null;

  // Attributes (ATTF): repeating ATTL/ATVL pairs
  const attributes = new Map<number, string>();
  const attf = fieldMap.get('ATTF');
  if (attf) {
    const subfields = attf.subfields;
    for (let i = 0; i + 1 < subfields.length; i += 2) {
      const attl = getNumericValue(subfields[i]);
      const atvl = subfields[i + 1];
      if (attl != null && atvl) {
        attributes.set(attl, atvl.type === 'string' ? atvl.value : String(atvl.value));
      }
    }
  }

  // Spatial references (FSPT): repeating NAME/ORNT/USAG/MASK groups
  const spatialRefs: SpatialRef[] = [];
  const fspt = fieldMap.get('FSPT');
  if (fspt) {
    const subfields = fspt.subfields;
    // Each FSPT group has 4 subfields: NAME, ORNT, USAG, MASK
    for (let i = 0; i + 3 < subfields.length; i += 4) {
      const namePacked = getNumericValue(subfields[i]);
      const ornt = getNumericValue(subfields[i + 1]) ?? 255;
      const usag = getNumericValue(subfields[i + 2]) ?? 255;
      const mask = getNumericValue(subfields[i + 3]) ?? 255;

      if (namePacked != null) {
        // NAME is a 5-byte packed value: first byte = RCNM, next 4 bytes = RCID
        // Stored as little-endian uint40
        const rcnmVal = namePacked & 0xFF;
        const rcidVal = Math.floor(namePacked / 256) & 0xFFFFFFFF;
        spatialRefs.push({ rcnm: rcnmVal, rcid: rcidVal, ornt, usag, mask });
      }
    }
  }

  // Feature Object ID (FOID)
  let foid: FeatureObjectId | undefined;
  const foidField = fieldMap.get('FOID');
  if (foidField) {
    const agen = getSubfieldNum(foidField, 'AGEN');
    const fidn = getSubfieldNum(foidField, 'FIDN');
    const fids = getSubfieldNum(foidField, 'FIDS');
    if (agen != null && fidn != null && fids != null) {
      foid = { agen, fidn, fids };
    }
  }

  return {
    rcid,
    objl,
    prim: (prim as GeomPrimitive) ?? GeomPrimitive.None,
    grup: grup ?? 0,
    attributes,
    spatialRefs,
    foid,
  };
}

// ─── Subfield accessor helpers ────────────────────────────────────────────────

function getSubfieldStr(field: ISO8211Field, label: string): string | undefined {
  const sf = field.subfields.find(s => s.label === label);
  if (!sf) return undefined;
  return sf.type === 'string' ? sf.value : String(sf.value);
}

function getSubfieldNum(field: ISO8211Field, label: string): number | undefined {
  const sf = field.subfields.find(s => s.label === label);
  if (!sf) return undefined;
  return getNumericValue(sf);
}

function getNumericValue(sf: ISO8211Field['subfields'][number] | undefined): number | undefined {
  if (!sf) return undefined;
  if (sf.type === 'int' || sf.type === 'uint' || sf.type === 'real') return sf.value;
  if (sf.type === 'string') {
    const n = parseFloat(sf.value);
    return isNaN(n) ? undefined : n;
  }
  return undefined;
}
