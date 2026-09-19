/**
 * Build the NOAA ENC catalog index consumed by demo/catalog.html.
 *
 * Fetches NOAA's public ENC Product Catalog XML and distils it into a compact
 * JSON array (id, title, scale, usage band, status, states, size, edition,
 * updated date, zip URL). The generated demo/catalog-index.json is committed so
 * GitHub Pages needs no network at deploy time. Re-run to refresh:
 *
 *   bun scripts/build-noaa-catalog.ts
 */

const CATALOG_URL = 'https://www.charts.noaa.gov/ENCs/ENCProdCat.xml';
const OUT = new URL('../demo/catalog-index.json', import.meta.url);

interface CatalogEntry {
  id: string;
  title: string;
  scale: number;
  band: number;
  status: string;
  states: string;
  size: number;
  edition: number;
  updated: string;
  zip: string;
}

const USAGE_BAND: Record<number, string> = {
  1: 'Overview',
  2: 'General',
  3: 'Coastal',
  4: 'Approach',
  5: 'Harbour',
  6: 'Berthing',
};

function tag(block: string, name: string): string {
  const m = block.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`));
  return m ? m[1].trim() : '';
}

function tagAll(block: string, name: string): string[] {
  const re = new RegExp(`<${name}>([\\s\\S]*?)</${name}>`, 'g');
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(block)) !== null) out.push(m[1].trim());
  return out;
}

async function main() {
  process.stdout.write(`Fetching ${CATALOG_URL} ...\n`);
  const resp = await fetch(CATALOG_URL);
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const xml = await resp.text();

  const cells = xml.match(/<cell>[\s\S]*?<\/cell>/g) ?? [];
  process.stdout.write(`Parsed ${cells.length} cells\n`);

  const entries: CatalogEntry[] = [];
  for (const cell of cells) {
    const status = tag(cell, 'status');
    if (status === 'Cancelled') continue; // not downloadable, drop to keep index lean

    const id = tag(cell, 'name');
    const band = Number(id[2]) || 0;
    entries.push({
      id,
      title: tag(cell, 'lname'),
      scale: Number(tag(cell, 'cscale')) || 0,
      band,
      status,
      states: tagAll(cell, 'state').join(','),
      size: Number(tag(cell, 'zipfile_size')) || 0,
      edition: Number(tag(cell, 'edtn')) || 0,
      updated: tag(cell, 'isdt'),
      zip: tag(cell, 'zipfile_location'),
    });
  }

  entries.sort((a, b) => a.id.localeCompare(b.id));

  const index = {
    source: CATALOG_URL,
    generated: new Date().toISOString().slice(0, 10),
    bands: USAGE_BAND,
    count: entries.length,
    cells: entries,
  };

  await Bun.write(OUT, JSON.stringify(index));
  process.stdout.write(`Wrote ${entries.length} cells to demo/catalog-index.json\n`);
}

main().catch(err => {
  process.stderr.write(`Failed: ${(err as Error).message}\n`);
  process.exit(1);
});
