import Phaser from 'phaser';
import { GameScene } from './game/GameScene';
import { geocode, loadCity } from './osm/overpass';
import { Hud } from './ui/Hud';
import { World } from './world/World';

const menu = document.querySelector<HTMLFormElement>('#menu')!;
const input = document.querySelector<HTMLInputElement>('#city')!;
const sizeSelect = document.querySelector<HTMLSelectElement>('#size')!;
const status = document.querySelector<HTMLElement>('#status')!;
const playButton = menu.querySelector<HTMLButtonElement>('button[type=submit]')!;
const gameRoot = document.querySelector<HTMLElement>('#game')!;

let game: Phaser.Game | null = null;
let hud: Hud | null = null;
let pending: AbortController | null = null;

function setStatus(msg: string, error = false): void {
  status.textContent = msg;
  status.classList.toggle('error', error);
}

async function play(query: string, radius: number): Promise<void> {
  query = query.trim();
  if (!query) {
    input.focus();
    return;
  }
  pending?.abort();
  const ctrl = (pending = new AbortController());
  playButton.disabled = true;
  try {
    setStatus(`Finding ${query}…`);
    const place = await geocode(query, ctrl.signal);
    const map = await loadCity(place, radius, setStatus, ctrl.signal);
    if (!map.roads.length && !map.buildings.length) throw new Error(`No streets or buildings found around ${place.name}`);
    setStatus('');
    const params = new URLSearchParams({ city: query, size: String(radius) });
    history.replaceState(null, '', `?${params}`);
    start(new World(map));
  } catch (err) {
    if (ctrl.signal.aborted) return;
    console.error(err);
    setStatus(err instanceof Error ? err.message : String(err), true);
  } finally {
    playButton.disabled = false;
  }
}

function start(world: World): void {
  stop();
  menu.hidden = true;
  hud = new Hud(document.body, world.map.name);
  game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: gameRoot,
    backgroundColor: '#1b1c1a',
    scale: { mode: Phaser.Scale.RESIZE, width: window.innerWidth, height: window.innerHeight },
    render: { antialias: true, roundPixels: false },
    fps: { target: 60 },
  });
  game.scene.add('game', GameScene, true, { world, hud, onQuit: quit });
  game.canvas?.focus();
}

function stop(): void {
  game?.destroy(true);
  game = null;
  hud?.destroy();
  hud = null;
}

function quit(): void {
  // Destroy after the current frame finishes.
  setTimeout(() => {
    stop();
    menu.hidden = false;
    input.focus();
    input.select();
  });
}

menu.addEventListener('submit', (e) => {
  e.preventDefault();
  void play(input.value, Number(sizeSelect.value));
});

menu.querySelectorAll<HTMLButtonElement>('.presets button').forEach((btn) => {
  btn.addEventListener('click', () => {
    input.value = btn.dataset.city!;
    void play(input.value, Number(sizeSelect.value));
  });
});

// Deep links: ?city=Prague&size=800 starts straight away.
const params = new URLSearchParams(location.search);
const initialCity = params.get('city');
if (params.get('size')) sizeSelect.value = params.get('size')!;
if (initialCity) {
  input.value = initialCity;
  void play(initialCity, Number(sizeSelect.value) || 800);
}
