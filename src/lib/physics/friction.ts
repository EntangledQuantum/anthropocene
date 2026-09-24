/** Friction as a force that responds — Chapter 5, "Friction answers back".
 *
 *  Static friction has no formula of its own. It is whatever the surface must
 *  supply to stop the slipping, up to a ceiling μ_s N, and past that ceiling a
 *  second, different model takes over: kinetic friction, a fixed μ_k N against
 *  the sliding. Both models already live in `solveContact` (dynamics.ts); this
 *  file only drives a block ALONG a surface with them, one number of position
 *  and one of velocity, so a scene can run it and a test can pin it.
 *
 *  The one thing added here is the stop. Kinetic friction that brings a block
 *  to rest would, integrated naively, overshoot zero and flip sign every step,
 *  so the block would chatter forever and never stick. A step that crosses
 *  zero speed ends at rest instead, and the next step asks static friction
 *  whether it can hold.
 */

import { G_EARTH, solveContact, surfaceComponents, surfaceTangent, type Body, type Force, type Surface } from './dynamics.ts';
import { scale2 } from './vectors.ts';

/** A block on a surface, described along the surface: uphill (or rightward) positive. */
export interface SlideState {
  /** metres along the surface */
  s: number;
  /** m/s along the surface */
  v: number;
}

export interface BlockReading {
  /** Normal force, newtons. */
  normal: number;
  /** Friction along the surface, newtons, uphill positive. */
  friction: number;
  /** Most static friction can give here: μ_s N. */
  ceiling: number;
  /** Every other force's component along the surface (gravity + pull), newtons. */
  drive: number;
  /** Acceleration along the surface, m/s². Zero while stuck. */
  accel: number;
  stuck: boolean;
}

/** Solve the contact for a block of `mass` on `surface`, pulled along the
 *  surface with `pull` newtons (uphill positive), moving at `v`. */
export function readBlock(mass: number, surface: Surface, pull: number, v: number, g = G_EARTH): BlockReading {
  const t = surfaceTangent(surface);
  const body: Body = { id: 'block', label: 'block', mass, pos: [0, 0], vel: scale2(t, v), size: 0.25 };
  const forces: Force[] = [
    { id: 'w', on: 'block', by: 'Earth', kind: 'gravity', vec: [0, -mass * g] },
    { id: 'pull', on: 'block', by: 'you', kind: 'applied', vec: scale2(t, pull) },
  ];
  const sol = solveContact(body, forces, surface);
  const drive = surfaceComponents([0, -mass * g], surface).along + pull;
  const accel = sol.stuck ? 0 : (drive + sol.frictionTangential) / mass;
  return {
    normal: sol.normalMag,
    friction: sol.frictionTangential,
    ceiling: surface.muS * sol.normalMag,
    drive,
    accel,
    stuck: sol.stuck,
  };
}

/** Advance the block by `dt`. Returns the reading the step used. */
export function slideStep(state: SlideState, mass: number, surface: Surface, pull: number, dt: number, g = G_EARTH): BlockReading {
  const r = readBlock(mass, surface, pull, state.v, g);
  if (r.stuck) {
    state.v = 0;
    return r;
  }
  const v1 = state.v + r.accel * dt;
  if (state.v !== 0 && Math.sign(v1) !== Math.sign(state.v)) {
    // Kinetic friction brought it to rest inside this step. Stop there; static
    // friction gets the next word.
    const tStop = -state.v / r.accel;
    state.s += state.v * tStop + 0.5 * r.accel * tStop * tStop;
    state.v = 0;
    return r;
  }
  state.s += state.v * dt + 0.5 * r.accel * dt * dt;
  state.v = v1;
  return r;
}

/** The steepest ramp a block can rest on: tan θ = μ_s. No mass anywhere. */
export const slipAngle = (muS: number): number => Math.atan(muS);

/** The ramp angle at which an already-sliding block neither speeds up nor
 *  slows down: tan θ = μ_k. Lower than the slip angle whenever μ_k < μ_s. */
export const glideAngle = (muK: number): number => Math.atan(muK);

/** A level surface. */
export const level = (muS: number, muK: number): Surface => ({ angleRad: 0, muS, muK });

/** A ramp at `deg` degrees. */
export const ramp = (deg: number, muS: number, muK: number): Surface => ({ angleRad: (deg * Math.PI) / 180, muS, muK });

/** A crate riding in a truck bed that accelerates at `a`. In the ground frame
 *  the crate must accelerate forward with the truck, and the only horizontal
 *  force on it is friction from the bed: so friction points FORWARD, along the
 *  motion, and it holds only while m·a ≤ μ_s m g. */
export function crateInTruck(mass: number, a: number, muS: number, g = G_EARTH): { friction: number; ceiling: number; holds: boolean } {
  const friction = mass * a;
  const ceiling = muS * mass * g;
  return { friction, ceiling, holds: Math.abs(friction) <= ceiling };
}
