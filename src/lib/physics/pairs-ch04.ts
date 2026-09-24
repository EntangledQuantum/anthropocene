/** Chapter 4, lesson 2: two bodies, two forces, one interaction.
 *
 *  Four small worlds, each built from `Force` records so that the third law is
 *  never asserted by hand. Every contact force is declared once, on one body,
 *  and its partner is produced by `thirdLawPartner`. Sums go through
 *  `netForceOn` / `netForceOnSystem`, so a partner cannot enter the wrong sum.
 *
 *    - `crashHistory`: a car and a truck meet bumper to bumper.
 *    - `pushedRow`:    a row of blocks (or a horse and cart) driven by one
 *                      outside force, with every contact force between them.
 *    - `externalForces`: which forces cross a boundary you chose.
 *    - `liftState`:    a rider on a scale in a lift hung from a cable.
 */
import {
  accelerationOn,
  G_EARTH,
  netForceOn,
  netForceOnSystem,
  internalForces,
  scaleReading,
  thirdLawPartner,
  weight,
  type Force,
} from './dynamics.ts';

/* ── the crash ────────────────────────────────────────────────────────────── */

export interface CrashSpec {
  mCar: number;
  mTruck: number;
  /** Car moves right (+), truck moves left (−), m/s. */
  vCar: number;
  vTruck: number;
  /** Bumper gap at t = 0, metres. */
  gap?: number;
  /** Crumple stiffness, N/m, and crush damping, N·s/m² (Hunt–Crossley: the
   *  damping grows with the crush, so the force starts from zero). */
  k?: number;
  c?: number;
  duration?: number;
  dt?: number;
}

export interface CrashSample {
  t: number;
  /** Front bumper of the car and of the truck, metres. */
  xCar: number;
  xTruck: number;
  vCar: number;
  vTruck: number;
  /** Signed x-components, newtons: the truck's push on the car, the car's on the truck. */
  fOnCar: number;
  fOnTruck: number;
  aCar: number;
  aTruck: number;
}

/** The single contact interaction, declared once as the truck's push on the car.
 *  Crumple zones are a spring whose damping grows with the crush (Hunt–Crossley),
 *  so the force rises from zero, and it can push but never pull. */
export function bumperForce(overlap: number, closing: number, k: number, c: number): Force {
  const push = overlap > 0 ? Math.max(0, overlap * (k + c * closing)) : 0;
  return { id: 'bumper', on: 'car', by: 'truck', kind: 'contact', vec: [-push, 0] };
}

export function crashHistory(spec: CrashSpec): CrashSample[] {
  const { mCar, mTruck } = spec;
  const k = spec.k ?? 5e5, c = spec.c ?? 2e5;
  const dt = spec.dt ?? 1e-4, T = spec.duration ?? 0.2;
  let xCar = -(spec.gap ?? 1.5) / 2, xTruck = (spec.gap ?? 1.5) / 2;
  let vCar = spec.vCar, vTruck = spec.vTruck;
  const out: CrashSample[] = [];
  for (let t = 0; t <= T + 1e-12; t += dt) {
    const onCar = bumperForce(xCar - xTruck, vCar - vTruck, k, c);
    const forces = [onCar, thirdLawPartner(onCar)];
    const aCar = accelerationOn('car', mCar, forces)[0];
    const aTruck = accelerationOn('truck', mTruck, forces)[0];
    out.push({
      t, xCar, xTruck, vCar, vTruck,
      fOnCar: netForceOn('car', forces)[0], fOnTruck: netForceOn('truck', forces)[0],
      aCar, aTruck,
    });
    // Semi-implicit Euler: plenty at dt = 0.1 ms against a ~100 ms crush.
    vCar += aCar * dt; vTruck += aTruck * dt;
    xCar += vCar * dt; xTruck += vTruck * dt;
  }
  return out;
}

/** Largest force magnitude each vehicle felt, and largest acceleration. */
export function crashPeaks(h: readonly CrashSample[]) {
  let fCar = 0, fTruck = 0, aCar = 0, aTruck = 0;
  for (const s of h) {
    fCar = Math.max(fCar, Math.abs(s.fOnCar));
    fTruck = Math.max(fTruck, Math.abs(s.fOnTruck));
    aCar = Math.max(aCar, Math.abs(s.aCar));
    aTruck = Math.max(aTruck, Math.abs(s.aTruck));
  }
  return { fCar, fTruck, aCar, aTruck };
}

/* ── a row of bodies driven by one outside force ─────────────────────────── */

export interface RowWorld {
  /** Body ids are 'b0', 'b1', … left to right. */
  ids: string[];
  masses: number[];
  /** Common acceleration, m/s², rightward positive. They move together. */
  a: number;
  /** The outside force, then each link force and its partner. */
  forces: Force[];
  /** Signed rightward force on body i+1 from body i, per link. Positive is a
   *  push (touching blocks); negative is a pull (a harness or coupling). */
  links: number[];
}

/**
 * Bodies in a row, left to right, all moving together. One outside force
 * `push` (rightward, newtons) acts on body `driven`, exerted by `by`.
 *
 * Each link force is found the only honest way: the part of the row on the far
 * side of the link from the driven body must get the common acceleration, and
 * the link is the only thing touching it from this side. That force is declared
 * once, on the right-hand body, and its partner is derived.
 */
export function pushedRow(masses: readonly number[], driven: number, push: number, by = 'you'): RowWorld {
  const ids = masses.map((_, i) => `b${i}`);
  const M = masses.reduce((s, m) => s + m, 0);
  const a = push / M;
  const forces: Force[] = [{ id: 'outside', on: ids[driven], by, kind: 'applied', vec: [push, 0] }];
  const links: number[] = [];
  for (let i = 0; i < masses.length - 1; i++) {
    // Everything right of link i: mass beyond, plus the outside force if it acts there.
    let mRight = 0;
    for (let j = i + 1; j < masses.length; j++) mRight += masses[j];
    const outsideOnRight = driven > i ? push : 0;
    const f = mRight * a - outsideOnRight;
    links.push(f);
    const onRight: Force = {
      id: `link${i}`, on: ids[i + 1], by: ids[i], kind: f >= 0 ? 'contact' : 'tension', vec: [f, 0],
    };
    forces.push(onRight, thirdLawPartner(onRight));
  }
  return { ids, masses: [...masses], a, forces, links };
}

/** Forces acting on the chosen system from outside it. Internal forces are the
 *  ones `internalForces` names; everything else acting on a member is external. */
export function externalForces(system: readonly string[], forces: readonly Force[]): Force[] {
  const inside = new Set(system);
  const internal = new Set(internalForces(system, forces).map((f) => f.id));
  return forces.filter((f) => inside.has(f.on) && !internal.has(f.id));
}

/** Acceleration of a chosen system from the external forces alone: F_ext / M. */
export function systemAcceleration(system: readonly string[], row: RowWorld): number {
  const M = system.reduce((s, id) => s + row.masses[row.ids.indexOf(id)], 0);
  return netForceOnSystem(system, row.forces)[0] / M;
}

/* ── a rider on a scale in a lift ─────────────────────────────────────────── */

export interface LiftState {
  /** Acceleration of lift and rider together, m/s², up positive. */
  a: number;
  /** What the scale reads: its push up on the rider, newtons. */
  scale: number;
  /** The rider's weight, newtons. Never changes. */
  riderWeight: number;
  forces: Force[];
}

/**
 * A lift of mass `mLift` hangs from a cable pulling up with `tension`. The
 * rider stands on a scale bolted to its floor.
 *
 * The acceleration comes from the lift-plus-rider system, where the scale's
 * push and its partner are internal and drop out. The scale's push is then
 * whatever gives the rider that same acceleration: `scaleReading`, clamped at
 * zero because a scale cannot pull. A cable cannot push, so tension < 0 is 0.
 */
export function liftState(tension: number, mLift: number, mRider: number, g = G_EARTH): LiftState {
  const T = Math.max(0, tension);
  const outside: Force[] = [
    { id: 'cable', on: 'lift', by: 'cable', kind: 'tension', vec: [0, T] },
    { id: 'w-lift', on: 'lift', by: 'Earth', kind: 'gravity', vec: [0, -weight(mLift, g)] },
    { id: 'w-rider', on: 'rider', by: 'Earth', kind: 'gravity', vec: [0, -weight(mRider, g)] },
  ];
  const a = netForceOnSystem(['lift', 'rider'], outside)[1] / (mLift + mRider);
  const N = scaleReading(mRider, a, g);
  const onRider: Force = { id: 'scale', on: 'rider', by: 'lift', kind: 'normal', vec: [0, N] };
  return { a, scale: N, riderWeight: weight(mRider, g), forces: [...outside, onRider, thirdLawPartner(onRider)] };
}

/** The cable tension that makes the scale read `reading`. Used to set up tasks
 *  and pinned by the tests; the scene itself only ever runs `liftState`. */
export function tensionForReading(reading: number, mLift: number, mRider: number, g = G_EARTH): number {
  const a = reading / mRider - g;
  return (mLift + mRider) * (g + a);
}
