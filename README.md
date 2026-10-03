# s57-parser

[![CI](https://github.com/devladpopov/s57-parser/actions/workflows/ci.yml/badge.svg)](https://github.com/devladpopov/s57-parser/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/@s57-parser/s57.svg)](https://www.npmjs.com/package/@s57-parser/s57)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-blue.svg)](https://www.typescriptlang.org/)

**[Live Demo](https://devladpopov.github.io/s57-parser/)** — parse a real NOAA chart in the browser. No server, no GDAL.

Pure TypeScript parser for **S-57** marine navigational charts (ENC), with
experimental **S-101** support and **S-52**-style rendering in the browser.

No runtime dependencies outside this repository. ESM packages for Node.js 18+, Bun and browsers.

## Packages

| Package | Description |
|---------|-------------|
| [`@s57-parser/iso8211`](packages/iso8211) | ISO 8211 binary format parser |
| [`@s57-parser/s57`](packages/s57) | S-57 data model, topology, updates, typed features, GeoJSON |
| [`@s57-parser/s101`](packages/s101) | S-101 parser (experimental), format detection |
| [`@s57-parser/s52-render`](packages/s52-render) | Canvas2D renderer with S-52 palettes and symbology |
| [`@s57-parser/leaflet`](packages/leaflet) | Leaflet layer |
| [`@s57-parser/maplibre`](packages/maplibre) | MapLibre GL JS source and custom layer |
| [`@s57-parser/cli`](packages/cli) | `s57` command: info, GeoJSON export, ISO 8211 dump |

Each package has its own README with the full API.

## Quick start

```bash
npm install @s57-parser/s57
```

### Node.js: S-57 cell to GeoJSON

```ts
import { readFileSync, writeFileSync } from 'node:fs';
import { parseS57, applyUpdate, toGeoJSON } from '@s57-parser/s57';

// Node buffers may be views into a shared pool: copy to a standalone ArrayBuffer.
const read = (path: string) => {
  const b = readFileSync(path);
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
};

const dataset = parseS57(read('ENC_ROOT/US5MA19M/US5MA19M.000'));
applyUpdate(dataset, read('ENC_ROOT/US5MA19M/US5MA19M.001'));

console.log(dataset.name, dataset.cscl, dataset.features.length);
writeFileSync('chart.geojson', JSON.stringify(toGeoJSON(dataset)));
```

Or with the CLI: `npx @s57-parser/cli geojson US5MA19M.000 US5MA19M.001 -o chart.geojson`.

### Browser: draw with S-52 symbology

```ts
import { parseS57, toGeoJSON } from '@s57-parser/s57';
import { renderChart } from '@s57-parser/s52-render';

const buffer = await (await fetch('/charts/US5MA12M.000')).arrayBuffer();
const dataset = parseS57(buffer);
const geojson = toGeoJSON(dataset);

// Conditional symbology (depth colours, light colours) reads raw attributes.
const attrs = new Map(dataset.features.map(f => [f.rcid, f.attributes]));
for (const f of geojson.features) f.properties._attributes = attrs.get(f.properties.RCID as number);

const canvas = document.querySelector('canvas')!;
const [west, south, east, north] = [-71.08, 42.21, -70.73, 42.34];
renderChart(canvas.getContext('2d')!, geojson, {
  toPixelX: lon => ((lon - west) / (east - west)) * canvas.width,
  toPixelY: lat => ((north - lat) / (north - south)) * canvas.height,
}, canvas.width, canvas.height, { mode: 'DAY_BRIGHT' });
```

### Typed features

```ts
import { typedFeatures, filterByClass } from '@s57-parser/s57';

const typed = typedFeatures(dataset.features);
for (const light of filterByClass(typed, 'LIGHTS')) {
  console.log(light.name, light.litchr, light.sigper, light.colour);
}
```

### Leaflet and MapLibre

```ts
import { S57Layer } from '@s57-parser/leaflet';
new S57Layer(buffer, { mode: 'DUSK' }).addTo(leafletMap);

import { addChartSource, S57CanvasLayer } from '@s57-parser/maplibre';
addChartSource(maplibreMap, buffer, { sourceId: 'enc' });          // vector layers
maplibreMap.addLayer(new S57CanvasLayer('enc-overlay', buffer));    // S-52 overlay
```

## Features

**ISO 8211**: DDR-driven decoding of `A`, `I`, `R`, `b1n`/`b2n` and `B(n)` subfields,
repeating groups, binary data containing terminator bytes; rejects malformed input.

**S-57**: DSID/DSPM metadata (COMF, SOMF, compilation scale), feature and vector
records, chain-node topology, polygons with holes, data-limit outlines,
incremental updates (RUIN, FSPC, VRPC, SGCC), 15 typed feature interfaces,
the IHO attribute catalogue.

**S-101** (experimental): feature catalogue, complex attributes, information
records, associations, S-57 code mapping. Tested on synthetic data only, see
the [package README](packages/s101#status).

**S-52 rendering**: DAY_BRIGHT / DUSK / NIGHT palettes, rules for 36 object classes (a default style for the rest),
conditional symbology for depth areas and lights, sector lights, sounding and
light labels, pattern fills, label decluttering, viewport culling.

## Limitations

- Not for navigation. The renderer is a simplified S-52 presentation, not a
  type-approved ECDIS presentation library.
- S-63 encrypted cells are not supported.
- National text in UCS-2 (S-57 lexical level 2) is decoded as bytes, not converted.
- ESM only: use `import`, or `require()` on Node.js 22.12+.

## Development

```bash
bun install
bun test                 # all packages
bun run test:coverage    # with coverage thresholds (bunfig.toml)
bun run build            # tsc -b: type-check and build every package
bun run pack:check       # pack, install into a fresh project, import, run CLI, check types
```

Tests run on the NOAA cell committed at `demo/charts/US5MA12M.000`. Update
files and S-101 datasets are generated in tests with a small ISO 8211 writer
(`test-utils/`). Tests for NOAA US5MA19M and its `.001` update run when the
cell is in `test-data/` (CI downloads it):

```bash
mkdir -p test-data/US5MA19M
curl -L https://charts.noaa.gov/ENCs/US5MA19M.zip -o /tmp/US5MA19M.zip
unzip -o /tmp/US5MA19M.zip -d test-data/US5MA19M
```

Demo viewer:

```bash
bun demo/build.ts && bun run demo/serve.ts   # http://localhost:3457
```

`bun demo/build.ts` also writes `demo/dist/s57-viewer.html`, the whole viewer in one
self-contained HTML file that opens from disk (`file://`) and works offline.
Drop a `.000` cell or a NOAA `.zip` exchange set onto it. A prebuilt copy:
https://devladpopov.github.io/s57-parser/s57-viewer.html

### Releasing

1. Update versions in `packages/*/package.json` and move the `Unreleased`
   section of [CHANGELOG.md](CHANGELOG.md) under the new version.
2. `bun run build && bun run pack:check`
3. Push a `v*` tag. [release.yml](.github/workflows/release.yml) publishes every
   package whose version is not on npm yet (npm Trusted Publishing, no token).

## Contributing

Contributions welcome. Areas that need help:

- WebGL renderer for large charts (millions of coordinates)
- S-63 encryption/decryption support
- Additional S-101 test data validation
- Performance optimization for mobile browsers

## Author

Built by **Vladislav Popov** — [vladislavpopov.ru](https://vladislavpopov.ru) · [GitHub @devladpopov](https://github.com/devladpopov)

Questions, integration help, or commercial/consulting inquiries: open an [issue](https://github.com/devladpopov/s57-parser/issues) or reach me at vlad@alumni.york.ac.uk.

## License

MIT © Vladislav Popov
