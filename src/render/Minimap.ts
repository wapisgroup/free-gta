import type { Vec2 } from '../math';
import type { MapData } from '../world/types';
import { AREA } from './palette';

const PPM = 0.5;
/** Metres shown across the minimap. */
const SPAN = 420;

/** Pre-rendered overview of the loaded area, scrolled under the player. */
export class Minimap {
  private readonly full: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly map: MapData,
  ) {
    this.ctx = canvas.getContext('2d')!;
    const size = Math.ceil(map.radius * 2 * PPM);
    this.full = document.createElement('canvas');
    this.full.width = size;
    this.full.height = size;
    const g = this.full.getContext('2d')!;
    g.setTransform(PPM, 0, 0, PPM, map.radius * PPM, map.radius * PPM);
    g.fillStyle = '#2a2b28';
    g.fillRect(-map.radius, -map.radius, map.radius * 2, map.radius * 2);
    for (const a of map.areas) {
      if (a.kind !== 'water' && a.kind !== 'park' && a.kind !== 'forest' && a.kind !== 'grass') continue;
      g.fillStyle = AREA[a.kind];
      g.globalAlpha = 0.7;
      path(g, a.ring, true);
      g.fill();
    }
    g.globalAlpha = 1;
    g.fillStyle = '#4b4a45';
    for (const b of map.buildings) {
      path(g, b.ring, true);
      g.fill();
    }
    g.lineCap = 'round';
    g.lineJoin = 'round';
    for (const r of map.roads) {
      if (!r.drivable || r.tunnel) continue;
      g.strokeStyle = r.cls === 'motorway' || r.cls === 'trunk' || r.cls === 'primary' ? '#e8c46a' : '#d9d6cc';
      g.lineWidth = Math.max(r.width, 4);
      path(g, r.points, false);
      g.stroke();
    }
  }

  draw(player: Vec2, heading: number, car: Vec2 | null): void {
    const { ctx, canvas } = this;
    const w = canvas.width;
    const h = canvas.height;
    const scale = w / SPAN;
    ctx.fillStyle = '#1b1c1a';
    ctx.fillRect(0, 0, w, h);
    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.scale(scale / PPM, scale / PPM);
    ctx.drawImage(this.full, -(player.x + this.map.radius) * PPM, -(player.y + this.map.radius) * PPM);
    ctx.restore();

    if (car) {
      ctx.fillStyle = '#4fc3f7';
      ctx.beginPath();
      ctx.arc(w / 2 + (car.x - player.x) * scale, h / 2 + (car.y - player.y) * scale, 4, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.rotate(heading);
    ctx.fillStyle = '#ff5a4f';
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(8, 0);
    ctx.lineTo(-6, -5.5);
    ctx.lineTo(-3, 0);
    ctx.lineTo(-6, 5.5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
}

function path(g: CanvasRenderingContext2D, pts: Vec2[], close: boolean): void {
  g.beginPath();
  g.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].x, pts[i].y);
  if (close) g.closePath();
}
