// Renders app/assets/src/mark.svg into the launcher icon, adaptive layers, splash and favicon.
// Usage: PLAYWRIGHT_CORE=/path/to/node_modules/playwright-core node scripts/render-icons.mjs
// (needs playwright-core and Chromium; CHROMIUM_PATH overrides the browser location).
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const { chromium } = await import(process.env.PLAYWRIGHT_CORE ? pathToFileURL(join(process.env.PLAYWRIGHT_CORE, 'index.mjs')).href : 'playwright-core');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const mark = readFileSync(join(root, 'assets/src/mark.svg'), 'utf8').replace(/<!--[\s\S]*?-->/, '');
const executablePath = [process.env.CHROMIUM_PATH, '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium/chrome-linux/chrome'].find(
  (p) => p && existsSync(p),
);

const DECK = '#FFD12E';
const targets = [
  // [file, size, background, css vars, scale of the mark]
  ['icon.png', 1024, DECK, '', 1.18],
  ['android-icon-foreground.png', 1024, 'transparent', '', 1],
  ['android-icon-monochrome.png', 1024, 'transparent', '--ink:#FFFFFF;--rec:transparent;--track:rgba(255,255,255,0.4)', 1],
  ['splash-icon.png', 1024, 'transparent', '', 1.25],
  ['favicon.png', 96, DECK, '', 1.35],
];

const browser = await chromium.launch({ executablePath });
const page = await browser.newPage({ deviceScaleFactor: 1 });
for (const [file, size, bg, vars, scale] of targets) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<!doctype html><html><body style="margin:0;background:${bg}">
    <div style="width:${size}px;height:${size}px;display:flex;align-items:center;justify-content:center;overflow:hidden;${vars}">
      <div style="width:${size * scale}px;height:${size * scale}px;flex:none">${mark.replace('width="1024" height="1024"', 'width="100%" height="100%"')}</div>
    </div></body></html>`);
  await page.screenshot({ path: join(root, 'assets', file), omitBackground: bg === 'transparent' });
  console.log('wrote', file);
}
await browser.close();
