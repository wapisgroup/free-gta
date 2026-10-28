import type { Bounds } from '../math';

/** Uniform hash grid mapping cells to item indices. Items may span several cells. */
export class SpatialGrid {
  private readonly cells = new Map<number, number[]>();
  private stamp = 0;
  private seen: Uint32Array = new Uint32Array(0);

  constructor(readonly cellSize: number) {}

  private key(cx: number, cy: number): number {
    return (cx + 32768) * 65536 + (cy + 32768);
  }

  insert(index: number, b: Bounds): void {
    const s = this.cellSize;
    for (let cx = Math.floor(b.minX / s); cx <= Math.floor(b.maxX / s); cx++) {
      for (let cy = Math.floor(b.minY / s); cy <= Math.floor(b.maxY / s); cy++) {
        const k = this.key(cx, cy);
        let cell = this.cells.get(k);
        if (!cell) this.cells.set(k, (cell = []));
        cell.push(index);
      }
    }
    if (index >= this.seen.length) {
      const grown = new Uint32Array(Math.max(index + 1, this.seen.length * 2, 64));
      grown.set(this.seen);
      this.seen = grown;
    }
  }

  /** Calls fn once per item whose cells overlap the bounds. */
  query(b: Bounds, fn: (index: number) => void): void {
    const s = this.cellSize;
    const stamp = ++this.stamp;
    for (let cx = Math.floor(b.minX / s); cx <= Math.floor(b.maxX / s); cx++) {
      for (let cy = Math.floor(b.minY / s); cy <= Math.floor(b.maxY / s); cy++) {
        const cell = this.cells.get(this.key(cx, cy));
        if (!cell) continue;
        for (const i of cell) {
          if (this.seen[i] === stamp) continue;
          this.seen[i] = stamp;
          fn(i);
        }
      }
    }
  }
}
