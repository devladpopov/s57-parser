# @s57-parser/iso8211

Pure TypeScript parser for the ISO/IEC 8211 binary format, the container
used by IHO S-57 and S-100/S-101 electronic navigational charts.

Zero dependencies. ESM only. Works in Node.js 18+, Bun, Deno and browsers.

```bash
npm install @s57-parser/iso8211
```

## Usage

```ts
import { readFileSync } from 'node:fs';
import { parse } from '@s57-parser/iso8211';

const b = readFileSync('US5MA12M.000');
// Copy into a standalone ArrayBuffer: Node buffers can be views into a shared pool.
const buffer = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);

const file = parse(buffer);
console.log(file.ddr.directory.map(d => d.tag)); // ['0000', '0001', 'DSID', ...]

const dsid = file.records[0].fields.find(f => f.tag === 'DSID')!;
for (const sf of dsid.subfields) console.log(sf.label, sf.value);
// RCNM 10, RCID 1, ..., DSNM 'US5MA12M.000', ...
```

`parse()` reads the Data Descriptive Record (DDR), then decodes every data
record's fields into typed subfields using the DDR format controls:

| Format | Decoded as |
|--------|------------|
| `A`, `A(n)` | `{ type: 'string' }` (variable length up to a unit terminator, or fixed width) |
| `I`, `I(n)` | `{ type: 'int' }` |
| `R`, `R(n)` | `{ type: 'real' }` |
| `b1n` | `{ type: 'uint' }`, n bytes little-endian |
| `b2n` | `{ type: 'int' }`, n bytes little-endian two's complement |
| `B(n)` | `{ type: 'uint' }`, n bits |

Repeating groups (labels starting with `*`, e.g. `*YCOO!XCOO`) are decoded by
cycling through the format controls; labels keep the `*` prefix.
Each field also keeps its `raw` bytes.

`parse()` throws an `Error` when the buffer is not ISO 8211 (truncated leader,
inconsistent record length or base address).

## API

- `parse(buffer: ArrayBuffer): ISO8211File`
- Types: `ISO8211File`, `ISO8211Record`, `ISO8211Leader`, `ISO8211DirectoryEntry`,
  `ISO8211Field`, `DataDescriptiveField`, `FormatControl`

Part of [s57-parser](https://github.com/devladpopov/s57-parser). MIT licence.
