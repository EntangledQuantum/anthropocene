import { type Deriv, type Integrator, type State, add, axpy } from './types.ts';
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
   Implicit methods. Solved with a fixed-point iteration rather than a Newton
   solve — enough for the mildly stiff problems in the lessons, and it keeps
   the mechanism visible: the state appears on BOTH sides of the equation.
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
