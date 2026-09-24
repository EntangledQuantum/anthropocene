/** Chapter 6 scenes: a sled on a rope, a car on its brakes, a spring pulled
 *  by hand, and a cart through a headwind and then a tailwind.
 *
 *  Nothing here is new physics. Every function is a thin, named setup over
 *  `work.ts` (`splitForWork`, `pushThroughField`, `cumulativeWork`) and
 *  `work-area.ts` (`areaForce`, `signedArea`), so that the number a scene
 *  prints is the number those libraries compute. Kinetic energy is always
 *  measured from the integrated velocity, never assigned as K₀ + W: comparing
 *  the two accounts is what the scenes are for.
 */

import { G_EARTH } from './dynamics.ts';
import {
  cumulativeWork,
  kineticEnergy,
  pushThroughField,
  speedFromKinetic,
  splitForWork,
  workOfConstantForce,
  type PushState,
} from './work.ts';
import { areaBreaks, areaForce, signedArea, type AreaPoint } from './work-area.ts';
import type { Vec2 } from './vectors.ts';

/* ── the sled on a rope ──────────────────────────────────────────────────── */

export interface SledOptions {
  mass: number;
  /** Rope tension, newtons. Its size never changes; only its direction. */
  pull: number;
  /** Rope angle above the direction of travel, degrees, 0 … 180. */
  angleDeg: number;
  /** Kinetic friction coefficient of the surface. 0 is ice. */
  mu: number;
  v0: number;
  /** Where the flag stands, metres from the start. */
  distance: number;
}

export const SLED = { mass: 10, pull: 60, v0: 3, distance: 8, muSnow: 0.5 } as const;

export const ropeForce = (pull: number, angleDeg: number): Vec2 => {
  const a = (angleDeg * Math.PI) / 180;
  return [pull * Math.cos(a), pull * Math.sin(a)];
};

/** The forces on the sled while it slides forward. The runners press on the
 *  surface with the weight less whatever the rope lifts; friction is μ times
 *  that press, pointing back. */
export function sledForces(o: SledOptions) {
  const rope = ropeForce(o.pull, o.angleDeg);
  const split = splitForWork(rope, [1, 0]);
  const normal = Math.max(0, o.mass * G_EARTH - rope[1]);
  const friction = o.mu * normal;
  return { rope, split, normal, friction, netAlong: split.fParallel - friction };
}

export interface SledRun {
  states: PushState[];
  reached: boolean;
  /** Where it stopped, when it did not reach the flag. */
  stoppedAt: number | null;
  /** Once stopped, does the rope drag it back the way it came? Only when the
   *  rope's backward piece beats what friction can hold (μ taken the same for
   *  sliding and sticking). On ice a backward pull always wins. */
  turnsBack: boolean;
  /** Distance actually covered. */
  x: number;
  vEnd: number;
  /** F · d for the rope over the distance covered. */
  ropeWork: number;
  /** Friction's F · d over the same distance: never positive. */
  surfaceWork: number;
  /** ½mv² at the end minus ½mv₀², from the integrated velocity. */
  deltaK: number;
}

/** Slide the sled to the flag, or until it first stops. Friction is written
 *  for forward sliding only, so the run ends at that first stop; `turnsBack`
 *  says what happens next without simulating it. */
export function sledRun(o: SledOptions): SledRun {
  const f = sledForces(o);
  const run = pushThroughField({
    mass: o.mass, v0: o.v0, xEnd: o.distance, force: () => f.netAlong, dt: 0.001, record: 4,
  });
  const last = run.states[run.states.length - 1];
  const d: Vec2 = [last.x, 0];
  return {
    states: run.states,
    reached: run.outcome === 'reached',
    stoppedAt: run.outcome === 'turned-back' ? last.x : null,
    turnsBack: run.outcome === 'turned-back' && -f.split.fParallel > f.friction,
    x: last.x,
    vEnd: last.v,
    ropeWork: workOfConstantForce(f.rope, d),
    surfaceWork: workOfConstantForce([-f.friction, 0], d),
    deltaK: run.deltaK,
  };
}

/** Running works at position x along a run, for a live ledger. */
export function sledLedgerAt(o: SledOptions, x: number) {
  const f = sledForces(o);
  return { rope: f.split.fParallel * x, surface: -f.friction * x };
}

/** The rope angle, on a grid of `stepDeg`, that brings the sled to the flag
 *  fastest. On ice it is flat; on snow it is tilted up. */
export function fastestAngle(o: Omit<SledOptions, 'angleDeg'>, stepDeg = 5) {
  let best = { angleDeg: 0, vEnd: -Infinity };
  for (let a = 0; a <= 90; a += stepDeg) {
    const r = sledRun({ ...o, angleDeg: a });
    if (r.reached && r.vEnd > best.vEnd) best = { angleDeg: a, vEnd: r.vEnd };
  }
  return best;
}

/* ── the car on its brakes ──────────────────────────────────────────────── */

/** A 1200 kg car whose locked brakes pull back with 6000 N: 5 m/s², so from
 *  10 m/s it stops in exactly 10 m. */
export const CAR = { mass: 1200, brake: 6000, refSpeed: 10, cone: 40 } as const;

export function brakeRun(speed: number, mass: number = CAR.mass, brake: number = CAR.brake) {
  if (speed <= 0) return { states: [{ t: 0, x: 0, v: 0, K: 0, W: 0 }], distance: 0, brakeWork: 0, K0: 0 };
  const run = pushThroughField({
    mass, v0: speed, xEnd: 1e5, force: () => -brake, dt: 0.0005, record: 20, maxSteps: 400_000,
  });
  const distance = run.turnedAt ?? run.states[run.states.length - 1].x;
  return {
    states: run.states,
    distance,
    brakeWork: workOfConstantForce([-brake, 0], [distance, 0]),
    K0: kineticEnergy(mass, speed),
  };
}

/** Speed as a run passes position x, interpolated between integrated
 *  states; 0 if the run stopped before reaching x. */
export function speedPassing(states: readonly PushState[], x: number): number {
  for (let i = 1; i < states.length; i++) {
    const a = states[i - 1], b = states[i];
    if (b.x >= x && b.x > a.x) return a.v + ((x - a.x) / (b.x - a.x)) * (b.v - a.v);
  }
  return 0;
}

/** Work done by the locked brakes over the first x metres of skid. */
export const brakeWorkOver = (x: number, brake: number = CAR.brake) => workOfConstantForce([-brake, 0], [x, 0]);

/* ── the spring pulled by hand ──────────────────────────────────────────── */

/** 800 N/m: the first 5 cm cost exactly 1 J. */
export const SPRING = { k: 800, full: 0.1 } as const;

export const springPull = (k: number, x: number) => k * x;

/** Work your hand does stretching from `a` to `b`, as the area under the
 *  sampled pull. The pull is linear, so the trapezoid sum is exact. */
export function springWork(k: number, a: number, b: number, n = 200): number {
  const xs = Array.from({ length: n + 1 }, (_, i) => a + ((b - a) * i) / n);
  const w = cumulativeWork(xs, xs.map((x) => springPull(k, x)));
  return w[w.length - 1];
}

/** The stretch at which half the work of stretching to `full` has been done,
 *  by bisection on the measured area. */
export function halfWorkStretch(k: number, full: number): number {
  const half = springWork(k, 0, full) / 2;
  let lo = 0, hi = full;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (springWork(k, 0, mid) < half) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

/* ── a cart through two fans ────────────────────────────────────────────── */

export const CART_MASS = 10;

/** Wind along a 4 m track: a headwind over the first 2 m, peaking at 40 N
 *  against the cart at 1 m, then a tailwind over the last 2 m, peaking at
 *  40 N along it at 3 m. Equal lobes, so the total area is zero. */
export const FANS: AreaPoint[] = [
  { x: 0, force: 0 }, { x: 1, force: -40 }, { x: 2, force: 0 }, { x: 3, force: 40 }, { x: 4, force: 0 },
];

export function cartRun(points: readonly AreaPoint[], v0: number, mass = CART_MASS) {
  const end = points[points.length - 1].x;
  const run = pushThroughField({
    mass, v0, xEnd: end, force: (x) => areaForce(points, x), dt: 0.0005, record: 8, maxSteps: 400_000,
  });
  return { ...run, reached: run.outcome === 'reached', K0: kineticEnergy(mass, v0) };
}

/** The deepest the running area ever dips below zero, in joules: the energy
 *  a cart must bring in to get through. The total area can be zero or even
 *  positive and this still be large. */
export function deepestDip(points: readonly AreaPoint[]): number {
  const end = points[points.length - 1].x;
  return -Math.min(0, ...areaBreaks(points, end).map((p) => signedArea(points, p.x).work));
}

/** The least launch speed that carries the cart to the end: enough kinetic
 *  energy to pay for the deepest dip in the running area, not the total. */
export const leastLaunchSpeed = (points: readonly AreaPoint[], mass = CART_MASS): number =>
  speedFromKinetic(mass, deepestDip(points));

/** The signed area from the start to x, split into the part above the axis and
 *  the part below it: the running work a cart has collected by x. */
export const runningWork = (points: readonly AreaPoint[], x: number) => signedArea(points, x);

/* ── a bow, for the transfer step ───────────────────────────────────────── */

/** A bow whose draw force rises steadily from 0 to `peak` over `draw` metres,
 *  every joule of it handed to the arrow. */
export const BOW = { peak: 300, draw: 0.5, arrow: 0.025 } as const;

export function bowArrowSpeed(peak: number = BOW.peak, draw: number = BOW.draw, arrow: number = BOW.arrow): number {
  const k = peak / draw;
  return speedFromKinetic(arrow, springWork(k, 0, draw));
}
