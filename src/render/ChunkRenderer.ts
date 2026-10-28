import Phaser from 'phaser';
import type { Bounds, Vec2 } from '../math';
import { boundsOf } from '../math';
import { ROAD_ORDER } from '../world/roads';
import { SpatialGrid } from '../world/spatial';
import type { Area, Building, MapData, Road } from '../world/types';
import {
  AREA,
  AREA_ORDER,
  ASPHALT,
  CURB,
  GROUND,
  LANE_WHITE,
  LANE_YELLOW,
  SIDEWALK,
  roofColor,
} from './palette';

/** Chunk edge in metres. */
export const CHUNK = 128;
/** Texture pixels per metre. */
export const TEX_PPM = 8;
const SHADOW_PAD = 8;

interface Chunk {
  key: string;
  image: Phaser.GameObjects.Image;
}

/**
 * Renders the static city (ground, areas, roads, buildings) into canvas
 * textures, one per chunk, created around the camera and dropped when far away.
 */
export class ChunkRenderer {
  private readonly roadGrid = new SpatialGrid(CHUNK);
  private readonly buildingGrid = new SpatialGrid(CHUNK);
  private readonly areaGrid = new SpatialGrid(CHUNK);
  private readonly roadRank: number[];
  private readonly areaRank: number[];
  private readonly chunks = new Map<string, Chunk>();

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly map: MapData,
  ) {
    map.roads.forEach((r, i) => this.roadGrid.insert(i, boundsOf(r.points, r.width / 2 + 2)));
    map.buildings.forEach((b, i) => this.buildingGrid.insert(i, boundsOf(b.ring, SHADOW_PAD)));
    map.areas.forEach((a, i) => this.areaGrid.insert(i, boundsOf(a.ring)));
    this.roadRank = map.roads.map((r) => ROAD_ORDER.indexOf(r.cls) + (r.bridge ? 100 : 0));
    this.areaRank = map.areas.map((a) => AREA_ORDER.indexOf(a.kind));
  }

  /** Ensure chunks covering the view exist, and drop distant ones. Returns how many were built. */
  update(view: Bounds, budget = 4): number {
    const x0 = Math.floor(view.minX / CHUNK) - 1;
    const x1 = Math.floor(view.maxX / CHUNK) + 1;
    const y0 = Math.floor(view.minY / CHUNK) - 1;
    const y1 = Math.floor(view.maxY / CHUNK) + 1;
    const limit = Math.ceil(this.map.radius / CHUNK);

    // Build nearest-first so the screen fills from the middle out.
    const cx = (view.minX + view.maxX) / 2 / CHUNK;
    const cy = (view.minY + view.maxY) / 2 / CHUNK;
    const wanted: { x: number; y: number; d: number }[] = [];
    for (let x = Math.max(x0, -limit); x <= Math.min(x1, limit - 1); x++) {
      for (let y = Math.max(y0, -limit); y <= Math.min(y1, limit - 1); y++) {
        if (!this.chunks.has(`${x},${y}`)) wanted.push({ x, y, d: Math.hypot(x + 0.5 - cx, y + 0.5 - cy) });
      }
    }
    wanted.sort((a, b) => a.d - b.d);
    let built = 0;
    for (const w of wanted) {
      if (built >= budget) break;
      this.build(w.x, w.y);
      built++;
    }

    for (const [id, chunk] of this.chunks) {
      const [x, y] = id.split(',').map(Number);
      if (x < x0 - 2 || x > x1 + 2 || y < y0 - 2 || y > y1 + 2) {
        chunk.image.destroy();
        this.scene.textures.remove(chunk.key);
        this.chunks.delete(id);
      }
    }
    return built;
  }

  get chunkCount(): number {
    return this.chunks.size;
  }

  private build(x: number, y: number): void {
    const size = CHUNK * TEX_PPM;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    const ox = x * CHUNK;
    const oy = y * CHUNK;
    const bounds = { minX: ox, minY: oy, maxX: ox + CHUNK, maxY: oy + CHUNK };
    ctx.setTransform(TEX_PPM, 0, 0, TEX_PPM, -ox * TEX_PPM, -oy * TEX_PPM);

    ctx.fillStyle = GROUND;
    ctx.fillRect(ox, oy, CHUNK, CHUNK);

    this.drawAreas(ctx, this.collect(this.areaGrid, bounds, this.areaRank).map((i) => this.map.areas[i]));
    this.drawRoads(ctx, this.collect(this.roadGrid, bounds, this.roadRank).map((i) => this.map.roads[i]));
    this.drawBuildings(ctx, this.collect(this.buildingGrid, bounds).map((i) => this.map.buildings[i]));

    const key = `chunk:${x},${y}:${Math.random().toString(36).slice(2)}`;
    this.scene.textures.addCanvas(key, canvas);
    const image = this.scene.add.image(ox, oy, key).setOrigin(0, 0).setScale(1 / TEX_PPM).setDepth(0);
    this.chunks.set(`${x},${y}`, { key, image });
  }

  private collect(grid: SpatialGrid, b: Bounds, rank?: number[]): number[] {
    const out: number[] = [];
    grid.query(b, (i) => out.push(i));
    return rank ? out.sort((a, c) => rank[a] - rank[c] || a - c) : out.sort((a, c) => a - c);
  }

  private drawAreas(ctx: CanvasRenderingContext2D, areas: Area[]): void {
    for (const a of areas) {
      ctx.fillStyle = AREA[a.kind];
      fillRing(ctx, a.ring);
      if (a.kind === 'water') {
        ctx.strokeStyle = 'rgba(20, 50, 80, 0.6)';
        ctx.lineWidth = 0.8;
        ctx.stroke();
      }
    }
  }

  private drawRoads(ctx: CanvasRenderingContext2D, roads: Road[]): void {
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    const surface = roads.filter((r) => !r.tunnel);
    const ground = surface.filter((r) => !r.bridge);
    const bridges = surface.filter((r) => r.bridge);

    const pass = (list: Road[]) => {
      // Sidewalks first, then asphalt, so all junctions merge cleanly.
      for (const r of list) {
        if (!r.drivable) continue;
        ctx.strokeStyle = CURB;
        ctx.lineWidth = r.width + 3.6;
        strokeLine(ctx, r.points);
        ctx.strokeStyle = SIDEWALK;
        ctx.lineWidth = r.width + 3;
        strokeLine(ctx, r.points);
      }
      for (const r of list) {
        ctx.strokeStyle = ASPHALT[r.cls];
        ctx.lineWidth = r.width;
        strokeLine(ctx, r.points);
      }
      for (const r of list) this.drawMarkings(ctx, r);
    };

    pass(ground);
    if (bridges.length) {
      for (const r of bridges) {
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.45)';
        ctx.lineWidth = r.width + 5;
        strokeLine(ctx, r.points);
      }
      pass(bridges);
    }
  }

  private drawMarkings(ctx: CanvasRenderingContext2D, r: Road): void {
    if (!r.drivable || r.width < 6 || r.cls === 'service' || r.cls === 'track') return;
    ctx.lineCap = 'butt';
    ctx.setLineDash([3, 4]);
    ctx.lineWidth = 0.18;
    if (r.oneway) {
      // Lane dividers for multi-lane one-way roads.
      const lanes = Math.round(r.width / 3.4);
      for (let i = 1; i < lanes; i++) {
        ctx.strokeStyle = LANE_WHITE;
        strokeLine(ctx, offsetLine(r.points, -r.width / 2 + (i * r.width) / lanes));
      }
    } else {
      ctx.strokeStyle = r.cls === 'motorway' || r.cls === 'trunk' || r.cls === 'primary' ? LANE_YELLOW : LANE_WHITE;
      if (r.width >= 12) ctx.setLineDash([]);
      strokeLine(ctx, r.points);
    }
    ctx.setLineDash([]);
    ctx.lineCap = 'round';
  }

  private drawBuildings(ctx: CanvasRenderingContext2D, buildings: Building[]): void {
    // All shadows before any roof so neighbours never shade each other's roofs.
    ctx.fillStyle = 'rgba(0, 0, 0, 0.32)';
    for (const b of buildings) {
      const off = Math.min(1 + b.levels * 0.55, SHADOW_PAD - 1);
      ctx.save();
      ctx.translate(off, off);
      fillRing(ctx, b.ring);
      ctx.restore();
    }
    ctx.lineJoin = 'miter';
    for (const b of buildings) {
      ctx.fillStyle = roofColor(b.id);
      fillRing(ctx, b.ring);
      ctx.strokeStyle = 'rgba(30, 25, 20, 0.55)';
      ctx.lineWidth = 0.35;
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
      ctx.lineWidth = 0.9;
      ctx.save();
      ctx.clip();
      ctx.stroke();
      ctx.restore();
    }
  }

  destroy(): void {
    for (const chunk of this.chunks.values()) {
      chunk.image.destroy();
      this.scene.textures.remove(chunk.key);
    }
    this.chunks.clear();
  }
}

function strokeLine(ctx: CanvasRenderingContext2D, pts: Vec2[]): void {
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.stroke();
}

function fillRing(ctx: CanvasRenderingContext2D, ring: Vec2[]): void {
  ctx.beginPath();
  ctx.moveTo(ring[0].x, ring[0].y);
  for (let i = 1; i < ring.length; i++) ctx.lineTo(ring[i].x, ring[i].y);
  ctx.closePath();
  ctx.fill();
}

/** Offset a polyline sideways (positive = right of travel direction). */
export function offsetLine(pts: Vec2[], d: number): Vec2[] {
  return pts.map((p, i) => {
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(pts.length - 1, i + 1)];
    const l = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    return { x: p.x - ((b.y - a.y) / l) * d, y: p.y + ((b.x - a.x) / l) * d };
  });
}
