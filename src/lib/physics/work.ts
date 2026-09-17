/** Work: the piece of a force that the motion actually sees.
 *
 *  Chapter 6's whole argument is geometric before it is algebraic. Two arrows
 *  are given — a force and a displacement — and only their shared piece counts.
 *  So every function here is built on the decomposition in `vectors.ts` rather
 *  than on a remembered `F d cos θ`: `splitForWork` hands back the parallel and
 *  perpendicular halves as vectors, and the number a lesson prints is the dot
 *  product of things a learner can see on screen.
 *
 *  Three claims are load-bearing enough that the tests pin them:
 *
 *    - a force perpendicular to the motion contributes exactly zero, for any
 *      magnitude at all (`splitForWork`, `runBead`);
 *    - the running total of F dx is the area under F(x), signed
 *      (`cumulativeWork`);
 *    - integrating the motion under a varying force and measuring the kinetic
 *      energy gives back that same area (`pushThroughField`) — the work-energy
 *      theorem as a *measurement*, not an assertion.
 *
 *  There is deliberately no potential energy in this file. Chapter 7 owns the
 *  landscape; here a force is given directly as F(x) and the work is whatever
 *  the path collected.
 */

import { accumulate } from './kinematics.ts';
import {
  add2,
  along,
  angleBetween2,
  decompose,
  dot2,
  mag2,
  rotate2,
  scale2,
  sub2,
  type Vec2,
} from './vectors.ts';

/* ── a force and a displacement ──────────────────────────────────────────── */

/** W = F · d. The definition, with nothing hidden inside it. */
export const workOfConstantForce = (F: Vec2, d: Vec2): number => dot2(F, d);

export interface WorkSplit {
  /** The piece of F that lies along d — the only piece that pays. */
  parallel: Vec2;
  /** The piece d never sees. Its work is zero however large it is. */
  perpendicular: Vec2;
  /** Signed length of `parallel`: F cos θ, negative when the force opposes. */
  fParallel: number;
  /** Angle between the two arrows, in radians, 0 … π. */
  angle: number;
  work: number;
  sign: 'positive' | 'negative' | 'zero';
}

/** Split a force against a displacement and report what each half does.
 *
 *  The sign field exists because "positive, negative, zero" are three different
 *  physical stories — speeding up, slowing down, steering — and a lesson should
 *  be able to label the story without re-deriving it from a float comparison. */
export function splitForWork(F: Vec2, d: Vec2): WorkSplit {
  const { parallel, perpendicular } = decompose(F, d);
  const work = dot2(F, d);
  // Scale the zero test to the arrows: 1e-12 J is "zero" for newton-metres and
  // would be a real number for micro-scale quantities.
  const eps = 1e-12 * Math.max(1, mag2(F) * mag2(d));
  return {
    parallel,
    perpendicular,
    fParallel: along(F, d),
    angle: angleBetween2(F, d),
    work,
    sign: work > eps ? 'positive' : work < -eps ? 'negative' : 'zero',
  };
}

/** The line integral ∫F·dr as a running total along a sampled path.
 *
 *  Trapezoid in the force between samples, exact in the displacement: the path
 *  is polygonal by construction, so the only approximation is how the force
 *  varies along each short leg. */
export function workAlongPath(points: readonly Vec2[], forces: readonly Vec2[]): number[] {
  const out = [0];
  for (let i = 1; i < points.length; i++) {
    const dr = sub2(points[i], points[i - 1]);
    const fAvg = scale2(add2(forces[i], forces[i - 1]), 0.5);
    out.push(out[i - 1] + dot2(fAvg, dr));
  }
  return out;
}

/* ── kinetic energy ──────────────────────────────────────────────────────── */

/** K = ½mv². A scalar: it carries no direction, and two bodies of equal speed
 *  in opposite directions hold identical kinetic energy. */
export const kineticEnergy = (mass: number, speed: number): number =>
  0.5 * mass * speed * speed;

export const speedFromKinetic = (mass: number, K: number): number =>
  K <= 0 ? 0 : Math.sqrt((2 * K) / mass);

/** How far a constant opposing force takes to remove all of K.
 *
 *  The v² in the kinetic energy lands here undiluted: the distance is
 *  quadratic in the speed, which is the whole content of a braking chart. */
export const stoppingDistance = (mass: number, speed: number, force: number): number =>
  kineticEnergy(mass, speed) / force;

/* ── a force that varies along the line ──────────────────────────────────── */

/** Running total of ∫F dx — the signed area under the force curve.
 *
 *  Deliberately the same `accumulate` the velocity graphs of Chapter 2 use. It
 *  is the same operation on a different pair of axes, and a learner meeting it
 *  twice should meet the same code. */
export function cumulativeWork(x: readonly number[], F: readonly number[]): number[] {
  return accumulate(x, F, 0);
}

export const totalWork = (x: readonly number[], F: readonly number[]): number => {
  const c = cumulativeWork(x, F);
  return c[c.length - 1];
};

export interface PushState {
  t: number;
  x: number;
  v: number;
  /** ½mv² at this instant, measured from the simulated velocity. */
  K: number;
  /** ∫F dx accumulated over the path actually taken. */
  W: number;
}

export interface PushOptions {
  mass?: number;
  v0: number;
  x0?: number;
  xEnd: number;
  /** The force field, in newtons, as a function of position. */
  force: (x: number) => number;
  dt?: number;
  maxSteps?: number;
  /** Keep every nth state, so a long run does not return a million points. */
  record?: number;
}

export interface PushRun {
  states: PushState[];
  /** `turned-back` is the interesting failure: the body ran out of kinetic
   *  energy inside the field and never sampled the rest of the curve. */
  outcome: 'reached' | 'turned-back' | 'stalled';
  turnedAt: number | null;
  /** ΔK across the whole run, measured from the first and last speeds. */
  deltaK: number;
  /** ∫F dx over the path actually taken, accumulated step by step. */
  workDone: number;
}

/** Push a body through a one-dimensional force field and watch its energy.
 *
 *  Velocity Verlet, so that the drag-free comparison against the area under
 *  F(x) is measuring physics rather than integrator error. The work is
 *  accumulated independently of the kinetic energy — trapezoid in F over each
 *  step's real displacement — which is what makes "the area equals ΔK" a check
 *  the widget can print rather than an identity the code assumes. */
export function pushThroughField(o: PushOptions): PushRun {
  const { mass = 1, v0, x0 = 0, xEnd, force, dt = 0.002, maxSteps = 120_000, record = 1 } = o;

  let x = x0;
  let v = v0;
  let W = 0;
  let a = force(x) / mass;

  const first: PushState = { t: 0, x, v, K: kineticEnergy(mass, v), W: 0 };
  const states: PushState[] = [first];
  let outcome: PushRun['outcome'] = 'stalled';
  let turnedAt: number | null = null;

  /** Linear blend between the step's two ends, used to land exactly on the
   *  wall or exactly on the instant the body stops. Without it the last step
   *  overshoots by v·dt and collects work from a stretch of the field the body
   *  never actually crossed — which is small, but it is the same size as the
   *  discrepancy a lesson is asking the learner to look at. */
  const lerpState = (prev: PushState, next: PushState, f: number): PushState => ({
    t: prev.t + f * (next.t - prev.t),
    x: prev.x + f * (next.x - prev.x),
    v: prev.v + f * (next.v - prev.v),
    K: 0,
    W: prev.W + f * (next.W - prev.W),
  });

  for (let i = 1; i <= maxSteps; i++) {
    const prev: PushState = { t: (i - 1) * dt, x, v, K: kineticEnergy(mass, v), W };

    x += v * dt + 0.5 * a * dt * dt;
    const aNext = force(x) / mass;
    v += 0.5 * (a + aNext) * dt;
    W += 0.5 * (mass * a + mass * aNext) * (x - prev.x);
    a = aNext;

    const s: PushState = { t: i * dt, x, v, K: kineticEnergy(mass, v), W };

    if (x >= xEnd) {
      const end = lerpState(prev, s, (xEnd - prev.x) / (x - prev.x));
      end.x = xEnd;
      end.K = kineticEnergy(mass, end.v);
      states.push(end);
      outcome = 'reached';
      break;
    }
    if (v <= 0) {
      const stop = lerpState(prev, s, prev.v / (prev.v - v));
      stop.v = 0;
      states.push(stop);
      outcome = 'turned-back';
      turnedAt = stop.x;
      break;
    }
    if (i % record === 0) states.push(s);
  }

  const last = states[states.length - 1];
  return { states, outcome, turnedAt, deltaK: last.K - first.K, workDone: last.W };
}

/** A constrained particle on a horizontal track, with a constant applied
 *  force and a constant backward brake. The ideal track's transverse reaction
 *  (including the support against gravity) does no work. The brake is only
 *  specified while the particle moves forward; the trial ends at its first stop.
 *
 *  Individual work is measured from each force and the actual displacement.
 *  K is independently measured from the velocity integrated by pushThroughField.
 *  Never assign K = K₀ + W here: comparing the two accounts is the experiment. */
export interface ConstantForceTrialOptions {
  applied: Vec2;
  brake: number;
  distance: number;
  mass: number;
  speed0: number;
}

export function constantForceTrial(o: ConstantForceTrialOptions) {
  const net = add2(o.applied, [-o.brake, 0]);
  const run = pushThroughField({
    mass: o.mass, v0: o.speed0, xEnd: o.distance,
    force: () => net[0], dt: 0.001, record: 10,
  });
  const initialK = kineticEnergy(o.mass, o.speed0);
  const samples = run.states.map((state) => {
    const displacement: Vec2 = [state.x, 0];
    const appliedWork = workOfConstantForce(o.applied, displacement);
    const brakeWork = workOfConstantForce([-o.brake, 0], displacement);
    return {
      ...state,
      appliedWork,
      brakeWork,
      netWork: appliedWork + brakeWork,
      deltaK: state.K - initialK,
    };
  });
  return { run, samples, initialK };
}

/* ── a bead on a circular track ──────────────────────────────────────────── */

/** A bead threaded on a frictionless circular wire, pushed by one applied
 *  force of fixed magnitude held at a fixed tilt from the inward radius.
 *
 *  `tilt = 0` is the centripetal case: the force points at the centre, the
 *  motion is along the tangent, and the two are perpendicular forever. The
 *  wire's own force is radial by construction, so it never does work either —
 *  which is why a huge force can hold a satellite in orbit for a century and
 *  transfer no energy at all. */
export interface BeadOptions {
  radius?: number;
  mass?: number;
  speed0?: number;
  /** Magnitude of the applied force, in newtons. */
  forceMag?: number;
  /** Degrees from the inward radial direction toward the direction of travel.
   *  0 = pure centripetal, 90 = pure push from behind, −90 = pure brake. */
  tiltDeg?: number;
}

export interface BeadState {
  t: number;
  /** Angle round the track, radians, counter-clockwise from +x. */
  theta: number;
  /** Signed speed along the track; negative means running clockwise. */
  speed: number;
  /** ∫F·v dt for the applied force, accumulated since the start. */
  work: number;
}

const beadDefaults = (o: BeadOptions) => ({
  radius: o.radius ?? 2,
  mass: o.mass ?? 1,
  speed0: o.speed0 ?? 3,
  forceMag: o.forceMag ?? 40,
  tiltDeg: o.tiltDeg ?? 0,
});

export const beadInit = (o: BeadOptions = {}): BeadState => ({
  t: 0,
  theta: 0,
  speed: beadDefaults(o).speed0,
  work: 0,
});

/** Position of the bead on the track. */
export function beadPosition(s: BeadState, o: BeadOptions = {}): Vec2 {
  const { radius } = beadDefaults(o);
  return [radius * Math.cos(s.theta), radius * Math.sin(s.theta)];
}

/** Unit tangent in the counter-clockwise sense. Velocity is `speed` times this,
 *  so a negative speed simply reverses the arrow. */
export function beadTangent(s: BeadState): Vec2 {
  return [-Math.sin(s.theta), Math.cos(s.theta)];
}

export function beadVelocity(s: BeadState): Vec2 {
  return scale2(beadTangent(s), s.speed);
}

/** The applied force as an arrow in the plane: the inward radius, rotated by
 *  the tilt toward the counter-clockwise tangent. */
export function beadForce(s: BeadState, o: BeadOptions = {}): Vec2 {
  const { forceMag, tiltDeg } = beadDefaults(o);
  const inward: Vec2 = [-Math.cos(s.theta), -Math.sin(s.theta)];
  return scale2(rotate2(inward, (tiltDeg * Math.PI) / 180), forceMag);
}

/** What the wire has to supply to keep the bead on the circle: enough inward
 *  pull to make up mv²/R after the applied force has contributed its share. */
export function beadTrackForce(s: BeadState, o: BeadOptions = {}): Vec2 {
  const { radius, mass, forceMag, tiltDeg } = beadDefaults(o);
  const needed = (mass * s.speed * s.speed) / radius;
  const suppliedInward = forceMag * Math.cos((tiltDeg * Math.PI) / 180);
  const inward: Vec2 = [-Math.cos(s.theta), -Math.sin(s.theta)];
  return scale2(inward, needed - suppliedInward);
}

/** One step. The tangential acceleration is constant over the step, so the
 *  midpoint velocity makes both the angle advance and the work exact for that
 *  step — no integrator error muddying a claim about zero. */
export function beadStep(s: BeadState, o: BeadOptions, dt: number): BeadState {
  const { radius, mass, forceMag, tiltDeg } = beadDefaults(o);
  const fTangent = forceMag * Math.sin((tiltDeg * Math.PI) / 180);
  const a = fTangent / mass;
  const vMid = s.speed + 0.5 * a * dt;
  return {
    t: s.t + dt,
    theta: s.theta + (vMid * dt) / radius,
    speed: s.speed + a * dt,
    work: s.work + fTangent * vMid * dt,
  };
}

export function runBead(o: BeadOptions, dt: number, steps: number): BeadState[] {
  const out = [beadInit(o)];
  for (let i = 0; i < steps; i++) out.push(beadStep(out[i], o, dt));
  return out;
}

/* ── power ───────────────────────────────────────────────────────────────── */

/** P = F · v. The rate at which a force feeds energy into the motion — and it
 *  is the same dot product as the work, with the displacement swapped for the
 *  velocity. */
export const instantaneousPower = (F: Vec2, v: Vec2): number => dot2(F, v);

export const averagePower = (work: number, seconds: number): number => work / seconds;

/** Aerodynamic drag magnitude, ½ρC_dA v². */
export const dragForce = (speed: number, k: number): number => k * speed * speed;

/** A rider on a flat road: quadratic air drag plus near-constant rolling loss. */
export interface RideOptions {
  /** ½ρC_dA, in kg/m. */
  k?: number;
  /** Rolling resistance force, in newtons. */
  rolling?: number;
}

export const RIDE: Required<RideOptions> = {
  // ρ = 1.225 kg/m³, C_d A = 0.32 m² — a road rider on the drops.
  k: 0.5 * 1.225 * 0.32,
  // C_rr = 0.004 on an 80 kg rider-plus-bike.
  rolling: 0.004 * 80 * 9.81,
};

/** Power the rider must deliver to hold this speed: force times speed, with
 *  the force being whatever the air and the tyres are taking. */
export function ridePowerNeeded(speed: number, o: RideOptions = {}): number {
  const { k, rolling } = { ...RIDE, ...o };
  return (dragForce(speed, k) + rolling) * speed;
}

/** The speed at which a given power is exactly used up.
 *
 *  Bisection rather than the closed form, because the rolling term spoils the
 *  cube root and because the honest thing for a lesson to print is the speed
 *  where the measured power curve crosses the rider's output. */
export function topSpeedAtPower(watts: number, o: RideOptions = {}): number {
  let lo = 0;
  let hi = 100;
  for (let i = 0; i < 200; i++) {
    const mid = 0.5 * (lo + hi);
    if (ridePowerNeeded(mid, o) < watts) lo = mid;
    else hi = mid;
  }
  return 0.5 * (lo + hi);
}
