/** Inverse-square orbits: the physics under chapter 13 (Gravitation).
 *
 *  One central mass, one test body, SI units throughout. Everything a chapter 13
 *  scene prints comes from here:
 *
 *    - `integrate` — velocity Verlet for r'' = −GM r̂ / r². Symplectic, so the
 *      energy error stays bounded over many orbits instead of drifting; the
 *      tests pin that.
 *    - `cannonShot` — Newton's cannon: a horizontal launch from a mountain top,
 *      flown until it lands or goes all the way round.
 *    - `circularSpeed`, `escapeSpeed`, `specificEnergy`, `elementsOf` — the
 *      closed forms, each checked against the integrator in the tests.
 *    - `timeFromPeriapsis`, `sectorArea` — Kepler's equation and the swept area
 *      by quadrature, so "equal areas in equal times" is measured, not assumed.
 *
 *  Written to be read: plain tuples, the formula visible in each line.
 */

import type { Vec2 } from './vectors.ts';

/* ── constants ─────────────────────────────────────────────────────────── */

/** Earth's GM, m³/s². Known far better than G or M separately. */
export const GM_EARTH = 3.986e14;
export const R_EARTH = 6.371e6;
/** Height of the ISS orbit, and of the mountain in the cannon scene. */
export const ISS_ALTITUDE = 400e3;
export const MOON_DISTANCE = 3.844e8;
/** The Moon's orbital period relative to the stars, seconds. */
export const MOON_SIDEREAL_PERIOD = 27.32 * 86400;
export const GM_SUN = 1.327e20;
export const AU = 1.496e11;
export const DAY = 86400;

/* ── the inverse-square law ────────────────────────────────────────────── */

/** Strength of gravity (acceleration) a distance r from the centre. */
export function gravityAt(GM: number, r: number): number {
  return GM / (r * r);
}

/** Acceleration vector at p: magnitude GM/r², pointing at the centre. */
export function accelAt(GM: number, p: Vec2): Vec2 {
  const r = Math.hypot(p[0], p[1]);
  const k = -GM / (r * r * r);
  return [k * p[0], k * p[1]];
}

/** Speed at which gravity supplies exactly v²/r: a circle. */
export function circularSpeed(GM: number, r: number): number {
  return Math.sqrt(GM / r);
}

/** Speed at which total energy is exactly zero. */
export function escapeSpeed(GM: number, r: number): number {
  return Math.sqrt((2 * GM) / r);
}

/** Kinetic energy per kilogram, J/kg. */
export const kineticPerKg = (v: Vec2): number => 0.5 * (v[0] * v[0] + v[1] * v[1]);
/** Potential energy per kilogram with zero at infinity, J/kg. Always negative. */
export const potentialPerKg = (GM: number, p: Vec2): number => -GM / Math.hypot(p[0], p[1]);
/** Total energy per kilogram. Negative: bound. Zero or positive: gone. */
export function specificEnergy(GM: number, p: Vec2, v: Vec2): number {
  return kineticPerKg(v) + potentialPerKg(GM, p);
}

/** Kepler's third law: period of an orbit with semi-major axis a. */
export function periodOf(GM: number, a: number): number {
  return 2 * Math.PI * Math.sqrt((a * a * a) / GM);
}

/* ── the integrator ────────────────────────────────────────────────────── */

export interface OrbitState {
  t: number;
  p: Vec2;
  v: Vec2;
}

/** One velocity-Verlet step: half kick, drift, half kick. */
export function verletStep(GM: number, s: OrbitState, h: number): OrbitState {
  const a0 = accelAt(GM, s.p);
  const vHalf: Vec2 = [s.v[0] + 0.5 * h * a0[0], s.v[1] + 0.5 * h * a0[1]];
  const p: Vec2 = [s.p[0] + h * vHalf[0], s.p[1] + h * vHalf[1]];
  const a1 = accelAt(GM, p);
  const v: Vec2 = [vHalf[0] + 0.5 * h * a1[0], vHalf[1] + 0.5 * h * a1[1]];
  return { t: s.t + h, p, v };
}

/** Fly from (p0, v0) with step h until tMax, or until `stop` says so. */
export function integrate(
  GM: number, p0: Vec2, v0: Vec2, h: number, tMax: number,
  stop?: (s: OrbitState) => boolean,
): OrbitState[] {
  let s: OrbitState = { t: 0, p: p0, v: v0 };
  const out = [s];
  while (s.t < tMax) {
    s = verletStep(GM, s, h);
    out.push(s);
    if (stop?.(s)) break;
  }
  return out;
}

/* ── orbital elements from one position and velocity ──────────────────── */

export interface Elements {
  /** Specific energy, J/kg. */
  energy: number;
  /** Specific angular momentum, m²/s (positive = counter-clockwise). */
  h: number;
  e: number;
  /** Semi-major axis; Infinity at exactly zero energy, negative when unbound. */
  a: number;
  /** Closest and farthest distance from the centre (ra is Infinity if unbound). */
  rp: number;
  ra: number;
  bound: boolean;
  /** Direction of periapsis, radians. */
  argPeri: number;
}

export function elementsOf(GM: number, p: Vec2, v: Vec2): Elements {
  const r = Math.hypot(p[0], p[1]);
  const v2 = v[0] * v[0] + v[1] * v[1];
  const energy = 0.5 * v2 - GM / r;
  const h = p[0] * v[1] - p[1] * v[0];
  const rv = p[0] * v[0] + p[1] * v[1];
  // eccentricity vector: ((v² − GM/r) p − (p·v) v) / GM
  const ex = ((v2 - GM / r) * p[0] - rv * v[0]) / GM;
  const ey = ((v2 - GM / r) * p[1] - rv * v[1]) / GM;
  const e = Math.hypot(ex, ey);
  const bound = energy < 0;
  const a = energy === 0 ? Infinity : -GM / (2 * energy);
  const semiLatus = (h * h) / GM;
  return {
    energy, h, e, a, bound,
    rp: semiLatus / (1 + e),
    ra: e < 1 ? semiLatus / (1 - e) : Infinity,
    argPeri: Math.atan2(ey, ex),
  };
}

/* ── Newton's cannon ───────────────────────────────────────────────────── */

export interface CannonShot {
  path: OrbitState[];
  outcome: 'landed' | 'orbit';
  /** Flight time until landing, or until it came all the way round, s. */
  time: number;
  /** Distance along the ground from the foot of the mountain to the landing, m. */
  downrange: number;
}

/** Fire horizontally (to the right, so clockwise) from (0, r0) over a planet of radius R. */
export function cannonShot(GM: number, R: number, r0: number, speed: number, h = 2): CannonShot {
  let turned = 0;
  let prev = Math.PI / 2;
  const tMax = 3 * periodOf(GM, r0);
  const path = integrate(GM, [0, r0], [speed, 0], h, tMax, (s) => {
    const ang = Math.atan2(s.p[1], s.p[0]);
    let d = prev - ang; // clockwise is positive
    if (d > Math.PI) d -= 2 * Math.PI;
    if (d < -Math.PI) d += 2 * Math.PI;
    turned += d;
    prev = ang;
    return Math.hypot(s.p[0], s.p[1]) <= R || turned >= 2 * Math.PI;
  });
  let last = path[path.length - 1];
  const landed = Math.hypot(last.p[0], last.p[1]) <= R;
  if (landed && path.length > 1) {
    // put the last sample on the ground itself, not one step below it
    const prev = path[path.length - 2];
    const r1 = Math.hypot(prev.p[0], prev.p[1]), r2 = Math.hypot(last.p[0], last.p[1]);
    const f = (r1 - R) / (r1 - r2);
    const p: Vec2 = [prev.p[0] + f * (last.p[0] - prev.p[0]), prev.p[1] + f * (last.p[1] - prev.p[1])];
    const k = R / Math.hypot(p[0], p[1]);
    last = { t: prev.t + f * (last.t - prev.t), p: [p[0] * k, p[1] * k], v: last.v };
    path[path.length - 1] = last;
  }
  return { path, outcome: landed ? 'landed' : 'orbit', time: last.t, downrange: landed ? turned * R : 2 * Math.PI * R };
}

/** The slowest horizontal launch from r0 whose closest approach still clears R. */
export function cannonClearSpeed(GM: number, R: number, r0: number): number {
  return Math.sqrt((2 * GM * R) / (r0 * (r0 + R)));
}

/* ── one second of orbit ───────────────────────────────────────────────── */

/** How far anything falls from rest in time t under gravity g. */
export const fallInTime = (g: number, t: number): number => 0.5 * g * t * t;

/** How far a circle of radius r drops below its tangent line, a distance d along it. */
export const sagBelowTangent = (r: number, d: number): number => r - Math.sqrt(r * r - d * d);

/* ── Kepler: swept area and time along an ellipse ──────────────────────── */

/** Distance from the focus at true anomaly θ (θ = 0 at periapsis). */
export function radiusAt(a: number, e: number, theta: number): number {
  return (a * (1 - e * e)) / (1 + e * Math.cos(theta));
}

/** Area swept by the line from the focus between θ1 and θ2: ∫ ½ r² dθ, Simpson. */
export function sectorArea(a: number, e: number, th1: number, th2: number, n = 400): number {
  const h = (th2 - th1) / n;
  let s = 0;
  for (let i = 0; i <= n; i++) {
    const r = radiusAt(a, e, th1 + i * h);
    s += (i === 0 || i === n ? 1 : i % 2 ? 4 : 2) * 0.5 * r * r;
  }
  return (s * h) / 3;
}

/** Area swept along a sampled path: Σ ½ (p_i × p_{i+1}). */
export function sweptArea(path: readonly OrbitState[]): number {
  let A = 0;
  for (let i = 1; i < path.length; i++) {
    const p = path[i - 1].p, q = path[i].p;
    A += 0.5 * (p[0] * q[1] - p[1] * q[0]);
  }
  return Math.abs(A);
}

/** Time from periapsis to true anomaly θ, via Kepler's equation. In [0, T). */
export function timeFromPeriapsis(GM: number, a: number, e: number, theta: number): number {
  const th = ((theta % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  const E = 2 * Math.atan(Math.sqrt((1 - e) / (1 + e)) * Math.tan(th / 2));
  const M = ((E - e * Math.sin(E)) + 2 * Math.PI) % (2 * Math.PI);
  return M * Math.sqrt((a * a * a) / GM);
}

/** True anomaly reached a time t after periapsis (inverts Kepler's equation). */
export function anomalyAtTime(GM: number, a: number, e: number, t: number): number {
  const M = ((t / Math.sqrt((a * a * a) / GM)) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
  let E = e > 0.8 ? Math.PI : M;
  for (let k = 0; k < 50; k++) E -= (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
  const th = 2 * Math.atan(Math.sqrt((1 + e) / (1 - e)) * Math.tan(E / 2));
  return (th + 2 * Math.PI) % (2 * Math.PI);
}

/* ── the comet in the equal-areas scene ────────────────────────────────── */

export const COMET = { a: 2 * AU, e: 0.6, GM: GM_SUN } as const;

/** Days the comet takes from aphelion to true anomaly θ (θ measured from perihelion). */
export function cometDaysFromAphelion(theta: number): number {
  const { a, e, GM } = COMET;
  const T = periodOf(GM, a);
  const t = timeFromPeriapsis(GM, a, e, theta) - T / 2;
  return (((t % T) + T) % T) / DAY;
}

/* ── one revolution, or until it is far away ───────────────────────────── */

export interface Flight {
  path: OrbitState[];
  /** Clockwise angle turned about the centre at each sample, radians. */
  turned: number[];
}

/** Fly until the body has gone once round (clockwise or counter), passed rMax, or tMax. */
export function flyOnce(GM: number, p0: Vec2, v0: Vec2, h: number, rMax: number, tMax: number): Flight {
  const turned = [0];
  let prev = Math.atan2(p0[1], p0[0]);
  const path = integrate(GM, p0, v0, h, tMax, (s) => {
    const ang = Math.atan2(s.p[1], s.p[0]);
    let d = prev - ang;
    if (d > Math.PI) d -= 2 * Math.PI;
    if (d < -Math.PI) d += 2 * Math.PI;
    prev = ang;
    turned.push(turned[turned.length - 1] + d);
    return Math.abs(turned[turned.length - 1]) >= 2 * Math.PI || Math.hypot(s.p[0], s.p[1]) > rMax;
  });
  return { path, turned };
}

/** Speed left over far away, for a launch at speed v from radius r (0 if bound). */
export function speedAtInfinity(GM: number, r: number, v: number): number {
  const e2 = v * v - (2 * GM) / r;
  return e2 > 0 ? Math.sqrt(e2) : 0;
}
