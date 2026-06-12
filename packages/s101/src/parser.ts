/**
 * S-101 parser: converts ISO 8211 records into S-101 domain objects.
 *
 * S-101 uses the same ISO 8211 binary encoding as S-57 but with a
 * different record structure reflecting the S-100 data model:
 * - Feature records have feature type codes instead of OBJL
 * - Complex (nested) attributes in CATF fields
 * - Information records (IRID)
 * - Feature associations (FFAS) and information associations (FIAS)
 * - Extended spatial types (CompositeCurve, Surface)
 */

import { parse as parseISO8211 } from '@s57-parser/iso8211';
import type { ISO8211Field } from '@s57-parser/iso8211';
import type {
  S101Dataset,
  S101Feature,
  S101InformationRecord,
  S101SpatialRecord,
  S101SpatialRef,
  S101FeatureAssociation,
  S101InformationAssociation,
  FeatureObjectId,
  Coordinate2D,
  Coordinate3D,
} from './types.js';
import { S101Primitive, S101SpatialType } from './types.js';
import { S101_FEATURE_CATALOGUE } from './catalogue.js';

/**
 * Parse an S-101 dataset from an ArrayBuffer.
 *
 * S-101 files use .000 extension (same as S-57). The parser auto-detects
 * S-101 format by examining the DSID product specification field.
 */
export function parseS101(buffer: ArrayBuffer): S101Dataset {
  const iso = parseISO8211(buffer);

  let name = '';
  let productSpec = '';
  let productVersion = '';
  let comf = 10_000_000;
  let somf = 10;
  let crs = 4326; // WGS 84

  const features: S101Feature[] = [];
  const informationRecords: S101InformationRecord[] = [];
  const spatialRecords = new Map<number, S101SpatialRecord>();

  for (const rec of iso.records) {
    const fieldMap = buildFieldMap(rec.fields);

    // Dataset Identification
    const dsid = fieldMap.get('DSID');
    if (dsid) {
      name = getStr(dsid, 'DSNM') ?? name;
      productSpec = getStr(dsid, 'PRSP') ?? getStr(dsid, 'DSNM') ?? productSpec;
      productVersion = getStr(dsid, 'EDTN') ?? productVersion;
    }

    // Dataset Structure Information
    const dssi = fieldMap.get('DSSI');
    if (dssi) {
      // S-100 encodes coordinate system info here
      crs = getNum(dssi, 'CRSS') ?? crs;
    }

    // Dataset Parameter
    const dspm = fieldMap.get('DSPM');
    if (dspm) {
      comf = getNum(dspm, 'COMF') ?? comf;
      somf = getNum(dspm, 'SOMF') ?? somf;
    }

    // Spatial Record (VRID)
    const vrid = fieldMap.get('VRID');
    if (vrid) {
      const spatial = parseSpatialRecord(vrid, fieldMap, comf, somf);
      if (spatial) spatialRecords.set(spatialKey(spatial.rcnm, spatial.rcid), spatial);
    }

    // Feature Record (FRID)
    const frid = fieldMap.get('FRID');
    if (frid) {
      const feature = parseFeatureRecord(frid, fieldMap);
      if (feature) features.push(feature);
    }

    // Information Record (IRID)
    const irid = fieldMap.get('IRID');
    if (irid) {
      const info = parseInformationRecord(irid, fieldMap);
      if (info) informationRecords.push(info);
    }
  }

  return { name, productSpec, productVersion, comf, somf, crs, features, informationRecords, spatialRecords };
}

/**
 * Detect whether a buffer contains S-101 data (vs S-57).
 * Examines the DSID record for S-100 indicators.
 */
export function isS101(buffer: ArrayBuffer): boolean {
  try {
    const iso = parseISO8211(buffer);
    for (const rec of iso.records) {
      for (const field of rec.fields) {
        if (field.tag === 'DSID') {
          // S-57 DSID carries STED (S-57 edition, e.g. "03.1") and EXPP —
          // neither exists in the S-100 data model. Note: PRSP exists in
          // BOTH formats (numeric enum in S-57, spec string in S-100),
          // so it cannot be used alone as an S-101 marker.
          if (field.subfields.some(s => s.label === 'STED' || s.label === 'EXPP')) {
            return false;
          }

          // S-100 product specification string, e.g. "INT.IHO.S-101.1.0"
          const prsp = field.subfields.find(s => s.label === 'PRSP');
          if (prsp && prsp.type === 'string' && prsp.value.toUpperCase().includes('101')) {
            return true;
          }

          // Product specification number/name subfield (S-100)
          const psdn = field.subfields.find(s => s.label === 'PSDN');
          if (psdn && psdn.type === 'string' && psdn.value.toUpperCase().includes('101')) {
            return true;
          }

          // Or check DSNM for S-101 pattern
          const dsnm = field.subfields.find(s => s.label === 'DSNM');
          if (dsnm && dsnm.type === 'string') {
            const name = dsnm.value.toUpperCase();
            if (name.includes('S101') || name.includes('S-101')) return true;
          }

          // DSID present but no S-57 markers and no S-101 spec string:
          // treat string-typed PRSP as S-100 indicator
          if (prsp && prsp.type === 'string') return true;

          return false;
        }
      }
    }
  } catch {
    // Parse error — not a valid dataset
  }
  return false;
}

/** Compound key for spatial records: avoids RCID collisions between types. */
export function spatialKey(rcnm: number, rcid: number): number {
  return rcnm * 100000 + rcid;
}

// ─── Record parsers ─────────────────────────────────────────────────────────

function parseSpatialRecord(
  vrid: ISO8211Field,
  fieldMap: Map<string, ISO8211Field>,
  comf: number,
  somf: number
): S101SpatialRecord | null {
  const rcnm = getNum(vrid, 'RCNM');
  const rcid = getNum(vrid, 'RCID');
  if (rcnm == null || rcid == null) return null;

  const coordinates2D: Coordinate2D[] = [];
  const coordinates3D: Coordinate3D[] = [];

  // SG2D: 2D coordinates
  const sg2d = fieldMap.get('SG2D');
  if (sg2d) {
    for (let i = 0; i + 1 < sg2d.subfields.length; i += 2) {
      const ycoo = numVal(sg2d.subfields[i]);
      const xcoo = numVal(sg2d.subfields[i + 1]);
      if (ycoo != null && xcoo != null) {
        coordinates2D.push({ lat: ycoo / comf, lon: xcoo / comf });
      }
    }
  }

  // SG3D: 3D coordinates (soundings)
  const sg3d = fieldMap.get('SG3D');
  if (sg3d) {
    for (let i = 0; i + 2 < sg3d.subfields.length; i += 3) {
      const ycoo = numVal(sg3d.subfields[i]);
      const xcoo = numVal(sg3d.subfields[i + 1]);
      const ve3d = numVal(sg3d.subfields[i + 2]);
      if (ycoo != null && xcoo != null && ve3d != null) {
        coordinates3D.push({ lat: ycoo / comf, lon: xcoo / comf, depth: ve3d / somf });
      }
    }
  }

  // VRPT: curve node pointers (same as S-57 for basic curves)
  let startNodeRcid: number | undefined;
  let endNodeRcid: number | undefined;
  if (rcnm === S101SpatialType.Curve) {
    const vrpt = fieldMap.get('VRPT');
    if (vrpt) {
      for (let i = 0; i + 4 < vrpt.subfields.length; i += 5) {
        const namePacked = numVal(vrpt.subfields[i]);
        const topi = numVal(vrpt.subfields[i + 3]);
        if (namePacked != null && topi != null) {
          const nodeRcid = Math.floor(namePacked / 256);
          if (topi === 1) startNodeRcid = nodeRcid;
          if (topi === 2) endNodeRcid = nodeRcid;
        }
      }
    }
  }

  // CCOC: composite curve components
  let componentCurves: number[] | undefined;
  if (rcnm === S101SpatialType.CompositeCurve) {
    const ccoc = fieldMap.get('CCOC');
    if (ccoc) {
      componentCurves = [];
      for (const sf of ccoc.subfields) {
        const val = numVal(sf);
        if (val != null) componentCurves.push(val);
      }
    }
  }

  return {
    rcid,
    rcnm: rcnm as S101SpatialType,
    coordinates2D,
    coordinates3D,
    startNodeRcid,
    endNodeRcid,
    componentCurves,
  };
}

function parseFeatureRecord(
  frid: ISO8211Field,
  fieldMap: Map<string, ISO8211Field>
): S101Feature | null {
  const rcid = getNum(frid, 'RCID');
  const nftc = getNum(frid, 'NFTC') ?? getNum(frid, 'OBJL'); // S-101 uses NFTC, fallback to OBJL
  const prim = getNum(frid, 'PRIM');
  if (rcid == null || nftc == null) return null;

  const featureTypeName = S101_FEATURE_CATALOGUE.get(nftc) ?? `Unknown_${nftc}`;

  // Simple attributes (ATTF)
  const attributes = new Map<number, string>();
  const attf = fieldMap.get('ATTF');
  if (attf) {
    for (let i = 0; i + 1 < attf.subfields.length; i += 2) {
      const attl = numVal(attf.subfields[i]);
      const atvl = attf.subfields[i + 1];
      if (attl != null && atvl) {
        attributes.set(attl, atvl.type === 'string' ? atvl.value : String(atvl.value));
      }
    }
  }

  // National attributes (NATF) — merge into attributes
  const natf = fieldMap.get('NATF');
  if (natf) {
    for (let i = 0; i + 1 < natf.subfields.length; i += 2) {
      const attl = numVal(natf.subfields[i]);
      const atvl = natf.subfields[i + 1];
      if (attl != null && atvl) {
        attributes.set(attl, atvl.type === 'string' ? atvl.value : String(atvl.value));
      }
    }
  }

  // Complex attributes (CATF)
  const complexAttributes = new Map<number, Map<number, string>[]>();
  const catf = fieldMap.get('CATF');
  if (catf) {
    parseComplexAttributes(catf, complexAttributes);
  }

  // Spatial references (FSPT)
  const spatialRefs: S101SpatialRef[] = [];
  const fspt = fieldMap.get('FSPT');
  if (fspt) {
    for (let i = 0; i + 3 < fspt.subfields.length; i += 4) {
      const namePacked = numVal(fspt.subfields[i]);
      const ornt = numVal(fspt.subfields[i + 1]) ?? 255;
      const usag = numVal(fspt.subfields[i + 2]) ?? 255;
      const mask = numVal(fspt.subfields[i + 3]) ?? 255;
      if (namePacked != null) {
        const rcnmVal = namePacked & 0xFF;
        const rcidVal = Math.floor(namePacked / 256) & 0xFFFFFFFF;
        spatialRefs.push({ rcnm: rcnmVal, rcid: rcidVal, ornt, usag, mask });
      }
    }
  }

  // Feature associations (FFAS)
  const featureAssociations: S101FeatureAssociation[] = [];
  const ffas = fieldMap.get('FFAS');
  if (ffas) {
    for (let i = 0; i + 2 < ffas.subfields.length; i += 3) {
      const assocType = numVal(ffas.subfields[i]);
      const role = numVal(ffas.subfields[i + 1]);
      const targetRcid = numVal(ffas.subfields[i + 2]);
      if (assocType != null && role != null && targetRcid != null) {
        featureAssociations.push({ associationType: assocType, role, targetRcid });
      }
    }
  }

  // Information associations (FIAS)
  const informationAssociations: S101InformationAssociation[] = [];
  const fias = fieldMap.get('FIAS');
  if (fias) {
    for (let i = 0; i + 1 < fias.subfields.length; i += 2) {
      const assocType = numVal(fias.subfields[i]);
      const targetRcid = numVal(fias.subfields[i + 1]);
      if (assocType != null && targetRcid != null) {
        informationAssociations.push({ associationType: assocType, targetRcid });
      }
    }
  }

  // Feature Object ID (FOID)
  let foid: FeatureObjectId | undefined;
  const foidField = fieldMap.get('FOID');
  if (foidField) {
    const agen = getNum(foidField, 'AGEN');
    const fidn = getNum(foidField, 'FIDN');
    const fids = getNum(foidField, 'FIDS');
    if (agen != null && fidn != null && fids != null) {
      foid = { agen, fidn, fids };
    }
  }

  return {
    rcid,
    featureTypeCode: nftc,
    featureTypeName,
    primitive: (prim as S101Primitive) ?? S101Primitive.None,
    attributes,
    complexAttributes,
    spatialRefs,
    featureAssociations,
    informationAssociations,
    foid,
  };
}

function parseInformationRecord(
  irid: ISO8211Field,
  fieldMap: Map<string, ISO8211Field>
): S101InformationRecord | null {
  const rcid = getNum(irid, 'RCID');
  const nitc = getNum(irid, 'NITC');
  if (rcid == null || nitc == null) return null;

  const attributes = new Map<number, string>();
  const attf = fieldMap.get('ATTF');
  if (attf) {
    for (let i = 0; i + 1 < attf.subfields.length; i += 2) {
      const attl = numVal(attf.subfields[i]);
      const atvl = attf.subfields[i + 1];
      if (attl != null && atvl) {
        attributes.set(attl, atvl.type === 'string' ? atvl.value : String(atvl.value));
      }
    }
  }

  const complexAttributes = new Map<number, Map<number, string>[]>();
  const catf = fieldMap.get('CATF');
  if (catf) {
    parseComplexAttributes(catf, complexAttributes);
  }

  return {
    rcid,
    typeCode: nitc,
    typeName: `Info_${nitc}`,
    attributes,
    complexAttributes,
  };
}

// ─── Complex attribute parsing ──────────────────────────────────────────────

function parseComplexAttributes(
  catf: ISO8211Field,
  out: Map<number, Map<number, string>[]>
): void {
  // Complex attributes are encoded as groups of sub-attribute pairs
  // Each group starts with CATL (complex attribute label) followed by
  // ATTL/ATVL pairs for the sub-attributes
  let currentCode: number | null = null;
  let currentGroup = new Map<number, string>();

  for (const sf of catf.subfields) {
    if (sf.label === 'CATL') {
      // Flush previous group
      if (currentCode != null && currentGroup.size > 0) {
        if (!out.has(currentCode)) out.set(currentCode, []);
        out.get(currentCode)!.push(currentGroup);
      }
      currentCode = numVal(sf) ?? null;
      currentGroup = new Map();
    } else if (sf.label === 'ATTL' || sf.label === 'ATVL') {
      // Sub-attribute pairs within current complex attribute
      if (sf.label === 'ATTL') {
        const code = numVal(sf);
        if (code != null) currentGroup.set(code, '');
      } else if (currentGroup.size > 0) {
        // Set value for last added code
        const lastKey = [...currentGroup.keys()].pop();
        if (lastKey != null) {
          currentGroup.set(lastKey, sf.type === 'string' ? sf.value : String(sf.value));
        }
      }
    }
  }

  // Flush last group
  if (currentCode != null && currentGroup.size > 0) {
    if (!out.has(currentCode)) out.set(currentCode, []);
    out.get(currentCode)!.push(currentGroup);
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function buildFieldMap(fields: ISO8211Field[]): Map<string, ISO8211Field> {
  const map = new Map<string, ISO8211Field>();
  for (const f of fields) map.set(f.tag, f);
  return map;
}

function getStr(field: ISO8211Field, label: string): string | undefined {
  const sf = field.subfields.find(s => s.label === label);
  if (!sf) return undefined;
  return sf.type === 'string' ? sf.value : String(sf.value);
}

function getNum(field: ISO8211Field, label: string): number | undefined {
  const sf = field.subfields.find(s => s.label === label);
  return sf ? numVal(sf) : undefined;
}

function numVal(sf: ISO8211Field['subfields'][number] | undefined): number | undefined {
  if (!sf) return undefined;
  if (sf.type === 'int' || sf.type === 'uint' || sf.type === 'real') return sf.value;
  if (sf.type === 'string') {
    const n = parseFloat(sf.value);
    return isNaN(n) ? undefined : n;
  }
  return undefined;
}
