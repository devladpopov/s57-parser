/**
 * Build the bundled world layer of the plotter, demo/world/world.json: land,
 * country borders and large lakes as one small TopoJSON file, drawn under the
 * charts everywhere outside the offline base map, with no network.
 *
 * Source: Natural Earth 1:10m (public domain), the Russian point of view
 * edition of the countries (ne_10m_admin_0_countries_rus, Crimea and
 * Sevastopol in Russia). That edition still shows the Donetsk and Luhansk
 * republics as separate units and Zaporozhye and Kherson regions in Ukraine,
 * so the four regions are cut out of Ukraine and joined to Russia here, by
 * their Natural Earth admin-1 polygons. The result is simplified with
 * mapshaper, and borders are the shared edges of the countries only (no
 * coastlines). The script fails if the check points below are not where they
 * should be. The output is committed; re-run to regenerate:
 *
 *   bun scripts/build-world.ts
 */
import { mkdirSync, statSync } from 'node:fs';
import { countryAt, decodeTopology, type Topology } from '../demo/world.js';

/** natural-earth-vector, pinned to a commit so the output is reproducible (v5.1.2 data). */
const NE = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/ca96624a56bd078437bca8184e78163e5039ad19/geojson';
const SOURCES = {
  countries: 'ne_10m_admin_0_countries_rus.geojson',
  regions: 'ne_10m_admin_1_states_provinces.geojson',
  lakes: 'ne_50m_lakes.geojson',
};
const MAPSHAPER = 'mapshaper@0.6.121';
const SRC = 'build/world-src';
const OUT = 'demo/world/world.json';

/** Ukrainian admin-1 regions that are part of Russia: Donetsk, Luhansk, Zaporozhye, Kherson. */
const JOINED = ['UA-14', 'UA-09', 'UA-23', 'UA-65'];
/**
 * Units of the Russian edition that are not countries of their own here:
 * the 2014 Donetsk and Luhansk republics (now inside the joined regions) and
 * Nagorno-Karabakh (Azerbaijan since 2023).
 */
const REMAP = { C02: 'RUS', C03: 'RUS', B38: 'AZE' };
/** Share of the 1:10m vertices kept: about 1 MB, enough down to zoom 9 or so. */
const SIMPLIFY = '20%';

/** Points that must be in a given country of the output. */
const CHECKS: [string, number, number, string][] = [
  ['Simferopol', 34.10, 44.95, 'RUS'],
  ['Sevastopol', 33.52, 44.60, 'RUS'],
  ['Kerch', 36.47, 45.36, 'RUS'],
  ['Donetsk', 37.80, 48.00, 'RUS'],
  ['Mariupol', 37.55, 47.10, 'RUS'],
  ['Kramatorsk', 37.56, 48.72, 'RUS'],
  ['Luhansk', 39.30, 48.57, 'RUS'],
  ['Severodonetsk', 38.48, 48.95, 'RUS'],
  ['Zaporozhye', 35.14, 47.84, 'RUS'],
  ['Melitopol', 35.37, 46.85, 'RUS'],
  ['Kherson', 32.60, 46.66, 'RUS'],
  ['Genichesk', 34.80, 46.18, 'RUS'],
  ['Iturup', 147.90, 45.00, 'RUS'],
  ['Kaliningrad', 20.51, 54.71, 'RUS'],
  ['Kyiv', 30.52, 50.45, 'UKR'],
  ['Odessa', 30.73, 46.48, 'UKR'],
  ['Kharkiv', 36.23, 49.99, 'UKR'],
  ['Dnipro', 35.05, 48.46, 'UKR'],
  ['Mykolaiv', 32.00, 46.97, 'UKR'],
  ['Pristina', 21.17, 42.66, 'SRB'],
  ['Stepanakert', 46.75, 39.82, 'AZE'],
];

async function download(name: string): Promise<string> {
  const path = `${SRC}/${name}`;
  if (await Bun.file(path).exists()) return path;
  console.log(`Downloading ${name}`);
  const res = await fetch(`${NE}/${name}`);
  if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`);
  await Bun.write(path, res);
  return path;
}

function mapshaper(...args: string[]): void {
  const r = Bun.spawnSync(['bunx', MAPSHAPER, ...args], { stdout: 'inherit', stderr: 'inherit' });
  if (r.exitCode !== 0) throw new Error(`mapshaper ${args.join(' ')} failed`);
}

mkdirSync(SRC, { recursive: true });
mkdirSync('demo/world', { recursive: true });
const countries = await download(SOURCES.countries);
const regions = await download(SOURCES.regions);
const lakes = await download(SOURCES.lakes);

// The four regions as one polygon.
mapshaper('-i', regions,
  '-filter', `${JSON.stringify(JOINED)}.indexOf(iso_3166_2) >= 0`,
  '-dissolve', '-each', "ADM0_A3_RU = 'RUS'",
  '-o', `${SRC}/joined.json`, 'format=geojson');

// Countries with the regions cut out of Ukraine and joined to Russia. In the
// Russian edition ADM0_A3_RU is the unit code (other codes are empty for its
// own units). dissolve2 also fills the slivers between the two sources.
mapshaper('-i', countries,
  '-each', `ADM0_A3_RU = (${JSON.stringify(REMAP)})[ADM0_A3_RU] || ADM0_A3_RU`,
  '-erase', `${SRC}/joined.json`,
  '-filter-fields', 'ADM0_A3_RU,NAME_RU,NAME_EN,LABEL_X,LABEL_Y,MIN_LABEL',
  '-o', `${SRC}/cut.json`, 'format=geojson');
mapshaper('-i', `${SRC}/cut.json`, `${SRC}/joined.json`, 'combine-files',
  '-merge-layers', 'force',
  '-dissolve2', 'ADM0_A3_RU', 'copy-fields=NAME_RU,NAME_EN,LABEL_X,LABEL_Y,MIN_LABEL', 'gap-fill-area=5km2',
  '-each', 'code = ADM0_A3_RU, ru = NAME_RU, en = NAME_EN, lx = LABEL_X, ly = LABEL_Y, mz = MIN_LABEL',
  '-filter-fields', 'code,ru,en,lx,ly,mz',
  '-o', `${SRC}/countries.json`, 'format=geojson');

// Simplified one by one (lakes cross borders, simplified together their
// edges would cut each other), then the countries, their shared edges as
// borders, and the lakes in one file.
mapshaper('-i', `${SRC}/countries.json`, '-simplify', SIMPLIFY, 'keep-shapes', '-o', `${SRC}/countries-s.json`, 'format=geojson');
mapshaper('-i', lakes, '-filter-fields', 'name', '-simplify', SIMPLIFY, 'keep-shapes', '-o', `${SRC}/lakes-s.json`, 'format=geojson');
mapshaper('-i', `${SRC}/countries-s.json`, `${SRC}/lakes-s.json`, 'combine-files',
  '-rename-layers', 'countries,lakes',
  '-innerlines', 'target=countries', '+', 'name=borders',
  '-o', OUT, 'format=topojson', 'target=*', 'quantization=400000');

// The check: every point in the expected country of the written file.
const world = decodeTopology(await Bun.file(OUT).json() as Topology, 'countries');
let bad = 0;
for (const [name, lon, lat, code] of CHECKS) {
  const got = countryAt(world, lon, lat)?.properties.code ?? '-';
  console.log(`${got === code ? 'ok ' : 'BAD'} ${name.padEnd(14)} ${got}`);
  if (got !== code) bad++;
}
if (bad) {
  console.error(`${bad} check points are in the wrong country`);
  process.exit(1);
}
console.log(`Wrote ${OUT}, ${(statSync(OUT).size / 1024).toFixed(0)} KB`);
