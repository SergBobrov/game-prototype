// Offline check: load once online, wait for the service worker, go offline, reload, expect the game to boot.
import { chromium } from '@playwright/test';
const base = process.argv[2] ?? 'http://localhost:4173/game-prototype/';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(base);
await page.evaluate(() => navigator.serviceWorker.ready);
await page.waitForTimeout(1500);
await ctx.setOffline(true);
await page.reload();
await page.waitForTimeout(3000);
const ok = await page.evaluate(() => ({ title: document.title, booted: !!window.__game, mode: window.__game?.mode }));
console.log('offline reload:', JSON.stringify(ok), errors.length ? 'errors: ' + errors.join(' | ') : 'no page errors');
await browser.close();
process.exit(ok.booted && !errors.length ? 0 : 1);
