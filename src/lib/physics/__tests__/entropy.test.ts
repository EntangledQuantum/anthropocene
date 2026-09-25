import { describe, expect, it } from 'vitest';
import {
  AGE_OF_UNIVERSE_S, R_GAS, arrangementTally, availableWork, binomial, blocksEntropyChange, boltzmannEntropy,
  carnotCoolingCOP, carnotEfficiency, carnotHeatingCOP, chanceAllLeft, chanceOfSplit, contactTemperature,
  countLeft, createGasBox, engineLedger, expectedLooks, freeExpansionEntropy, fridgeLedger, leftIn, lnEinstein,
  meanLooksUntilAllLeft, minimumDump, particlesForWait, perfectMeetingTemperature, perfectStroke,
  smallestRunningDump, splitEntropyInK, stepGas, timeAllLeft, type Blocks,
} from '../entropy.ts';

/* Lesson 1 — "They never all come back" */

describe('the box with a divider', () => {
  it('starts with every particle on the left, and a closed divider keeps them there', () => {
    const box = createGasBox(40, 7);
    expect(countLeft(box)).toBe(40);
    for (let s = 0; s < 5000; s++) stepGas(box, 0.02);
    expect(countLeft(box)).toBe(40);
  });

  it('is reversible particle by particle: flip every velocity and it walks back to the start', () => {
    const box = createGasBox(12, 3);
    box.closed = false;
    const x0 = Float64Array.from(box.x), y0 = Float64Array.from(box.y);
    for (let s = 0; s < 800; s++) stepGas(box, 0.02);
    expect(countLeft(box)).toBeLessThan(12);
    for (let i = 0; i < box.n; i++) { box.vx[i] = -box.vx[i]; box.vy[i] = -box.vy[i]; }
    for (let s = 0; s < 800; s++) stepGas(box, 0.02);
    for (let i = 0; i < box.n; i++) { expect(box.x[i]).toBeCloseTo(x0[i], 6); expect(box.y[i]).toBeCloseTo(y0[i], 6); }
  });

  it('a closed divider traps each particle on the side it is on when it closes', () => {
    const box = createGasBox(10, 5);
    box.closed = false;
    for (let s = 0; s < 300; s++) stepGas(box, 0.02);
    const k = countLeft(box);
    box.closed = true;
    for (let s = 0; s < 3000; s++) { stepGas(box, 0.02); expect(countLeft(box)).toBe(k); }
  });

  it('the chance of catching all N on the left is 2^−N, and the box measures it for small N', () => {
    for (const n of [1, 2, 3, 4, 5]) {
      expect(chanceAllLeft(n)).toBe(2 ** -n);
      let f = 0;
      for (const seed of [1, 2, 3, 4]) f += timeAllLeft(n, seed, 40_000) / 4;
      expect(f / 2 ** -n).toBeGreaterThan(0.85);
      expect(f / 2 ** -n).toBeLessThan(1.15);
    }
  });

  it('forty particles never all come back in a long run, and rarely stray past 28', () => {
    const box = createGasBox(40, 11);
    box.closed = false;
    let most = 0;
    for (let s = 0; s < 200_000; s++) { stepGas(box, 0.02); if (s > 1000) most = Math.max(most, countLeft(box)); }
    expect(most).toBeLessThan(33);
    expect(most).toBeGreaterThan(24);
  });

  it('spaced looks catch four all-left once in about sixteen, the geometric wait 2^N', () => {
    expect(expectedLooks(4)).toBe(16);
    const m = meanLooksUntilAllLeft(4, 9, 20, 400);
    expect(m).toBeGreaterThan(13);
    expect(m).toBeLessThan(19.5);
  });
});

describe('counting the arrangements', () => {
  it('four labelled particles: 16 arrangements, split 1, 4, 6, 4, 1', () => {
    expect([0, 1, 2, 3, 4].map((k) => binomial(4, k))).toEqual([1, 4, 6, 4, 1]);
    expect([0, 1, 2, 3, 4].reduce((s, k) => s + binomial(4, k), 0)).toBe(16);
  });

  it('the running box spends equal time in every one of the 16 arrangements', () => {
    const t = arrangementTally(4, 21, 60_000);
    for (const f of t) { expect(f).toBeGreaterThan(0.85 / 16); expect(f).toBeLessThan(1.15 / 16); }
    // …so "two on each side" is six arrangements and six times as likely as "all on the left".
    let two = 0, four = 0;
    t.forEach((f, a) => { if (leftIn(a) === 2) two += f; if (leftIn(a) === 4) four += f; });
    expect(two / four).toBeGreaterThan(5);
    expect(two / four).toBeLessThan(7);
    expect(chanceOfSplit(4, 2)).toBeCloseTo(6 / 16, 12);
  });

  it('forty particles: half-and-half has 1.4 × 10¹¹ arrangements, all-left has one', () => {
    expect(binomial(40, 20)).toBe(137846528820);
    expect(splitEntropyInK(40, 40)).toBe(0);
    expect(splitEntropyInK(40, 20)).toBeCloseTo(25.65, 2);
  });

  it('entropy is the log of the count, so counts that multiply give entropies that add', () => {
    expect(boltzmannEntropy(16 * 16)).toBeCloseTo(2 * boltzmannEntropy(16), 30);
  });

  it('doubling the volume multiplies the count by 2^N: a mole gains R ln 2 = 5.76 J/K', () => {
    expect(freeExpansionEntropy(6.02214076e23, 2)).toBeCloseTo(R_GAS * Math.log(2), 10);
    expect(R_GAS * Math.log(2)).toBeCloseTo(5.763, 3);
  });

  it('59 particles, looked at once a second, outlast the age of the universe', () => {
    const n = particlesForWait(AGE_OF_UNIVERSE_S, 1);
    expect(n).toBeGreaterThan(58);
    expect(n).toBeLessThan(59);
    expect(expectedLooks(40) / (365.25 * 86400)).toBeGreaterThan(30_000);
  });

  it('heat flows hot to cold because that direction grows the total count', () => {
    // Two Einstein solids of 300 oscillators; A holds 4× the energy per oscillator.
    const total = (qa: number, qb: number) => lnEinstein(300, qa) + lnEinstein(300, qb);
    expect(total(399, 101)).toBeGreaterThan(total(400, 100));
    expect(total(401, 99)).toBeLessThan(total(400, 100));
    // The most likely share gives both the same energy per oscillator.
    let best = 0, bestQ = 0;
    for (let q = 0; q <= 500; q++) { const s = total(q, 500 - q); if (q === 0 || s > best) { best = s; bestQ = q; } }
    expect(bestQ).toBe(250);
  });
});

/* Lesson 2 — "Every engine pays the cold side" */

describe('engines between two baths', () => {
  it('ΔS_total ≥ 0 for every engine the dump slider can build that runs, zero only at Carnot', () => {
    for (const [Th, Tc] of [[600, 300], [800, 290]]) {
      const Qmin = minimumDump(1000, Th, Tc);
      for (let Qc = 0; Qc <= 1000; Qc += 5) {
        const L = engineLedger(1000, Qc, Th, Tc);
        expect(L.W + L.Qc).toBe(1000);
        expect(L.runs).toBe(Qc >= Qmin - 1e-9);
        if (L.runs) {
          expect(L.dSTotal).toBeGreaterThanOrEqual(-1e-12);
          expect(L.efficiency).toBeLessThanOrEqual(carnotEfficiency(Th, Tc) + 1e-12);
        }
      }
      expect(engineLedger(1000, Qmin, Th, Tc).dSTotal).toBeCloseTo(0, 12);
      expect(engineLedger(1000, Qmin, Th, Tc).efficiency).toBeCloseTo(carnotEfficiency(Th, Tc), 12);
    }
  });

  it('no engine turns all its heat into work: a zero dump always stalls', () => {
    for (const Th of [400, 1000, 5000]) expect(engineLedger(1000, 0, Th, 300).runs).toBe(false);
  });

  it('600 K to 300 K: half is the best; the power station, 800 K to 290 K, dumps at least 36%', () => {
    expect(minimumDump(1000, 600, 300)).toBe(500);
    expect(smallestRunningDump(1000, 600, 300, 5)).toBe(500);
    expect(minimumDump(1000, 800, 290)).toBeCloseTo(362.5, 9);
    expect(smallestRunningDump(1000, 800, 290, 5)).toBe(365);
    expect(engineLedger(1000, 360, 800, 290).runs).toBe(false);
  });

  it('a colder river buys more than a hotter boiler, degree for degree', () => {
    expect(carnotEfficiency(600, 250)).toBeGreaterThan(carnotEfficiency(650, 300));
  });

  it('the refrigerator and heat-pump items the lesson classifies', () => {
    // Fridge: 1000 J out of a 3 °C inside, 100 J of work, 1100 J into a 22 °C kitchen.
    expect(fridgeLedger(1000, 100, 295, 276).runs).toBe(true);
    // The same fridge unplugged.
    expect(fridgeLedger(1000, 0, 295, 276).runs).toBe(false);
    // Heat pump: 4000 J into a 20 °C house for 1000 J of work, 3000 J from 0 °C air.
    expect(fridgeLedger(3000, 1000, 293, 273).runs).toBe(true);
    expect(carnotHeatingCOP(293, 273)).toBeGreaterThan(14);
    // An engine that turns 600 J of 1000 J into work between 600 K and 300 K.
    expect(engineLedger(1000, 400, 600, 300).runs).toBe(false);
    // Tea at 70 °C taking 100 J from a 20 °C room.
    expect(-100 / 293 + 100 / 343).toBeLessThan(0);
    // The best fridge moves 13.8 J out per joule between 276 K and 295 K.
    expect(carnotCoolingCOP(295, 276)).toBeCloseTo(14.53, 2);
  });
});

describe('two blocks and a perfect engine', () => {
  const start: Blocks = { Ch: 1000, Th: 400, Cc: 1000, Tc: 100, W: 0 };

  it('the stroke adds no entropy and dumps the Carnot share of each small bite', () => {
    const b = perfectStroke(start, 0.01);
    const dQh = start.Ch * 0.01, dQc = b.Cc * (b.Tc - start.Tc);
    expect(dQc / dQh).toBeCloseTo(100 / 400, 4);
    expect(blocksEntropyChange(1000, 400, 1000, 100, b.Th, b.Tc)).toBeCloseTo(0, 10);
  });

  it('run to the end, they meet at √(400 · 100) = 200 K, not the 250 K average', () => {
    let b = start;
    while (b.Th - b.Tc > 0.01) b = perfectStroke(b, 0.5);
    expect(b.Th).toBeCloseTo(200, 1);
    expect(b.Tc).toBeCloseTo(200, 1);
    expect(perfectMeetingTemperature(1000, 400, 1000, 100)).toBeCloseTo(200, 9);
    expect(contactTemperature(1000, 400, 1000, 100)).toBeCloseTo(250, 9);
    // The 50 K each block did not keep is the work: 100 kJ.
    expect(b.W).toBeCloseTo(100_000, -2);
    expect(availableWork(1000, 400, 1000, 100)).toBeCloseTo(100_000, 6);
  });

  it('touching them directly delivers nothing and raises the entropy', () => {
    expect(blocksEntropyChange(1000, 400, 1000, 100, 250, 250)).toBeGreaterThan(200);
  });

  it('first law along the way: the blocks lose exactly the work delivered', () => {
    let b = start;
    for (let k = 0; k < 50; k++) {
      b = perfectStroke(b, 2);
      const lost = start.Ch * (start.Th - b.Th) - start.Cc * (b.Tc - start.Tc);
      expect(lost).toBeCloseTo(b.W, 6);
    }
  });
});
