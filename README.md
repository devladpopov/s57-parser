# s57-parser

[![CI](https://github.com/devladpopov/s57-parser/actions/workflows/ci.yml/badge.svg)](https://github.com/devladpopov/s57-parser/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-blue.svg)](https://www.typescriptlang.org/)

Pure TypeScript parser for **S-57** and **S-101** marine navigational charts with **S-52** symbology rendering in the browser.

Zero runtime dependencies. Works in Node.js, Bun, and browsers. **105 tests.**

## Packages

| Package | Description |
|---------|-------------|
| `@s57-parser/iso8211` | ISO 8211 binary format parser |
| `@s57-parser/s57` | S-57 ENC data model, topology, GeoJSON conversion |
| `@s57-parser/s101` | S-101 ENC parser (S-100 framework), auto-detection |
| `@s57-parser/s52-render` | S-52 Canvas2D renderer (IHO symbology, 3 palettes) |
| `@s57-parser/leaflet` | Leaflet plugin with S-52 canvas overlay |
| `@s57-parser/maplibre` | MapLibre GL JS plugin (GeoJSON source + canvas layer) |

## Quick Start

```bash
npm install @s57-parser/s57 @s57-parser/s52-render
```

### Parse an S-57 chart

```typescript
import { parseS57, toGeoJSON } from '@s57-parser/s57';

const response = await fetch('/chart/US5MA19M.000');
const buffer = await response.arrayBuffer();

const dataset = parseS57(buffer);
const geojson = toGeoJSON(dataset);

console.log(`${dataset.features.length} features`);
console.log(`${dataset.spatialRecords.size} spatial records`);
```

### Render with S-52 symbology

```typescript
import { parseS57, toGeoJSON } from '@s57-parser/s57';
import { renderChart } from '@s57-parser/s52-render';

const dataset = parseS57(buffer);
const geojson = toGeoJSON(dataset);

// Attach attributes for conditional symbology (depth-based coloring, etc.)
for (const f of geojson.features) {
  const feat = dataset.features.find(d => d.rcid === f.properties.RCID);
  if (feat) f.properties._attributes = feat.attributes;
}

const canvas = document.getElementById('chart') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;

renderChart(ctx, geojson, {
  toPixelX: lon => /* your lon-to-pixel transform */,
  toPixelY: lat => /* your lat-to-pixel transform */,
}, canvas.width, canvas.height, { mode: 'DAY_BRIGHT' });
```

### S-101 support

```typescript
import { parseS101, isS101, toGeoJSON } from '@s57-parser/s101';

// Auto-detect format
if (isS101(buffer)) {
  const dataset = parseS101(buffer);
  const geojson = toGeoJSON(dataset);
  // GeoJSON properties include OBJL mapped to S-57 codes
  // for compatibility with the S-52 renderer
}
```

### Leaflet integration

```typescript
import L from 'leaflet';
import { S57Layer } from '@s57-parser/leaflet';

const map = L.map('map').setView([42.35, -70.88], 12);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);

const response = await fetch('/chart/US5MA19M.000');
const buffer = await response.arrayBuffer();
const layer = new S57Layer(buffer, { mode: 'DAY_BRIGHT' });
layer.addTo(map);

// Cycle display modes
layer.setMode('DUSK');
layer.setMode('NIGHT');
```

### MapLibre GL JS integration

```typescript
import maplibregl from 'maplibre-gl';
import { addChartSource } from '@s57-parser/maplibre';

const map = new maplibregl.Map({ container: 'map', style: '...' });

const response = await fetch('/chart/US5MA19M.000');
const buffer = await response.arrayBuffer();

// Option 1: Native vector rendering with S-52-inspired styles
addChartSource(map, buffer, { sourceId: 'enc' });

// Option 2: Full S-52 canvas overlay
import { S57CanvasLayer } from '@s57-parser/maplibre';
const layer = new S57CanvasLayer('enc-overlay', buffer);
map.addLayer(layer);
```

### Apply incremental updates

```typescript
import { parseS57 } from '@s57-parser/s57';
import { applyUpdate } from '@s57-parser/s57';

const base = parseS57(baseBuffer);    // .000 file
applyUpdate(base, update001Buffer);   // .001 file (mutates dataset)
applyUpdate(base, update002Buffer);   // .002 file
```

## Features

**ISO 8211 Parser**
- Full ISO/IEC 8211 binary format support
- Variable-length fields, mixed binary/text encoding
- Both `b15` (suffix) and `B(40)` (parenthesized) binary field notations

**S-57 Parser**
- Feature and spatial record extraction
- Chain-node topology resolution (VRPT edge endpoints)
- Coordinate scaling (COMF/SOMF)
- GeoJSON conversion (Point, MultiPoint, LineString, Polygon)
- Update mechanism (.001/.002 incremental files)

**S-101 Parser**
- S-100 framework ISO 8211 encoding
- 160+ feature types with full catalogue
- Complex (nested) attributes
- Information records and associations
- S-57 OBJL mapping for renderer compatibility
- Auto-detection (isS101)

**S-52 Renderer**
- Three IHO display palettes: DAY_BRIGHT, DUSK, NIGHT
- 50+ object class symbology rules
- Conditional symbology: depth-dependent DEPARE coloring, light color by COLOUR attribute
- Text labels: sounding depths, depth contour values, light characteristics (IHO abbreviations)
- Sector lights: arc rendering with bearing-based sectors
- Pattern fills: hatch, cross-hatch, stipple
- Priority-based rendering (8 display priority levels)

## S-52 Display Modes

| Mode | Use case |
|------|----------|
| `DAY_BRIGHT` | Full daylight, highest contrast |
| `DUSK` | Twilight, reduced brightness |
| `NIGHT` | Night vision, dark red-tinted |

## Architecture

```
@s57-parser/iso8211       Pure ISO 8211 binary parser
       |
  +---------+
  |         |
@s57-parser/s57    @s57-parser/s101
  |         |
  +---------+
       |
@s57-parser/s52-render    Canvas2D S-52 renderer
       |
  +---------+
  |         |
@s57-parser/leaflet    @s57-parser/maplibre
```

## Test Data

Download free NOAA ENC charts from [charts.noaa.gov](https://charts.noaa.gov/ENCs/ENCs.shtml) (S-57 .000 files, ~782 MB total).

Place files in the `test-data/` directory for integration tests.

## Development

```bash
# Install dependencies
bun install

# Run all tests (105 tests across 7 packages)
bun test

# Build all packages
bun run build

# Run demo viewer
bun run demo/serve.ts
```

## Contributing

Contributions welcome. Areas that need help:

- WebGL renderer for large charts (millions of coordinates)
- S-63 encryption/decryption support
- Additional S-101 test data validation
- Performance optimization for mobile browsers

## License

MIT
