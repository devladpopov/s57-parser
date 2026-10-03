/**
 * A small synthetic S-101 dataset in the record layout @s57-parser/s101
 * reads: three points, two curves, a composite curve, six features and an
 * information record. No real S-101 cell is committed to the repository.
 */
import { ddr, dr, file, enc, concat, s57, type FieldSpec } from './iso8211-writer.js';

const FIELDS: FieldSpec[] = [
  { tag: '0001', name: 'ISO/IEC 8211 Record Identifier', labels: '', format: '(b12)' },
  { tag: 'DSID', name: 'Dataset identification', labels: 'RCNM!RCID!DSNM!PRSP!EDTN', format: '(b11,b14,3A)' },
  { tag: 'DSSI', name: 'Dataset structure information', labels: 'CRSS', format: '(b12)' },
  { tag: 'DSPM', name: 'Dataset parameter', labels: 'COMF!SOMF', format: '(2b14)' },
  { tag: 'VRID', name: 'Vector record identifier', labels: 'RCNM!RCID', format: '(b11,b14)' },
  { tag: 'VRPT', name: 'Vector record pointer', labels: '*NAME!ORNT!USAG!TOPI!MASK', format: '(B(40),4b11)' },
  { tag: 'SG2D', name: '2-D coordinate', labels: '*YCOO!XCOO', format: '(2b24)' },
  { tag: 'SG3D', name: '3-D coordinate', labels: '*YCOO!XCOO!VE3D', format: '(3b24)' },
  { tag: 'CCOC', name: 'Composite curve components', labels: '*CCRF', format: '(b14)' },
  { tag: 'FRID', name: 'Feature record identifier', labels: 'RCNM!RCID!NFTC!PRIM', format: '(b11,b14,b12,b11)' },
  { tag: 'FOID', name: 'Feature object identifier', labels: 'AGEN!FIDN!FIDS', format: '(b12,b14,b12)' },
  { tag: 'ATTF', name: 'Feature attribute', labels: '*ATTL!ATVL', format: '(b12,A)' },
  { tag: 'NATF', name: 'National attribute', labels: '*ATTL!ATVL', format: '(b12,A)' },
  { tag: 'CATF', name: 'Complex attribute', labels: 'CATL!ATTL!ATVL', format: '(b12,b12,A)' },
  { tag: 'FSPT', name: 'Spatial pointer', labels: '*NAME!ORNT!USAG!MASK', format: '(B(40),3b11)' },
  { tag: 'FFAS', name: 'Feature association', labels: '*ASTY!ROLE!RCID', format: '(b12,b12,b14)' },
  { tag: 'FIAS', name: 'Information association', labels: '*ASTY!RCID', format: '(b12,b14)' },
  { tag: 'IRID', name: 'Information record identifier', labels: 'RCNM!RCID!NITC', format: '(b11,b14,b12)' },
];

const vrid = (rcnm: number, rcid: number) => concat(enc.u(rcnm, 1), enc.u(rcid, 4));
const frid = (rcid: number, nftc: number, prim: number) => concat(enc.u(100, 1), enc.u(rcid, 4), enc.u(nftc, 2), enc.u(prim, 1));
const catf = (groups: [catl: number, attl: number, atvl: string][]) =>
  concat(...groups.map(([c, a, v]) => concat(enc.u(c, 2), enc.u(a, 2), enc.a(v))));

export function s101Sample(): ArrayBuffer {
  return file(
    ddr(FIELDS),
    dr([['DSID', concat(enc.u(10, 1), enc.u(1, 4), enc.a('101TEST0001.000'), enc.a('INT.IHO.S-101.1.0'), enc.a('1.0'))]]),
    dr([['DSSI', enc.u(4326, 2)]]),
    dr([['DSPM', concat(enc.u(10_000_000, 4), enc.u(10, 4))]]),
    // Points
    dr([['VRID', vrid(110, 1)], ['SG2D', s57.sg2d([[42.3, -70.9]])]]),
    dr([['VRID', vrid(110, 2)], ['SG2D', s57.sg2d([[42.31, -70.91]])]]),
    dr([['VRID', vrid(110, 3)], ['SG3D', s57.sg3d([[42.305, -70.905, 12.5], [42.306, -70.906, 7.2]])]]),
    // Curves 1 -> 2 and 2 -> 1 enclose a surface
    dr([['VRID', vrid(130, 1)], ['VRPT', s57.vrpt([{ rcnm: 110, rcid: 1, topi: 1 }, { rcnm: 110, rcid: 2, topi: 2 }])], ['SG2D', s57.sg2d([[42.3, -70.91]])]]),
    dr([['VRID', vrid(130, 2)], ['VRPT', s57.vrpt([{ rcnm: 110, rcid: 2, topi: 1 }, { rcnm: 110, rcid: 1, topi: 2 }])], ['SG2D', s57.sg2d([[42.31, -70.9]])]]),
    dr([['VRID', vrid(140, 1)], ['CCOC', concat(enc.u(1, 4), enc.u(2, 4))]]),
    // Light, with complex attribute and associations
    dr([
      ['FRID', frid(1, 73, 1)],
      ['FOID', s57.foid(550, 1001, 1)],
      ['ATTF', s57.attf([[1, 'Deer Island Light'], [2, '4']])],
      ['CATF', catf([[500, 501, 'Fl'], [500, 502, '2.5']])],
      ['FSPT', s57.fspt([{ rcnm: 110, rcid: 1 }])],
      ['FFAS', concat(enc.u(7, 2), enc.u(1, 2), enc.u(3, 4))],
      ['FIAS', concat(enc.u(9, 2), enc.u(1, 4))],
    ]),
    dr([['FRID', frid(2, 27, 2)], ['FSPT', s57.fspt([{ rcnm: 140, rcid: 1 }])]]),
    dr([
      ['FRID', frid(3, 37, 3)],
      ['ATTF', s57.attf([[10, '5'], [11, '10']])],
      ['NATF', s57.attf([[20, 'Lower Harbour']])],
      ['FSPT', s57.fspt([{ rcnm: 130, rcid: 1 }, { rcnm: 130, rcid: 2 }])],
    ]),
    dr([['FRID', frid(4, 132, 1)], ['FSPT', s57.fspt([{ rcnm: 110, rcid: 3 }])]]),
    dr([['FRID', frid(5, 300, 255)]]),
    dr([['FRID', frid(6, 9999, 1)], ['FSPT', s57.fspt([{ rcnm: 110, rcid: 2 }])]]),
    dr([['IRID', concat(enc.u(150, 1), enc.u(1, 4), enc.u(5, 2))], ['ATTF', s57.attf([[30, 'NM 12/26']])], ['CATF', catf([[600, 601, 'x']])]]),
  );
}
