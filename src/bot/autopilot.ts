import { AH, AW } from '../sim/config';
import type { Enemy, Input } from '../sim/types';
import type { World } from '../sim/world';

/** Upgrade preference: offence first, then survivability. Lower index = picked first. */
const PRIORITY = ['drone', 'fan', 'dmg', 'rate', 'pierce', 'chain', 'missile', 'boom', 'hp', 'shield', 'bounce', 'crit', 'homing', 'focus', 'dash2', 'vamp', 'speed', 'blade', 'emp', 'magnet'];

const THREAT: Record<string, number> = {
  sniper: 3,
  charger: 2.5,
  mine: 2.2,
  shielder: 1.6,
  hive: 1.8,
  splitter: 1.2,
  swarmer: 1,
  hydraHead: 2,
  hydraSeg: 1.4,
  core: 2,
  zeroday: 2.5,
};

/**
 * A steering-behaviour pilot. Used for the title-screen attract mode and for headless balance runs.
 * It reads the world but never mutates it, and has no randomness of its own, so runs stay reproducible.
 */
export class Autopilot {
  /** 0..1, scales reaction quality. 1 = best effort. */
  constructor(public skill = 1) {}

  pickUpgrade(w: World): string {
    const ids = w.offer.map((o) => o.id);
    ids.sort((a, b) => PRIORITY.indexOf(a) - PRIORITY.indexOf(b));
    return ids[0];
  }

  private target(w: World): Enemy | null {
    const p = w.player;
    let best: Enemy | null = null;
    let bestScore = -Infinity;
    for (const e of w.enemies) {
      if (e.spawnT > 0) continue;
      const d = Math.hypot(e.x - p.x, e.z - p.z);
      let score = (THREAT[e.type] ?? 1) * 10 - d;
      if (e.type === 'hydraHead' && w.enemies.some((s) => s.type === 'hydraSeg')) score -= 25;
      if (e.type === 'shielder') {
        // Only worth shooting from behind or the side.
        let diff = Math.atan2(p.z - e.z, p.x - e.x) - e.angle;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        if (Math.abs(diff) < 1.2) score -= 15;
      }
      if (score > bestScore) {
        bestScore = score;
        best = e;
      }
    }
    return best;
  }

  decide(w: World): Input {
    const p = w.player;
    const inp: Input = { moveX: 0, moveZ: 0, aimX: p.x, aimZ: p.z - 5, fire: false, dash: false, emp: false };
    if (!p.alive) return inp;

    const t = this.target(w);
    if (t) {
      const d = Math.hypot(t.x - p.x, t.z - p.z);
      const lead = (d / w.stats.bulletSpeed) * this.skill;
      inp.aimX = t.x + t.vx * lead;
      inp.aimZ = t.z + t.vz * lead;
      inp.fire = true;
    }

    let fx = 0;
    let fz = 0;
    let danger = 0;
    let dodgeX = 0;
    let dodgeZ = 0;

    // Enemies: keep away, more for dangerous ones; strafe around the target.
    for (const e of w.enemies) {
      if (e.spawnT > 0.4) continue;
      const dx = p.x - e.x;
      const dz = p.z - e.z;
      const d = Math.hypot(dx, dz) || 0.01;
      const reach = e.r + p.r;
      const keep = e.type === 'swarmer' || e.type === 'hydraSeg' ? 3.2 : e.type === 'core' ? 9 : 5.5;
      if (d < keep + reach) {
        const k = ((keep + reach - d) / keep) * (THREAT[e.type] ?? 1);
        fx += (dx / d) * k * 2.2;
        fz += (dz / d) * k * 2.2;
      }
      if (d < reach + 1.2) danger += 2;
      // Charge lanes: step sideways out of the lane.
      if ((e.type === 'charger' && e.state >= 1 && e.state <= 2) || (e.type === 'hydraHead' && e.state >= 1) || (e.type === 'zeroday' && e.state === 2)) {
        const along = dx * e.dirX + dz * e.dirZ;
        const side = -dx * e.dirZ + dz * e.dirX;
        if (along > -1 && along < 22 && Math.abs(side) < e.r + 1.6) {
          const s = side >= 0 ? 1 : -1;
          fx += -e.dirZ * s * 6;
          fz += e.dirX * s * 6;
          if (e.state === 2 || (e.type === 'charger' && e.t > 0.6)) {
            danger += 3;
            dodgeX = -e.dirZ * s;
            dodgeZ = e.dirX * s;
          }
        }
      }
      if (e.type === 'sniper' && e.state === 2) {
        const ca = Math.cos(e.angle);
        const sa = Math.sin(e.angle);
        const side = -dx * sa + dz * ca;
        const s = side >= 0 ? 1 : -1;
        fx += -sa * s * 4;
        fz += ca * s * 4;
        if (Math.abs(side) < 1.2 && e.t > 0.2) {
          danger += 3;
          dodgeX = -sa * s;
          dodgeZ = ca * s;
        }
      }
      if (e.type === 'mine' && e.state === 1 && d < 4.2) {
        fx += (dx / d) * 8;
        fz += (dz / d) * 8;
        if (e.t > 0.6) {
          danger += 3;
          dodgeX = dx / d;
          dodgeZ = dz / d;
        }
      }
    }

    // Enemy bullets: sidestep perpendicular to their path.
    for (const b of w.bullets) {
      if (b.team !== 1) continue;
      const dx = p.x - b.x;
      const dz = p.z - b.z;
      const sp = Math.hypot(b.vx, b.vz) || 1;
      const ux = b.vx / sp;
      const uz = b.vz / sp;
      const along = dx * ux + dz * uz;
      if (along < 0 || along > 9) continue;
      const side = -dx * uz + dz * ux;
      const miss = Math.abs(side) - p.r - b.r;
      if (miss > 1.6) continue;
      const s = side >= 0 ? 1 : -1;
      const urgency = (1.6 - miss) * (1 - along / 10);
      fx += -uz * s * urgency * 3;
      fz += ux * s * urgency * 3;
      const tHit = along / sp;
      if (miss < 0.15 && tHit < 0.2 * this.skill + 0.05) {
        danger += 3;
        dodgeX = -uz * s;
        dodgeZ = ux * s;
      }
    }

    // Boss lasers.
    for (const bm of w.beams) {
      const ca = Math.cos(bm.angle);
      const sa = Math.sin(bm.angle);
      const dx = p.x - bm.x;
      const dz = p.z - bm.z;
      const along = dx * ca + dz * sa;
      const side = -dx * sa + dz * ca;
      if (along < 0 || along > bm.len) continue;
      // Move against the sweep direction, away from the line.
      const s = side >= 0 ? 1 : -1;
      const close = Math.max(0, 4 - Math.abs(side));
      fx += -sa * s * close * 2.5 - dx * 0.02;
      fz += ca * s * close * 2.5 - dz * 0.02;
      if (Math.abs(side) < bm.width + 0.8 && bm.warm < 0.2) {
        danger += 3;
        dodgeX = -sa * s;
        dodgeZ = ca * s;
      }
    }

    // Preferred range to the target: orbit it.
    if (t) {
      const dx = p.x - t.x;
      const dz = p.z - t.z;
      const d = Math.hypot(dx, dz) || 1;
      const want = t.type === 'core' ? 12 : t.type === 'swarmer' ? 8 : 9;
      const radial = (d - want) * -0.25;
      fx += (dx / d) * radial + (-dz / d) * 0.9;
      fz += (dz / d) * radial + (dx / d) * 0.9;
    }

    // Walls and obstacles.
    const wall = (dist: number) => (dist < 4 ? (4 - dist) * 1.6 : 0);
    fx += wall(p.x + AW) - wall(AW - p.x);
    fz += wall(p.z + AH) - wall(AH - p.z);
    for (const o of w.obstacles) {
      const dx = p.x - o.x;
      const dz = p.z - o.z;
      const d = Math.hypot(dx, dz) || 1;
      if (d < o.r + 2.5) {
        fx += (dx / d) * (o.r + 2.5 - d) * 1.5;
        fz += (dz / d) * (o.r + 2.5 - d) * 1.5;
      }
    }

    // Pickups when it is calm; heals when hurt.
    for (const k of w.pickups) {
      const dx = k.x - p.x;
      const dz = k.z - p.z;
      const d = Math.hypot(dx, dz) || 1;
      if (d > 12) continue;
      const want = k.kind === 'heal' ? (p.hp < w.stats.maxHp ? 3 : 0) : danger > 0 ? 0 : 0.15;
      fx += (dx / d) * want;
      fz += (dz / d) * want;
    }

    const fl = Math.hypot(fx, fz);
    if (fl > 0.05) {
      inp.moveX = fx / Math.max(1, fl);
      inp.moveZ = fz / Math.max(1, fl);
    }
    if (danger >= 3 && p.dashCharges > 0 && (dodgeX || dodgeZ)) {
      inp.dash = true;
      inp.moveX = dodgeX;
      inp.moveZ = dodgeZ;
    } else if (danger >= 2 && p.dashCharges > 0 && fl > 0.5 && p.invuln <= 0) {
      inp.dash = true;
    }

    if (p.empCharge >= 1) {
      let near = 0;
      for (const e of w.enemies) if (Math.hypot(e.x - p.x, e.z - p.z) < 7) near++;
      let shots = 0;
      for (const b of w.bullets) if (b.team === 1 && Math.hypot(b.x - p.x, b.z - p.z) < 6) shots++;
      if (near >= 10 || shots >= 8 || (p.hp <= 2 && near + shots >= 4)) inp.emp = true;
    }
    return inp;
  }
}
