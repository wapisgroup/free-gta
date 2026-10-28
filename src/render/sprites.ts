import Phaser from 'phaser';
import { CAR_LENGTH, CAR_WIDTH } from '../game/Car';

/** Sprite texture resolution, pixels per metre. */
export const SPRITE_PPM = 16;

function makeCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = Math.ceil(w * SPRITE_PPM);
  c.height = Math.ceil(h * SPRITE_PPM);
  const ctx = c.getContext('2d')!;
  ctx.scale(SPRITE_PPM, SPRITE_PPM);
  return [c, ctx];
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

/** Top-down car facing +x (east). */
export function createCarTexture(scene: Phaser.Scene, key: string, body: string): void {
  if (scene.textures.exists(key)) return;
  const pad = 0.3;
  const L = CAR_LENGTH;
  const W = CAR_WIDTH;
  const [canvas, ctx] = makeCanvas(L + pad * 2, W + pad * 2);
  ctx.translate(pad, pad);

  // Shadow.
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  roundRect(ctx, 0.15, 0.2, L, W, 0.45);
  ctx.fill();

  // Body.
  ctx.fillStyle = body;
  roundRect(ctx, 0, 0, L, W, 0.45);
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.5)';
  ctx.lineWidth = 0.08;
  ctx.stroke();

  // Bonnet highlight.
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  roundRect(ctx, L * 0.62, 0.25, L * 0.33, W - 0.5, 0.3);
  ctx.fill();

  // Cabin: windscreen, roof, rear window.
  ctx.fillStyle = '#1d2a35';
  roundRect(ctx, L * 0.22, 0.18, L * 0.42, W - 0.36, 0.3);
  ctx.fill();
  ctx.fillStyle = body;
  roundRect(ctx, L * 0.3, 0.3, L * 0.24, W - 0.6, 0.15);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.fillRect(L * 0.3, 0.3, L * 0.24, (W - 0.6) / 2);

  // Lights.
  ctx.fillStyle = '#fff6c8';
  ctx.fillRect(L - 0.12, 0.2, 0.12, 0.38);
  ctx.fillRect(L - 0.12, W - 0.58, 0.12, 0.38);
  ctx.fillStyle = '#c0202a';
  ctx.fillRect(0, 0.2, 0.1, 0.38);
  ctx.fillRect(0, W - 0.58, 0.1, 0.38);

  // Mirrors.
  ctx.fillStyle = body;
  ctx.fillRect(L * 0.6, -0.12, 0.18, 0.14);
  ctx.fillRect(L * 0.6, W - 0.02, 0.18, 0.14);

  scene.textures.addCanvas(key, canvas);
}

/** Three walk frames for a top-down person facing +x: standing, left foot, right foot. */
export function createPedTextures(scene: Phaser.Scene, prefix: string, shirt: string): void {
  for (let frame = 0; frame < 3; frame++) {
    const key = `${prefix}${frame}`;
    if (scene.textures.exists(key)) continue;
    const S = 1.2;
    const [canvas, ctx] = makeCanvas(S, S);
    ctx.translate(S / 2, S / 2);

    // Feet.
    const step = frame === 0 ? 0 : frame === 1 ? 0.18 : -0.18;
    ctx.fillStyle = '#222';
    ctx.beginPath();
    ctx.ellipse(step, -0.14, 0.12, 0.07, 0, 0, Math.PI * 2);
    ctx.ellipse(-step, 0.14, 0.12, 0.07, 0, 0, Math.PI * 2);
    ctx.fill();

    // Shoulders and arms.
    ctx.fillStyle = shirt;
    ctx.beginPath();
    ctx.ellipse(0, 0, 0.17, 0.3, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#d8a27a';
    ctx.beginPath();
    ctx.arc(-step * 0.6, -0.33, 0.06, 0, Math.PI * 2);
    ctx.arc(step * 0.6, 0.33, 0.06, 0, Math.PI * 2);
    ctx.fill();

    // Head.
    ctx.fillStyle = '#3b2a1e';
    ctx.beginPath();
    ctx.arc(0.02, 0, 0.13, 0, Math.PI * 2);
    ctx.fill();

    scene.textures.addCanvas(key, canvas);
  }
}
