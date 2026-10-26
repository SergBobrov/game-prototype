import { Rng } from './rng';
import type { EnemyType } from './types';

export type Pattern = 'ring' | 'edge' | 'cluster';

export interface SpawnGroup {
  /** Seconds after wave start (groups may come earlier if the arena empties). */
  at: number;
  type: EnemyType;
  count: number;
  pattern: Pattern;
  elite: boolean;
}

interface Option {
  type: EnemyType;
  cost: number;
  min: number;
  max: number;
  pattern: Pattern[];
  /** First global wave index (sector * 5 + wave) where it can appear. */
  from: number;
}

const OPTIONS: Option[] = [
  { type: 'swarmer', cost: 1.2, min: 10, max: 26, pattern: ['ring', 'edge', 'cluster'], from: 0 },
  { type: 'charger', cost: 7, min: 1, max: 3, pattern: ['edge', 'cluster'], from: 1 },
  { type: 'splitter', cost: 9, min: 1, max: 3, pattern: ['cluster', 'edge'], from: 2 },
  { type: 'mine', cost: 3.5, min: 3, max: 6, pattern: ['ring', 'cluster'], from: 3 },
  { type: 'sniper', cost: 9, min: 1, max: 3, pattern: ['edge'], from: 4 },
  { type: 'shielder', cost: 13, min: 1, max: 2, pattern: ['edge', 'cluster'], from: 5 },
  { type: 'hive', cost: 22, min: 1, max: 1, pattern: ['edge'], from: 7 },
];

/** Build the spawn schedule for a regular wave. */
export function buildWave(rng: Rng, sector: number, wave: number): SpawnGroup[] {
  const g = sector * 5 + wave;
  let budget = 70 + wave * 22 + sector * 45;
  const avail = OPTIONS.filter((o) => o.from <= g);
  const eliteChance = sector === 0 ? (wave >= 3 ? 0.08 : 0) : sector === 1 ? 0.15 : 0.25;
  const groups: SpawnGroup[] = [];
  let t = 0.6;
  // The newest enemy type is guaranteed in the wave that introduces it, so every type gets shown.
  const newest = avail.find((o) => o.from === g);
  while (budget > 0) {
    const o = newest && !groups.some((gr) => gr.type === newest.type) ? newest : rng.pick(avail);
    let count = rng.int(o.min, o.max);
    count = Math.max(o.min, Math.min(count, Math.floor(budget / o.cost)));
    if (count < o.min) {
      if (budget < 4) break;
      count = o.min;
    }
    const elite = o.type !== 'swarmer' && rng.chance(eliteChance);
    groups.push({ at: t, type: o.type, count, pattern: rng.pick(o.pattern), elite });
    budget -= count * o.cost * (elite ? 2.2 : 1);
    t += rng.int(35, 60) / 10;
  }
  return groups;
}
