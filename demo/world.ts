/**
 * The bundled world layer, demo/world/world.json (built by
 * scripts/build-world.ts from Natural Earth): a TopoJSON file with the
 * objects `countries` (polygons with code, ru and en names, label point lx/ly
 * and the zoom from which to label mz), `borders` (lines between countries)
 * and `lakes`. Decoded here into plain GeoJSON; no Leaflet, so the build
 * script and the tests can use it too.
 */

export interface Topology {
  type: 'Topology';
  transform?: { scale: [number, number]; translate: [number, number] };
  arcs: number[][][];
  objects: Record<string, { type: 'GeometryCollection'; geometries: TopoGeometry[] }>;
}

interface TopoGeometry {
  type: 'Polygon' | 'MultiPolygon' | 'LineString' | 'MultiLineString' | null;
  arcs?: number[][] | number[][][] | number[];
  properties?: Record<string, unknown>;
}

export interface WorldFeature {
  type: 'Feature';
  properties: Record<string, any>;
  geometry:
    | { type: 'Polygon' | 'MultiLineString'; coordinates: number[][][] }
    | { type: 'MultiPolygon'; coordinates: number[][][][] }
    | { type: 'LineString'; coordinates: number[][] };
}

export interface WorldCollection {
  type: 'FeatureCollection';
  features: WorldFeature[];
}

/** One object of the topology as GeoJSON features (null geometries are left out). */
export function decodeTopology(topo: Topology, name: string): WorldCollection {
  const [sx, sy] = topo.transform?.scale ?? [1, 1];
  const [tx, ty] = topo.transform?.translate ?? [0, 0];
  // Quantized arcs are delta-encoded: each position is the sum of the ones before.
  const arcs = topo.arcs.map((arc) => {
    let x = 0, y = 0;
    return arc.map(([dx, dy]) => topo.transform ? [(x += dx) * sx + tx, (y += dy) * sy + ty] : [dx, dy]);
  });
  // A line of arcs; ~i is arc i reversed. Joined arcs share their end point.
  const line = (ids: number[]) => {
    const out: number[][] = [];
    for (const i of ids) {
      const pts = i < 0 ? arcs[~i].slice().reverse() : arcs[i];
      out.push(...(out.length ? pts.slice(1) : pts));
    }
    return out;
  };
  const features: WorldFeature[] = [];
  for (const g of topo.objects[name]?.geometries ?? []) {
    const properties = g.properties ?? {};
    if (g.type === 'Polygon') features.push({ type: 'Feature', properties, geometry: { type: 'Polygon', coordinates: (g.arcs as number[][]).map(line) } });
    else if (g.type === 'MultiPolygon') features.push({ type: 'Feature', properties, geometry: { type: 'MultiPolygon', coordinates: (g.arcs as number[][][]).map((p) => p.map(line)) } });
    else if (g.type === 'LineString') features.push({ type: 'Feature', properties, geometry: { type: 'LineString', coordinates: line(g.arcs as number[]) } });
    else if (g.type === 'MultiLineString') features.push({ type: 'Feature', properties, geometry: { type: 'MultiLineString', coordinates: (g.arcs as number[][]).map(line) } });
  }
  return { type: 'FeatureCollection', features };
}

function inRing(ring: number[][], x: number, y: number): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** The country polygon containing the point, if any. */
export function countryAt(countries: WorldCollection, lon: number, lat: number): WorldFeature | undefined {
  return countries.features.find(({ geometry: g }) => {
    const polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
    // Even-odd over all rings: inside the outer ring and not in a hole.
    return polys.some((rings) => rings.filter((r) => inRing(r, lon, lat)).length % 2 === 1);
  });
}
