import type { EnemyType, ShipId, Stats } from './types';

export const TICK = 1 / 60;
/** Arena half-extents on X and Z. */
export const AW = 24;
export const AH = 15;

export const SECTORS = 3;
export const WAVES_PER_SECTOR = 5; // the 6th wave of a sector is its boss

export interface ShipDef {
  id: ShipId;
  name: string;
  desc: string;
  color: number;
  stats: Stats;
  unlock: string;
}

const base: Stats = {
  maxHp: 6,
  speed: 9,
  fireRate: 8,
  damage: 4,
  bulletSpeed: 34,
  multishot: 0,
  spread: 0.12,
  pierce: 0,
  bounces: 0,
  homing: 0,
  chain: 0,
  explosive: 0,
  crit: 0.05,
  drones: 0,
  missiles: 0,
  shieldMax: 0,
  shieldRegen: 0,
  dashCharges: 1,
  dashBlade: 0,
  magnet: 3.5,
  empPower: 1,
  vampire: 0,
  focus: false,
};

export const SHIPS: Record<ShipId, ShipDef> = {
  vector: {
    id: 'vector',
    name: 'ВЕКТОР',
    desc: 'Сбалансированный перехватчик. Ровный темп огня, один рывок.',
    color: 0x22e6ff,
    stats: { ...base },
    unlock: 'Доступен сразу',
  },
  impulse: {
    id: 'impulse',
    name: 'ИМПУЛЬС',
    desc: 'Хрупкий и быстрый. Скорострельность, два рывка, рывок режет врагов.',
    color: 0xff3df2,
    stats: { ...base, maxHp: 4, speed: 11, fireRate: 11, damage: 3, dashCharges: 2, dashBlade: 15 },
    unlock: 'Победите босса сектора 1',
  },
  bastion: {
    id: 'bastion',
    name: 'БАСТИОН',
    desc: 'Тяжёлый штурмовик. Дробовой залп, щит, много брони, но медленный.',
    color: 0xffb020,
    stats: { ...base, maxHp: 9, speed: 7.5, fireRate: 3.6, damage: 5, multishot: 4, spread: 0.55, shieldMax: 1, shieldRegen: 10 },
    unlock: 'Победите босса сектора 2',
  },
};

export interface EnemyDef {
  name: string;
  hp: number;
  r: number;
  speed: number;
  contact: number;
  score: number;
  color: number;
  /** Data dropped on death (feeds the EMP and score). */
  data: number;
}

export const ENEMIES: Record<EnemyType, EnemyDef> = {
  swarmer: { name: 'Бит', hp: 3, r: 0.38, speed: 7, contact: 1, score: 10, color: 0xff2a6d, data: 1 },
  charger: { name: 'Таран', hp: 16, r: 0.75, speed: 3.6, contact: 2, score: 40, color: 0xff7a1a, data: 3 },
  sniper: { name: 'Прицел', hp: 10, r: 0.55, speed: 4.5, contact: 1, score: 50, color: 0xffe14d, data: 3 },
  hive: { name: 'Улей', hp: 70, r: 1.25, speed: 1.2, contact: 1, score: 120, color: 0xb04dff, data: 8 },
  shielder: { name: 'Эгида', hp: 34, r: 0.85, speed: 2.6, contact: 1, score: 70, color: 0x4dff9a, data: 5 },
  splitter: { name: 'Делитель', hp: 22, r: 0.95, speed: 3.4, contact: 1, score: 30, color: 0x3d8bff, data: 2 },
  mine: { name: 'Мина', hp: 6, r: 0.5, speed: 2.4, contact: 0, score: 25, color: 0xff3030, data: 2 },
  hydraHead: { name: 'ГИДРА', hp: 750, r: 1.3, speed: 6, contact: 2, score: 2000, color: 0xff2a6d, data: 30 },
  hydraSeg: { name: 'Сегмент Гидры', hp: 100, r: 0.9, speed: 6, contact: 1, score: 60, color: 0xff5a8a, data: 2 },
  core: { name: 'ЯДРО', hp: 2400, r: 2.4, speed: 1.5, contact: 2, score: 4000, color: 0xffb020, data: 40 },
  zeroday: { name: 'НУЛЕВОЙ ДЕНЬ', hp: 3600, r: 1.8, speed: 5, contact: 2, score: 8000, color: 0xffffff, data: 60 },
};

export const SECTOR_INFO = [
  { name: 'ПЕРИМЕТР', sub: 'Внешний шлюз сети', hue: 0.55, boss: 'hydraHead' as EnemyType },
  { name: 'МАГИСТРАЛЬ', sub: 'Транспортный узел данных', hue: 0.08, boss: 'core' as EnemyType },
  { name: 'КОРЕНЬ', sub: 'Ядро системы', hue: 0.85, boss: 'zeroday' as EnemyType },
];
