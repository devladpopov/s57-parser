# @s57-parser/leaflet

Leaflet layer that draws S-57 / S-101 charts with S-52 symbology on a canvas
overlay. The format is detected automatically.

```bash
npm install leaflet @s57-parser/leaflet
```

```ts
import L from 'leaflet';
import { S57Layer } from '@s57-parser/leaflet';

const map = L.map('map').setView([42.3, -70.95], 12);
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);

const buffer = await (await fetch('/charts/US5MA12M.000')).arrayBuffer();
const layer = new S57Layer(buffer, { mode: 'DAY_BRIGHT', opacity: 1, showLabels: true });
layer.addTo(map);

layer.setMode('NIGHT');
layer.setShowLabels(false);
layer.format; // 'S-57'
layer.name;   // 'US5MA12M.000'
```

`new S57Layer(geojson)` also accepts an already converted `FeatureCollection`.

Without a map: `loadFile(buffer)` and `loadFromUrl(url)` return
`{ format, name, geojson, featureCount, spatialCount, attributes }`.

Peer dependency: `leaflet` ^1.9. Browser only (Leaflet needs `window`).

Part of [s57-parser](https://github.com/devladpopov/s57-parser). MIT licence.
