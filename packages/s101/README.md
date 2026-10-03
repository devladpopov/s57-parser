# @s57-parser/s101

Experimental parser for IHO S-101 (S-100 framework) ENC datasets, with
GeoJSON conversion and a mapping of S-101 feature types to S-57 object codes,
so the S-52 renderer can draw them.

ESM only. Node.js 18+, Bun, browsers.

```bash
npm install @s57-parser/s101
```

```ts
import { isS101, parseS101, toGeoJSON } from '@s57-parser/s101';

if (isS101(buffer)) {
  const ds = parseS101(buffer);
  ds.features[0].featureTypeName; // e.g. 'Light'
  const geojson = toGeoJSON(ds);
  // properties: featureType, featureTypeCode, OBJL (S-57 code when mapped),
  // ATTL_<code>, CATF_<code> (complex attributes), _featureAssociations
}
```

`isS101()` returns `false` for S-57 cells (their DSID carries `STED`/`EXPP`)
and for data that is not ISO 8211, so it is safe for format detection.

## Status

The parser reads S-57-style record fields (`FRID` with `NFTC`, `ATTF`, `NATF`,
`CATF`, `FSPT`, `FFAS`, `FIAS`, `IRID`, `VRID`/`SG2D`/`SG3D`/`VRPT`/`CCOC`).
It is tested against synthetic datasets only. Real S-101 cells encoded per
S-100 Part 10a (`ATTR`, `SPAS`, `C2IT`/`C2IL`, `PRID`/`CRID`/`SRID`, ...) are
not supported yet. Treat the API as unstable.

## API

- `parseS101(buffer)`, `isS101(buffer)`, `toGeoJSON(dataset, featureTypeCodes?)`, `spatialKey()`
- `S101_FEATURE_CATALOGUE` (code → name), `S101_FEATURE_BY_NAME`, `S101_TO_S57_OBJL`
- `S101Primitive`, `S101SpatialType`, `CurveType` and the dataset types

Part of [s57-parser](https://github.com/devladpopov/s57-parser). MIT licence.
