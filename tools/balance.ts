// Headless balance runs: the autopilot plays full runs without rendering.
// Usage: npx tsx tools/balance.ts [runs=20] [ship=vector] [skill=0.9]
import { Autopilot } from '../src/bot/autopilot';
import { TICK } from '../src/sim/config';
import type { ShipId } from '../src/sim/types';
import { World } from '../src/sim/world';

const runs = parseInt(process.argv[2] ?? '20', 10);
const ship = (process.argv[3] ?? 'vector') as ShipId;
const skill = parseFloat(process.argv[4] ?? '0.9');

interface Result {
  reached: number; // global wave index: sector * 6 + wave
  victory: boolean;
  time: number;
  kills: number;
  score: number;
  killer: string;
}

function play(seed: number): Result {
  const w = new World(seed, ship);
  const bot = new Autopilot(skill);
  let lastHitBy = '';
  const maxTicks = 60 * 60 * 40; // 40 minutes of game time
  for (let i = 0; i < maxTicks; i++) {
    w.step(TICK, bot.decide(w));
    for (const ev of w.events) if (ev.t === 'playerHit' && !ev.shield) lastHitBy = nearestThreat(w);
    w.events.length = 0;
    if (w.phase === 'upgrade') w.chooseUpgrade(bot.pickUpgrade(w));
    if (w.phase === 'dead' || w.phase === 'victory') break;
  }
  return {
    reached: w.sector * 6 + w.wave,
    victory: w.phase === 'victory',
    time: w.run.time,
    kills: w.run.kills,
    score: w.run.score,
    killer: w.phase === 'dead' ? lastHitBy : '',
  };
}

function nearestThreat(w: World): string {
  const p = w.player;
  let best = 'bullet';
  let bd = 2.5;
  for (const e of w.enemies) {
    const d = Math.hypot(e.x - p.x, e.z - p.z) - e.r;
    if (d < bd) {
      bd = d;
      best = e.type;
    }
  }
  if (w.beams.length) best = 'beam';
  return best;
}

const t0 = Date.now();
const results: Result[] = [];
for (let i = 0; i < runs; i++) results.push(play(1000 + i * 7919));
const label = (g: number) => (g >= 18 ? 'ПОБЕДА' : `С${Math.floor(g / 6) + 1}-${g % 6 === 5 ? 'БОСС' : 'В' + ((g % 6) + 1)}`);
const hist = new Map<string, number>();
for (const r of results) {
  const k = r.victory ? 'ПОБЕДА' : label(r.reached);
  hist.set(k, (hist.get(k) ?? 0) + 1);
}
const killers = new Map<string, number>();
for (const r of results) if (r.killer) killers.set(r.killer, (killers.get(r.killer) ?? 0) + 1);
const avg = (f: (r: Result) => number) => results.reduce((a, r) => a + f(r), 0) / results.length;
console.log(`ship=${ship} skill=${skill} runs=${runs} (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
console.log('victories:', results.filter((r) => r.victory).length);
console.log('bosses killed (avg):', avg((r) => Math.floor((r.reached + (r.victory ? 1 : 0)) / 6)).toFixed(2));
console.log('avg time min:', (avg((r) => r.time) / 60).toFixed(1), ' avg kills:', avg((r) => r.kills).toFixed(0), ' avg score:', avg((r) => r.score).toFixed(0));
console.log('ended at:', [...hist.entries()].sort().map(([k, v]) => `${k}:${v}`).join('  '));
console.log('killed by:', [...killers.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}:${v}`).join('  '));
