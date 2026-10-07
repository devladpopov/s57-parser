/**
 * Chart sources for the plotter.
 *
 * A source is something that puts chart data on the map besides the user's own
 * S-57 files: an online tile overlay today, a licensed ENC service later. Each
 * one is switched on and off in the menu, and the choice is remembered.
 *
 * Built-in sources are listed in BUILTIN_SOURCES; code that embeds the plotter
 * can add more with registerSource() (also exposed as window.plotter).
 */
import L from 'leaflet';

export interface ChartSource {
  id: string;
  title: { en: string; ru: string };
  /** One line about what the source shows and its limits. */
  note?: { en: string; ru: string };
  /** On when the user has not chosen yet. */
  defaultOn?: boolean;
  /** Map layer shown while the source is on; created once, on first use. */
  layer(): L.Layer;
}

export const BUILTIN_SOURCES: ChartSource[] = [
  {
    id: 'openseamap',
    title: { en: 'OpenSeaMap seamarks', ru: 'OpenSeaMap: знаки и буи' },
    note: {
      en: 'Buoys, beacons, lights, harbours from OpenStreetMap volunteers. Online, viewed tiles stay offline.',
      ru: 'Буи, знаки, огни, гавани от добровольцев OpenStreetMap. Нужен интернет, просмотренные места остаются офлайн.',
    },
    defaultOn: true,
    layer: () => L.tileLayer('https://tiles.openseamap.org/seamark/{z}/{x}/{y}.png', {
      maxZoom: 18,
      attribution: '&copy; <a href="https://www.openseamap.org">OpenSeaMap</a>',
    }),
  },
];

const sources: ChartSource[] = [...BUILTIN_SOURCES];
const listeners = new Set<() => void>();

export function registerSource(source: ChartSource) {
  const i = sources.findIndex(s => s.id === source.id);
  if (i >= 0) sources[i] = source; else sources.push(source);
  for (const fn of listeners) fn();
}

export const allSources = (): readonly ChartSource[] => sources;
export const onSourcesChanged = (fn: () => void) => { listeners.add(fn); };
