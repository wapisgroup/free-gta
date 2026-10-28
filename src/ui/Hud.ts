/** DOM overlay: location, speed, prompts and the minimap canvas. */
export class Hud {
  readonly root: HTMLElement;
  readonly minimap: HTMLCanvasElement;
  private readonly street: HTMLElement;
  private readonly speed: HTMLElement;
  private readonly hint: HTMLElement;
  private last = { street: '', speed: '', hint: '' };

  constructor(parent: HTMLElement, city: string) {
    this.root = document.createElement('div');
    this.root.className = 'hud';
    this.root.innerHTML = `
      <div class="hud-place"><div class="hud-city"></div><div class="hud-street"></div></div>
      <canvas class="hud-minimap" width="200" height="200"></canvas>
      <div class="hud-speed"></div>
      <div class="hud-hint"></div>
      <div class="hud-keys">WASD / arrows: move · Space: handbrake · Shift: run · F: enter / exit car · Esc: change city</div>`;
    parent.appendChild(this.root);
    this.root.querySelector<HTMLElement>('.hud-city')!.textContent = city;
    this.street = this.root.querySelector('.hud-street')!;
    this.speed = this.root.querySelector('.hud-speed')!;
    this.hint = this.root.querySelector('.hud-hint')!;
    this.minimap = this.root.querySelector('.hud-minimap')!;
  }

  update(street: string | undefined, kmh: number | null, hint: string): void {
    const s = street ?? '';
    const v = kmh === null ? '' : `${Math.round(kmh)} km/h`;
    if (s !== this.last.street) this.street.textContent = s;
    if (v !== this.last.speed) this.speed.textContent = v;
    if (hint !== this.last.hint) {
      this.hint.textContent = hint;
      this.hint.classList.toggle('visible', hint !== '');
    }
    this.last = { street: s, speed: v, hint };
  }

  destroy(): void {
    this.root.remove();
  }
}
