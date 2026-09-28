/**
 * Chart legend: the symbols actually present in the loaded chart, drawn with
 * the same S-52 instructions the renderer uses, with their S-57 class names.
 */

import type { GeoJSONFeatureCollection } from '../packages/s57/src/geojson.js';
import { drawLegendSymbol } from '../packages/s52-render/src/renderer.js';
import { lookupInstruction, LOOKUP_TABLE, OBJL, OBJL_NAMES, type RenderInstruction } from '../packages/s52-render/src/lookup.js';
import type { DisplayMode } from '../packages/s52-render/src/colors.js';

interface Entry {
  instr: RenderInstruction;
  name: string;
  acronym: string;
  count: number;
}

const DEPTH_BANDS: Record<string, string> = {
  DEPIT: 'Depth area: dries at low water',
  DEPVS: 'Depth area: 0 to 5 m',
  DEPMS: 'Depth area: 5 to 10 m',
  DEPMD: 'Depth area: 10 to 20 m',
  DEPDW: 'Depth area: over 20 m',
};
const LIGHT_COLOURS: Record<string, string> = {
  LITRD: 'Light: red', LITGN: 'Light: green', LITYW: 'Light: white or yellow',
};
const ACRONYM = new Map<number, string>(Object.entries(OBJL).map(([k, v]) => [v, k]));
const TYPE_ORDER = { area: 0, line: 1, point: 2, text: 3 } as const;

/** Collect legend entries for the object classes present in a chart. */
function collect(geojson: GeoJSONFeatureCollection): { entries: Entry[]; unstyled: number } {
  const byKey = new Map<string, Entry>();
  const unstyledClasses = new Set<number>();
  for (const f of geojson.features) {
    if (!f.geometry) continue;
    const objl = f.properties.OBJL as number;
    const acronym = ACRONYM.get(objl);
    if (!LOOKUP_TABLE.has(objl) || !acronym) { unstyledClasses.add(objl); continue; }
    if (acronym.startsWith('M_')) continue; // metadata, not drawn as chart symbols
    const instr = lookupInstruction(objl, f.properties._attributes as Map<number, string> | undefined);
    let name = OBJL_NAMES[objl] ?? acronym;
    if (objl === OBJL.DEPARE && instr.fill) name = DEPTH_BANDS[instr.fill] ?? name;
    if (objl === OBJL.LIGHTS && instr.fill) name = LIGHT_COLOURS[instr.fill] ?? name;
    const key = `${objl}:${instr.fill ?? ''}`;
    const e = byKey.get(key);
    if (e) e.count++;
    else byKey.set(key, { instr, name, acronym, count: 1 });
  }
  // Depth bands keep their shallow-to-deep order; the rest go alphabetically.
  const bandOrder = Object.keys(DEPTH_BANDS);
  const key = (e: Entry) => e.acronym === 'DEPARE' ? `Depth area ${bandOrder.indexOf(e.instr.fill ?? '')}` : e.name;
  const entries = [...byKey.values()].sort((a, b) =>
    TYPE_ORDER[a.instr.type] - TYPE_ORDER[b.instr.type] || key(a).localeCompare(key(b)));
  return { entries, unstyled: unstyledClasses.size };
}

/** Fill the legend panel for a chart. Call again on display mode change. */
export function renderLegend(list: HTMLElement, geojson: GeoJSONFeatureCollection, mode: DisplayMode): void {
  const { entries, unstyled } = collect(geojson);
  const dpr = window.devicePixelRatio || 1;
  const W = 28, H = 16;
  list.textContent = '';
  for (const e of entries) {
    const row = document.createElement('div');
    row.className = 'lg-row';
    const cv = document.createElement('canvas');
    cv.width = W * dpr; cv.height = H * dpr;
    cv.style.width = `${W}px`; cv.style.height = `${H}px`;
    const c = cv.getContext('2d')!;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawLegendSymbol(c, e.instr, 2, 2, W - 4, H - 4, mode);
    const label = document.createElement('span');
    label.textContent = e.name;
    label.title = `${e.acronym}, ${e.count} on this chart`;
    const count = document.createElement('small');
    count.textContent = String(e.count);
    row.append(cv, label, count);
    list.append(row);
  }
  if (unstyled) {
    const note = document.createElement('p');
    note.className = 'lg-note';
    note.textContent = `${unstyled} more object type${unstyled > 1 ? 's' : ''} on this chart without S-52 symbols yet (drawn as thin grey lines or not at all).`;
    list.append(note);
  }
}
