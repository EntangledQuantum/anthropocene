import { describe, expect, it } from 'vitest';
import {
  centralDifference, fivePoint, complexStep, richardson, richardsonCentral,
  richardsonTableau, richardsonColumnOrder, TARGETS,
} from '../diff.ts';

const ORDER_TOL = 0.25;

function observedOrder(err: (h: number) => number, h = 0.08): number {
  const e1 = err(h);
  const e2 = err(h / 2);
  return Math.log2(e1 / e2);
}

describe('Richardson extrapolation cancels the leading order', () => {
  const { f, df, x0 } = TARGETS.sin;
  const truth = df(x0);

  it('one step on two centrals is fourth order on sin', () => {
    const err = (h: number) => Math.abs(richardsonCentral(f, x0, h) - truth);
    expect(observedOrder(err, 0.1)).toBeGreaterThan(4 - ORDER_TOL);
    expect(observedOrder(err, 0.1)).toBeLessThan(4 + ORDER_TOL);
  });

  it('a second tableau step is sixth order on sin', () => {
    const err = (h: number) => {
      const T = richardsonTableau([
        centralDifference(f, x0, 4 * h),
        centralDifference(f, x0, 2 * h),
        centralDifference(f, x0, h),
      ], 2, true);
      return Math.abs(T[2][2] - truth);
    };
    expect(observedOrder(err, 0.12)).toBeGreaterThan(6 - ORDER_TOL);
    expect(observedOrder(err, 0.12)).toBeLessThan(6 + ORDER_TOL);
  });

  it('on a cubic, one step is exact — the leftover h⁴ term is identically zero', () => {
    const t = TARGETS.poly;
    const r = richardsonCentral(t.f, t.x0, 0.35);
    expect(Math.abs(r - t.df(t.x0))).toBeLessThan(1e-12);
  });

  it('equals the five-point stencil: same four samples, same weights', () => {
    for (const h of [0.4, 0.1, 0.03]) {
      expect(richardsonCentral(f, x0, h)).toBeCloseTo(fivePoint(f, x0, h), 12);
    }
  });

  it('the extrapolated pair at h₀ = 0.4 beats a fourfold-refined central', () => {
    const d = (h: number) => Math.abs(centralDifference(f, x0, h) - truth);
    const r = Math.abs(
      richardson(centralDifference(f, x0, 0.4), centralDifference(f, x0, 0.2), 2) - truth,
    );
    expect(r).toBeLessThan(d(0.1));
    expect(r).toBeLessThan(d(0.05));
    expect(d(0.4)).toBeGreaterThan(d(0.2));
    expect(d(0.2)).toBeGreaterThan(d(0.1));
  });

  it('column k of an even-powered tableau has order 2(k+1)', () => {
    expect(richardsonColumnOrder(0)).toBe(2);
    expect(richardsonColumnOrder(1)).toBe(4);
    expect(richardsonColumnOrder(2)).toBe(6);
  });

  it('the 4:−1 weights on a skipped row do not cancel h²', () => {
    const D = (h: number) => centralDifference(f, x0, h);
    const skipped = (4 * D(0.1) - D(0.4)) / 3;
    const adjacent = richardson(D(0.4), D(0.2), 2);
    expect(Math.abs(skipped - truth)).toBeGreaterThan(Math.abs(adjacent - truth) * 5);
  });
});

describe('complex-step has no roundoff branch', () => {
  it('error stays tiny as h → 1e-20 on sin', () => {
    const { fComplex, df, x0 } = TARGETS.sin;
    for (const h of [1e-8, 1e-12, 1e-16, 1e-20]) {
      const est = complexStep(fComplex!, x0, h);
      expect(Math.abs(est - df(x0))).toBeLessThan(1e-14);
    }
  });

  it('error stays tiny as h → 1e-20 on exp', () => {
    const { fComplex, df, x0 } = TARGETS.exp;
    for (const h of [1e-8, 1e-12, 1e-16, 1e-20]) {
      const est = complexStep(fComplex!, x0, h);
      expect(Math.abs(est - df(x0))).toBeLessThan(1e-14);
    }
  });

  it('truncation at large h is still O(h²)', () => {
    const { fComplex, df, x0 } = TARGETS.sin;
    const err = (h: number) => Math.abs(complexStep(fComplex!, x0, h) - df(x0));
    expect(observedOrder(err, 0.08)).toBeGreaterThan(2 - ORDER_TOL);
    expect(observedOrder(err, 0.08)).toBeLessThan(2 + ORDER_TOL);
  });

  it('at h = 1e-20 the error is far below a central difference at its optimum', () => {
    const { f, fComplex, df, x0 } = TARGETS.sin;
    const cstep = Math.abs(complexStep(fComplex!, x0, 1e-20) - df(x0));
    const centralBest = Math.abs(centralDifference(f, x0, 1e-5) - df(x0));
    expect(cstep).toBeLessThan(centralBest);
    expect(cstep).toBeLessThan(1e-14);
  });

  it('error does not rise as h shrinks from 1e-8 to 1e-20 — no U', () => {
    const { fComplex, df, x0 } = TARGETS.sin;
    const e = (h: number) => Math.abs(complexStep(fComplex!, x0, h) - df(x0));
    expect(e(1e-20)).toBeLessThanOrEqual(e(1e-8) + 1e-15);
    expect(e(1e-12)).toBeLessThanOrEqual(e(1e-8) + 1e-15);
  });
});
