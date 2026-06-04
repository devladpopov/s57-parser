import { describe, it, expect } from 'bun:test';
import { parse } from '../src/parser.js';

describe('ISO 8211 parser', () => {
  it('should export parse function', () => {
    expect(typeof parse).toBe('function');
  });
});
