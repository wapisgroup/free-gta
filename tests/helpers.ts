import type { MapData, Road } from '../src/world/types';

export function road(id: number, points: [number, number][], extra: Partial<Road> = {}): Road {
  return {
    id,
    cls: 'residential',
    width: 8,
    points: points.map(([x, y]) => ({ x, y })),
    oneway: false,
    bridge: false,
    tunnel: false,
    drivable: true,
    ...extra,
  };
}

/** A straight east-west street along y=0 with a block of buildings on each side and one across its far end. */
export function testMap(): MapData {
  const box = (id: number, x0: number, y0: number, x1: number, y1: number) => ({
    id,
    levels: 3,
    ring: [
      { x: x0, y: y0 },
      { x: x1, y: y0 },
      { x: x1, y: y1 },
      { x: x0, y: y1 },
    ],
  });
  return {
    name: 'Testville',
    center: { lat: 50, lon: 14 },
    radius: 300,
    roads: [road(1, [[-200, 0], [100, 0]], { name: 'Main Street' }), road(2, [[-50, 0], [-50, 100]], { cls: 'footway', width: 2.5, drivable: false })],
    buildings: [box(10, -150, -40, 80, -7), box(11, -150, 7, -60, 40), box(12, 100, -30, 130, 30)],
    areas: [],
  };
}
