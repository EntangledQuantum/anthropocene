import { describe, expect, it } from 'vitest';
import {
  dopri54, dopri54Step, heunEulerStep, integrate, integrateAdaptive, rk4, scaledError,
} from '../ode.ts';
import { convergenceStudy, stepSweep } from '../convergence.ts';
import { decay, sechPulse } from '../problems.ts';

const ORDER_TOL = 0.2;

describe('the local-error estimate is the difference of the two solutions', () => {
  const f = decay(1).f;
  const y = [1];
  const h = 0.1;

  it('Heun–Euler: err = y_Heun − y_Euler, and that equals (h/2)(k₂ − k₁)', () => {
    const { yHigh, yLow, err } = heunEulerStep(f, 0, y, h);
    expect(err[0]).toBeCloseTo(yHigh[0] - yLow[0], 12);

    const k1 = f(0, y);
    const k2 = f(h, [y[0] + h * k1[0]]);
    expect(err[0]).toBeCloseTo((h / 2) * (k2[0] - k1[0]), 12);
  });

  it('Dormand–Prince 5(4): err = y₅ − y₄, componentwise', () => {
    const osc = (_t: number, s: number[]) => [s[1], -s[0]];
    const { yHigh, yLow, err } = dopri54Step(osc, 0, [1, 0], 0.2);
    expect(err).toHaveLength(2);
    expect(err[0]).toBeCloseTo(yHigh[0] - yLow[0], 12);
    expect(err[1]).toBeCloseTo(yHigh[1] - yLow[1], 12);
  });
});

describe('Dormand–Prince 5(4) as a fixed-step method', () => {
  it('measures fifth order on scalar decay', () => {
    const { observedOrder } = convergenceStudy(dopri54, decay(1), stepSweep(0.4, 8));
    expect(observedOrder).toBeGreaterThan(5 - ORDER_TOL);
    expect(observedOrder).toBeLessThan(5 + ORDER_TOL);
  });

  it('the embedded difference scales as h⁵', () => {
    const f = decay(1).f;
    const h1 = 0.08;
    const h2 = 0.04;
    const e1 = Math.abs(dopri54Step(f, 0, [1], h1).err[0]);
    const e2 = Math.abs(dopri54Step(f, 0, [1], h2).err[0]);
    const observed = Math.log(e1 / e2) / Math.log(h1 / h2);
    expect(observed).toBeGreaterThan(4.5);
    expect(observed).toBeLessThan(5.5);
  });
});

describe('adaptive stepping on a sharp transient', () => {
  const problem = sechPulse(10, 1);

  it('uses fewer accepted steps than min-h fixed stepping at similar accuracy', () => {
    const adapt = integrateAdaptive(problem.f, problem.y0, problem.t0, problem.span, {
      atol: 1e-6,
      rtol: 1e-6,
      h0: 0.2,
    });
    expect(adapt.diverged).toBe(false);
    expect(adapt.nAccepted).toBeGreaterThan(8);

    const hMin = Math.min(...adapt.h.slice(1));
    const fixed = integrate(dopri54, problem.f, problem.y0, problem.t0, problem.span, hMin);
    expect(fixed.diverged).toBe(false);

    const nFixed = fixed.t.length - 1;
    expect(adapt.nAccepted).toBeLessThan(nFixed);
    // The savings are the point: pulse-priced steps on the flats are waste.
    expect(adapt.nAccepted).toBeLessThan(nFixed * 0.6);

    const tEnd = problem.t0 + problem.span;
    const truth = problem.exact!(tEnd)[0];
    const adaptErr = Math.abs(adapt.y.at(-1)![0] - truth);
    const fixedErr = Math.abs(fixed.y.at(-1)![0] - truth);
    expect(adaptErr).toBeLessThan(1e-4);
    expect(fixedErr).toBeLessThan(1e-4);
    // Adaptive is not wildly less accurate than over-resolving the flats.
    expect(adaptErr).toBeLessThan(Math.max(fixedErr * 50, 1e-6));
  });

  it('rejects steps when the first trial is too big for a tight tolerance', () => {
    const adapt = integrateAdaptive(problem.f, problem.y0, problem.t0, problem.span, {
      atol: 1e-8,
      rtol: 1e-8,
      h0: 0.5,
    });
    expect(adapt.nRejected).toBeGreaterThan(0);
    expect(adapt.rejected.length).toBe(adapt.nRejected);
    expect(adapt.nAccepted).toBeGreaterThan(0);
    expect(adapt.diverged).toBe(false);
  });

  it('takes its smallest accepted steps at the pulse, not on the flats', () => {
    const adapt = integrateAdaptive(problem.f, problem.y0, problem.t0, problem.span, {
      atol: 1e-6,
      rtol: 1e-6,
      h0: 0.15,
    });
    // Drop the final leftover that was clipped to land on t_end — that h is
    // small for bookkeeping, not because the vector field is bending.
    const interior = adapt.h
      .map((h, i) => ({ h, mid: adapt.t[i] - h / 2 }))
      .slice(1, -1);

    const minIn = (lo: number, hi: number) => {
      const xs = interior.filter((s) => s.mid >= lo && s.mid <= hi).map((s) => s.h);
      return Math.min(...xs);
    };
    const atPulse = minIn(0.7, 1.3);
    const onApproach = minIn(0, 0.45);
    expect(atPulse).toBeLessThan(onApproach * 0.6);
  });

  it('tighter tolerance costs more accepted steps', () => {
    const loose = integrateAdaptive(problem.f, problem.y0, problem.t0, problem.span, {
      atol: 1e-3, rtol: 1e-3, h0: 0.2,
    });
    const mid = integrateAdaptive(problem.f, problem.y0, problem.t0, problem.span, {
      atol: 1e-5, rtol: 1e-5, h0: 0.2,
    });
    const tight = integrateAdaptive(problem.f, problem.y0, problem.t0, problem.span, {
      atol: 1e-7, rtol: 1e-7, h0: 0.2,
    });
    expect(loose.nAccepted).toBeLessThan(mid.nAccepted);
    expect(mid.nAccepted).toBeLessThan(tight.nAccepted);

    // RankOrder in the lesson: fixed stepping at the tight run's min h is
    // the most expensive of the four.
    const hMin = Math.min(...tight.h.slice(1));
    const nFixed = Math.round(problem.span / hMin);
    expect(tight.nAccepted).toBeLessThan(nFixed);
  });
});

describe('tolerance scaling', () => {
  it('scaledError is 1 when |err| equals atol on a zero state', () => {
    expect(scaledError([1e-6], [0], [0], 1e-6, 1e-3)).toBeCloseTo(1, 12);
  });

  it('scaledError is 1 when |err| equals rtol |y| with atol = 0', () => {
    expect(scaledError([1e-3], [1], [1], 0, 1e-3)).toBeCloseTo(1, 12);
  });
});

describe('classical RK4 is untouched', () => {
  it('still measures fourth order on decay', () => {
    const { observedOrder } = convergenceStudy(rk4, decay(1), stepSweep(0.4, 9));
    expect(observedOrder).toBeGreaterThan(4 - 0.15);
    expect(observedOrder).toBeLessThan(4 + 0.15);
  });
});
