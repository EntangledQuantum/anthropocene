/** Kinematics as the geometry of a worldline.
 *
 *  The organising claim of Chapter 2 is that x(t), v(t) and a(t) are three
 *  readings of ONE curve, not three independent stories. So everything here
 *  derives from a single sampled trajectory: differentiate down the stack,
 *  accumulate back up it, and the round trip is what a lesson can check.
 *
 *  Deliberately plain arrays and centred differences — the math is meant to be
 *  visible in the shape of the expression. Higher-order machinery lives in
 *  `lib/numerics/`, which is the computational path's business, not this one's.
 */

export interface Sample {
  t: number;
  x: number;
}

export interface Worldline {
  t: number[];
  x: number[];
  v: number[];
  a: number[];
}

/** Sample a position function on a uniform grid. */
export function sampleWorldline(
  x: (t: number) => number,
  t0: number,
  t1: number,
  n: number,
): Sample[] {
  const dt = (t1 - t0) / (n - 1);
  return Array.from({ length: n }, (_, i) => {
    const t = t0 + i * dt;
    return { t, x: x(t) };
  });
}

/** Centred first difference, one-sided at the ends.
 *
 *  One-sided ends matter pedagogically: the endpoints of a numerically
 *  differentiated graph are the least trustworthy points, and a lesson that
 *  silently pads them is teaching a lie about where information comes from. */
export function differentiate(t: readonly number[], y: readonly number[]): number[] {
  const n = y.length;
  const d = new Array<number>(n);
  for (let i = 1; i < n - 1; i++) {
    d[i] = (y[i + 1] - y[i - 1]) / (t[i + 1] - t[i - 1]);
  }
  d[0] = (y[1] - y[0]) / (t[1] - t[0]);
  d[n - 1] = (y[n - 1] - y[n - 2]) / (t[n - 1] - t[n - 2]);
  return d;
}

/** Cumulative trapezoidal integral, starting from `y0`.
 *
 *  The constant of integration is an argument rather than an assumption: "given
 *  only v(t), can you recover x(t)? What is missing?" is Chapter 2's opening
 *  question, and the missing thing is exactly this parameter. */
export function accumulate(
  t: readonly number[],
  y: readonly number[],
  y0 = 0,
): number[] {
  const out = [y0];
  for (let i = 1; i < y.length; i++) {
    out.push(out[i - 1] + 0.5 * (y[i] + y[i - 1]) * (t[i] - t[i - 1]));
  }
  return out;
}

/** Build the linked x/v/a stack from a position function. */
export function worldlineFrom(
  x: (t: number) => number,
  t0: number,
  t1: number,
  n = 241,
): Worldline {
  const samples = sampleWorldline(x, t0, t1, n);
  const t = samples.map((s) => s.t);
  const xs = samples.map((s) => s.x);
  const v = differentiate(t, xs);
  const a = differentiate(t, v);
  return { t, x: xs, v, a };
}

/** Build the stack from an acceleration function instead — integrating up.
 *
 *  Same three curves, opposite direction of travel. A lesson that shows both
 *  routes on the same motion is doing the representation test for free. */
export function worldlineFromAcceleration(
  a: (t: number) => number,
  x0: number,
  v0: number,
  t0: number,
  t1: number,
  n = 241,
): Worldline {
  const dt = (t1 - t0) / (n - 1);
  const t = Array.from({ length: n }, (_, i) => t0 + i * dt);
  const as = t.map(a);
  const v = accumulate(t, as, v0);
  const x = accumulate(t, v, x0);
  return { t, x, v, a: as };
}

/** Constant-acceleration position. The simplest useful case — and the one
 *  learners reach for when it does not apply. */
export const constantAccel =
  (x0: number, v0: number, a: number) =>
  (t: number): number =>
    x0 + v0 * t + 0.5 * a * t * t;

/** Total distance travelled: the integral of |v|, not |Δx|.
 *
 *  The gap between this and `net displacement` IS Chapter 2 lesson 1. */
export function distanceTravelled(t: readonly number[], v: readonly number[]): number {
  let s = 0;
  for (let i = 1; i < v.length; i++) {
    s += 0.5 * (Math.abs(v[i]) + Math.abs(v[i - 1])) * (t[i] - t[i - 1]);
  }
  return s;
}

export function netDisplacement(x: readonly number[]): number {
  return x[x.length - 1] - x[0];
}

/** Times where velocity crosses zero — the turning points.
 *
 *  Returned by linear interpolation between bracketing samples, so a lesson can
 *  mark them on the graph without them drifting off the curve. Sign changes
 *  only: a velocity that touches zero and returns the same way is not a turn. */
export function turningPoints(t: readonly number[], v: readonly number[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < v.length; i++) {
    if ((v[i - 1] < 0 && v[i] > 0) || (v[i - 1] > 0 && v[i] < 0)) {
      const f = v[i - 1] / (v[i - 1] - v[i]);
      out.push(t[i - 1] + f * (t[i] - t[i - 1]));
    } else if (v[i] === 0 && i + 1 < v.length && v[i - 1] * v[i + 1] < 0) {
      out.push(t[i]);
    }
  }
  return out;
}

/** Is the object speeding up at each sample?
 *
 *  True exactly when v and a share a sign — which is the honest answer to
 *  "negative velocity means slowing down", and it is not the sign of a alone.
 */
export function speedingUp(v: readonly number[], a: readonly number[]): boolean[] {
  return v.map((vi, i) => vi * a[i] > 0);
}

/* ── projectiles ─────────────────────────────────────────────────────────── */

export interface ProjectileState {
  t: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
}

export interface ProjectileOptions {
  /** Quadratic drag coefficient per unit mass, in 1/m. Zero gives the parabola. */
  drag?: number;
  g?: number;
  dt?: number;
  /** Stop when y falls back to this height. */
  groundY?: number;
  maxSteps?: number;
}

/** Launch a projectile, optionally with quadratic drag.
 *
 *  Velocity Verlet rather than Euler, because the drag-free case must close the
 *  parabola exactly enough that a learner comparing "with drag" to "without"
 *  is seeing drag and not integrator error. With drag the acceleration depends
 *  on velocity, so the velocity update is the standard two-pass predictor.
 */
export function launchProjectile(
  speed: number,
  angleDeg: number,
  opts: ProjectileOptions = {},
): ProjectileState[] {
  const { drag = 0, g = 9.81, dt = 0.004, groundY = 0, maxSteps = 200_000 } = opts;
  const th = (angleDeg * Math.PI) / 180;

  let x = 0;
  let y = 0;
  let vx = speed * Math.cos(th);
  let vy = speed * Math.sin(th);

  const accel = (ux: number, uy: number): [number, number] => {
    if (drag === 0) return [0, -g];
    const s = Math.hypot(ux, uy);
    return [-drag * s * ux, -g - drag * s * uy];
  };

  const out: ProjectileState[] = [{ t: 0, x, y, vx, vy }];
  let [ax, ay] = accel(vx, vy);

  for (let i = 1; i <= maxSteps; i++) {
    x += vx * dt + 0.5 * ax * dt * dt;
    y += vy * dt + 0.5 * ay * dt * dt;

    // Predict the velocity, evaluate acceleration there, then correct.
    const [px, py] = accel(vx + ax * dt, vy + ay * dt);
    vx += 0.5 * (ax + px) * dt;
    vy += 0.5 * (ay + py) * dt;
    [ax, ay] = accel(vx, vy);

    const t = i * dt;
    out.push({ t, x, y, vx, vy });
    if (y <= groundY && vy < 0) break;
  }
  return out;
}

/** Range of the drag-free parabola, in closed form. Used as the reference a
 *  drag run is measured against. */
export function idealRange(speed: number, angleDeg: number, g = 9.81): number {
  const th = (angleDeg * Math.PI) / 180;
  return (speed * speed * Math.sin(2 * th)) / g;
}

export function idealApex(speed: number, angleDeg: number, g = 9.81): number {
  const th = (angleDeg * Math.PI) / 180;
  const vy = speed * Math.sin(th);
  return (vy * vy) / (2 * g);
}

/* ── circular motion ─────────────────────────────────────────────────────── */

/** Split an acceleration into the part that changes speed and the part that
 *  steers. The reusable picture of Chapter 3: a velocity arrow whose tip is
 *  being dragged sideways. */
export function tangentNormalSplit(
  vx: number,
  vy: number,
  ax: number,
  ay: number,
): { tangential: number; normal: number } {
  const s = Math.hypot(vx, vy);
  if (s === 0) return { tangential: 0, normal: Math.hypot(ax, ay) };
  const tangential = (ax * vx + ay * vy) / s;
  // Signed: positive means steering counter-clockwise (toward the left of v).
  const normal = (ax * -vy + ay * vx) / s;
  return { tangential, normal };
}

/** Centripetal acceleration for uniform circular motion. */
export const centripetal = (speed: number, radius: number): number =>
  (speed * speed) / radius;
