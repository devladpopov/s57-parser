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
import { SimplifiedRings, visibleAnchor } from './anchor.js';

export interface RenderOptions {
  /** Display mode (default: DAY_BRIGHT) */
  mode?: DisplayMode;
  /** Zoom level for scaling line widths and symbols */
  zoom?: number;
  /** Whether to render text labels (default: true) */
  showLabels?: boolean;
  /** Minimum zoom to show sounding labels */
  soundingLabelMinZoom?: number;
  /**
   * Fill the canvas with the no-data colour before drawing (default: true).
   * Set to false when the chart is an overlay above a basemap.
   */
  background?: boolean;
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
  if (options.background !== false) {
    const bg = resolveColor('NODTA', mode);
    ctx.fillStyle = rgbToCSS(bg);
    ctx.fillRect(0, 0, width, height);
  } else {
    ctx.clearRect(0, 0, width, height);
  }

  // Priority order, lookup instructions and lon/lat bounding boxes depend only
  // on the data, so they are computed once per feature collection and cached.
  const items = prepare(geojson);

  // Cull features whose bounding box is off screen. The margin keeps symbols,
  // sector-light arcs and labels anchored just outside the edge.
  const visible = (it: PreparedFeature, margin: number): boolean => {
    const xa = view.toPixelX(it.minX), xb = view.toPixelX(it.maxX);
    const ya = view.toPixelY(it.minY), yb = view.toPixelY(it.maxY);
    return Math.max(xa, xb) >= -margin && Math.min(xa, xb) <= width + margin &&
      Math.max(ya, yb) >= -margin && Math.min(ya, yb) <= height + margin;
  };

  // Centred symbols and labels of areas go in the middle of the visible part
  // of the polygon (S-52), so the anchor depends on the view.
  const anchor = (it: PreparedFeature): { x: number; y: number } | null => {
    if (!it.rings) return null;
    const sx = Math.abs(view.toPixelX(it.maxX) - view.toPixelX(it.minX)) / ((it.maxX - it.minX) || Infinity);
    const sy = Math.abs(view.toPixelY(it.maxY) - view.toPixelY(it.minY)) / ((it.maxY - it.minY) || Infinity);
    const px = it.rings.at(Math.max(sx, sy)).map(r => r.map(c => [view.toPixelX(c[0]), view.toPixelY(c[1])] as [number, number]));
    const a = visibleAnchor(px, width, height);
    return a && { x: a[0], y: a[1] };
  };

  // Pass 1: geometry (areas, lines, points)
  for (const it of items) {
    if (!visible(it, 32)) continue;
    if (it.rings && it.instr.type === 'point') {
      const a = anchor(it);
      if (a) drawSymbolAt(ctx, a.x, a.y, it.instr, mode);
      continue;
    }
    renderFeature(ctx, it.feature.geometry!, it.instr, view, mode, it.feature.properties._outline as Outline);
  }

  // Pass 2: pattern fills (on top of solid fills)
  for (const it of items) {
    if (!it.instr.pattern || it.feature.geometry!.type !== 'Polygon' || !visible(it, 0)) continue;
    drawPatternFill(ctx, (it.feature.geometry as { coordinates: [number, number][][] }).coordinates, it.instr, view, mode, width, height);
  }

  // Pass 3: sector lights (on top of symbols)
  for (const it of items) {
    if (!it.instr.sectorLight || !it.attrs || it.feature.geometry!.type !== 'Point') continue;
    if (!visible(it, (it.instr.sectorRadius ?? 20) + 8)) continue;
    drawSectorLight(ctx, (it.feature.geometry as { coordinates: [number, number] }).coordinates, it.attrs, it.instr, view, mode);
  }

  // Pass 4: text labels (topmost layer).
  // Declutter: place labels greedily from highest display priority to lowest,
  // skipping any that fall outside the viewport or overlap an already-placed
  // label. Without this, a zoomed-out chart paints thousands of overlapping
  // strings into an unreadable black mass. Placed boxes go into a coarse grid
  // so each collision test only looks at nearby labels.
  if (showLabels) {
    const placed = new LabelGrid();
    for (let i = items.length - 1; i >= 0; i--) {
      const it = items[i];
      if (!visible(it, 200)) continue;
      placeTextLabel(ctx, it, it.instr, it.attrs, view, mode, width, height, placed, anchor);
    }
  }
}

interface PreparedFeature {
  feature: GeoJSONFeature;
  instr: RenderInstruction;
  attrs: Map<number, string> | undefined;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  /** Polygon rings, for placing centred symbols and labels. */
  rings?: SimplifiedRings;
}

const prepared = new WeakMap<GeoJSONFeatureCollection, PreparedFeature[]>();

/** Features with geometry, sorted by display priority, with instructions and bounds. */
function prepare(geojson: GeoJSONFeatureCollection): PreparedFeature[] {
  const cached = prepared.get(geojson);
  if (cached) return cached;
  const items: PreparedFeature[] = [];
  for (const feature of geojson.features) {
    if (!feature.geometry) continue;
    const attrs = feature.properties._attributes as Map<number, string> | undefined;
    const instr = lookupInstruction(feature.properties.OBJL as number, attrs);
    const b = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
    extendBounds(b, (feature.geometry as { coordinates: unknown }).coordinates);
    if (b.minX > b.maxX) continue;
    const rings = feature.geometry.type === 'Polygon' ? new SimplifiedRings(feature.geometry.coordinates) : undefined;
    items.push({ feature, instr, attrs, ...b, rings });
  }
  items.sort((a, b) => a.instr.priority - b.instr.priority); // stable: keeps file order within a priority
  prepared.set(geojson, items);
  return items;
}

function extendBounds(b: { minX: number; minY: number; maxX: number; maxY: number }, c: unknown): void {
  if (!Array.isArray(c)) return;
  if (typeof c[0] === 'number') {
    const x = c[0] as number, y = c[1] as number;
    if (x < b.minX) b.minX = x;
    if (x > b.maxX) b.maxX = x;
    if (y < b.minY) b.minY = y;
    if (y > b.maxY) b.maxY = y;
    return;
  }
  for (const child of c) extendBounds(b, child);
}

type Box = { x0: number; y0: number; x1: number; y1: number };

/** Uniform grid of placed label boxes for fast overlap queries. */
class LabelGrid {
  private cells = new Map<number, Box[]>();
  private static readonly SIZE = 64;

  private keys(b: Box): number[] {
    const s = LabelGrid.SIZE;
    const out: number[] = [];
    for (let gx = Math.floor(b.x0 / s); gx <= Math.floor(b.x1 / s); gx++) {
      for (let gy = Math.floor(b.y0 / s); gy <= Math.floor(b.y1 / s); gy++) out.push(gx * 65536 + gy);
    }
    return out;
  }

  overlaps(b: Box): boolean {
    for (const k of this.keys(b)) {
      for (const p of this.cells.get(k) ?? []) if (boxesOverlap(b, p)) return true;
    }
    return false;
  }

  add(b: Box): void {
    for (const k of this.keys(b)) {
      const cell = this.cells.get(k);
      if (cell) cell.push(b); else this.cells.set(k, [b]);
    }
  }
}

/** Average of a coordinate ring, used to place a symbol on non-point geometry. */
function ringCentroid(coords: [number, number][]): [number, number] | null {
  if (!coords.length) return null;
  let cx = 0, cy = 0;
  for (const c of coords) { cx += c[0]; cy += c[1]; }
  return [cx / coords.length, cy / coords.length];
}

/** Axis-aligned bounding box overlap test. */
function boxesOverlap(
  a: { x0: number; y0: number; x1: number; y1: number },
  b: { x0: number; y0: number; x1: number; y1: number }
): boolean {
  return a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;
}

/**
 * Boundary lines to stroke for an area, when some of its edges must not be
 * drawn (on the data limit or masked); set by toGeoJSON as properties._outline.
 */
type Outline = [number, number][][] | undefined;

function renderFeature(
  ctx: CanvasRenderingContext2D,
  geom: GeoJSONGeometry,
  instr: RenderInstruction,
  view: ViewTransform,
  mode: DisplayMode,
  outline?: Outline
): void {
  switch (geom.type) {
    case 'Point':
      drawSymbol(ctx, geom.coordinates, instr, view, mode);
      break;
    case 'MultiPoint':
      for (const coord of geom.coordinates) drawSymbol(ctx, coord, instr, view, mode);
      break;
    case 'LineString':
      if (instr.type === 'point') {
        const c = ringCentroid(geom.coordinates);
        if (c) drawSymbol(ctx, c, instr, view, mode);
      } else {
        drawLine(ctx, geom.coordinates, instr, view, mode);
      }
      break;
    case 'Polygon':
      // A point-symbology instruction (e.g. a buoy) attached to polygon
      // geometry must NOT flood-fill the polygon — that paints huge saturated
      // blobs. renderChart draws the symbol in the visible part of the polygon;
      // this centroid fallback only covers polygons inside a GeometryCollection.
      if (instr.type === 'point') {
        const c = ringCentroid(geom.coordinates[0] ?? []);
        if (c) drawSymbol(ctx, c, instr, view, mode);
      } else {
        drawPolygon(ctx, geom.coordinates, instr, view, mode, outline);
      }
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
  drawSymbolAt(ctx, view.toPixelX(coord[0]), view.toPixelY(coord[1]), instr, mode);
}

function drawSymbolAt(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  instr: RenderInstruction,
  mode: DisplayMode
): void {
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
  mode: DisplayMode,
  outline?: Outline
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
    if (outline) {
      // Stroke only the edges that are part of the real boundary.
      ctx.beginPath();
      for (const line of outline) {
        ctx.moveTo(view.toPixelX(line[0][0]), view.toPixelY(line[0][1]));
        for (let i = 1; i < line.length; i++) ctx.lineTo(view.toPixelX(line[i][0]), view.toPixelY(line[i][1]));
      }
    }
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
  mode: DisplayMode,
  width: number,
  height: number
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

  // The clip already hides everything off screen, so only generate hatch lines
  // over the visible part of the bounding box. Zoomed in on a large polygon
  // this avoids thousands of invisible lines per frame.
  minX = Math.max(minX, -spacing);
  minY = Math.max(minY, -spacing);
  maxX = Math.min(maxX, width + spacing);
  maxY = Math.min(maxY, height + spacing);
  if (minX >= maxX || minY >= maxY) { ctx.restore(); return; }
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
  it: PreparedFeature,
  instr: RenderInstruction,
  attrs: Map<number, string> | undefined,
  view: ViewTransform,
  mode: DisplayMode,
  width: number,
  height: number,
  placed: LabelGrid,
  anchor: (it: PreparedFeature) => { x: number; y: number } | null
): void {
  const feature = it.feature;
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
  const pos = it.rings ? anchor(it) : labelPosition(feature.geometry, view);
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
  if (placed.overlaps(box)) return;
  placed.add(box);

  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.fillStyle = rgbToCSS(color);
  ctx.fillText(text, pos.x, cy);
}

// ─── Legend ─────────────────────────────────────────────────────────────────

/**
 * Draw a sample of an instruction into a w x h box at (x, y), for legends:
 * a filled square for areas, a stroke for lines, the symbol for points.
 */
export function drawLegendSymbol(
  ctx: CanvasRenderingContext2D,
  instr: RenderInstruction,
  x: number,
  y: number,
  w: number,
  h: number,
  mode: DisplayMode = 'DAY_BRIGHT'
): void {
  const id: ViewTransform = { toPixelX: v => v, toPixelY: v => v };
  if (instr.type === 'area') {
    const ring: [number, number][] = [[x, y], [x + w, y], [x + w, y + h], [x, y + h], [x, y]];
    drawPolygon(ctx, [ring], { ...instr, stroke: instr.stroke ?? 'CHGRD', strokeWidth: instr.strokeWidth ?? 0.5 }, id, mode);
    if (instr.pattern) drawPatternFill(ctx, [ring], instr, id, mode, x + w, y + h);
  } else if (instr.type === 'line') {
    drawLine(ctx, [[x, y + h / 2], [x + w, y + h / 2]], { ...instr, strokeWidth: Math.max(instr.strokeWidth ?? 0.5, 1) }, id, mode);
  } else if (instr.type === 'point') {
    drawSymbolAt(ctx, x + w / 2, y + h / 2, instr, mode);
  } else {
    ctx.font = `${instr.textSize ?? 9}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = rgbToCSS(resolveColor(instr.textColor ?? 'CHBLK', mode));
    ctx.fillText('Abc', x + w / 2, y + h / 2);
  }
}

/** Label position for point and line geometry; polygons use the visible-part anchor. */
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
    default:
      return null;
  }
}
