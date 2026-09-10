/**
 * Regenerates the landing-page screenshot that README embeds.
 *
 *   npm run screenshot                       # landing page -> docs/landing.png
 *   npm run screenshot -- <path> <name>      # any route -> docs/<name>.png
 *
 * Serves `dist/` and captures at desktop width. Run this whenever the landing
 * page or the design system changes — a README showing an old design is worse
 * than one showing none.
 *
 * Headed Chromium is required: the landing background is a WebGL point cloud,
 * and the headless shell has no GPU, so a headless capture would show an
 * empty hero.
 */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { createReadStream, existsSync, mkdirSync, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const DIST = join(ROOT, 'dist');
const OUT_DIR = join(ROOT, 'docs');
const PORT = 4399;
const BASE = '/anthropocene';
const URL_ = `http://localhost:${PORT}${BASE}/`;

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.json': 'application/json',
  '.wasm': 'application/wasm',
};

/* A minimal static server rather than `astro preview`: preview holds a
   singleton lock, so a stray instance from another session makes this script
   fail for reasons that have nothing to do with the screenshot. */
function serve() {
  return createServer((req, res) => {
    let path = decodeURIComponent((req.url ?? '/').split('?')[0]);
    if (path.startsWith(BASE)) path = path.slice(BASE.length) || '/';

    let file = normalize(join(DIST, path));
    if (!file.startsWith(DIST)) { res.writeHead(403).end(); return; }
    if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
    if (!existsSync(file)) { res.writeHead(404).end('not found'); return; }

    res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' });
    createReadStream(file).pipe(res);
  });
}

async function main() {
  if (!existsSync(join(DIST, 'index.html'))) {
    throw new Error('dist/ is empty — run "npm run build" first');
  }
  mkdirSync(OUT_DIR, { recursive: true });

  // Optional route + output name, so this doubles as a general capture tool.
  const [routeArg, nameArg] = process.argv.slice(2).filter((a) => !a.startsWith('-'));
  const route = routeArg ?? '/';
  const name = nameArg ?? 'landing';
  const target = `http://localhost:${PORT}${BASE}${route.startsWith('/') ? route : `/${route}`}`;

  const server = serve();
  await new Promise<void>((r) => server.listen(PORT, r));

  try {
    const browser = await chromium.launch({
      headless: false,               // the hero needs a real GPU context
      args: ['--hide-scrollbars', '--force-color-profile=srgb'],
    });
    const page = await browser.newPage({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 2,
      colorScheme: 'dark',
    });

    await page.goto(target, { waitUntil: 'networkidle' });
    // Let the attractor integrate, fade in, and settle.
    await wait(5000);

    await page.screenshot({ path: join(OUT_DIR, `${name}.png`) });
    console.log(`wrote docs/${name}.png  (${target})`);

    await browser.close();
  } finally {
    server.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
