import { describe, expect, it } from 'vitest';
import { SKETCH_SCENARIOS } from '../../../components/learn/sketch-scenarios.ts';
import { TUNE_SCENARIOS } from '../../../components/learn/tune-scenarios.ts';
import { ESTIMATE_SCENARIOS } from '../../../components/learn/estimate-scenarios.ts';
import {
  COMPARISON_BUDGET,
  crossoverDimension,
  expSum,
  expSumIntegral,
  expSumVariance,
  finestGrid,
  gridEvaluations,
  gridRelativeError,
  gridSweep,
  importanceEstimate,
  importanceRmse,
  importanceVariance,
  mcRelativeRmse,
  mcRmse,
  monteCarlo,
  mulberry32,
  productMidpoint,
} from '../monte-carlo.ts';

/** How far a fitted log-log slope may sit from theory. Wider than the ODE
 *  order tests: RMSE is itself an estimate, so the slope jitters. */
const SLOPE_TOL = 0.2;

function logLogSlope(xs: number[], ys: number[]): number {
  const n = xs.length;
  let sx = 0, sy = 0, sxx = 0, sxy = 0;
  for (let i = 0; i < n; i++) {
    const x = Math.log(xs[i]);
    const y = Math.log(ys[i]);
    sx += x; sy += y; sxx += x * x; sxy += x * y;
  }
  return (n * sxy - sx * sy) / (n * sxx - sx * sx);
}

function empiricalRmse(dim: number, N: number, reps: number, seed: number): number {
  const I = expSumIntegral(dim);
  let acc = 0;
  for (let r = 0; r < reps; r++) {
    const est = monteCarlo(expSum, dim, N, mulberry32(seed + r * 1_000_003));
    const e = est - I;
    acc += e * e;
  }
  return Math.sqrt(acc / reps);
}

describe('seeded PRNG is deterministic', () => {
  it('the same seed yields the same stream', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    for (let i = 0; i < 32; i++) expect(a()).toBe(b());
  });

  it('different seeds yield different streams', () => {
    const a = mulberry32(1);
    const b = mulberry32(2);
    const xs = Array.from({ length: 8 }, () => a());
    const ys = Array.from({ length: 8 }, () => b());
    expect(xs).not.toEqual(ys);
  });

  it('monteCarlo with the same seed returns the same estimate', () => {
    const once = monteCarlo(expSum, 3, 200, mulberry32(7));
    const twice = monteCarlo(expSum, 3, 200, mulberry32(7));
    expect(once).toBe(twice);
  });
});

describe('plain Monte Carlo is unbiased and has RMSE σ/√N', () => {
  it('the sample mean over many runs sits on the exact integral', () => {
    const dim = 2;
    const I = expSumIntegral(dim);
    const N = 400;
    const reps = 80;
    let acc = 0;
    for (let r = 0; r < reps; r++) {
      acc += monteCarlo(expSum, dim, N, mulberry32(100 + r));
    }
    expect(Math.abs(acc / reps - I) / I).toBeLessThan(0.03);
  });

  it('empirical RMSE matches σ/√N at d = 1', () => {
    const N = 1024;
    const emp = empiricalRmse(1, N, 80, 2026);
    const theory = mcRmse(1, N);
    expect(emp / theory).toBeGreaterThan(0.7);
    expect(emp / theory).toBeLessThan(1.3);
  });
});

describe('error falls as 1/√N — the slope the lesson sketches', () => {
  const Ns = [256, 512, 1024, 2048];
  const reps = 64;

  it('empirical RMSE slope is −1/2 in one dimension', () => {
    const rmses = Ns.map((N) => empiricalRmse(1, N, reps, 11));
    const slope = logLogSlope(Ns, rmses);
    expect(slope).toBeGreaterThan(-0.5 - SLOPE_TOL);
    expect(slope).toBeLessThan(-0.5 + SLOPE_TOL);
  });

  it('the same −1/2 slope holds at d = 6, where the grid has already lost', () => {
    const rmses = Ns.map((N) => empiricalRmse(6, N, reps, 13));
    const slope = logLogSlope(Ns, rmses);
    expect(slope).toBeGreaterThan(-0.5 - SLOPE_TOL);
    expect(slope).toBeLessThan(-0.5 + SLOPE_TOL);
  });

  it('the closed-form RMSE is exactly σ N^{-1/2}', () => {
    const NsFine = [16, 64, 256, 1024, 4096];
    const rmses = NsFine.map((N) => mcRmse(3, N));
    expect(logLogSlope(NsFine, rmses)).toBeCloseTo(-0.5, 8);
  });
});

describe('grid cost explodes with dimension; Monte Carlo does not', () => {
  it('a 4-per-axis product grid in 10D is 4^10 evaluations (the estimate target)', () => {
    expect(gridEvaluations(4, 10)).toBe(1_048_576);
  });

  it('two points per axis at d = 20 is already a million evaluations', () => {
    expect(gridEvaluations(2, 20)).toBe(2 ** 20);
    expect(gridEvaluations(2, 20) / gridEvaluations(2, 10)).toBe(2 ** 10);
  });

  it('Monte Carlo spends N evaluations in any dimension', () => {
    const N = 4096;
    expect(monteCarlo(expSum, 1, N, mulberry32(1))).toBeTypeOf('number');
    expect(monteCarlo(expSum, 12, N, mulberry32(1))).toBeTypeOf('number');
    expect(gridEvaluations(2, 12)).toBe(N);
    expect(gridEvaluations(2, 16)).toBeGreaterThan(N * 8);
  });

  it('at a 4096-eval budget the grid is dead by d = 13 (2^13 = 8192)', () => {
    expect(finestGrid(12, COMPARISON_BUDGET).n).toBe(2);
    expect(finestGrid(13, COMPARISON_BUDGET).n).toBe(0);
  });
});

describe('product midpoint is second order in 1D, order 2/d in dD', () => {
  it('halving h in 1D cuts the error by about 4', () => {
    const e8 = gridRelativeError(1, 8);
    const e16 = gridRelativeError(1, 16);
    const e32 = gridRelativeError(1, 32);
    expect(e8 / e16).toBeGreaterThan(3.5);
    expect(e8 / e16).toBeLessThan(4.5);
    expect(e16 / e32).toBeGreaterThan(3.5);
    expect(e16 / e32).toBeLessThan(4.5);
  });

  it('error against N has slope −2/d: −2 in 1D, −1/2 in 4D, −1/4 in 8D', () => {
    const slope1 = logLogSlope(
      [8, 16, 32, 64],
      [8, 16, 32, 64].map((n) => gridRelativeError(1, n)),
    );
    expect(slope1).toBeCloseTo(-2, 1);

    const n4 = [2, 4, 8];
    const slope4 = logLogSlope(
      n4.map((n) => n ** 4),
      n4.map((n) => gridRelativeError(4, n)),
    );
    expect(slope4).toBeCloseTo(-0.5, 1);

    const n8 = [2, 3];
    const slope8 = logLogSlope(
      n8.map((n) => n ** 8),
      n8.map((n) => gridRelativeError(8, n)),
    );
    expect(slope8).toBeCloseTo(-2 / 8, 1);
  });
});

describe('the dimension crossover the lesson hunts', () => {
  it('at a 4096-eval budget Monte Carlo first wins at d = 6', () => {
    expect(crossoverDimension(COMPARISON_BUDGET)).toBe(6);
  });

  it('below the crossover the grid is more accurate', () => {
    for (const d of [1, 2, 3, 4, 5]) {
      const { n, N } = finestGrid(d, COMPARISON_BUDGET);
      expect(n).toBeGreaterThan(0);
      expect(gridRelativeError(d, n)).toBeLessThan(mcRelativeRmse(d, N));
    }
  });

  it('from the crossover onward Monte Carlo is more accurate (or the grid is dead)', () => {
    for (const d of [6, 7, 8, 10, 12]) {
      const { n, N } = finestGrid(d, COMPARISON_BUDGET);
      if (n === 0) continue;
      expect(mcRelativeRmse(d, N)).toBeLessThan(gridRelativeError(d, n));
    }
  });

  it('the opening d = 10, two-per-axis case: MC error is smaller, and not by a hair', () => {
    const grid = gridRelativeError(10, 2);
    const mc = mcRelativeRmse(10, 2 ** 10);
    expect(grid).toBeGreaterThan(0.09);
    expect(grid).toBeLessThan(0.11);
    expect(mc).toBeGreaterThan(0.03);
    expect(mc).toBeLessThan(0.04);
    expect(mc).toBeLessThan(grid / 2);
  });

  it('gridSweep at high d has almost no points — the grid has run out of n', () => {
    expect(gridSweep(1).length).toBeGreaterThan(6);
    expect(gridSweep(12).length).toBe(1);
    expect(gridSweep(13).length).toBe(0);
  });
});

describe('importance sampling cuts the constant, never the rate', () => {
  it('a moderate tilt (α = 1/2) has smaller variance than uniform', () => {
    expect(importanceVariance(3, 0.5)).toBeLessThan(expSumVariance(3));
    expect(importanceVariance(3, 0.5)).toBeGreaterThan(0);
  });

  it('the optimal tilt α = 1 has zero variance — f/q is the integral itself', () => {
    expect(Math.abs(importanceVariance(4, 1))).toBeLessThan(1e-12);
    const est = importanceEstimate(expSum, 4, 1, 1, mulberry32(99));
    expect(relativeClose(est, expSumIntegral(4), 1e-12)).toBe(true);
  });

  it('importance-sampling RMSE still falls as N^{-1/2}', () => {
    const Ns = [16, 64, 256, 1024];
    const rmses = Ns.map((N) => importanceRmse(2, N, 0.5));
    expect(logLogSlope(Ns, rmses)).toBeCloseTo(-0.5, 8);
  });

  it('a seeded IS estimate is reproducible', () => {
    const a = importanceEstimate(expSum, 2, 80, 0.5, mulberry32(5));
    const b = importanceEstimate(expSum, 2, 80, 0.5, mulberry32(5));
    expect(a).toBe(b);
  });
});

function relativeClose(a: number, b: number, tol: number): boolean {
  return Math.abs(a - b) <= tol * Math.max(1, Math.abs(b));
}

describe('product midpoint agrees with a hand 1D midpoint', () => {
  it('n = 2 on e^x matches (e^{1/4} + e^{3/4}) / 2', () => {
    const hand = (Math.exp(0.25) + Math.exp(0.75)) / 2;
    expect(productMidpoint(expSum, 1, 2)).toBeCloseTo(hand, 12);
  });
});

describe('lesson widgets run the same numerics the tests do', () => {
  it('the sketch truth is a line of slope −1/2', () => {
    const pts = SKETCH_SCENARIOS['mc-error-vs-n'].truth();
    const slope = logLogSlope(
      pts.map((p) => 10 ** p.x),
      pts.map((p) => 10 ** p.y),
    );
    expect(slope).toBeCloseTo(-0.5, 5);
  });

  it('the Tune hunts the tested crossover dimension', () => {
    expect(TUNE_SCENARIOS['mc-crossover'].target).toBe(crossoverDimension(COMPARISON_BUDGET));
    expect(TUNE_SCENARIOS['mc-crossover'].target).toBe(6);
  });

  it('the Estimate truth is 4^10', () => {
    expect(ESTIMATE_SCENARIOS['grid-cost-d10-n4'].truth()).toBe(gridEvaluations(4, 10));
  });
});
