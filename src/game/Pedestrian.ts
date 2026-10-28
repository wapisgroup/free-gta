import type { Vec2 } from '../math';
import { angleDiff } from '../math';
import type { World } from '../world/World';

export const PED_RADIUS = 0.35;
const WALK_SPEED = 3.2;
const RUN_SPEED = 6.5;

export interface WalkInput {
  /** Desired direction in screen space; zero vector to stand still. */
  dir: Vec2;
  run: boolean;
}

export class Pedestrian {
  pos: Vec2;
  heading = 0;
  vel: Vec2 = { x: 0, y: 0 };
  /** Walk cycle phase, advances with distance travelled. */
  stride = 0;

  constructor(pos: Vec2) {
    this.pos = { ...pos };
  }

  step(dt: number, input: WalkInput, world: World): void {
    const l = Math.hypot(input.dir.x, input.dir.y);
    const speed = l > 0 ? (input.run ? RUN_SPEED : WALK_SPEED) : 0;
    const target = l > 0 ? { x: (input.dir.x / l) * speed, y: (input.dir.y / l) * speed } : { x: 0, y: 0 };
    // Quick acceleration, still a touch of inertia.
    const k = 1 - Math.exp(-14 * dt);
    this.vel.x += (target.x - this.vel.x) * k;
    this.vel.y += (target.y - this.vel.y) * k;

    if (l > 0) {
      const want = Math.atan2(input.dir.y, input.dir.x);
      this.heading += angleDiff(want, this.heading) * (1 - Math.exp(-18 * dt));
    }

    this.pos.x += this.vel.x * dt;
    this.pos.y += this.vel.y * dt;
    this.stride += Math.hypot(this.vel.x, this.vel.y) * dt;
    world.resolveCircle(this.pos, PED_RADIUS);
  }
}
