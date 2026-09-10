import { type Deriv, type Integrator, type State, type Stepper, add, axpy } from './types.ts';
import { newtonSolve } from './linalg.ts';

/* ─────────────────────────────────────────────────────────────────────────
   Explicit Runge–Kutta family, written in the form the derivation gives you.
   Every one of these is displayed verbatim inside a lesson, so the code must
   read as the math — no cleverness, no premature optimisation.
   ───────────────────────────────────────────────────────────────────────── */

/** Forward (explicit) Euler. One f-eval, first order, conditionally stable. */
export const forwardEuler: Integrator = {
  key: 'forward-euler',
  label: 'Forward Euler',
  order: 1,
  symplectic: false,
  cost: 1,
  step: (f, t, y, h) => axpy(h, f(t, y), y),
};

/** Explicit midpoint (RK2). Second order for two f-evals. */
export const midpoint: Integrator = {
  key: 'midpoint',
  label: 'Midpoint (RK2)',
  order: 2,
  symplectic: false,
  cost: 2,
  step: (f, t, y, h) => {
    const k1 = f(t, y);
    const k2 = f(t + h / 2, axpy(h / 2, k1, y));
    return axpy(h, k2, y);
  },
};

/** Heun / explicit trapezoid. Second order, predictor–corrector shape. */
export const heun: Integrator = {
  key: 'heun',
  label: 'Heun (trapezoid)',
  order: 2,
  symplectic: false,
  cost: 2,
  step: (f, t, y, h) => {
    const k1 = f(t, y);
    const predictor = axpy(h, k1, y);
    const k2 = f(t + h, predictor);
    return axpy(h / 2, add(k1, k2), y);
  },
};

/** Classical fourth-order Runge–Kutta. The workhorse. Four f-evals. */
export const rk4: Integrator = {
  key: 'rk4',
  label: 'RK4',
  order: 4,
  symplectic: false,
  cost: 4,
  step: (f, t, y, h) => {
    const k1 = f(t, y);
    const k2 = f(t + h / 2, axpy(h / 2, k1, y));
    const k3 = f(t + h / 2, axpy(h / 2, k2, y));
    const k4 = f(t + h, axpy(h, k3, y));

    // y + (h/6)(k1 + 2k2 + 2k3 + k4)
    const slope = k1.map((_, i) => k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]);
    return axpy(h / 6, slope, y);
  },
};

/* ─────────────────────────────────────────────────────────────────────────
   Implicit methods. The unknown appears on both sides, so each step is a
   nonlinear solve. Newton, not fixed-point: the fixed-point map contracts
   only when h·|∂f/∂y| < 1, which is exactly the regime where an implicit
   method has no advantage. See newtonSolve.
   ───────────────────────────────────────────────────────────────────────── */

/** Backward Euler. First order, but A-stable: no step-size stability limit.
 *
 *  Solves y_{n+1} = y_n + h f(t_{n+1}, y_{n+1}) with Newton. See the note in
 *  `newtonSolve` for why fixed-point iteration is not an option here. */
export const backwardEuler: Integrator = {
  key: 'backward-euler',
  label: 'Backward Euler',
  order: 1,
  symplectic: false,
  cost: 8,
  step: (f, t, y, h) =>
    newtonSolve(
      (guess) => guess.map((gi, i) => gi - y[i] - h * f(t + h, guess)[i]),
      axpy(h, f(t, y), y),
    ),
};

/** Implicit trapezoid. Second order and A-stable, but not L-stable: it rings
 *  rather than damping on very stiff modes — which is exactly the point of
 *  the stiffness lesson. */
export const trapezoid: Integrator = {
  key: 'trapezoid',
  label: 'Implicit trapezoid',
  order: 2,
  symplectic: false,
  cost: 8,
  step: (f, t, y, h) => {
    const fn = f(t, y);
    return newtonSolve(
      (guess) => {
        const fnext = f(t + h, guess);
        return guess.map((gi, i) => gi - y[i] - (h / 2) * (fn[i] + fnext[i]));
      },
      axpy(h, fn, y),
    );
  },
};

/* ─────────────────────────────────────────────────────────────────────────
   Geometric (symplectic) integrators for separable Hamiltonians.

   These assume the state is laid out as [...positions, ...velocities] and
   that acceleration depends on position alone: a = a(q). That restriction is
   precisely what buys the conservation property.
   ───────────────────────────────────────────────────────────────────────── */

/** Splits a [q, v] state down the middle.
 *
 *  Throws on an odd-length state: a symplectic method applied to a system that
 *  is not a [position, velocity] pair is not "less accurate", it is
 *  meaningless. Failing loudly here stops a lesson from quietly plotting a
 *  wrong curve. */
export function splitQV(y: State): { q: State; v: State } {
  if (y.length % 2 !== 0) {
    throw new Error(
      `Symplectic integrators need an even-length [q, v] state; got length ${y.length}. ` +
        `Use a non-symplectic method for this system.`,
    );
  }
  const n = y.length / 2;
  return { q: y.slice(0, n), v: y.slice(n) };
}

/** Reads acceleration out of a first-order RHS, for [q, v] layouts. */
function accelOf(f: Deriv, t: number, q: State, v: State): State {
  const n = q.length;
  return f(t, [...q, ...v]).slice(n);
}

/** Symplectic Euler (semi-implicit): velocity first, then position with the
 *  UPDATED velocity. That one-line reordering is the whole difference from
 *  forward Euler, and it is the difference between a decaying orbit and a
 *  stable one. */
export const symplecticEuler: Integrator = {
  key: 'symplectic-euler',
  label: 'Symplectic Euler',
  order: 1,
  symplectic: true,
  cost: 1,
  step: (f, t, y, h) => {
    const { q, v } = splitQV(y);
    const vNext = axpy(h, accelOf(f, t, q, v), v);
    const qNext = axpy(h, vNext, q);
    return [...qNext, ...vNext];
  },
};

/** Velocity Verlet. Second order, symplectic, time-reversible, one force
 *  evaluation per step if you carry the acceleration forward. The standard
 *  choice for molecular dynamics and N-body work. */
export const velocityVerlet: Integrator = {
  key: 'velocity-verlet',
  label: 'Velocity Verlet',
  order: 2,
  symplectic: true,
  cost: 2,
  step: (f, t, y, h) => {
    const { q, v } = splitQV(y);
    const a = accelOf(f, t, q, v);

    // q_{n+1} = q_n + h v_n + (h²/2) a_n
    const qNext = q.map((qi, i) => qi + h * v[i] + 0.5 * h * h * a[i]);
    const aNext = accelOf(f, t + h, qNext, v);

    // v_{n+1} = v_n + (h/2)(a_n + a_{n+1})
    const vNext = v.map((vi, i) => vi + 0.5 * h * (a[i] + aNext[i]));
    return [...qNext, ...vNext];
  },
};

export const INTEGRATORS: Integrator[] = [
  forwardEuler,
  midpoint,
  heun,
  rk4,
  backwardEuler,
  trapezoid,
  symplecticEuler,
  velocityVerlet,
];

export const integratorByKey = (key: string): Integrator => {
  const found = INTEGRATORS.find((m) => m.key === key);
  if (!found) throw new Error(`Unknown integrator "${key}"`);
  return found;
};

/* ── amplification factor R(z) on y' = λy, z = hλ ──────────────────────── */

const cdiv = (a: [number, number], b: [number, number]): [number, number] => {
  const d = b[0] * b[0] + b[1] * b[1];
  return [(a[0] * b[0] + a[1] * b[1]) / d, (a[1] * b[0] - a[0] * b[1]) / d];
};
const cmul = (a: [number, number], b: [number, number]): [number, number] => [
  a[0] * b[0] - a[1] * b[1],
  a[0] * b[1] + a[1] * b[0],
];

/** Amplification factor R(z) of a one-step method on the Dahlquist test
 *  equation y' = λy, z = hλ. Returned as [Re, Im]. Absolutely stable
 *  exactly where |R(z)| ≤ 1. */
export function amplification(key: string, re: number, im = 0): [number, number] {
  const z: [number, number] = [re, im];
  switch (key) {
    case 'forward-euler':
      return [1 + re, im];
    case 'midpoint':
    case 'heun':
    case 'rk2': {
      const z2 = cmul(z, z);
      return [1 + re + 0.5 * z2[0], im + 0.5 * z2[1]];
    }
    case 'rk4': {
      const z2 = cmul(z, z);
      const z3 = cmul(z2, z);
      const z4 = cmul(z3, z);
      return [
        1 + re + z2[0] / 2 + z3[0] / 6 + z4[0] / 24,
        im + z2[1] / 2 + z3[1] / 6 + z4[1] / 24,
      ];
    }
    case 'backward-euler':
      return cdiv([1, 0], [1 - re, -im]);
    case 'trapezoid':
      return cdiv([1 + re / 2, im / 2], [1 - re / 2, -im / 2]);
    default:
      throw new Error(`No amplification factor for "${key}"`);
  }
}

export function amplificationMag(key: string, re: number, im = 0): number {
  const [a, b] = amplification(key, re, im);
  return Math.hypot(a, b);
}

/* ── driving a solver ──────────────────────────────────────────────────── */

export interface Trajectory {
  t: number[];
  y: State[];
  /** True when the run went non-finite — a blown-up explicit method. */
  diverged: boolean;
}

/** Fixed-step integration over [t0, t0 + span]. Stops early and flags on
 *  overflow so an unstable configuration renders as "it blew up" rather than
 *  as a chart full of NaN. */
export function integrate(
  method: Integrator | Stepper,
  f: Deriv,
  y0: State,
  t0: number,
  span: number,
  h: number,
): Trajectory {
  const step = typeof method === 'function' ? method : method.step;
  const steps = Math.max(1, Math.round(span / h));

  const t: number[] = [t0];
  const y: State[] = [y0.slice()];

  let tc = t0;
  let yc = y0.slice();

  for (let i = 0; i < steps; i++) {
    yc = step(f, tc, yc, h);
    tc = t0 + (i + 1) * h; // accumulate from t0, not tc += h, to avoid drift

    if (!yc.every(Number.isFinite)) return { t, y, diverged: true };

    t.push(tc);
    y.push(yc.slice());
  }
  return { t, y, diverged: false };
}

/** State at t0 + span only — the quantity convergence studies actually need. */
export function integrateTo(
  method: Integrator | Stepper,
  f: Deriv,
  y0: State,
  t0: number,
  span: number,
  h: number,
): State | null {
  const step = typeof method === 'function' ? method : method.step;
  const steps = Math.max(1, Math.round(span / h));
  let yc = y0.slice();
  for (let i = 0; i < steps; i++) {
    yc = step(f, t0 + i * h, yc, h);
    if (!yc.every(Number.isFinite)) return null;
  }
  return yc;
}

/* ─────────────────────────────────────────────────────────────────────────
   Embedded pairs and adaptive step-size control.

   Appended, not woven into the fixed-step family above: classical RK4 must
   keep the contract the RK4 lesson displays. An embedded pair is the same
   Runge–Kutta shape with TWO weight rows over the same stages. Their
   difference is the local-error estimate, and that estimate drives h.
   ───────────────────────────────────────────────────────────────────────── */

export interface EmbeddedStep {
  /** Higher-order solution — the one you advance with (local extrapolation). */
  yHigh: State;
  /** Lower-order companion, built from the same stages. */
  yLow: State;
  /** yHigh − yLow. The local-error estimate is this difference. */
  err: State;
}

/** Euler + Heun on shared stages: the smallest embedded pair.
 *
 *  k₁ is free for both; k₂ is Heun's endpoint sample. The difference
 *  collapses to (h/2)(k₂ − k₁) — half a step times how much the slope
 *  changed. If the slope barely moved, the interval was easy. */
export function heunEulerStep(f: Deriv, t: number, y: State, h: number): EmbeddedStep {
  const k1 = f(t, y);
  const k2 = f(t + h, axpy(h, k1, y));
  const yHigh = axpy(h / 2, add(k1, k2), y);
  const yLow = axpy(h, k1, y);
  const err = yHigh.map((v, i) => v - yLow[i]);
  return { yHigh, yLow, err };
}

/* Dormand–Prince 5(4), the RK5(4)7M pair (Dormand & Prince 1980).
 *
 * Seven stages, but the 7th is FSAL: k₇ = f(t+h, y₅) is k₁ of the next
 * accepted step, so an accepted step costs six f-evaluations. The first
 * weight row is 5th order and is the solution you keep (they minimised
 * THAT truncation error, unlike Fehlberg). The second row is 4th order;
 * the difference is the error estimate.
 *
 * Coefficients are the fractions from the paper, written as arithmetic so
 * the tableau is the code. */

const DP_C = [0, 1 / 5, 3 / 10, 4 / 5, 8 / 9, 1, 1];

const DP_A: number[][] = [
  [],
  [1 / 5],
  [3 / 40, 9 / 40],
  [44 / 45, -56 / 15, 32 / 9],
  [19372 / 6561, -25360 / 2187, 64448 / 6561, -212 / 729],
  [9017 / 3168, -355 / 33, 46732 / 5247, 49 / 176, -5103 / 18656],
  [35 / 384, 0, 500 / 1113, 125 / 192, -2187 / 6784, 11 / 84],
];

/** 5th-order weights. b₇ = 0: y₅ does not use k₇ (FSAL). */
const DP_B5 = [35 / 384, 0, 500 / 1113, 125 / 192, -2187 / 6784, 11 / 84, 0];

/** 4th-order companion. */
const DP_B4 = [5179 / 57600, 0, 7571 / 16695, 393 / 640, -92097 / 339200, 187 / 2100, 1 / 40];

function weightedSum(y: State, h: number, b: number[], k: State[]): State {
  return y.map((yi, i) => {
    let s = 0;
    for (let j = 0; j < b.length; j++) s += b[j] * k[j][i];
    return yi + h * s;
  });
}

export interface Dopri54Step extends EmbeddedStep {
  /** k₇, which is k₁ of the next accepted step. */
  k7: State;
}

/** One Dormand–Prince 5(4) step. Pass `k1` to reuse FSAL from the previous
 *  accepted step; omit it to evaluate f at the left endpoint. */
export function dopri54Step(
  f: Deriv,
  t: number,
  y: State,
  h: number,
  k1?: State,
): Dopri54Step {
  const k: State[] = new Array(7);
  k[0] = k1 ?? f(t, y);
  for (let i = 1; i < 7; i++) {
    const yi = y.map((yj, j) => {
      let s = 0;
      for (let m = 0; m < DP_A[i].length; m++) s += DP_A[i][m] * k[m][j];
      return yj + h * s;
    });
    k[i] = f(t + DP_C[i] * h, yi);
  }
  const yHigh = weightedSum(y, h, DP_B5, k);
  const yLow = weightedSum(y, h, DP_B4, k);
  const err = yHigh.map((v, i) => v - yLow[i]);
  return { yHigh, yLow, err, k7: k[6] };
}

/** Fixed-step Dormand–Prince, advancing with the 5th-order solution.
 *  Not pushed onto `INTEGRATORS`: this file is append-only, and the
 *  adaptive runner below is the reason the pair exists. */
export const dopri54: Integrator = {
  key: 'dopri54',
  label: 'Dormand–Prince 5(4)',
  order: 5,
  symplectic: false,
  cost: 6,
  step: (f, t, y, h) => dopri54Step(f, t, y, h).yHigh,
};

/** Hairer / SciPy mixed scaling: the unit in which a local error of "1"
 *  means "on tolerance". atol is a floor; rtol is a fraction of |y|. */
export function scaledError(
  err: State,
  y: State,
  yNew: State,
  atol: number,
  rtol: number,
): number {
  const n = err.length;
  let acc = 0;
  for (let i = 0; i < n; i++) {
    const sc = atol + rtol * Math.max(Math.abs(y[i]), Math.abs(yNew[i]));
    const d = err[i] / Math.max(sc, 1e-16);
    acc += d * d;
  }
  return Math.sqrt(acc / n);
}

export interface AdaptiveOptions {
  atol?: number;
  rtol?: number;
  h0?: number;
  hMin?: number;
  hMax?: number;
  maxSteps?: number;
}

export interface AdaptiveTrajectory {
  t: number[];
  y: State[];
  /** Step size used to arrive at t[i]. h[0] = 0. */
  h: number[];
  /** Scaled error of the accepted step that landed at t[i]. err[0] = 0. */
  err: number[];
  rejected: { t: number; h: number; err: number }[];
  nAccepted: number;
  nRejected: number;
  nEvals: number;
  diverged: boolean;
}

const SAFETY = 0.9;
const MIN_FACTOR = 0.2;
const MAX_FACTOR = 10;
/** Local-error estimate of DP5(4) is O(h⁵), so the I-controller exponent
 *  is 1/5. Matching SciPy RK45 / Hairer dopri5. */
const ERROR_EXP = 5;

function clipFactor(fac: number): number {
  if (!Number.isFinite(fac) || fac > MAX_FACTOR) return MAX_FACTOR;
  if (fac < MIN_FACTOR) return MIN_FACTOR;
  return fac;
}

/** Elementary I-controller. Used on rejected steps so a stale previous
 *  error cannot accidentally grow h. */
function iFactor(err: number): number {
  if (!(err > 0)) return MAX_FACTOR;
  return clipFactor(SAFETY * err ** (-1 / ERROR_EXP));
}

/** Gustafsson PI.3.4 on accepted steps: I-term reacts to the current
 *  error, P-term damps the change so h does not ring. */
function piFactor(err: number, errPrev: number): number {
  if (!(err > 0)) return MAX_FACTOR;
  const prev = Math.max(errPrev, 1e-16);
  const iTerm = err ** (-0.3 / ERROR_EXP);
  const pTerm = (prev / err) ** (0.4 / ERROR_EXP);
  return clipFactor(SAFETY * iTerm * pTerm);
}

/** Adaptive Dormand–Prince over [t0, t0+span].
 *
 *  Each attempt produces a scaled error e. e ≤ 1: accept, advance with
 *  the 5th-order solution, resize h. e > 1: reject, shrink h, retry from
 *  the same point — the solution does not move. */
export function integrateAdaptive(
  f: Deriv,
  y0: State,
  t0: number,
  span: number,
  opts: AdaptiveOptions = {},
): AdaptiveTrajectory {
  const atol = opts.atol ?? 1e-6;
  const rtol = opts.rtol ?? 1e-6;
  const hMin = opts.hMin ?? 1e-12 * Math.max(span, 1);
  const hMax = opts.hMax ?? span;
  const maxSteps = opts.maxSteps ?? 100_000;
  const tEnd = t0 + span;

  let h = Math.min(Math.max(opts.h0 ?? Math.min(0.1, span / 10), hMin), hMax);
  let t = t0;
  let y = y0.slice();
  let k1: State | undefined = f(t, y);
  let nEvals = 1;
  let errPrev: number | null = null;

  const ts: number[] = [t];
  const ys: State[] = [y.slice()];
  const hs: number[] = [0];
  const errs: number[] = [0];
  const rejected: AdaptiveTrajectory['rejected'] = [];
  let nAccepted = 0;
  let nRejected = 0;

  while (t < tEnd - 1e-14 * Math.max(span, 1) && nAccepted < maxSteps) {
    if (t + h > tEnd) h = tEnd - t;
    if (h < hMin) h = Math.min(hMin, tEnd - t);

    const step = dopri54Step(f, t, y, h, k1);
    nEvals += 6;

    if (!step.yHigh.every(Number.isFinite)) {
      return { t: ts, y: ys, h: hs, err: errs, rejected, nAccepted, nRejected, nEvals, diverged: true };
    }

    const e = scaledError(step.err, y, step.yHigh, atol, rtol);
    const forced = h <= hMin * 1.01;

    if (e <= 1 || forced) {
      t += h;
      y = step.yHigh;
      k1 = step.k7;
      ts.push(t);
      ys.push(y.slice());
      hs.push(h);
      errs.push(e);
      nAccepted += 1;
      const fac = errPrev === null ? iFactor(Math.max(e, 1e-16)) : piFactor(Math.max(e, 1e-16), errPrev);
      h = Math.min(hMax, Math.max(hMin, h * fac));
      errPrev = e;
    } else {
      rejected.push({ t, h, err: e });
      nRejected += 1;
      h = Math.max(hMin, h * iFactor(e));
      // k1 is still valid: same (t, y), only h changed.
    }
  }

  return { t: ts, y: ys, h: hs, err: errs, rejected, nAccepted, nRejected, nEvals, diverged: false };
}
