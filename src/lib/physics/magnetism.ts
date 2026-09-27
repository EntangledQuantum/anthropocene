/** Chapter 27: the magnetic force on moving charges, wires and loops.
 *
 *  SI throughout: coulombs, kilograms, metres, seconds, tesla, amperes.
 *  Vectors are 3D, because the magnetic force is a cross product and the
 *  field in every scene points into or out of the page (±z) while the motion
 *  stays in the page (x, y).
 *
 *  The integrator is the Boris push, the standard mover of particle-in-cell
 *  codes. Its magnetic half-step is an exact rotation of the velocity, so in a
 *  pure magnetic field it keeps the speed to round-off however large the time
 *  step. That is the numerical echo of the physics: q v × B is perpendicular to
 *  v, so it does no work.
 *
 *  magnetism.test.ts pins every claim the chapter's lessons make:
 *    - under a pure B field the speed is constant to 1e-9 over many turns;
 *    - the orbit radius is r = m v / (|q| B), measured from the path;
 *    - the period 2π m / (|q| B) does not depend on the speed;
 *    - a proton moving up in a field into the page curves left, an electron right;
 *    - a proton entering the field through a wall lands 2r from where it entered;
 *    - a charge moving along B feels nothing and goes straight;
 *    - in crossed fields only the speed E/B passes straight through;
 *    - the force on a straight wire is I L × B, and B I L = m g floats it;
 *    - a current loop in a uniform field feels no net force;
 *    - the torque summed from its four sides is N I A B sin θ, largest at 90°;
 *    - at θ = 0 the loop rests stably, at θ = 180° it balances unstably;
 *    - with a fixed current a loop only rocks; reversing the current at each
 *      dead point (a commutator) keeps it turning.
 */

export type V3 = readonly [number, number, number];

export const E_CHARGE = 1.602176634e-19;
export const M_PROTON = 1.67262192e-27;
export const M_ELECTRON = 9.1093837e-31;
export const G = 9.81;

export const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const scale = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
export const dot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a: V3, b: V3): V3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
export const norm = (a: V3): number => Math.hypot(a[0], a[1], a[2]);

/** A uniform field into the page, tesla. (+z is out of the page.) */
export const intoPage = (B: number): V3 => [0, 0, -B];
export const outOfPage = (B: number): V3 => [0, 0, B];

/* ── the force on a moving charge ────────────────────────────────────── */

/** The Lorentz force F = q (E + v × B), N. */
export function lorentzForce(q: number, v: V3, B: V3, E: V3 = [0, 0, 0]): V3 {
  return add(scale(E, q), scale(cross(v, B), q));
}

/** The rate the magnetic force does work on the charge, W. Always zero:
 *  (v × B) · v vanishes identically. Kept as a function so the lessons'
 *  "no work" claim is measured, not asserted. */
export function magneticPower(q: number, v: V3, B: V3): number {
  return dot(scale(cross(v, B), q), v);
}

/** Radius of the circle a charge moving perpendicular to B follows, m. */
export function cyclotronRadius(m: number, v: number, q: number, B: number): number {
  return (m * v) / (Math.abs(q) * B);
}

/** Time for one full circle, s. The speed cancels: faster means a bigger
 *  circle, and the two effects exactly match. */
export function cyclotronPeriod(m: number, q: number, B: number): number {
  return (2 * Math.PI * m) / (Math.abs(q) * B);
}

/** A charge entering a field region through a wall, at right angles to it,
 *  comes back to the wall after half a circle, this far from where it went in. */
export function landingDistance(m: number, v: number, q: number, B: number): number {
  return 2 * cyclotronRadius(m, v, q, B);
}

/** The field that lands the charge a distance d from the entrance, T. */
export function fieldToLandAt(m: number, v: number, q: number, d: number): number {
  return (2 * m * v) / (Math.abs(q) * d);
}

/** In crossed E and B, the one speed whose electric and magnetic pushes cancel. */
export function selectorSpeed(E: number, B: number): number {
  return E / B;
}

/* ── the Boris push ──────────────────────────────────────────────────── */

export interface ChargeState { x: V3; v: V3; t: number }

/** One Boris step: half an electric kick, an exact-length magnetic rotation,
 *  the other half kick, then a drift. Leapfrog in time. */
export function borisStep(s: ChargeState, q: number, m: number, E: V3, B: V3, dt: number): ChargeState {
  const h = (q * dt) / (2 * m);
  const vMinus = add(s.v, scale(E, h));
  const t = scale(B, h);
  const t2 = dot(t, t);
  const sv = scale(t, 2 / (1 + t2));
  const vPrime = add(vMinus, cross(vMinus, t));
  const vPlus = add(vMinus, cross(vPrime, sv));
  const v = add(vPlus, scale(E, h));
  return { x: add(s.x, scale(v, dt)), v, t: s.t + dt };
}

export interface TraceOptions {
  q: number;
  m: number;
  x0: V3;
  v0: V3;
  /** The fields at a point. Return zeros outside the region. */
  fields: (x: V3) => { E: V3; B: V3 };
  dt: number;
  maxSteps: number;
  /** Stop once this returns true (after the first step). */
  stop?: (s: ChargeState) => boolean;
}

/** Push a charge through a field map, keeping every state. */
export function traceCharge(o: TraceOptions): ChargeState[] {
  let s: ChargeState = { x: o.x0, v: o.v0, t: 0 };
  const out: ChargeState[] = [s];
  for (let i = 0; i < o.maxSteps; i++) {
    const { E, B } = o.fields(s.x);
    s = borisStep(s, o.q, o.m, E, B, o.dt);
    out.push(s);
    if (o.stop?.(s)) break;
  }
  return out;
}

/** The spectrometer scene: a uniform field fills y > 0, the wall is y = 0,
 *  and the charge enters at the origin moving straight up (+y). Returns the
 *  path and where it crosses the wall again (x, m), measured from the path. */
export function spectrometerShot(m: number, q: number, v: number, B: number, into = true, steps = 1200) {
  const Bv = into ? intoPage(B) : outOfPage(B);
  const T = cyclotronPeriod(m, q, B);
  const dt = T / steps;
  const zero: V3 = [0, 0, 0];
  const path = traceCharge({
    q, m, x0: [0, 0, 0], v0: [0, v, 0], dt, maxSteps: steps * 2,
    fields: (x) => ({ E: zero, B: x[1] >= 0 ? Bv : zero }),
    stop: (s) => s.x[1] < 0,
  });
  // interpolate the wall crossing between the last two states
  const a = path[path.length - 2], b = path[path.length - 1];
  const f = a.x[1] / (a.x[1] - b.x[1]);
  const landX = a.x[0] + f * (b.x[0] - a.x[0]);
  const tLand = a.t + f * (b.t - a.t);
  return { path, landX, tLand };
}

/** One full lap in a uniform field from the origin, first velocity +x.
 *  Returns the path and the lap time found by watching the charge come back
 *  round to its starting direction, not from the formula. */
export function lapInField(m: number, q: number, v: number, B: V3, steps = 2000) {
  const Bm = norm(B);
  const T = cyclotronPeriod(m, q, Bm);
  const dt = T / steps;
  const zero: V3 = [0, 0, 0];
  const path = traceCharge({ q, m, x0: [0, 0, 0], v0: [v, 0, 0], dt, maxSteps: Math.round(steps * 1.2), fields: () => ({ E: zero, B }) });
  // the velocity angle, unwrapped; one lap is 2π of turning
  let turned = 0, lap = NaN;
  for (let i = 1; i < path.length; i++) {
    const a0 = Math.atan2(path[i - 1].v[1], path[i - 1].v[0]);
    const a1 = Math.atan2(path[i].v[1], path[i].v[0]);
    let d = a1 - a0;
    if (d > Math.PI) d -= 2 * Math.PI;
    if (d < -Math.PI) d += 2 * Math.PI;
    const before = turned;
    turned += d;
    if (Math.abs(turned) >= 2 * Math.PI && Math.abs(before) < 2 * Math.PI) {
      const f = (2 * Math.PI - Math.abs(before)) / Math.abs(d);
      lap = path[i - 1].t + f * dt;
      break;
    }
  }
  let maxR = 0;
  for (const s of path) maxR = Math.max(maxR, Math.hypot(s.x[0], s.x[1]));
  return { path, lap, diameter: maxR };
}

/** Which way a charge turns, seen from +z: +1 counterclockwise, −1 clockwise. */
export function turnSense(q: number, B: V3): number {
  // ω = −q B / m for the velocity's rotation, so its z part sets the sense
  return Math.sign(-q * B[2]);
}

/* ── wires and loops ─────────────────────────────────────────────────── */

/** Force on a straight wire of length vector L carrying current I, N. */
export function wireForce(I: number, L: V3, B: V3): V3 {
  return scale(cross(L, B), I);
}

/** The current that makes the magnetic push on a horizontal wire hold up its
 *  weight, A. */
export function floatCurrent(m: number, L: number, B: number, g = G): number {
  return (m * g) / (B * L);
}

/** The magnetic moment of a flat coil, A·m². */
export function dipoleMoment(N: number, I: number, A: number): number {
  return N * I * A;
}

/** The size of the twist, τ = N I A B sin θ, where θ is the angle from the
 *  field to the coil's normal (its moment μ). N·m. It always turns μ toward B. */
export function loopTorque(N: number, I: number, A: number, B: number, theta: number): number {
  return N * I * A * B * Math.sin(theta);
}

/** Potential energy of the coil's orientation, U = −μ B cos θ. */
export function loopEnergy(N: number, I: number, A: number, B: number, theta: number): number {
  return -dipoleMoment(N, I, A) * B * Math.cos(theta);
}

export interface LoopSides {
  /** Each side: its midpoint relative to the axle, its length vector along the current, and the force on it. */
  sides: { mid: V3; L: V3; F: V3 }[];
  net: V3;
  /** Torque about the axle, N·m (vector). */
  torque: V3;
}

/**
 * A rectangular coil, `width` × `length` metres, N turns, current I, on an
 * axle along z (out of the page) through its centre. Its normal makes angle θ
 * with a uniform field B pointing along +x. The two long sides run along z
 * (into and out of the page) at ±width/2 from the axle; the two short ends lie
 * in the plane of the page.
 *
 * Nothing here uses the closed form: each side's force is N I L × B, and the
 * torque is Σ r × F about the axle. The tests hold it to N I A B sin θ.
 */
export function loopSides(N: number, I: number, width: number, length: number, B: number, theta: number): LoopSides {
  const Bv: V3 = [B, 0, 0];
  // normal n = (cos θ, sin θ); the coil's plane in the page is along u = (−sin θ, cos θ)
  const u: V3 = [-Math.sin(theta), Math.cos(theta), 0];
  const z: V3 = [0, 0, 1];
  const a = width / 2, h = length / 2;
  // circulation right-handed about n (u × z = n): the +u side carries current
  // out of the page (+z), the −u side into it, and the two ends close the
  // loop across the width at z = ±h.
  const defs: { mid: V3; L: V3 }[] = [
    { mid: scale(u, a), L: scale(z, length) },
    { mid: scale(u, -a), L: scale(z, -length) },
    { mid: [0, 0, h], L: scale(u, -width) },
    { mid: [0, 0, -h], L: scale(u, width) },
  ];
  const sides = defs.map((d) => ({ ...d, F: scale(wireForce(I, d.L, Bv), N) }));
  const net = sides.reduce<V3>((s, d) => add(s, d.F), [0, 0, 0]);
  const torque = sides.reduce<V3>((s, d) => add(s, cross(d.mid, d.F)), [0, 0, 0]);
  return { sides, net, torque };
}

/** The coil on its axle. The moment turns toward the field, so with θ
 *  measured from B to μ the torque about the axle is −N I A B sin θ. */
export interface MotorParams {
  N: number;
  I: number;
  A: number;
  B: number;
  /** Rotational inertia of the coil, kg·m². */
  inertia: number;
  /** Viscous friction at the axle, N·m·s. */
  damping: number;
}

export interface MotorState { theta: number; omega: number; t: number }

/** One semi-implicit Euler step of the coil, with the current's sign given
 *  (+1 or −1). θ is the angle from the field to the moment. */
export function motorStep(s: MotorState, p: MotorParams, sign: 1 | -1, dt: number): MotorState {
  const tau = -sign * loopTorque(p.N, p.I, p.A, p.B, s.theta) - p.damping * s.omega;
  const omega = s.omega + (tau / p.inertia) * dt;
  return { theta: s.theta + omega * dt, omega, t: s.t + dt };
}

/** The commutator's rule: the current points so that the moment lies within
 *  a half turn *behind* the field in the direction of travel, which keeps the
 *  torque driving forward. It flips each time the coil passes a dead point
 *  (θ a multiple of π). */
export function commutatorSign(theta: number, forward: 1 | -1 = 1): 1 | -1 {
  // with sign +1 the torque is −IAB sin θ; for forward (+θ) drive we need sin θ < 0
  const half = Math.floor(theta / Math.PI);
  const s = half % 2 === 0 ? -1 : 1;
  return (forward === 1 ? s : -s) as 1 | -1;
}

/** Whole turns made, counted from the start angle (signed). */
export function turnsMade(theta: number, theta0: number): number {
  return (theta - theta0) / (2 * Math.PI);
}
