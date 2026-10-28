import { describe, expect, it } from 'vitest';
import { assembleRings, parseOverpass } from '../src/osm/parse';
import { buildQuery, parseCoordinates } from '../src/osm/overpass';
import { LocalProjection } from '../src/osm/projection';

describe('LocalProjection', () => {
  const proj = new LocalProjection({ lat: 50.087, lon: 14.421 });

  it('maps the origin to zero and round-trips', () => {
    expect(proj.toLocal(50.087, 14.421)).toEqual({ x: 0, y: -0 });
    const p = proj.toLocal(50.09, 14.43);
    const back = proj.toLatLon(p);
    expect(back.lat).toBeCloseTo(50.09, 9);
    expect(back.lon).toBeCloseTo(14.43, 9);
  });

  it('uses metres with x east and y south', () => {
    const north = proj.toLocal(50.087 + 0.009, 14.421);
    expect(north.y).toBeCloseTo(-1001.9, 0);
    const east = proj.toLocal(50.087, 14.421 + 0.01);
    // A degree of longitude shrinks with cos(latitude).
    expect(east.x).toBeCloseTo(714.6, 0);
  });

  it('builds a square bbox of the requested radius', () => {
    const b = proj.bbox(500);
    expect(proj.toLocal(b.north, b.east).x).toBeCloseTo(500, 6);
    expect(proj.toLocal(b.south, b.west).y).toBeCloseTo(500, 6);
  });
});

describe('overpass helpers', () => {
  it('parses coordinates typed into the search box', () => {
    expect(parseCoordinates('50.087, 14.421')).toEqual({ lat: 50.087, lon: 14.421 });
    expect(parseCoordinates('-33.86 151.21')).toEqual({ lat: -33.86, lon: 151.21 });
    expect(parseCoordinates('Prague')).toBeNull();
    expect(parseCoordinates('95, 10')).toBeNull();
  });

  it('puts the bbox in the query', () => {
    expect(buildQuery({ south: 1, west: 2, north: 3, east: 4 })).toContain('[bbox:1,2,3,4]');
  });
});

describe('parseOverpass', () => {
  const sq = (lat: number, lon: number, d = 0.0001) => [
    { lat, lon },
    { lat, lon: lon + d },
    { lat: lat + d, lon: lon + d },
    { lat: lat + d, lon },
    { lat, lon },
  ];

  it('turns ways into roads, buildings and areas in local metres', () => {
    const map = parseOverpass(
      {
        elements: [
          {
            type: 'way',
            id: 1,
            tags: { highway: 'primary', name: 'Main', lanes: '4' },
            geometry: [
              { lat: 50, lon: 14 },
              { lat: 50, lon: 14.001 },
            ],
          },
          { type: 'way', id: 2, tags: { highway: 'footway' }, geometry: [{ lat: 50, lon: 14 }, { lat: 50.001, lon: 14 }] },
          { type: 'way', id: 3, tags: { building: 'yes', 'building:levels': '6' }, geometry: sq(50.0005, 14.0005) },
          { type: 'way', id: 4, tags: { building: 'roof' }, geometry: sq(50.0008, 14.0008) },
          { type: 'way', id: 5, tags: { leisure: 'park' }, geometry: sq(49.999, 13.999, 0.0005) },
          { type: 'way', id: 6, tags: { highway: 'proposed' }, geometry: [{ lat: 50, lon: 14 }, { lat: 50.001, lon: 14 }] },
        ],
      },
      'Test',
      { lat: 50, lon: 14 },
      500,
    );
    expect(map.roads).toHaveLength(2);
    const main = map.roads[0];
    expect(main).toMatchObject({ cls: 'primary', name: 'Main', drivable: true, width: 13.2 });
    expect(main.points[1].x).toBeCloseTo(71.6, 0);
    expect(map.roads[1].drivable).toBe(false);
    expect(map.buildings).toHaveLength(1);
    expect(map.buildings[0].levels).toBe(6);
    // Closing point is dropped.
    expect(map.buildings[0].ring).toHaveLength(4);
    expect(map.areas.map((a) => a.kind)).toEqual(['park']);
  });

  it('assembles multipolygon buildings from split outer ways', () => {
    const map = parseOverpass(
      {
        elements: [
          {
            type: 'relation',
            id: 9,
            tags: { type: 'multipolygon', building: 'yes' },
            members: [
              { type: 'way', ref: 1, role: 'outer', geometry: [{ lat: 0, lon: 0 }, { lat: 0, lon: 0.001 }, { lat: 0.001, lon: 0.001 }] },
              // Second half is stored reversed.
              { type: 'way', ref: 2, role: 'outer', geometry: [{ lat: 0, lon: 0 }, { lat: 0.001, lon: 0 }, { lat: 0.001, lon: 0.001 }] },
              { type: 'way', ref: 3, role: 'inner', geometry: [{ lat: 0.0004, lon: 0.0004 }, { lat: 0.0005, lon: 0.0004 }] },
            ],
          },
        ],
      },
      'Test',
      { lat: 0, lon: 0 },
      500,
    );
    expect(map.buildings).toHaveLength(1);
    expect(map.buildings[0].ring).toHaveLength(4);
  });

  it('drops rings that cannot be closed', () => {
    expect(assembleRings([[{ lat: 0, lon: 0 }, { lat: 1, lon: 0 }, { lat: 1, lon: 1 }]])).toEqual([]);
  });
});
