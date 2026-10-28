import type { Vec2 } from '../math';
import type { LatLon } from '../osm/projection';

export type RoadClass =
  | 'motorway'
  | 'trunk'
  | 'primary'
  | 'secondary'
  | 'tertiary'
  | 'residential'
  | 'service'
  | 'track'
  | 'pedestrian'
  | 'footway';

export interface Road {
  id: number;
  cls: RoadClass;
  /** Total paved width in metres. */
  width: number;
  points: Vec2[];
  name?: string;
  oneway: boolean;
  bridge: boolean;
  tunnel: boolean;
  /** Cars can drive here at full grip. Footways are walkable but count as rough ground for cars. */
  drivable: boolean;
}

export interface Building {
  id: number;
  /** Closed ring, counter-clockwise in screen space, first point not repeated. */
  ring: Vec2[];
  levels: number;
}

export type AreaKind = 'water' | 'park' | 'forest' | 'grass' | 'pitch' | 'plaza' | 'parking' | 'cemetery';

export interface Area {
  id: number;
  kind: AreaKind;
  ring: Vec2[];
}

export interface MapData {
  name: string;
  center: LatLon;
  /** Half-size of the loaded square, in metres. */
  radius: number;
  roads: Road[];
  buildings: Building[];
  areas: Area[];
}
