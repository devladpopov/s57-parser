import { describe, it, expect } from 'bun:test';
import type { FeatureRecord } from '../src/types.js';
import { GeomPrimitive } from '../src/types.js';
import { ATTL } from '../src/attributes.js';
import {
  typedFeature, typedFeatures, filterByClass, OBJL,
} from '../src/typed-features.js';
import type {
  DepthArea, DepthContour, Sounding, Coastline, LandArea,
  Light, Beacon, Buoy, Obstruction, Wreck, UnderwaterRock,
  RestrictedArea, Bridge, Landmark, AnchorageArea,
} from '../src/typed-features.js';

/** Helper to create a minimal FeatureRecord */
function makeFeature(objl: number, attrs: [number, string][] = []): FeatureRecord {
  return {
    rcid: 1,
    objl,
    prim: GeomPrimitive.Area,
    grup: 1,
    attributes: new Map(attrs),
    spatialRefs: [],
  };
}

describe('S-57 attribute catalogue', () => {
  it('should have correct IHO standard ATTL codes', () => {
    expect(ATTL.DRVAL1).toBe(84);
    expect(ATTL.DRVAL2).toBe(85);
    expect(ATTL.ELEVAT).toBe(87);
    expect(ATTL.HEIGHT).toBe(95);
    expect(ATTL.LITCHR).toBe(107);
    expect(ATTL.OBJNAM).toBe(116);
    expect(ATTL.SIGPER).toBe(144);
    expect(ATTL.VALDCO).toBe(174);
    expect(ATTL.VALSOU).toBe(175);
    expect(ATTL.VERCLR).toBe(178);
    expect(ATTL.VERLEN).toBe(183);
    expect(ATTL.NOBJNM).toBe(302);
  });
});

describe('typedFeature()', () => {
  it('should return undefined for unknown OBJL', () => {
    const f = makeFeature(9999);
    expect(typedFeature(f)).toBeUndefined();
  });

  it('should extract base fields', () => {
    const f = makeFeature(OBJL.LNDARE, [
      [ATTL.OBJNAM, 'Test Island'],
      [ATTL.SCAMIN, '50000'],
      [ATTL.INFORM, 'Some info'],
    ]);
    f.rcid = 42;
    const typed = typedFeature(f)!;
    expect(typed).toBeDefined();
    expect(typed.objectClass).toBe('LNDARE');
    expect(typed.rcid).toBe(42);
    expect(typed.name).toBe('Test Island');
    expect(typed.scaleMin).toBe(50000);
    expect(typed.information).toBe('Some info');
    expect(typed.raw).toBe(f);
  });
});

describe('DepthArea', () => {
  it('should parse depth range attributes', () => {
    const f = makeFeature(OBJL.DEPARE, [
      [ATTL.DRVAL1, '5.0'],
      [ATTL.DRVAL2, '10.0'],
    ]);
    const typed = typedFeature(f) as DepthArea;
    expect(typed.objectClass).toBe('DEPARE');
    expect(typed.drval1).toBe(5.0);
    expect(typed.drval2).toBe(10.0);
  });

  it('should handle missing depth values', () => {
    const f = makeFeature(OBJL.DEPARE);
    const typed = typedFeature(f) as DepthArea;
    expect(typed.drval1).toBeUndefined();
    expect(typed.drval2).toBeUndefined();
  });
});

describe('DepthContour', () => {
  it('should parse contour value', () => {
    const f = makeFeature(OBJL.DEPCNT, [
      [ATTL.VALDCO, '20.0'],
    ]);
    const typed = typedFeature(f) as DepthContour;
    expect(typed.objectClass).toBe('DEPCNT');
    expect(typed.valdco).toBe(20.0);
  });
});

describe('Sounding', () => {
  it('should parse sounding value and quality', () => {
    const f = makeFeature(OBJL.SOUNDG, [
      [ATTL.VALSOU, '12.5'],
      [ATTL.QUASOU, '1,6'],
    ]);
    f.prim = GeomPrimitive.Point;
    const typed = typedFeature(f) as Sounding;
    expect(typed.objectClass).toBe('SOUNDG');
    expect(typed.valsou).toBe(12.5);
    expect(typed.quasou).toEqual([1, 6]);
  });
});

describe('Coastline', () => {
  it('should parse category', () => {
    const f = makeFeature(OBJL.COALNE, [
      [17, '1'], // CATCOA
    ]);
    f.prim = GeomPrimitive.Line;
    const typed = typedFeature(f) as Coastline;
    expect(typed.objectClass).toBe('COALNE');
    expect(typed.catcoa).toBe(1);
  });
});

describe('Light', () => {
  it('should parse all light attributes', () => {
    const f = makeFeature(OBJL.LIGHTS, [
      [ATTL.LITCHR, '2'],     // Flashing
      [ATTL.SIGPER, '10.0'],
      [ATTL.SIGGRP, '(2)'],
      [ATTL.COLOUR, '3'],     // Red
      [ATTL.SECTR1, '045.0'],
      [ATTL.SECTR2, '225.0'],
      [ATTL.HEIGHT, '15.0'],
    ]);
    f.prim = GeomPrimitive.Point;
    const typed = typedFeature(f) as Light;
    expect(typed.objectClass).toBe('LIGHTS');
    expect(typed.litchr).toBe(2);
    expect(typed.sigper).toBe(10.0);
    expect(typed.siggrp).toBe('(2)');
    expect(typed.colour).toEqual([3]);
    expect(typed.sectr1).toBe(45.0);
    expect(typed.sectr2).toBe(225.0);
    expect(typed.height).toBe(15.0);
  });
});

describe('Beacon', () => {
  it('should parse cardinal beacon', () => {
    const f = makeFeature(OBJL.BCNCAR, [
      [ATTL.BCNSHP, '1'],
      [ATTL.COLOUR, '6,1'],    // Yellow, White
      [ATTL.TOPSHP, '1'],
    ]);
    f.prim = GeomPrimitive.Point;
    const typed = typedFeature(f) as Beacon;
    expect(typed.objectClass).toBe('BCNCAR');
    expect(typed.bcnshp).toBe(1);
    expect(typed.colour).toEqual([6, 1]);
    expect(typed.topshp).toBe(1);
  });

  it('should parse lateral beacon', () => {
    const f = makeFeature(OBJL.BCNLAT, [
      [ATTL.COLOUR, '4'], // Green
    ]);
    f.prim = GeomPrimitive.Point;
    const typed = typedFeature(f) as Beacon;
    expect(typed.objectClass).toBe('BCNLAT');
  });
});

describe('Buoy', () => {
  it('should parse lateral buoy', () => {
    const f = makeFeature(OBJL.BOYLAT, [
      [ATTL.BOYSHP, '1'],
      [ATTL.COLOUR, '3'],  // Red
      [ATTL.MARSYS, '2'],  // IALA-B
    ]);
    f.prim = GeomPrimitive.Point;
    const typed = typedFeature(f) as Buoy;
    expect(typed.objectClass).toBe('BOYLAT');
    expect(typed.boyshp).toBe(1);
    expect(typed.marsys).toBe(2);
  });

  it('should handle all buoy types', () => {
    for (const [objl, cls] of [
      [OBJL.BOYCAR, 'BOYCAR'],
      [OBJL.BOYLAT, 'BOYLAT'],
      [OBJL.BOYSAW, 'BOYSAW'],
      [OBJL.BOYSPP, 'BOYSPP'],
    ] as const) {
      const f = makeFeature(objl);
      const typed = typedFeature(f) as Buoy;
      expect(typed.objectClass).toBe(cls);
    }
  });
});

describe('Obstruction', () => {
  it('should parse obstruction attributes', () => {
    const f = makeFeature(OBJL.OBSTRN, [
      [ATTL.CATOBS, '5'],
      [ATTL.VALSOU, '3.2'],
      [ATTL.WATLEV, '3'],
    ]);
    const typed = typedFeature(f) as Obstruction;
    expect(typed.objectClass).toBe('OBSTRN');
    expect(typed.catobs).toBe(5);
    expect(typed.valsou).toBe(3.2);
    expect(typed.watlev).toBe(3);
  });
});

describe('Wreck', () => {
  it('should parse wreck attributes', () => {
    const f = makeFeature(OBJL.WRECKS, [
      [ATTL.CATWRK, '1'],
      [ATTL.VALSOU, '8.0'],
      [ATTL.WATLEV, '4'],
      [ATTL.CONDTN, '2'],
    ]);
    const typed = typedFeature(f) as Wreck;
    expect(typed.objectClass).toBe('WRECKS');
    expect(typed.catwrk).toBe(1);
    expect(typed.valsou).toBe(8.0);
    expect(typed.watlev).toBe(4);
    expect(typed.condition).toBe(2);
  });
});

describe('UnderwaterRock', () => {
  it('should parse rock attributes', () => {
    const f = makeFeature(OBJL.UWTROC, [
      [ATTL.VALSOU, '1.5'],
      [ATTL.WATLEV, '3'],
    ]);
    const typed = typedFeature(f) as UnderwaterRock;
    expect(typed.objectClass).toBe('UWTROC');
    expect(typed.valsou).toBe(1.5);
    expect(typed.watlev).toBe(3);
  });
});

describe('RestrictedArea', () => {
  it('should parse restrictions', () => {
    const f = makeFeature(OBJL.RESARE, [
      [ATTL.CATREA, '1'],
      [ATTL.RESTRN, '7,8'],
      [ATTL.STATUS, '1'],
    ]);
    const typed = typedFeature(f) as RestrictedArea;
    expect(typed.objectClass).toBe('RESARE');
    expect(typed.catrea).toBe(1);
    expect(typed.restrn).toEqual([7, 8]);
    expect(typed.status).toEqual([1]);
  });
});

describe('Bridge', () => {
  it('should parse bridge clearances', () => {
    const f = makeFeature(OBJL.BRIDGE, [
      [ATTL.CATBRG, '2'],
      [ATTL.VERCLR, '20.5'],
      [ATTL.HORCLR, '50.0'],
    ]);
    f.prim = GeomPrimitive.Line;
    const typed = typedFeature(f) as Bridge;
    expect(typed.objectClass).toBe('BRIDGE');
    expect(typed.catbrg).toBe(2);
    expect(typed.verclr).toBe(20.5);
    expect(typed.horclr).toBe(50.0);
  });
});

describe('Landmark', () => {
  it('should parse landmark attributes', () => {
    const f = makeFeature(OBJL.LNDMRK, [
      [ATTL.CATLMK, '17'],    // Tower
      [ATTL.COLOUR, '3,1'],   // Red, White
      [ATTL.CONVIS, '1'],     // Conspicuous
      [ATTL.HEIGHT, '30.0'],
      [ATTL.ELEVAT, '45.0'],
      [ATTL.OBJNAM, 'Lighthouse Tower'],
    ]);
    f.prim = GeomPrimitive.Point;
    const typed = typedFeature(f) as Landmark;
    expect(typed.objectClass).toBe('LNDMRK');
    expect(typed.catlmk).toBe(17);
    expect(typed.colour).toEqual([3, 1]);
    expect(typed.convis).toBe(1);
    expect(typed.height).toBe(30.0);
    expect(typed.elevation).toBe(45.0);
    expect(typed.name).toBe('Lighthouse Tower');
  });
});

describe('AnchorageArea', () => {
  it('should parse anchorage attributes', () => {
    const f = makeFeature(OBJL.ACHARE, [
      [ATTL.CATANC, '1'],
      [ATTL.RESTRN, '7'],
    ]);
    const typed = typedFeature(f) as AnchorageArea;
    expect(typed.objectClass).toBe('ACHARE');
    expect(typed.catanc).toBe(1);
    expect(typed.restrn).toEqual([7]);
  });
});

describe('typedFeatures()', () => {
  it('should convert array of features, skipping unknown', () => {
    const features = [
      makeFeature(OBJL.DEPARE, [[ATTL.DRVAL1, '0'], [ATTL.DRVAL2, '5']]),
      makeFeature(OBJL.COALNE),
      makeFeature(9999), // unknown, should be skipped
      makeFeature(OBJL.LIGHTS, [[ATTL.LITCHR, '2']]),
    ];
    const typed = typedFeatures(features);
    expect(typed).toHaveLength(3);
    expect(typed[0].objectClass).toBe('DEPARE');
    expect(typed[1].objectClass).toBe('COALNE');
    expect(typed[2].objectClass).toBe('LIGHTS');
  });
});

describe('filterByClass()', () => {
  it('should filter by object class with type narrowing', () => {
    const features = [
      makeFeature(OBJL.DEPARE, [[ATTL.DRVAL1, '0'], [ATTL.DRVAL2, '5']]),
      makeFeature(OBJL.DEPARE, [[ATTL.DRVAL1, '5'], [ATTL.DRVAL2, '10']]),
      makeFeature(OBJL.LIGHTS, [[ATTL.LITCHR, '2']]),
      makeFeature(OBJL.COALNE),
    ];
    const typed = typedFeatures(features);

    const depthAreas = filterByClass(typed, 'DEPARE');
    expect(depthAreas).toHaveLength(2);
    expect(depthAreas[0].drval1).toBe(0);
    expect(depthAreas[1].drval1).toBe(5);

    const lights = filterByClass(typed, 'LIGHTS');
    expect(lights).toHaveLength(1);
    expect(lights[0].litchr).toBe(2);

    const coastlines = filterByClass(typed, 'COALNE');
    expect(coastlines).toHaveLength(1);
  });
});
