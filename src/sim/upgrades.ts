import { Rng } from './rng';
import type { Stats } from './types';

export type Rarity = 'common' | 'rare' | 'epic';

export interface UpgradeDef {
  id: string;
  name: string;
  desc: string;
  icon: string;
  rarity: Rarity;
  max: number;
  /** Synergy tags shown on the card. */
  tags: string[];
  apply(s: Stats): void;
}

export const UPGRADES: readonly UpgradeDef[] = [
  { id: 'rate', name: 'Разгон', desc: 'Скорострельность +22%', icon: '»', rarity: 'common', max: 5, tags: ['огонь'], apply: (s) => void (s.fireRate *= 1.22) },
  { id: 'dmg', name: 'Калибр', desc: 'Урон пуль +25%', icon: '◆', rarity: 'common', max: 5, tags: ['огонь'], apply: (s) => void (s.damage *= 1.25) },
  { id: 'fan', name: 'Веер', desc: '+2 пули в залпе, шире разброс', icon: '⋔', rarity: 'rare', max: 3, tags: ['огонь', 'залп'], apply: (s) => { s.multishot += 2; s.spread += 0.12; } },
  { id: 'pierce', name: 'Пробой', desc: 'Пули проходят сквозь +1 врага', icon: '➤', rarity: 'common', max: 3, tags: ['пуля'], apply: (s) => void (s.pierce += 1) },
  { id: 'bounce', name: 'Рикошет', desc: 'Пули отскакивают от стен +2 раза', icon: '↯', rarity: 'common', max: 2, tags: ['пуля'], apply: (s) => void (s.bounces += 2) },
  { id: 'homing', name: 'Наведение', desc: 'Пули доворачивают к ближайшей цели', icon: '◎', rarity: 'rare', max: 2, tags: ['пуля'], apply: (s) => void (s.homing += 4) },
  { id: 'chain', name: 'Цепная молния', desc: '18% шанс: разряд перескакивает на 3 врагов', icon: 'ϟ', rarity: 'rare', max: 3, tags: ['молния', 'крит'], apply: (s) => void (s.chain += 0.18) },
  { id: 'boom', name: 'Разрывные', desc: 'Пули взрываются при попадании', icon: '✸', rarity: 'rare', max: 3, tags: ['взрыв', 'залп'], apply: (s) => void (s.explosive = s.explosive ? s.explosive + 0.6 : 1.6) },
  { id: 'drone', name: 'Дрон-спутник', desc: 'Орбитальный дрон стреляет вместе с вами', icon: '⊙', rarity: 'epic', max: 3, tags: ['дрон'], apply: (s) => void (s.drones += 1) },
  { id: 'missile', name: 'Ракетный модуль', desc: 'Каждые 2 с — залп самонаводящихся ракет', icon: '⇡', rarity: 'epic', max: 3, tags: ['взрыв'], apply: (s) => void (s.missiles += 2) },
  { id: 'crit', name: 'Уязвимость', desc: 'Шанс крита +12% (урон ×2.5)', icon: '✦', rarity: 'common', max: 4, tags: ['крит'], apply: (s) => void (s.crit += 0.12) },
  { id: 'hp', name: 'Бронеплиты', desc: '+2 к максимуму прочности и полный ремонт', icon: '▣', rarity: 'common', max: 4, tags: ['защита'], apply: (s) => void (s.maxHp += 2) },
  { id: 'shield', name: 'Энергощит', desc: 'Щит поглощает удар, заряжается каждые 9 с', icon: '⬡', rarity: 'rare', max: 2, tags: ['защита'], apply: (s) => { s.shieldMax += 1; s.shieldRegen = s.shieldRegen ? s.shieldRegen * 0.85 : 9; } },
  { id: 'blade', name: 'Клинок рывка', desc: 'Рывок разрезает врагов на пути', icon: '⟋', rarity: 'rare', max: 3, tags: ['рывок'], apply: (s) => void (s.dashBlade = s.dashBlade ? s.dashBlade * 1.6 : 18) },
  { id: 'dash2', name: 'Двойной рывок', desc: '+1 заряд рывка', icon: '⇉', rarity: 'rare', max: 2, tags: ['рывок'], apply: (s) => void (s.dashCharges += 1) },
  { id: 'magnet', name: 'Магнит', desc: 'Радиус сбора данных +60%', icon: '∪', rarity: 'common', max: 2, tags: ['ЭМИ'], apply: (s) => void (s.magnet *= 1.6) },
  { id: 'speed', name: 'Форсаж', desc: 'Скорость +15%', icon: '⇑', rarity: 'common', max: 3, tags: ['рывок'], apply: (s) => void (s.speed *= 1.15) },
  { id: 'emp', name: 'ЭМИ-усилитель', desc: 'ЭМИ заряжается быстрее и бьёт шире', icon: '◌', rarity: 'rare', max: 3, tags: ['ЭМИ'], apply: (s) => void (s.empPower += 0.35) },
  { id: 'vamp', name: 'Регенерация', desc: 'Каждые 45 уничтожений — +1 прочности', icon: '♥', rarity: 'rare', max: 2, tags: ['защита'], apply: (s) => void (s.vampire = s.vampire ? Math.max(20, s.vampire - 15) : 45) },
  { id: 'focus', name: 'Фокус', desc: 'При 1–2 прочности время замедляется', icon: '⧗', rarity: 'epic', max: 1, tags: ['защита'], apply: (s) => void (s.focus = true) },
];

export const UPGRADE_BY_ID: Record<string, UpgradeDef> = Object.fromEntries(UPGRADES.map((u) => [u.id, u]));

const WEIGHT: Record<Rarity, number> = { common: 10, rare: 6, epic: 2.5 };

/** Offer `n` distinct upgrades that are not maxed. Boss rewards skew rarer. */
export function rollUpgrades(rng: Rng, owned: Record<string, number>, n: number, bossReward: boolean): UpgradeDef[] {
  const pool = UPGRADES.filter((u) => (owned[u.id] ?? 0) < u.max);
  const res: UpgradeDef[] = [];
  while (res.length < n && pool.length) {
    const weights = pool.map((u) => WEIGHT[u.rarity] * (bossReward && u.rarity !== 'common' ? 3 : 1));
    const total = weights.reduce((a, b) => a + b, 0);
    let roll = rng.next() * total;
    let i = 0;
    while (roll > weights[i]) roll -= weights[i++];
    res.push(pool[i]);
    pool.splice(i, 1);
  }
  return res;
}
