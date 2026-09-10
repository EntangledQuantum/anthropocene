import { forwardEuler, rk4 } from './ode.ts';
import type { Deriv, Integrator, State } from './types.ts';

/* ─────────────────────────────────────────────────────────────────────────
   Holonomic constraints, and maps that stay on a manifold.

   The planar pendulum in Cartesian coordinates is the simplest useful case:
   a particle of unit mass, gravity f = (0, −1), holonomic constraint

     g(q) = ½(|q|² − 1) = 0,    ∇g = q,    ġ = q · v.

   Differentiating twice and solving for the multiplier gives an ODE on R⁴
   whose *flow* stays on the circle. A discrete map of that ODE does not —
   that is the drift. SHAKE chooses λ so g(q_{n+1}) = 0 as part of a Verlet
   step; RATTLE also hits the hidden constraint q_{n+1} · v_{n+1} = 0.

   The transfer costume is kinematics on SO(3): Ṙ = R ω̂. RK4 on the nine
   entries leaves the group. R ← R exp(h ω̂) never leaves.
   ───────────────────────────────────────────────────────────────────────── */

export type Vec2 = [number, number];
export type Vec3 = [number, number, number];
export type Mat3 = number[]; // 9 entries, row-major

export const PENDULUM_THETA0 = 1.2;
export const PENDULUM_OMEGA0 = 0;

/** q = (sin θ, −cos θ), hanging down at θ = 0. v is the tangent θ̇. */
export function pendulumState(theta = PENDULUM_THETA0, omega = PENDULUM_OMEGA0): State {
  const s = Math.sin(theta);
  const c = Math.cos(theta);
  return [s, -c, omega * c, omega * s];
}

export function pendulumQ(y: State): Vec2 {
  return [y[0], y[1]];
}
export function pendulumV(y: State): Vec2 {
  return [y[2], y[3]];
}

export function packPendulum(q: Vec2, v: Vec2): State {
  return [q[0], q[1], v[0], v[1]];
}

/** g(q) = ½(|q|² − 1). Zero on the unit circle. */
export function pendulumG(q: Vec2): number {
  return 0.5 * (q[0] * q[0] + q[1] * q[1] - 1);
}

/** Hidden constraint ġ = q · v. Zero on the tangent bundle. */
export function pendulumGDot(q: Vec2, v: Vec2): number {
  return q[0] * v[0] + q[1] * v[1];
}

export function pendulumRadius(q: Vec2): number {
  return Math.hypot(q[0], q[1]);
}

/** E = ½|v|² + y. Gravity points down, V = y. */
export function pendulumEnergy(q: Vec2, v: Vec2): number {
  return 0.5 * (v[0] * v[0] + v[1] * v[1]) + q[1];
}

const GRAVITY: Vec2 = [0, -1];

/** Index-reduced acceleration: λ from g̈ = 0, a = f − λ q.
 *
 *  q · a + |v|² = 0  and  a = f − λ q  ⇒  λ = (|v|² + q · f) / |q|². */
export function indexReducedAccel(q: Vec2, v: Vec2): Vec2 {
  const r2 = q[0] * q[0] + q[1] * q[1];
  if (r2 < 1e-18) return [GRAVITY[0], GRAVITY[1]];
  const v2 = v[0] * v[0] + v[1] * v[1];
  const qf = q[0] * GRAVITY[0] + q[1] * GRAVITY[1];
  const lambda = (v2 + qf) / r2;
  return [GRAVITY[0] - lambda * q[0], GRAVITY[1] - lambda * q[1]];
}

/** First-order form of the index-reduced pendulum, for RK4 / Euler. */
export const indexReducedPendulumF: Deriv = (_t, y) => {
  const q: Vec2 = [y[0], y[1]];
  const v: Vec2 = [y[2], y[3]];
  const a = indexReducedAccel(q, v);
  return [v[0], v[1], a[0], a[1]];
};

/** Free particle under gravity — the pendulum with the constraint forgotten. */
export const freePendulumF: Deriv = (_t, y) => [y[2], y[3], GRAVITY[0], GRAVITY[1]];

/** SHAKE multiplier: qNext = qUnc − α q lands on |qNext|² = 1.
 *
 *  Scalar Newton from α = 0, the original SHAKE iteration for one constraint.
 *  The force that produced this α acted along ∇g(q_n) = q_n, not along the
 *  new radius. That is the whole difference from renormalising afterwards. */
export function shakeAlpha(q: Vec2, qUnc: Vec2, radius2 = 1): number {
  let alpha = 0;
  for (let k = 0; k < 24; k++) {
    const x = qUnc[0] - alpha * q[0];
    const y = qUnc[1] - alpha * q[1];
    const g = 0.5 * (x * x + y * y - radius2);
    if (Math.abs(g) < 1e-15) return alpha;
    const gp = -(x * q[0] + y * q[1]);
    if (Math.abs(gp) < 1e-18) break;
    alpha -= g / gp;
  }
  return alpha;
}

function verletPositionPredictor(q: Vec2, v: Vec2, h: number): Vec2 {
  return [
    q[0] + h * v[0] + 0.5 * h * h * GRAVITY[0],
    q[1] + h * v[1] + 0.5 * h * h * GRAVITY[1],
  ];
}

/** SHAKE: g(q_{n+1}) = 0; the hidden constraint is not imposed.
 *
 *  Position is Verlet with λ chosen so the new point is on the circle.
 *  Velocity is the Verlet completion with gravity only — so q · v = O(h²). */
export function shakePendulumStep(q: Vec2, v: Vec2, h: number): { q: Vec2; v: Vec2 } {
  const qUnc = verletPositionPredictor(q, v, h);
  const alpha = shakeAlpha(q, qUnc);
  const qNext: Vec2 = [qUnc[0] - alpha * q[0], qUnc[1] - alpha * q[1]];
  const vHalf: Vec2 = [(qNext[0] - q[0]) / h, (qNext[1] - q[1]) / h];
  const vNext: Vec2 = [vHalf[0] + 0.5 * h * GRAVITY[0], vHalf[1] + 0.5 * h * GRAVITY[1]];
  return { q: qNext, v: vNext };
}

/** RATTLE: SHAKE, then a second multiplier so q_{n+1} · v_{n+1} = 0.
 *
 *  For this spherical constraint the velocity correction is the orthogonal
 *  projection of the Verlet-completed velocity onto the tangent. Andersen
 *  1983; symplectic by Leimkuhler & Skeel 1994. */
export function rattlePendulumStep(q: Vec2, v: Vec2, h: number): { q: Vec2; v: Vec2 } {
  const shaken = shakePendulumStep(q, v, h);
  const qNext = shaken.q;
  const vUnc = shaken.v;
  const r2 = qNext[0] * qNext[0] + qNext[1] * qNext[1];
  const mu = (qNext[0] * vUnc[0] + qNext[1] * vUnc[1]) / r2;
  const vNext: Vec2 = [vUnc[0] - mu * qNext[0], vUnc[1] - mu * qNext[1]];
  return { q: qNext, v: vNext };
}

/** Project (q, v) onto the tangent bundle of the unit circle. */
export function projectToCircle(q: Vec2, v: Vec2): { q: Vec2; v: Vec2 } {
  const r = Math.hypot(q[0], q[1]);
  if (r < 1e-18) return { q: [1, 0], v: [0, 0] };
  const qn: Vec2 = [q[0] / r, q[1] / r];
  const radial = qn[0] * v[0] + qn[1] * v[1];
  return { q: qn, v: [v[0] - radial * qn[0], v[1] - radial * qn[1]] };
}

export type PendulumMethod = 'free' | 'index-rk4' | 'index-euler' | 'shake' | 'rattle' | 'project';

export function stepPendulum(method: PendulumMethod, y: State, h: number): State {
  const q = pendulumQ(y);
  const v = pendulumV(y);
  switch (method) {
    case 'free':
      return forwardEuler.step(freePendulumF, 0, y, h);
    case 'index-euler':
      return forwardEuler.step(indexReducedPendulumF, 0, y, h);
    case 'index-rk4':
      return rk4.step(indexReducedPendulumF, 0, y, h);
    case 'shake': {
      const n = shakePendulumStep(q, v, h);
      return packPendulum(n.q, n.v);
    }
    case 'rattle': {
      const n = rattlePendulumStep(q, v, h);
      return packPendulum(n.q, n.v);
    }
    case 'project': {
      const ambient = rk4.step(indexReducedPendulumF, 0, y, h);
      const n = projectToCircle(pendulumQ(ambient), pendulumV(ambient));
      return packPendulum(n.q, n.v);
    }
  }
}

export const rattlePendulum: Integrator = {
  key: 'rattle',
  label: 'RATTLE',
  order: 2,
  symplectic: true,
  cost: 2,
  step: (_f, _t, y, h) => stepPendulum('rattle', y, h),
};

export const shakePendulum: Integrator = {
  key: 'shake',
  label: 'SHAKE',
  order: 2,
  symplectic: true,
  cost: 2,
  step: (_f, _t, y, h) => stepPendulum('shake', y, h),
};

export interface PendulumSample {
  t: number;
  y: State;
  g: number;
  gdot: number;
  radius: number;
  energy: number;
}

export function runPendulum(
  method: PendulumMethod,
  h: number,
  span: number,
  y0: State = pendulumState(),
): PendulumSample[] {
  const steps = Math.max(1, Math.round(span / h));
  const out: PendulumSample[] = [];
  let y = y0.slice();
  const push = (t: number, s: State) => {
    const q = pendulumQ(s);
    const v = pendulumV(s);
    out.push({
      t, y: s.slice(),
      g: pendulumG(q),
      gdot: pendulumGDot(q, v),
      radius: pendulumRadius(q),
      energy: pendulumEnergy(q, v),
    });
  };
  push(0, y);
  for (let i = 0; i < steps; i++) {
    y = stepPendulum(method, y, h);
    if (!y.every(Number.isFinite)) break;
    push((i + 1) * h, y);
  }
  return out;
}

export function pendulumRadiusAt(method: PendulumMethod, h: number, span: number, y0?: State): number {
  const run = runPendulum(method, h, span, y0);
  return run[run.length - 1]!.radius;
}

/** Smallest h at which index-reduced RK4's radius at time `span` has fallen
 *  to `target` < 1 (pre-blowup). Larger h then dips further, then explodes —
 *  that explosion is a different failure, and this hunt stays on the dip. */
export function hWhereRadiusFallsBelow(target: number, span: number, hMin = 0.05, hMax = 0.38): number {
  let lo = hMin;
  let hi = hMax;
  for (let i = 0; i < 40; i++) {
    const mid = 0.5 * (lo + hi);
    const r = pendulumRadiusAt('index-rk4', mid, span);
    if (r > target && r < 2) lo = mid;
    else hi = mid;
  }
  return hi;
}

/* ── SO(3) ─────────────────────────────────────────────────────────────── */

export const I3: Mat3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];

export function hat(w: Vec3): Mat3 {
  const [x, y, z] = w;
  return [0, -z, y, z, 0, -x, -y, x, 0];
}

export function matMul(A: Mat3, B: Mat3): Mat3 {
  const C = [0, 0, 0, 0, 0, 0, 0, 0, 0];
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      C[i * 3 + j] = A[i * 3] * B[j] + A[i * 3 + 1] * B[3 + j] + A[i * 3 + 2] * B[6 + j];
    }
  }
  return C;
}

export function matT(A: Mat3): Mat3 {
  return [A[0], A[3], A[6], A[1], A[4], A[7], A[2], A[5], A[8]];
}

export function matVec(A: Mat3, v: Vec3): Vec3 {
  return [
    A[0] * v[0] + A[1] * v[1] + A[2] * v[2],
    A[3] * v[0] + A[4] * v[1] + A[5] * v[2],
    A[6] * v[0] + A[7] * v[1] + A[8] * v[2],
  ];
}

export function det3(A: Mat3): number {
  return (
    A[0] * (A[4] * A[8] - A[5] * A[7]) -
    A[1] * (A[3] * A[8] - A[5] * A[6]) +
    A[2] * (A[3] * A[7] - A[4] * A[6])
  );
}

export function frobenius(A: Mat3): number {
  let s = 0;
  for (let i = 0; i < 9; i++) s += A[i] * A[i];
  return Math.sqrt(s);
}

/** ||Rᵀ R − I||_F. Zero on O(3). */
export function orthoResidual(R: Mat3): number {
  const gram = matMul(matT(R), R);
  const D: Mat3 = gram.map((v, i) => v - I3[i]);
  return frobenius(D);
}

/** Rodrigues: exp(ω̂) = I + (sin θ) K + (1 − cos θ) K², K = ω̂ / |ω|. */
export function expSO3(w: Vec3): Mat3 {
  const theta = Math.hypot(w[0], w[1], w[2]);
  if (theta < 1e-12) {
    const K = hat(w);
    const K2 = matMul(K, K);
    const out = I3.slice();
    for (let i = 0; i < 9; i++) out[i] += K[i] + 0.5 * K2[i];
    return out;
  }
  const K = hat([w[0] / theta, w[1] / theta, w[2] / theta]);
  const K2 = matMul(K, K);
  const s = Math.sin(theta);
  const c = 1 - Math.cos(theta);
  const out = I3.slice();
  for (let i = 0; i < 9; i++) out[i] += s * K[i] + c * K2[i];
  return out;
}

/** Ṙ = R ω̂ as a 9-vector field, for RK4 on the ambient M₃. */
export function rotationKinematicsF(omega: Vec3): Deriv {
  const W = hat(omega);
  return (_t, r) => matMul(r, W);
}

/** Gram–Schmidt on the columns, then c₂ × c₀ to force det = +1.
 *  The tempting cleanup: sit back on SO(3) after leaving it. */
export function gramSchmidtSO3(R: Mat3): Mat3 {
  const c0: Vec3 = [R[0], R[3], R[6]];
  const n0 = Math.hypot(c0[0], c0[1], c0[2]) || 1;
  const u: Vec3 = [c0[0] / n0, c0[1] / n0, c0[2] / n0];
  const c1: Vec3 = [R[1], R[4], R[7]];
  const d = u[0] * c1[0] + u[1] * c1[1] + u[2] * c1[2];
  const v0: Vec3 = [c1[0] - d * u[0], c1[1] - d * u[1], c1[2] - d * u[2]];
  const n1 = Math.hypot(v0[0], v0[1], v0[2]) || 1;
  const v: Vec3 = [v0[0] / n1, v0[1] / n1, v0[2] / n1];
  const w: Vec3 = [
    u[1] * v[2] - u[2] * v[1],
    u[2] * v[0] - u[0] * v[2],
    u[0] * v[1] - u[1] * v[0],
  ];
  return [u[0], v[0], w[0], u[1], v[1], w[1], u[2], v[2], w[2]];
}

export const DEFAULT_OMEGA: Vec3 = [0.35, 0.55, 1.1];

export type RotationMethod = 'rk4' | 'lie' | 'project';

export function stepRotation(method: RotationMethod, R: Mat3, omega: Vec3, h: number): Mat3 {
  switch (method) {
    case 'rk4':
      return rk4.step(rotationKinematicsF(omega), 0, R, h);
    case 'lie':
      return matMul(R, expSO3([omega[0] * h, omega[1] * h, omega[2] * h]));
    case 'project':
      return gramSchmidtSO3(rk4.step(rotationKinematicsF(omega), 0, R, h));
  }
}

export interface RotationSample {
  t: number;
  R: Mat3;
  residual: number;
  det: number;
}

export function runRotation(
  method: RotationMethod,
  h: number,
  span: number,
  omega: Vec3 = DEFAULT_OMEGA,
  R0: Mat3 = I3,
): RotationSample[] {
  const steps = Math.max(1, Math.round(span / h));
  const out: RotationSample[] = [];
  let R = R0.slice();
  const push = (t: number, r: Mat3) => {
    out.push({ t, R: r.slice(), residual: orthoResidual(r), det: det3(r) });
  };
  push(0, R);
  for (let i = 0; i < steps; i++) {
    R = stepRotation(method, R, omega, h);
    if (!R.every(Number.isFinite)) break;
    push((i + 1) * h, R);
  }
  return out;
}

export function rk4OrthoResidualAt(
  h: number,
  span: number,
  omega: Vec3 = DEFAULT_OMEGA,
): number {
  const run = runRotation('rk4', h, span, omega);
  return run[run.length - 1]!.residual;
}
