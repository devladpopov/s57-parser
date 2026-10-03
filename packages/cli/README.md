# @s57-parser/cli

Command-line tool to inspect S-57 / S-101 cells, convert them to GeoJSON and
dump raw ISO 8211 records. Node.js 18+.

```bash
npm install -g @s57-parser/cli
# or without installing
npx @s57-parser/cli info US5MA12M.000
```

```text
$ s57 info US5MA12M.000
Format          S-57
Dataset         US5MA12M.000
Scale           1:25,000
COMF / SOMF     10000000 / 10
Extent          lat 42.21034..42.33423, lon -71.07946..-70.73167
Features        2406
Spatial records 4678
  by primitive  Area 590, Point 1065, Line 750, None 1
  by type       IsolatedNode 1006, ConnectedNode 1589, Edge 2083

Object classes:
     516  UWTROC  153
     423  DEPCNT  43
     ...
```

```bash
s57 geojson US5MA19M.000 US5MA19M.001 -o chart.geojson   # base cell + updates
s57 geojson US5MA12M.000 --pretty | jq '.features | length'
s57 dump US5MA12M.000 --limit 5                          # records and subfields
s57 --help
```

Exit codes: 0 success, 1 read or parse error, 2 usage error.

Part of [s57-parser](https://github.com/devladpopov/s57-parser). MIT licence.
