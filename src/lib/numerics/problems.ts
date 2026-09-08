import type { Deriv, State } from './types.ts';

/** A test problem with a known exact solution, so error is measurable rather
 *  than estimated. Every convergence claim in the lessons is checked against
 *  one of these. */
export interface Problem {
  key: string;
  label: string;
  /** Human-readable ODE, as LaTeX. */
  latex: string;
  f: Deriv;
  y0: State;
  t0: number;
  /** Sensible integration span for demonstrations. */
  span: number;
  exact?: (t: number) => State;
  /** Conserved quantity, when one exists (energy for Hamiltonian systems). */
  invariant?: (y: State) => number;
  labels: string[];
}

/** dy/dt = -λy. The whole of stability theory in one scalar equation. */
export function decay(lambda = 1): Problem {
  return {
    key: 'decay',
    label: `Exponential decay (λ = ${lambda})`,
    latex: String.raw`\deriv{y}{t} = -\lambda y, \quad y(0) = 1`,
    f: (_t, y) => [-lambda * y[0]],
    y0: [1],
    t0: 0,
    span: 5,
    exact: (t) => [Math.exp(-lambda * t)],
    labels: ['y'],
  };
}

/** Simple harmonic oscillator as a first-order system, laid out [q, v] so the
 *  symplectic integrators can consume it directly. Energy is conserved
 *  exactly by the true flow, which makes drift immediately visible. */
export function oscillator(omega = 1): Problem {
  return {
    key: 'oscillator',
    label: `Harmonic oscillator (ω = ${omega})`,
    latex: String.raw`\ddot{q} = -\omega^2 q, \quad q(0) = 1,\ \dot q(0) = 0`,
    f: (_t, [q, v]) => [v, -omega * omega * q],
    y0: [1, 0],
    t0: 0,
    span: 40,
    exact: (t) => [Math.cos(omega * t), -omega * Math.sin(omega * t)],
    invariant: ([q, v]) => 0.5 * v * v + 0.5 * omega * omega * q * q,
    labels: ['q', 'v'],
  };
}

/** Two-body Kepler problem in 2D, [x, y, vx, vy], GM = 1.
 *  Eccentricity `e` sets how brutal the perihelion passage is — the place
 *  where fixed-step methods earn or lose their reputation. */
export function kepler(e = 0.6): Problem {
  const r0 = 1 - e;
  const v0 = Math.sqrt((1 + e) / (1 - e));
  return {
    key: 'kepler',
    label: `Kepler orbit (e = ${e})`,
    latex: String.raw`\ddot{\mathbf{r}} = -\frac{\mathbf{r}}{\norm{\mathbf{r}}^3}`,
    f: (_t, [x, y, vx, vy]) => {
      const r = Math.hypot(x, y);
      const r3 = r * r * r;
      return [vx, vy, -x / r3, -y / r3];
    },
    y0: [r0, 0, 0, v0],
    t0: 0,
    span: 60,
    invariant: ([x, y, vx, vy]) => 0.5 * (vx * vx + vy * vy) - 1 / Math.hypot(x, y),
    labels: ['x', 'y', 'vx', 'vy'],
  };
}

/** Van der Pol. Non-stiff at μ = 1, genuinely stiff by μ = 1000 — the
 *  standard demonstration that step size can be set by stability rather than
 *  by accuracy. */
export function vanDerPol(mu = 5): Problem {
  return {
    key: 'van-der-pol',
    label: `Van der Pol (μ = ${mu})`,
    latex: String.raw`\ddot{x} - \mu(1 - x^2)\dot{x} + x = 0`,
    f: (_t, [x, v]) => [v, mu * (1 - x * x) * v - x],
    y0: [2, 0],
    t0: 0,
    span: 30,
    labels: ['x', 'v'],
  };
}

/** Lotka–Volterra. Non-Hamiltonian but has a conserved quantity, so it shows
 *  that "structure preservation" is a broader idea than energy. */
export function lotkaVolterra(a = 1.5, b = 1, c = 3, d = 1): Problem {
  return {
    key: 'lotka-volterra',
    label: 'Lotka–Volterra',
    latex: String.raw`\dot{x} = ax - bxy, \quad \dot{y} = -cy + dxy`,
    f: (_t, [x, y]) => [a * x - b * x * y, -c * y + d * x * y],
    y0: [1, 1],
    t0: 0,
    span: 30,
    invariant: ([x, y]) => d * x - c * Math.log(Math.max(x, 1e-12)) + b * y - a * Math.log(Math.max(y, 1e-12)),
    labels: ['prey', 'predator'],
  };
}

export const PROBLEMS: Record<string, () => Problem> = {
  decay: () => decay(1),
  oscillator: () => oscillator(1),
  kepler: () => kepler(0.6),
  'van-der-pol': () => vanDerPol(5),
  'lotka-volterra': () => lotkaVolterra(),
};
