import type { Vec2 } from '../math';

export interface LatLon {
  lat: number;
  lon: number;
}

export interface BBox {
  south: number;
  west: number;
  north: number;
  east: number;
}

const EARTH_RADIUS = 6378137;
const DEG = Math.PI / 180;

/**
 * Local equirectangular projection around an origin. Accurate to well under a
 * metre over the few kilometres a game map covers. Output is in metres with
 * x pointing east and y pointing south, matching screen coordinates.
 */
export class LocalProjection {
  private readonly metersPerDegLat = EARTH_RADIUS * DEG;
  private readonly metersPerDegLon: number;

  constructor(readonly origin: LatLon) {
    this.metersPerDegLon = EARTH_RADIUS * DEG * Math.cos(origin.lat * DEG);
  }

  toLocal(lat: number, lon: number): Vec2 {
    return {
      x: (lon - this.origin.lon) * this.metersPerDegLon,
      y: -(lat - this.origin.lat) * this.metersPerDegLat,
    };
  }

  toLatLon(p: Vec2): LatLon {
    return {
      lat: this.origin.lat - p.y / this.metersPerDegLat,
      lon: this.origin.lon + p.x / this.metersPerDegLon,
    };
  }

  /** Bounding box covering a square of +/- radius metres around the origin. */
  bbox(radius: number): BBox {
    const sw = this.toLatLon({ x: -radius, y: radius });
    const ne = this.toLatLon({ x: radius, y: -radius });
    return { south: sw.lat, west: sw.lon, north: ne.lat, east: ne.lon };
  }
}
