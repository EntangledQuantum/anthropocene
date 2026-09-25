// Usage: node node_modules/.agent-tools/shoot.mjs <distDir> <route> <outPrefix> [maxShots]
// Serves distDir statically, opens <route>?all (every step shown), scrolls through it,
// hydrates islands, and writes <outPrefix>-N.png viewport screenshots. Prints page errors.
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
const [, , DIST, route, prefix, maxShots] = process.argv;
const BASE = '/anthropocene';
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.json': 'application/json', '.wasm': 'application/wasm' };
const srv = createServer((req, res) => { let p = decodeURIComponent(req.url.split('?')[0]); if (p.startsWith(BASE)) p = p.slice(BASE.length) || '/'; let f = normalize(join(DIST, p)); if (existsSync(f) && statSync(f).isDirectory()) f = join(f, 'index.html'); if (!existsSync(f)) { res.writeHead(404).end(); return; } res.writeHead(200, { 'content-type': MIME[extname(f)] || 'application/octet-stream' }); createReadStream(f).pipe(res); });
await new Promise((r) => srv.listen(0, r));
const port = srv.address().port;
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
const pg = await b.newPage({ viewport: { width: 1300, height: 1000 } });
const errs = []; pg.on('pageerror', (e) => errs.push(e.message)); pg.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
const url = `http://localhost:${port}${BASE}${route.endsWith('/') ? route : route + '/'}?all`;
const resp = await pg.goto(url);
if (!resp || resp.status() !== 200) { console.log('HTTP', resp?.status(), url); process.exit(1); }
const H = await pg.evaluate(() => document.body.scrollHeight);
for (let y = 0; y < H; y += 500) { await pg.evaluate((y) => window.scrollTo(0, y), y); await pg.waitForTimeout(120); }
let i = 0;
for (let y = 0; y < H && i < (+maxShots || 16); y += 950, i++) {
  await pg.evaluate((y) => window.scrollTo(0, y), y); await pg.waitForTimeout(600);
  await pg.screenshot({ path: `${prefix}-${String(i).padStart(2, '0')}.png` });
}
const unhydrated = await pg.evaluate(() => [...document.querySelectorAll('astro-island')].filter((e) => e.hasAttribute('ssr')).length);
console.log(JSON.stringify({ url, height: H, shots: i, unhydratedIslands: unhydrated, errors: errs }, null, 1));
await b.close(); srv.close();
