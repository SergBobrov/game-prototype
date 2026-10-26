// Records gameplay video in a visible Chromium window (real GPU). Usage: node tools/record.mjs <url> <seconds> <outDir>
import { chromium } from '@playwright/test';
const [url, secs = '25', out = 'video'] = process.argv.slice(2);
const browser = await chromium.launch({ headless: false, args: ['--ignore-gpu-blocklist', '--enable-gpu-rasterization'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, recordVideo: { dir: out, size: { width: 1280, height: 720 } } });
const page = await ctx.newPage();
await page.goto(url);
await page.waitForTimeout(parseFloat(secs) * 1000);
const fps = await page.evaluate(() => document.querySelector('.fps')?.textContent ?? '');
console.log('fps label:', fps);
await ctx.close();
console.log('video:', await page.video().path());
await browser.close();
