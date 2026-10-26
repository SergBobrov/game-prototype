import { ENEMIES } from './config';
import type { Enemy } from './types';
import type { World } from './world';

const SPLIT_HP = [22, 9, 4];
const SPLIT_R = [0.95, 0.66, 0.44];
const MAX_SWARM = 260;

function seek(w: World, e: Enemy, tx: number, tz: number, speed: number, accel: number, dt: number): void {
  const dx = tx - e.x;
  const dz = tz - e.z;
  const d = Math.hypot(dx, dz) || 1;
  const k = Math.min(1, accel * dt);
  e.vx += ((dx / d) * speed - e.vx) * k;
  e.vz += ((dz / d) * speed - e.vz) * k;
  void w;
}

function turnTowards(cur: number, want: number, rate: number): number {
  let diff = want - cur;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return cur + Math.max(-rate, Math.min(rate, diff));
}

export function updateEnemy(w: World, e: Enemy, dt: number): void {
  const p = w.player;
  const def = ENEMIES[e.type];
  const speed = def.speed * (e.elite ? 1.12 : 1);
  const dx = p.x - e.x;
  const dz = p.z - e.z;
  const dist = Math.hypot(dx, dz) || 1;
  e.t += dt;

  switch (e.type) {
    case 'swarmer': {
      // Boids: separation + alignment + cohesion, plus a pull towards the player.
      let sx = 0, sz = 0, ax = 0, az = 0, cx = 0, cz = 0, n = 0;
      w.queryEnemies(e.x, e.z, 2.4, (o) => {
        if (o === e || o.type !== 'swarmer') return;
        const ox = e.x - o.x;
        const oz = e.z - o.z;
        const d2 = ox * ox + oz * oz;
        if (d2 > 5.76 || d2 < 1e-6) return;
        n++;
        if (d2 < 0.8) {
          sx += ox / d2;
          sz += oz / d2;
        }
        ax += o.vx;
        az += o.vz;
        cx += o.x;
        cz += o.z;
        if (n > 10) return true;
      });
      let fx = (dx / dist) * 1.0;
      let fz = (dz / dist) * 1.0;
      if (n > 0) {
        fx += sx * 0.9 + (ax / n / speed) * 0.45 + ((cx / n - e.x) * 0.25);
        fz += sz * 0.9 + (az / n / speed) * 0.45 + ((cz / n - e.z) * 0.25);
      }
      // A little wander so the flock shimmers instead of marching in lockstep.
      fx += Math.sin(w.time * 3 + e.id) * 0.3;
      fz += Math.cos(w.time * 2.6 + e.id * 1.7) * 0.3;
      const fl = Math.hypot(fx, fz) || 1;
      const k = Math.min(1, 4 * dt);
      e.vx += ((fx / fl) * speed - e.vx) * k;
      e.vz += ((fz / fl) * speed - e.vz) * k;
      break;
    }
    case 'charger': {
      if (e.state === 0) {
        seek(w, e, p.x, p.z, speed, 3, dt);
        if (dist < 11 && e.t > 1.4) {
          e.state = 1;
          e.t = 0;
        }
      } else if (e.state === 1) {
        // Wind-up: stop and aim; the view draws the charge lane.
        e.vx *= 0.85;
        e.vz *= 0.85;
        if (e.t < 0.55) {
          e.dirX = dx / dist;
          e.dirZ = dz / dist;
        }
        if (e.t > 0.85) {
          e.state = 2;
          e.t = 0;
          w.emit({ t: 'charge', x: e.x, z: e.z });
        }
      } else if (e.state === 2) {
        const sp = 24 * (e.elite ? 1.15 : 1);
        e.vx = e.dirX * sp;
        e.vz = e.dirZ * sp;
        if (e.t > 0.75) {
          e.state = 3;
          e.t = 0.6;
        }
      } else {
        e.vx *= 0.85;
        e.vz *= 0.85;
        e.t -= dt * 2;
        if (e.t <= 0) {
          e.state = 0;
          e.t = 0;
        }
      }
      break;
    }
    case 'sniper': {
      if (e.state === 0) {
        // Keep 12–16 units away and strafe.
        const want = dist < 12 ? -1 : dist > 16 ? 1 : 0;
        const side = Math.sin(e.id * 7.3) > 0 ? 1 : -1;
        const tx = (dx / dist) * want + (-dz / dist) * 0.7 * side;
        const tz = (dz / dist) * want + (dx / dist) * 0.7 * side;
        const tl = Math.hypot(tx, tz) || 1;
        const k = Math.min(1, 3 * dt);
        e.vx += ((tx / tl) * speed - e.vx) * k;
        e.vz += ((tz / tl) * speed - e.vz) * k;
        if (e.t > 2.4) {
          e.state = 1;
          e.t = 0;
        }
      } else if (e.state === 1) {
        e.vx *= 0.88;
        e.vz *= 0.88;
        e.angle = turnTowards(e.angle, Math.atan2(dz, dx), 2.2 * dt);
        if (e.t > 1.0) {
          e.state = 2;
          e.t = 0;
        }
      } else if (e.state === 2) {
        if (e.t > 0.32) {
          w.fireEnemyBullet(e.x, e.z, e.angle, 38, 1, 0.3, 2);
          w.emit({ t: 'snipe', x: e.x, z: e.z });
          if (e.elite) w.fireEnemyBullet(e.x, e.z, e.angle + 0.12, 38, 1, 0.3, 2);
          if (e.elite) w.fireEnemyBullet(e.x, e.z, e.angle - 0.12, 38, 1, 0.3, 2);
          e.state = 0;
          e.t = 0;
        }
      }
      break;
    }
    case 'hive': {
      seek(w, e, p.x * 0.5, p.z * 0.5, speed, 1, dt);
      if (e.t > (e.elite ? 2.6 : 3.6)) {
        e.t = 0;
        const swarm = w.enemies.filter((o) => o.type === 'swarmer').length;
        const n = Math.min(4, MAX_SWARM - swarm);
        for (let i = 0; i < n; i++) {
          const a = (i / 4) * Math.PI * 2 + w.time;
          w.spawnEnemy('swarmer', e.x + Math.cos(a) * 1.8, e.z + Math.sin(a) * 1.8, { spawnT: 0.35 });
        }
      }
      break;
    }
    case 'shielder': {
      seek(w, e, p.x, p.z, dist > 5 ? speed : speed * 0.3, 2, dt);
      e.angle = turnTowards(e.angle, Math.atan2(dz, dx), 1.2 * dt);
      if (e.k[1] > 0) {
        e.k[1] -= dt;
        if (e.k[1] <= 0) e.k[0] = e.k[2];
      }
      if (e.t > 2.7) {
        e.t = 0;
        const n = e.elite ? 5 : 3;
        for (let i = 0; i < n; i++) w.fireEnemyBullet(e.x, e.z, e.angle + (i - (n - 1) / 2) * 0.22, 13, 1);
        w.emit({ t: 'shoot', x: e.x, z: e.z, team: 1 });
      }
      break;
    }
    case 'splitter': {
      const weave = Math.sin(w.time * 2.5 + e.id) * 0.8;
      const tx = p.x + (-dz / dist) * weave * 3;
      const tz = p.z + (dx / dist) * weave * 3;
      seek(w, e, tx, tz, speed * (1 + e.gen * 0.35), 2.5, dt);
      break;
    }
    case 'mine': {
      if (e.state === 0) {
        seek(w, e, p.x, p.z, speed, 1.5, dt);
        if (dist < 3.4) {
          e.state = 1;
          e.t = 0;
        }
      } else {
        e.vx *= 0.9;
        e.vz *= 0.9;
        if (e.t > 0.95) {
          // Detonation is not a kill for the player: no score, no drops.
          e.dead = true;
          w.emit({ t: 'kill', x: e.x, z: e.z, type: e.type, r: e.r, elite: e.elite });
          w.explodeAt(e.x, e.z, 3.3, 2, 1);
        }
      }
      break;
    }
    default:
      break;
  }
}

export function onEnemyDeath(w: World, e: Enemy): void {
  if (e.type === 'hydraSeg') {
    // Close the gap in the chain: followers of the dead segment now follow its leader.
    for (const o of w.enemies) if (o.link === e.id) o.link = e.link;
  }
  if (e.type === 'splitter' && e.gen < 2) {
    for (let i = 0; i < 2; i++) {
      const a = w.rng.next() * Math.PI * 2;
      const c = w.spawnEnemy('splitter', e.x + Math.cos(a) * 0.6, e.z + Math.sin(a) * 0.6, {
        gen: e.gen + 1,
        hp: SPLIT_HP[e.gen + 1] * w.hpScale * (e.elite ? 2 : 1),
        elite: e.elite,
      });
      c.r = SPLIT_R[e.gen + 1] * (e.elite ? 1.2 : 1);
      c.vx = Math.cos(a) * 9;
      c.vz = Math.sin(a) * 9;
    }
  }
  if (e.type === 'mine' && e.state !== 1) {
    // Shot mines pop harmlessly for the player but still damage nearby viruses.
    w.explodeAt(e.x, e.z, 3, 18, 0);
  }
}
