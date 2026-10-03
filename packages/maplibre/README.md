# @s57-parser/maplibre

MapLibre GL JS integration for S-57 / S-101 charts, two ways:

- `addChartSource()`: a native GeoJSON source with S-52-inspired vector style layers
- `S57CanvasLayer`: a custom layer drawing the full S-52 renderer on a canvas overlay

```bash
npm install maplibre-gl @s57-parser/maplibre
```

```ts
import maplibregl from 'maplibre-gl';
import { addChartSource, removeChart, S57CanvasLayer } from '@s57-parser/maplibre';

const map = new maplibregl.Map({ container: 'map', style: 'https://demotiles.maplibre.org/style.json' });
const buffer = await (await fetch('/charts/US5MA12M.000')).arrayBuffer();

map.on('load', () => {
  // Option 1: vector layers (ids: enc-depth-areas, enc-land, enc-coastline, ...)
  addChartSource(map, buffer, { sourceId: 'enc' });

  // Option 2: S-52 canvas overlay
  const overlay = new S57CanvasLayer('enc-overlay', buffer, { mode: 'DUSK' });
  map.addLayer(overlay);
  overlay.setMode('NIGHT');
});

removeChart(map, 'enc'); // removes the source and its layers
```

`addChartSource(map, buffer, { addLayers: false })` adds only the source;
call `addChartLayers(map, sourceId)` later or style it yourself.

Peer dependency: `maplibre-gl` ^4 or ^5.

Part of [s57-parser](https://github.com/devladpopov/s57-parser). MIT licence.
