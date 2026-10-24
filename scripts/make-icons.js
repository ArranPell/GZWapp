// Renders the PNG app icons from site/icons/icon.svg using Playwright's
// Chromium. Run once after changing the SVG: `node scripts/make-icons.js`.
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

const { chromium } = createRequire(import.meta.url)('playwright');

const dir = new URL('../site/icons/', import.meta.url).pathname;
const svg = readFileSync(`${dir}icon.svg`, 'utf8');
// Maskable icons get cropped to a circle by Android: full-bleed background,
// artwork shrunk into the central safe zone.
const maskable = svg
  .replace('rx="112"', 'rx="0"')
  .replace('<g ', '<g transform="translate(256 256) scale(0.72) translate(-256 -256)" ')
  .replace('<circle cx="256" cy="256" r="26"', '<circle cx="256" cy="256" r="19"');

const targets = [
  ['icon-192.png', svg, 192],
  ['icon-512.png', svg, 512],
  ['apple-touch-icon.png', maskable, 180],
  ['icon-maskable-512.png', maskable, 512],
];

const browser = await chromium.launch();
const page = await browser.newPage();
for (const [name, source, size] of targets) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<style>html,body{margin:0;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>${source}`);
  await page.screenshot({ path: `${dir}${name}`, omitBackground: true });
  console.log('wrote', name);
}
await browser.close();
