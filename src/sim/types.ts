// The simulation lives on the XZ plane. Y is purely visual.

export interface Input {
  moveX: number;
  moveZ: number;
  /** World-space aim point. */
  aimX: number;
  aimZ: number;
  fire: boolean;
  /** Edge-triggered: true only on the tick the key went down. */
  dash: boolean;
  emp: boolean;
}

export const emptyInput = (): Input => ({ moveX: 0, moveZ: 0, aimX: 0, aimZ: -1, fire: false, dash: false, emp: false });

export type ShipId = 'vector' | 'impulse' | 'bastion';

/** Everything upgrades can change. Base values come from the ship. */
export interface Stats {
  maxHp: number;
  speed: number;
  fireRate: number; // shots per second
  damage: number;
  bulletSpeed: number;
  multishot: number; // extra bullets in a fan
  spread: number; // fan angle in radians
  pierce: number;
  bounces: number; // wall ricochets
  homing: number; // turn rate rad/s
  chain: number; // chance to chain lightning on hit
  explosive: number; // explosion radius, 0 = none
  crit: number; // crit chance
  drones: number;
  missiles: number; // missiles per volley, 0 = none
  shieldMax: number;
  shieldRegen: number; // seconds per charge, 0 = none
  dashCharges: number;
  dashBlade: number; // damage dealt while dashing, 0 = none
  magnet: number; // pickup radius
  empPower: number; // multiplier on EMP radius and charge rate
  vampire: number; // kills per heal, 0 = none
  focus: boolean; // slow time when hp is low
}

export interface Player {
  x: number;
  z: number;
  vx: number;
  vz: number;
  r: number;
  hp: number;
  shield: number;
  shieldTimer: number;
  invuln: number;
  dashCharges: number;
  dashRecharge: number;
  dashTime: number;
  dashDirX: number;
  dashDirZ: number;
  fireCd: number;
  missileCd: number;
  empCharge: number;
  aimX: number;
  aimZ: number;
  alive: boolean;
  killsSinceHeal: number;
}

export interface Bullet {
  x: number;
  z: number;
  vx: number;
  vz: number;
  r: number;
  dmg: number;
  life: number;
  team: 0 | 1; // 0 player, 1 enemy
  pierce: number;
  bounces: number;
  homing: number;
  crit: boolean;
  explosive: number;
  missile: boolean;
  /** Ids already hit, so a piercing bullet does not hit the same enemy twice. */
  hit: number[];
  dead: boolean;
}

export type EnemyType =
  | 'swarmer'
  | 'charger'
  | 'sniper'
  | 'hive'
  | 'shielder'
  | 'splitter'
  | 'mine'
  | 'hydraHead'
  | 'hydraSeg'
  | 'core'
  | 'zeroday';

export interface Enemy {
  id: number;
  type: EnemyType;
  x: number;
  z: number;
  vx: number;
  vz: number;
  r: number;
  hp: number;
  maxHp: number;
  /** Behaviour state machine. Meaning depends on type. */
  state: number;
  t: number;
  t2: number;
  dirX: number;
  dirZ: number;
  /** Seconds of white hit flash left (visual). */
  flash: number;
  /** Splitter generation / segment index / boss phase. */
  gen: number;
  /** For segments: id of the entity this one follows. */
  link: number;
  /** Spawn-in time left; the enemy is inert and invulnerable while > 0. */
  spawnT: number;
  dead: boolean;
  elite: boolean;
  /** Spin angle used by shielders and the core. */
  angle: number;
  /** Seconds of EMP stun left. */
  stun: number;
  /** Scratch timers for multi-attack bosses. */
  k: number[];
}

/** A damaging line segment (boss lasers). Harmless while warming up — that is the telegraph. */
export interface Beam {
  x: number;
  z: number;
  angle: number;
  len: number;
  width: number;
  warm: number;
  life: number;
  /** Angular velocity in rad/s while active. */
  spin: number;
  dmg: number;
  owner: number;
  dead: boolean;
}

export interface Pickup {
  x: number;
  z: number;
  vx: number;
  vz: number;
  kind: 'data' | 'heal';
  value: number;
  life: number;
  dead: boolean;
}

export interface Obstacle {
  x: number;
  z: number;
  r: number;
  /** Visual height. */
  h: number;
}

export type SimEvent =
  | { t: 'shoot'; x: number; z: number; team: 0 | 1 }
  | { t: 'hit'; x: number; z: number; dmg: number; crit: boolean; type: EnemyType }
  | { t: 'kill'; x: number; z: number; type: EnemyType; r: number; elite: boolean }
  | { t: 'playerHit'; x: number; z: number; shield: boolean }
  | { t: 'playerDeath'; x: number; z: number }
  | { t: 'dash'; x: number; z: number; dx: number; dz: number }
  | { t: 'emp'; x: number; z: number; r: number }
  | { t: 'explode'; x: number; z: number; r: number; team: 0 | 1 }
  | { t: 'pickup'; x: number; z: number; kind: Pickup['kind'] }
  | { t: 'spawn'; x: number; z: number; type: EnemyType }
  | { t: 'chain'; pts: number[] }
  | { t: 'blocked'; x: number; z: number }
  | { t: 'bounce'; x: number; z: number }
  | { t: 'charge'; x: number; z: number }
  | { t: 'snipe'; x: number; z: number }
  | { t: 'waveStart'; sector: number; wave: number; boss: boolean }
  | { t: 'waveClear'; sector: number; wave: number; boss: boolean }
  | { t: 'bossPhase'; x: number; z: number; phase: number }
  | { t: 'bossDeath'; x: number; z: number; type: EnemyType }
  | { t: 'heal'; x: number; z: number };

export interface RunStats {
  kills: number;
  score: number;
  damageDealt: number;
  damageTaken: number;
  shots: number;
  time: number;
  maxCombo: number;
  bossesKilled: number;
}
