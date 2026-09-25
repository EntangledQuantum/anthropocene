/** Chapter 14's scenes: the small tick, where it breaks, and how to feed it.
 *
 *  Everything a chapter 14 scene draws or prints comes from here, and the
 *  oscillator mathematics underneath comes from `oscillator.ts` (SHM as a
 *  projected circle, the exact pendulum period via the AGM, the driven damped
 *  oscillator). This file adds only what the scenes need on top:
 *
 *    SpringRace       two carts on identical springs, released from different
 *                     distances (closed-form SHM, which is the exact solution)
 *    PendulumDrift    a real pendulum beside the small-angle clock, and the
 *                     release angle at which it falls half a cycle behind
 *    PumpTheSwing     a lightly damped swing and instantaneous shoves
 *    ShakeToResonance a cart on a spring whose far end a hand shakes
 *    FlutterDeck      a bridge deck whose wind load follows its own twisting
 *    transfer set     three "does the period depend on size?" oscillators
 */
import {
  G, amplitudeForPeriodExcess, pendulumPeriodRatio, resonantFrequency, shmMaxSpeed, shmPeriod,
  shmV, shmX, smallAnglePeriod, springOmega, steadyAmplitude, type Driven, type Shm,
} from './oscillator.ts';

const TAU = 2 * Math.PI;
export const deg = (rad: number) => (rad * 180) / Math.PI;
export const rad = (d: number) => (d * Math.PI) / 180;

/* ── lesson 1: the spring race ─────────────────────────────────────────── */

/** 1 kg on a 4 N/m spring: ω = 2 rad/s, one cycle every π seconds. */
export const RACE = { k: 4, m: 1 } as const;

const raceShm = (A: number, k: number = RACE.k, m: number = RACE.m): Shm => ({ A, omega: springOmega(k, m), phase: 0 });

/** Position and velocity of a cart released from rest at +A at t = 0. */
export function springCart(A: number, t: number, k: number = RACE.k, m: number = RACE.m) {
  const s = raceShm(A, k, m);
  return { x: shmX(s, t), v: shmV(s, t) };
}

/** Speed through the middle: Aω. Twice the pull, twice the speed. */
export const middleSpeed = (A: number, k: number = RACE.k, m: number = RACE.m) => shmMaxSpeed(raceShm(A, k, m));

/** One full cycle. A is not an argument, because it does not matter. */
export const racePeriod = (k: number = RACE.k, m: number = RACE.m) => shmPeriod(raceShm(1, k, m));

/* ── lesson 1: the pendulum that drifts off the clock ──────────────────── */

/** A 25 cm pendulum: the small-angle clock ticks about once a second. */
export const DRIFT = { L: 0.25, ticks: 10 } as const;
export const driftGL = G / DRIFT.L;
export const driftTick = smallAnglePeriod(DRIFT.L);

/** One RK4 step of θ'' = −(g/L) sin θ − 2βθ'. The real pendulum, no sin θ ≈ θ. */
export function pendulumStep(theta: number, omega: number, gL: number, beta: number, dt: number): [number, number] {
  const acc = (th: number, w: number) => -gL * Math.sin(th) - 2 * beta * w;
  const k1t = omega, k1w = acc(theta, omega);
  const k2t = omega + (dt / 2) * k1w, k2w = acc(theta + (dt / 2) * k1t, omega + (dt / 2) * k1w);
  const k3t = omega + (dt / 2) * k2w, k3w = acc(theta + (dt / 2) * k2t, omega + (dt / 2) * k2w);
  const k4t = omega + dt * k3w, k4w = acc(theta + dt * k3t, omega + dt * k3w);
  return [
    theta + (dt / 6) * (k1t + 2 * k2t + 2 * k3t + k4t),
    omega + (dt / 6) * (k1w + 2 * k2w + 2 * k3w + k4w),
  ];
}

/** The small-angle clock's bob: θ₀ cos(ω₀t), the same period at every angle. */
export const idealAngle = (theta0: number, t: number) => theta0 * Math.cos((TAU * t) / driftTick);

/** How many cycles the real pendulum has lost after `ticks` of the ideal clock. */
export const lagAfterTicks = (theta0: number, ticks: number = DRIFT.ticks) =>
  ticks * (1 - 1 / pendulumPeriodRatio(theta0));

/** Release angle (radians) at which the real bob is `lag` cycles behind after
 *  `ticks` ideal ticks. Half a cycle behind means it is at the far side when
 *  the ideal bob is back home. */
export const driftTargetAngle = (ticks: number = DRIFT.ticks, lag = 0.5) =>
  amplitudeForPeriodExcess(1 / (1 - lag / ticks) - 1);

/** Percent by which the real period exceeds the small-angle one. */
export const periodExcessPercent = (theta0: number) => 100 * (pendulumPeriodRatio(theta0) - 1);

/* ── lesson 1 transfer: which clocks keep time at any size? ────────────── */

/** Puck in a V-shaped trough: a constant-size pull toward the middle, a, not
 *  one proportional to distance. Four quarter-trips of uniform acceleration. */
export const vTroughPeriod = (A: number, a: number) => 4 * Math.sqrt((2 * A) / a);

/** A ball bouncing elastically from height h: up and down, 2√(2h/g). */
export const bouncePeriod = (h: number, g = G) => 2 * Math.sqrt((2 * h) / g);

/** A straight-sided block floating with submerged depth d: buoyancy grows in
 *  proportion to extra depth, so it is a spring with k/m = g/d. */
export const floatingBlockPeriod = (d: number, g = G) => TAU * Math.sqrt(d / g);

/* ── lesson 2: the swing and the shove ─────────────────────────────────── */

/** A 2 m swing, lightly damped, and a shove that adds 0.16 rad/s of swing. */
export const SWING = { L: 2, beta: 0.02, kick: 0.16, start: 5, target: 30, shoves: 10 } as const;
export const swingGL = G / SWING.L;

/** Energy per unit moment of inertia: ½θ'² + (g/L)(1 − cos θ). */
export const swingEnergy = (theta: number, omega: number, gL: number = swingGL) =>
  0.5 * omega * omega + gL * (1 - Math.cos(theta));

/** The angle the swing would reach with the energy it has now. */
export function peakAngle(theta: number, omega: number, gL: number = swingGL): number {
  const c = 1 - swingEnergy(theta, omega, gL) / gL;
  return c <= -1 ? Math.PI : Math.acos(c);
}

/** A shove: an instant push away from you (+θ direction). */
export const shove = (omega: number, kick: number = SWING.kick) => omega + kick;

/** Energy a shove adds: ω·Δω + ½Δω². Positive only if the seat is already
 *  moving away from you faster than −Δω/2, and largest where it moves fastest. */
export const shoveGain = (omega: number, kick: number = SWING.kick) => omega * kick + 0.5 * kick * kick;

/* ── lesson 2: shake the spring's end ──────────────────────────────────── */

/** A cart with a 1.2 Hz natural rhythm and Q = 8; the hand moves ±1.5 cm. */
export const SHAKE = { f0: 1.2, Q: 8, hand: 0.015 } as const;
const w0 = TAU * SHAKE.f0;

/** The spring's far end moves h = H cos φ, so the drive per unit mass is ω₀²h. */
export const shakeOsc: Driven = { omega0: w0, beta: w0 / (2 * SHAKE.Q), drive: w0 * w0 * SHAKE.hand, mass: 1 };

/** One RK4 step with the drive written as a phase φ that advances at ω, so the
 *  hand never jumps when the learner changes the shaking rate mid-run. */
export function shakenStep(p: Driven, x: number, v: number, phase: number, omega: number, dt: number): [number, number] {
  const acc = (xx: number, vv: number, tt: number) =>
    -(p.omega0 ** 2) * xx - 2 * p.beta * vv + p.drive * Math.cos(phase + omega * tt);
  const k1x = v, k1v = acc(x, v, 0);
  const k2x = v + (dt / 2) * k1v, k2v = acc(x + (dt / 2) * k1x, v + (dt / 2) * k1v, dt / 2);
  const k3x = v + (dt / 2) * k2v, k3v = acc(x + (dt / 2) * k2x, v + (dt / 2) * k2v, dt / 2);
  const k4x = v + dt * k3v, k4v = acc(x + dt * k3x, v + dt * k3v, dt);
  return [x + (dt / 6) * (k1x + 2 * k2x + 2 * k3x + k4x), v + (dt / 6) * (k1v + 2 * k2v + 2 * k3v + k4v)];
}

/** The shaking rate, in Hz, at which the cart's settled swing is widest. */
export const bestShakeHz = () => resonantFrequency(shakeOsc) / TAU;

/** Settled swing (m) at a shaking rate in Hz. */
export const settledSwing = (hz: number) => steadyAmplitude(shakeOsc, TAU * hz);

/* ── lesson 2: flutter, a push that follows the motion ─────────────────────
   A toy deck in a wind tunnel: θ'' = −ω₀²θ − (2β − κU)θ'. The wind's twisting
   moment is proportional to how fast the deck is already twisting, so it acts
   as damping of the wrong sign. It has no rhythm of its own: the frequency is
   the deck's. Above U* = 2β/κ the net damping is negative and any twist grows.
   ──────────────────────────────────────────────────────────────────────── */

export const FLUTTER = { f0: 0.5, beta: 0.08, onset: 18, maxWind: 30 } as const;
const fw0 = TAU * FLUTTER.f0;
const kappa = (2 * FLUTTER.beta) / FLUTTER.onset;

/** Net damping rate with the wind blowing at U m/s (negative means growth). */
export const netDamping = (U: number) => FLUTTER.beta - (kappa * U) / 2;

export function flutterStep(theta: number, omega: number, U: number, dt: number): [number, number] {
  const acc = (th: number, w: number) => -fw0 * fw0 * th - 2 * netDamping(U) * w;
  const k1t = omega, k1w = acc(theta, omega);
  const k2t = omega + (dt / 2) * k1w, k2w = acc(theta + (dt / 2) * k1t, omega + (dt / 2) * k1w);
  const k3t = omega + (dt / 2) * k2w, k3w = acc(theta + (dt / 2) * k2t, omega + (dt / 2) * k2w);
  const k4t = omega + dt * k3w, k4w = acc(theta + dt * k3t, omega + dt * k3w);
  return [theta + (dt / 6) * (k1t + 2 * k2t + 2 * k3t + k4t), omega + (dt / 6) * (k1w + 2 * k2w + 2 * k3w + k4w)];
}

/** The deck's own twisting period at wind U (barely depends on U). */
export const flutterPeriod = (U: number) => TAU / Math.sqrt(fw0 * fw0 - netDamping(U) ** 2);

/** Each twist's size divided by the one before it. Above 1, it grows. */
export const growthPerCycle = (U: number) => Math.exp(-netDamping(U) * flutterPeriod(U));

/** The slowest wind at which a twist grows: 2β/κ. */
export const flutterOnset = () => (2 * FLUTTER.beta) / kappa;
