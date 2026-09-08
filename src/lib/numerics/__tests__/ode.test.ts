import { describe, expect, it } from 'vitest';
import {
  forwardEuler, midpoint, heun, rk4, backwardEuler, trapezoid,
  symplecticEuler, velocityVerlet, integrate, splitQV,
} from '../ode.ts';
import { convergenceStudy, stepSweep, invariantDrift } from '../convergence.ts';
import { decay, oscillator, kepler } from '../problems.ts';

/** How far a fitted order may sit from theory before we call it a regression. */
const ORDER_TOL = 0.15;

/* Every pedagogical claim the lessons make is asserted here. If a lesson says
   "RK4 is fourth order" the test proves it; if it says "Verlet conserves
   energy and RK4 doesn't", the test proves that too. A wrong sim is a wrong
   lesson, which is worse than no lesson. */

describe('observed order matches theory — scalar decay', () => {
  const problem = decay(1);
  const sweep = stepSweep(0.4, 9);

  // Symplectic methods are excluded: `decay` is not a [q, v] system.
  for (const method of [forwardEuler, midpoint, heun, rk4, backwardEuler, trapezoid]) {
    it(`${method.label} → order ${method.order}`, () => {
      const { observedOrder } = convergenceStudy(method, problem, sweep);
      // Tolerance on a least-squares slope, not on an exact quantity.
      expect(observedOrder).toBeGreaterThan(method.order - ORDER_TOL);
      expect(observedOrder).toBeLessThan(method.order + ORDER_TOL);
    });
  }
});

describe('observed order matches theory — harmonic oscillator', () => {
  const problem = { ...oscillator(1), span: 4 };
  const sweep = stepSweep(0.1, 8);

  for (const method of [forwardEuler, midpoint, heun, rk4, backwardEuler, trapezoid, symplecticEuler, velocityVerlet]) {
    it(`${method.label} → order ${method.order}`, () => {
      const { observedOrder } = convergenceStudy(method, problem, sweep);
      // Tolerance on a least-squares slope, not on an exact quantity.
      expect(observedOrder).toBeGreaterThan(method.order - ORDER_TOL);
      expect(observedOrder).toBeLessThan(method.order + ORDER_TOL);
    });
  }
});

describe('the asymptotic window is detected, not assumed', () => {
  it('excludes RK4 pre-asymptotic and roundoff-floor points', () => {
    const r = convergenceStudy(rk4, decay(1), stepSweep(0.4, 9));
    // The coarsest point and the sub-1e-12 tail must both be dropped.
    expect(r.fitted).not.toContain(0);
    expect(r.fitted.length).toBeLessThan(r.points.length);
    expect(r.points.length).toBe(9);
  });

  it('keeps every point when the whole sweep is already asymptotic', () => {
    const r = convergenceStudy(forwardEuler, decay(1), stepSweep(0.4, 9));
    expect(r.fitted.length).toBe(9);
  });
});

describe('symplectic integrators bound energy error; RK4 does not', () => {
  const problem = { ...oscillator(1), span: 4000 };
  const h = 0.1;

  /** Peak |ΔE/E| over the first and last quarter of the run. A bounded method
   *  has the same peak in both; a secular one grows. */
  function driftWindows(method: typeof rk4) {
    const { relative } = invariantDrift(method, problem, h);
    const q = Math.floor(relative.length / 4);
    const peak = (xs: number[]) => Math.max(...xs.map(Math.abs));
    return { early: peak(relative.slice(0, q)), late: peak(relative.slice(-q)) };
  }

  it('Velocity Verlet drift is bounded — late peak matches early peak', () => {
    const { early, late } = driftWindows(velocityVerlet);
    expect(late).toBeLessThan(early * 1.2);
    expect(late).toBeLessThan(0.01);
  });

  it('Symplectic Euler drift is bounded too, despite being only 1st order', () => {
    const { early, late } = driftWindows(symplecticEuler);
    expect(late).toBeLessThan(early * 1.2);
  });

  it('RK4 drift is secular — it grows without bound as the run lengthens', () => {
    const { early, late } = driftWindows(rk4);
    expect(late).toBeGreaterThan(early * 3);
  });

  it("Verlet's error envelope is flat across the run; RK4's grows every quarter", () => {
    /** Peak |ΔE/E| in each quarter of the run — the envelope of the error. */
    const envelope = (method: typeof rk4) => {
      const { relative } = invariantDrift(method, problem, h);
      const q = Math.floor(relative.length / 4);
      return [0, 1, 2, 3].map((k) =>
        Math.max(...relative.slice(k * q, (k + 1) * q).map(Math.abs)),
      );
    };

    const vv = envelope(velocityVerlet);
    const rk = envelope(rk4);

    // Verlet: every quarter has essentially the same envelope.
    for (const e of vv) expect(e).toBeCloseTo(vv[0], 4);

    // RK4: each quarter is strictly worse than the last.
    for (let k = 1; k < rk.length; k++) expect(rk[k]).toBeGreaterThan(rk[k - 1]);

    // And RK4 bleeds energy in one direction rather than oscillating about it.
    expect(invariantDrift(rk4, problem, h).relative.at(-1)!).toBeLessThan(0);
  });

  it('forward Euler energy grows without bound', () => {
    const { relative } = invariantDrift(forwardEuler, { ...oscillator(1), span: 2000 }, h);
    expect(relative.at(-1)!).toBeGreaterThan(1);
  });
});

describe('stability, not accuracy, sets the step size for explicit methods', () => {
  const lambda = 50;              // forward Euler is stable only for h < 2/λ
  const problem = decay(lambda);

  it('blows up just above h = 2/λ', () => {
    const { y } = integrate(forwardEuler, problem.f, problem.y0, 0, 5, 2 / lambda + 0.005);
    expect(Math.abs(y.at(-1)![0])).toBeGreaterThan(1);
  });

  it('decays just below h = 2/λ', () => {
    const { y } = integrate(forwardEuler, problem.f, problem.y0, 0, 5, 2 / lambda - 0.005);
    expect(Math.abs(y.at(-1)![0])).toBeLessThan(1);
  });

  it('backward Euler is stable at a step 25x past that limit', () => {
    // This is the whole point of an implicit method, and it only holds because
    // the step is solved with Newton rather than fixed-point iteration.
    const { y, diverged } = integrate(backwardEuler, problem.f, problem.y0, 0, 5, 1.0);
    expect(diverged).toBe(false);
    expect(Math.abs(y.at(-1)![0])).toBeLessThan(1e-3);
  });

  it('backward Euler stays stable even at h = 10, where explicit methods are hopeless', () => {
    const { y, diverged } = integrate(backwardEuler, problem.f, problem.y0, 0, 50, 10);
    expect(diverged).toBe(false);
    expect(Math.abs(y.at(-1)![0])).toBeLessThan(1e-6);
  });
});

describe('kepler orbit', () => {
  it('Verlet keeps the orbit closed; forward Euler spirals out', () => {
    const problem = kepler(0.6);
    const h = 0.005;
    const radius = (s: number[]) => Math.hypot(s[0], s[1]);

    const vvMax = Math.max(...integrate(velocityVerlet, problem.f, problem.y0, 0, problem.span, h).y.map(radius));
    const feMax = Math.max(...integrate(forwardEuler,   problem.f, problem.y0, 0, problem.span, h).y.map(radius));

    expect(vvMax).toBeLessThan(1.7);          // true apoapsis is 1 + e = 1.6
    expect(feMax).toBeGreaterThan(vvMax * 1.5);
  });
});

describe('guards', () => {
  it('refuses to apply a symplectic method to a non-[q,v] system', () => {
    expect(() => splitQV([1, 2, 3])).toThrow(/even-length/);
  });
});
