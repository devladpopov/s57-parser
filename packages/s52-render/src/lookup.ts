/**
 * S-52 Lookup Table: maps S-57 object class codes (OBJL) to rendering instructions.
 *
 * This is a simplified version of the full S-52 Presentation Library.
 * Real S-52 uses conditional symbology procedures (CSP) for objects
 * like DEPARE, SOUNDG, LIGHTS. Here we use direct lookup with
 * depth-based coloring for DEPARE.
 */

import { ATTL } from '@s57-parser/s57';

export type SymbolType = 'area' | 'line' | 'point' | 'text';

export interface RenderInstruction {
  type: SymbolType;
  /** Fill color token (for areas) */
  fill?: string;
  /** Fill opacity 0..1 */
  fillAlpha?: number;
  /** Stroke color token */
  stroke?: string;
  /** Stroke width in pixels */
  strokeWidth?: number;
  /** Dash pattern (array of [dash, gap] lengths) */
  dashPattern?: number[];
  /** Point radius in pixels */
  radius?: number;
  /** Point shape */
  shape?: 'circle' | 'triangle' | 'square' | 'diamond';
  /** Display priority (0=bottom, 9=top). S-52 uses 0-9. */
  priority: number;
  /** Human-readable name */
  description?: string;

  // ─── Text label ──────────────────────
  /** ATTL code to use as text label (e.g. 174=VALSOU for soundings) */
  textAttl?: number;
  /** Color token for text */
  textColor?: string;
  /** Font size in pixels */
  textSize?: number;
  /** Text alignment */
  textAlign?: CanvasTextAlign;
  /** Text vertical offset in pixels (positive = down) */
  textOffsetY?: number;
  /** Format function name for text value ('depth'|'depthContour'|'lightChar') */
  textFormat?: 'depth' | 'depthContour' | 'lightChar';

  // ─── Sector light ────────────────────
  /** Whether this object can render sector arcs */
  sectorLight?: boolean;
  /** Arc radius for sector lights */
  sectorRadius?: number;

  // ─── Pattern fill ────────────────────
  /** Pattern type for area fill */
  pattern?: 'hatch' | 'cross-hatch' | 'stipple';
  /** Pattern spacing in pixels */
  patternSpacing?: number;
  /** Pattern color token */
  patternColor?: string;
}

/**
 * S-57 OBJL codes for the most common navigational objects.
 * Full catalogue has 200+ codes; these cover ~90% of typical chart content.
 */
export const OBJL = {
  ADMARE: 1,    // Administration area
  ACHBRT: 2,    // Anchorage berth
  ACHARE: 3,    // Anchorage area
  BCNCAR: 5,    // Beacon, cardinal
  BCNLAT: 8,    // Beacon, lateral
  BERTHS: 11,   // Berth
  BRIDGE: 12,   // Bridge
  BUISGL: 13,   // Built-up area (single)
  BUAARE: 14,   // Built-up area
  BOYCAR: 15,   // Buoy, cardinal
  BOYLAT: 17,   // Buoy, lateral
  BOYSAW: 19,   // Buoy, safe water
  BOYSPP: 20,   // Buoy, special purpose
  CBLOHD: 21,   // Cable overhead
  CBLSUB: 22,   // Cable submarine
  CANALS: 23,   // Canal
  COALNE: 30,   // Coastline
  CONZNE: 31,   // Contiguous zone
  DEPARE: 42,   // Depth area
  DEPCNT: 43,   // Depth contour
  DMPGRD: 46,   // Dumping ground
  DWRTCL: 48,   // Deep water route centerline
  FAIRWY: 49,   // Fairway
  FERYRT: 51,   // Ferry route
  FSHZNE: 54,   // Fishery zone
  FOGSIG: 55,   // Fog signal
  GATCON: 57,   // Gate
  LNDARE: 71,   // Land area
  LNDELV: 72,   // Land elevation
  LIGHTS: 75,   // Light
  LITFLT: 76,   // Light float
  LNDMRK: 77,   // Landmark
  LOKBSN: 78,   // Lock basin
  MAGVAR: 79,   // Magnetic variation
  MARCUL: 81,   // Marine farm/culture
  MIPARE: 83,   // Military practice area
  MORFAC: 84,   // Mooring facility
  OBSTRN: 86,   // Obstruction
  OFSPLF: 87,   // Offshore platform
  OSPARE: 89,   // Offshore production area
  PILBOP: 90,   // Pilot boarding place
  PILPNT: 91,   // Pile
  PIPOHD: 92,   // Pipeline overhead
  PIPSOL: 93,   // Pipeline submarine
  PRDARE: 95,   // Production area
  RAILWY: 97,   // Railway
  RECTRC: 98,   // Recommended track
  RESARE: 112,  // Restricted area
  RIVERS: 114,  // River
  ROADWY: 116,  // Road
  RUNWAY: 117,  // Runway
  SBDARE: 119,  // Seabed area
  SLCONS: 122,  // Shoreline construction
  SLOGRD: 123,  // Sloping ground
  SOUNDG: 129,  // Sounding
  SPRING: 131,  // Spring
  SWPARE: 134,  // Swept area
  TOPMAR: 144,  // Top mark
  TSELNE: 148,  // Traffic separation line
  TSEZNE: 149,  // Traffic separation zone
  TSSBND: 150,  // TSS boundary
  TSSCRS: 151,  // TSS crossing
  TSSRON: 152,  // TSS roundabout
  TWRTPT: 153,  // Two-way route part
  UWTROC: 154,  // Underwater rock
  WATTUR: 155,  // Water turbulence
  WRECKS: 159,  // Wrecks
  M_COVR: 302,  // Coverage
  M_CSCL: 303,  // Compilation scale
  M_HOPA: 304,  // Horizontal datum shift
  M_NPUB: 305,  // Nautical publication info
  M_NSYS: 306,  // Navigational system of marks
  M_QUAL: 308,  // Quality of data
  M_SDAT: 309,  // Sounding datum
  M_SREL: 310,  // Survey reliability
  M_VDAT: 312,  // Vertical datum
} as const;

/**
 * Default lookup table for S-52 rendering.
 * Maps OBJL code to rendering instructions.
 */
export const LOOKUP_TABLE: Map<number, RenderInstruction> = new Map([
  // ─── Depth areas (priority varies by depth) ──────────
  [OBJL.DEPARE, {
    type: 'area', fill: 'DEPMD', fillAlpha: 1.0,
    stroke: 'DEPSC', strokeWidth: 0.3, priority: 1,
    description: 'Depth area',
  }],

  // ─── Land ────────────────────────────────────────────
  [OBJL.LNDARE, {
    type: 'area', fill: 'LANDA', fillAlpha: 1.0,
    stroke: 'CSTLN', strokeWidth: 0.5, priority: 2,
    description: 'Land area',
  }],
  [OBJL.BUAARE, {
    type: 'area', fill: 'LANDF', fillAlpha: 0.6,
    stroke: 'CHBLK', strokeWidth: 0.3, priority: 3,
    description: 'Built-up area',
  }],
  [OBJL.SLOGRD, {
    type: 'area', fill: 'LANDA', fillAlpha: 0.5,
    priority: 1, description: 'Sloping ground',
  }],

  // ─── Coastline and shoreline ─────────────────────────
  [OBJL.COALNE, {
    type: 'line', stroke: 'CSTLN', strokeWidth: 1.5,
    priority: 5, description: 'Coastline',
  }],
  [OBJL.SLCONS, {
    type: 'line', stroke: 'CSTLN', strokeWidth: 1.2,
    priority: 5, description: 'Shoreline construction',
  }],

  // ─── Depth contours ──────────────────────────────────
  [OBJL.DEPCNT, {
    type: 'line', stroke: 'DEPSC', strokeWidth: 0.5,
    priority: 3, description: 'Depth contour',
    textAttl: ATTL.VALDCO, textColor: 'DEPSC', textSize: 9,
    textFormat: 'depthContour',
  }],

  // ─── Soundings ───────────────────────────────────────
  [OBJL.SOUNDG, {
    type: 'point', fill: 'SNDG1', radius: 1.5,
    shape: 'circle', priority: 6,
    description: 'Sounding',
    textAttl: ATTL.VALSOU, textColor: 'SNDG1', textSize: 8,
    textFormat: 'depth', textOffsetY: -4,
  }],

  // ─── Obstructions and dangers ────────────────────────
  [OBJL.OBSTRN, {
    type: 'point', fill: 'ISDNG', stroke: 'CHRED',
    radius: 3, shape: 'diamond', strokeWidth: 1,
    priority: 7, description: 'Obstruction',
  }],
  [OBJL.UWTROC, {
    type: 'point', fill: 'ISDNG', stroke: 'CHRED',
    radius: 3, shape: 'diamond', strokeWidth: 1,
    priority: 7, description: 'Underwater rock',
  }],
  [OBJL.WRECKS, {
    type: 'point', fill: 'ISDNG', stroke: 'CHRED',
    radius: 4, shape: 'diamond', strokeWidth: 1.5,
    priority: 7, description: 'Wreck',
  }],

  // ─── Aids to navigation ──────────────────────────────
  [OBJL.BOYCAR, {
    type: 'point', fill: 'CHYLW', stroke: 'CHBLK',
    radius: 3, shape: 'triangle', strokeWidth: 0.8,
    priority: 8, description: 'Buoy, cardinal',
  }],
  [OBJL.BOYLAT, {
    type: 'point', fill: 'CHGRN', stroke: 'CHBLK',
    radius: 3, shape: 'triangle', strokeWidth: 0.8,
    priority: 8, description: 'Buoy, lateral',
  }],
  [OBJL.BOYSAW, {
    type: 'point', fill: 'CHRED', stroke: 'CHBLK',
    radius: 3, shape: 'circle', strokeWidth: 0.8,
    priority: 8, description: 'Buoy, safe water',
  }],
  [OBJL.BOYSPP, {
    type: 'point', fill: 'CHYLW', stroke: 'CHBLK',
    radius: 3, shape: 'circle', strokeWidth: 0.8,
    priority: 8, description: 'Buoy, special purpose',
  }],
  [OBJL.BCNCAR, {
    type: 'point', fill: 'CHYLW', stroke: 'CHBLK',
    radius: 3, shape: 'square', strokeWidth: 0.8,
    priority: 8, description: 'Beacon, cardinal',
  }],
  [OBJL.BCNLAT, {
    type: 'point', fill: 'CHGRN', stroke: 'CHBLK',
    radius: 3, shape: 'square', strokeWidth: 0.8,
    priority: 8, description: 'Beacon, lateral',
  }],
  [OBJL.LIGHTS, {
    type: 'point', fill: 'LITYW', radius: 4,
    shape: 'circle', priority: 8,
    description: 'Light',
    sectorLight: true, sectorRadius: 20,
    textFormat: 'lightChar', textColor: 'CHBLK', textSize: 7,
    textOffsetY: 10,
  }],

  // ─── Restricted/regulated areas ──────────────────────
  [OBJL.RESARE, {
    type: 'area', fill: 'TRFCF', fillAlpha: 0.3,
    stroke: 'TRFCD', strokeWidth: 0.8,
    dashPattern: [6, 3], priority: 3,
    description: 'Restricted area',
    pattern: 'hatch', patternSpacing: 8, patternColor: 'TRFCD',
  }],
  [OBJL.ACHARE, {
    type: 'area', fill: 'RESBL', fillAlpha: 0.15,
    stroke: 'CHMGD', strokeWidth: 0.8,
    dashPattern: [8, 4], priority: 3,
    description: 'Anchorage area',
  }],
  [OBJL.DMPGRD, {
    type: 'area', fill: 'CHBRN', fillAlpha: 0.2,
    stroke: 'CHBRN', strokeWidth: 0.5,
    dashPattern: [4, 4], priority: 2,
    description: 'Dumping ground',
    pattern: 'stipple', patternSpacing: 6, patternColor: 'CHBRN',
  }],
  [OBJL.FAIRWY, {
    type: 'area', fill: 'DEPMD', fillAlpha: 0.2,
    stroke: 'CHGRD', strokeWidth: 0.5,
    dashPattern: [10, 5], priority: 2,
    description: 'Fairway',
  }],

  // ─── Traffic separation ──────────────────────────────
  [OBJL.TSEZNE, {
    type: 'area', fill: 'TRFCF', fillAlpha: 0.3,
    stroke: 'TRFCD', strokeWidth: 1, priority: 4,
    description: 'TSS zone',
  }],
  [OBJL.TSELNE, {
    type: 'line', stroke: 'TRFCD', strokeWidth: 1.5,
    priority: 5, description: 'TSS line',
  }],

  // ─── Infrastructure ──────────────────────────────────
  [OBJL.BRIDGE, {
    type: 'line', stroke: 'CHGRD', strokeWidth: 2,
    priority: 6, description: 'Bridge',
  }],
  [OBJL.CBLOHD, {
    type: 'line', stroke: 'CHMGD', strokeWidth: 0.8,
    dashPattern: [2, 4], priority: 5,
    description: 'Cable overhead',
  }],
  [OBJL.CBLSUB, {
    type: 'line', stroke: 'CHMGD', strokeWidth: 0.5,
    dashPattern: [4, 2], priority: 4,
    description: 'Cable submarine',
  }],
  [OBJL.PIPSOL, {
    type: 'line', stroke: 'CHMGD', strokeWidth: 0.8,
    dashPattern: [6, 2, 2, 2], priority: 4,
    description: 'Pipeline submarine',
  }],

  // ─── Meta objects (lower priority) ───────────────────
  [OBJL.M_COVR, {
    type: 'area', stroke: 'CHGRD', strokeWidth: 0.3,
    fillAlpha: 0, priority: 0,
    description: 'Coverage area',
  }],
  [OBJL.M_QUAL, {
    type: 'area', stroke: 'CHGRD', strokeWidth: 0.2,
    fillAlpha: 0, dashPattern: [3, 3], priority: 0,
    description: 'Quality of data',
  }],
  [OBJL.M_NPUB, {
    type: 'area', fillAlpha: 0, priority: 0,
    description: 'Nautical publication info',
  }],
  [OBJL.M_NSYS, {
    type: 'area', fillAlpha: 0, priority: 0,
    description: 'Navigational system of marks',
  }],

  // ─── Seabed and marine farms ─────────────────────────
  [OBJL.SBDARE, {
    type: 'area', fill: 'DEPMD', fillAlpha: 0.15,
    priority: 1, description: 'Seabed area',
  }],
  [OBJL.MARCUL, {
    type: 'area', fill: 'CHBRN', fillAlpha: 0.2,
    stroke: 'CHBRN', strokeWidth: 0.5, priority: 3,
    description: 'Marine farm/culture',
    pattern: 'cross-hatch', patternSpacing: 10, patternColor: 'CHBRN',
  }],

  // ─── Rivers, canals ─────────────────────────────────
  [OBJL.RIVERS, {
    type: 'area', fill: 'DEPVS', fillAlpha: 0.8,
    stroke: 'DEPSC', strokeWidth: 0.5, priority: 2,
    description: 'River',
  }],
  [OBJL.CANALS, {
    type: 'area', fill: 'DEPVS', fillAlpha: 0.8,
    stroke: 'DEPSC', strokeWidth: 0.5, priority: 2,
    description: 'Canal',
  }],
]);

/** Default fallback rendering for unknown OBJL codes */
export const DEFAULT_INSTRUCTION: RenderInstruction = {
  type: 'line', stroke: 'CHGRD', strokeWidth: 0.5,
  priority: 1, description: 'Unknown object',
};

// ATTL codes imported from @s57-parser/s57 (IHO S-57 standard)
export { ATTL } from '@s57-parser/s57';

/** S-52 LITCHR code to abbreviation (IHO standard) */
const LITCHR_ABBR: Record<string, string> = {
  '1': 'F',    // Fixed
  '2': 'Fl',   // Flashing
  '3': 'LFl',  // Long-flashing
  '4': 'Q',    // Quick
  '5': 'VQ',   // Very quick
  '6': 'UQ',   // Ultra quick
  '7': 'Iso',  // Isophase
  '8': 'Oc',   // Occulting
  '9': 'IQ',   // Interrupted quick
  '10': 'IVQ', // Interrupted very quick
  '11': 'IUQ', // Interrupted ultra quick
  '12': 'Mo',  // Morse code
  '13': 'FFl', // Fixed/flashing
  '14': 'Fl+LFl', // Flashing + long-flashing
  '15': 'Oc+Fl',  // Occulting + flashing
  '16': 'F+LFl',  // Fixed + long-flashing
  '17': 'Al.Oc',  // Alternating occulting
  '18': 'Al.LFl', // Alternating long-flashing
  '19': 'Al.Fl',  // Alternating flashing
  '25': 'Q+LFl',  // Quick + long-flashing
  '26': 'VQ+LFl', // Very quick + long-flashing
  '27': 'UQ+LFl', // Ultra quick + long-flashing
  '28': 'Al',     // Alternating
  '29': 'Al.FFl', // Alternating fixed/flashing
};

/** Map S-57 COLOUR code to light color token */
export function lightColorToken(colourCode: string | undefined): string {
  switch (colourCode) {
    case '1': return 'LITYW';  // White → yellow on chart
    case '3': return 'LITRD';  // Red
    case '4': return 'LITGN';  // Green
    case '6': return 'LITYW';  // Yellow
    case '11': return 'LITYW'; // Orange → yellow
    default: return 'LITYW';
  }
}

/**
 * Format a depth value for chart display (S-52 style).
 * Whole meters: "12". Decimeters: "12₃" (subscript last digit).
 */
export function formatDepth(value: string | number): string {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(num)) return '';
  const abs = Math.abs(num);
  const whole = Math.floor(abs);
  const frac = Math.round((abs - whole) * 10);
  if (frac === 0) return num < 0 ? `-${whole}` : `${whole}`;
  return num < 0 ? `-${whole}.${frac}` : `${whole}.${frac}`;
}

/**
 * Format light characteristic label (S-52 style).
 * Example: "Fl(3) 10s" for flashing, group of 3, period 10s.
 */
export function formatLightChar(attrs: Map<number, string>): string {
  const litchr = attrs.get(ATTL.LITCHR);
  const sigper = attrs.get(ATTL.SIGPER);
  if (!litchr) return '';
  const abbr = LITCHR_ABBR[litchr] ?? `?${litchr}`;
  const parts = [abbr];
  if (sigper) parts.push(`${sigper}s`);
  return parts.join(' ');
}

/**
 * Get the depth-dependent fill color for a DEPARE feature.
 * Uses DRVAL1 (minimum depth) and DRVAL2 (maximum depth) attributes.
 */
export function depareColor(drval1: number, drval2: number): string {
  if (drval1 < 0) return 'DEPIT';        // Intertidal (dries)
  if (drval2 <= 5) return 'DEPVS';       // Very shallow (0-5m)
  if (drval2 <= 10) return 'DEPMS';      // Medium shallow (5-10m)
  if (drval2 <= 20) return 'DEPMD';      // Medium (10-20m)
  return 'DEPDW';                          // Deep (20m+)
}

/**
 * Look up rendering instruction for an S-57 feature.
 * Handles conditional symbology for DEPARE and LIGHTS.
 */
export function lookupInstruction(
  objl: number,
  attributes?: Map<number, string>
): RenderInstruction {
  const base = LOOKUP_TABLE.get(objl);
  if (!base) return DEFAULT_INSTRUCTION;

  // Conditional symbology for DEPARE
  if (objl === OBJL.DEPARE && attributes) {
    const drval1Str = attributes.get(ATTL.DRVAL1);
    const drval2Str = attributes.get(ATTL.DRVAL2);
    const drval1 = drval1Str != null ? parseFloat(drval1Str) : 0;
    const drval2 = drval2Str != null ? parseFloat(drval2Str) : 100;
    return { ...base, fill: depareColor(drval1, drval2) };
  }

  // Conditional symbology for LIGHTS: color depends on COLOUR attribute
  if (objl === OBJL.LIGHTS && attributes) {
    const colour = attributes.get(ATTL.COLOUR);
    return { ...base, fill: lightColorToken(colour) };
  }

  return base;
}
