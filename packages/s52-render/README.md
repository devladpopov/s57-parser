# @s57-parser/s52-render

Canvas2D renderer for chart GeoJSON from `@s57-parser/s57` or
`@s57-parser/s101`, styled after IHO S-52 symbology: DAY_BRIGHT, DUSK and
NIGHT palettes, depth-dependent area colours, light characteristics, sector
lights, soundings, pattern fills and label decluttering.

No dependencies besides `@s57-parser/s57` (types and attribute codes).
Draws on any `CanvasRenderingContext2D`: browser canvas, `OffscreenCanvas`,
or a Node canvas implementation.

```bash
npm install @s57-parser/s57 @s57-parser/s52-render
```

```ts
import { parseS57, toGeoJSON } from '@s57-parser/s57';
import { renderChart, type ViewTransform } from '@s57-parser/s52-render';

const ds = parseS57(buffer);
const geojson = toGeoJSON(ds);

// Conditional symbology (depth areas, light colours) reads the raw attributes.
const attrs = new Map(ds.features.map(f => [f.rcid, f.attributes]));
for (const f of geojson.features) f.properties._attributes = attrs.get(f.properties.RCID as number);

const canvas = document.querySelector('canvas')!;
const ctx = canvas.getContext('2d')!;

// Any projection works: give lon/lat -> CSS pixel functions.
const [west, south, east, north] = [-71.08, 42.21, -70.73, 42.34];
const view: ViewTransform = {
  toPixelX: lon => ((lon - west) / (east - west)) * canvas.width,
  toPixelY: lat => ((north - lat) / (north - south)) * canvas.height,
};

renderChart(ctx, geojson, view, canvas.width, canvas.height, {
  mode: 'DUSK',          // 'DAY_BRIGHT' (default) | 'DUSK' | 'NIGHT'
  showLabels: true,      // soundings, contour values, light characteristics, names
  background: true,      // false = transparent, for overlays on a basemap
});
```

Preparation (priority sort, lookups, bounding boxes) is cached per feature
collection, so re-rendering the same collection on pan/zoom is cheap.

## API

- `renderChart(ctx, geojson, view, width, height, options?)`
- `drawLegendSymbol(ctx, instruction, x, y, w, h, mode?)` for legends
- `lookupInstruction(objl, attrs?)`, `LOOKUP_TABLE`, `DEFAULT_INSTRUCTION`, `OBJL`, `OBJL_NAMES`, `ATTL`
- `resolveColor(token, mode)`, `rgbToCSS(rgb, alpha?)`, `depareColor()`, `lightColorToken()`,
  `formatDepth()`, `formatLightChar()`
- `visibleAnchor()`, `clipRing()`, `simplifyRing()`, `SimplifiedRings`

This is a simplified S-52 presentation, not a type-approved ECDIS
presentation library: do not use it for navigation.

Part of [s57-parser](https://github.com/devladpopov/s57-parser). MIT licence.
