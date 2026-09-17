import assert from 'node:assert/strict';
import { chromium, type Locator } from 'playwright';

const base = (process.argv[2] ?? 'http://127.0.0.1:4325/anthropocene').replace(/\/$/, '');
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1100, height: 1400 } });
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  const response = await page.goto(`${base}/learn/university-physics/landscapes/height-is-not-force/`);
  assert.equal(response?.status(), 200);
  const widgets = page.locator('astro-island[component-url*="/ForceFromSlope."]');
  const hydrate = async (el: Locator) => {
    await el.locator(':scope > div').scrollIntoViewIfNeeded();
    await page.waitForFunction(e => !e.hasAttribute('ssr'), await el.elementHandle());
  };
  const force = async (el: Locator) => Number((await el.innerText()).match(/FORCE −DU\/DX\s+([-\d.e+]+) N/i)![1]);
  const first = widgets.nth(0);
  await hydrate(first);
  assert.doesNotMatch(await first.innerText(), /FORCE −DU\/DX/i);
  await first.getByRole('button', { name: 'reveal force', exact: true }).click();
  assert.ok(Math.abs(await force(first)) < 0.002);
  await first.getByRole('slider', { name: 'probe position', exact: true }).fill('0.4');
  assert.ok(Math.abs(await force(first) + 3.3) < 0.02);
  await first.getByRole('button', { name: 'reset probe and floor', exact: true }).click();
  assert.equal(await first.getByRole('slider').inputValue(), '2.6');
  assert.doesNotMatch(await first.innerText(), /FORCE −DU\/DX/i);

  const shifted = widgets.nth(1);
  await hydrate(shifted);
  const initialForce = await force(shifted);
  const initialText = await shifted.innerText();
  await shifted.getByRole('slider', { name: 'add a constant to U', exact: true }).fill('-4');
  assert.equal(await force(shifted), initialForce);
  assert.notEqual(await shifted.innerText(), initialText);
  assert.match(await shifted.innerText(), /U HERE\s+-2.5 J/i);
  await shifted.getByRole('slider', { name: 'add a constant to U', exact: true }).fill('4');
  assert.equal(await force(shifted), initialForce);
  assert.match(await shifted.innerText(), /U HERE\s+5.5 J/i);

  const spring = widgets.nth(2);
  await hydrate(spring);
  await spring.getByRole('button', { name: 'reveal force', exact: true }).click();
  for (const [x, expected] of [[-2, 8], [0, 0], [2, -8]]) {
    await spring.getByRole('slider').fill(String(x));
    assert.equal(await force(spring), expected);
  }
  const gravity = widgets.nth(3);
  await hydrate(gravity);
  assert.doesNotMatch(await gravity.innerText(), /magnitude 2 N throughout/i, 'Do not disclose the gravity prediction answer');
  await gravity.getByRole('button', { name: 'reveal force', exact: true }).click();
  assert.doesNotMatch(await gravity.innerText(), /positive right, negative left/i, 'Upward height is not a rightward coordinate');
  assert.match(await gravity.innerText(), /positive\/negative x/i);
  for (const x of [0, 4]) {
    await gravity.getByRole('slider').fill(String(x));
    assert.equal(await force(gravity), -2);
  }

  const tune = page.locator('astro-island[component-url*="/Tune."]');
  await hydrate(tune);
  await tune.getByRole('slider').fill('1.4');
  await tune.getByRole('button', { name: 'check', exact: true }).click();
  assert.doesNotMatch(await tune.innerText(), /found it/i);
  await tune.getByRole('slider').fill('0.4');
  await tune.getByRole('button', { name: 'check', exact: true }).click();
  assert.match(await tune.innerText(), /found it/i);
  const predictions = page.locator('astro-island[component-url*="/Predict."]');
  for (const [i, answer] of [[0, /On the steep riser/], [1, /It stays unchanged/], [2, /It is the same downward force/]] as const) {
    const pre = predictions.nth(i);
    await hydrate(pre);
    await pre.getByRole('button', { name: answer }).click();
    await pre.getByRole('button', { name: 'commit prediction', exact: true }).click();
    assert.match(await pre.innerText(), /correct/i);
  }
  const sketch = page.locator('astro-island[component-url*="/SketchCurve."]');
  await hydrate(sketch);
  const canvas = sketch.locator('canvas');
  await canvas.scrollIntoViewIfNeeded();
  const box = (await canvas.boundingBox())!;
  // Scenario ranges [-2,2] m and [-10,10] N; sketch F=-4x.
  const py = (f: number) => box.y + 18 + (1 - (f + 10) / 20) * 318;
  await page.mouse.move(box.x + 62, py(8));
  await page.mouse.down();
  await page.mouse.move(box.x + box.width - 18, py(-8), { steps: 120 });
  await page.mouse.up();
  await sketch.getByRole('button', { name: 'reveal the truth', exact: true }).click();
  assert.match(await sketch.innerText(), /close enough/i);
  for (const recall of await page.locator('astro-island[component-url*="/Recall."]').all()) {
    await hydrate(recall);
    await recall.getByRole('button', { name: 'reveal', exact: true }).click();
    assert.equal(await recall.getByRole('button', { name: 'reveal', exact: true }).count(), 0);
  }
  const shotDir = process.env.CLAUDE_JOB_DIR;
  if (shotDir) await shifted.locator(':scope > div').screenshot({ path: `${shotDir}/tmp/landscape-offset.png` });
  await page.waitForTimeout(250);
  assert.deepEqual(errors, [], 'No page errors');
  console.log('PASS: force reveal/reset, slope magnitudes, energy-zero invariance, spring/gravity transfer, Tune rejection/acceptance, Predicts, sketch and Recalls');
} finally { await browser.close(); }
