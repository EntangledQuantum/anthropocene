import { describe, expect, it } from 'vitest';
import { ESTIMATE_SCENARIOS } from '../estimate-scenarios.ts';

/* The lesson prose quotes these numbers. If the numerics change and the
   quoted figures drift, the lesson starts asserting something false — so the
   claims are pinned here rather than trusted. AGENTS.md §9. */

describe('estimate scenarios agree with the prose that quotes them', () => {
  it('forward Euler needs ~8e4 evaluations for 1e-6 ("around 84,000")', () => {
    const t = ESTIMATE_SCENARIOS['euler-work-1e6'].truth();
    expect(t).toBeGreaterThan(4e4);
    expect(t).toBeLessThan(2e5);
  });

  it('RK4 needs under a hundred for the same target ("about 83")', () => {
    const t = ESTIMATE_SCENARIOS['rk4-work-1e6'].truth();
    expect(t).toBeGreaterThan(40);
    expect(t).toBeLessThan(200);
  });

  it('Euler costs roughly a thousandfold more than RK4 for the same answer', () => {
    const euler = ESTIMATE_SCENARIOS['euler-work-1e6'].truth();
    const rk4 = ESTIMATE_SCENARIOS['rk4-work-1e6'].truth();
    const ratio = euler / rk4;
    expect(ratio).toBeGreaterThan(200);
    expect(ratio).toBeLessThan(20_000);
  });

  it('a double carries ~16 significant decimal digits', () => {
    const t = ESTIMATE_SCENARIOS['double-digits'].truth();
    expect(t).toBeGreaterThan(15);
    expect(t).toBeLessThan(17);
  });

  it('the ill-conditioned 2×2 keeps about 7 digits, not 16', () => {
    const t = ESTIMATE_SCENARIOS['ill-2x2-digits'].truth();
    expect(t).toBeGreaterThan(6);
    expect(t).toBeLessThan(8.5);
  });

  it('e^{sin x} needs a dozen Fourier modes for 10^{-12} ("Twelve")', () => {
    expect(ESTIMATE_SCENARIOS['spec-modes-for-eps'].truth()).toBe(12);
  });

  it('four adjoint steps from 0.5 toward 2 leave |λ−2| around 0.014', () => {
    const t = ESTIMATE_SCENARIOS['ad-recovered-lambda'].truth();
    expect(t).toBeGreaterThan(0.005);
    expect(t).toBeLessThan(0.04);
  });
});

describe('every scenario is answerable on its own slider', () => {
  for (const [key, s] of Object.entries(ESTIMATE_SCENARIOS)) {
    it(`${key}: the truth sits inside the slider range`, () => {
      const log = Math.log10(s.truth());
      expect(log).toBeGreaterThan(s.logRange[0]);
      expect(log).toBeLessThan(s.logRange[1]);
    });

    it(`${key}: the starting guess is not already correct`, () => {
      // A slider that opens on the answer tests nothing.
      const factor = 10 ** Math.abs(s.logStart - Math.log10(s.truth()));
      expect(factor).toBeGreaterThan(s.withinFactor);
    });
  }
});
