import { describe, it, expect } from 'bun:test';
import { resolveColor, rgbToCSS } from '../src/colors.js';
import { lookupInstruction, depareColor, lightColorToken, formatDepth, formatLightChar, OBJL, ATTL } from '../src/lookup.js';

describe('S-52 color palette', () => {
  it('should resolve known color tokens for DAY_BRIGHT', () => {
    const land = resolveColor('LANDA', 'DAY_BRIGHT');
    expect(land.r).toBeGreaterThan(150);
    expect(land.g).toBeGreaterThan(100);
  });

  it('should resolve NIGHT colors as dark', () => {
    const land = resolveColor('LANDA', 'NIGHT');
    expect(land.r).toBeLessThan(50);
    expect(land.g).toBeLessThan(50);
    expect(land.b).toBeLessThan(50);
  });

  it('should return grey for unknown tokens', () => {
    const c = resolveColor('NONEXISTENT', 'DAY_BRIGHT');
    expect(c.r).toBe(128);
    expect(c.g).toBe(128);
  });

  it('should format RGB as CSS string', () => {
    expect(rgbToCSS({ r: 255, g: 0, b: 128 })).toBe('rgb(255,0,128)');
    expect(rgbToCSS({ r: 255, g: 0, b: 128 }, 0.5)).toBe('rgba(255,0,128,0.50)');
  });
});

describe('S-52 lookup table', () => {
  it('should return area instruction for DEPARE', () => {
    const instr = lookupInstruction(OBJL.DEPARE);
    expect(instr.type).toBe('area');
    expect(instr.fill).toBeDefined();
    expect(instr.priority).toBeGreaterThan(0);
  });

  it('should return line instruction for COALNE', () => {
    const instr = lookupInstruction(OBJL.COALNE);
    expect(instr.type).toBe('line');
    expect(instr.stroke).toBe('CSTLN');
    expect(instr.strokeWidth).toBeGreaterThan(0);
  });

  it('should return point instruction for SOUNDG', () => {
    const instr = lookupInstruction(OBJL.SOUNDG);
    expect(instr.type).toBe('point');
    expect(instr.shape).toBe('circle');
  });

  it('should return point instruction for LIGHTS', () => {
    const instr = lookupInstruction(OBJL.LIGHTS);
    expect(instr.type).toBe('point');
    expect(instr.fill).toBe('LITYW');
  });

  it('should return fallback for unknown OBJL', () => {
    const instr = lookupInstruction(99999);
    expect(instr.type).toBe('line');
    expect(instr.description).toBe('Unknown object');
  });
});

describe('DEPARE depth-dependent coloring', () => {
  it('should return DEPIT for intertidal (negative depth)', () => {
    expect(depareColor(-2, 0)).toBe('DEPIT');
  });

  it('should return DEPVS for very shallow (0-5m)', () => {
    expect(depareColor(0, 5)).toBe('DEPVS');
  });

  it('should return DEPMS for medium shallow (5-10m)', () => {
    expect(depareColor(5, 10)).toBe('DEPMS');
  });

  it('should return DEPMD for medium depth (10-20m)', () => {
    expect(depareColor(10, 20)).toBe('DEPMD');
  });

  it('should return DEPDW for deep water (20m+)', () => {
    expect(depareColor(20, 100)).toBe('DEPDW');
  });

  it('should apply conditional coloring with attributes', () => {
    const attrs = new Map<number, string>();
    attrs.set(87, '0');  // DRVAL1
    attrs.set(88, '3');  // DRVAL2
    const instr = lookupInstruction(OBJL.DEPARE, attrs);
    expect(instr.fill).toBe('DEPVS'); // 0-3m = very shallow
  });
});

describe('LIGHTS conditional symbology', () => {
  it('should return red color for red lights', () => {
    const attrs = new Map<number, string>();
    attrs.set(ATTL.COLOUR, '3'); // Red
    const instr = lookupInstruction(OBJL.LIGHTS, attrs);
    expect(instr.fill).toBe('LITRD');
  });

  it('should return green color for green lights', () => {
    const attrs = new Map<number, string>();
    attrs.set(ATTL.COLOUR, '4'); // Green
    const instr = lookupInstruction(OBJL.LIGHTS, attrs);
    expect(instr.fill).toBe('LITGN');
  });

  it('should return yellow for white lights (standard chart convention)', () => {
    const attrs = new Map<number, string>();
    attrs.set(ATTL.COLOUR, '1'); // White
    const instr = lookupInstruction(OBJL.LIGHTS, attrs);
    expect(instr.fill).toBe('LITYW');
  });

  it('should have sector light enabled', () => {
    const instr = lookupInstruction(OBJL.LIGHTS);
    expect(instr.sectorLight).toBe(true);
    expect(instr.sectorRadius).toBeGreaterThan(0);
  });
});

describe('lightColorToken', () => {
  it('should map standard color codes', () => {
    expect(lightColorToken('1')).toBe('LITYW');  // White
    expect(lightColorToken('3')).toBe('LITRD');  // Red
    expect(lightColorToken('4')).toBe('LITGN');  // Green
    expect(lightColorToken('6')).toBe('LITYW');  // Yellow
  });

  it('should default to yellow for unknown', () => {
    expect(lightColorToken(undefined)).toBe('LITYW');
    expect(lightColorToken('99')).toBe('LITYW');
  });
});

describe('formatDepth', () => {
  it('should format whole meters', () => {
    expect(formatDepth(12)).toBe('12');
    expect(formatDepth('5')).toBe('5');
  });

  it('should format fractional depths', () => {
    expect(formatDepth(3.7)).toBe('3.7');
    expect(formatDepth('12.3')).toBe('12.3');
  });

  it('should format negative (drying) depths', () => {
    expect(formatDepth(-2)).toBe('-2');
    expect(formatDepth(-0.5)).toBe('-0.5');
  });

  it('should return empty for NaN', () => {
    expect(formatDepth('abc')).toBe('');
  });

  it('should handle zero', () => {
    expect(formatDepth(0)).toBe('0');
  });
});

describe('formatLightChar', () => {
  it('should format basic light characteristic', () => {
    const attrs = new Map<number, string>();
    attrs.set(ATTL.LITCHR, '2'); // Flashing
    expect(formatLightChar(attrs)).toBe('Fl');
  });

  it('should include period', () => {
    const attrs = new Map<number, string>();
    attrs.set(ATTL.LITCHR, '2'); // Flashing
    attrs.set(ATTL.SIGPER, '10');
    expect(formatLightChar(attrs)).toBe('Fl 10s');
  });

  it('should handle isophase', () => {
    const attrs = new Map<number, string>();
    attrs.set(ATTL.LITCHR, '7');
    attrs.set(ATTL.SIGPER, '6');
    expect(formatLightChar(attrs)).toBe('Iso 6s');
  });

  it('should return empty without LITCHR', () => {
    const attrs = new Map<number, string>();
    expect(formatLightChar(attrs)).toBe('');
  });
});

describe('text label instructions', () => {
  it('should have depth text for SOUNDG', () => {
    const instr = lookupInstruction(OBJL.SOUNDG);
    expect(instr.textFormat).toBe('depth');
    expect(instr.textAttl).toBe(ATTL.VALSOU);
    expect(instr.textColor).toBe('SNDG1');
  });

  it('should have depth contour text for DEPCNT', () => {
    const instr = lookupInstruction(OBJL.DEPCNT);
    expect(instr.textFormat).toBe('depthContour');
    expect(instr.textAttl).toBe(ATTL.VALDCO);
  });

  it('should have light char text for LIGHTS', () => {
    const instr = lookupInstruction(OBJL.LIGHTS);
    expect(instr.textFormat).toBe('lightChar');
  });
});

describe('pattern fill instructions', () => {
  it('should have hatch pattern for RESARE', () => {
    const instr = lookupInstruction(OBJL.RESARE);
    expect(instr.pattern).toBe('hatch');
    expect(instr.patternSpacing).toBeGreaterThan(0);
    expect(instr.patternColor).toBe('TRFCD');
  });

  it('should have stipple for DMPGRD', () => {
    const instr = lookupInstruction(OBJL.DMPGRD);
    expect(instr.pattern).toBe('stipple');
  });

  it('should have cross-hatch for MARCUL', () => {
    const instr = lookupInstruction(OBJL.MARCUL);
    expect(instr.pattern).toBe('cross-hatch');
  });
});
