/** Statics and elasticity — Chapter 11, "Equilibrium and Elasticity".
 *
 *  Statics is Newton with both accelerations set to zero: the forces must add
 *  to nothing AND their turning effects must add to nothing. Both sums already
 *  live in `dynamics.ts` (`netForceOn`, `netTorqueAbout`, `inEquilibrium`);
 *  this file only builds beams, seesaws and forearms out of `Force`s so those
 *  sums can be asked about them, and solves for the one or two unknown support
 *  pushes the way a person would: pick the point that kills an unknown.
 *
 *  The beam is a body at the origin lying along x. A load at `x` is a force
 *  whose application point is `at: [x, 0]`. Torques are anticlockwise-positive
 *  (z out of the page), as `cross2` gives them.
 *
 *  Elasticity is what happens when "rigid" turns out to have been a lie. A wire
 *  is Hooke's law in stress and strain up to the yield stress, and past it the
 *  wire flows: it keeps a permanent stretch and comes back down a line parallel
 *  to the one it went up. That is a one-dimensional elastic–plastic model with
 *  linear hardening, and it is all a wire under a steady pull needs.
 */

import {
  G_EARTH,
  inEquilibrium,
  netForceOn,
  netTorqueAbout,
  weight,
  type Body,
  type Force,
} from './dynamics.ts';
import { add2, cross2, sub2, type Vec2 } from './vectors.ts';

/* ── beams as bodies ─────────────────────────────────────────────────────── */

/** The beam: a body at the origin. Only its id matters to the sums. */
export const BEAM: Body = { id: 'beam', label: 'beam', mass: 0, pos: [0, 0], vel: [0, 0], size: 0 };

/** A mass resting on the beam at position x, metres along it. */
export interface PointLoad {
  label: string;
  /** kg */
  mass: number;
  /** metres along the beam */
  x: number;
}

/** A load's weight, as a force on the beam at its position. */
export function loadForce(l: PointLoad, g = G_EARTH): Force {
  return { id: `w-${l.label}`, on: 'beam', by: 'Earth', kind: 'gravity', label: l.label, vec: [0, -weight(l.mass, g)], at: [l.x, 0] };
}

/** An upward push on the beam at x, newtons: a pivot, a trestle, a hand. */
export function supportForce(label: string, x: number, push: number): Force {
  return { id: `n-${label}`, on: 'beam', by: label, kind: 'normal', label, vec: [0, push], at: [x, 0] };
}

/** Net torque of `forces` on the beam about the point `ref`, N·m, anticlockwise positive. */
export function torqueAbout(ref: Vec2, forces: readonly Force[]): number {
  return netTorqueAbout(ref, [BEAM], forces);
}

export interface LedgerLine {
  id: string;
  label: string;
  /** N·m about the reference point, anticlockwise positive. */
  torque: number;
  /** Perpendicular distance from the reference point to the force's line of action, m. */
  arm: number;
}

/** Each force's own torque about `ref`: the ledger a person writes down. */
export function torqueLedger(ref: Vec2, forces: readonly Force[]): LedgerLine[] {
  return forces.map((f) => {
    const r = sub2(add2(BEAM.pos, f.at ?? [0, 0]), ref);
    const torque = cross2(r, f.vec);
    const F = Math.hypot(f.vec[0], f.vec[1]);
    return { id: f.id, label: f.label ?? f.id, torque, arm: F > 0 ? Math.abs(torque) / F : 0 };
  });
}

/** Both conditions: forces add to zero, and torques about the origin add to zero.
 *  (If the forces add to zero, the torque sum is the same about every point, so
 *  one reference point is enough.) */
export function inStaticEquilibrium(forces: readonly Force[], tolF = 1e-9, tolT = 1e-9): boolean {
  return inEquilibrium('beam', forces, tolF) && Math.abs(torqueAbout([0, 0], forces)) <= tolT;
}

export const netForceOnBeam = (forces: readonly Force[]) => netForceOn('beam', forces);

/* ── the seesaw ──────────────────────────────────────────────────────────── */

/** Net torque of the loads' weights about a pivot at `pivotX`, N·m.
 *  Positive turns the plank anticlockwise: the left end goes down. */
export function seesawTorque(loads: readonly PointLoad[], pivotX: number, g = G_EARTH): number {
  return torqueAbout([pivotX, 0], loads.map((l) => loadForce(l, g)));
}

/** Where a load of `mass` must sit for the seesaw to balance. */
export function balancingPosition(fixed: readonly PointLoad[], mass: number, pivotX: number, g = G_EARTH): number {
  // τ(fixed) + (−m g)(x − pivot) = 0
  return pivotX + seesawTorque(fixed, pivotX, g) / weight(mass, g);
}

/** The pivot's push on a balanced, level seesaw: whatever makes the forces add to zero. */
export function pivotPush(loads: readonly PointLoad[], g = G_EARTH): number {
  return -netForceOn('beam', loads.map((l) => loadForce(l, g)))[1];
}

export interface Plank {
  /** kg */
  mass: number;
  /** m */
  length: number;
}

export interface TiltState {
  /** Plank angle, radians. Positive: anticlockwise (left end down, for a seesaw). */
  theta: number;
  omega: number;
}

/** Let go of a seesaw pivoted at its centre and let it turn for `dt`.
 *  Weights keep pointing down while the plank tilts, so each torque carries a
 *  cos θ; the plank stops dead when an end meets the ground at `maxTilt`. */
export function seesawStep(s: TiltState, loads: readonly PointLoad[], plank: Plank, maxTilt: number, dt: number, g = G_EARTH): void {
  const pivotX = plank.length / 2;
  const tau = seesawTorque(loads, pivotX, g) * Math.cos(s.theta);
  const I = (plank.mass * plank.length ** 2) / 12 + loads.reduce((a, l) => a + l.mass * (l.x - pivotX) ** 2, 0);
  s.omega += (tau / I) * dt;
  s.theta += s.omega * dt;
  if (Math.abs(s.theta) >= maxTilt) {
    s.theta = Math.sign(s.theta) * maxTilt;
    s.omega = 0;
  }
}

/* ── a plank on two trestles ─────────────────────────────────────────────── */

export interface Reactions {
  /** Upward push of the left support, N. Negative means it would have to pull. */
  left: number;
  right: number;
}

/** Support pushes for a plank on supports at xA < xB, found the way a person
 *  would: torques about A kill the unknown at A and give B directly, and the
 *  force sum gives A. */
export function supportReactions(loads: readonly PointLoad[], xA: number, xB: number, g = G_EARTH): Reactions {
  const w = loads.map((l) => loadForce(l, g));
  // τ_A(loads) + R_B (xB − xA) = 0
  const right = -torqueAbout([xA, 0], w) / (xB - xA);
  const left = pivotPush(loads, g) - right;
  return { left, right };
}

/** The forces on a plank on two trestles with a walker at x: weights and both pushes. */
export function plankForces(plank: Plank, walker: PointLoad, xA: number, xB: number, g = G_EARTH): Force[] {
  const loads: PointLoad[] = [{ label: 'plank', mass: plank.mass, x: plank.length / 2 }, walker];
  const r = supportReactions(loads, xA, xB, g);
  return [...loads.map((l) => loadForce(l, g)), supportForce('left trestle', xA, r.left), supportForce('right trestle', xB, r.right)];
}

/** How far along the plank a walker of `mass` can stand before the left
 *  trestle's push reaches zero and the plank tips about the right trestle. */
export function farthestReach(plank: Plank, mass: number, xB: number): number {
  // Tipping about B: m (x − xB) = M (xB − L/2)
  return xB + (plank.mass * (xB - plank.length / 2)) / mass;
}

/** Once the left push would go negative, the plank turns about the right
 *  trestle. Positive θ: the far (right) end goes down. Stops at `maxTilt`. */
export function tipStep(s: TiltState, plank: Plank, walker: PointLoad, xB: number, maxTilt: number, dt: number, g = G_EARTH): void {
  const c = plank.length / 2;
  const tau = g * (walker.mass * (walker.x - xB) - plank.mass * (xB - c)) * Math.cos(s.theta);
  if (s.theta <= 0 && tau <= 0) { s.theta = 0; s.omega = 0; return; }
  const I = plank.mass * (plank.length ** 2 / 12 + (c - xB) ** 2) + walker.mass * (walker.x - xB) ** 2;
  s.omega += (tau / I) * dt;
  s.theta += s.omega * dt;
  if (s.theta >= maxTilt) { s.theta = maxTilt; s.omega = 0; }
  if (s.theta < 0) { s.theta = 0; s.omega = 0; }
}

/* ── one unknown force ───────────────────────────────────────────────────── */

/** The size of a force along unit direction `dir`, applied at `at`, that makes
 *  the torque about `pivot` vanish. Taking torques about the pivot is what lets
 *  its own (unknown) push drop out. */
export function forceToBalance(known: readonly Force[], pivot: Vec2, at: Vec2, dir: Vec2): number {
  const perUnit = cross2(sub2(at, pivot), dir);
  return -torqueAbout(pivot, known) / perUnit;
}

/** A level forearm with the elbow as the pivot: how hard the biceps pulls up. */
export function bicepsPull(opts: { loadMass: number; loadArm: number; armMass: number; armCg: number; muscleArm: number }, g = G_EARTH): number {
  const known = [
    loadForce({ label: 'load', mass: opts.loadMass, x: opts.loadArm }, g),
    loadForce({ label: 'forearm', mass: opts.armMass, x: opts.armCg }, g),
  ];
  return forceToBalance(known, [0, 0], [opts.muscleArm, 0], [0, 1]);
}

/* ── elasticity ──────────────────────────────────────────────────────────── */

export interface Material {
  name: string;
  /** Young's modulus, Pa. */
  E: number;
  /** Stress at the elastic limit, Pa. */
  yieldStress: number;
  /** Slope of stress against plastic strain once it flows, Pa (linear hardening). */
  plasticModulus: number;
}

/** Copper wire. E and the yield stress are handbook values; the hardening
 *  slope describes the first percent or so of plastic flow. */
export const COPPER: Material = { name: 'copper', E: 117e9, yieldStress: 70e6, plasticModulus: 2e9 };
export const STEEL: Material = { name: 'steel', E: 200e9, yieldStress: 250e6, plasticModulus: 2e9 };

/** Cross-section of a round wire of diameter d, m². */
export const wireArea = (d: number): number => (Math.PI * d * d) / 4;
/** Force per area, Pa. */
export const stress = (F: number, A: number): number => F / A;
/** Fractional stretch. */
export const strain = (dL: number, L: number): number => dL / L;
/** Hooke's law for a rod: ΔL = F L / (A E). */
export const hookeExtension = (F: number, L: number, A: number, E: number): number => (F * L) / (A * E);

/** The load at which a wire of diameter d reaches its elastic limit, N. */
export const yieldLoad = (m: Material, d: number): number => m.yieldStress * wireArea(d);

/** What the wire remembers: how much permanent stretch it has taken. */
export interface WireState {
  plasticStrain: number;
  /** Largest stress it has carried, Pa. */
  peakStress: number;
}

export const newWire = (): WireState => ({ plasticStrain: 0, peakStress: 0 });

/** Put the wire under tensile `sigma` (Pa, ≥ 0). Returns its total strain and
 *  updates what it remembers. Below its current limit it is a spring; past it,
 *  it flows until the hardened limit matches the stress. */
export function loadWire(s: WireState, m: Material, sigma: number): number {
  const need = (sigma - m.yieldStress) / m.plasticModulus;
  if (need > s.plasticStrain) s.plasticStrain = need;
  if (sigma > s.peakStress) s.peakStress = sigma;
  return s.plasticStrain + sigma / m.E;
}

export interface Wire {
  /** m */
  length: number;
  /** m */
  diameter: number;
  material: Material;
}

export interface WireReading {
  /** m */
  extension: number;
  /** Pa */
  stress: number;
  strain: number;
  /** m of stretch that would stay if the load came off now. */
  permanent: number;
}

/** Pull a wire with F newtons and read it. Mutates `s`. */
export function pullWire(s: WireState, w: Wire, F: number): WireReading {
  const sig = stress(Math.max(0, F), wireArea(w.diameter));
  const eps = loadWire(s, w.material, sig);
  return { extension: eps * w.length, stress: sig, strain: eps, permanent: s.plasticStrain * w.length };
}
