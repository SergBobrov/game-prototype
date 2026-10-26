import { AH, AW, ENEMIES, SECTOR_INFO, SECTORS, SHIPS, WAVES_PER_SECTOR } from './config';
import { hydraCascade, spawnBoss, updateBoss } from './bosses';
import { updateEnemy, onEnemyDeath } from './enemies';
import { Rng } from './rng';
import { SpatialHash } from './spatial';
import { rollUpgrades, UPGRADE_BY_ID, type UpgradeDef } from './upgrades';
import { buildWave, type SpawnGroup } from './waves';
import type { Beam, Bullet, Enemy, EnemyType, Input, Obstacle, Pickup, Player, RunStats, ShipId, SimEvent, Stats } from './types';

export type WorldPhase = 'wave' | 'intermission' | 'upgrade' | 'dead' | 'victory';

const BOSS_TYPES: EnemyType[] = ['hydraHead', 'core', 'zeroday'];

export class World {
  rng: Rng;
  time = 0;
  ship: ShipId;
  stats: Stats;
  owned: Record<string, number> = {};
  player: Player;
  bullets: Bullet[] = [];
  enemies: Enemy[] = [];
  pickups: Pickup[] = [];
  beams: Beam[] = [];
  obstacles: Obstacle[] = [];
  events: SimEvent[] = [];
  run: RunStats = { kills: 0, score: 0, damageDealt: 0, damageTaken: 0, shots: 0, time: 0, maxCombo: 0, bossesKilled: 0 };

  sector = 0;
  wave = 0;
  isBoss = false;
  phase: WorldPhase = 'wave';
  phaseT = 0;
  schedule: SpawnGroup[] = [];
  waveT = 0;
  offer: UpgradeDef[] = [];

  combo = 0;
  comboT = 0;
  /** Requests for the game loop: freeze frames and slow motion. */
  hitStop = 0;
  slowMo = 0;
  slowScale = 1;

  private nextId = 1;
  private enemyHash = new SpatialHash<Enemy>(3);
  private droneCd: number[] = [0, 0, 0];

  constructor(seed: number, ship: ShipId = 'vector', opts: { sector?: number; wave?: number } = {}) {
    this.rng = new Rng(seed);
    this.ship = ship;
    this.stats = structuredClone(SHIPS[ship].stats);
    this.player = {
      x: 0,
      z: 6,
      vx: 0,
      vz: 0,
      r: 0.55,
      hp: this.stats.maxHp,
      shield: this.stats.shieldMax,
      shieldTimer: 0,
      invuln: 0,
      dashCharges: this.stats.dashCharges,
      dashRecharge: 0,
      dashTime: 0,
      dashDirX: 0,
      dashDirZ: 0,
      fireCd: 0,
      missileCd: 2,
      empCharge: 0.5,
      aimX: 0,
      aimZ: 0,
      alive: true,
      killsSinceHeal: 0,
    };
    this.sector = opts.sector ?? 0;
    this.wave = opts.wave ?? 0;
    this.buildObstacles();
    this.startWave();
  }

  get hpScale(): number {
    return (1 + this.sector * 0.3 + this.wave * 0.05) * Math.pow(this.powerFactor, 0.55);
  }

  /** Rough damage-per-second of the current build relative to a fresh Vector. Enemies scale partly with it. */
  get powerFactor(): number {
    const s = this.stats;
    const bullets = 1 + s.multishot * 0.55;
    const perShot = s.damage * (1 + s.crit * 1.5) * (1 + s.pierce * 0.35) * (1 + s.explosive * 0.25) * (1 + s.chain * 1.4) * (1 + s.bounces * 0.1) * (1 + s.homing * 0.03);
    const dps = perShot * bullets * s.fireRate + s.drones * s.damage * 0.6 * s.fireRate * 0.45 + s.missiles * s.damage * 1.8;
    return Math.max(1, dps / 33.6);
  }

  emit(ev: SimEvent): void {
    this.events.push(ev);
  }

  // ---------------------------------------------------------------- waves

  private buildObstacles(): void {
    const r = new Rng(this.sector * 7919 + 17);
    this.obstacles = [];
    const layouts = [
      () => {
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) this.obstacles.push({ x: sx * 11, z: sz * 6.5, r: 1.6, h: 3 });
      },
      () => {
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2;
          this.obstacles.push({ x: Math.cos(a) * 12, z: Math.sin(a) * 8, r: 1.3, h: 2.5 + r.next() * 2 });
        }
      },
      () => {
        for (const sx of [-1, 1]) {
          this.obstacles.push({ x: sx * 15, z: 0, r: 2.2, h: 4 });
          this.obstacles.push({ x: sx * 6, z: -8, r: 1.2, h: 2.5 });
          this.obstacles.push({ x: sx * 6, z: 8, r: 1.2, h: 2.5 });
        }
      },
    ];
    layouts[this.sector % layouts.length]();
  }

  startWave(): void {
    this.isBoss = this.wave >= WAVES_PER_SECTOR;
    this.phase = 'wave';
    this.waveT = 0;
    this.schedule = this.isBoss ? [] : buildWave(this.rng, this.sector, this.wave);
    if (this.isBoss) spawnBoss(this, SECTOR_INFO[this.sector].boss);
    this.emit({ t: 'waveStart', sector: this.sector, wave: this.wave, boss: this.isBoss });
  }

  private updateWave(dt: number): void {
    this.waveT += dt;
    const alive = this.enemies.length;
    // Pull the next group forward when the arena is nearly empty, so pacing never stalls.
    if (this.schedule.length && (this.schedule[0].at <= this.waveT || alive < 3)) {
      const g = this.schedule.shift()!;
      this.spawnGroup(g);
      if (this.schedule.length && alive < 3) this.waveT = Math.max(this.waveT, this.schedule[0].at - 1.5);
    }
    if (!this.schedule.length && alive === 0) this.clearWave();
  }

  private clearWave(): void {
    this.emit({ t: 'waveClear', sector: this.sector, wave: this.wave, boss: this.isBoss });
    this.phase = 'intermission';
    this.phaseT = this.isBoss ? 3.2 : 1.8;
    this.slowMo = 1.2;
    this.slowScale = 0.25;
    this.enemyBulletsClear();
    for (const p of this.pickups) p.life = Math.max(p.life, 3);
    const p = this.player;
    if (this.isBoss) {
      p.hp = this.stats.maxHp;
      this.emit({ t: 'heal', x: p.x, z: p.z });
    } else if (p.hp < this.stats.maxHp) {
      p.hp += 1;
      this.emit({ t: 'heal', x: p.x, z: p.z });
    }
  }

  /** Called by the game when the player picks a card. */
  chooseUpgrade(id: string): void {
    if (!UPGRADE_BY_ID[id] || this.phase !== 'upgrade') return;
    this.grant(id);
    this.advance();
  }

  /** Apply an upgrade without touching wave flow (also used to pre-build the attract-mode demo). */
  grant(id: string): void {
    const u = UPGRADE_BY_ID[id];
    if (!u) return;
    this.owned[id] = (this.owned[id] ?? 0) + 1;
    const before = this.stats.maxHp;
    u.apply(this.stats);
    if (this.stats.maxHp > before) this.player.hp = this.stats.maxHp;
    if (id === 'shield') this.player.shield = this.stats.shieldMax;
    if (id === 'dash2') this.player.dashCharges = this.stats.dashCharges;
  }

  private advance(): void {
    if (this.isBoss) {
      this.sector++;
      this.wave = 0;
      if (this.sector >= SECTORS) {
        this.phase = 'victory';
        return;
      }
      this.buildObstacles();
      this.player.x = 0;
      this.player.z = 6;
    } else {
      this.wave++;
    }
    this.startWave();
  }

  private spawnGroup(g: SpawnGroup): void {
    const p = this.player;
    let cx = 0;
    let cz = 0;
    if (g.pattern === 'cluster') {
      for (let k = 0; k < 20; k++) {
        cx = (this.rng.next() * 2 - 1) * (AW - 4);
        cz = (this.rng.next() * 2 - 1) * (AH - 3);
        if (Math.hypot(cx - p.x, cz - p.z) > 11) break;
      }
    }
    for (let i = 0; i < g.count; i++) {
      let x = 0;
      let z = 0;
      for (let k = 0; k < 12; k++) {
        if (g.pattern === 'ring') {
          const a = (i / g.count) * Math.PI * 2 + this.rng.next() * 0.3;
          const d = 11 + this.rng.next() * 3;
          x = p.x + Math.cos(a) * d;
          z = p.z + Math.sin(a) * d;
        } else if (g.pattern === 'edge') {
          const side = this.rng.int(0, 3);
          const tpos = this.rng.next() * 2 - 1;
          x = side < 2 ? (side === 0 ? -1 : 1) * (AW - 1.5) : tpos * (AW - 2);
          z = side < 2 ? tpos * (AH - 2) : (side === 2 ? -1 : 1) * (AH - 1.5);
        } else {
          x = cx + (this.rng.next() * 2 - 1) * 2.5;
          z = cz + (this.rng.next() * 2 - 1) * 2.5;
        }
        x = Math.max(-AW + 1, Math.min(AW - 1, x));
        z = Math.max(-AH + 1, Math.min(AH - 1, z));
        if (Math.hypot(x - p.x, z - p.z) > 6 && !this.insideObstacle(x, z, 1)) break;
      }
      this.spawnEnemy(g.type, x, z, { elite: g.elite, spawnT: 0.9 + this.rng.next() * 0.4 });
    }
  }

  spawnEnemy(type: EnemyType, x: number, z: number, opts: { elite?: boolean; spawnT?: number; gen?: number; link?: number; hp?: number } = {}): Enemy {
    const d = ENEMIES[type];
    const elite = !!opts.elite;
    const boss = BOSS_TYPES.includes(type) || type === 'hydraSeg';
    const hp = opts.hp ?? d.hp * (boss ? Math.pow(this.powerFactor, 0.85) : this.hpScale) * (elite ? 2.2 : 1);
    const e: Enemy = {
      id: this.nextId++,
      type,
      x,
      z,
      vx: 0,
      vz: 0,
      r: d.r * (elite ? 1.25 : 1),
      hp,
      maxHp: hp,
      state: 0,
      t: this.rng.next() * 2,
      t2: 0,
      dirX: 0,
      dirZ: 1,
      flash: 0,
      gen: opts.gen ?? 0,
      link: opts.link ?? 0,
      spawnT: opts.spawnT ?? 0,
      dead: false,
      elite,
      angle: Math.atan2(this.player.z - z, this.player.x - x),
      stun: 0,
      k: [0, 0, 0, 0],
    };
    // Shielders: k[0] = shield points, k[1] = seconds the shield stays down, k[2] = max shield.
    if (type === 'shielder') e.k[0] = e.k[2] = hp * 0.9;
    this.enemies.push(e);
    this.emit({ t: 'spawn', x, z, type });
    return e;
  }

  insideObstacle(x: number, z: number, pad: number): boolean {
    return this.obstacles.some((o) => Math.hypot(x - o.x, z - o.z) < o.r + pad);
  }

  enemyById(id: number): Enemy | undefined {
    return this.enemies.find((e) => e.id === id);
  }

  // ---------------------------------------------------------------- main step

  step(dt: number, input: Input): void {
    this.time += dt;
    if (this.phase === 'dead' || this.phase === 'victory' || this.phase === 'upgrade') return;
    this.run.time += dt;
    if (this.phase === 'intermission') {
      this.phaseT -= dt;
      this.updatePlayer(dt, { ...input, fire: false, dash: false, emp: false });
      this.updatePickups(dt, true);
      this.updateBullets(dt);
      if (this.phaseT <= 0) {
        this.phase = 'upgrade';
        this.offer = rollUpgrades(this.rng, this.owned, 3, this.isBoss);
        if (!this.offer.length) this.advance();
      }
      return;
    }

    this.updatePlayer(dt, input);
    this.updateWave(dt);

    this.enemyHash.clear();
    for (const e of this.enemies) this.enemyHash.insert(e);
    for (const e of this.enemies) {
      if (e.dead) continue;
      if (e.flash > 0) e.flash -= dt;
      if (e.spawnT > 0) {
        e.spawnT -= dt;
        continue;
      }
      if (e.stun > 0) {
        e.stun -= dt;
        e.vx *= 0.9;
        e.vz *= 0.9;
      } else if (!updateBoss(this, e, dt)) {
        updateEnemy(this, e, dt);
      }
      e.x += e.vx * dt;
      e.z += e.vz * dt;
      this.confine(e);
      this.contactPlayer(e);
    }
    this.updateBullets(dt);
    this.updateBeams(dt);
    this.updatePickups(dt, false);
    this.enemies = this.enemies.filter((e) => !e.dead);

    if (this.comboT > 0) {
      this.comboT -= dt;
      if (this.comboT <= 0) this.combo = 0;
    }
  }

  get multiplier(): number {
    return Math.min(8, 1 + Math.floor(this.combo / 12));
  }

  /** Nearby enemies for boids and AoE. */
  queryEnemies(x: number, z: number, r: number, fn: (e: Enemy) => boolean | void): void {
    this.enemyHash.query(x, z, r, (e) => (e.dead ? undefined : fn(e)));
  }

  private confine(e: Enemy): void {
    const lim = e.type === 'hydraSeg' || e.type === 'hydraHead' ? 0 : e.r;
    if (e.x < -AW + lim) { e.x = -AW + lim; e.vx = Math.abs(e.vx) * 0.5; }
    if (e.x > AW - lim) { e.x = AW - lim; e.vx = -Math.abs(e.vx) * 0.5; }
    if (e.z < -AH + lim) { e.z = -AH + lim; e.vz = Math.abs(e.vz) * 0.5; }
    if (e.z > AH - lim) { e.z = AH - lim; e.vz = -Math.abs(e.vz) * 0.5; }
    if (e.type === 'hydraSeg' || e.type === 'hydraHead' || e.type === 'core') return;
    for (const o of this.obstacles) {
      const dx = e.x - o.x;
      const dz = e.z - o.z;
      const d = Math.hypot(dx, dz);
      const min = o.r + e.r;
      if (d < min && d > 1e-4) {
        e.x = o.x + (dx / d) * min;
        e.z = o.z + (dz / d) * min;
        if (e.type === 'charger' && e.state === 2) {
          e.state = 3;
          e.t = 1.1;
          e.vx = e.vz = 0;
          this.emit({ t: 'charge', x: e.x, z: e.z });
        }
      }
    }
  }

  // ---------------------------------------------------------------- player

  private updatePlayer(dt: number, input: Input): void {
    const p = this.player;
    const s = this.stats;
    if (!p.alive) return;
    p.aimX = input.aimX;
    p.aimZ = input.aimZ;
    if (p.invuln > 0) p.invuln -= dt;

    // dash charges
    if (p.dashCharges < s.dashCharges) {
      p.dashRecharge += dt;
      if (p.dashRecharge >= 1.4) {
        p.dashRecharge = 0;
        p.dashCharges++;
      }
    }
    // shield regen
    if (s.shieldRegen > 0 && p.shield < s.shieldMax) {
      p.shieldTimer += dt;
      if (p.shieldTimer >= s.shieldRegen) {
        p.shieldTimer = 0;
        p.shield++;
      }
    }

    let mx = input.moveX;
    let mz = input.moveZ;
    const ml = Math.hypot(mx, mz);
    if (ml > 1) {
      mx /= ml;
      mz /= ml;
    }

    if (input.dash && p.dashCharges > 0 && p.dashTime <= 0) {
      let dx = mx;
      let dz = mz;
      if (Math.hypot(dx, dz) < 0.1) {
        dx = p.aimX - p.x;
        dz = p.aimZ - p.z;
      }
      const l = Math.hypot(dx, dz) || 1;
      p.dashDirX = dx / l;
      p.dashDirZ = dz / l;
      p.dashTime = 0.17;
      p.dashCharges--;
      this.dashHit.clear();
      this.emit({ t: 'dash', x: p.x, z: p.z, dx: p.dashDirX, dz: p.dashDirZ });
    }

    if (p.dashTime > 0) {
      p.dashTime -= dt;
      p.vx = p.dashDirX * 34;
      p.vz = p.dashDirZ * 34;
      if (s.dashBlade > 0) {
        this.queryEnemies(p.x, p.z, 1.6, (e) => {
          if (e.spawnT > 0 || this.dashHit.has(e.id)) return;
          if (Math.hypot(e.x - p.x, e.z - p.z) < e.r + 1.1) {
            this.dashHit.add(e.id);
            this.damageEnemy(e, s.dashBlade, false);
          }
        });
      }
    } else {
      const k = Math.min(1, dt * 14);
      p.vx += (mx * s.speed - p.vx) * k;
      p.vz += (mz * s.speed - p.vz) * k;
    }
    p.x += p.vx * dt;
    p.z += p.vz * dt;
    p.x = Math.max(-AW + p.r, Math.min(AW - p.r, p.x));
    p.z = Math.max(-AH + p.r, Math.min(AH - p.r, p.z));
    for (const o of this.obstacles) {
      const dx = p.x - o.x;
      const dz = p.z - o.z;
      const d = Math.hypot(dx, dz);
      if (d < o.r + p.r && d > 1e-4) {
        p.x = o.x + (dx / d) * (o.r + p.r);
        p.z = o.z + (dz / d) * (o.r + p.r);
      }
    }

    // weapons
    p.fireCd -= dt;
    if (input.fire && p.fireCd <= 0 && this.phase === 'wave') {
      p.fireCd = 1 / s.fireRate;
      this.firePlayerVolley(p.x, p.z, p.aimX - p.x, p.aimZ - p.z, 1);
    }
    if (s.drones > 0 && this.phase === 'wave') this.updateDrones(dt);
    if (s.missiles > 0 && this.phase === 'wave') {
      p.missileCd -= dt;
      if (p.missileCd <= 0 && this.enemies.length) {
        p.missileCd = 2;
        for (let i = 0; i < s.missiles; i++) {
          const a = Math.atan2(p.aimZ - p.z, p.aimX - p.x) + Math.PI + (i - (s.missiles - 1) / 2) * 0.5;
          this.addBullet({ x: p.x, z: p.z, vx: Math.cos(a) * 12, vz: Math.sin(a) * 12, dmg: s.damage * 3, missile: true, homing: 7, explosive: 2.4, r: 0.3, life: 4 });
        }
      }
    }
    if (input.emp && p.empCharge >= 1) this.fireEmp();
  }

  private dashHit = new Set<number>();

  dronePos(i: number): { x: number; z: number } {
    const n = this.stats.drones;
    const a = this.time * 2.4 + (i / n) * Math.PI * 2;
    return { x: this.player.x + Math.cos(a) * 2, z: this.player.z + Math.sin(a) * 2 };
  }

  private updateDrones(dt: number): void {
    for (let i = 0; i < this.stats.drones; i++) {
      this.droneCd[i] -= dt;
      if (this.droneCd[i] > 0) continue;
      const d = this.dronePos(i);
      const target = this.nearestEnemy(d.x, d.z, 16);
      if (!target) continue;
      this.droneCd[i] = 1 / (this.stats.fireRate * 0.45);
      this.firePlayerVolley(d.x, d.z, target.x - d.x, target.z - d.z, 0.6, true);
    }
  }

  nearestEnemy(x: number, z: number, maxD: number): Enemy | null {
    let best: Enemy | null = null;
    let bd = maxD;
    for (const e of this.enemies) {
      if (e.dead || e.spawnT > 0) continue;
      const d = Math.hypot(e.x - x, e.z - z);
      if (d < bd) {
        bd = d;
        best = e;
      }
    }
    return best;
  }

  private firePlayerVolley(x: number, z: number, dx: number, dz: number, mult: number, drone = false): void {
    const s = this.stats;
    const base = Math.atan2(dz, dx);
    const n = 1 + (drone ? 0 : s.multishot);
    for (let i = 0; i < n; i++) {
      const off = n === 1 ? (this.rng.next() - 0.5) * 0.05 : (i / (n - 1) - 0.5) * s.spread * (1 + s.multishot * 0.1);
      const a = base + off;
      const crit = this.rng.chance(s.crit);
      this.addBullet({
        x: x + Math.cos(a) * 0.7,
        z: z + Math.sin(a) * 0.7,
        vx: Math.cos(a) * s.bulletSpeed,
        vz: Math.sin(a) * s.bulletSpeed,
        dmg: s.damage * mult * (crit ? 2.5 : 1),
        crit,
        pierce: s.pierce,
        bounces: s.bounces,
        homing: s.homing,
        explosive: s.explosive,
      });
    }
    this.run.shots++;
    if (!drone) this.emit({ t: 'shoot', x, z, team: 0 });
  }

  addBullet(b: Partial<Bullet> & { x: number; z: number; vx: number; vz: number; dmg: number }): void {
    this.bullets.push({
      r: 0.22,
      life: 1.6,
      team: 0,
      pierce: 0,
      bounces: 0,
      homing: 0,
      crit: false,
      explosive: 0,
      missile: false,
      hit: [],
      dead: false,
      ...b,
    });
  }

  fireEnemyBullet(x: number, z: number, angle: number, speed: number, dmg = 1, r = 0.28, life = 4): void {
    this.bullets.push({
      x, z, vx: Math.cos(angle) * speed, vz: Math.sin(angle) * speed, r, dmg, life, team: 1,
      pierce: 0, bounces: 0, homing: 0, crit: false, explosive: 0, missile: false, hit: [], dead: false,
    });
  }

  private fireEmp(): void {
    const p = this.player;
    p.empCharge = 0;
    const r = 7.5 * Math.sqrt(this.stats.empPower);
    this.emit({ t: 'emp', x: p.x, z: p.z, r });
    this.hitStop = 0.06;
    for (const b of this.bullets) if (b.team === 1 && Math.hypot(b.x - p.x, b.z - p.z) < r) b.dead = true;
    for (const e of this.enemies) {
      const dx = e.x - p.x;
      const dz = e.z - p.z;
      const d = Math.hypot(dx, dz);
      if (d > r + e.r || e.spawnT > 0) continue;
      const boss = BOSS_TYPES.includes(e.type) || e.type === 'hydraSeg';
      this.damageEnemy(e, 22 * this.stats.empPower * (boss ? 1.5 : 1), false);
      if (!boss) {
        e.stun = 1.2;
        const k = (1 - d / (r + 1)) * 18;
        e.vx += (dx / (d || 1)) * k;
        e.vz += (dz / (d || 1)) * k;
      }
    }
  }

  damagePlayer(dmg: number): void {
    const p = this.player;
    if (!p.alive || p.invuln > 0 || p.dashTime > 0 || this.phase !== 'wave') return;
    if (p.shield > 0) {
      p.shield--;
      p.invuln = 0.6;
      this.emit({ t: 'playerHit', x: p.x, z: p.z, shield: true });
      return;
    }
    p.hp -= dmg;
    this.run.damageTaken += dmg;
    p.invuln = 1.1;
    this.hitStop = 0.09;
    this.combo = 0;
    this.emit({ t: 'playerHit', x: p.x, z: p.z, shield: false });
    if (p.hp <= 0) {
      p.hp = 0;
      p.alive = false;
      this.phase = 'dead';
      this.slowMo = 2;
      this.slowScale = 0.2;
      this.emit({ t: 'playerDeath', x: p.x, z: p.z });
    }
  }

  private contactPlayer(e: Enemy): void {
    const p = this.player;
    if (!p.alive || e.spawnT > 0) return;
    const d = Math.hypot(e.x - p.x, e.z - p.z);
    if (d > e.r + p.r) return;
    const dmg = ENEMIES[e.type].contact;
    if (dmg > 0) this.damagePlayer(dmg);
    if (e.type === 'swarmer' && p.invuln > 0.9) this.damageEnemy(e, 999, false);
    const nx = (e.x - p.x) / (d || 1);
    const nz = (e.z - p.z) / (d || 1);
    e.vx += nx * 8;
    e.vz += nz * 8;
  }

  // ---------------------------------------------------------------- damage

  damageEnemy(e: Enemy, dmg: number, crit: boolean): void {
    if (e.dead || e.spawnT > 0) return;
    let real = dmg;
    if (e.type === 'hydraHead' && this.enemies.some((s) => s.type === 'hydraSeg' && !s.dead)) real *= 0.3;
    e.hp -= real;
    e.flash = 0.08;
    this.run.damageDealt += real;
    this.emit({ t: 'hit', x: e.x, z: e.z, dmg: real, crit, type: e.type });
    if (e.hp <= 0) this.killEnemy(e);
  }

  killEnemy(e: Enemy): void {
    if (e.dead) return;
    e.dead = true;
    const d = ENEMIES[e.type];
    this.run.kills++;
    this.combo++;
    this.comboT = 2.5;
    this.run.maxCombo = Math.max(this.run.maxCombo, this.combo);
    this.run.score += Math.round(d.score * (e.elite ? 3 : 1) * this.multiplier);
    this.emit({ t: 'kill', x: e.x, z: e.z, type: e.type, r: e.r, elite: e.elite });
    const p = this.player;
    p.empCharge = Math.min(1, p.empCharge + 0.004 * this.stats.empPower);
    if (this.stats.vampire > 0 && ++p.killsSinceHeal >= this.stats.vampire) {
      p.killsSinceHeal = 0;
      if (p.hp < this.stats.maxHp) {
        p.hp++;
        this.emit({ t: 'heal', x: p.x, z: p.z });
      }
    }
    const drops = Math.min(6, d.data);
    for (let i = 0; i < drops; i++) {
      const a = this.rng.next() * Math.PI * 2;
      const sp = 3 + this.rng.next() * 5;
      this.pickups.push({ x: e.x, z: e.z, vx: Math.cos(a) * sp, vz: Math.sin(a) * sp, kind: 'data', value: d.data / drops, life: 9, dead: false });
    }
    if ((e.elite && this.rng.chance(0.35)) || BOSS_TYPES.includes(e.type)) {
      this.pickups.push({ x: e.x, z: e.z, vx: 0, vz: 0, kind: 'heal', value: 1, life: 14, dead: false });
    }
    if (e.elite) this.hitStop = Math.max(this.hitStop, 0.05);
    onEnemyDeath(this, e);
    if (BOSS_TYPES.includes(e.type)) {
      this.run.bossesKilled++;
      this.emit({ t: 'bossDeath', x: e.x, z: e.z, type: e.type });
      this.hitStop = 0.25;
      this.slowMo = 2.5;
      this.slowScale = 0.2;
      this.enemyBulletsClear();
      if (e.type === 'hydraHead') hydraCascade(this);
      else for (const o of this.enemies) if (!o.dead && o !== e) this.killEnemy(o);
    }
  }

  explodeAt(x: number, z: number, r: number, dmg: number, team: 0 | 1): void {
    this.emit({ t: 'explode', x, z, r, team });
    if (team === 1) {
      const p = this.player;
      if (Math.hypot(p.x - x, p.z - z) < r + p.r) this.damagePlayer(Math.max(1, Math.round(dmg)));
    }
    // Explosions always hurt viruses: mines chain into each other, which is half the fun.
    const hitIds: number[] = [];
    this.queryEnemies(x, z, r + 2.5, (e) => {
      if (Math.hypot(e.x - x, e.z - z) < r + e.r) hitIds.push(e.id);
    });
    for (const id of hitIds) {
      const e = this.enemyById(id);
      if (e) this.damageEnemy(e, team === 0 ? dmg : dmg * 10, false);
    }
  }

  private chainLightning(from: Enemy, dmg: number): void {
    const pts = [from.x, from.z];
    const done = new Set([from.id]);
    let cur = { x: from.x, z: from.z };
    for (let k = 0; k < 3; k++) {
      let best: Enemy | null = null;
      let bd = 6.5;
      this.queryEnemies(cur.x, cur.z, 6.5, (e) => {
        if (done.has(e.id) || e.spawnT > 0) return;
        const d = Math.hypot(e.x - cur.x, e.z - cur.z);
        if (d < bd) {
          bd = d;
          best = e;
        }
      });
      if (!best) break;
      const b: Enemy = best;
      done.add(b.id);
      pts.push(b.x, b.z);
      cur = { x: b.x, z: b.z };
      this.damageEnemy(b, dmg, false);
    }
    if (pts.length > 2) this.emit({ t: 'chain', pts });
  }

  // ---------------------------------------------------------------- bullets

  private updateBullets(dt: number): void {
    const p = this.player;
    for (const b of this.bullets) {
      if (b.dead) continue;
      b.life -= dt;
      if (b.life <= 0) {
        if (b.missile) this.explodeAt(b.x, b.z, b.explosive, b.dmg * 0.6, 0);
        b.dead = true;
        continue;
      }
      if (b.homing > 0 && b.team === 0) {
        const t = this.nearestEnemy(b.x, b.z, b.missile ? 30 : 9);
        if (t) {
          const want = Math.atan2(t.z - b.z, t.x - b.x);
          const cur = Math.atan2(b.vz, b.vx);
          let diff = want - cur;
          while (diff > Math.PI) diff -= Math.PI * 2;
          while (diff < -Math.PI) diff += Math.PI * 2;
          const turn = Math.max(-b.homing * dt, Math.min(b.homing * dt, diff));
          let sp = Math.hypot(b.vx, b.vz);
          if (b.missile) sp = Math.min(26, sp + dt * 30);
          b.vx = Math.cos(cur + turn) * sp;
          b.vz = Math.sin(cur + turn) * sp;
        }
      }
      b.x += b.vx * dt;
      b.z += b.vz * dt;

      // walls
      let hitWall = false;
      if (b.x < -AW || b.x > AW) {
        hitWall = true;
        if (b.bounces > 0) { b.vx = -b.vx; b.x = Math.max(-AW, Math.min(AW, b.x)); }
      }
      if (b.z < -AH || b.z > AH) {
        hitWall = true;
        if (b.bounces > 0) { b.vz = -b.vz; b.z = Math.max(-AH, Math.min(AH, b.z)); }
      }
      for (const o of this.obstacles) {
        const dx = b.x - o.x;
        const dz = b.z - o.z;
        const d = Math.hypot(dx, dz);
        if (d < o.r + b.r) {
          hitWall = true;
          if (b.bounces > 0) {
            const nx = dx / d;
            const nz = dz / d;
            const dot = b.vx * nx + b.vz * nz;
            b.vx -= 2 * dot * nx;
            b.vz -= 2 * dot * nz;
            b.x = o.x + nx * (o.r + b.r + 0.01);
            b.z = o.z + nz * (o.r + b.r + 0.01);
          }
        }
      }
      if (hitWall) {
        if (b.bounces > 0 && b.team === 0) {
          b.bounces--;
          b.hit.length = 0;
          this.emit({ t: 'bounce', x: b.x, z: b.z });
        } else {
          if (b.missile || b.explosive) this.explodeAt(b.x, b.z, b.explosive, b.dmg * 0.6, 0);
          b.dead = true;
          continue;
        }
      }

      if (b.team === 1) {
        if (p.alive && Math.hypot(p.x - b.x, p.z - b.z) < p.r + b.r) {
          this.damagePlayer(b.dmg);
          b.dead = true;
        }
        continue;
      }
      this.queryEnemies(b.x, b.z, b.r + 3, (e) => {
        if (e.spawnT > 0 || b.hit.includes(e.id)) return;
        if (Math.hypot(e.x - b.x, e.z - b.z) > e.r + b.r) return;
        if (e.type === 'shielder' && e.k[1] <= 0 && this.shieldBlocks(e, b)) {
          b.dead = true;
          e.k[0] -= b.dmg;
          e.flash = 0.05;
          this.emit({ t: 'blocked', x: b.x, z: b.z });
          if (e.k[0] <= 0) {
            e.k[1] = 3.5;
            this.emit({ t: 'explode', x: e.x, z: e.z, r: 1.4, team: 0 });
          }
          return true;
        }
        b.hit.push(e.id);
        this.damageEnemy(e, b.dmg, b.crit);
        if (b.explosive > 0) this.explodeAt(b.x, b.z, b.explosive, b.dmg * (b.missile ? 0.8 : 0.5), 0);
        if (this.stats.chain > 0 && this.rng.chance(this.stats.chain)) this.chainLightning(e, b.dmg * 0.7);
        if (b.pierce > 0 && !b.missile) b.pierce--;
        else {
          b.dead = true;
          return true;
        }
      });
    }
    this.bullets = this.bullets.filter((b) => !b.dead);
  }

  private shieldBlocks(e: Enemy, b: Bullet): boolean {
    // Shield covers a 140° arc facing the shielder's angle.
    const incoming = Math.atan2(b.z - e.z, b.x - e.x);
    let diff = incoming - e.angle;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    return Math.abs(diff) < (70 * Math.PI) / 180;
  }

  enemyBulletsClear(): void {
    for (const b of this.bullets) if (b.team === 1) b.dead = true;
    this.bullets = this.bullets.filter((b) => !b.dead);
    this.beams = [];
  }

  // ---------------------------------------------------------------- beams

  addBeam(b: Omit<Beam, 'dead'>): Beam {
    const beam = { ...b, dead: false };
    this.beams.push(beam);
    return beam;
  }

  private updateBeams(dt: number): void {
    const p = this.player;
    for (const b of this.beams) {
      const owner = this.enemyById(b.owner);
      if (!owner) {
        b.dead = true;
        continue;
      }
      b.x = owner.x;
      b.z = owner.z;
      if (b.warm > 0) {
        b.warm -= dt;
        continue;
      }
      b.life -= dt;
      b.angle += b.spin * dt;
      if (b.life <= 0) {
        b.dead = true;
        continue;
      }
      // distance from player to the beam segment
      const ex = Math.cos(b.angle);
      const ez = Math.sin(b.angle);
      const px = p.x - b.x;
      const pz = p.z - b.z;
      const along = Math.max(0, Math.min(b.len, px * ex + pz * ez));
      const d = Math.hypot(px - ex * along, pz - ez * along);
      if (d < b.width / 2 + p.r) this.damagePlayer(b.dmg);
    }
    this.beams = this.beams.filter((b) => !b.dead);
  }

  // ---------------------------------------------------------------- pickups

  private updatePickups(dt: number, vacuum: boolean): void {
    const p = this.player;
    for (const k of this.pickups) {
      k.life -= dt;
      if (k.life <= 0) {
        k.dead = true;
        continue;
      }
      const dx = p.x - k.x;
      const dz = p.z - k.z;
      const d = Math.hypot(dx, dz);
      if (vacuum || d < this.stats.magnet) {
        const pull = vacuum ? 40 : 30 * (1 - d / (this.stats.magnet + 0.01)) + 10;
        k.vx += (dx / (d || 1)) * pull * dt * 6;
        k.vz += (dz / (d || 1)) * pull * dt * 6;
        const sp = Math.hypot(k.vx, k.vz);
        const max = vacuum ? 40 : 22;
        if (sp > max) {
          k.vx *= max / sp;
          k.vz *= max / sp;
        }
      } else {
        k.vx *= 0.92;
        k.vz *= 0.92;
      }
      k.x += k.vx * dt;
      k.z += k.vz * dt;
      if (d < p.r + 0.5 && p.alive) {
        k.dead = true;
        if (k.kind === 'heal') {
          if (p.hp < this.stats.maxHp) p.hp++;
          this.emit({ t: 'heal', x: p.x, z: p.z });
        } else {
          p.empCharge = Math.min(1, p.empCharge + k.value * 0.011 * this.stats.empPower);
          this.run.score += Math.round(k.value * 5);
        }
        this.emit({ t: 'pickup', x: k.x, z: k.z, kind: k.kind });
      }
    }
    this.pickups = this.pickups.filter((k) => !k.dead);
  }
}
