import { describe, expect, it } from 'vitest';
import { Car } from '../src/game/Car';
import { Pedestrian } from '../src/game/Pedestrian';
import { World } from '../src/world/World';
import { testMap } from './helpers';

describe('World', () => {
  const world = new World(testMap());

  it('reports surfaces', () => {
    expect(world.surfaceAt({ x: 0, y: 1 })).toBe('road');
    expect(world.surfaceAt({ x: -50, y: 50 })).toBe('path');
    expect(world.surfaceAt({ x: 0, y: 100 })).toBe('offroad');
  });

  it('pushes a circle out of a wall it overlaps', () => {
    const p = { x: 0, y: -7.5 };
    const contact = world.resolveCircle(p, 1);
    expect(contact).not.toBeNull();
    expect(p.y).toBeCloseTo(-6, 5);
    expect(contact!.normal.y).toBeCloseTo(1, 5);
  });

  it('pushes a circle whose centre is inside a building out through the nearest edge', () => {
    const p = { x: 0, y: -7.8 };
    world.resolveCircle(p, 1);
    expect(p.y).toBeCloseTo(-6, 5);
    expect(world.buildingAt(p)).toBe(-1);
  });

  it('leaves clear circles alone', () => {
    const p = { x: 0, y: 0 };
    expect(world.resolveCircle(p, 1)).toBeNull();
    expect(p).toEqual({ x: 0, y: 0 });
  });

  it('keeps things inside the map edge', () => {
    const p = { x: -400, y: 0 };
    world.resolveCircle(p, 1);
    expect(p.x).toBeGreaterThanOrEqual(-world.limit);
  });

  it('finds the nearest street name', () => {
    expect(world.streetName({ x: 10, y: 3 })).toBe('Main Street');
    expect(world.streetName({ x: 10, y: 200 })).toBeUndefined();
  });

  it('spawns the car on a road and the walker somewhere clear', () => {
    const spawn = world.findSpawn();
    expect(world.surfaceAt(spawn.car)).toBe('road');
    expect(world.isClear(spawn.car, 2.5)).toBe(true);
    expect(world.isClear(spawn.walker, 0.5)).toBe(true);
  });
});

describe('Car', () => {
  it('accelerates along its heading and steers right with positive steer', () => {
    const world = new World(testMap());
    const car = new Car({ x: -150, y: 0 }, 0);
    for (let i = 0; i < 120; i++) car.step(1 / 120, { throttle: 1, steer: 0, handbrake: false }, world);
    expect(car.forwardSpeed).toBeGreaterThan(8);
    expect(car.pos.x).toBeGreaterThan(-147);
    expect(Math.abs(car.pos.y)).toBeLessThan(0.01);
    for (let i = 0; i < 30; i++) car.step(1 / 120, { throttle: 1, steer: 1, handbrake: false }, world);
    expect(car.heading).toBeGreaterThan(0);
  });

  it('cannot drive through a building at full speed', () => {
    const world = new World(testMap());
    const car = new Car({ x: -150, y: 0 }, 0);
    let maxImpact = 0;
    for (let i = 0; i < 120 * 15; i++) {
      car.step(1 / 120, { throttle: 1, steer: 0, handbrake: false }, world);
      maxImpact = Math.max(maxImpact, car.lastImpact);
      for (const c of car.corners()) expect(world.buildingAt(c)).toBe(-1);
    }
    expect(maxImpact).toBeGreaterThan(15);
    expect(car.pos.x).toBeLessThan(100);
  });

  it('brakes, then reverses', () => {
    const world = new World(testMap());
    const car = new Car({ x: 0, y: 0 }, 0);
    car.vel = { x: 10, y: 0 };
    for (let i = 0; i < 120 * 3; i++) car.step(1 / 120, { throttle: -1, steer: 0, handbrake: false }, world);
    expect(car.forwardSpeed).toBeLessThan(-2);
  });

  it('is slower off-road', () => {
    const world = new World(testMap());
    const onRoad = new Car({ x: -150, y: 0 }, 0);
    const offRoad = new Car({ x: -150, y: 150 }, 0);
    for (let i = 0; i < 120 * 4; i++) {
      onRoad.step(1 / 120, { throttle: 1, steer: 0, handbrake: false }, world);
      offRoad.step(1 / 120, { throttle: 1, steer: 0, handbrake: false }, world);
    }
    expect(offRoad.surface).toBe('offroad');
    expect(offRoad.speed).toBeLessThan(onRoad.speed);
  });

  it('pushes a pedestrian out of its body', () => {
    const car = new Car({ x: 0, y: 0 }, 0);
    const p = { x: 0.5, y: 0.3 };
    expect(car.pushOutCircle(p, 0.35)).toBe(true);
    expect(Math.abs(p.y)).toBeGreaterThanOrEqual(1.35 - 1e-6);
    const q = { x: 0, y: 1.2 };
    expect(car.pushOutCircle(q, 0.35)).toBe(true);
    expect(q.y).toBeCloseTo(1.35, 6);
    expect(car.pushOutCircle({ x: 5, y: 5 }, 0.35)).toBe(false);
  });
});

describe('Pedestrian', () => {
  it('walks, runs faster, and stops at walls', () => {
    const world = new World(testMap());
    const walker = new Pedestrian({ x: 0, y: 0 });
    for (let i = 0; i < 120; i++) walker.step(1 / 120, { dir: { x: 1, y: 0 }, run: false }, world);
    const walked = walker.pos.x;
    const runner = new Pedestrian({ x: 0, y: 0 });
    for (let i = 0; i < 120; i++) runner.step(1 / 120, { dir: { x: 1, y: 0 }, run: true }, world);
    expect(runner.pos.x).toBeGreaterThan(walked);

    for (let i = 0; i < 120 * 5; i++) walker.step(1 / 120, { dir: { x: 0, y: -1 }, run: true }, world);
    expect(walker.pos.y).toBeCloseTo(-7 + 0.35, 3);
  });
});
