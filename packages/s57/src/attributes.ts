/**
 * S-57 Attribute Catalogue.
 *
 * Maps numeric ATTL codes to attribute names, types, and descriptions.
 * Based on IHO S-57 Object Catalogue (Appendix A, Chapter 2).
 */

/** Attribute value type in the catalogue */
export type AttrValueType = 'string' | 'int' | 'float' | 'enum' | 'list';

export interface AttributeDef {
  /** ATTL numeric code */
  code: number;
  /** Six-character acronym (e.g. "DRVAL1") */
  acronym: string;
  /** Value type */
  valueType: AttrValueType;
  /** Human-readable name */
  name: string;
}

/** S-57 attribute definitions for the most common attributes */
export const S57_ATTRIBUTES: ReadonlyMap<number, AttributeDef> = new Map([
  [1, { code: 1, acronym: 'AGENCY', valueType: 'string', name: 'Agency responsible for production' }],
  [2, { code: 2, acronym: 'BCNSHP', valueType: 'enum', name: 'Beacon shape' }],
  [4, { code: 4, acronym: 'BOYSHP', valueType: 'enum', name: 'Buoy shape' }],
  [6, { code: 6, acronym: 'BURDEP', valueType: 'float', name: 'Buried depth' }],
  [7, { code: 7, acronym: 'CALSGN', valueType: 'string', name: 'Call sign' }],
  [8, { code: 8, acronym: 'CATAIR', valueType: 'enum', name: 'Category of airport' }],
  [9, { code: 9, acronym: 'CATANC', valueType: 'enum', name: 'Category of anchorage' }],
  [11, { code: 11, acronym: 'CATBRG', valueType: 'enum', name: 'Category of bridge' }],
  [13, { code: 13, acronym: 'CATBUA', valueType: 'enum', name: 'Category of built-up area' }],
  [14, { code: 14, acronym: 'CATCBL', valueType: 'enum', name: 'Category of cable' }],
  [15, { code: 15, acronym: 'CATCAN', valueType: 'enum', name: 'Category of canal' }],
  [17, { code: 17, acronym: 'CATCOA', valueType: 'enum', name: 'Category of coastline' }],
  [18, { code: 18, acronym: 'CATCTR', valueType: 'enum', name: 'Category of control point' }],
  [21, { code: 21, acronym: 'CATDAM', valueType: 'enum', name: 'Category of dam' }],
  [30, { code: 30, acronym: 'CATLMK', valueType: 'enum', name: 'Category of landmark' }],
  [33, { code: 33, acronym: 'CATLAM', valueType: 'enum', name: 'Category of lateral mark' }],
  [35, { code: 35, acronym: 'CATLIT', valueType: 'enum', name: 'Category of light' }],
  [36, { code: 36, acronym: 'CATMFA', valueType: 'enum', name: 'Category of marine farm' }],
  [38, { code: 38, acronym: 'CATMOR', valueType: 'enum', name: 'Category of mooring facility' }],
  [40, { code: 40, acronym: 'CATNAV', valueType: 'enum', name: 'Category of navigation line' }],
  [42, { code: 42, acronym: 'CATOBS', valueType: 'enum', name: 'Category of obstruction' }],
  [46, { code: 46, acronym: 'CATPIL', valueType: 'enum', name: 'Category of pilot boarding place' }],
  [48, { code: 48, acronym: 'CATPIP', valueType: 'enum', name: 'Category of pipeline' }],
  [56, { code: 56, acronym: 'CATREA', valueType: 'enum', name: 'Category of restricted area' }],
  [69, { code: 69, acronym: 'CATTRK', valueType: 'enum', name: 'Category of recommended track' }],
  [71, { code: 71, acronym: 'CATVEG', valueType: 'enum', name: 'Category of vegetation' }],
  [72, { code: 72, acronym: 'CATWAT', valueType: 'enum', name: 'Category of water turbulence' }],
  [73, { code: 73, acronym: 'CATWED', valueType: 'enum', name: 'Category of weed' }],
  [74, { code: 74, acronym: 'CATWRK', valueType: 'enum', name: 'Category of wreck' }],
  [75, { code: 75, acronym: 'COLOUR', valueType: 'list', name: 'Colour' }],
  [76, { code: 76, acronym: 'COLPAT', valueType: 'list', name: 'Colour pattern' }],
  [77, { code: 77, acronym: 'COMCHA', valueType: 'string', name: 'Communication channel' }],
  [78, { code: 78, acronym: 'CONDTN', valueType: 'enum', name: 'Condition' }],
  [79, { code: 79, acronym: 'CONRAD', valueType: 'enum', name: 'Conspicuous, radar' }],
  [80, { code: 80, acronym: 'CONVIS', valueType: 'enum', name: 'Conspicuous, visual' }],
  [81, { code: 81, acronym: 'CURVEL', valueType: 'float', name: 'Current velocity' }],
  [82, { code: 82, acronym: 'DATEND', valueType: 'string', name: 'Date end' }],
  [83, { code: 83, acronym: 'DATSTA', valueType: 'string', name: 'Date start' }],
  [84, { code: 84, acronym: 'DRVAL1', valueType: 'float', name: 'Depth range value 1' }],
  [85, { code: 85, acronym: 'DRVAL2', valueType: 'float', name: 'Depth range value 2' }],
  [86, { code: 86, acronym: 'DUNITS', valueType: 'enum', name: 'Depth units' }],
  [87, { code: 87, acronym: 'ELEVAT', valueType: 'float', name: 'Elevation' }],
  [88, { code: 88, acronym: 'ESTRNG', valueType: 'float', name: 'Estimated range of transmission' }],
  [90, { code: 90, acronym: 'EXCLIT', valueType: 'enum', name: 'Exhibition condition of light' }],
  [95, { code: 95, acronym: 'HEIGHT', valueType: 'float', name: 'Height' }],
  [100, { code: 100, acronym: 'HUNITS', valueType: 'enum', name: 'Height units' }],
  [101, { code: 101, acronym: 'HORCLR', valueType: 'float', name: 'Horizontal clearance' }],
  [102, { code: 102, acronym: 'HORLEN', valueType: 'float', name: 'Horizontal length' }],
  [103, { code: 103, acronym: 'HORWID', valueType: 'float', name: 'Horizontal width' }],
  [107, { code: 107, acronym: 'LITCHR', valueType: 'enum', name: 'Light characteristic' }],
  [108, { code: 108, acronym: 'LITVIS', valueType: 'enum', name: 'Light visibility' }],
  [111, { code: 111, acronym: 'MARSYS', valueType: 'enum', name: 'Marks navigational system of' }],
  [112, { code: 112, acronym: 'MLTYLT', valueType: 'int', name: 'Multiplicity of lights' }],
  [113, { code: 113, acronym: 'NATCON', valueType: 'enum', name: 'Nature of construction' }],
  [114, { code: 114, acronym: 'NATSUR', valueType: 'list', name: 'Nature of surface' }],
  [115, { code: 115, acronym: 'NATQUA', valueType: 'list', name: 'Nature of surface, qualifying terms' }],
  [116, { code: 116, acronym: 'OBJNAM', valueType: 'string', name: 'Object name' }],
  [117, { code: 117, acronym: 'ORIENT', valueType: 'float', name: 'Orientation' }],
  [131, { code: 131, acronym: 'QUASOU', valueType: 'list', name: 'Quality of sounding measurement' }],
  [133, { code: 133, acronym: 'RADWAL', valueType: 'string', name: 'Radar wave length' }],
  [135, { code: 135, acronym: 'RESTRN', valueType: 'list', name: 'Restriction' }],
  [136, { code: 136, acronym: 'SCAMIN', valueType: 'int', name: 'Scale minimum' }],
  [137, { code: 137, acronym: 'SCAMAX', valueType: 'int', name: 'Scale maximum' }],
  [138, { code: 138, acronym: 'SECTR1', valueType: 'float', name: 'Sector limit one' }],
  [139, { code: 139, acronym: 'SECTR2', valueType: 'float', name: 'Sector limit two' }],
  [140, { code: 140, acronym: 'SHIPAM', valueType: 'string', name: 'Shift parameters' }],
  [141, { code: 141, acronym: 'SIGFRQ', valueType: 'int', name: 'Signal frequency' }],
  [142, { code: 142, acronym: 'SIGGEN', valueType: 'enum', name: 'Signal generation' }],
  [143, { code: 143, acronym: 'SIGGRP', valueType: 'string', name: 'Signal group' }],
  [144, { code: 144, acronym: 'SIGPER', valueType: 'float', name: 'Signal period' }],
  [145, { code: 145, acronym: 'SIGSEQ', valueType: 'string', name: 'Signal sequence' }],
  [146, { code: 146, acronym: 'SOUACC', valueType: 'float', name: 'Sounding accuracy' }],
  [149, { code: 149, acronym: 'STATUS', valueType: 'list', name: 'Status' }],
  [150, { code: 150, acronym: 'SUTEFP', valueType: 'string', name: 'Survey type, EFP' }],
  [156, { code: 156, acronym: 'TECSOU', valueType: 'list', name: 'Technique of sounding measurement' }],
  [171, { code: 171, acronym: 'TOPSHP', valueType: 'enum', name: 'Topmark shape' }],
  [172, { code: 172, acronym: 'TRAFIC', valueType: 'enum', name: 'Traffic flow' }],
  [174, { code: 174, acronym: 'VALDCO', valueType: 'float', name: 'Value of depth contour' }],
  [175, { code: 175, acronym: 'VALSOU', valueType: 'float', name: 'Value of sounding' }],
  [178, { code: 178, acronym: 'VERCLR', valueType: 'float', name: 'Vertical clearance' }],
  [179, { code: 179, acronym: 'VERCCL', valueType: 'float', name: 'Vertical clearance, closed' }],
  [180, { code: 180, acronym: 'VERCOP', valueType: 'float', name: 'Vertical clearance, open' }],
  [181, { code: 181, acronym: 'VERCSA', valueType: 'float', name: 'Vertical clearance, safe' }],
  [182, { code: 182, acronym: 'VERDAT', valueType: 'enum', name: 'Vertical datum' }],
  [183, { code: 183, acronym: 'VERLEN', valueType: 'float', name: 'Vertical length' }],
  [185, { code: 185, acronym: 'WATLEV', valueType: 'enum', name: 'Water level effect' }],
  [300, { code: 300, acronym: 'INFORM', valueType: 'string', name: 'Information' }],
  [301, { code: 301, acronym: 'NINFOM', valueType: 'string', name: 'Information in national language' }],
  [302, { code: 302, acronym: 'NOBJNM', valueType: 'string', name: 'Object name in national language' }],
  [303, { code: 303, acronym: 'NPLDST', valueType: 'string', name: 'Pilot district in national language' }],
  [304, { code: 304, acronym: 'NTXTDS', valueType: 'string', name: 'Text description in national language' }],
  [400, { code: 400, acronym: 'RECDAT', valueType: 'string', name: 'Recording date' }],
  [401, { code: 401, acronym: 'RECIND', valueType: 'string', name: 'Recording indication' }],
]);

/** Reverse lookup: acronym to ATTL code */
export const ATTL_BY_ACRONYM: ReadonlyMap<string, number> = new Map(
  [...S57_ATTRIBUTES.entries()].map(([code, def]) => [def.acronym, code])
);

/** Commonly used ATTL codes as named constants */
export const ATTL = {
  BCNSHP: 2,
  BOYSHP: 4,
  CATANC: 9,
  CATBRG: 11,
  CATLMK: 30,
  CATLIT: 35,
  CATOBS: 42,
  CATREA: 56,
  CATWRK: 74,
  COLOUR: 75,
  COLPAT: 76,
  CONDTN: 78,
  CONVIS: 80,
  DRVAL1: 84,
  DRVAL2: 85,
  ELEVAT: 87,
  HEIGHT: 95,
  HORCLR: 101,
  LITCHR: 107,
  LITVIS: 108,
  MARSYS: 111,
  OBJNAM: 116,
  ORIENT: 117,
  QUASOU: 131,
  RESTRN: 135,
  SCAMIN: 136,
  SECTR1: 138,
  SECTR2: 139,
  SIGGRP: 143,
  SIGPER: 144,
  STATUS: 149,
  TOPSHP: 171,
  VALDCO: 174,
  VALSOU: 175,
  VERCLR: 178,
  VERLEN: 183,
  WATLEV: 185,
  INFORM: 300,
  NOBJNM: 302,
} as const;
