import { describe, expect, it } from 'vitest';
import {
  forwardEuler, rk4, backwardEuler, trapezoid,
  integrate, amplificationMag,
} from '../ode.ts';
import { newtonSolve } from '../linalg.ts';
import { decay, twoRate, TWO_RATE_FAST, TWO_RATE_SLOW } from '../problems.ts';

/* Pedagogical claims of the stiffness lesson. If the lesson says the left
   half-plane is inside the implicit region, or that trapezoid rings while
   backward Euler damps, this file is what pins it. */

describe('A-stability of the amplification factor', () => {
  const leftHalf: [number, number][] = [];
  for (let re = -40; re <= -0.05; re += 2.5) {
    for (let im = -20; im <= 20; im += 4) leftHalf.push([re, im]);
  }
  // The negative real axis, including the far-stiff end.
  for (const re of [-1e6, -1e3, -40, -4, -1, -0.1]) leftHalf.push([re, 0]);

  it('backward Euler has |R| ≤ 1 everywhere in the sampled left half-plane', () => {
    for (const [re, im] of leftHalf) {
      expect(amplificationMag('backward-euler', re, im)).toBeLessThanOrEqual(1 + 1e-12);
    }
  });

  it('implicit trapezoid has |R| ≤ 1 everywhere in the sampled left half-plane', () => {
    for (const [re, im] of leftHalf) {
      expect(amplificationMag('trapezoid', re, im)).toBeLessThanOrEqual(1 + 1e-12);
    }
  });

  it('forward Euler and RK4 are not A-stable — they fail on the negative real axis', () => {
    expect(amplificationMag('forward-euler', -3, 0)).toBeGreaterThan(1);
    expect(amplificationMag('rk4', -5, 0)).toBeGreaterThan(1);
  });

  it('backward Euler is unstable inside the disc |z − 1| < 1 (right half-plane)', () => {
    expect(amplificationMag('backward-euler', 0.5, 0)).toBeGreaterThan(1);
  });
});

describe('L-stability: R(∞) = 0, or not', () => {
  it('backward Euler damps violently stiff modes — |R(−1e6)| → 0', () => {
    expect(amplificationMag('backward-euler', -1e6)).toBeLessThan(1e-5);
  });

  it('implicit trapezoid does not — |R(−1e6)| → 1', () => {
    const mag = amplificationMag('trapezoid', -1e6);
    expect(mag).toBeGreaterThan(0.999);
    expect(mag).toBeLessThanOrEqual(1 + 1e-12);
  });

  it('on y′ = −400y at h = 0.1, backward Euler damps in one step; trapezoid rings', () => {
    const problem = decay(TWO_RATE_FAST);
    const h = 0.1;                       // z = −40
    const be = integrate(backwardEuler, problem.f, problem.y0, 0, 2, h);
    const tr = integrate(trapezoid, problem.f, problem.y0, 0, 2, h);

    expect(be.diverged).toBe(false);
    expect(tr.diverged).toBe(false);

    // One BE step: R = 1/41 ≈ 0.024.
    expect(Math.abs(be.y[1][0])).toBeLessThan(0.05);
    expect(Math.abs(be.y.at(-1)![0])).toBeLessThan(1e-6);

    // One trapezoid step: R = −39/41 ≈ −0.951, so it flips sign and stays O(1).
    expect(tr.y[1][0]).toBeLessThan(0);
    expect(Math.abs(tr.y[1][0])).toBeGreaterThan(0.8);

    const last = tr.y.at(-1)![0];
    const prev = tr.y.at(-2)![0];
    expect(last * prev).toBeLessThan(0);          // still alternating
    expect(Math.abs(last)).toBeGreaterThan(0.05); // not damped away
  });
});

describe('explicit methods blow up on the two-rate system past h = 2/λ_fast', () => {
  const problem = twoRate();
  const hStab = 2 / TWO_RATE_FAST;       // 0.005
  const hOver = hStab * 4;               // 0.02 — well past the cliff
  const hUnder = hStab * 0.6;            // 0.003

  it('two-rate exact solution matches the closed form at t = 0 and tracks the slow mode', () => {
    const y0 = problem.exact!(0);
    expect(y0[0]).toBeCloseTo(1, 12);
    expect(y0[1]).toBeCloseTo(1, 12);
    // After the fast transient, slow ≈ ((λf)/(λf − λs)) e^{−λs t}.
    const t = 1;
    const [ys] = problem.exact!(t);
    const attracted = TWO_RATE_FAST / (TWO_RATE_FAST - TWO_RATE_SLOW) * Math.exp(-TWO_RATE_SLOW * t);
    expect(ys).toBeCloseTo(attracted, 5);
  });

  it('two-rate exact solution satisfies the ODE', () => {
    const t = 0.02;
    const y = problem.exact!(t);
    const yp = problem.f(t, y);
    const eps = 1e-7;
    const y1 = problem.exact!(t + eps);
    expect((y1[0] - y[0]) / eps).toBeCloseTo(yp[0], 3);
    expect((y1[1] - y[1]) / eps).toBeCloseTo(yp[1], 3);
  });

  it('forward Euler diverges just above the fast-mode limit', () => {
    const run = integrate(forwardEuler, problem.f, problem.y0, 0, 2, hOver);
    const peak = Math.max(...run.y.map((s) => Math.abs(s[0])));
    expect(run.diverged || peak > 10).toBe(true);
  });

  it('RK4 diverges at the same step — a bigger island is still an island', () => {
    const run = integrate(rk4, problem.f, problem.y0, 0, 2, hOver);
    const peak = Math.max(...run.y.map((s) => Math.abs(s[0])));
    expect(run.diverged || peak > 10).toBe(true);
  });

  it('forward Euler decays just below the fast-mode limit', () => {
    const run = integrate(forwardEuler, problem.f, problem.y0, 0, 2, hUnder);
    expect(run.diverged).toBe(false);
    expect(Math.abs(run.y.at(-1)![0])).toBeLessThan(1);
  });

  it('backward Euler stays bounded at a step 10× past that limit, and tracks the slow decay', () => {
    const h = 0.05;                      // 10 × 0.005; the lesson's "reasonable" step
    const run = integrate(backwardEuler, problem.f, problem.y0, 0, 4, h);
    expect(run.diverged).toBe(false);
    const tEnd = run.t.at(-1)!;
    const truth = problem.exact!(tEnd);
    expect(Math.abs(run.y.at(-1)![0] - truth[0])).toBeLessThan(0.15);
  });
});

describe('Newton vs fixed-point on the implicit Euler residual', () => {
  /* The comment in newtonSolve: fixed-point of y ↦ y_n + h f(t, y) contracts
     only when h·|∂f/∂y| < 1, which is exactly where implicit methods have
     no advantage. */

  const lambda = 50;
  const y0 = 1;

  function fixedPoint(h: number, maxIter = 40): { y: number; diverged: boolean } {
    let y = y0;
    for (let i = 0; i < maxIter; i++) {
      y = y0 + h * (-lambda * y);        // y ← y_n + h f(y)
      if (!Number.isFinite(y) || Math.abs(y) > 1e6) return { y, diverged: true };
    }
    return { y, diverged: false };
  }

  function newtonStep(h: number): number {
    // Residual of backward Euler on y' = −λ y: g(y) = y − y0 − h(−λ y).
    return newtonSolve((guess) => [guess[0] - y0 - h * (-lambda * guess[0])], [y0])[0];
  }

  it('fixed-point diverges when hλ > 1 — the stiff regime', () => {
    const h = 1;                         // hλ = 50
    expect(fixedPoint(h).diverged).toBe(true);
  });

  it('newtonSolve on the same residual returns the backward-Euler step', () => {
    const h = 1;
    const y = newtonStep(h);
    expect(y).toBeCloseTo(y0 / (1 + h * lambda), 10);
  });

  it('fixed-point does converge when hλ < 1 — where you did not need implicit', () => {
    const h = 0.01;                      // hλ = 0.5
    const { y, diverged } = fixedPoint(h);
    expect(diverged).toBe(false);
    expect(y).toBeCloseTo(y0 / (1 + h * lambda), 6);
  });

  it('the integrator itself stays stable at hλ = 50, which is the Newton-not-fixed-point claim', () => {
    const problem = decay(lambda);
    const { y, diverged } = integrate(backwardEuler, problem.f, problem.y0, 0, 5, 1);
    expect(diverged).toBe(false);
    expect(Math.abs(y.at(-1)![0])).toBeLessThan(1e-3);
  });
});
