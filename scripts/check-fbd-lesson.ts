import assert from 'node:assert/strict';
import { chromium, type Locator } from 'playwright';

// Static preview only: no HMR during acceptance checks.
const base = (process.argv[2] ?? 'http://127.0.0.1:4322/anthropocene').replace(/\/$/, '');
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1100, height: 1400 } });
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${base}/learn/university-physics/interaction/nothing-keeps-it-going/`);
  const figures = page.locator('astro-island[component-url*="/FbdBuilder."]');
  const hydrate = async (el: Locator) => {
    await el.locator('figure').scrollIntoViewIfNeeded();
    await page.waitForFunction(e => !e.hasAttribute('ssr'), await el.elementHandle());
  };
  const waitText = async (el: Locator, pattern: RegExp) => {
    await page.waitForFunction(({ element, source, flags }) => new RegExp(source, flags).test((element as HTMLElement).innerText),
      { element: await el.elementHandle(), source: pattern.source, flags: pattern.flags }).catch(async error => {
        throw new Error(`${pattern}: ${await el.innerText()}`, { cause: error });
      });
  };
  const prediction = page.locator('astro-island[component-url*="/Predict."]').first();
  await prediction.locator('button').first().scrollIntoViewIfNeeded();
  await page.waitForFunction(e => !e.hasAttribute('ssr'), await prediction.elementHandle());
  await prediction.getByRole('button', { name: /It speeds up steadily/ }).click();
  await prediction.getByRole('button', { name: 'commit prediction', exact: true }).click();
  const given = figures.nth(0);
  await hydrate(given);
  await waitText(given, /SPEED\s+[5-9]\.\d+ m\/s/i);
  assert.match(await given.innerText(), /ACCELERATION\s+3.00 m\/s²/i);
  await given.getByRole('button', { name: 'pause', exact: true }).click();

  const build = figures.nth(1);
  await hydrate(build);
  await build.getByRole('button', { name: '+ push', exact: true }).click();
  await build.getByRole('slider', { name: 'your push · strength', exact: true }).fill('6');
  await waitText(build, /ACCELERATION\s+3.00 m\/s²/i);
  await build.getByRole('slider', { name: 'mass of the puck', exact: true }).fill('4');
  await waitText(build, /ACCELERATION\s+1.50 m\/s²/i);
  await build.getByRole('button', { name: 'run', exact: true }).click();
  await waitText(build, /SPEED\s+[5-9]\.\d+ m\/s/i);
  await build.getByRole('button', { name: 'remove', exact: true }).click();
  await waitText(build, /ACCELERATION\s+0.00 m\/s²/i);
  const speed = async () => Number((await build.innerText()).match(/SPEED\s+([\d.]+) m\/s/i)![1]);
  const coasting = await speed();
  await page.waitForTimeout(600);
  assert.equal(await speed(), coasting, 'Removing the force preserves the acquired speed');
  await build.getByRole('button', { name: 'pause', exact: true }).click();

  const hidden = figures.nth(2);
  await hydrate(hidden);
  assert.match(await hidden.innerText(), /ACCELERATION\s+2.00 m\/s²/i);
  assert.doesNotMatch(await hidden.innerText(), /SPEED\s+[\d.]+ m\/s/i, 'Hidden motion must not leak speed');
  assert.equal(await hidden.locator('canvas').count(), 0);

  const match = figures.nth(3);
  await hydrate(match);
  await match.getByRole('slider', { name: 'thruster C · strength', exact: true }).fill('28.5');
  await match.getByRole('slider', { name: 'thruster C · direction', exact: true }).fill('-135');
  await waitText(match, /That is it/i);
  const shotDir = process.env.CLAUDE_JOB_DIR;
  if (shotDir) await match.locator('figure').screenshot({ path: `${shotDir}/tmp/fbd-equilibrium.png` });
  await page.goto(`${base}/learn/university-physics/interaction/two-bodies-two-forces/`);
  const predictions = page.locator('astro-island[component-url*="/Predict."]');
  for (const [i, answer] of [[0, /Exactly the same size/], [1, /About 19 N/], [2, /12 N$/]] as const) {
    const pre = predictions.nth(i);
    await pre.locator('button').first().scrollIntoViewIfNeeded();
    await page.waitForFunction(e => !e.hasAttribute('ssr'), await pre.elementHandle());
    await pre.getByRole('button', { name: answer }).click();
    await pre.getByRole('button', { name: 'commit prediction', exact: true }).click();
    const fbd = pre.locator('astro-island[component-url*="/FbdBuilder."]');
    await hydrate(fbd);
    if (i === 0) {
      await waitText(fbd, /500.00 m\/s²/);
      assert.match(await fbd.innerText(), /42.86 m\/s²/);
      assert.equal((await fbd.innerText()).match(/600000 N/g)?.length, 4);
    } else if (i === 1) {
      await page.waitForFunction(element => {
        const text = (element as HTMLElement).innerText;
        const actual = parseFloat(text.split(/normal\s+/i)[1] ?? '');
        return Math.abs(actual - 19) < 0.2;
      }, await fbd.elementHandle());
      await fbd.getByRole('slider', { name: 'your pull · strength', exact: true }).fill('60');
      await waitText(fbd, /nothing — it left/);
      assert.match(await fbd.innerText(), /ACCELERATION\s+2.19 m\/s²/i);
    } else {
      await fbd.getByRole('slider', { name: 'A on B · strength', exact: true }).fill('12');
      await waitText(fbd, /That is it/i);
      assert.match(await fbd.innerText(), /NET ON THE PAIR\s+16.0 N/i);
    }
  }
  assert.deepEqual(errors, [], 'No browser page errors');
  console.log('PASS: FbdBuilder nested hydration, F/m, mass scaling, force-removal coasting, hidden-motion privacy and vector equilibrium');
} finally {
  await browser.close();
}
