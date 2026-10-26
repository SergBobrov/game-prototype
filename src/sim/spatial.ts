/** Uniform grid for broad-phase queries. Rebuilt every tick; cheap for a few hundred bodies. */
export class SpatialHash<T extends { x: number; z: number }> {
  private cells = new Map<number, T[]>();

  constructor(private size: number) {}

  private key(cx: number, cz: number): number {
    return (cx + 512) * 1024 + (cz + 512);
  }

  clear(): void {
    this.cells.clear();
  }

  insert(item: T): void {
    const k = this.key(Math.floor(item.x / this.size), Math.floor(item.z / this.size));
    let cell = this.cells.get(k);
    if (!cell) this.cells.set(k, (cell = []));
    cell.push(item);
  }

  /** Calls fn for every item in cells overlapping the circle. fn may return true to stop early. */
  query(x: number, z: number, r: number, fn: (item: T) => boolean | void): void {
    const x0 = Math.floor((x - r) / this.size);
    const x1 = Math.floor((x + r) / this.size);
    const z0 = Math.floor((z - r) / this.size);
    const z1 = Math.floor((z + r) / this.size);
    for (let cx = x0; cx <= x1; cx++)
      for (let cz = z0; cz <= z1; cz++) {
        const cell = this.cells.get(this.key(cx, cz));
        if (!cell) continue;
        for (const it of cell) if (fn(it)) return;
      }
  }
}
