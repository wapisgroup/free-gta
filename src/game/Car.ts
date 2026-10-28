import type { Vec2 } from '../math';
import { clamp, cross, dot } from '../math';
import type { Surface, World } from '../world/World';

export interface DriveInput {
  /** -1 (brake / reverse) to 1 (accelerate). */
  throttle: number;
  /** -1 (left) to 1 (right). */
  steer: number;
  handbrake: boolean;
}

export const CAR_LENGTH = 4.4;
export const CAR_WIDTH = 2.0;

const MAX_SPEED = 38; // m/s, about 137 km/h
const MAX_REVERSE = 9;
const ENGINE_ACCEL = 11;
const BRAKE_DECEL = 24;
const REVERSE_ACCEL = 6;
const ROLLING_DRAG = 0.5;
const AIR_DRAG = 0.0035;
const WHEELBASE = 2.7;
const MAX_STEER = 0.62;

const GRIP: Record<Surface, number> = { road: 9, path: 7, offroad: 4 };
const SURFACE_DRAG: Record<Surface, number> = { road: 0, path: 1.5, offroad: 4.5 };

/** Collision circles along the car's long axis, as offsets from the centre. */
const BODY_CIRCLES = [-1.3, 0, 1.3];
const BODY_RADIUS = CAR_WIDTH / 2;

/** Arcade top-down car: kinematic bicycle steering with lateral grip, in the spirit of GTA 2. */
export class Car {
  pos: Vec2;
  heading: number;
  vel: Vec2 = { x: 0, y: 0 };
  /** Extra spin from crashes and handbrake slides, rad/s. */
  spin = 0;
  surface: Surface = 'road';
  /** Impact speed of the last collision this step, for effects. */
  lastImpact = 0;

  constructor(pos: Vec2, heading: number) {
    this.pos = { ...pos };
    this.heading = heading;
  }

  get forward(): Vec2 {
    return { x: Math.cos(this.heading), y: Math.sin(this.heading) };
  }

  get right(): Vec2 {
    return { x: -Math.sin(this.heading), y: Math.cos(this.heading) };
  }

  /** Signed speed along the car's heading, m/s. */
  get forwardSpeed(): number {
    return dot(this.vel, this.forward);
  }

  get speed(): number {
    return Math.hypot(this.vel.x, this.vel.y);
  }

  step(dt: number, input: DriveInput, world: World): void {
    this.surface = world.surfaceAt(this.pos);
    const f = this.forward;
    const r = this.right;
    let vf = dot(this.vel, f);
    let vl = dot(this.vel, r);

    // Engine, brakes and reverse.
    const t = clamp(input.throttle, -1, 1);
    if (t > 0) {
      if (vf < -0.5) vf = Math.min(0, vf + BRAKE_DECEL * t * dt);
      else vf += ENGINE_ACCEL * t * (1 - Math.max(0, vf) / MAX_SPEED) * dt;
    } else if (t < 0) {
      if (vf > 0.5) vf = Math.max(0, vf + BRAKE_DECEL * t * dt);
      else vf = Math.max(-MAX_REVERSE, vf + REVERSE_ACCEL * t * dt);
    }
    if (input.handbrake) vf -= Math.sign(vf) * Math.min(Math.abs(vf), 6 * dt);

    // Drag: rolling, surface and air resistance.
    const drag = (ROLLING_DRAG + SURFACE_DRAG[this.surface] + AIR_DRAG * vf * vf) * dt;
    vf = Math.abs(vf) <= drag ? 0 : vf - Math.sign(vf) * drag;

    // Lateral grip: tyres kill sideways motion; the handbrake lets the rear slide.
    const grip = input.handbrake ? 1.2 : GRIP[this.surface];
    vl *= Math.exp(-grip * dt);

    // Steering. Less lock at speed keeps high-speed handling sane.
    const steerAngle = clamp(input.steer, -1, 1) * (MAX_STEER / (1 + Math.abs(vf) / 22));
    let yawRate = (vf / WHEELBASE) * Math.tan(steerAngle);
    if (input.handbrake) yawRate *= 1.6;
    this.heading += (yawRate + this.spin) * dt;
    this.spin *= Math.exp(-4 * dt);

    const nf = this.forward;
    const nr = this.right;
    this.vel = { x: nf.x * vf + nr.x * vl, y: nf.y * vf + nr.y * vl };
    this.pos.x += this.vel.x * dt;
    this.pos.y += this.vel.y * dt;

    this.collide(world);
  }

  /** Resolve overlaps with buildings and bounce off them. */
  collide(world: World): void {
    this.lastImpact = 0;
    const f = this.forward;
    for (const offset of BODY_CIRCLES) {
      const c = { x: this.pos.x + f.x * offset, y: this.pos.y + f.y * offset };
      const contact = world.resolveCircle(c, BODY_RADIUS);
      if (!contact) continue;
      this.pos.x += contact.push.x;
      this.pos.y += contact.push.y;
      const n = contact.normal;
      const vn = dot(this.vel, n);
      if (vn >= 0) continue;
      // Bounce a little and scrub some speed along the wall.
      const restitution = 0.25;
      const scrub = 0.85;
      const vt = { x: this.vel.x - n.x * vn, y: this.vel.y - n.y * vn };
      this.vel = { x: vt.x * scrub - n.x * vn * restitution, y: vt.y * scrub - n.y * vn * restitution };
      // Off-centre hits twist the car.
      const arm = { x: f.x * offset, y: f.y * offset };
      this.spin += clamp(cross(arm, n) * -vn * 0.12, -3, 3);
      this.lastImpact = Math.max(this.lastImpact, -vn);
    }
  }

  /** Corners of the body rectangle, for drawing and ped collisions. */
  corners(): Vec2[] {
    const f = this.forward;
    const r = this.right;
    const hl = CAR_LENGTH / 2;
    const hw = CAR_WIDTH / 2;
    return [
      { x: this.pos.x + f.x * hl + r.x * hw, y: this.pos.y + f.y * hl + r.y * hw },
      { x: this.pos.x + f.x * hl - r.x * hw, y: this.pos.y + f.y * hl - r.y * hw },
      { x: this.pos.x - f.x * hl - r.x * hw, y: this.pos.y - f.y * hl - r.y * hw },
      { x: this.pos.x - f.x * hl + r.x * hw, y: this.pos.y - f.y * hl + r.y * hw },
    ];
  }

  /**
   * Push a circle (e.g. a pedestrian) out of the car body. Mutates p.
   * Returns true if it overlapped.
   */
  pushOutCircle(p: Vec2, radius: number): boolean {
    const f = this.forward;
    const r = this.right;
    const d = { x: p.x - this.pos.x, y: p.y - this.pos.y };
    const lx = dot(d, f);
    const ly = dot(d, r);
    const hl = CAR_LENGTH / 2;
    const hw = CAR_WIDTH / 2;
    const cx = clamp(lx, -hl, hl);
    const cy = clamp(ly, -hw, hw);
    let ox = lx - cx;
    let oy = ly - cy;
    const dd = Math.hypot(ox, oy);
    if (dd >= radius) return false;
    if (dd < 1e-6) {
      // Centre inside the body: exit through the nearest side.
      const exits = [hl - lx, lx + hl, hw - ly, ly + hw];
      const m = Math.min(...exits);
      const i = exits.indexOf(m);
      ox = i === 0 ? 1 : i === 1 ? -1 : 0;
      oy = i === 2 ? 1 : i === 3 ? -1 : 0;
      const nx = (i < 2 ? hl : hw) + radius;
      const tx = i < 2 ? ox * nx : lx;
      const ty = i < 2 ? ly : oy * nx;
      p.x = this.pos.x + f.x * tx + r.x * ty;
      p.y = this.pos.y + f.y * tx + r.y * ty;
      return true;
    }
    const k = radius / dd;
    const tx = cx + ox * k;
    const ty = cy + oy * k;
    p.x = this.pos.x + f.x * tx + r.x * ty;
    p.y = this.pos.y + f.y * tx + r.y * ty;
    return true;
  }
}
