import { ENEMIES, SECTOR_INFO, SHIPS } from './sim/config';
import type { EnemyType, ShipId } from './sim/types';
import type { UpgradeDef } from './sim/upgrades';
import type { Achievement } from './achievements';

export type Lang = 'ru' | 'en';

/** Russian is the source language: game data in sim/ keeps its Russian text, English lives here by id. */
let lang: Lang = 'ru';

export const browserLang = (): Lang => (typeof navigator !== 'undefined' && navigator.language?.toLowerCase().startsWith('ru') ? 'ru' : 'en');

export function setLang(l: Lang): void {
  lang = l;
  document.documentElement.lang = l;
  document.title = tr('ПЕРЕГРУЗКА', 'OVERLOAD');
  // The installed app takes its name from the manifest, so point the page at the manifest of the chosen language.
  document.querySelector<HTMLLinkElement>('link[rel=manifest]')?.setAttribute('href', l === 'ru' ? 'manifest.webmanifest' : 'manifest.en.webmanifest');
  document.querySelector('meta[name=apple-mobile-web-app-title]')?.setAttribute('content', tr('ПЕРЕГРУЗКА', 'OVERLOAD'));
  document
    .querySelector('meta[name=description]')
    ?.setAttribute('content', tr('Неоновый 3D-рогалик на арене внутри компьютерной сети. Сделан ИИ полностью автономно.', 'A neon 3D arena roguelike inside a computer network. Built fully autonomously by AI.'));
}

export const getLang = (): Lang => lang;

/** Pick the string for the current language. */
export const tr = (ru: string, en: string): string => (lang === 'ru' ? ru : en);

export const num = (n: number): string => n.toLocaleString(lang === 'ru' ? 'ru-RU' : 'en-US');

const SHIP_EN: Record<ShipId, { name: string; desc: string; unlock: string }> = {
  vector: { name: 'VECTOR', desc: 'Balanced interceptor. Steady fire rate, one dash.', unlock: 'Available from the start' },
  impulse: { name: 'IMPULSE', desc: 'Fragile and fast. High fire rate, two dashes, the dash cuts enemies.', unlock: 'Defeat the Sector 1 boss' },
  bastion: { name: 'BASTION', desc: 'Heavy gunship. Shotgun spread, shield, thick armor, but slow.', unlock: 'Defeat the Sector 2 boss' },
};

const ENEMY_EN: Record<EnemyType, string> = {
  swarmer: 'Bit',
  charger: 'Ram',
  sniper: 'Scope',
  hive: 'Hive',
  shielder: 'Aegis',
  splitter: 'Splitter',
  mine: 'Mine',
  hydraHead: 'HYDRA',
  hydraSeg: 'Hydra Segment',
  core: 'CORE',
  zeroday: 'ZERO DAY',
};

const SECTOR_EN = [
  { name: 'PERIMETER', sub: 'Outer network gateway' },
  { name: 'BACKBONE', sub: 'Data transit hub' },
  { name: 'ROOT', sub: 'System core' },
];

const UPGRADE_EN: Record<string, { name: string; desc: string }> = {
  rate: { name: 'Overclock', desc: 'Fire rate +22%' },
  dmg: { name: 'Caliber', desc: 'Bullet damage +25%' },
  fan: { name: 'Fan', desc: '+2 bullets per volley, wider spread' },
  pierce: { name: 'Pierce', desc: 'Bullets pass through +1 enemy' },
  bounce: { name: 'Ricochet', desc: 'Bullets bounce off walls +2 times' },
  homing: { name: 'Homing', desc: 'Bullets curve toward the nearest target' },
  chain: { name: 'Chain Lightning', desc: '18% chance: a discharge jumps to 3 enemies' },
  boom: { name: 'Explosive Rounds', desc: 'Bullets explode on impact' },
  drone: { name: 'Satellite Drone', desc: 'An orbiting drone fires alongside you' },
  missile: { name: 'Missile Pod', desc: 'Every 2 s — a volley of homing missiles' },
  crit: { name: 'Vulnerability', desc: 'Crit chance +12% (×2.5 damage)' },
  hp: { name: 'Armor Plating', desc: '+2 max hull and a full repair' },
  shield: { name: 'Energy Shield', desc: 'The shield absorbs a hit, recharges every 9 s' },
  blade: { name: 'Dash Blade', desc: 'The dash slices enemies in its path' },
  dash2: { name: 'Double Dash', desc: '+1 dash charge' },
  magnet: { name: 'Magnet', desc: 'Data pickup radius +60%' },
  speed: { name: 'Afterburner', desc: 'Speed +15%' },
  emp: { name: 'EMP Amplifier', desc: 'EMP charges faster and hits wider' },
  vamp: { name: 'Regeneration', desc: 'Every 45 kills — +1 hull' },
  focus: { name: 'Focus', desc: 'Time slows down at 1–2 hull' },
};

const TAG_EN: Record<string, string> = {
  огонь: 'fire',
  залп: 'volley',
  пуля: 'bullet',
  молния: 'lightning',
  крит: 'crit',
  взрыв: 'blast',
  дрон: 'drone',
  защита: 'defense',
  рывок: 'dash',
  ЭМИ: 'EMP',
};

const ACH_EN: Record<string, { name: string; desc: string }> = {
  first: { name: 'First Packet', desc: 'Destroy your first virus' },
  hydra: { name: 'Perimeter Held', desc: 'Defeat the Hydra' },
  core: { name: 'Core Meltdown', desc: 'Defeat the Core' },
  win: { name: 'Zero Day Patched', desc: 'Beat the game' },
  combo50: { name: 'Chain Reaction', desc: '50 combo' },
  combo150: { name: 'OVERLOAD', desc: '150 combo' },
  kills1000: { name: 'Antivirus', desc: '1000 kills in one run' },
  flawless: { name: 'Not a Scratch', desc: 'Clear wave 5 without taking damage in that sector' },
  emp10: { name: 'Electric Storm', desc: '10 EMP blasts in one run' },
  arsenal: { name: 'Arsenal', desc: '12 modules in one run' },
  fleet: { name: 'Fleet', desc: 'Unlock all ships' },
  score: { name: 'Six Figures', desc: 'Score 250,000 points' },
};

export const shipText = (id: ShipId) => (lang === 'ru' ? SHIPS[id] : SHIP_EN[id]);
export const enemyName = (type: EnemyType): string => (lang === 'ru' ? ENEMIES[type].name : ENEMY_EN[type]);
export const sectorText = (i: number) => (lang === 'ru' ? SECTOR_INFO[i] : SECTOR_EN[i]);
export const upgradeText = (u: UpgradeDef) => (lang === 'ru' ? u : UPGRADE_EN[u.id]);
export const tagText = (t: string): string => (lang === 'ru' ? t : TAG_EN[t] ?? t);
export const achievementText = (a: Achievement) => (lang === 'ru' ? a : ACH_EN[a.id]);
