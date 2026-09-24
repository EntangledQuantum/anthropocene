/** Chapter 2, Motion Along a Straight Line: the physics behind its scenes.
 *
 *  Lesson 1 happens in one lift shaft. You either hold the car (position) and
 *  the velocity is read from the trace, or you hold the lever (velocity) and
 *  the height piles up. Lesson 2 is constant acceleration: a braking car and a
 *  ball thrown straight up, which turn out to be the same triangle.
 *
 *  Everything here is built on `kinematics.ts` and `interp.ts`; this file only
 *  adds the pieces those scenes need. Plain arrays, the math visible.
 */
import { accumulate, differentiate, distanceTravelled } from './kinematics.ts';
import { monotoneSpline, type Knot, type MonotoneSpline } from './interp.ts';

export const G = 9.81;

/* ── the lift shaft ────────────────────────────────────────────────────── */

/** Metres per storey. Floor 0 is the ground. */
export const FLOOR_M = 3;
export const TOP_FLOOR = 7;
export const SHAFT_TOP = FLOOR_M * TOP_FLOOR;
/** Full lever, m/s: one floor per second. */
export const LEVER_VMAX = 3;

export const floorHeight = (floor: number): number => floor * FLOOR_M;

/** The lever sets the velocity directly. Near the middle it has a detent, so
 *  "stop" is a place the hand can find. */
export function leverVelocity(lever: number, vmax = LEVER_VMAX, detent = 0.06): number {
  const l = Math.max(-1, Math.min(1, lever));
  return Math.abs(l) < detent ? 0 : l * vmax;
}

/** One frame of accumulation: the same trapezoid rule `accumulate` uses,
 *  applied one step at a time so a live scene can run it. The shaft has a
 *  floor and a roof; the car stops against either. */
export function stepHeight(y: number, vPrev: number, v: number, dt: number, top = SHAFT_TOP): number {
  const next = y + 0.5 * (vPrev + v) * dt;
  return Math.max(0, Math.min(top, next));
}

/** The whole trip from a recorded lever history: height and cable run. */
export function liftTrip(t: readonly number[], v: readonly number[], y0 = 0) {
  const y = accumulate(t, v, y0);
  return { y, climb: y[y.length - 1] - y0, cable: distanceTravelled(t, v) };
}

/** A target trip for the learner to act out, as straight segments between
 *  (time, floor) corners. Piecewise linear on purpose: a parked car is a
 *  flat line and a steady ride is a straight one, nothing in between. */
export function piecewiseTrip(corners: readonly (readonly [number, number])[]) {
  return (t: number): number => {
    if (t <= corners[0][0]) return floorHeight(corners[0][1]);
    for (let i = 1; i < corners.length; i++) {
      const [t0, f0] = corners[i - 1];
      const [t1, f1] = corners[i];
      if (t <= t1) return floorHeight(f0 + ((f1 - f0) * (t - t0)) / (t1 - t0));
    }
    return floorHeight(corners[corners.length - 1][1]);
  };
}

/** How far a recorded run strays from a target worldline: the root-mean-square
 *  gap over the samples, and the single worst moment. */
export function worldlineGap(run: readonly { t: number; y: number }[], target: (t: number) => number) {
  let sq = 0;
  let worst = { t: 0, y: 0, want: target(0), gap: 0 };
  for (const p of run) {
    const want = target(p.t);
    const gap = Math.abs(p.y - want);
    sq += gap * gap;
    if (gap > worst.gap) worst = { t: p.t, y: p.y, want, gap };
  }
  return { rms: run.length ? Math.sqrt(sq / run.length) : Infinity, worst };
}

/** Recent velocity of a recorded run: the slope of its last stretch, by the
 *  same difference `differentiate` uses at an endpoint, over a short window. */
export function recentVelocity(run: readonly { t: number; y: number }[], window = 0.25): number {
  if (run.length < 2) return 0;
  const last = run[run.length - 1];
  let i = run.length - 2;
  while (i > 0 && last.t - run[i].t < window) i--;
  const d = differentiate([run[i].t, last.t], [run[i].y, last.y]);
  return d[1];
}

/* A recorded lift trip for "fastest is not highest". It climbs hard early,
   creeps to its highest point, then comes down slowly. Heights in metres. */
export const RECORDED_TRIP: Knot[] = [
  { t: 0, y: 0 },
  { t: 1, y: 0.6 },
  { t: 3.5, y: 12 },
  { t: 6, y: 16.5 },
  { t: 9, y: 19.5 },
  { t: 12, y: 15 },
  { t: 14, y: 12.5 },
];

export function recordedTrip(): MonotoneSpline {
  return monotoneSpline(RECORDED_TRIP);
}

/** The instant of greatest speed on a spline trip, found by scanning the
 *  spline's exact slope, and the instant of greatest height. */
export function tripExtremes(trip: MonotoneSpline, n = 1401) {
  const t0 = trip.knots[0].t;
  const t1 = trip.knots[trip.knots.length - 1].t;
  let fast = { t: t0, v: 0 };
  let high = { t: t0, y: -Infinity };
  for (let i = 0; i < n; i++) {
    const t = t0 + ((t1 - t0) * i) / (n - 1);
    const v = trip.slopeAt(t);
    const y = trip.at(t);
    if (Math.abs(v) > Math.abs(fast.v)) fast = { t, v };
    if (y > high.y) high = { t, y };
  }
  return { fast, high, vAtHigh: trip.slopeAt(high.t) };
}

/* ── constant acceleration: braking ────────────────────────────────────── */

/** Distance to stop from speed v at constant deceleration a: the triangle
 *  under v(t), half of v times v/a. */
export const stoppingDistance = (v: number, a: number): number => (v * v) / (2 * a);

/** Speed left after braking over a distance d from v0. Zero if it stopped. */
export const speedAfter = (v0: number, a: number, d: number): number => Math.sqrt(Math.max(0, v0 * v0 - 2 * a * d));

/** A car at v0 from x = 0, braking at constant `decel` once its front reaches
 *  `brakeAt`. Returns position and speed at time t. Exact, not stepped. */
export function brakeRun(v0: number, decel: number, brakeAt: number) {
  const tBrake = brakeAt / v0;
  const tStop = tBrake + v0 / decel;
  const stopX = brakeAt + stoppingDistance(v0, decel);
  const at = (t: number) => {
    if (t <= tBrake) return { x: v0 * t, v: v0, braking: false };
    const s = Math.min(t, tStop) - tBrake;
    return { x: brakeAt + v0 * s - 0.5 * decel * s * s, v: v0 - decel * s, braking: t < tStop };
  };
  return { tBrake, tStop, stopX, at };
}

/** Where the car ends up relative to a line at `lineAt`: positive `gap` is
 *  short of the line, and `crossSpeed` is how fast it was going at the line. */
export function brakeOutcome(v0: number, decel: number, brakeAt: number, lineAt: number) {
  const { stopX } = brakeRun(v0, decel, brakeAt);
  const gap = lineAt - stopX;
  const crossSpeed = gap >= 0 ? 0 : speedAfter(v0, decel, Math.max(0, lineAt - brakeAt));
  return { stopX, gap, crossSpeed };
}

/* ── constant acceleration: a ball thrown straight up ──────────────────── */

export const apexHeight = (v0: number, g = G): number => (v0 * v0) / (2 * g);
export const launchSpeedFor = (h: number, g = G): number => Math.sqrt(2 * g * h);
export const timeToApex = (v0: number, g = G): number => v0 / g;

/** Height, velocity (up positive) and acceleration of a ball thrown up at v0. */
export function throwState(v0: number, t: number, g = G) {
  return { y: v0 * t - 0.5 * g * t * t, v: v0 - g * t, a: -g };
}

/** A throw under a ceiling at height h: does it reach, and how hard does it hit? */
export function ceilingOutcome(v0: number, h: number, g = G) {
  const apex = apexHeight(v0, g);
  return { apex, reaches: apex >= h, hitSpeed: speedAfter(v0, g, h) };
}

/** Vertical fall with quadratic drag (per unit mass coefficient k), stepped with
 *  the same predictor–corrector as `launchProjectile`. Returns the acceleration
 *  history, so a lesson can show it is not constant. */
export function dragFallAccel(k: number, seconds: number, dt = 0.002, g = G): { t: number; v: number; a: number }[] {
  const acc = (v: number) => g - k * v * Math.abs(v); // down positive
  const out = [{ t: 0, v: 0, a: acc(0) }];
  let v = 0;
  for (let i = 1; i * dt <= seconds + 1e-12; i++) {
    const a0 = acc(v);
    const a1 = acc(v + a0 * dt);
    v += 0.5 * (a0 + a1) * dt;
    out.push({ t: i * dt, v, a: acc(v) });
  }
  return out;
}
