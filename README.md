# free-gta

A GTA 1/2-style top-down game that plays in real cities. Type a place name, and the streets,
buildings, parks and water around it are downloaded live from OpenStreetMap and turned into a
drivable map.

## Run it

```sh
npm install
npm run dev      # http://localhost:5173
npm test         # unit tests
npm run build    # static build in dist/
```

London is the default. Links like `?city=Shibuya%20Station,%20Tokyo&size=800` start straight away,
and `lat,lon` works in the search box too.

## Controls

| Key | On foot | In the car |
| --- | --- | --- |
| WASD / arrows | walk | throttle, brake / reverse, steer |
| Shift | run | |
| Space | | handbrake (slides) |
| F, E or Enter | get in when close | get out (when slow) |
| Esc | pick another city | pick another city |

## How it works

- **Data**: the place is geocoded with Nominatim, then one Overpass query fetches roads, buildings
  (including multipolygon buildings), water, parks and other land use in a square around it.
  Several public Overpass servers are tried in turn. No Google or Apple data is used, so the map
  content is ODbL and the attribution stays on screen.
- **Projection** (`src/osm/projection.ts`): a local equirectangular projection turns lat/lon into
  metres around the chosen point (x east, y south). Everything in the game is in metres.
- **World** (`src/world/World.ts`): building outlines become solid walls in a spatial hash grid.
  Roads get widths from their OSM class, `lanes` and `width` tags, and define the surface: full grip
  on roads, rougher on footpaths, slow and slippery off-road. The edge of the loaded area is a wall.
- **Physics** (`src/game`): an arcade bicycle-model car with lateral grip, handbrake slides and
  bounces off walls (three collision circles along the body), and a walker that is blocked by
  buildings and the car. Runs at a fixed 120 Hz step.
- **Rendering** (`src/render`): the static city is painted with Canvas 2D into 128 m chunk textures
  that are created around the camera and dropped when far away. Phaser 3 handles sprites, the
  camera (look-ahead and speed-based zoom) and input. The minimap is a pre-rendered overview.

## Next ideas

Traffic and pedestrians on the road graph, missions, 3D-ish building walls like GTA 2, tunnels and
bridges as separate levels, water you can't drive into, touch controls, and caching downloaded
cities.
