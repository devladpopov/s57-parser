/**
 * S-52 Canvas2D renderer.
 *
 * Renders GeoJSON features with S-52 symbology on an HTML Canvas.
 * Supports Day/Dusk/Night display modes, text labels, sector lights,
 * and pattern fills.
 */

import type { GeoJSONFeatureCollection, GeoJSONFeature, GeoJSONGeometry } from '@s57-parser/s57';
import type { DisplayMode, RGB } from './colors.js';
import { resolveColor, rgbToCSS } from './colors.js';
import type { RenderInstruction } from './lookup.js';
import { lookupInstruction, DEFAULT_INSTRUCTION, ATTL, formatDepth, formatLightChar, lightColorToken } from './lookup.js';

export interface RenderOptions {
  /** Display mode (default: DAY_BRIGHT) */
  mode?: DisplayMode;
  /** Zoom level for scaling line widths and symbols */
  zoom?: number;
  /** Whether to render text labels (default: true) */
  showLabels?: boolean;
  /** Minimum zoom to show sounding labels */
  soundingLabelMinZoom?: number;
}

export interface ViewTransform {
  /** Convert longitude to canvas X pixel (CSS coordinates) */
  toPixelX: (lon: number) => number;
  /** Convert latitude to canvas Y pixel (CSS coordinates) */
  toPixelY: (lat: number) => number;
}

/**
 * Render a GeoJSON feature collection with S-52 symbology.
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
  const showLabels = options.showLabels !== false;

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

  // Pass 1: geometry (areas, lines, points)
  for (const feature of sorted) {
    if (!feature.geometry) continue;
    const objl = feature.properties.OBJL as number;
    const attrs = feature.properties._attributes as Map<number, string> | undefined;
    const instr = lookupInstruction(objl, attrs);
    renderFeature(ctx, feature.geometry, instr, view, mode);
  }

  // Pass 2: pattern fills (on top of solid fills)
  for (const feature of sorted) {
    if (!feature.geometry) continue;
    const objl = feature.properties.OBJL as number;
    const attrs = feature.properties._attributes as Map<number, string> | undefined;
    const instr = lookupInstruction(objl, attrs);
    if (instr.pattern && (feature.geometry.type === 'Polygon')) {
      drawPatternFill(ctx, (feature.geometry as { coordinates: [number, number][][] }).coordinates, instr, view, mode);
    }
  }

  // Pass 3: sector lights (on top of symbols)
  for (const feature of sorted) {
    if (!feature.geometry) continue;
    const objl = feature.properties.OBJL as number;
    const attrs = feature.properties._attributes as Map<number, string> | undefined;
    const instr = lookupInstruction(objl, attrs);
    if (instr.sectorLight && attrs && feature.geometry.type === 'Point') {
      drawSectorLight(ctx, (feature.geometry as { coordinates: [number, number] }).coordinates, attrs, instr, view, mode);
    }
  }

  // Pass 4: text labels (topmost layer).
  // Declutter: place labels greedily from highest display priority to lowest,
  // skipping any that fall outside the viewport or overlap an already-placed
  // label. Without this, a zoomed-out chart paints thousands of overlapping
  // strings into an unreadable black mass.
  if (showLabels) {
    const placed: { x0: number; y0: number; x1: number; y1: number }[] = [];
    for (let i = sorted.length - 1; i >= 0; i--) {
      const feature = sorted[i];
      if (!feature.geometry) continue;
      const objl = feature.properties.OBJL as number;
      const attrs = feature.properties._attributes as Map<number, string> | undefined;
      const instr = lookupInstruction(objl, attrs);
      placeTextLabel(ctx, feature, instr, attrs, view, mode, width, height, placed);
    }
  }
}

/** Axis-aligned bounding box overlap test. */
function boxesOverlap(
  a: { x0: number; y0: number; x1: number; y1: number },
  b: { x0: number; y0: number; x1: number; y1: number }
): boolean {
  return a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;
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

// ─── Pattern fills ──────────────────────────────────────────────────────────

function drawPatternFill(
  ctx: CanvasRenderingContext2D,
  rings: [number, number][][],
  instr: RenderInstruction,
  view: ViewTransform,
  mode: DisplayMode
): void {
  if (!instr.pattern || !instr.patternColor) return;

  // Build clip path from polygon rings
  ctx.save();
  ctx.beginPath();
  for (const ring of rings) {
    if (ring.length < 3) continue;
    ctx.moveTo(view.toPixelX(ring[0][0]), view.toPixelY(ring[0][1]));
    for (let i = 1; i < ring.length; i++) {
      ctx.lineTo(view.toPixelX(ring[i][0]), view.toPixelY(ring[i][1]));
    }
    ctx.closePath();
  }
  ctx.clip('evenodd');

  // Compute bounding box of the clipped polygon
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const ring of rings) {
    for (const c of ring) {
      const px = view.toPixelX(c[0]);
      const py = view.toPixelY(c[1]);
      if (px < minX) minX = px;
      if (px > maxX) maxX = px;
      if (py < minY) minY = py;
      if (py > maxY) maxY = py;
    }
  }

  const spacing = instr.patternSpacing ?? 8;
  const color = rgbToCSS(resolveColor(instr.patternColor, mode), 0.4);

  ctx.strokeStyle = color;
  ctx.lineWidth = 0.5;

  switch (instr.pattern) {
    case 'hatch':
      // Diagonal lines from bottom-left to top-right
      ctx.beginPath();
      for (let d = minX + minY - spacing; d < maxX + maxY + spacing; d += spacing) {
        ctx.moveTo(d - minY, minY);
        ctx.lineTo(d - maxY, maxY);
      }
      ctx.stroke();
      break;

    case 'cross-hatch':
      // Two sets of diagonal lines
      ctx.beginPath();
      for (let d = minX + minY - spacing; d < maxX + maxY + spacing; d += spacing) {
        ctx.moveTo(d - minY, minY);
        ctx.lineTo(d - maxY, maxY);
      }
      for (let d = minX - maxY - spacing; d < maxX - minY + spacing; d += spacing) {
        ctx.moveTo(d + minY, minY);
        ctx.lineTo(d + maxY, maxY);
      }
      ctx.stroke();
      break;

    case 'stipple':
      // Scattered dots
      ctx.fillStyle = color;
      for (let y = minY; y < maxY; y += spacing) {
        const offset = (Math.floor((y - minY) / spacing) % 2) * (spacing / 2);
        for (let x = minX + offset; x < maxX; x += spacing) {
          ctx.beginPath();
          ctx.arc(x, y, 0.8, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      break;
  }

  ctx.restore();
}

// ─── Sector lights ──────────────────────────────────────────────────────────

function drawSectorLight(
  ctx: CanvasRenderingContext2D,
  coord: [number, number],
  attrs: Map<number, string>,
  instr: RenderInstruction,
  view: ViewTransform,
  mode: DisplayMode
): void {
  const sectr1Str = attrs.get(ATTL.SECTR1);
  const sectr2Str = attrs.get(ATTL.SECTR2);
  if (!sectr1Str || !sectr2Str) return;

  const sectr1 = parseFloat(sectr1Str);
  const sectr2 = parseFloat(sectr2Str);
  if (isNaN(sectr1) || isNaN(sectr2)) return;

  const x = view.toPixelX(coord[0]);
  const y = view.toPixelY(coord[1]);
  const r = instr.sectorRadius ?? 20;

  // S-52: bearings are TRUE, clockwise from north. Canvas: 0 = east, CCW.
  // Convert: canvas_angle = 90 - bearing (in degrees), then to radians.
  const startAngle = (90 - sectr2) * (Math.PI / 180);
  const endAngle = (90 - sectr1) * (Math.PI / 180);

  // Determine sector color from COLOUR attribute
  const colour = attrs.get(ATTL.COLOUR);
  const colorToken = lightColorToken(colour);
  const rgb = resolveColor(colorToken, mode);

  // Draw filled sector arc
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.arc(x, y, r, startAngle, endAngle);
  ctx.closePath();
  ctx.fillStyle = rgbToCSS(rgb, 0.25);
  ctx.fill();

  // Draw sector boundary lines
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + r * Math.cos(startAngle), y - r * Math.sin(startAngle));
  ctx.moveTo(x, y);
  ctx.lineTo(x + r * Math.cos(endAngle), y - r * Math.sin(endAngle));
  ctx.strokeStyle = rgbToCSS(rgb, 0.6);
  ctx.lineWidth = 0.8;
  ctx.setLineDash([2, 2]);
  ctx.stroke();
  ctx.setLineDash([]);
}

// ─── Text labels ────────────────────────────────────────────────────────────

function placeTextLabel(
  ctx: CanvasRenderingContext2D,
  feature: GeoJSONFeature,
  instr: RenderInstruction,
  attrs: Map<number, string> | undefined,
  view: ViewTransform,
  mode: DisplayMode,
  width: number,
  height: number,
  placed: { x0: number; y0: number; x1: number; y1: number }[]
): void {
  if (!feature.geometry) return;
  if (!attrs) return;

  // Determine text string based on format type
  let text = '';
  if (instr.textFormat === 'depth') {
    const val = attrs.get(ATTL.VALSOU);
    if (val != null) text = formatDepth(val);
  } else if (instr.textFormat === 'depthContour') {
    const val = attrs.get(ATTL.VALDCO);
    if (val != null) text = formatDepth(val);
  } else if (instr.textFormat === 'lightChar') {
    text = formatLightChar(attrs);
  } else if (instr.textAttl) {
    const val = attrs.get(instr.textAttl);
    if (val != null) text = val;
  }

  // Fallback: try OBJNAM for named objects
  if (!text && !instr.textFormat) {
    const objnam = attrs.get(ATTL.OBJNAM);
    if (objnam) text = objnam;
  }

  if (!text) return;

  // Find label position
  const pos = labelPosition(feature.geometry, view);
  if (!pos) return;

  const size = instr.textSize ?? 8;
  const color = instr.textColor ? resolveColor(instr.textColor, mode) : resolveColor('CHBLK', mode);
  const offsetY = instr.textOffsetY ?? 0;
  const align = instr.textAlign ?? 'center';

  ctx.font = `${size}px sans-serif`;

  // Compute label bounding box for culling + collision avoidance
  const w = ctx.measureText(text).width;
  const cy = pos.y + offsetY;
  let x0 = pos.x;
  if (align === 'center') x0 = pos.x - w / 2;
  else if (align === 'right') x0 = pos.x - w;
  const box = { x0, y0: cy - size / 2, x1: x0 + w, y1: cy + size / 2 };

  // Cull labels whose box lies entirely outside the viewport
  if (box.x1 < 0 || box.x0 > width || box.y1 < 0 || box.y0 > height) return;

  // Skip labels that collide with an already-placed one
  for (const p of placed) {
    if (boxesOverlap(box, p)) return;
  }
  placed.push(box);

  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.fillStyle = rgbToCSS(color);
  ctx.fillText(text, pos.x, cy);
}

/** Get a suitable label position for a geometry. */
function labelPosition(
  geom: GeoJSONGeometry,
  view: ViewTransform
): { x: number; y: number } | null {
  switch (geom.type) {
    case 'Point':
      return { x: view.toPixelX(geom.coordinates[0]), y: view.toPixelY(geom.coordinates[1]) };
    case 'MultiPoint':
      if (geom.coordinates.length === 0) return null;
      // Label first point only (for soundings, each point gets its own label via iteration)
      return { x: view.toPixelX(geom.coordinates[0][0]), y: view.toPixelY(geom.coordinates[0][1]) };
    case 'LineString': {
      // Label at midpoint of line
      if (geom.coordinates.length === 0) return null;
      const mid = geom.coordinates[Math.floor(geom.coordinates.length / 2)];
      return { x: view.toPixelX(mid[0]), y: view.toPixelY(mid[1]) };
    }
    case 'Polygon': {
      // Label at centroid of exterior ring
      if (!geom.coordinates[0] || geom.coordinates[0].length === 0) return null;
      const ring = geom.coordinates[0];
      let cx = 0, cy = 0;
      for (const c of ring) { cx += c[0]; cy += c[1]; }
      cx /= ring.length;
      cy /= ring.length;
      return { x: view.toPixelX(cx), y: view.toPixelY(cy) };
    }
    default:
      return null;
  }
}
