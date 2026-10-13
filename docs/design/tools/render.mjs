// Renders every mockup in docs/design/mockups/*.html at 412x915 (1x CSS px, 2x device scale)
// in light and dark into docs/design/screens/<name>-<theme>.png.
// Usage: node docs/design/tools/render.mjs [name ...]
// Needs playwright-core (npm i --no-save playwright-core) and Chromium; set CHROMIUM_PATH
// if it is not at /opt/pw-browsers/chromium-1194/chrome-linux/chrome.
import { chromium } from 'playwright-core';
import { readdirSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname } from 'node:path';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const mockups = join(root, 'mockups');
const out = join(root, 'screens');
mkdirSync(out, { recursive: true });

const candidates = [
  process.env.CHROMIUM_PATH,
  '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  '/opt/pw-browsers/chromium/chrome-linux/chrome',
].filter(Boolean);
const executablePath = candidates.find((p) => existsSync(p));

const only = process.argv.slice(2);
const pages = readdirSync(mockups)
  .filter((f) => f.endsWith('.html') && !f.startsWith('_'))
  .map((f) => f.replace(/\.html$/, ''))
  .filter((n) => only.length === 0 || only.includes(n));

// Served over HTTP because Chromium blocks <use href="icons.svg#..."> across file:// URLs.
const types = { '.html': 'text/html', '.css': 'text/css', '.svg': 'image/svg+xml', '.ttf': 'font/ttf', '.jpg': 'image/jpeg', '.png': 'image/png' };
const server = createServer((req, res) => {
  const file = join(mockups, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (!file.startsWith(mockups) || !existsSync(file)) { res.writeHead(404).end(); return; }
  res.writeHead(200, { 'Content-Type': types[extname(file)] ?? 'application/octet-stream' }).end(readFileSync(file));
}).listen(0);
const base = `http://127.0.0.1:${server.address().port}`;

const browser = await chromium.launch({ executablePath });
for (const theme of ['light', 'dark']) {
  const ctx = await browser.newContext({
    viewport: { width: 412, height: 915 },
    deviceScaleFactor: 2,
    colorScheme: theme,
    reducedMotion: 'reduce',
  });
  const page = await ctx.newPage();
  for (const name of pages) {
    await page.goto(`${base}/${name}.html`);
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(150);
    await page.screenshot({ path: join(out, `${name}-${theme}.png`) });
    console.log(`${name}-${theme}.png`);
  }
  await ctx.close();
}
await browser.close();
server.close();
