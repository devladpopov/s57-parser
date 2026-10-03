# @s57-parser/s57

IHO S-57 (Edition 3.1) electronic navigational chart parser: feature and
spatial records, chain-node topology, incremental updates (.001, .002, ...),
typed features and GeoJSON conversion.

Zero dependencies besides `@s57-parser/iso8211`. ESM only. Node.js 18+, Bun, browsers.

```bash
npm install @s57-parser/s57
```

## Parse a cell and convert to GeoJSON

```ts
import { readFileSync } from 'node:fs';
import { parseS57, toGeoJSON } from '@s57-parser/s57';

const read = (path: string) => {
  const b = readFileSync(path);
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
};

const dataset = parseS57(read('US5MA12M.000'));
dataset.name;               // 'US5MA12M.000'
dataset.cscl;               // 25000 (compilation scale 1:25 000)
dataset.features.length;    // 2406
dataset.spatialRecords.size // 4678

const geojson = toGeoJSON(dataset);
// Feature properties: RCID, OBJL, PRIM, GRUP, AGEN/FIDN/FIDS and every
// attribute as ATTL_<code>, e.g. { OBJL: 75, ATTL_75: '1', ATTL_107: '2', ... }
```

In the browser, pass `await (await fetch(url)).arrayBuffer()` instead.

Only some object classes? `toGeoJSON(dataset, [75, 129])` keeps LIGHTS and SOUNDG.

Geometry: points and isolated nodes become `Point` (soundings `MultiPoint`),
edges are chained through their connected nodes into `LineString`, and areas
into closed `Polygon` rings with holes. Areas cut by the data limit or with
masked edges get an `_outline` property with only the edges that should be
stroked (S-52).

## Apply updates

```ts
import { parseS57, applyUpdate } from '@s57-parser/s57';

const ds = parseS57(read('US5MA19M.000'));
applyUpdate(ds, read('US5MA19M.001')); // mutates and returns ds
applyUpdate(ds, read('US5MA19M.002'));
ds.name; // 'US5MA19M.002'
```

Supported: record insert/delete/modify (RUIN) for feature and vector records,
attribute changes and deletions, FSPC/VRPC/SGCC pointer and coordinate splices.
Apply updates in sequence; update numbers are not checked.

## Typed features

```ts
import { typedFeatures, filterByClass } from '@s57-parser/s57';

const typed = typedFeatures(ds.features);
for (const light of filterByClass(typed, 'LIGHTS')) {
  // light: Light, with litchr, sigper, siggrp, colour, sectr1, sectr2, ...
  console.log(light.rcid, light.name, light.litchr, light.sigper);
}
for (const area of filterByClass(typed, 'DEPARE')) {
  console.log(area.drval1, area.drval2); // numbers, metres
}
```

15 interfaces cover 19 object classes: `DEPARE`, `DEPCNT`, `SOUNDG`, `COALNE`,
`LNDARE`, `LIGHTS`, `BCNCAR`, `BCNLAT`, `BOYCAR`, `BOYLAT`, `BOYSAW`, `BOYSPP`,
`OBSTRN`, `WRECKS`, `UWTROC`, `RESARE`, `BRIDGE`, `LNDMRK`, `ACHARE`.

Attribute codes and names: `S57_ATTRIBUTES` (code → `{ acronym, name, valueType }`),
`ATTL_BY_ACRONYM`, `ATTL.DRVAL1`, ...

## API

| Export | |
|--------|---|
| `parseS57(buffer)` | Parse a base cell (`.000`) into an `S57Dataset` |
| `applyUpdate(dataset, buffer)` | Apply an update file in place |
| `toGeoJSON(dataset, objl?)` | GeoJSON `FeatureCollection` |
| `typedFeature(f)`, `typedFeatures(fs)`, `filterByClass(fs, cls)` | Typed access |
| `spatialKey(rcnm, rcid)` | Key into `dataset.spatialRecords` |
| `GeomPrimitive`, `SpatialType`, `OBJL`, `ATTL`, `S57_ATTRIBUTES`, `ATTL_BY_ACRONYM` | Constants |

Text attributes are decoded byte by byte (ASCII / ISO 8859-1). National text
in UCS-2 (lexical level 2, e.g. `NOBJNM`) is not converted yet.

Part of [s57-parser](https://github.com/devladpopov/s57-parser). MIT licence.
