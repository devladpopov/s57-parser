/**
 * S-52 IHO standard color palette.
 *
 * Three display modes: DAY_BRIGHT, DUSK, NIGHT.
 * Color tokens map to specific meanings in chart display.
 */

export type DisplayMode = 'DAY_BRIGHT' | 'DUSK' | 'NIGHT';

export interface RGB { r: number; g: number; b: number; }

/** S-52 named color tokens used throughout the Presentation Library */
export const COLOR_TOKENS = {
  // Background
  NODTA: 'NODTA',   // No data / chart background
  DEPVS: 'DEPVS',   // Very shallow depth area
  DEPIT: 'DEPIT',   // Intertidal depth area
  DEPMS: 'DEPMS',   // Medium-shallow depth area
  DEPMD: 'DEPMD',   // Medium depth area
  DEPDW: 'DEPDW',   // Deep water
  // Land
  LANDA: 'LANDA',   // Land area
  LANDF: 'LANDF',   // Land feature
  // Infrastructure
  CHGRD: 'CHGRD',   // Chart grid
  CHBLK: 'CHBLK',   // Chart black (text, lines)
  CHBRN: 'CHBRN',   // Chart brown
  CHMGD: 'CHMGD',   // Chart magenta (danger)
  CHRED: 'CHRED',   // Chart red
  CHGRN: 'CHGRN',   // Chart green
  CHYLW: 'CHYLW',   // Chart yellow
  CSTLN: 'CSTLN',   // Coastline
  SNDG1: 'SNDG1',   // Sounding shallow
  SNDG2: 'SNDG2',   // Sounding deep
  DEPSC: 'DEPSC',   // Depth contour
  RESBL: 'RESBL',   // Restricted area blue
  APTS:  'APTS',    // Approximate position
  OUTLW: 'OUTLW',   // Outline
  OUTLL: 'OUTLL',   // Outline light
  RADHI: 'RADHI',   // Radar highlight
  LITRD: 'LITRD',   // Light red
  LITGN: 'LITGN',   // Light green
  LITYW: 'LITYW',   // Light yellow
  ISDNG: 'ISDNG',   // Isolated danger
  TRFCF: 'TRFCF',   // Traffic zone fill
  TRFCD: 'TRFCD',   // Traffic zone dark
} as const;

export type ColorToken = keyof typeof COLOR_TOKENS;

/** Day Bright color palette — primary display mode */
const DAY_BRIGHT: Record<string, RGB> = {
  NODTA: { r: 163, g: 180, b: 183 },
  DEPVS: { r: 171, g: 217, b: 227 },
  DEPIT: { r: 135, g: 199, b: 179 },
  DEPMS: { r: 184, g: 226, b: 233 },
  DEPMD: { r: 198, g: 231, b: 237 },
  DEPDW: { r: 219, g: 241, b: 245 },
  LANDA: { r: 201, g: 185, b: 155 },
  LANDF: { r: 181, g: 165, b: 135 },
  CHGRD: { r: 130, g: 130, b: 130 },
  CHBLK: { r: 0,   g: 0,   b: 0   },
  CHBRN: { r: 140, g: 100, b: 55  },
  CHMGD: { r: 215, g: 80,  b: 115 },
  CHRED: { r: 200, g: 50,  b: 50  },
  CHGRN: { r: 0,   g: 135, b: 70  },
  CHYLW: { r: 230, g: 205, b: 50  },
  CSTLN: { r: 84,  g: 56,  b: 35  },
  SNDG1: { r: 70,  g: 70,  b: 70  },
  SNDG2: { r: 100, g: 100, b: 100 },
  DEPSC: { r: 80,  g: 128, b: 176 },
  RESBL: { r: 160, g: 200, b: 240 },
  APTS:  { r: 140, g: 130, b: 120 },
  OUTLW: { r: 0,   g: 0,   b: 0   },
  OUTLL: { r: 90,  g: 90,  b: 90  },
  RADHI: { r: 0,   g: 200, b: 0   },
  LITRD: { r: 255, g: 0,   b: 0   },
  LITGN: { r: 0,   g: 200, b: 0   },
  LITYW: { r: 255, g: 255, b: 0   },
  ISDNG: { r: 255, g: 0,   b: 0   },
  TRFCF: { r: 190, g: 175, b: 215 },
  TRFCD: { r: 130, g: 100, b: 170 },
};

/** Dusk palette — reduced brightness for twilight */
const DUSK: Record<string, RGB> = {
  NODTA: { r: 68,  g: 73,  b: 78  },
  DEPVS: { r: 50,  g: 80,  b: 100 },
  DEPIT: { r: 45,  g: 75,  b: 68  },
  DEPMS: { r: 55,  g: 85,  b: 105 },
  DEPMD: { r: 60,  g: 90,  b: 108 },
  DEPDW: { r: 65,  g: 95,  b: 112 },
  LANDA: { r: 85,  g: 75,  b: 62  },
  LANDF: { r: 75,  g: 65,  b: 52  },
  CHGRD: { r: 80,  g: 80,  b: 80  },
  CHBLK: { r: 180, g: 180, b: 180 },
  CHBRN: { r: 110, g: 80,  b: 45  },
  CHMGD: { r: 170, g: 60,  b: 90  },
  CHRED: { r: 160, g: 40,  b: 40  },
  CHGRN: { r: 0,   g: 100, b: 50  },
  CHYLW: { r: 180, g: 160, b: 40  },
  CSTLN: { r: 110, g: 90,  b: 70  },
  SNDG1: { r: 160, g: 160, b: 160 },
  SNDG2: { r: 140, g: 140, b: 140 },
  DEPSC: { r: 50,  g: 85,  b: 120 },
  RESBL: { r: 70,  g: 100, b: 130 },
  APTS:  { r: 100, g: 90,  b: 80  },
  OUTLW: { r: 180, g: 180, b: 180 },
  OUTLL: { r: 120, g: 120, b: 120 },
  RADHI: { r: 0,   g: 150, b: 0   },
  LITRD: { r: 200, g: 0,   b: 0   },
  LITGN: { r: 0,   g: 150, b: 0   },
  LITYW: { r: 200, g: 200, b: 0   },
  ISDNG: { r: 200, g: 0,   b: 0   },
  TRFCF: { r: 80,  g: 70,  b: 100 },
  TRFCD: { r: 60,  g: 50,  b: 80  },
};

/** Night palette — very dark, red-tinted for night vision */
const NIGHT: Record<string, RGB> = {
  NODTA: { r: 10,  g: 10,  b: 10  },
  DEPVS: { r: 8,   g: 20,  b: 35  },
  DEPIT: { r: 6,   g: 18,  b: 15  },
  DEPMS: { r: 10,  g: 22,  b: 38  },
  DEPMD: { r: 12,  g: 25,  b: 42  },
  DEPDW: { r: 14,  g: 28,  b: 46  },
  LANDA: { r: 25,  g: 20,  b: 12  },
  LANDF: { r: 20,  g: 16,  b: 10  },
  CHGRD: { r: 40,  g: 40,  b: 40  },
  CHBLK: { r: 120, g: 80,  b: 80  },
  CHBRN: { r: 60,  g: 40,  b: 20  },
  CHMGD: { r: 120, g: 30,  b: 50  },
  CHRED: { r: 100, g: 20,  b: 20  },
  CHGRN: { r: 0,   g: 60,  b: 30  },
  CHYLW: { r: 100, g: 90,  b: 20  },
  CSTLN: { r: 60,  g: 45,  b: 30  },
  SNDG1: { r: 100, g: 70,  b: 70  },
  SNDG2: { r: 80,  g: 55,  b: 55  },
  DEPSC: { r: 20,  g: 40,  b: 70  },
  RESBL: { r: 25,  g: 40,  b: 60  },
  APTS:  { r: 50,  g: 40,  b: 35  },
  OUTLW: { r: 120, g: 80,  b: 80  },
  OUTLL: { r: 60,  g: 40,  b: 40  },
  RADHI: { r: 0,   g: 80,  b: 0   },
  LITRD: { r: 120, g: 0,   b: 0   },
  LITGN: { r: 0,   g: 80,  b: 0   },
  LITYW: { r: 120, g: 120, b: 0   },
  ISDNG: { r: 120, g: 0,   b: 0   },
  TRFCF: { r: 30,  g: 25,  b: 40  },
  TRFCD: { r: 20,  g: 15,  b: 30  },
};

const PALETTES: Record<DisplayMode, Record<string, RGB>> = {
  DAY_BRIGHT,
  DUSK,
  NIGHT,
};

/** Resolve a color token to RGB for the given display mode. */
export function resolveColor(token: string, mode: DisplayMode = 'DAY_BRIGHT'): RGB {
  return PALETTES[mode][token] ?? { r: 128, g: 128, b: 128 };
}

/** Convert RGB to CSS color string. */
export function rgbToCSS(rgb: RGB, alpha: number = 1): string {
  if (alpha >= 1) return `rgb(${rgb.r},${rgb.g},${rgb.b})`;
  return `rgba(${rgb.r},${rgb.g},${rgb.b},${alpha.toFixed(2)})`;
}
