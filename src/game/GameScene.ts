import Phaser from 'phaser';
import type { Vec2 } from '../math';
import { clamp, dist } from '../math';
import { ChunkRenderer } from '../render/ChunkRenderer';
import { Minimap } from '../render/Minimap';
import { createCarTexture, createPedTextures, SPRITE_PPM } from '../render/sprites';
import type { Hud } from '../ui/Hud';
import type { World } from '../world/World';
import { Car, CAR_WIDTH } from './Car';
import { Pedestrian, PED_RADIUS } from './Pedestrian';

export interface GameSceneData {
  world: World;
  hud: Hud;
  onQuit: () => void;
}

const STEP = 1 / 120;
const ENTER_RANGE = 3.2;
const MAX_EXIT_SPEED = 5;
/** People are drawn larger than life so they read at driving zoom, as in GTA 2. */
const PED_DRAW_SCALE = 2;

type Keys = Record<
  'W' | 'A' | 'S' | 'D' | 'UP' | 'DOWN' | 'LEFT' | 'RIGHT' | 'SPACE' | 'SHIFT' | 'F' | 'E' | 'ENTER' | 'ESC',
  Phaser.Input.Keyboard.Key
>;

export class GameScene extends Phaser.Scene {
  private world!: World;
  private hud!: Hud;
  private onQuit!: () => void;
  private chunks!: ChunkRenderer;
  private minimap!: Minimap;
  private keys!: Keys;

  private car!: Car;
  private ped!: Pedestrian;
  private driving = false;
  private carSprite!: Phaser.GameObjects.Image;
  private pedSprite!: Phaser.GameObjects.Image;

  private camPos: Vec2 = { x: 0, y: 0 };
  private zoom = 16;
  private acc = 0;

  constructor() {
    super('game');
  }

  init(data: GameSceneData): void {
    this.world = data.world;
    this.hud = data.hud;
    this.onQuit = data.onQuit;
    this.driving = false;
    this.acc = 0;
  }

  create(): void {
    createCarTexture(this, 'car', '#c8322b');
    createPedTextures(this, 'ped', '#2f6fb3');

    this.chunks = new ChunkRenderer(this, this.world.map);
    this.minimap = new Minimap(this.hud.minimap, this.world.map);

    const spawn = this.world.findSpawn();
    this.car = new Car(spawn.car, spawn.heading);
    this.ped = new Pedestrian(spawn.walker);
    this.ped.heading = Math.atan2(spawn.car.y - spawn.walker.y, spawn.car.x - spawn.walker.x);

    this.carSprite = this.add.image(0, 0, 'car').setScale(1 / SPRITE_PPM).setDepth(10);
    this.pedSprite = this.add.image(0, 0, 'ped0').setScale(PED_DRAW_SCALE / SPRITE_PPM).setDepth(11);

    this.keys = this.input.keyboard!.addKeys(
      'W,A,S,D,UP,DOWN,LEFT,RIGHT,SPACE,SHIFT,F,E,ENTER,ESC',
    ) as Keys;
    this.input.keyboard!.addCapture('SPACE,UP,DOWN,LEFT,RIGHT');

    this.camPos = { ...this.ped.pos };
    this.cameras.main.setBackgroundColor('#1b1c1a');
    this.cameras.main.setZoom(this.zoom);
    this.cameras.main.centerOn(this.camPos.x, this.camPos.y);
    // Fill the first screen before play starts so there's no pop-in.
    this.chunks.update(this.viewBounds(), 64);
    this.syncSprites();

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.chunks.destroy());
    exposeDebug(this);
  }

  update(_time: number, deltaMs: number): void {
    const k = this.keys;
    if (Phaser.Input.Keyboard.JustDown(k.ESC)) {
      this.onQuit();
      return;
    }
    if (Phaser.Input.Keyboard.JustDown(k.F) || Phaser.Input.Keyboard.JustDown(k.E) || Phaser.Input.Keyboard.JustDown(k.ENTER)) {
      this.toggleCar();
    }

    const up = k.W.isDown || k.UP.isDown ? 1 : 0;
    const down = k.S.isDown || k.DOWN.isDown ? 1 : 0;
    const left = k.A.isDown || k.LEFT.isDown ? 1 : 0;
    const right = k.D.isDown || k.RIGHT.isDown ? 1 : 0;

    const dt = Math.min(deltaMs / 1000, 0.1);
    this.acc += dt;
    let impact = 0;
    while (this.acc >= STEP) {
      this.acc -= STEP;
      if (this.driving) {
        this.car.step(STEP, { throttle: up - down, steer: right - left, handbrake: k.SPACE.isDown }, this.world);
      } else {
        // An empty car rolls to a stop.
        this.car.step(STEP, { throttle: 0, steer: 0, handbrake: true }, this.world);
        this.ped.step(STEP, { dir: { x: right - left, y: down - up }, run: k.SHIFT.isDown }, this.world);
        this.car.pushOutCircle(this.ped.pos, PED_RADIUS);
      }
      impact = Math.max(impact, this.car.lastImpact);
    }
    if (this.driving && impact > 6) this.cameras.main.shake(140, Math.min(0.012, impact * 0.0007));

    this.syncSprites();
    this.updateCamera(dt);
    this.chunks.update(this.viewBounds());
    this.updateHud();
  }

  private toggleCar(): void {
    if (!this.driving) {
      if (dist(this.ped.pos, this.car.pos) <= ENTER_RANGE) this.driving = true;
      return;
    }
    if (this.car.speed > MAX_EXIT_SPEED) return;
    const f = this.car.forward;
    const r = this.car.right;
    const side = CAR_WIDTH / 2 + 0.6;
    // Driver's door first, then passenger side, rear and front.
    const spots: Vec2[] = [
      { x: this.car.pos.x - r.x * side + f.x * 0.4, y: this.car.pos.y - r.y * side + f.y * 0.4 },
      { x: this.car.pos.x + r.x * side + f.x * 0.4, y: this.car.pos.y + r.y * side + f.y * 0.4 },
      { x: this.car.pos.x - f.x * 3, y: this.car.pos.y - f.y * 3 },
      { x: this.car.pos.x + f.x * 3, y: this.car.pos.y + f.y * 3 },
    ];
    const spot = spots.find((s) => this.world.isClear(s, PED_RADIUS + 0.05));
    if (!spot) return;
    this.ped.pos = { ...spot };
    this.ped.vel = { x: 0, y: 0 };
    this.ped.heading = this.car.heading;
    this.driving = false;
  }

  private syncSprites(): void {
    this.carSprite.setPosition(this.car.pos.x, this.car.pos.y).setRotation(this.car.heading);
    this.pedSprite.setVisible(!this.driving);
    if (!this.driving) {
      const moving = Math.hypot(this.ped.vel.x, this.ped.vel.y) > 0.3;
      const frame = moving ? 1 + (Math.floor(this.ped.stride / 0.7) % 2) : 0;
      this.pedSprite.setTexture(`ped${frame}`).setPosition(this.ped.pos.x, this.ped.pos.y).setRotation(this.ped.heading);
    }
  }

  private updateCamera(dt: number): void {
    const cam = this.cameras.main;
    const subject = this.driving ? this.car.pos : this.ped.pos;
    const vel = this.driving ? this.car.vel : { x: 0, y: 0 };
    const speed = this.driving ? this.car.speed : 0;
    // Look ahead in the direction of travel, like the GTA 2 camera.
    const target = { x: subject.x + clamp(vel.x * 0.55, -25, 25), y: subject.y + clamp(vel.y * 0.55, -25, 25) };
    const kp = 1 - Math.exp(-6 * dt);
    this.camPos.x += (target.x - this.camPos.x) * kp;
    this.camPos.y += (target.y - this.camPos.y) * kp;

    const base = Math.min(cam.width, cam.height) / 45; // ~45 m across on foot
    const wantZoom = this.driving ? base * (0.72 - 0.37 * clamp(speed / 35, 0, 1)) : base;
    this.zoom += (wantZoom - this.zoom) * (1 - Math.exp(-2.5 * dt));
    cam.setZoom(this.zoom);
    cam.centerOn(this.camPos.x, this.camPos.y);
  }

  private viewBounds() {
    const cam = this.cameras.main;
    const hw = cam.width / 2 / this.zoom;
    const hh = cam.height / 2 / this.zoom;
    return { minX: this.camPos.x - hw, minY: this.camPos.y - hh, maxX: this.camPos.x + hw, maxY: this.camPos.y + hh };
  }

  private updateHud(): void {
    const pos = this.driving ? this.car.pos : this.ped.pos;
    let hint = '';
    if (!this.driving && dist(this.ped.pos, this.car.pos) <= ENTER_RANGE) hint = 'Press F to get in';
    else if (this.driving && this.car.speed > MAX_EXIT_SPEED && this.car.speed < 9) hint = 'Slow down to get out';
    this.hud.update(this.world.streetName(pos), this.driving ? this.car.speed * 3.6 : null, hint);
    this.minimap.draw(
      pos,
      this.driving ? this.car.heading : this.ped.heading,
      this.driving ? null : this.car.pos,
    );
  }

  /** Snapshot for automated tests and debugging from the console. */
  debugState() {
    return {
      driving: this.driving,
      car: { ...this.car.pos, heading: this.car.heading, speed: this.car.speed, surface: this.car.surface },
      ped: { ...this.ped.pos },
      chunks: this.chunks.chunkCount,
      insideBuilding: this.world.buildingAt(this.driving ? this.car.pos : this.ped.pos) >= 0,
    };
  }
}

function exposeDebug(scene: GameScene): void {
  (window as unknown as { freeGta?: unknown }).freeGta = { state: () => scene.debugState() };
}
