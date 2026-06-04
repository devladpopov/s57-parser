/**
 * @s57-parser/s52-render
 *
 * S-52 Presentation Library renderer for Canvas2D.
 * Renders S-57 features using IHO S-52 symbology rules.
 */

export { resolveColor, rgbToCSS } from './colors.js';
export type { DisplayMode, RGB, ColorToken } from './colors.js';

export { lookupInstruction, depareColor, LOOKUP_TABLE, OBJL, DEFAULT_INSTRUCTION } from './lookup.js';
export type { RenderInstruction, SymbolType } from './lookup.js';

export { renderChart } from './renderer.js';
export type { RenderOptions, ViewTransform } from './renderer.js';
