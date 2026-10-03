# Changelog

All notable changes to the `@s57-parser/*` packages. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow
[Semantic Versioning](https://semver.org/) (before 1.0, minor versions may
contain breaking changes).

Until 0.2.1 packages were versioned separately. From 0.3.0 all packages share
one version.

## [0.3.0] - Unreleased

### Added
- `@s57-parser/cli`: working `s57` command. Versions 0.1.0 and 0.2.0 on npm
  were placeholders that only printed a version string.
  - `s57 info <cell> [updates...]`: dataset, scale, extent, record counts, object classes
  - `s57 geojson <cell> [updates...] [-o file] [--pretty]`
  - `s57 dump <file> [--limit n]`: ISO 8211 records with decoded subfields
- README for every package (the npm pages had none), LICENSE in every tarball.
- `exports["./package.json"]` and `default` export condition in every package.
- `engines.node >= 18`, `sideEffects: false`.

### Changed
- `iso8211`: `parse()` throws a descriptive `Error` on input that is not
  ISO 8211 (truncated leader, impossible record length or base address, empty
  entry map) instead of returning records full of `NaN`. A record length of
  `00000` used to loop forever. Fewer than 24 trailing bytes after the last
  record are ignored.
- The `types` condition comes first in `exports`, as TypeScript expects.
- `src/` is published next to `dist/`: the `bun` export condition points at
  `src/index.ts`, which was missing from the 0.2.x tarballs, and source maps
  now resolve.
- `@s57-parser/cli` depends on `@s57-parser/s101` and `@s57-parser/s52-render`
  (format detection, object class names).

### Development
- Tests run on the NOAA cell committed in the repository
  (`demo/charts/US5MA12M.000`) and no longer fail without a download; tests for
  NOAA US5MA19M and its update run when `test-data/` is present.
- Update (`.001`) handling, the S-101 parser, the Leaflet loader, the MapLibre
  source and canvas layer, the S-52 renderer and the CLI are now tested
  (line coverage 77% -> 99%), using a small ISO 8211 writer in `test-utils/`.
- `bun run build` builds all packages with `tsc -b`; `bun run test:coverage`
  enforces coverage thresholds; `bun run pack:check` packs every package,
  installs the tarballs into a fresh project, imports them from Node, runs the
  CLI and type-checks consumer code.
- CI runs tests with coverage, the build, and the pack check on Node.js 18, 20, 22 and 24.

## [0.2.1] - 2026-09-30 (`iso8211` 0.1.1, `s57` 0.2.1)

### Fixed
- `iso8211`: a 0x1E byte inside binary subfields (a record id of 30, a
  coordinate whose low byte is 0x1E) no longer ends the field. Records and
  coordinate tails were dropped, which drew fans of triangles.
- `s57`: update splices for coordinate deletes (no SG2D/SG3D field) and pointer
  deletes (no FSPT field), and first vertices inserted into an edge without
  intermediate points.

## [0.2.0] - 2026-09-29 (`s57`, `s101`, `s52-render`, `leaflet`, `maplibre`, `cli`)

### Fixed
- `s57`, `s52-render`: object class and attribute codes checked against IHO
  S-57 Edition 3.1 Appendix A; the attribute table is the full catalogue (309
  entries). Depth areas were all coloured as deep water, underwater rocks were
  treated as route parts, light sectors and periods were never found.
- `s57`: holes made of several edges are chained into rings; edges on the data
  limit are not stroked (`_outline` property).

### Added
- `s52-render`: area symbols and labels are placed in the visible part of the
  polygon (`visibleAnchor`, `clipRing`, `simplifyRing`); `drawLegendSymbol`.

## [0.1.2] - 2026-09-23 (`leaflet`, `maplibre`)

### Fixed
- 0.1.1 was published against a stale lockfile and depended on `s52-render`
  0.1.0; republished to depend on `s52-render` 0.1.1.

## [0.1.1] - 2026-09-23 (`s52-render`, `leaflet`, `maplibre`)

### Added
- `s52-render`: `renderChart` option `background: false` for overlays.

### Fixed
- `leaflet`: `S57Layer` extends `L.Layer`, so `addTo()`, `remove()` and layer controls work.

## [0.1.0] - 2026-06-13

First release: `iso8211`, `s57` (topology, updates, typed features, GeoJSON),
`s101`, `s52-render`, `leaflet`, `maplibre`, and a placeholder `cli`.

[0.3.0]: https://github.com/devladpopov/s57-parser/compare/v0.2.1...HEAD
[0.2.1]: https://github.com/devladpopov/s57-parser/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/devladpopov/s57-parser/compare/v0.1.2...v0.2.0
[0.1.2]: https://github.com/devladpopov/s57-parser/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/devladpopov/s57-parser/releases/tag/v0.1.1
[0.1.0]: https://github.com/devladpopov/s57-parser/commits/v0.1.1
