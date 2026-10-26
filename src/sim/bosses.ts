import { AH, AW } from './config';
import type { Enemy, EnemyType } from './types';
import type { World } from './world';

const HYDRA_SEGMENTS = 12;
const SPACING = 1.25;

function turnTowards(cur: number, want: number, rate: number): number {
  let diff = want - cur;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return cur + Math.max(-rate, Math.min(rate, diff));
}

export function spawnBoss(w: World, type: EnemyType): void {
  if (type === 'hydraHead') {
    const head = w.spawnEnemy('hydraHead', 0, -AH + 3, { spawnT: 1.6 });
    head.angle = Math.PI / 2;
    let prev = head.id;
    for (let i = 0; i < HYDRA_SEGMENTS; i++) {
      const s = w.spawnEnemy('hydraSeg', 0, -AH + 3 - (i + 1) * 0.3, { spawnT: 1.6 + i * 0.05, gen: i, link: prev });
      prev = s.id;
    }
  } else if (type === 'core') {
    w.spawnEnemy('core', 0, -4, { spawnT: 2 });
  } else {
    w.spawnEnemy('zeroday', 0, -6, { spawnT: 2.2 });
  }
}

function phaseOf(e: Enemy, cuts: number[]): number {
  const f = e.hp / e.maxHp;
  let ph = 0;
  for (const c of cuts) if (f < c) ph++;
  return ph;
}

function checkPhase(w: World, e: Enemy, cuts: number[]): number {
  const ph = phaseOf(e, cuts);
  if (ph > e.gen) {
    e.gen = ph;
    w.emit({ t: 'bossPhase', x: e.x, z: e.z, phase: ph });
    w.slowMo = 0.8;
    w.slowScale = 0.3;
    w.hitStop = 0.12;
  }
  return e.gen;
}

function ring(w: World, e: Enemy, n: number, speed: number, offset = 0): void {
  for (let i = 0; i < n; i++) w.fireEnemyBullet(e.x, e.z, offset + (i / n) * Math.PI * 2, speed, 1, 0.32, 6);
  w.emit({ t: 'shoot', x: e.x, z: e.z, team: 1 });
}

/** Returns true if the enemy is a boss part and was handled here. */
export function updateBoss(w: World, e: Enemy, dt: number): boolean {
  switch (e.type) {
    case 'hydraHead':
      hydraHead(w, e, dt);
      return true;
    case 'hydraSeg':
      hydraSeg(w, e, dt);
      return true;
    case 'core':
      core(w, e, dt);
      return true;
    case 'zeroday':
      zeroday(w, e, dt);
      return true;
    default:
      return false;
  }
}

// ---------------------------------------------------------------- ГИДРА

function hydraHead(w: World, e: Enemy, dt: number): void {
  const p = w.player;
  const ph = checkPhase(w, e, [0.5]);
  e.t += dt;
  const want = Math.atan2(p.z - e.z, p.x - e.x);
  if (e.state === 0) {
    // Slither: constant speed, limited turn rate, sinusoidal weave = snake motion.
    const weave = Math.sin(w.time * 2.2) * 0.9;
    e.angle = turnTowards(e.angle, want + weave, (1.9 + ph * 0.6) * dt);
    // Steer away from walls so the body does not pile up on the edge.
    const margin = 3;
    if (Math.abs(e.x) > AW - margin || Math.abs(e.z) > AH - margin) e.angle = turnTowards(e.angle, Math.atan2(-e.z, -e.x), 3 * dt);
    const sp = 6.5 + ph * 1.8;
    e.vx = Math.cos(e.angle) * sp;
    e.vz = Math.sin(e.angle) * sp;
    if (e.t > 4.2 - ph) {
      e.state = 1;
      e.t = 0;
    }
  } else if (e.state === 1) {
    e.vx *= 0.9;
    e.vz *= 0.9;
    if (e.t < 0.6) e.angle = turnTowards(e.angle, want, 5 * dt);
    e.dirX = Math.cos(e.angle);
    e.dirZ = Math.sin(e.angle);
    if (e.t > 0.95) {
      e.state = 2;
      e.t = 0;
      w.emit({ t: 'charge', x: e.x, z: e.z });
    }
  } else {
    e.vx = e.dirX * (21 + ph * 3);
    e.vz = e.dirZ * (21 + ph * 3);
    if (e.t > 0.85 || Math.abs(e.x) > AW - 1.5 || Math.abs(e.z) > AH - 1.5) {
      e.state = 0;
      e.t = 0;
      e.angle = turnTowards(e.angle, Math.atan2(-e.z, -e.x), Math.PI);
      if (ph >= 1) ring(w, e, 14, 8, w.time);
    }
  }
  if (ph >= 1) {
    e.k[0] += dt;
    if (e.k[0] > 6) {
      e.k[0] = 0;
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        w.spawnEnemy('swarmer', e.x + Math.cos(a) * 3, e.z + Math.sin(a) * 3, { spawnT: 0.4 });
      }
    }
  }
}

function hydraSeg(w: World, e: Enemy, dt: number): void {
  if (e.state === 99) {
    // Death cascade after the head falls.
    e.t -= dt;
    if (e.t <= 0) {
      w.explodeAt(e.x, e.z, 1.8, 0, 0);
      w.killEnemy(e);
    }
    return;
  }
  const leader = w.enemyById(e.link);
  if (leader) {
    const dx = e.x - leader.x;
    const dz = e.z - leader.z;
    const d = Math.hypot(dx, dz) || 1;
    if (d > SPACING) {
      e.x = leader.x + (dx / d) * SPACING;
      e.z = leader.z + (dz / d) * SPACING;
    }
    e.angle = Math.atan2(-dz, -dx);
  }
  e.vx = 0;
  e.vz = 0;
  const head = w.enemies.find((o) => o.type === 'hydraHead');
  const ph = head ? head.gen : 0;
  e.t += dt;
  const period = ph >= 1 ? 2.4 : 3.8;
  if (e.t > period + (e.gen % 4) * 0.25) {
    e.t = 0;
    const a = e.angle + Math.PI / 2;
    w.fireEnemyBullet(e.x, e.z, a, 9, 1);
    w.fireEnemyBullet(e.x, e.z, a + Math.PI, 9, 1);
  }
}

export function hydraCascade(w: World): void {
  let i = 0;
  for (const s of w.enemies) {
    if (s.type !== 'hydraSeg' || s.dead) continue;
    s.state = 99;
    s.t = 0.15 + i++ * 0.12;
  }
}

// ---------------------------------------------------------------- ЯДРО

function core(w: World, e: Enemy, dt: number): void {
  const ph = checkPhase(w, e, [0.66, 0.33]);
  e.t += dt;
  // Slow Lissajous drift around the upper half of the arena.
  const tx = Math.sin(e.t * 0.3) * 9;
  const tz = -3 + Math.cos(e.t * 0.43) * 4;
  e.vx += (tx - e.x - e.vx) * Math.min(1, dt * 0.8);
  e.vz += (tz - e.z - e.vz) * Math.min(1, dt * 0.8);

  const lasering = w.beams.some((b) => b.owner === e.id);
  // k[0]: spiral cadence, k[1]: ring timer, k[2]: laser timer, k[3]: summon timer
  e.angle += dt * (1.3 + ph * 0.45);
  if (!lasering) {
    e.k[0] -= dt;
    if (e.k[0] <= 0) {
      e.k[0] = ph === 2 ? 0.075 : 0.11;
      const arms = 2 + ph;
      for (let i = 0; i < arms; i++) w.fireEnemyBullet(e.x, e.z, e.angle + (i / arms) * Math.PI * 2, 8.5 + ph, 1, 0.3, 6);
    }
  }
  e.k[1] += dt;
  if (e.k[1] > 5) {
    e.k[1] = 0;
    ring(w, e, 26, 7, e.angle);
    if (ph === 2) ring(w, e, 26, 5, e.angle + 0.12);
  }
  if (ph >= 1) {
    e.k[2] += dt;
    if (e.k[2] > 7.5) {
      e.k[2] = 0;
      const base = Math.atan2(w.player.z - e.z, w.player.x - e.x) + Math.PI / 2;
      const spin = (w.rng.next() < 0.5 ? -1 : 1) * (0.55 + ph * 0.1);
      const n = ph === 2 ? 3 : 2;
      for (let i = 0; i < n; i++)
        w.addBeam({ x: e.x, z: e.z, angle: base + (i / n) * Math.PI * 2, len: 36, width: 1.0, warm: 1.3, life: 3.2, spin, dmg: 1, owner: e.id });
    }
  }
  if (ph === 2) {
    e.k[3] += dt;
    if (e.k[3] > 8) {
      e.k[3] = 0;
      for (const s of [-1, 1]) w.spawnEnemy(w.rng.next() < 0.5 ? 'charger' : 'mine', e.x + s * 5, e.z + 2, { spawnT: 0.8 });
    }
  }
}

// ---------------------------------------------------------------- НУЛЕВОЙ ДЕНЬ

function zeroday(w: World, e: Enemy, dt: number): void {
  const p = w.player;
  const ph = checkPhase(w, e, [0.6, 0.25]);
  e.t += dt;
  const dx = p.x - e.x;
  const dz = p.z - e.z;
  const dist = Math.hypot(dx, dz) || 1;

  if (e.state === 0) {
    // Hunt with a weave.
    const side = Math.sin(w.time * 1.3);
    const tx = dx / dist + (-dz / dist) * side;
    const tz = dz / dist + (dx / dist) * side;
    const tl = Math.hypot(tx, tz) || 1;
    const sp = dist > 6 ? 5 + ph : -2;
    e.vx += ((tx / tl) * sp - e.vx) * Math.min(1, dt * 2);
    e.vz += ((tz / tl) * sp - e.vz) * Math.min(1, dt * 2);
    e.angle = Math.atan2(dz, dx);
    // Aimed triple shots.
    e.k[0] += dt;
    if (e.k[0] > (ph === 2 ? 0.8 : 1.3)) {
      e.k[0] = 0;
      for (let i = -1; i <= 1; i++) w.fireEnemyBullet(e.x, e.z, e.angle + i * 0.18, 15 + ph * 2, 1);
      w.emit({ t: 'shoot', x: e.x, z: e.z, team: 1 });
    }
    // Teleport.
    if (e.t > (ph === 0 ? 4.6 : 3.4)) {
      e.t = 0;
      let x = 0;
      let z = 0;
      for (let k = 0; k < 20; k++) {
        x = (w.rng.next() * 2 - 1) * (AW - 4);
        z = (w.rng.next() * 2 - 1) * (AH - 3);
        if (Math.hypot(x - p.x, z - p.z) > 9 && !w.insideObstacle(x, z, 2)) break;
      }
      w.emit({ t: 'explode', x: e.x, z: e.z, r: 2.5, team: 1 });
      e.x = x;
      e.z = z;
      e.vx = e.vz = 0;
      e.spawnT = 0.65;
      e.state = ph === 2 ? 2 : 1;
      w.emit({ t: 'spawn', x, z, type: 'zeroday' });
    }
  } else if (e.state === 1) {
    // Arrival burst.
    ring(w, e, 18 + ph * 6, 8, w.time);
    e.state = 0;
    e.t = 0;
  } else if (e.state === 2) {
    // Rage: three lunges.
    e.k[1] += dt;
    if (e.k[2] < 0.01) {
      e.vx *= 0.85;
      e.vz *= 0.85;
      e.dirX = dx / dist;
      e.dirZ = dz / dist;
      if (e.k[1] > 0.55) {
        e.k[1] = 0;
        e.k[2] = 1;
        w.emit({ t: 'charge', x: e.x, z: e.z });
      }
    } else {
      e.vx = e.dirX * 26;
      e.vz = e.dirZ * 26;
      if (e.k[1] > 0.45) {
        e.k[1] = 0;
        e.k[2] = 0;
        e.k[3]++;
        ring(w, e, 12, 7, w.time);
        if (e.k[3] >= 3) {
          e.k[3] = 0;
          e.state = 0;
          e.t = 0;
        }
      }
    }
  }

  // Phase 1+: rotating cross lasers and summons.
  if (ph >= 1) {
    e.t2 += dt;
    if (e.t2 > 9 && !w.beams.some((b) => b.owner === e.id)) {
      e.t2 = 0;
      const spin = (w.rng.next() < 0.5 ? -1 : 1) * (ph === 2 ? 0.45 : 0.38);
      const n = ph === 2 ? 4 : 3;
      for (let i = 0; i < n; i++)
        w.addBeam({ x: e.x, z: e.z, angle: (i / n) * Math.PI * 2 + w.time, len: 34, width: 0.9, warm: 1.5, life: 3.2, spin, dmg: 1, owner: e.id });
      const pick: EnemyType = ph === 2 ? 'charger' : 'sniper';
      for (const s of [-1, 1]) w.spawnEnemy(pick, e.x + s * 6, e.z, { spawnT: 0.9 });
      for (let i = 0; i < 8; i++) w.spawnEnemy('swarmer', e.x + Math.cos(i) * 4, e.z + Math.sin(i) * 4, { spawnT: 0.6 });
    }
  }
}
