/** Rotation of rigid bodies (University Physics, ch. 9).
 *
 *  A rigid body is many particles locked together, so they all share one
 *  angle. Everything in this file follows from that single fact:
 *
 *    1. Kinematics. Every point turns through the same θ at the same ω, and
 *       a point r from the axis runs along an arc s = rθ at speed v = ωr.
 *       A belt that neither stretches nor slips forces two rims to share one
 *       speed, so ω₁r₁ = ω₂r₂. A rolling wheel is the same constraint with
 *       the road as the belt: the contact point is at rest and v_axle = ωR.
 *    2. Rotational inertia. I = Σ m r²: where the mass sits, not how much.
 *       For the standard shapes I = k m R², and k is all that matters.
 *    3. Energy. Spinning stores ½Iω². A body rolling down a ramp must fill
 *       two lockers, ½mv² and ½Iω², from one supply m g h, so the larger k,
 *       the less goes into moving and the slower it rolls:
 *           a = g sinθ / (1 + k)
 *       — independent of the mass and the radius.
 *    4. A falling weight on a spool spins a bar with beads on it. The same
 *       energy bookkeeping gives a = m g / (m + I / r_s²): the bar adds
 *       I / r_s² to the mass the weight must drag along.
 *
 *  Conventions: SI units, angles in radians, counter-clockwise positive in
 *  the world frame (y up). A wheel rolling toward +x turns clockwise.
 */

import { G_EARTH } from './dynamics.ts';
import type { Vec2 } from './vectors.ts';

export const TAU = 2 * Math.PI;

/* ── 1. kinematics: one angle, every radius ──────────────────────────────── */

export const rpmToRadPerSec = (rpm: number): number => (rpm * TAU) / 60;
export const radPerSecToRpm = (omega: number): number => (omega * 60) / TAU;

/** Arc run by a point r from the axis while the body turns through θ. */
export const arcLength = (r: number, theta: number): number => r * theta;

/** Speed of a point r from the axis on a body turning at ω. */
export const tangentialSpeed = (omega: number, r: number): number => Math.abs(omega) * r;

/** Position of a point riding a rigid body: radius r, starting angle φ₀,
 *  after the body has turned for time t at ω. */
export function ridingPoint(r: number, phi0: number, omega: number, t: number): Vec2 {
  const phi = phi0 + omega * t;
  return [r * Math.cos(phi), r * Math.sin(phi)];
}

/** Velocity of the point at position p on a body turning at ω about the
 *  origin: ω ẑ × p. Perpendicular to p, and |v| = ω|p|. */
export const rigidVelocity = (p: Vec2, omega: number): Vec2 => [-omega * p[1], omega * p[0]];

/* ── belts ───────────────────────────────────────────────────────────────── */

/** The belt runs at the driving rim's speed. */
export const beltSpeed = (omegaDriver: number, rDriver: number): number => omegaDriver * rDriver;

/** Angular velocity of the driven pulley: its rim must match the belt. */
export const drivenOmega = (omegaDriver: number, rDriver: number, rDriven: number): number =>
  (omegaDriver * rDriver) / rDriven;

/** Radius the driven pulley needs to turn at `omegaTarget`. */
export const pulleyRadiusFor = (omegaDriver: number, rDriver: number, omegaTarget: number): number =>
  (omegaDriver * rDriver) / omegaTarget;

/** The two straight runs of an open belt around pulley 1 at the origin
 *  (radius r1) and pulley 2 at (d, 0) (radius r2). Returns the unit normal of
 *  the upper run and the four tangent points. */
export function openBelt(r1: number, r2: number, d: number) {
  const nx = (r1 - r2) / d;
  const ny = Math.sqrt(1 - nx * nx);
  return {
    top1: [r1 * nx, r1 * ny] as Vec2,
    top2: [d + r2 * nx, r2 * ny] as Vec2,
    bot1: [r1 * nx, -r1 * ny] as Vec2,
    bot2: [d + r2 * nx, -r2 * ny] as Vec2,
    /** Angle of the upper tangent point, measured on either pulley. */
    phiTop: Math.atan2(ny, nx),
  };
}

/* ── the rolling wheel ───────────────────────────────────────────────────── */

/** Velocity over the road of a rim point on a wheel of radius R rolling
 *  toward +x at axle speed v. `a` is the point's angle about the axle,
 *  counter-clockwise from +x (so the top is π/2, the contact point −π/2).
 *  Rolling without slipping fixes ω = v/R, clockwise. */
export function rollingPointVelocity(v: number, R: number, a: number): Vec2 {
  const omega = -v / R; // clockwise
  const spin = rigidVelocity([R * Math.cos(a), R * Math.sin(a)], omega);
  return [v + spin[0], spin[1]];
}

export const rollingPointSpeed = (v: number, R: number, a: number): number => {
  const w = rollingPointVelocity(v, R, a);
  return Math.hypot(w[0], w[1]);
};

/** A rolling wheel's state at time t: axle x and the angle of a marked rim
 *  point that started at angle a0 with the axle at x0. */
export function rollingWheel(x0: number, a0: number, v: number, R: number, t: number) {
  const x = x0 + v * t;
  const a = a0 - (v / R) * t;
  return { axle: [x, R] as Vec2, a, point: [x + R * Math.cos(a), R + R * Math.sin(a)] as Vec2 };
}

/** Distance from the contact point to a rim point at angle a. On a rolling
 *  wheel every point moves as if the wheel pivoted about the contact point,
 *  so its speed is ω times this distance. */
export const distanceFromContact = (R: number, a: number): number =>
  Math.hypot(R * Math.cos(a), R + R * Math.sin(a));

/* ── 2. rotational inertia ───────────────────────────────────────────────── */

export type Shape = 'hoop' | 'hollow-sphere' | 'disc' | 'solid-sphere' | 'sliding-block';

/** I = k m R² about the symmetry axis. A frictionless sliding block does not
 *  spin at all, so it has no rotational locker: k = 0. */
export const SHAPE_K: Record<Shape, number> = {
  hoop: 1,
  'hollow-sphere': 2 / 3,
  disc: 1 / 2,
  'solid-sphere': 2 / 5,
  'sliding-block': 0,
};

export const momentOfInertia = (shape: Shape, m: number, R: number): number => SHAPE_K[shape] * m * R * R;

/** I = Σ m r² for point masses at distances r from the axis. */
export const pointMassesI = (pts: readonly { m: number; r: number }[]): number =>
  pts.reduce((s, p) => s + p.m * p.r * p.r, 0);

/** A thin uniform rod about its centre. */
export const rodAboutCentreI = (M: number, L: number): number => (M * L * L) / 12;

/** A uniform disc cut into n thin rings, each a hoop Σ m r². As n grows this
 *  converges to ½ m R²: the same accumulation that builds up mass. */
export function discFromRings(m: number, R: number, n: number): number {
  const sigma = m / (Math.PI * R * R);
  let I = 0;
  for (let i = 0; i < n; i++) {
    const r = ((i + 0.5) / n) * R; // midpoint ring
    const dm = sigma * TAU * r * (R / n);
    I += dm * r * r;
  }
  return I;
}

/** Rotational kinetic energy ½ I ω². */
export const rotationalKE = (I: number, omega: number): number => 0.5 * I * omega * omega;

/** ½ Σ m v² over the pieces of a spinning body, each at its own v = ωr. */
export const piecewiseKE = (pts: readonly { m: number; r: number }[], omega: number): number =>
  pts.reduce((s, p) => s + 0.5 * p.m * tangentialSpeed(omega, p.r) ** 2, 0);

/* ── 3. the rolling race ─────────────────────────────────────────────────── */

export const rollingAccel = (k: number, theta: number, g = G_EARTH): number => (g * Math.sin(theta)) / (1 + k);

/** Time to roll a length L of slope from rest. */
export const rollingTime = (k: number, theta: number, L: number, g = G_EARTH): number =>
  Math.sqrt((2 * L) / rollingAccel(k, theta, g));

/** Speed after dropping a height h from rest. */
export const rollingSpeedAfterDrop = (k: number, h: number, g = G_EARTH): number =>
  Math.sqrt((2 * g * h) / (1 + k));

/** How the energy of a rolling body divides between moving and spinning. */
export const rollingEnergySplit = (k: number) => ({ moving: 1 / (1 + k), spinning: k / (1 + k) });

/** State of a body of shape factor k rolling from rest down a slope of
 *  length L: distance s along it, speed v, spin angle, and the two energies
 *  for mass m and radius R. Stops at the bottom. */
export function rollState(k: number, theta: number, L: number, t: number, m: number, R: number, g = G_EARTH) {
  const a = rollingAccel(k, theta, g);
  const tEnd = Math.sqrt((2 * L) / a);
  const tt = Math.min(Math.max(t, 0), tEnd);
  const v = a * tt;
  const s = 0.5 * a * tt * tt;
  return {
    s, v, done: t >= tEnd, tEnd,
    spin: s / R,
    moving: 0.5 * m * v * v,
    spinning: 0.5 * k * m * v * v,
    supplied: m * g * s * Math.sin(theta),
  };
}

/** The slope a slower shape needs to tie a faster one on an equal-length
 *  ramp: equal accelerations, sin θ_slow = (1+k_slow)/(1+k_fast)·sin θ_fast. */
export const tieAngle = (kSlow: number, kFast: number, thetaFast: number): number =>
  Math.asin(((1 + kSlow) / (1 + kFast)) * Math.sin(thetaFast));

/** Newton's laws for a rolling body, stepped in time, with friction found
 *  from the no-slip constraint rather than assumed:
 *      m a = m g sinθ − f,   I α = f R,   a = α R.
 *  Returns the run and the work friction did on the body (∫ f · v_contact dt,
 *  where v_contact = v − ωR). Used by the tests to check the closed forms. */
export function simulateRoll(k: number, m: number, R: number, theta: number, L: number, dt = 1e-4, g = G_EARTH) {
  const I = k * m * R * R;
  let s = 0, v = 0, omega = 0, t = 0, frictionWork = 0, fMax = 0;
  while (s < L) {
    // Solve the constraint for the friction force this instant.
    const f = (I * g * Math.sin(theta)) / (R * R * m + I) * m;
    fMax = Math.max(fMax, f);
    const a = g * Math.sin(theta) - f / m;
    const alpha = (f * R) / I || 0;
    frictionWork += -f * (v - omega * R) * dt;
    v += a * dt;
    omega += alpha * dt;
    s += v * dt;
    t += dt;
  }
  const h = s * Math.sin(theta);
  return { t, v, omega, s, frictionWork, friction: fMax, energy: 0.5 * m * v * v + 0.5 * I * omega * omega, supplied: m * g * h };
}

/* ── 4. the bead bar and the falling weight ──────────────────────────────── */

export interface BeadRig {
  /** Hanging weight, kg. */
  weight: number;
  /** Radius of the spool the string winds off, m. */
  spoolR: number;
  /** Height the weight falls to the floor, m. */
  drop: number;
  barMass: number;
  barLength: number;
  /** Each of the two beads, kg. */
  beadMass: number;
}

/** The chapter's rig. The scene draws it; the tests pin its numbers. */
export const BEAD_RIG: BeadRig = { weight: 0.15, spoolR: 0.03, drop: 0.6, barMass: 0.1, barLength: 0.5, beadMass: 0.25 };

/** I of the bar plus two beads, each r from the axle. */
export const beadBarI = (rig: BeadRig, r: number): number =>
  rodAboutCentreI(rig.barMass, rig.barLength) + pointMassesI([{ m: rig.beadMass, r }, { m: rig.beadMass, r }]);

/** Mass on the bar, which moving the beads never changes. */
export const beadBarMass = (rig: BeadRig): number => rig.barMass + 2 * rig.beadMass;

/** Acceleration of the falling weight: m g h is shared between ½mv² and
 *  ½Iω² with ω = v / r_s, so a = m g / (m + I / r_s²). */
export const spoolAccel = (rig: BeadRig, r: number, g = G_EARTH): number =>
  (rig.weight * g) / (rig.weight + beadBarI(rig, r) / (rig.spoolR * rig.spoolR));

export const spoolDropTime = (rig: BeadRig, r: number, g = G_EARTH): number =>
  Math.sqrt((2 * rig.drop) / spoolAccel(rig, r, g));

/** State at time t after release: how far the weight has fallen, its speed,
 *  the bar's angle and spin. After landing the string goes slack and the bar
 *  keeps turning at the ω it reached. */
export function spoolState(rig: BeadRig, r: number, t: number, g = G_EARTH) {
  const a = spoolAccel(rig, r, g);
  const tLand = Math.sqrt((2 * rig.drop) / a);
  if (t < tLand) {
    const v = a * t;
    return { fallen: 0.5 * a * t * t, v, omega: v / rig.spoolR, angle: (0.5 * a * t * t) / rig.spoolR, landed: false, tLand };
  }
  const vLand = a * tLand;
  const omega = vLand / rig.spoolR;
  return { fallen: rig.drop, v: 0, omega, angle: rig.drop / rig.spoolR + omega * (t - tLand), landed: true, tLand };
}

/** Bead distance for a given landing time (bisection on the monotone map).
 *  Returns NaN when the time is out of the rig's reach. */
export function beadRadiusForTime(rig: BeadRig, T: number, rMax = rig.barLength / 2, g = G_EARTH): number {
  let lo = 0, hi = rMax;
  if (T < spoolDropTime(rig, lo, g) || T > spoolDropTime(rig, hi, g)) return NaN;
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    if (spoolDropTime(rig, mid, g) < T) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}
