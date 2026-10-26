import type { ShipId } from './sim/types';

export interface Settings {
  music: number;
  sfx: number;
  shake: number;
  quality: 'high' | 'medium' | 'low';
  autoFire: boolean;
  damageNumbers: boolean;
  showFps: boolean;
}

export interface Meta {
  unlocked: ShipId[];
  best: number;
  bestSector: number;
  runs: number;
  wins: number;
  kills: number;
  achievements: string[];
  settings: Settings;
}

const KEY = 'peregruzka.meta.v1';

export const defaultMeta = (): Meta => ({
  unlocked: ['vector'],
  best: 0,
  bestSector: 0,
  runs: 0,
  wins: 0,
  kills: 0,
  achievements: [],
  settings: { music: 0.7, sfx: 0.8, shake: 1, quality: 'high', autoFire: false, damageNumbers: true, showFps: false },
});

export function loadMeta(): Meta {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaultMeta();
    const m = JSON.parse(raw) as Partial<Meta>;
    const d = defaultMeta();
    return { ...d, ...m, settings: { ...d.settings, ...(m.settings ?? {}) } };
  } catch {
    return defaultMeta();
  }
}

export function saveMeta(m: Meta): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(m));
  } catch {
    // storage may be unavailable (private mode); progress just won't persist
  }
}
