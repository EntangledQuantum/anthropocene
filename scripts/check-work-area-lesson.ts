import assert from 'node:assert/strict';
import { chromium, type Locator } from 'playwright';

const base = (process.argv[2] ?? 'http://127.0.0.1:4322/anthropocene').replace(/\/$/, '');
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1100, height: 1400 } });
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const response = await page.goto(`${base}/learn/university-physics/work-and-energy/the-area-keeps-the-score/`);
  assert.equal(response?.status(), 200);
  const prerequisites = page.getByRole('link', { name: 'Only the shared piece counts', exact: true });
  assert.ok(await prerequisites.count() >= 1);
  for (const prerequisite of await prerequisites.all()) {
    const prerequisiteUrl = new URL((await prerequisite.getAttribute('href'))!, page.url()).href;
    assert.equal((await page.request.get(prerequisiteUrl)).status(), 200, 'Prerequisite link includes deployment base');
  }
  const hydrate = async (island: Locator) => {
    await island.locator('button').first().scrollIntoViewIfNeeded();
    await page.waitForFunction(el => !el.hasAttribute('ssr'), await island.elementHandle());
  };
  const worlds = page.locator('astro-island[component-url*="/WorkArea."]');
  assert.equal(await worlds.count(), 3);
  const account = async (island: Locator, row: string) =>
    island.getByRole('row').filter({ has: page.getByRole('rowheader', { name: row, exact: true }) }).getByRole('cell').innerText();
  const reveal = async (island: Locator) => island.getByRole('button', { name: 'Check the area and energy', exact: true }).click();
  const first = worlds.nth(0);
  await hydrate(first);
  assert.equal(await first.getByRole('table').count(), 0, 'Account is hidden before reveal');
  await reveal(first);
  assert.equal(await account(first, 'Sum: actual work'), '40.00 J');
  await first.getByRole('button', { name: 'B · broad push', exact: true }).click();
  assert.equal(await account(first, 'Sum: actual work'), '60.00 J');
  const handle = first.getByRole('slider', { name: 'Force handle at 2 m', exact: true });
  await handle.press('ArrowUp');
  assert.equal(await handle.getAttribute('aria-valuenow'), '21');
  await handle.press('Shift+ArrowDown');
  assert.equal(await handle.getAttribute('aria-valuenow'), '11');
  await handle.press('End');
  assert.equal(await handle.getAttribute('aria-valuenow'), '60');
  await handle.press('Home');
  assert.equal(await handle.getAttribute('aria-valuenow'), '-60');
  await first.getByRole('button', { name: 'Reset', exact: true }).click();
  assert.equal(await first.getByRole('table').count(), 0);
  await reveal(first);
  await handle.scrollIntoViewIfNeeded();
  const svg = first.locator('svg').first();
  const target = await svg.evaluate(el => {
    const matrix = (el as SVGSVGElement).getScreenCTM()!;
    const point = new DOMPoint((el as SVGSVGElement).viewBox.baseVal.width / 2 + 16, 100).matrixTransform(matrix);
    return { x: point.x, y: point.y };
  });
  const box = (await handle.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(target.x, target.y, { steps: 12 });
  await page.mouse.up();
  assert.equal(await handle.getAttribute('aria-valuenow'), '30', 'Dragging uses SVG coordinates');

  const cancel = worlds.nth(1);
  await hydrate(cancel);
  await reveal(cancel);
  assert.equal(await account(cancel, 'Area above zero'), '+40.00 J');
  assert.equal(await account(cancel, 'Area below zero (signed)'), '-40.00 J');
  assert.equal(await account(cancel, 'Sum: actual work'), '0.00 J');
  assert.equal(await account(cancel, 'Kinetic energy: start → here'), '80.00 → 80.00 J');
  await cancel.getByRole('slider', { name: 'Inspect distance (not time)', exact: true }).fill('2');
  assert.equal(await account(cancel, 'Kinetic energy: start → here'), '80.00 → 120.00 J');
  await cancel.getByRole('checkbox').check();
  assert.ok(await cancel.locator('path[fill^="url("]').count() > 0);

  const low = worlds.nth(2);
  await hydrate(low);
  await reveal(low);
  assert.equal(await account(low, 'Kinetic energy: start → here'), '20.00 → 20.00 J');
  await low.getByRole('button', { name: 'Oppose, then push', exact: true }).click();
  const distance = low.getByRole('slider', { name: 'Inspect distance (not time)', exact: true });
  assert.ok(Math.abs(Number(await distance.getAttribute('max')) - 1) < 0.001);
  assert.equal(await account(low, 'Sum: actual work'), '-20.00 J');
  assert.equal(await account(low, 'Kinetic energy: start → here'), '20.00 → 0.00 J');
  assert.match(await low.innerText(), /First forward passage ends at 1.00 m/);
  const lowSvg = low.locator('svg').first();
  await lowSvg.scrollIntoViewIfNeeded();
  const hover = await lowSvg.evaluate(el => {
    const width = (el as SVGSVGElement).viewBox.baseVal.width;
    const p = new DOMPoint(width - 30, 150).matrixTransform((el as SVGSVGElement).getScreenCTM()!);
    return { x: p.x, y: p.y };
  });
  await page.mouse.move(hover.x, hover.y);
  assert.match(await low.innerText(), /At 1.00 m: F = -40.00 N; W = -20.00 J; ΔK = -20.00 J; K = 0.00 J/);
  if (process.env.CLAUDE_JOB_DIR) await low.locator(':scope > div').screenshot({ path: `${process.env.CLAUDE_JOB_DIR}/tmp/work-area-stop.png` });

  const predictions = page.locator('astro-island[component-url*="/Predict."]');
  for (const [i, answer] of [[0, /B: its lower push/], [1, /Subtracts it/], [2, /Push first reaches/]] as const) {
    const prediction = predictions.nth(i);
    await hydrate(prediction);
    await prediction.getByRole('button', { name: answer }).click();
    await prediction.getByRole('button', { name: 'commit prediction', exact: true }).click();
    assert.match(await prediction.innerText(), /correct/i);
  }
  const sketch = page.locator('astro-island[component-url*="/SketchCurve."]');
  await hydrate(sketch);
  const canvas = sketch.locator('canvas');
  const draw = async (energy: (x: number) => number, fractionEnd = 1) => {
    await canvas.scrollIntoViewIfNeeded();
    const box = (await canvas.boundingBox())!;
    for (let i = 0; i <= 160; i++) {
      const fraction = i / 160 * fractionEnd;
      await page.mouse.move(box.x + 62 + fraction * (box.width - 80), box.y + 18 + (1 - energy(4 * fraction) / 160) * (box.height - 62));
      if (i === 0) await page.mouse.down();
    }
    await page.mouse.up();
    if (fractionEnd === 1) await sketch.getByRole('button', { name: 'reveal the truth', exact: true }).click();
  };
  await draw(x => x <= 1 ? 80 + 20 * x * x : x <= 2 ? 120 - 20 * (2 - x) ** 2 : 120 - 20 * (x - 2) ** 2, 0.56);
  assert.equal(await sketch.getByRole('button', { name: 'reveal the truth', exact: true }).count(), 0, 'A correct rising half must not qualify without the falling half');
  assert.equal(await sketch.getByRole('button', { name: 'draw a bit more', exact: true }).isDisabled(), true);
  await sketch.getByRole('button', { name: 'clear', exact: true }).click();
  await draw(() => 80);
  assert.match(await sketch.innerText(), /not the shape/i);
  await sketch.getByRole('button', { name: 'try again', exact: true }).click();
  // Independent triangular-lobe integrals: F knots are 0,40,0,-40,0 N at integer metres.
  await draw(x => x <= 1 ? 80 + 20 * x * x : x <= 2 ? 120 - 20 * (2 - x) ** 2
    : x <= 3 ? 120 - 20 * (x - 2) ** 2 : 80 + 20 * (4 - x) ** 2);
  assert.match(await sketch.innerText(), /close enough/i);
  for (const recall of await page.locator('astro-island[component-url*="/Recall."]').all()) {
    await hydrate(recall);
    await recall.getByRole('button', { name: 'reveal', exact: true }).click();
    assert.equal(await recall.getByRole('button', { name: 'reveal', exact: true }).count(), 0);
  }
  assert.deepEqual(errors, [], 'No browser page errors');
  console.log('PASS: area presets, keyboard/drag/reset, signed cancellation, independent K, stop clamp, texture, predictions, sketch rejection/retry and recalls');
} finally { await browser.close(); }
