import { describe, expect, it } from 'vitest';
import { World } from '../../src/sim/world';
import { emptyInput } from '../../src/sim/types';
import { TICK } from '../../src/sim/config';

function runFor(w: World, seconds: number, aiFire = true): void {
  const steps = Math.round(seconds / TICK);
  for (let i = 0; i < steps; i++) {
    const inp = emptyInput();
    const t = w.nearestEnemy(w.player.x, w.player.z, 99);
    if (t) {
      inp.aimX = t.x;
      inp.aimZ = t.z;
    }
    inp.fire = aiFire;
    inp.moveX = Math.sin(i / 50);
    inp.moveZ = Math.cos(i / 70);
    inp.dash = i % 120 === 0;
    inp.emp = i % 300 === 0;
    w.step(TICK, inp);
    w.events.length = 0;
    if (w.phase === 'upgrade') w.chooseUpgrade(w.offer[0].id);
    if (w.phase === 'dead' || w.phase === 'victory') return;
  }
}

describe('world', () => {
  it('runs waves without throwing and kills enemies', () => {
    const w = new World(1);
    w.player.hp = 9999;
    runFor(w, 120);
    expect(w.run.kills).toBeGreaterThan(20);
    expect(w.wave + w.sector * 6).toBeGreaterThan(1);
  });

  for (const sector of [0, 1, 2]) {
    it(`boss of sector ${sector} can be fought and killed`, () => {
      const w = new World(7, 'vector', { sector, wave: 5 });
      w.player.hp = 99999;
      w.stats.damage = 40;
      w.stats.fireRate = 20;
      runFor(w, 240);
      expect(w.run.bossesKilled).toBeGreaterThanOrEqual(1);
    });
  }

  it('upgrades apply to stats', () => {
    const w = new World(3);
    w.phase = 'upgrade';
    const before = w.stats.fireRate;
    w.chooseUpgrade('rate');
    expect(w.stats.fireRate).toBeGreaterThan(before);
  });

  it('is deterministic for the same seed and inputs', () => {
    const a = new World(42);
    const b = new World(42);
    runFor(a, 30);
    runFor(b, 30);
    expect(a.run.score).toBe(b.run.score);
    expect(a.player.x).toBe(b.player.x);
  });
});
