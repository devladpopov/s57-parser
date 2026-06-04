/**
 * S-52 Canvas2D renderer.
 *
 * Renders GeoJSON features with S-52 symbology on an HTML Canvas.
 * Supports Day/Dusk/Night display modes.
 */

import type { GeoJSONFeatureCollection, GeoJSONFeature, GeoJSONGeometry } from '@s57-parser/s57';
import type { DisplayMode, RGB } from './colors.js';
import { resolveColor, rgbToCSS } from './colors.js';
import type { RenderInstruction } from './lookup.js';
import { lookupInstruction, DEFAULT_INSTRUCTION } from './lookup.js';

export interface RenderOptions {
  /** Display mode (default: DAY_BRIGHT) */
  mode?: DisplayMode;
  /** Zoom level for scaling line widths and symbols */
  zoom?: number;
}

export interface ViewTransform {
  /** Convert longitude to canvas X pixel (CSS coordinates) */
  toPixelX: (lon: number) => number;
  /** Convert latitude to canvas Y pixel (CSS coordinates) */
  toPixelY: (lat: number) => number;
}

/**
 * Render a GeoJSON feature collection with S-52 symbology.
 *
 * @param ctx - Canvas2D rendering context
 * @param geojson - GeoJSON features from toGeoJSON()
 * @param view - Coordinate-to-pixel transform functions
 * @param width - Canvas CSS width in pixels
 * @param height - Canvas CSS height in pixels
 * @param options - Rendering options
 */
export function renderChart(
  ctx: CanvasRenderingContext2D,
  geojson: GeoJSONFeatureCollection,
  view: ViewTransform,
  width: number,
  height: number,
  options: RenderOptions = {}
): void {
  const mode = options.mode ?? 'DAY_BRIGHT';

  // Background
  const bg = resolveColor('NODTA', mode);
  ctx.fillStyle = rgbToCSS(bg);
  ctx.fillRect(0, 0, width, height);

  // Sort features by display priority (lowest first = drawn first = behind)
  const sorted = [...geojson.features].sort((a, b) => {
    const instrA = lookupInstruction(a.properties.OBJL as number, a.properties._attributes as Map<number, string> | undefined);
    const instrB = lookupInstruction(b.properties.OBJL as number, b.properties._attributes as Map<number, string> | undefined);
    return instrA.priority - instrB.priority;
  });

  for (const feature of sorted) {
    if (!feature.geometry) continue;
    const objl = feature.properties.OBJL as number;
    const attrs = feature.properties._attributes as Map<number, string> | undefined;
    const instr = lookupInstruction(objl, attrs);
    renderFeature(ctx, feature.geometry, instr, view, mode);
  }
}

function renderFeature(
  ctx: CanvasRenderingContext2D,
  geom: GeoJSONGeometry,
  instr: RenderInstruction,
  view: ViewTransform,
  mode: DisplayMode
): void {
  switch (geom.type) {
    case 'Point':
      drawSymbol(ctx, geom.coordinates, instr, view, mode);
      break;
    case 'MultiPoint':
      for (const coord of geom.coordinates) drawSymbol(ctx, coord, instr, view, mode);
      break;
    case 'LineString':
      drawLine(ctx, geom.coordinates, instr, view, mode);
      break;
    case 'Polygon':
      drawPolygon(ctx, geom.coordinates, instr, view, mode);
      break;
    case 'GeometryCollection':
      for (const g of geom.geometries) renderFeature(ctx, g, instr, view, mode);
      break;
  }
}

function drawSymbol(
  ctx: CanvasRenderingContext2D,
  coord: [number, number],
  instr: RenderInstruction,
  view: ViewTransform,
  mode: DisplayMode
): void {
  const x = view.toPixelX(coord[0]);
  const y = view.toPixelY(coord[1]);
  const r = instr.radius ?? 2;
  const shape = instr.shape ?? 'circle';

  ctx.beginPath();

  switch (shape) {
    case 'circle':
      ctx.arc(x, y, r, 0, Math.PI * 2);
      break;
    case 'triangle':
      ctx.moveTo(x, y - r * 1.2);
      ctx.lineTo(x - r, y + r * 0.7);
      ctx.lineTo(x + r, y + r * 0.7);
      ctx.closePath();
      break;
    case 'square':
      ctx.rect(x - r, y - r, r * 2, r * 2);
      break;
    case 'diamond':
      ctx.moveTo(x, y - r * 1.3);
      ctx.lineTo(x + r, y);
      ctx.lineTo(x, y + r * 1.3);
      ctx.lineTo(x - r, y);
      ctx.closePath();
      break;
  }

  if (instr.fill) {
    ctx.fillStyle = rgbToCSS(resolveColor(instr.fill, mode), instr.fillAlpha ?? 1);
    ctx.fill();
  }
  if (instr.stroke) {
    ctx.strokeStyle = rgbToCSS(resolveColor(instr.stroke, mode));
    ctx.lineWidth = instr.strokeWidth ?? 1;
    ctx.stroke();
  }
}

function drawLine(
  ctx: CanvasRenderingContext2D,
  coords: [number, number][],
  instr: RenderInstruction,
  view: ViewTransform,
  mode: DisplayMode
): void {
  if (coords.length < 2) return;

  ctx.beginPath();
  ctx.moveTo(view.toPixelX(coords[0][0]), view.toPixelY(coords[0][1]));
  for (let i = 1; i < coords.length; i++) {
    ctx.lineTo(view.toPixelX(coords[i][0]), view.toPixelY(coords[i][1]));
  }

  ctx.strokeStyle = rgbToCSS(resolveColor(instr.stroke ?? 'CHGRD', mode));
  ctx.lineWidth = instr.strokeWidth ?? 0.5;

  if (instr.dashPattern) {
    ctx.setLineDash(instr.dashPattern);
  } else {
    ctx.setLineDash([]);
  }

  ctx.stroke();
  ctx.setLineDash([]);
}

function drawPolygon(
  ctx: CanvasRenderingContext2D,
  rings: [number, number][][],
  instr: RenderInstruction,
  view: ViewTransform,
  mode: DisplayMode
): void {
  ctx.beginPath();
  for (const ring of rings) {
    if (ring.length < 3) continue;
    ctx.moveTo(view.toPixelX(ring[0][0]), view.toPixelY(ring[0][1]));
    for (let i = 1; i < ring.length; i++) {
      ctx.lineTo(view.toPixelX(ring[i][0]), view.toPixelY(ring[i][1]));
    }
    ctx.closePath();
  }

  if (instr.fill && (instr.fillAlpha ?? 1) > 0) {
    ctx.fillStyle = rgbToCSS(resolveColor(instr.fill, mode), instr.fillAlpha ?? 1);
    ctx.fill('evenodd');
  }
  if (instr.stroke) {
    ctx.strokeStyle = rgbToCSS(resolveColor(instr.stroke, mode));
    ctx.lineWidth = instr.strokeWidth ?? 0.5;
    if (instr.dashPattern) {
      ctx.setLineDash(instr.dashPattern);
    } else {
      ctx.setLineDash([]);
    }
    ctx.stroke();
    ctx.setLineDash([]);
  }
}
