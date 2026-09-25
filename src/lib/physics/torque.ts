/**
 * Torque and angular momentum — University Physics, Chapter 10.
 *
 * Everything the chapter's two scenes print comes from here:
 *
 *   PushTheDoor        torque as r × F about a hinge, the lever arm, α = τ/I
 *   PullInTheWeights   a spinning chair with two dumbbells: L = Iω held fixed
 *   StepOnTheRide      a child steps onto a merry-go-round: L shared, K lost
 *
 * The chapter-9 library (`rotation.ts`) was not on disk when this was written,
 * so the two moments of inertia it needs are defined here, plainly.
 * Plane problems only: every torque and angular momentum is the z-component,
 * positive counter-clockwise when seen from above.
 */
import type { Vec2 } from './vectors.ts';

export const TWO_PI = 2 * Math.PI;

/* ── torque ─────────────────────────────────────────────────────────────── */

/** z-component of a × b for plane vectors. */
export function cross2(a: Vec2, b: Vec2): number {
  return a[0] * b[1] - a[1] * b[0];
}

/** Torque about `pivot` of force `F` applied at `point`: τ = (r − pivot) × F. */
export function torqueAbout(pivot: Vec2, point: Vec2, F: Vec2): number {
  return cross2([point[0] - pivot[0], point[1] - pivot[1]], F);
}

/**
 * Lever arm: the perpendicular distance from the pivot to the force's line
 * of action. |τ| = r⊥ |F|. Zero when the line of action passes through the pivot.
 */
export function leverArm(pivot: Vec2, point: Vec2, F: Vec2): number {
  const f = Math.hypot(F[0], F[1]);
  return f === 0 ? 0 : Math.abs(torqueAbout(pivot, point, F)) / f;
}

/** Foot of the perpendicular from the pivot onto the line of action (for drawing r⊥). */
export function leverFoot(pivot: Vec2, point: Vec2, F: Vec2): Vec2 {
  const f2 = F[0] * F[0] + F[1] * F[1];
  if (f2 === 0) return point;
  const t = ((pivot[0] - point[0]) * F[0] + (pivot[1] - point[1]) * F[1]) / f2;
  return [point[0] + t * F[0], point[1] + t * F[1]];
}

/** A push of size `F` at distance `s` along a door, at angle `phi` to the door face. */
export function doorTorque(s: number, F: number, phi: number): number {
  return s * F * Math.sin(phi);
}

/* ── rotational inertia (the two shapes this chapter needs) ─────────────── */

/** A uniform slab of mass M and width L hinged along one edge: I = ⅓ M L². */
export function slabAboutEdge(M: number, L: number): number {
  return (M * L * L) / 3;
}

/** A uniform disk of mass M, radius R, about its axle: I = ½ M R². */
export function diskAboutAxle(M: number, R: number): number {
  return (M * R * R) / 2;
}

/** A body of inertia `base` plus point masses at radii r: I = base + Σ m r². */
export function inertiaWithMasses(base: number, masses: { m: number; r: number }[]): number {
  return masses.reduce((I, p) => I + p.m * p.r * p.r, base);
}

/* ── Newton's second law for rotation ───────────────────────────────────── */

/** α = τ_net / I. */
export function angularAcceleration(tauNet: number, I: number): number {
  return tauNet / I;
}

/** Angle turned from rest after time t at constant α: θ = ½ α t². */
export function angleFromRest(alpha: number, t: number): number {
  return 0.5 * alpha * t * t;
}

/** Time to turn θ from rest at constant α. */
export function timeToTurn(theta: number, alpha: number): number {
  return Math.sqrt((2 * theta) / alpha);
}

/**
 * Step a door from rest under a push that stays at the same place and the same
 * angle to the door (your hand moves with it), by semi-implicit Euler.
 * Returns the angle after time T. Used by the tests to check θ = ½ α t².
 */
export function swingDoor(tau: number, I: number, T: number, dt = 1e-4): number {
  let th = 0, w = 0;
  for (let t = 0; t < T - 1e-12; t += dt) { w += (tau / I) * dt; th += w * dt; }
  return th;
}

/* ── the hold-the-door problem: two torques about one hinge ─────────────── */

/** Net torque of several pushes on one door, each given as s, F, phi. */
export function netDoorTorque(pushes: { s: number; F: number; phi: number }[]): number {
  return pushes.reduce((t, p) => t + doorTorque(p.s, p.F, p.phi), 0);
}

/* ── angular momentum ───────────────────────────────────────────────────── */

/** Angular momentum of a point mass about the origin: L = r × p. */
export function particleL(m: number, r: Vec2, v: Vec2): number {
  return m * cross2(r, v);
}

/** Angular momentum of a set of point masses about the origin. */
export function systemL(ps: { m: number; r: Vec2; v: Vec2 }[]): number {
  return ps.reduce((L, p) => L + particleL(p.m, p.r, p.v), 0);
}

/** Rotational kinetic energy ½ I ω². */
export function spinEnergy(I: number, w: number): number {
  return 0.5 * I * w * w;
}

/* ── the spinning chair ─────────────────────────────────────────────────── */

export interface Chair {
  /** Rotational inertia of you and the chair without the dumbbells, kg·m². */
  body: number;
  /** Mass of each of the two dumbbells, kg. */
  m: number;
}

export const CHAIR: Chair = { body: 1.2, m: 2 };

/** I of the chair with both dumbbells at radius r. */
export function chairInertia(c: Chair, r: number): number {
  return inertiaWithMasses(c.body, [{ m: c.m, r }, { m: c.m, r }]);
}

/** Spin rate once the dumbbells sit at r, with L fixed: ω = L / I(r). */
export function chairSpin(c: Chair, L: number, r: number): number {
  return L / chairInertia(c, r);
}

/** Where the dumbbells must be for the chair to spin at ω, given L. NaN if unreachable. */
export function radiusForSpin(c: Chair, L: number, w: number): number {
  const extra = L / w - c.body;
  return extra < 0 ? NaN : Math.sqrt(extra / (2 * c.m));
}

/**
 * Work your arms do hauling both dumbbells from r0 to r1 (r1 < r0) while the
 * chair spins freely. Each dumbbell needs an inward pull m ω² r to stay on its
 * circle; moving it inward by dr, that pull does m ω² r |dr| of work. Summed
 * by the midpoint rule, with ω recomputed from fixed L at every radius.
 */
export function pullInWork(c: Chair, L: number, r0: number, r1: number, n = 4000): number {
  const dr = (r0 - r1) / n;
  let W = 0;
  for (let i = 0; i < n; i++) {
    const r = r0 - (i + 0.5) * dr;
    const w = chairSpin(c, L, r);
    W += 2 * c.m * w * w * r * dr;
  }
  return W;
}

/**
 * A single mass on a string being reeled in toward a fixed centre, integrated
 * as plain Newtonian particle motion in the plane (no rotation formulas).
 * The string pulls with whatever tension makes r follow r(t) = r0 + (r1−r0)·t/T.
 * Returns the particle's r × p and kinetic energy before and after, and the
 * work the string did. Used by the tests: a central pull exerts no torque,
 * so r × p cannot change, yet the kinetic energy rises by exactly the work.
 */
export function reelIn(m: number, r0: number, w0: number, r1: number, T: number, dt = 1e-5) {
  const rdot = (r1 - r0) / T;
  // already moving inward at the reel's speed, so no jolt at t = 0
  let x = r0, y = 0, vx = rdot, vy = w0 * r0;
  const L0 = particleL(m, [x, y], [vx, vy]);
  const K0 = 0.5 * m * (vx * vx + vy * vy);
  let W = 0;
  for (let t = 0; t < T - 1e-12; t += dt) {
    const r = Math.hypot(x, y);
    const ux = x / r, uy = y / r;
    const vt2 = vx * vx + vy * vy - (vx * ux + vy * uy) ** 2; // tangential speed²
    // Keep the radial speed at rdot: the radial acceleration must be zero,
    // so the inward pull supplies exactly the centripetal term m v_t² / r.
    const pull = (m * vt2) / r;
    const fx = -pull * ux, fy = -pull * uy;
    vx += (fx / m) * dt; vy += (fy / m) * dt;
    // re-impose the radial speed the reel sets (the string is inextensible)
    const vr = vx * ux + vy * uy;
    vx += (rdot - vr) * ux; vy += (rdot - vr) * uy;
    W += (fx * vx + fy * vy) * dt;
    x += vx * dt; y += vy * dt;
  }
  return {
    L0, L1: particleL(m, [x, y], [vx, vy]),
    K0, K1: 0.5 * m * (vx * vx + vy * vy),
    r1: Math.hypot(x, y), work: W,
  };
}

/* ── the merry-go-round ─────────────────────────────────────────────────── */

export interface Ride {
  /** Ride's own mass and radius (a uniform disk). */
  M: number;
  R: number;
  /** The child who steps on, kg. */
  child: number;
  /** Spin before the child steps on, rpm. */
  rpm0: number;
}

export const RIDE: Ride = { M: 200, R: 1.5, child: 30, rpm0: 20 };

export const rpmToRad = (rpm: number) => (rpm * TWO_PI) / 60;
export const radToRpm = (w: number) => (w * 60) / TWO_PI;

/** Spin after the child (standing still, no angular momentum) steps on at radius r, rpm. */
export function rideAfterStep(ride: Ride, r: number): number {
  const I0 = diskAboutAxle(ride.M, ride.R);
  return (ride.rpm0 * I0) / (I0 + ride.child * r * r);
}

/** Where the child must step on for the ride to end up at `rpm`. NaN if impossible. */
export function stepRadiusFor(ride: Ride, rpm: number): number {
  const I0 = diskAboutAxle(ride.M, ride.R);
  const extra = I0 * (ride.rpm0 / rpm - 1);
  return extra < 0 ? NaN : Math.sqrt(extra / ride.child);
}

/** Kinetic energy of the ride (and child) before and after the step, J. */
export function rideEnergies(ride: Ride, r: number): { K0: number; K1: number } {
  const I0 = diskAboutAxle(ride.M, ride.R);
  const I1 = I0 + ride.child * r * r;
  return { K0: spinEnergy(I0, rpmToRad(ride.rpm0)), K1: spinEnergy(I1, rpmToRad(rideAfterStep(ride, r))) };
}

/**
 * The step-on, simulated: the child lands at rest and her shoes skid on the
 * deck. Kinetic friction drags her forward and the deck back, equal and
 * opposite, until they move together. Returns the final spin (rpm) and the
 * total angular momentum at the start and end. The friction is internal to
 * ride + child, so it may not change the total, however hard it grips.
 */
export interface Skid { wd: number; wc: number; slipping: boolean }

/**
 * One step of the skid: kinetic friction torque τ = μ m g r acts on the child
 * (forward) and on the deck (back), equal and opposite, until their spins meet.
 * Both the scene and stepOnSkid run this.
 */
export function skidStep(ride: Ride, r: number, s: Skid, dt: number, mu = 0.6): Skid {
  if (!s.slipping) return s;
  const I0 = diskAboutAxle(ride.M, ride.R), Ic = ride.child * r * r;
  const tau = mu * ride.child * 9.81 * r;
  const wd = s.wd - (tau / I0) * dt, wc = s.wc + (tau / Ic) * dt;
  if (wd <= wc) { const w = (I0 * s.wd + Ic * s.wc) / (I0 + Ic); return { wd: w, wc: w, slipping: false }; }
  return { wd, wc, slipping: true };
}

/**
 * The step-on, simulated: the child lands at rest and her shoes skid on the
 * deck until she and the deck move together. Returns the final spin (rpm) and
 * the total angular momentum at the start and end. The friction is internal
 * to ride + child, so it may not change the total, however hard it grips.
 */
export function stepOnSkid(ride: Ride, r: number, mu = 0.6, dt = 1e-5) {
  const I0 = diskAboutAxle(ride.M, ride.R), Ic = ride.child * r * r;
  let s: Skid = { wd: rpmToRad(ride.rpm0), wc: 0, slipping: true };
  const L0 = I0 * s.wd + Ic * s.wc;
  let t = 0;
  while (s.slipping && t < 60) { s = skidStep(ride, r, s, dt, mu); t += dt; }
  return { rpm: radToRpm(s.wd), L0, L1: I0 * s.wd + Ic * s.wc, skidTime: t };
}

/* ── the scenes' fixed props, in one place so the tests pin the lesson ─── */

/** The door in chapter 10: 18 kg, 0.9 m wide. */
export const DOOR = { M: 18, L: 0.9, F: 20 } as const;
export const doorI = () => slabAboutEdge(DOOR.M, DOOR.L);

/** Spin of a uniform sphere after shrinking from R0 to R1 with L fixed. */
export function collapseSpin(period0: number, R0: number, R1: number): number {
  return period0 * (R1 / R0) ** 2;
}
