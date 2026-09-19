/**
 * NOAA ENC catalog gallery. Loads the pre-built catalog-index.json, renders a
 * searchable table of cells, and links each to a direct NOAA download plus an
 * "Open in viewer" attempt (subject to NOAA's CORS policy).
 */

interface Cell {
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

interface Index {
  source: string;
  generated: string;
  bands: Record<string, string>;
  count: number;
  cells: Cell[];
}

const q = document.getElementById('q') as HTMLInputElement;
const bandSel = document.getElementById('band') as HTMLSelectElement;
const rowsEl = document.getElementById('rows')!;
const tbl = document.getElementById('tbl') as HTMLTableElement;
const statusEl = document.getElementById('status')!;
const countEl = document.getElementById('count')!;
const srcEl = document.getElementById('src')!;

const MAX_ROWS = 400;
let cells: Cell[] = [];
let bands: Record<string, string> = {};

function fmtScale(s: number): string {
  return s > 0 ? `1:${s.toLocaleString('en-US')}` : '—';
}

function fmtSize(bytes: number): string {
  if (bytes <= 0) return '—';
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
}

function apply() {
  const term = q.value.trim().toLowerCase();
  const band = bandSel.value;
  const matched = cells.filter(c => {
    if (band && String(c.band) !== band) return false;
    if (!term) return true;
    return (
      c.id.toLowerCase().includes(term) ||
      c.title.toLowerCase().includes(term) ||
      c.states.toLowerCase().includes(term)
    );
  });

  const shown = matched.slice(0, MAX_ROWS);
  rowsEl.innerHTML = shown
    .map(c => {
      const bandLabel = bands[String(c.band)] ?? String(c.band);
      return (
        `<tr>` +
        `<td class="id">${escapeHtml(c.id)}</td>` +
        `<td><span class="band">${escapeHtml(bandLabel)}</span></td>` +
        `<td class="title">${escapeHtml(c.title)}</td>` +
        `<td>${fmtScale(c.scale)}</td>` +
        `<td>${escapeHtml(c.states)}</td>` +
        `<td>${fmtSize(c.size)}</td>` +
        `<td>${escapeHtml(c.updated)}</td>` +
        `<td>${c.edition || '—'}</td>` +
        `<td>` +
        `<a class="dl" href="${escapeHtml(c.zip)}" download>Download</a> ` +
        `<button class="open" data-zip="${escapeHtml(c.zip)}">Open</button>` +
        `</td>` +
        `</tr>`
      );
    })
    .join('');

  countEl.textContent =
    matched.length > MAX_ROWS
      ? `${MAX_ROWS} of ${matched.length.toLocaleString('en-US')} shown — refine your search`
      : `${matched.length.toLocaleString('en-US')} cells`;
}

rowsEl.addEventListener('click', e => {
  const btn = (e.target as HTMLElement).closest('button.open') as HTMLButtonElement | null;
  if (!btn) return;
  const zip = btn.dataset.zip!;
  window.location.href = `./index.html?zip=${encodeURIComponent(zip)}`;
});

q.addEventListener('input', apply);
bandSel.addEventListener('change', apply);

async function main() {
  try {
    const resp = await fetch('./catalog-index.json');
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const index = (await resp.json()) as Index;
    cells = index.cells;
    bands = index.bands;
    srcEl.textContent = `${index.count.toLocaleString('en-US')} cells · updated ${index.generated}`;
    statusEl.hidden = true;
    tbl.hidden = false;
    apply();
  } catch (err) {
    statusEl.textContent = `Failed to load catalog: ${(err as Error).message}`;
  }
}

main();
