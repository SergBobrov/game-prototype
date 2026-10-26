// Renders the app icon (pure SVG) to PNGs with Playwright. Usage: node tools/make-icons.mjs
import { webkit } from '@playwright/test';

const svg = (pad) => `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <radialGradient id="bg" cx="50%" cy="45%" r="70%"><stop offset="0" stop-color="#0b1a3a"/><stop offset="1" stop-color="#020309"/></radialGradient>
    <filter id="g" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="10" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
  </defs>
  <rect width="512" height="512" fill="url(#bg)"/>
  <g transform="translate(256 256) scale(${1 - pad})">
    <g stroke="#1a8cff" stroke-opacity="0.35" stroke-width="2">
      ${Array.from({ length: 9 }, (_, i) => `<line x1="${-200 + i * 50}" y1="-200" x2="${-200 + i * 50}" y2="200"/><line x1="-200" y1="${-200 + i * 50}" x2="200" y2="${-200 + i * 50}"/>`).join('')}
    </g>
    <polygon points="0,-190 165,-95 165,95 0,190 -165,95 -165,-95" fill="none" stroke="#22e6ff" stroke-width="16" filter="url(#g)"/>
    <polygon points="0,-120 70,80 0,45 -70,80" fill="#e8f6ff" filter="url(#g)"/>
    <polygon points="0,-120 70,80 0,45 -70,80" fill="none" stroke="#22e6ff" stroke-width="6"/>
    <circle cx="0" cy="70" r="16" fill="#ff3df2" filter="url(#g)"/>
    <path d="M -150 -150 L -110 -150 M 150 150 L 110 150" stroke="#ff3df2" stroke-width="10" filter="url(#g)"/>
  </g>
</svg>`;

const browser = await webkit.launch();
const page = await browser.newPage({ viewport: { width: 512, height: 512 } });
const out = [
  ['public/icons/icon-512.png', 512, 0],
  ['public/icons/icon-192.png', 192, 0],
  ['public/icons/apple-touch-icon.png', 180, 0.05],
  ['public/icons/maskable-512.png', 512, 0.22],
  ['public/favicon.png', 64, 0],
];
for (const [path, size, pad] of out) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<html><body style="margin:0;background:#020309">${svg(pad).replace('width="512" height="512"', `width="${size}" height="${size}"`)}</body></html>`);
  await page.screenshot({ path, clip: { x: 0, y: 0, width: size, height: size } });
}
await browser.close();
console.log('icons written');
