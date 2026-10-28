import type { Vec2 } from '../math';
import { roadSpec } from '../world/roads';
import type { Area, AreaKind, Building, MapData, Road } from '../world/types';
import type { LatLon } from './projection';
import { LocalProjection } from './projection';

interface OsmPoint {
  lat: number;
  lon: number;
}

interface OsmWay {
  type: 'way';
  id: number;
  tags?: Record<string, string>;
  geometry?: (OsmPoint | null)[];
}

interface OsmRelation {
  type: 'relation';
  id: number;
  tags?: Record<string, string>;
  members?: { type: string; ref: number; role: string; geometry?: (OsmPoint | null)[] }[];
}

export interface OverpassResponse {
  elements: (OsmWay | OsmRelation | { type: 'node'; id: number })[];
}

/** Classify a closed shape into an area kind, or null if we don't draw it. */
export function areaKind(tags: Record<string, string>): AreaKind | null {
  const { natural, landuse, leisure, waterway, amenity, highway, place } = tags;
  if (natural === 'water' || waterway === 'riverbank' || landuse === 'reservoir' || landuse === 'basin') return 'water';
  if (natural === 'wood' || landuse === 'forest') return 'forest';
  if (leisure === 'pitch' || leisure === 'track' || leisure === 'stadium') return 'pitch';
  if (leisure === 'park' || leisure === 'garden' || leisure === 'playground' || landuse === 'recreation_ground') return 'park';
  if (landuse === 'cemetery' || amenity === 'grave_yard') return 'cemetery';
  if (
    landuse === 'grass' ||
    landuse === 'meadow' ||
    landuse === 'village_green' ||
    natural === 'grassland' ||
    natural === 'scrub' ||
    natural === 'heath'
  )
    return 'grass';
  if (amenity === 'parking') return 'parking';
  if (highway === 'pedestrian' || place === 'square') return 'plaza';
  return null;
}

function isBuilding(tags: Record<string, string>): boolean {
  const b = tags.building;
  // Roofs and carports are open underneath, so cars can drive through them.
  if (!b || b === 'no' || b === 'roof' || b === 'carport') return false;
  return tags.location !== 'underground';
}

const samePoint = (a: OsmPoint, b: OsmPoint) => a.lat === b.lat && a.lon === b.lon;

/** Join a multipolygon's member ways into closed rings. Unclosable leftovers are dropped. */
export function assembleRings(ways: OsmPoint[][]): OsmPoint[][] {
  const pending = ways.filter((w) => w.length >= 2).map((w) => [...w]);
  const rings: OsmPoint[][] = [];
  while (pending.length) {
    const ring = pending.shift()!;
    let grew = true;
    while (!samePoint(ring[0], ring[ring.length - 1]) && grew) {
      grew = false;
      const end = ring[ring.length - 1];
      for (let i = 0; i < pending.length; i++) {
        const w = pending[i];
        if (samePoint(w[0], end)) ring.push(...w.slice(1));
        else if (samePoint(w[w.length - 1], end)) ring.push(...w.reverse().slice(1));
        else continue;
        pending.splice(i, 1);
        grew = true;
        break;
      }
    }
    if (ring.length >= 4 && samePoint(ring[0], ring[ring.length - 1])) rings.push(ring);
  }
  return rings;
}

function cleanGeometry(geom: (OsmPoint | null)[] | undefined): OsmPoint[] {
  return (geom ?? []).filter((p): p is OsmPoint => !!p);
}

/** Drop the repeated closing point and consecutive duplicates. */
function toRing(points: Vec2[]): Vec2[] {
  const out: Vec2[] = [];
  for (const p of points) {
    const last = out[out.length - 1];
    if (!last || Math.abs(last.x - p.x) > 0.01 || Math.abs(last.y - p.y) > 0.01) out.push(p);
  }
  if (out.length > 1) {
    const a = out[0];
    const b = out[out.length - 1];
    if (Math.abs(a.x - b.x) <= 0.01 && Math.abs(a.y - b.y) <= 0.01) out.pop();
  }
  return out;
}

export function parseOverpass(json: OverpassResponse, name: string, center: LatLon, radius: number): MapData {
  const proj = new LocalProjection(center);
  const project = (pts: OsmPoint[]) => pts.map((p) => proj.toLocal(p.lat, p.lon));

  const roads: Road[] = [];
  const buildings: Building[] = [];
  const areas: Area[] = [];

  const addShape = (id: number, tags: Record<string, string>, ring: Vec2[]) => {
    if (ring.length < 3) return;
    if (isBuilding(tags)) {
      const levels = Number.parseFloat(tags['building:levels'] ?? '');
      buildings.push({ id, ring, levels: levels > 0 && levels < 200 ? levels : 3 });
      return;
    }
    const kind = areaKind(tags);
    if (kind) areas.push({ id, kind, ring });
  };

  for (const el of json.elements) {
    const tags = (el as OsmWay).tags ?? {};
    if (el.type === 'way') {
      const geom = cleanGeometry(el.geometry);
      if (geom.length < 2) continue;
      const closed = geom.length >= 4 && samePoint(geom[0], geom[geom.length - 1]);
      const spec = tags.highway && tags.area !== 'yes' ? roadSpec(tags.highway, tags) : null;
      if (spec) {
        roads.push({
          id: el.id,
          cls: spec.cls,
          width: spec.width,
          points: project(geom),
          name: tags.name || tags.ref,
          oneway: tags.oneway === 'yes' || tags.oneway === '1' || tags.junction === 'roundabout',
          bridge: !!tags.bridge && tags.bridge !== 'no',
          tunnel: !!tags.tunnel && tags.tunnel !== 'no',
          drivable: spec.drivable,
        });
      } else if (closed) {
        addShape(el.id, tags, toRing(project(geom)));
      }
    } else if (el.type === 'relation') {
      if (tags.type !== 'multipolygon') continue;
      const outers = (el.members ?? [])
        .filter((m) => m.type === 'way' && (m.role === 'outer' || m.role === ''))
        .map((m) => cleanGeometry(m.geometry));
      for (const ring of assembleRings(outers)) addShape(el.id, tags, toRing(project(ring)));
    }
  }

  return { name, center, radius, roads, buildings, areas };
}
