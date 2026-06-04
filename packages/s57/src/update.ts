/**
 * S-57 update mechanism: applies .001, .002, etc. incremental updates to a base dataset.
 *
 * S-57 update records contain RUIN (Record Update INstruction):
 *   1 = Insert, 2 = Delete, 3 = Modify
 *
 * Feature/spatial records are matched by RCID (and RCNM for spatial).
 * Sub-record pointer updates use control fields (FSPC, VRPC, SGCC).
 */

import { parse as parseISO8211 } from '@s57-parser/iso8211';
import type { ISO8211Field } from '@s57-parser/iso8211';
import type {
  S57Dataset,
  FeatureRecord,
  SpatialRecord,
  SpatialRef,
  Coordinate2D,
  Coordinate3D,
} from './types.js';
import { GeomPrimitive, SpatialType } from './types.js';
import { spatialKey } from './parser.js';

/** Record Update INstruction codes */
const RUIN_INSERT = 1;
const RUIN_DELETE = 2;
const RUIN_MODIFY = 3;

/**
 * Apply an update file (.001, .002, etc.) to a base S-57 dataset.
 * Mutates the dataset in place and returns it.
 */
export function applyUpdate(dataset: S57Dataset, updateBuffer: ArrayBuffer): S57Dataset {
  const iso = parseISO8211(updateBuffer);

  for (const rec of iso.records) {
    const fieldMap = buildFieldMap(rec.fields);

    // Update dataset metadata
    const dsid = fieldMap.get('DSID');
    if (dsid) {
      const dsnm = getSubfieldStr(dsid, 'DSNM');
      if (dsnm) dataset.name = dsnm;
    }

    // Dataset parameters
    const dspm = fieldMap.get('DSPM');
    if (dspm) {
      const comf = getSubfieldNum(dspm, 'COMF');
      const somf = getSubfieldNum(dspm, 'SOMF');
      if (comf != null) dataset.comf = comf;
      if (somf != null) dataset.somf = somf;
    }

    // Spatial record updates
    const vrid = fieldMap.get('VRID');
    if (vrid) {
      applySpatialUpdate(dataset, vrid, fieldMap);
    }

    // Feature record updates
    const frid = fieldMap.get('FRID');
    if (frid) {
      applyFeatureUpdate(dataset, frid, fieldMap);
    }
  }

  return dataset;
}

// ─── Spatial record updates ─────────────────────────────────────────────────

function applySpatialUpdate(
  dataset: S57Dataset,
  vrid: ISO8211Field,
  fieldMap: Map<string, ISO8211Field>
) {
  const rcnm = getSubfieldNum(vrid, 'RCNM');
  const rcid = getSubfieldNum(vrid, 'RCID');
  const ruin = getSubfieldNum(vrid, 'RUIN') ?? 0;
  if (rcnm == null || rcid == null) return;

  const key = spatialKey(rcnm, rcid);

  if (ruin === RUIN_INSERT) {
    const spatial = buildSpatialFromFields(rcnm, rcid, fieldMap, dataset.comf, dataset.somf);
    if (spatial) dataset.spatialRecords.set(key, spatial);
    return;
  }

  if (ruin === RUIN_DELETE) {
    dataset.spatialRecords.delete(key);
    return;
  }

  if (ruin === RUIN_MODIFY) {
    const existing = dataset.spatialRecords.get(key);
    if (!existing) return;

    // Apply coordinate updates (SGCC control field)
    const sgcc = fieldMap.get('SGCC');
    if (sgcc) {
      const ccui = getSubfieldNum(sgcc, 'CCUI') ?? 0; // 1=insert, 2=delete, 3=modify
      const ccix = (getSubfieldNum(sgcc, 'CCIX') ?? 1) - 1; // 1-based → 0-based index
      const ccnc = getSubfieldNum(sgcc, 'CCNC') ?? 0; // number of coords

      const sg2d = fieldMap.get('SG2D');
      if (sg2d && existing.coordinates2D.length > 0) {
        const newCoords = parse2DCoords(sg2d, dataset.comf);
        applySplice(existing.coordinates2D, ccui, ccix, ccnc, newCoords);
      }

      const sg3d = fieldMap.get('SG3D');
      if (sg3d && existing.coordinates3D.length > 0) {
        const newCoords = parse3DCoords(sg3d, dataset.comf, dataset.somf);
        applySplice(existing.coordinates3D, ccui, ccix, ccnc, newCoords);
      }
    }

    // Apply VRPT pointer updates
    const vrpc = fieldMap.get('VRPC');
    const vrpt = fieldMap.get('VRPT');
    if (vrpc && vrpt) {
      const vpui = getSubfieldNum(vrpc, 'VPUI') ?? 0;
      const vpix = (getSubfieldNum(vrpc, 'VPIX') ?? 1) - 1;
      const nvpt = getSubfieldNum(vrpc, 'NVPT') ?? 0;

      // Re-parse VRPT start/end nodes
      const subfields = vrpt.subfields;
      for (let i = 0; i + 4 < subfields.length; i += 5) {
        const namePacked = getNumericValue(subfields[i]);
        const topi = getNumericValue(subfields[i + 3]);
        if (namePacked != null && topi != null) {
          const nodeRcid = Math.floor(namePacked / 256);
          if (topi === 1) existing.startNodeRcid = nodeRcid;
          if (topi === 2) existing.endNodeRcid = nodeRcid;
        }
      }
    }
  }
}

// ─── Feature record updates ─────────────────────────────────────────────────

function applyFeatureUpdate(
  dataset: S57Dataset,
  frid: ISO8211Field,
  fieldMap: Map<string, ISO8211Field>
) {
  const rcid = getSubfieldNum(frid, 'RCID');
  const ruin = getSubfieldNum(frid, 'RUIN') ?? 0;
  if (rcid == null) return;

  if (ruin === RUIN_INSERT) {
    const feature = buildFeatureFromFields(frid, fieldMap);
    if (feature) dataset.features.push(feature);
    return;
  }

  const idx = dataset.features.findIndex(f => f.rcid === rcid);
  if (idx === -1) return;

  if (ruin === RUIN_DELETE) {
    dataset.features.splice(idx, 1);
    return;
  }

  if (ruin === RUIN_MODIFY) {
    const existing = dataset.features[idx];

    // Update basic fields if present
    const objl = getSubfieldNum(frid, 'OBJL');
    const prim = getSubfieldNum(frid, 'PRIM');
    const grup = getSubfieldNum(frid, 'GRUP');
    if (objl != null) existing.objl = objl;
    if (prim != null) existing.prim = prim as GeomPrimitive;
    if (grup != null) existing.grup = grup;

    // Merge attributes
    const attf = fieldMap.get('ATTF');
    if (attf) {
      const subfields = attf.subfields;
      for (let i = 0; i + 1 < subfields.length; i += 2) {
        const attl = getNumericValue(subfields[i]);
        const atvl = subfields[i + 1];
        if (attl != null && atvl) {
          const val = atvl.type === 'string' ? atvl.value : String(atvl.value);
          if (val === '' || val === '\x7f') {
            existing.attributes.delete(attl); // DELETE sentinel
          } else {
            existing.attributes.set(attl, val);
          }
        }
      }
    }

    // Apply FSPT spatial reference updates
    const fspc = fieldMap.get('FSPC');
    const fspt = fieldMap.get('FSPT');
    if (fspc && fspt) {
      const fsui = getSubfieldNum(fspc, 'FSUI') ?? 0;
      const fsix = (getSubfieldNum(fspc, 'FSIX') ?? 1) - 1;
      const nspt = getSubfieldNum(fspc, 'NSPT') ?? 0;

      const newRefs = parseSpatialRefs(fspt);
      applySplice(existing.spatialRefs, fsui, fsix, nspt, newRefs);
    }

    // Update FOID if present
    const foidField = fieldMap.get('FOID');
    if (foidField) {
      const agen = getSubfieldNum(foidField, 'AGEN');
      const fidn = getSubfieldNum(foidField, 'FIDN');
      const fids = getSubfieldNum(foidField, 'FIDS');
      if (agen != null && fidn != null && fids != null) {
        existing.foid = { agen, fidn, fids };
      }
    }
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function buildFieldMap(fields: ISO8211Field[]): Map<string, ISO8211Field> {
  const map = new Map<string, ISO8211Field>();
  for (const f of fields) map.set(f.tag, f);
  return map;
}

/** Generic splice operation: insert (1), delete (2), or modify (3). */
function applySplice<T>(arr: T[], instruction: number, index: number, count: number, items: T[]) {
  if (instruction === 1) {
    // Insert at index
    arr.splice(index, 0, ...items);
  } else if (instruction === 2) {
    // Delete count items starting at index
    arr.splice(index, count);
  } else if (instruction === 3) {
    // Replace count items at index with new items
    arr.splice(index, count, ...items);
  }
}

function buildSpatialFromFields(
  rcnm: number, rcid: number,
  fieldMap: Map<string, ISO8211Field>,
  comf: number, somf: number
): SpatialRecord | null {
  const coordinates2D: Coordinate2D[] = [];
  const coordinates3D: Coordinate3D[] = [];

  const sg2d = fieldMap.get('SG2D');
  if (sg2d) coordinates2D.push(...parse2DCoords(sg2d, comf));

  const sg3d = fieldMap.get('SG3D');
  if (sg3d) coordinates3D.push(...parse3DCoords(sg3d, comf, somf));

  let startNodeRcid: number | undefined;
  let endNodeRcid: number | undefined;
  if (rcnm === SpatialType.Edge) {
    const vrpt = fieldMap.get('VRPT');
    if (vrpt) {
      const subfields = vrpt.subfields;
      for (let i = 0; i + 4 < subfields.length; i += 5) {
        const namePacked = getNumericValue(subfields[i]);
        const topi = getNumericValue(subfields[i + 3]);
        if (namePacked != null && topi != null) {
          const nodeRcid = Math.floor(namePacked / 256);
          if (topi === 1) startNodeRcid = nodeRcid;
          if (topi === 2) endNodeRcid = nodeRcid;
        }
      }
    }
  }

  return { rcid, rcnm: rcnm as SpatialType, coordinates2D, coordinates3D, startNodeRcid, endNodeRcid };
}

function buildFeatureFromFields(
  frid: ISO8211Field,
  fieldMap: Map<string, ISO8211Field>
): FeatureRecord | null {
  const rcid = getSubfieldNum(frid, 'RCID');
  const objl = getSubfieldNum(frid, 'OBJL');
  const prim = getSubfieldNum(frid, 'PRIM');
  const grup = getSubfieldNum(frid, 'GRUP');
  if (rcid == null || objl == null || prim == null) return null;

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

  const fspt = fieldMap.get('FSPT');
  const spatialRefs = fspt ? parseSpatialRefs(fspt) : [];

  let foid;
  const foidField = fieldMap.get('FOID');
  if (foidField) {
    const agen = getSubfieldNum(foidField, 'AGEN');
    const fidn = getSubfieldNum(foidField, 'FIDN');
    const fids = getSubfieldNum(foidField, 'FIDS');
    if (agen != null && fidn != null && fids != null) foid = { agen, fidn, fids };
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

function parseSpatialRefs(fspt: ISO8211Field): SpatialRef[] {
  const refs: SpatialRef[] = [];
  const subfields = fspt.subfields;
  for (let i = 0; i + 3 < subfields.length; i += 4) {
    const namePacked = getNumericValue(subfields[i]);
    const ornt = getNumericValue(subfields[i + 1]) ?? 255;
    const usag = getNumericValue(subfields[i + 2]) ?? 255;
    const mask = getNumericValue(subfields[i + 3]) ?? 255;
    if (namePacked != null) {
      const rcnmVal = namePacked & 0xFF;
      const rcidVal = Math.floor(namePacked / 256) & 0xFFFFFFFF;
      refs.push({ rcnm: rcnmVal, rcid: rcidVal, ornt, usag, mask });
    }
  }
  return refs;
}

function parse2DCoords(sg2d: ISO8211Field, comf: number): Coordinate2D[] {
  const coords: Coordinate2D[] = [];
  const subfields = sg2d.subfields;
  for (let i = 0; i + 1 < subfields.length; i += 2) {
    const ycoo = getNumericValue(subfields[i]);
    const xcoo = getNumericValue(subfields[i + 1]);
    if (ycoo != null && xcoo != null) {
      coords.push({ lat: ycoo / comf, lon: xcoo / comf });
    }
  }
  return coords;
}

function parse3DCoords(sg3d: ISO8211Field, comf: number, somf: number): Coordinate3D[] {
  const coords: Coordinate3D[] = [];
  const subfields = sg3d.subfields;
  for (let i = 0; i + 2 < subfields.length; i += 3) {
    const ycoo = getNumericValue(subfields[i]);
    const xcoo = getNumericValue(subfields[i + 1]);
    const ve3d = getNumericValue(subfields[i + 2]);
    if (ycoo != null && xcoo != null && ve3d != null) {
      coords.push({ lat: ycoo / comf, lon: xcoo / comf, depth: ve3d / somf });
    }
  }
  return coords;
}

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
