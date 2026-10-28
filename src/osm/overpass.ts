import type { BBox, LatLon } from './projection';
import { LocalProjection } from './projection';
import type { OverpassResponse } from './parse';
import { parseOverpass } from './parse';
import type { MapData } from '../world/types';

const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
];

const NOMINATIM = 'https://nominatim.openstreetmap.org/search';

export interface Place extends LatLon {
  name: string;
}

export function buildQuery(b: BBox): string {
  const bbox = `${b.south},${b.west},${b.north},${b.east}`;
  return `[out:json][timeout:90][bbox:${bbox}];
(
  way["highway"];
  way["building"];
  relation["building"]["type"="multipolygon"];
  way["natural"~"^(water|wood|grassland|scrub|heath)$"];
  relation["natural"="water"]["type"="multipolygon"];
  way["waterway"="riverbank"];
  way["landuse"~"^(grass|forest|meadow|recreation_ground|cemetery|village_green|reservoir|basin)$"];
  way["leisure"~"^(park|garden|pitch|playground|track|stadium)$"];
  relation["leisure"="park"]["type"="multipolygon"];
  way["amenity"~"^(parking|grave_yard)$"];
  way["place"="square"];
);
out geom qt;`;
}

/** Parse "50.087, 14.421" as coordinates so users can skip geocoding. */
export function parseCoordinates(text: string): LatLon | null {
  const m = text.trim().match(/^(-?\d+(?:\.\d+)?)\s*[,;\s]\s*(-?\d+(?:\.\d+)?)$/);
  if (!m) return null;
  const lat = Number(m[1]);
  const lon = Number(m[2]);
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return { lat, lon };
}

export async function geocode(query: string, signal?: AbortSignal): Promise<Place> {
  const coords = parseCoordinates(query);
  if (coords) return { ...coords, name: `${coords.lat.toFixed(4)}, ${coords.lon.toFixed(4)}` };

  const url = `${NOMINATIM}?format=jsonv2&limit=1&q=${encodeURIComponent(query)}`;
  const res = await fetch(url, { signal, headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`Place search failed (HTTP ${res.status})`);
  const results = (await res.json()) as { lat: string; lon: string; display_name: string; name?: string }[];
  if (!results.length) throw new Error(`Couldn't find "${query}"`);
  const r = results[0];
  return { lat: Number(r.lat), lon: Number(r.lon), name: r.name || r.display_name.split(',')[0] };
}

async function fetchOverpass(query: string, signal?: AbortSignal): Promise<OverpassResponse> {
  let lastError: unknown;
  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        body: new URLSearchParams({ data: query }),
        signal,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} from ${new URL(endpoint).host}`);
      return (await res.json()) as OverpassResponse;
    } catch (err) {
      if (signal?.aborted) throw err;
      lastError = err;
    }
  }
  throw new Error(`Map download failed: ${lastError instanceof Error ? lastError.message : String(lastError)}`);
}

export async function loadCity(
  place: Place,
  radius: number,
  onStatus: (msg: string) => void,
  signal?: AbortSignal,
): Promise<MapData> {
  const bbox = new LocalProjection(place).bbox(radius);
  onStatus(`Downloading streets and buildings around ${place.name}…`);
  const json = await fetchOverpass(buildQuery(bbox), signal);
  onStatus(`Building the city (${json.elements.length.toLocaleString()} map features)…`);
  return parseOverpass(json, place.name, place, radius);
}
