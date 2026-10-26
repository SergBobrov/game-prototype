// Visual smoke test: opens the game in headless Chromium, collects console errors, saves screenshots.
// Usage: node tools/shoot.mjs <baseUrl> <outDir> [scenario...]
// Scenarios: title, play, boss1, boss2, boss3, upgrade
import { chromium } from '@playwright/test';
import fs from 'node:fs';

const base = process.argv[2] ?? 'http://localhost:4173/game-prototype/';
const out = process.argv[3] ?? 'shots';
const scenarios = process.argv.slice(4).length ? process.argv.slice(4) : ['title', 'play', 'boss1', 'boss2', 'boss3'];
fs.mkdirSync(out, { recursive: true });

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
let failed = false;
for (const sc of scenarios) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push('console: ' + m.text()));
  const q = {
    title: '',
    play: '?autoplay=1&fps=1',
    boss1: '?autoplay=1&sector=0&wave=5&fps=1',
    boss2: '?autoplay=1&sector=1&wave=5&fps=1',
    boss3: '?autoplay=1&sector=2&wave=5&fps=1',
    upgrade: '?play=1',
  }[sc];
  await page.goto(base + q);
  await page.waitForTimeout(sc === 'title' ? 4000 : 9000);
  if (sc === 'upgrade') {
    await page.evaluate(() => {
      const g = window.__game;
      g.world.phase = 'upgrade';
      g.world.offer = g.world.offer.length ? g.world.offer : [];
    });
  }
  await page.screenshot({ path: `${out}/${sc}.png` });
  if (sc !== 'title') {
    await page.waitForTimeout(6000);
    await page.screenshot({ path: `${out}/${sc}-2.png` });
  }
  const info = await page.evaluate(() => {
    const g = window.__game;
    return g ? { mode: g.mode, phase: g.world.phase, sector: g.world.sector, wave: g.world.wave, enemies: g.world.enemies.length, hp: g.world.player.hp } : null;
  });
  console.log(sc, JSON.stringify(info), errors.length ? 'ERRORS:\n  ' + errors.join('\n  ') : 'no errors');
  if (errors.length) failed = true;
  await page.close();
}
await browser.close();
process.exit(failed ? 1 : 0);
