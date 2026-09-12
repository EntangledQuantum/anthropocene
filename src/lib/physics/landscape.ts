/** Potential landscapes and the marble that rolls on them.
 *
 *  The reusable picture behind chapters 7, 14, 30 and 40: a curve U(x), a
 *  dashed total-energy line, and a particle that can only exist where the line
 *  is above the curve. Spring, pendulum, molecular bond, LC loop and quantum
 *  well are the same object wearing different clothes, which is exactly the
 *  transfer the curriculum asks for.
 *
 *  The integrator is velocity Verlet, deliberately. A lesson whose subject is
 *  "mechanical energy is conserved" cannot be run on a method that leaks energy
 *  — the learner would watch the marble sink out of its own valley and conclude
 *  the physics says so. Verlet's energy error is bounded forever rather than
 *  merely small, which is the property this lesson needs.
 */

export interface Landscape {
  id: string;
  label: string;
  /** Potential energy, in joules, at position x in metres. */
  U(x: number): number;
  /** dU/dx. Analytic wherever possible — the force is what drives the marble,
   *  and a finite-differenced force adds a fake damping the learner can see. */
  dU(x: number): number;
  domain: [number, number];
  /** A sensible energy line to start from. */
  suggestedE?: number;
  /** What the horizontal axis means in this costume. */
  xLabel?: string;
  yLabel?: string;
}

export const LANDSCAPES: Record<string, Landscape> = {
  /** The parabolic valley. Every other landscape looks like this near a
   *  minimum, which is why the harmonic oscillator is universal. */
  spring: {
    id: 'spring',
    label: 'ideal spring — U = ½kx²',
    U: (x) => 0.5 * 4 * x * x,
    dU: (x) => 4 * x,
    domain: [-2.4, 2.4],
    suggestedE: 3,
    xLabel: 'displacement (m)',
  },

  /** A straight slope: constant force, no turning point on the downhill side. */
  gravityRamp: {
    id: 'gravityRamp',
    label: 'uniform gravity — U = mgh',
    U: (x) => 2 * x,
    dU: () => 2,
    domain: [-1, 5],
    suggestedE: 6,
    xLabel: 'height (m)',
  },

  /** Two valleys and a barrier. Bound in one well, or free to cross — the
   *  same landscape gives both, and the energy line decides which. */
  doubleWell: {
    id: 'doubleWell',
    label: 'double well — two minima and a barrier',
    U: (x) => 0.6 * (x * x - 1.6) * (x * x - 1.6) - 0.4 * x,
    dU: (x) => 2.4 * x * (x * x - 1.6) - 0.4,
    domain: [-2.1, 2.1],
    suggestedE: 1.2,
    xLabel: 'position (m)',
  },

  /** A real molecular bond: steep wall, shallow tail. Asymmetric, so the
   *  average separation grows with energy — which is thermal expansion. */
  lennardJones: {
    id: 'lennardJones',
    label: 'molecular bond — Lennard-Jones',
    U: (r) => {
      const s6 = (1 / r) ** 6;
      return 4 * (s6 * s6 - s6);
    },
    dU: (r) => {
      const s6 = (1 / r) ** 6;
      return (4 * (6 * s6 - 12 * s6 * s6)) / r;
    },
    domain: [0.92, 3.2],
    suggestedE: -0.6,
    xLabel: 'separation (σ)',
  },

  /** Pendulum: periodic, and NOT harmonic once the swing is large. The place
   *  where "period is independent of amplitude" stops being true. */
  pendulum: {
    id: 'pendulum',
    label: 'pendulum — U = mgL(1 − cos θ)',
    U: (th) => 4 * (1 - Math.cos(th)),
    dU: (th) => 4 * Math.sin(th),
    domain: [-Math.PI * 1.15, Math.PI * 1.15],
    suggestedE: 3,
    xLabel: 'angle (rad)',
  },
};

/* ── rolling the marble ──────────────────────────────────────────────────── */

export interface MarbleState {
  t: number;
  x: number;
  v: number;
  K: number;
  U: number;
  E: number;
}

export interface RollOptions {
  mass?: number;
  dt?: number;
  steps?: number;
}

/** One velocity-Verlet step on a landscape. Acceleration is −U′(x)/m. */
export function verletStep(
  land: Landscape,
  x: number,
  v: number,
  dt: number,
  mass = 1,
): [number, number] {
  const a0 = -land.dU(x) / mass;
  const xNext = x + v * dt + 0.5 * a0 * dt * dt;
  const a1 = -land.dU(xNext) / mass;
  const vNext = v + 0.5 * (a0 + a1) * dt;
  return [xNext, vNext];
}

export function rollMarble(
  land: Landscape,
  x0: number,
  v0: number,
  opts: RollOptions = {},
): MarbleState[] {
  const { mass = 1, dt = 0.004, steps = 5000 } = opts;
  let x = x0;
  let v = v0;
  const out: MarbleState[] = [];
  for (let i = 0; i <= steps; i++) {
    const K = 0.5 * mass * v * v;
    const U = land.U(x);
    out.push({ t: i * dt, x, v, K, U, E: K + U });
    [x, v] = verletStep(land, x, v, dt, mass);
  }
  return out;
}

/** Speed a particle of total energy E has at x, or null where it cannot be.
 *
 *  Returning null rather than NaN is the point: "can the particle be at a place
 *  where E is below U?" is a question the lesson asks, and the answer has to be
 *  a refusal, not a silent NaN that renders as a gap. */
export function speedAt(land: Landscape, E: number, x: number, mass = 1): number | null {
  const k = E - land.U(x);
  return k < 0 ? null : Math.sqrt((2 * k) / mass);
}

/** Where the energy line meets the curve — the turning points.
 *
 *  Scan for sign changes of E − U(x), then bisect. Robust on landscapes with
 *  several wells, which a root-finder started from one guess is not. */
export function turningPointsOf(land: Landscape, E: number, samples = 2000): number[] {
  const [a, b] = land.domain;
  const f = (x: number) => E - land.U(x);
  const out: number[] = [];
  let prev = f(a);
  for (let i = 1; i <= samples; i++) {
    const x = a + ((b - a) * i) / samples;
    const cur = f(x);
    if (prev === 0) out.push(a + ((b - a) * (i - 1)) / samples);
    else if (prev * cur < 0) {
      let lo = a + ((b - a) * (i - 1)) / samples;
      let hi = x;
      for (let k = 0; k < 60; k++) {
        const mid = (lo + hi) / 2;
        if (f(lo) * f(mid) <= 0) hi = mid;
        else lo = mid;
      }
      out.push((lo + hi) / 2);
    }
    prev = cur;
  }
  return out;
}

/** Intervals of the domain the particle is allowed to occupy at energy E. */
export function allowedRegions(land: Landscape, E: number): [number, number][] {
  const [a, b] = land.domain;
  const edges = [a, ...turningPointsOf(land, E), b];
  const out: [number, number][] = [];
  for (let i = 0; i < edges.length - 1; i++) {
    const mid = (edges[i] + edges[i + 1]) / 2;
    if (E >= land.U(mid)) out.push([edges[i], edges[i + 1]]);
  }
  return out;
}

export type Stability = 'stable' | 'unstable' | 'neutral';

export interface Equilibrium {
  x: number;
  U: number;
  curvature: number;
  stability: Stability;
  /** Angular frequency of small oscillations, for stable equilibria only. */
  omega?: number;
}

/** Equilibria and their character, read off the shape of U.
 *
 *  A minimum traps, a maximum tips, a flat stretch neither — the whole of
 *  "stable vs unstable vs neutral" is the second derivative, and a lesson can
 *  let the learner read it off the curve before the word appears. */
export function equilibriaOf(land: Landscape, mass = 1, samples = 4000): Equilibrium[] {
  const [a, b] = land.domain;
  const h = (b - a) / samples;
  const out: Equilibrium[] = [];
  let prev = land.dU(a);

  for (let i = 1; i <= samples; i++) {
    const x = a + i * h;
    const cur = land.dU(x);
    if (prev * cur < 0 || cur === 0) {
      let lo = x - h;
      let hi = x;
      for (let k = 0; k < 60; k++) {
        const mid = (lo + hi) / 2;
        if (land.dU(lo) * land.dU(mid) <= 0) hi = mid;
        else lo = mid;
      }
      const xe = (lo + hi) / 2;
      const eps = Math.max(1e-5, (b - a) * 1e-5);
      const curvature = (land.dU(xe + eps) - land.dU(xe - eps)) / (2 * eps);
      const stability: Stability =
        curvature > 1e-6 ? 'stable' : curvature < -1e-6 ? 'unstable' : 'neutral';
      out.push({
        x: xe,
        U: land.U(xe),
        curvature,
        stability,
        omega: stability === 'stable' ? Math.sqrt(curvature / mass) : undefined,
      });
    }
    prev = cur;
  }
  return out;
}

/** Period measured from an actual run, by timing successive returns.
 *
 *  Measured rather than derived, so a lesson can put "does the period depend on
 *  amplitude?" to the learner and have the world answer honestly — which it
 *  does differently for a spring and for a pendulum. */
export function measuredPeriod(
  land: Landscape,
  x0: number,
  opts: RollOptions = {},
): number | null {
  const mass = opts.mass ?? 1;
  const dt = opts.dt ?? 0.001;
  const path = rollMarble(land, x0, 0, { mass, dt, steps: opts.steps ?? 40_000 });

  // Released from rest, so the motion returns to x0 one full period later.
  // Count zero crossings of the velocity instead: two of them make a period,
  // and they are sharp where a position match is ambiguous.
  const crossings: number[] = [];
  for (let i = 1; i < path.length; i++) {
    if (path[i - 1].v * path[i].v < 0) {
      const f = path[i - 1].v / (path[i - 1].v - path[i].v);
      crossings.push(path[i - 1].t + f * dt);
      if (crossings.length >= 3) break;
    }
  }
  return crossings.length >= 3 ? crossings[2] - crossings[0] : null;
}
