/**
 * Client-side export helpers for the browser demo: GeoJSON, PNG, and PDF.
 * All exports run entirely in the browser with no dependency and no server.
 * These are data / image exports for inspection and GIS use, not certified
 * navigation charts.
 */

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Download the parsed feature collection as a `.geojson` file (QGIS-ready). */
export function exportGeoJSON(geojson: unknown, filename: string): void {
  const replacer = (key: string, value: unknown) =>
    key === '_attributes' ? undefined : value; // drop the internal Map
  const blob = new Blob([JSON.stringify(geojson, replacer)], {
    type: 'application/geo+json',
  });
  downloadBlob(blob, filename);
}

/** Download the current S-52 render as a PNG image. */
export function exportPNG(canvas: HTMLCanvasElement, filename: string): void {
  canvas.toBlob(blob => {
    if (blob) downloadBlob(blob, filename);
  }, 'image/png');
}

/** Download the current render as a single-page PDF embedding a JPEG. */
export function exportPDF(canvas: HTMLCanvasElement, filename: string): void {
  const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
  const bin = atob(dataUrl.slice(dataUrl.indexOf(',') + 1));
  const jpeg = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) jpeg[i] = bin.charCodeAt(i);
  const pdf = buildJpegPdf(jpeg, canvas.width, canvas.height);
  downloadBlob(new Blob([pdf as BlobPart], { type: 'application/pdf' }), filename);
}

/** Minimal single-page PDF (1.4) embedding a baseline JPEG via DCTDecode. */
function buildJpegPdf(jpeg: Uint8Array, w: number, h: number): Uint8Array {
  const enc = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const offsets: number[] = [];
  let offset = 0;

  const push = (u: Uint8Array) => {
    chunks.push(u);
    offset += u.length;
  };
  const obj = (s: string) => {
    offsets.push(offset);
    push(enc.encode(s));
  };

  push(enc.encode('%PDF-1.4\n'));
  obj('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');
  obj('2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n');
  obj(
    `3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${w} ${h}] ` +
      `/Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>\nendobj\n`,
  );
  obj(
    `4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${w} /Height ${h} ` +
      `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode ` +
      `/Length ${jpeg.length} >>\nstream\n`,
  );
  push(jpeg);
  push(enc.encode('\nendstream\nendobj\n'));

  const content = `q\n${w} 0 0 ${h} 0 0 cm\n/Im0 Do\nQ\n`;
  obj(`5 0 obj\n<< /Length ${content.length} >>\nstream\n${content}endstream\nendobj\n`);

  const xrefStart = offset;
  let xref = 'xref\n0 6\n0000000000 65535 f \n';
  for (const o of offsets) xref += String(o).padStart(10, '0') + ' 00000 n \n';
  xref += `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;
  push(enc.encode(xref));

  const total = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(total);
  let p = 0;
  for (const c of chunks) {
    out.set(c, p);
    p += c.length;
  }
  return out;
}
