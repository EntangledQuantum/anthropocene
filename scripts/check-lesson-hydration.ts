import assert from 'node:assert/strict';
import { chromium } from 'playwright';

// Run against a completed static build served by `npm run preview`.
// A nested, initially hidden island must not swallow Astro's directive script.
const base = process.argv[2] ?? 'http://127.0.0.1:4322/anthropocene';
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1100, height: 2600 } });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`${base.replace(/\/$/, '')}/learn/university-physics/motion-in-space/acceleration-need-not-point-where-you-are-going/`);

  const prediction = page.locator('astro-island[component-url*="/Predict."]').first();
  await page.waitForFunction(() =>
    document.querySelector('astro-island[component-url*="/Predict."]')?.hasAttribute('ssr') === false,
  );
  assert.equal(await prediction.locator('figure').isVisible(), false, 'Payoff must stay hidden before commitment');
  await prediction.getByRole('button', { name: /Speeding up$/ }).click();
  await prediction.getByRole('button', { name: 'commit prediction', exact: true }).click();
  await prediction.locator('figure').waitFor({ state: 'visible' });
  await page.waitForFunction(() => {
    const island = document.querySelector('astro-island[component-url*="/Predict."] astro-island');
    const canvas = island?.querySelector('canvas');
    return island && !island.hasAttribute('ssr') && canvas && canvas.width > 300;
  });
  await prediction.getByRole('button', { name: 'pause', exact: true }).click();
  await prediction.getByRole('button', { name: 'reset', exact: true }).click();
  const play = prediction.getByRole('button', { name: 'play', exact: true });
  if (await play.count()) await play.click();
  // The acceleration points left while v points up-left: speed must grow.
  await page.waitForFunction(() => {
    const figure = document.querySelector('astro-island[component-url*="/Predict."] figure');
    const speed = figure?.textContent?.match(/speed \|v\|([\d.]+) m\/s/i);
    return speed !== null && speed !== undefined && Number(speed[1]) > 7;
  });
  await prediction.getByRole('button', { name: 'pause', exact: true }).click();

  const tune = page.locator('astro-island[component-url*="/Tune."]');
  await tune.getByRole('slider').fill('90');
  await tune.getByRole('button', { name: 'check', exact: true }).click();
  assert.match(await tune.innerText(), /found it/i);

  const rank = page.locator('astro-island[component-url*="/RankOrder."]');
  await rank.locator('button').first().scrollIntoViewIfNeeded();
  await page.waitForFunction(() =>
    document.querySelector('astro-island[component-url*="/RankOrder."]')?.hasAttribute('ssr') === false,
  );
  assert.deepEqual(errors, [], 'No browser page errors');
  console.log('PASS: prediction gating, nested hydration, animation, Tune grading and below-fold hydration');
} finally {
  await browser.close();
}
