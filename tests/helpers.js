// Serves the repo root over localhost and opens index.html in headless
// Chromium. Every request that isn't to localhost (Google Fonts etc.) gets
// an empty response, so the tests are offline, fast and deterministic.
import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const TYPES = { '.html': 'text/html', '.svg': 'image/svg+xml', '.png': 'image/png' };

function startServer() {
  const server = createServer(async (req, res) => {
    const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname));
    const file = join(ROOT, path === '/' ? 'index.html' : path);
    if (!file.startsWith(ROOT)) { res.writeHead(403).end(); return; }
    try {
      const body = await readFile(file);
      res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream' }).end(body);
    } catch {
      res.writeHead(404).end();
    }
  });
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server)));
}

// Uses the sandbox's pre-installed Chromium when present; otherwise
// Playwright's own download (npx playwright install chromium).
const PREINSTALLED = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

export async function openSite() {
  const server = await startServer();
  const { port } = server.address();
  const browser = await chromium.launch(existsSync(PREINSTALLED) ? { executablePath: PREINSTALLED } : {});
  const page = await browser.newPage();

  const errors = [];
  page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
  page.on('console', m => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
  await page.route('**/*', route =>
    new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.fulfill({ status: 200, body: '' }));

  await page.goto(`http://127.0.0.1:${port}/`);
  return {
    page,
    errors,
    async close() { await browser.close(); server.close(); },
  };
}
