import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const base = (process.argv[2] ?? 'http://127.0.0.1:4326/anthropocene').replace(/\/$/, '');
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1100, height: 1400 } });
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const response = await page.goto(`${base}/learn/university-physics/periodic-motion/a-bigger-swing-the-same-clock/`);
  assert.equal(response?.status(), 200);
  const spring = page.getByRole('region', { name: 'Spring clock experiment', exact: true });
  await spring.scrollIntoViewIfNeeded();
  await page.waitForFunction(() => {
    const el = document.querySelector('section[aria-label="Spring clock experiment"]');
    return el && !el.closest('astro-island')?.hasAttribute('ssr');
  });
  const status = spring.getByRole('status');
  const state = async () => {
    const text = await status.innerText();
    const values = text.match(/At ([\d.]+) s: x = ([-\d.]+) m · v = ([-\d.]+) m\/s · a = ([-\d.]+) m\/s²/);
    assert.ok(values, text);
    return values.slice(1).map(Number);
  };
  const near = (actual: number, expected: number, tolerance = 0.002) =>
    assert.ok(Math.abs(actual - expected) < tolerance, `${actual} should be near ${expected}`);
  for (const amplitude of [0.5, 1]) {
    await spring.getByRole('slider', { name: 'Release distance', exact: true }).fill(String(amplitude));
    await spring.getByRole('button', { name: 'One full cycle', exact: true }).click();
    assert.match(await status.innerText(), /Your period: 3.142 s · reference: 3.142 s/);
    const [time, x, v, a] = await state();
    near(time, Math.PI); near(x, amplitude); near(v, 0); near(a, -4 * amplitude);
  }
  await spring.getByRole('button', { name: 'Quarter cycle', exact: true }).click();
  const quarter = await state();
  near(quarter[0], Math.PI / 4); near(quarter[1], 0); near(quarter[2], -2); near(quarter[3], 0);
  await spring.getByRole('slider', { name: 'Moving mass', exact: true }).fill('4');
  assert.match(await status.innerText(), /Your period: 6.283 s · reference: 3.142 s/);
  await spring.getByRole('slider', { name: 'Shared time cursor', exact: true }).fill('3.142');
  near((await state())[1], -1);
  await spring.getByRole('button', { name: 'One full cycle', exact: true }).click();
  near((await state())[1], 1);
  await spring.getByRole('button', { name: 'Reset experiment', exact: true }).click();
  assert.deepEqual(await state(), [0, 1, 0, -4]);
  assert.equal(await spring.getByRole('slider', { name: 'Moving mass', exact: true }).inputValue(), '1');
  await spring.getByRole('slider', { name: 'Shared time cursor', exact: true }).press('ArrowRight');
  near((await state())[0], 0.002, 0.0001);
  await spring.getByRole('button', { name: 'Show sampled values', exact: true }).click();
  assert.equal(await spring.locator('tbody tr').count(), 5);
  console.log('PASS: spring amplitude invariance, quarter-cycle x/v/a, mass scaling, shared time, reset and sampled table');
  const experiment = page.getByRole('region', { name: 'Pendulum clock experiment', exact: true });
  await experiment.scrollIntoViewIfNeeded();
  await page.waitForFunction(() => {
    const el = document.querySelector('section[aria-label="Pendulum clock experiment"]');
    return el && !el.closest('astro-island')?.hasAttribute('ssr');
  });
  await experiment.getByRole('slider', { name: 'Release angle', exact: true }).fill('120');
  await experiment.getByRole('button', { name: 'Reset experiment', exact: true }).click();
  await experiment.getByRole('slider', { name: 'Release angle', exact: true }).fill('120');
  const world = experiment.locator('svg').first();
  const shotDir = process.env.CLAUDE_JOB_DIR;
  if (shotDir) await world.screenshot({ path: `${shotDir}/tmp/pendulum-120.png` });
  const assertBobsInside = async () => {
    const geometry = await world.evaluate(svg => {
      const bounds = (svg as SVGSVGElement).viewBox.baseVal;
      return Array.from(svg.querySelectorAll('circle')).map(bob => {
        const radius = bob.r.baseVal.value + Number(bob.getAttribute('stroke-width') ?? 0) / 2;
        const x = bob.cx.baseVal.value, y = bob.cy.baseVal.value;
        return { x, y, radius, inside: x - radius >= bounds.x && x + radius <= bounds.x + bounds.width
          && y - radius >= bounds.y && y + radius <= bounds.y + bounds.height };
      });
    });
    assert.equal(geometry.length, 2);
    assert.ok(geometry.every(bob => bob.inside), `Both pendulum bobs must remain inside the SVG: ${JSON.stringify(geometry)}`);
  };
  await assertBobsInside();
  for (const angle of [5, 10, 90, 120]) {
    await experiment.getByRole('slider', { name: 'Release angle', exact: true }).fill(String(angle));
    for (const time of ['0', '0.5', '1', '2', '3', '4', '6', '8']) {
      await experiment.getByRole('slider', { name: 'Shared time cursor', exact: true }).fill(time);
      await assertBobsInside();
    }
    await experiment.getByRole('button', { name: 'One full cycle', exact: true }).click();
    await assertBobsInside();
  }
  await experiment.getByRole('button', { name: 'Reset experiment', exact: true }).click();
  assert.match(await experiment.getByRole('status').innerText(), /Period excess: 0.191%/);
  await experiment.getByRole('slider', { name: 'Release angle', exact: true }).fill('90');
  assert.match(await experiment.getByRole('status').innerText(), /Period excess: 18.034%/);
  await experiment.getByRole('button', { name: 'One full cycle', exact: true }).click();
  assert.match(await experiment.getByRole('status').innerText(), /angle now: 1.571 rad/);

  const hydrate = async (el: import('playwright').Locator) => {
    await el.locator('button').first().scrollIntoViewIfNeeded();
    await page.waitForFunction(e => !e.hasAttribute('ssr'), await el.elementHandle());
  };
  const predictions = page.locator('astro-island[component-url*="/Predict."]');
  for (const [i, answer] of [[0, /They stay in step/], [1, /Largest speed and zero acceleration/], [2, /The restoring acceleration is no longer proportional/]] as const) {
    const prediction = predictions.nth(i);
    await hydrate(prediction);
    await prediction.getByRole('button', { name: answer }).click();
    await prediction.getByRole('button', { name: 'commit prediction', exact: true }).click();
    assert.match(await prediction.innerText(), /correct/i);
  }
  const sketch = page.locator('astro-island[component-url*="/SketchCurve."]');
  await hydrate(sketch);
  const canvas = sketch.locator('canvas');
  const draw = async (velocity: (fraction: number) => number) => {
    await canvas.scrollIntoViewIfNeeded();
    const box = (await canvas.boundingBox())!;
    for (let i = 0; i <= 120; i++) {
      const fraction = i / 120;
      await page.mouse.move(box.x + 62 + fraction * (box.width - 80),
        box.y + 18 + (1 - (velocity(fraction) + 1.4) / 2.8) * (box.height - 62));
      if (i === 0) await page.mouse.down();
    }
    await page.mouse.up();
    await sketch.getByRole('button', { name: 'reveal the truth', exact: true }).click();
  };
  await draw(() => 0);
  assert.match(await sketch.innerText(), /not the shape/i);
  await sketch.getByRole('button', { name: 'try again', exact: true }).click();
  await draw(fraction => 1.2 * Math.sin(2 * Math.PI * fraction));
  assert.match(await sketch.innerText(), /close enough/i);
  for (const recall of await page.locator('astro-island[component-url*="/Recall."]').all()) {
    await hydrate(recall);
    await recall.getByRole('button', { name: 'reveal', exact: true }).click();
    assert.equal(await recall.getByRole('button', { name: 'reveal', exact: true }).count(), 0);
  }
  console.log('PASS: pendulum period excess/return, three predictions, velocity sketch rejection/retry, and both recalls');
  assert.deepEqual(errors, [], 'No browser page errors');
  console.log('PASS: both pendulum bobs remain visible at 5°, 10°, 90° and 120°, through time scrubbing and full-cycle return');
} finally {
  await browser.close();
}
