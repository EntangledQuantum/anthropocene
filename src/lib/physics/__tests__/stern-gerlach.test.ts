import { describe, expect, it } from 'vitest';
import { SG, axisVector, countInCup, deflectionMM, fireAtoms } from '../stern-gerlach.ts';

describe('Stern–Gerlach', () => {
  it('a one-Bohr-magneton silver atom is pushed about 0.1 mm sideways', () => {
    const d = deflectionMM();
    expect(d).toBeGreaterThan(0.09);
    expect(d).toBeLessThan(0.12);
    expect(d).toBeGreaterThan(6 * SG.spread); // the spots are resolved
  });

  it('silver atoms land in two spots ±d along the magnet axis, and none in the middle', () => {
    const d = deflectionMM();
    const hits = fireAtoms(4000, 0, 'silver', 7);
    const up = countInCup(hits, [0, d], 3 * SG.spread);
    const down = countInCup(hits, [0, -d], 3 * SG.spread);
    const mid = countInCup(hits, [0, 0], 3 * SG.spread);
    expect(up + down).toBeGreaterThan(3950);
    expect(Math.abs(up - down)).toBeLessThan(250);
    expect(mid).toBe(0);
  });

  it('turn the magnet any way: still two spots, the same distance apart, along the new axis', () => {
    const d = deflectionMM();
    for (const deg of [0, 30, 90, 135]) {
      const [ax, ay] = axisVector(deg);
      const hits = fireAtoms(2000, deg, 'silver', 3);
      const caught = countInCup(hits, [d * ax, d * ay], 3 * SG.spread) + countInCup(hits, [-d * ax, -d * ay], 3 * SG.spread);
      expect(caught, `${deg}°`).toBeGreaterThan(1970);
    }
  });

  it('compass needles smear into one even band: the component along the axis is uniform', () => {
    const d = deflectionMM();
    const hits = fireAtoms(40000, 0, 'needles', 11);
    const bins = new Array(8).fill(0);
    for (const [, y] of hits) {
      const u = y / d; // −1 … 1 plus beam blur
      if (u > -0.75 && u < 0.75) bins[Math.floor(((u + 0.75) / 1.5) * 8)]++;
    }
    const mean = bins.reduce((a, b) => a + b, 0) / bins.length;
    for (const b of bins) expect(Math.abs(b - mean) / mean).toBeLessThan(0.06);
    // and plenty land in the middle, where silver never does
    expect(countInCup(hits, [0, 0], 3 * SG.spread)).toBeGreaterThan(0.1 * hits.length);
  });
});
