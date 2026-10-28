import type { AreaKind, RoadClass } from '../world/types';

export const GROUND = '#77766c';
export const SIDEWALK = '#a9a59a';
export const CURB = '#8a867c';
export const ASPHALT: Record<RoadClass, string> = {
  motorway: '#38383c',
  trunk: '#3a3a3e',
  primary: '#3c3c40',
  secondary: '#3f3f43',
  tertiary: '#424246',
  residential: '#454549',
  service: '#4a4a4d',
  track: '#7d6a4f',
  pedestrian: '#b3ad9f',
  footway: '#bdb6a5',
};
export const LANE_WHITE = 'rgba(235, 235, 225, 0.85)';
export const LANE_YELLOW = 'rgba(230, 190, 60, 0.9)';

export const AREA: Record<AreaKind, string> = {
  water: '#2e5d86',
  park: '#5b8a3e',
  forest: '#3f6b31',
  grass: '#6b8f45',
  pitch: '#4e9450',
  plaza: '#b0aa9b',
  parking: '#5a5a5e',
  cemetery: '#5e7b4f',
};

/** Draw order for areas, bottom first. */
export const AREA_ORDER: AreaKind[] = ['grass', 'cemetery', 'forest', 'park', 'pitch', 'parking', 'plaza', 'water'];

const ROOFS = ['#8c8478', '#9a8f80', '#7f7a74', '#a08a72', '#8a8f92', '#b09a7c', '#776f68', '#93857a', '#9c968c'];

export function roofColor(id: number): string {
  return ROOFS[Math.abs(id * 2654435761) % ROOFS.length];
}
