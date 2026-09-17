import assert from 'node:assert/strict';
import { chromium, type Locator } from 'playwright';

// Run against a completed static build served by `npm run preview`.
const base = (process.argv[2] ?? 'http://127.0.0.1:4322/anthropocene').replace(/\/$/, '');
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1100, height: 1200 } });
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${base}/learn/university-physics/work-and-energy/only-the-shared-piece-counts/`);
  const island = (name: string) => page.locator(`astro-island[component-url*="/${name}."]`);
  const hydrate = async (el: Locator) => {
    await el.locator(':scope > div').scrollIntoViewIfNeeded();
    await page.waitForFunction(element => !element.hasAttribute('ssr'), await el.elementHandle());
  };
  const work = island('WorkArrows').first();
  await hydrate(work);
  const angle = work.getByRole('slider', { name: 'Force angle', exact: true });
  const magnitude = work.getByRole('slider', { name: 'Force magnitude', exact: true });
  const workRow = work.getByRole('row').filter({ hasText: 'work over inspected displacement' });
  for (const [degrees, expected] of [[0, '240.0 J (positive)'], [90, '0 J (zero)'], [180, '-240.0 J (negative)']] as const) {
    await angle.fill(String(degrees));
    assert.equal(await workRow.locator('td').innerText(), expected);
  }
  await angle.fill('90');
  await magnitude.fill('120');
  assert.equal(await workRow.locator('td').innerText(), '0 J (zero)');
  await work.getByRole('button', { name: 'Reset', exact: true }).click();
  const handle = work.getByRole('slider', { name: 'Force angle handle', exact: true });
  await handle.focus();
  await page.keyboard.press('Shift+ArrowLeft');
  assert.equal(await angle.inputValue(), '45');
  await page.keyboard.press('ArrowRight');
  assert.equal(await angle.inputValue(), '44');
  // Drag straight above the force origin: rotate to 90° without weakening it.
  const handleBox = (await handle.boundingBox())!;
  const svgBox = (await work.locator('svg').boundingBox())!;
  await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(svgBox.x + svgBox.width / 2, svgBox.y + 50, { steps: 12 });
  await page.mouse.up();
  assert.ok(Math.abs(Number(await angle.inputValue()) - 90) <= 1);
  assert.equal(await magnitude.inputValue(), '60');
  await angle.fill('180');
  const shotDir = process.env.CLAUDE_JOB_DIR;
  if (shotDir) await work.locator(':scope > div').screenshot({ path: `${shotDir}/tmp/work-negative.png` });

  // Childless Predict must neither mismatch at hydration nor reveal an empty payoff.
  for (const [i, answer] of [[0, /It becomes negative/], [1, /Not necessarily/]] as const) {
    const prediction = island('Predict').nth(i);
    await hydrate(prediction);
    await prediction.getByRole('button', { name: answer }).click();
    await prediction.getByRole('button', { name: 'commit prediction', exact: true }).click();
    assert.match(await prediction.innerText(), /correct/i);
    assert.doesNotMatch(await prediction.innerText(), /now watch what actually happens/);
  }

  const ledger = island('WorkArrows').nth(1);
  await hydrate(ledger);
  const brake = ledger.getByRole('slider', { name: 'Backward brake force', exact: true });
  const cell = (label: string) => ledger.getByRole('row').filter({ has: page.getByRole('rowheader', { name: label, exact: true }) }).locator('td');
  for (const [force, net, kinetic] of [[60, '0 J', '180.0 → 180.0 J'], [80, '-80.0 J', '180.0 → 100.0 J'], [120, '-180.0 J', '180.0 → 0 J']] as const) {
    await brake.fill(String(force));
    assert.equal(await cell('Net work (sum)').innerText(), net);
    assert.equal(await cell('Measured change in kinetic energy').innerText(), net);
    assert.equal(await cell('Kinetic energy: start → inspected point').innerText(), kinetic);
  }
  assert.match(await ledger.innerText(), /Stops at 3.00 m/);
  const chart = ledger.locator('svg');
  await chart.scrollIntoViewIfNeeded();
  const chartBox = (await chart.boundingBox())!;
  await page.mouse.move(chartBox.x + chartBox.width - 30, chartBox.y + 400);
  assert.match(await ledger.innerText(), /Inspect x = 3.0 m: F∥ = 60.0 N; work by the pull = 180.0 J/);
  if (shotDir) await ledger.locator(':scope > div').screenshot({ path: `${shotDir}/tmp/work-stop.png` });

  // Draw the misconception first, then recover using the real grading interaction.
  const sketch = island('SketchCurve');
  await hydrate(sketch);
  const draw = async (endEnergy: number) => {
    const canvas = sketch.locator('canvas');
    await canvas.scrollIntoViewIfNeeded();
    const box = (await canvas.boundingBox())!;
    const px = (x: number) => box.x + 62 + x / 4 * (box.width - 80);
    const py = (energy: number) => box.y + 18 + (1 - energy / 300) * (380 - 62);
    await page.mouse.move(px(0), py(180));
    await page.mouse.down();
    await page.mouse.move(px(4), py(endEnergy), { steps: 120 });
    await page.mouse.up();
    await sketch.getByRole('button', { name: 'reveal the truth', exact: true }).click();
  };
  await draw(180);
  assert.match(await sketch.innerText(), /not the shape/i);
  await sketch.getByRole('button', { name: 'try again', exact: true }).click();
  await draw(100);
  assert.match(await sketch.innerText(), /close enough/i);
  if (shotDir) await sketch.locator(':scope > div').screenshot({ path: `${shotDir}/tmp/work-sketch.png` });

  const classify = island('Classify');
  await hydrate(classify);
  for (const [item, bucket] of [
    ['Lower the box steadily', 'Negative work'],
    ['Carry the box horizontally at fixed height', 'Zero work'],
    ['Lift the box steadily', 'Positive work'],
    ['Hold the box motionless', 'Zero work'],
  ]) {
    await classify.getByRole('button', { name: item, exact: true }).click();
    await classify.getByText(bucket, { exact: true }).click();
  }
  await classify.getByRole('button', { name: 'check', exact: true }).click();
  assert.match(await classify.innerText(), /all correct/i);
  for (const [i, answer] of [[0, /No displacement/], [1, /Together they do −100 J/]] as const) {
    const recall = island('Recall').nth(i);
    await hydrate(recall);
    assert.doesNotMatch(await recall.innerText(), answer);
    await recall.getByRole('button', { name: 'reveal', exact: true }).click();
    assert.match(await recall.innerText(), answer);
  }
  // Let recoverable React hydration errors reach the pageerror listener too.
  await page.waitForTimeout(250);
  assert.deepEqual(errors, [], 'No browser page errors, including hydration mismatches');
  console.log('PASS: WorkArrows signs, keyboard/drag, independent energy ledger, stopping clamp, childless Predict hydration, SketchCurve rejection/retry, Classify and both Recalls');
} finally {
  await browser.close();
}
