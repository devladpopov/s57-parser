import { describe, it, expect } from 'bun:test';
import { resolveColor, rgbToCSS } from '../src/colors.js';
import { lookupInstruction, depareColor, OBJL } from '../src/lookup.js';

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
