/**
 * Typed S-57 Feature Access API.
 *
 * Provides strongly-typed interfaces for common S-57 object classes,
 * with attribute values parsed to their native types (number, string, enum).
 * Wraps the raw FeatureRecord with convenient typed accessors.
 */

import type { FeatureRecord } from './types.js';
import { ATTL } from './attributes.js';

// ─── Helpers ──────────────────────────────────────────

/** Read a float attribute, return undefined if missing or NaN */
function floatAttr(attrs: Map<number, string>, code: number): number | undefined {
  const v = attrs.get(code);
  if (v == null) return undefined;
  const n = parseFloat(v);
  return Number.isNaN(n) ? undefined : n;
}

/** Read an integer attribute */
function intAttr(attrs: Map<number, string>, code: number): number | undefined {
  const v = attrs.get(code);
  if (v == null) return undefined;
  const n = parseInt(v, 10);
  return Number.isNaN(n) ? undefined : n;
}

/** Read a string attribute */
function strAttr(attrs: Map<number, string>, code: number): string | undefined {
  return attrs.get(code) ?? undefined;
}

/** Read a list attribute (comma-separated integers) */
function listAttr(attrs: Map<number, string>, code: number): number[] | undefined {
  const v = attrs.get(code);
  if (v == null) return undefined;
  return v.split(',').map(Number).filter(n => !Number.isNaN(n));
}

// ─── OBJL codes ───────────────────────────────────────

export const OBJL = {
  ACHARE: 3,
  BCNCAR: 5,
  BCNLAT: 8,
  BOYCAR: 15,
  BOYLAT: 17,
  BOYSAW: 19,
  BOYSPP: 20,
  BRIDGE: 12,
  BUAARE: 14,
  COALNE: 30,
  DEPARE: 42,
  DEPCNT: 43,
  LIGHTS: 75,
  LNDARE: 71,
  LNDMRK: 77,
  OBSTRN: 86,
  RESARE: 112,
  SOUNDG: 129,
  UWTROC: 154,
  WRECKS: 159,
} as const;

// ─── Base typed feature ───────────────────────────────

/** Base for all typed features */
export interface TypedFeatureBase {
  /** S-57 OBJL code */
  objl: number;
  /** Object class acronym */
  objectClass: string;
  /** Record ID */
  rcid: number;
  /** Object name (OBJNAM attribute) */
  name?: string;
  /** National object name */
  nationalName?: string;
  /** Information text */
  information?: string;
  /** Scale minimum */
  scaleMin?: number;
  /** Original raw feature record */
  raw: FeatureRecord;
}

function baseFields(f: FeatureRecord, objectClass: string): TypedFeatureBase {
  return {
    objl: f.objl,
    objectClass,
    rcid: f.rcid,
    name: strAttr(f.attributes, ATTL.OBJNAM),
    nationalName: strAttr(f.attributes, ATTL.NOBJNM),
    information: strAttr(f.attributes, ATTL.INFORM),
    scaleMin: intAttr(f.attributes, ATTL.SCAMIN),
    raw: f,
  };
}

// ─── Typed feature interfaces ─────────────────────────

export interface DepthArea extends TypedFeatureBase {
  objectClass: 'DEPARE';
  /** Minimum depth (metres) */
  drval1?: number;
  /** Maximum depth (metres) */
  drval2?: number;
  /** Depth units */
  depthUnits?: number;
}

export interface DepthContour extends TypedFeatureBase {
  objectClass: 'DEPCNT';
  /** Contour value (metres) */
  valdco?: number;
}

export interface Sounding extends TypedFeatureBase {
  objectClass: 'SOUNDG';
  /** Sounding value (metres) */
  valsou?: number;
  /** Quality of sounding */
  quasou?: number[];
  /** Technique of sounding */
  tecsou?: number[];
}

export interface Coastline extends TypedFeatureBase {
  objectClass: 'COALNE';
  /** Category of coastline */
  catcoa?: number;
}

export interface LandArea extends TypedFeatureBase {
  objectClass: 'LNDARE';
  /** Condition */
  condition?: number;
}

export interface Light extends TypedFeatureBase {
  objectClass: 'LIGHTS';
  /** Light characteristic (enum: 1=Fixed, 2=Flashing, etc.) */
  litchr?: number;
  /** Light visibility */
  litvis?: number;
  /** Signal period (seconds) */
  sigper?: number;
  /** Signal group */
  siggrp?: string;
  /** Colour */
  colour?: number[];
  /** Colour pattern */
  colpat?: number[];
  /** Sector limit one (degrees) */
  sectr1?: number;
  /** Sector limit two (degrees) */
  sectr2?: number;
  /** Height (metres) */
  height?: number;
  /** Orientation (degrees) */
  orient?: number;
  /** Exhibition condition */
  exclit?: number;
  /** Status */
  status?: number[];
}

export interface Beacon extends TypedFeatureBase {
  objectClass: 'BCNCAR' | 'BCNLAT';
  /** Beacon shape */
  bcnshp?: number;
  /** Colour */
  colour?: number[];
  /** Topmark shape */
  topshp?: number;
  /** Marks navigational system */
  marsys?: number;
  /** Conspicuous visual */
  convis?: number;
}

export interface Buoy extends TypedFeatureBase {
  objectClass: 'BOYCAR' | 'BOYLAT' | 'BOYSAW' | 'BOYSPP';
  /** Buoy shape */
  boyshp?: number;
  /** Colour */
  colour?: number[];
  /** Colour pattern */
  colpat?: number[];
  /** Topmark shape */
  topshp?: number;
  /** Marks navigational system */
  marsys?: number;
}

export interface Obstruction extends TypedFeatureBase {
  objectClass: 'OBSTRN';
  /** Category of obstruction */
  catobs?: number;
  /** Value of sounding */
  valsou?: number;
  /** Water level effect */
  watlev?: number;
  /** Condition */
  condition?: number;
}

export interface Wreck extends TypedFeatureBase {
  objectClass: 'WRECKS';
  /** Category of wreck */
  catwrk?: number;
  /** Value of sounding */
  valsou?: number;
  /** Water level effect */
  watlev?: number;
  /** Condition */
  condition?: number;
}

export interface UnderwaterRock extends TypedFeatureBase {
  objectClass: 'UWTROC';
  /** Value of sounding */
  valsou?: number;
  /** Water level effect */
  watlev?: number;
}

export interface RestrictedArea extends TypedFeatureBase {
  objectClass: 'RESARE';
  /** Category of restricted area */
  catrea?: number;
  /** Restriction */
  restrn?: number[];
  /** Status */
  status?: number[];
}

export interface Bridge extends TypedFeatureBase {
  objectClass: 'BRIDGE';
  /** Category of bridge */
  catbrg?: number;
  /** Vertical clearance (metres) */
  verclr?: number;
  /** Vertical clearance, closed (metres) */
  verccl?: number;
  /** Vertical clearance, open (metres) */
  vercop?: number;
  /** Horizontal clearance (metres) */
  horclr?: number;
  /** Condition */
  condition?: number;
}

export interface Landmark extends TypedFeatureBase {
  objectClass: 'LNDMRK';
  /** Category of landmark */
  catlmk?: number;
  /** Colour */
  colour?: number[];
  /** Conspicuous visual */
  convis?: number;
  /** Height (metres) */
  height?: number;
  /** Elevation (metres) */
  elevation?: number;
  /** Condition */
  condition?: number;
}

export interface AnchorageArea extends TypedFeatureBase {
  objectClass: 'ACHARE';
  /** Category of anchorage */
  catanc?: number;
  /** Restriction */
  restrn?: number[];
  /** Status */
  status?: number[];
}

/** Union of all typed features */
export type TypedFeature =
  | DepthArea | DepthContour | Sounding | Coastline | LandArea
  | Light | Beacon | Buoy | Obstruction | Wreck | UnderwaterRock
  | RestrictedArea | Bridge | Landmark | AnchorageArea;

// ─── Typed feature builders ───────────────────────────

function buildDepthArea(f: FeatureRecord): DepthArea {
  return {
    ...baseFields(f, 'DEPARE'),
    objectClass: 'DEPARE',
    drval1: floatAttr(f.attributes, ATTL.DRVAL1),
    drval2: floatAttr(f.attributes, ATTL.DRVAL2),
    depthUnits: intAttr(f.attributes, 86), // DUNITS
  };
}

function buildDepthContour(f: FeatureRecord): DepthContour {
  return {
    ...baseFields(f, 'DEPCNT'),
    objectClass: 'DEPCNT',
    valdco: floatAttr(f.attributes, ATTL.VALDCO),
  };
}

function buildSounding(f: FeatureRecord): Sounding {
  return {
    ...baseFields(f, 'SOUNDG'),
    objectClass: 'SOUNDG',
    valsou: floatAttr(f.attributes, ATTL.VALSOU),
    quasou: listAttr(f.attributes, ATTL.QUASOU),
    tecsou: listAttr(f.attributes, 156), // TECSOU
  };
}

function buildCoastline(f: FeatureRecord): Coastline {
  return {
    ...baseFields(f, 'COALNE'),
    objectClass: 'COALNE',
    catcoa: intAttr(f.attributes, 17), // CATCOA
  };
}

function buildLandArea(f: FeatureRecord): LandArea {
  return {
    ...baseFields(f, 'LNDARE'),
    objectClass: 'LNDARE',
    condition: intAttr(f.attributes, ATTL.CONDTN),
  };
}

function buildLight(f: FeatureRecord): Light {
  return {
    ...baseFields(f, 'LIGHTS'),
    objectClass: 'LIGHTS',
    litchr: intAttr(f.attributes, ATTL.LITCHR),
    litvis: intAttr(f.attributes, 108), // LITVIS
    sigper: floatAttr(f.attributes, ATTL.SIGPER),
    siggrp: strAttr(f.attributes, ATTL.SIGGRP),
    colour: listAttr(f.attributes, ATTL.COLOUR),
    colpat: listAttr(f.attributes, ATTL.COLPAT),
    sectr1: floatAttr(f.attributes, ATTL.SECTR1),
    sectr2: floatAttr(f.attributes, ATTL.SECTR2),
    height: floatAttr(f.attributes, ATTL.HEIGHT),
    orient: floatAttr(f.attributes, ATTL.ORIENT),
    exclit: intAttr(f.attributes, 90), // EXCLIT
    status: listAttr(f.attributes, ATTL.STATUS),
  };
}

function buildBeacon(f: FeatureRecord): Beacon {
  const cls = f.objl === OBJL.BCNCAR ? 'BCNCAR' : 'BCNLAT';
  return {
    ...baseFields(f, cls),
    objectClass: cls as 'BCNCAR' | 'BCNLAT',
    bcnshp: intAttr(f.attributes, ATTL.BCNSHP),
    colour: listAttr(f.attributes, ATTL.COLOUR),
    topshp: intAttr(f.attributes, ATTL.TOPSHP),
    marsys: intAttr(f.attributes, ATTL.MARSYS),
    convis: intAttr(f.attributes, ATTL.CONVIS),
  };
}

function buildBuoy(f: FeatureRecord): Buoy {
  const clsMap: Record<number, 'BOYCAR' | 'BOYLAT' | 'BOYSAW' | 'BOYSPP'> = {
    [OBJL.BOYCAR]: 'BOYCAR',
    [OBJL.BOYLAT]: 'BOYLAT',
    [OBJL.BOYSAW]: 'BOYSAW',
    [OBJL.BOYSPP]: 'BOYSPP',
  };
  const cls = clsMap[f.objl] ?? 'BOYSPP';
  return {
    ...baseFields(f, cls),
    objectClass: cls,
    boyshp: intAttr(f.attributes, ATTL.BOYSHP),
    colour: listAttr(f.attributes, ATTL.COLOUR),
    colpat: listAttr(f.attributes, ATTL.COLPAT),
    topshp: intAttr(f.attributes, ATTL.TOPSHP),
    marsys: intAttr(f.attributes, ATTL.MARSYS),
  };
}

function buildObstruction(f: FeatureRecord): Obstruction {
  return {
    ...baseFields(f, 'OBSTRN'),
    objectClass: 'OBSTRN',
    catobs: intAttr(f.attributes, ATTL.CATOBS),
    valsou: floatAttr(f.attributes, ATTL.VALSOU),
    watlev: intAttr(f.attributes, ATTL.WATLEV),
    condition: intAttr(f.attributes, ATTL.CONDTN),
  };
}

function buildWreck(f: FeatureRecord): Wreck {
  return {
    ...baseFields(f, 'WRECKS'),
    objectClass: 'WRECKS',
    catwrk: intAttr(f.attributes, ATTL.CATWRK),
    valsou: floatAttr(f.attributes, ATTL.VALSOU),
    watlev: intAttr(f.attributes, ATTL.WATLEV),
    condition: intAttr(f.attributes, ATTL.CONDTN),
  };
}

function buildUnderwaterRock(f: FeatureRecord): UnderwaterRock {
  return {
    ...baseFields(f, 'UWTROC'),
    objectClass: 'UWTROC',
    valsou: floatAttr(f.attributes, ATTL.VALSOU),
    watlev: intAttr(f.attributes, ATTL.WATLEV),
  };
}

function buildRestrictedArea(f: FeatureRecord): RestrictedArea {
  return {
    ...baseFields(f, 'RESARE'),
    objectClass: 'RESARE',
    catrea: intAttr(f.attributes, ATTL.CATREA),
    restrn: listAttr(f.attributes, ATTL.RESTRN),
    status: listAttr(f.attributes, ATTL.STATUS),
  };
}

function buildBridge(f: FeatureRecord): Bridge {
  return {
    ...baseFields(f, 'BRIDGE'),
    objectClass: 'BRIDGE',
    catbrg: intAttr(f.attributes, ATTL.CATBRG),
    verclr: floatAttr(f.attributes, ATTL.VERCLR),
    verccl: floatAttr(f.attributes, 179), // VERCCL
    vercop: floatAttr(f.attributes, 180), // VERCOP
    horclr: floatAttr(f.attributes, ATTL.HORCLR),
    condition: intAttr(f.attributes, ATTL.CONDTN),
  };
}

function buildLandmark(f: FeatureRecord): Landmark {
  return {
    ...baseFields(f, 'LNDMRK'),
    objectClass: 'LNDMRK',
    catlmk: intAttr(f.attributes, ATTL.CATLMK),
    colour: listAttr(f.attributes, ATTL.COLOUR),
    convis: intAttr(f.attributes, ATTL.CONVIS),
    height: floatAttr(f.attributes, ATTL.HEIGHT),
    elevation: floatAttr(f.attributes, ATTL.ELEVAT),
    condition: intAttr(f.attributes, ATTL.CONDTN),
  };
}

function buildAnchorageArea(f: FeatureRecord): AnchorageArea {
  return {
    ...baseFields(f, 'ACHARE'),
    objectClass: 'ACHARE',
    catanc: intAttr(f.attributes, ATTL.CATANC),
    restrn: listAttr(f.attributes, ATTL.RESTRN),
    status: listAttr(f.attributes, ATTL.STATUS),
  };
}

// ─── OBJL -> builder dispatch ─────────────────────────

const BUILDERS: ReadonlyMap<number, (f: FeatureRecord) => TypedFeature> = new Map([
  [OBJL.DEPARE, buildDepthArea],
  [OBJL.DEPCNT, buildDepthContour],
  [OBJL.SOUNDG, buildSounding],
  [OBJL.COALNE, buildCoastline],
  [OBJL.LNDARE, buildLandArea],
  [OBJL.LIGHTS, buildLight],
  [OBJL.BCNCAR, buildBeacon],
  [OBJL.BCNLAT, buildBeacon],
  [OBJL.BOYCAR, buildBuoy],
  [OBJL.BOYLAT, buildBuoy],
  [OBJL.BOYSAW, buildBuoy],
  [OBJL.BOYSPP, buildBuoy],
  [OBJL.OBSTRN, buildObstruction],
  [OBJL.WRECKS, buildWreck],
  [OBJL.UWTROC, buildUnderwaterRock],
  [OBJL.RESARE, buildRestrictedArea],
  [OBJL.BRIDGE, buildBridge],
  [OBJL.LNDMRK, buildLandmark],
  [OBJL.ACHARE, buildAnchorageArea],
]);

// ─── Public API ───────────────────────────────────────

/**
 * Convert a raw FeatureRecord to a typed feature with parsed attributes.
 * Returns undefined for unrecognized OBJL codes.
 */
export function typedFeature(f: FeatureRecord): TypedFeature | undefined {
  const builder = BUILDERS.get(f.objl);
  return builder ? builder(f) : undefined;
}

/**
 * Convert all features in a dataset to typed features.
 * Unrecognized object classes are skipped.
 */
export function typedFeatures(features: FeatureRecord[]): TypedFeature[] {
  const result: TypedFeature[] = [];
  for (const f of features) {
    const typed = typedFeature(f);
    if (typed) result.push(typed);
  }
  return result;
}

/**
 * Filter typed features by object class.
 * Returns a narrowed array of the specific typed feature.
 *
 * @example
 * const lights = filterByClass(typed, 'LIGHTS');
 * // lights is Light[], with litchr, sigper, etc.
 */
export function filterByClass<C extends TypedFeature['objectClass']>(
  features: TypedFeature[],
  objectClass: C,
): Extract<TypedFeature, { objectClass: C }>[] {
  return features.filter(f => f.objectClass === objectClass) as Extract<TypedFeature, { objectClass: C }>[];
}
