import type { Vec2 } from '../math';
import { boundsOf, closestOnSegment, pointInPolygon } from '../math';
import { SpatialGrid } from './spatial';
import type { Building, MapData, Road } from './types';

interface Segment {
  ax: number;
  ay: number;
  bx: number;
  by: number;
  owner: number;
}

export type Surface = 'road' | 'path' | 'offroad';

export interface Contact {
  /** Total displacement applied to resolve the overlap. */
  push: Vec2;
  /** Unit normal of the deepest contact, pointing away from the obstacle. */
  normal: Vec2;
}

export interface RoadHit {
  road: Road;
  point: Vec2;
  /** Unit direction of the road segment at the hit point. */
  dir: Vec2;
  dist: number;
}

const WALL_CELL = 16;
const ROAD_CELL = 32;

/** Collision and surface queries over the loaded city, in local metres. */
export class World {
  readonly roads: Road[];
  readonly buildings: Building[];
  /** Playable half-size; the edge of the loaded data acts as a wall. */
  readonly limit: number;

  private readonly walls: Segment[] = [];
  private readonly wallGrid = new SpatialGrid(WALL_CELL);
  private readonly buildingGrid = new SpatialGrid(WALL_CELL * 4);
  private readonly roadSegs: Segment[] = [];
  private readonly roadGrid = new SpatialGrid(ROAD_CELL);

  constructor(readonly map: MapData) {
    this.roads = map.roads;
    this.buildings = map.buildings;
    this.limit = map.radius - 5;

    map.buildings.forEach((b, bi) => {
      this.buildingGrid.insert(bi, boundsOf(b.ring));
      for (let i = 0; i < b.ring.length; i++) {
        const a = b.ring[i];
        const c = b.ring[(i + 1) % b.ring.length];
        this.addSegment(this.walls, this.wallGrid, a, c, bi, 0);
      }
    });

    map.roads.forEach((r, ri) => {
      if (r.tunnel) return;
      for (let i = 0; i + 1 < r.points.length; i++) {
        this.addSegment(this.roadSegs, this.roadGrid, r.points[i], r.points[i + 1], ri, r.width / 2);
      }
    });
  }

  private addSegment(list: Segment[], grid: SpatialGrid, a: Vec2, b: Vec2, owner: number, pad: number) {
    grid.insert(list.length, boundsOf([a, b], pad));
    list.push({ ax: a.x, ay: a.y, bx: b.x, by: b.y, owner });
  }

  /** Index of the building containing p, or -1. */
  buildingAt(p: Vec2): number {
    let found = -1;
    this.buildingGrid.query({ minX: p.x, minY: p.y, maxX: p.x, maxY: p.y }, (i) => {
      if (found < 0 && pointInPolygon(p, this.buildings[i].ring)) found = i;
    });
    return found;
  }

  /**
   * Push a circle out of buildings and the map edge. Mutates p in place and
   * returns the contact, or null if the circle was already clear.
   */
  resolveCircle(p: Vec2, r: number): Contact | null {
    const startX = p.x;
    const startY = p.y;
    let normal: Vec2 | null = null;

    for (let iter = 0; iter < 4; iter++) {
      // Overlap from outside a footprint: resolve the deepest one first.
      let best: { pen: number; nx: number; ny: number } | null = null;
      // Centre inside a footprint: leave through the nearest edge, which beats any outside overlap.
      let exit: { pen: number; nx: number; ny: number } | null = null;
      const insideCache = new Map<number, boolean>();
      const box = { minX: p.x - r, minY: p.y - r, maxX: p.x + r, maxY: p.y + r };

      this.wallGrid.query(box, (si) => {
        const s = this.walls[si];
        const { point } = closestOnSegment(p, { x: s.ax, y: s.ay }, { x: s.bx, y: s.by });
        const dx = p.x - point.x;
        const dy = p.y - point.y;
        const d = Math.hypot(dx, dy);
        if (d < 1e-6) return;
        let inside = insideCache.get(s.owner);
        if (inside === undefined) {
          inside = pointInPolygon(p, this.buildings[s.owner].ring);
          insideCache.set(s.owner, inside);
        }
        if (inside) {
          if (!exit || r + d < exit.pen) exit = { pen: r + d, nx: -dx / d, ny: -dy / d };
        } else if (d < r && (!best || r - d > best.pen)) {
          best = { pen: r - d, nx: dx / d, ny: dy / d };
        }
      });
      if (exit) best = exit;

      // Map edge acts as a wall.
      const L = this.limit;
      if (p.x < -L + r) best = pickDeeper(best, -L + r - p.x, 1, 0);
      if (p.x > L - r) best = pickDeeper(best, p.x - (L - r), -1, 0);
      if (p.y < -L + r) best = pickDeeper(best, -L + r - p.y, 0, 1);
      if (p.y > L - r) best = pickDeeper(best, p.y - (L - r), 0, -1);

      if (!best) break;
      const b: { pen: number; nx: number; ny: number } = best;
      p.x += b.nx * b.pen;
      p.y += b.ny * b.pen;
      normal = { x: b.nx, y: b.ny };
    }

    if (!normal) return null;
    return { push: { x: p.x - startX, y: p.y - startY }, normal };
  }

  /** True if a circle at p overlaps no building and lies inside the map. */
  isClear(p: Vec2, r: number): boolean {
    const probe = { ...p };
    return this.buildingAt(p) < 0 && this.resolveCircle(probe, r) === null;
  }

  nearestRoad(p: Vec2, maxDist: number, drivableOnly = true): RoadHit | null {
    let best: RoadHit | null = null;
    const box = { minX: p.x - maxDist, minY: p.y - maxDist, maxX: p.x + maxDist, maxY: p.y + maxDist };
    this.roadGrid.query(box, (si) => {
      const s = this.roadSegs[si];
      const road = this.roads[s.owner];
      if (drivableOnly && !road.drivable) return;
      const a = { x: s.ax, y: s.ay };
      const b = { x: s.bx, y: s.by };
      const { point } = closestOnSegment(p, a, b);
      const d = Math.hypot(p.x - point.x, p.y - point.y);
      if (d > maxDist || (best && d >= best.dist)) return;
      const l = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      best = { road, point, dir: { x: (b.x - a.x) / l, y: (b.y - a.y) / l }, dist: d };
    });
    return best;
  }

  surfaceAt(p: Vec2): Surface {
    let surface: Surface = 'offroad';
    this.roadGrid.query({ minX: p.x, minY: p.y, maxX: p.x, maxY: p.y }, (si) => {
      if (surface === 'road') return;
      const s = this.roadSegs[si];
      const road = this.roads[s.owner];
      const { point } = closestOnSegment(p, { x: s.ax, y: s.ay }, { x: s.bx, y: s.by });
      if (Math.hypot(p.x - point.x, p.y - point.y) > road.width / 2 + 0.5) return;
      surface = road.drivable ? 'road' : 'path';
    });
    return surface;
  }

  /** Name of the closest named road within range, for the HUD. */
  streetName(p: Vec2): string | undefined {
    let best: { d: number; name: string } | undefined;
    this.roadGrid.query({ minX: p.x - 25, minY: p.y - 25, maxX: p.x + 25, maxY: p.y + 25 }, (si) => {
      const s = this.roadSegs[si];
      const name = this.roads[s.owner].name;
      if (!name) return;
      const { point } = closestOnSegment(p, { x: s.ax, y: s.ay }, { x: s.bx, y: s.by });
      const d = Math.hypot(p.x - point.x, p.y - point.y);
      if (d < 25 && (!best || d < best.d)) best = { d, name };
    });
    return best?.name;
  }

  /**
   * Find a spot on a drivable road near the centre: a car position and heading,
   * plus a clear spot beside it for the player to start on foot.
   */
  findSpawn(): { car: Vec2; heading: number; walker: Vec2 } {
    const preferred = new Set(['residential', 'tertiary', 'secondary', 'primary', 'service']);
    const candidates: { d: number; mid: Vec2; dir: Vec2; road: Road }[] = [];
    for (const road of this.roads) {
      if (!road.drivable || road.tunnel || road.bridge || !preferred.has(road.cls)) continue;
      for (let i = 0; i + 1 < road.points.length; i++) {
        const a = road.points[i];
        const b = road.points[i + 1];
        const l = Math.hypot(b.x - a.x, b.y - a.y);
        if (l < 12) continue;
        const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        candidates.push({ d: Math.hypot(mid.x, mid.y), mid, dir: { x: (b.x - a.x) / l, y: (b.y - a.y) / l }, road });
      }
    }
    candidates.sort((a, b) => a.d - b.d);

    for (const c of candidates.slice(0, 200)) {
      const right = { x: -c.dir.y, y: c.dir.x };
      const laneOffset = c.road.oneway ? 0 : c.road.width / 4;
      const car = { x: c.mid.x + right.x * laneOffset, y: c.mid.y + right.y * laneOffset };
      if (!this.isClear(car, 2.5)) continue;
      for (const side of [c.road.width / 2 + 1.2, c.road.width / 2 - 0.5, -laneOffset - 2.5]) {
        const walker = { x: c.mid.x + right.x * side - c.dir.x * 3, y: c.mid.y + right.y * side - c.dir.y * 3 };
        if (this.isClear(walker, 0.6)) return { car, heading: Math.atan2(c.dir.y, c.dir.x), walker };
      }
    }
    // No roads at all (e.g. open water): start in the middle of the map.
    return { car: { x: 0, y: 0 }, heading: 0, walker: { x: -4, y: 0 } };
  }
}

function pickDeeper(best: { pen: number; nx: number; ny: number } | null, pen: number, nx: number, ny: number) {
  return !best || pen > best.pen ? { pen, nx, ny } : best;
}
