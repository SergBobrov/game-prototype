import type { Meta } from './meta';
import type { SimEvent } from './sim/types';
import type { World } from './sim/world';

export interface Achievement {
  id: string;
  name: string;
  desc: string;
}

export const ACHIEVEMENTS: readonly Achievement[] = [
  { id: 'first', name: 'Первый пакет', desc: 'Уничтожить первый вирус' },
  { id: 'hydra', name: 'Периметр удержан', desc: 'Победить Гидру' },
  { id: 'core', name: 'Перегрев ядра', desc: 'Победить Ядро' },
  { id: 'win', name: 'Нулевой день устранён', desc: 'Пройти игру' },
  { id: 'combo50', name: 'Цепная реакция', desc: 'Комбо 50' },
  { id: 'combo150', name: 'ПЕРЕГРУЗКА', desc: 'Комбо 150' },
  { id: 'kills1000', name: 'Антивирус', desc: '1000 уничтожений за забег' },
  { id: 'flawless', name: 'Без царапины', desc: 'Пройти волну 5 сектора, не получив урона за сектор' },
  { id: 'emp10', name: 'Электрошторм', desc: '10 ЭМИ-волн за забег' },
  { id: 'arsenal', name: 'Арсенал', desc: '12 модулей за один забег' },
  { id: 'fleet', name: 'Флот', desc: 'Открыть все корабли' },
  { id: 'score', name: 'Шестизначный', desc: 'Набрать 250 000 очков' },
];

/** Watches a run and unlocks achievements. Returns newly unlocked ones so the UI can toast them. */
export class AchievementTracker {
  private emps = 0;
  private hitThisSector = false;

  reset(): void {
    this.emps = 0;
    this.hitThisSector = false;
  }

  check(meta: Meta, w: World, events: SimEvent[]): Achievement[] {
    const got: string[] = [];
    const give = (id: string) => {
      if (!meta.achievements.includes(id) && !got.includes(id)) got.push(id);
    };
    for (const ev of events) {
      if (ev.t === 'kill') give('first');
      if (ev.t === 'bossDeath') give(ev.type === 'hydraHead' ? 'hydra' : ev.type === 'core' ? 'core' : 'win');
      if (ev.t === 'emp' && ++this.emps >= 10) give('emp10');
      if (ev.t === 'playerHit' && !ev.shield) this.hitThisSector = true;
      if (ev.t === 'waveStart' && ev.wave === 0) this.hitThisSector = false;
      if (ev.t === 'waveClear' && ev.wave === 4 && !this.hitThisSector) give('flawless');
    }
    if (w.combo >= 50) give('combo50');
    if (w.combo >= 150) give('combo150');
    if (w.run.kills >= 1000) give('kills1000');
    if (w.run.score >= 250000) give('score');
    if (Object.values(w.owned).reduce((a, b) => a + b, 0) >= 12) give('arsenal');
    if (meta.unlocked.length >= 3) give('fleet');
    meta.achievements.push(...got);
    return ACHIEVEMENTS.filter((a) => got.includes(a.id));
  }
}
