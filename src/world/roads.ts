import type { RoadClass } from './types';

interface RoadSpec {
  cls: RoadClass;
  width: number;
  drivable: boolean;
}

const SPECS: Record<string, RoadSpec> = {
  motorway: { cls: 'motorway', width: 15, drivable: true },
  motorway_link: { cls: 'motorway', width: 7, drivable: true },
  trunk: { cls: 'trunk', width: 13, drivable: true },
  trunk_link: { cls: 'trunk', width: 7, drivable: true },
  primary: { cls: 'primary', width: 12, drivable: true },
  primary_link: { cls: 'primary', width: 7, drivable: true },
  secondary: { cls: 'secondary', width: 10.5, drivable: true },
  secondary_link: { cls: 'secondary', width: 6.5, drivable: true },
  tertiary: { cls: 'tertiary', width: 9, drivable: true },
  tertiary_link: { cls: 'tertiary', width: 6, drivable: true },
  unclassified: { cls: 'residential', width: 7, drivable: true },
  residential: { cls: 'residential', width: 7, drivable: true },
  living_street: { cls: 'residential', width: 6, drivable: true },
  road: { cls: 'residential', width: 7, drivable: true },
  busway: { cls: 'service', width: 6, drivable: true },
  service: { cls: 'service', width: 4.5, drivable: true },
  track: { cls: 'track', width: 3.5, drivable: true },
  pedestrian: { cls: 'pedestrian', width: 7, drivable: false },
  footway: { cls: 'footway', width: 2.5, drivable: false },
  path: { cls: 'footway', width: 2, drivable: false },
  cycleway: { cls: 'footway', width: 2.5, drivable: false },
  steps: { cls: 'footway', width: 2.5, drivable: false },
  bridleway: { cls: 'footway', width: 2.5, drivable: false },
};

/** Draw order: wider, more important roads on top so junctions look right. */
export const ROAD_ORDER: RoadClass[] = [
  'footway',
  'pedestrian',
  'track',
  'service',
  'residential',
  'tertiary',
  'secondary',
  'primary',
  'trunk',
  'motorway',
];

export function roadSpec(highway: string, tags: Record<string, string>): RoadSpec | null {
  const spec = SPECS[highway];
  if (!spec) return null;
  let width = spec.width;
  const lanes = Number.parseInt(tags.lanes ?? '', 10);
  if (spec.drivable && lanes > 0 && lanes < 12) width = Math.max(width, lanes * 3.3);
  const explicit = Number.parseFloat(tags.width ?? '');
  if (explicit > 1 && explicit < 40) width = explicit;
  return { ...spec, width };
}
