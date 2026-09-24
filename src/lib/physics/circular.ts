/** Circles are Newton plus geometry — Chapter 5, "Nothing is called centripetal".
 *
 *  There is no centripetal force in this file. There is a required inward
 *  acceleration, v²/R (from `kinematics.ts`), and there are real forces —
 *  gravity, the push of a bucket's bottom, the normal force and friction of a
 *  road — and the second law says their inward components must add to m v²/R.
 *  Whichever real forces point inward do the job. "Centripetal" names the job.
 *
 *  Two worlds:
 *    · a bucket of water carried round a vertical circle at a steady speed
 *      (an arm or a wheel does the carrying, so the speed really is constant);
 *    · a car on a banked bend, seen from behind, the centre of the bend to the left.
 */

import { G_EARTH, surfaceComponents, type Surface } from './dynamics.ts';
import { centripetal } from './kinematics.ts';
import type { Vec2 } from './vectors.ts';

/* ── the bucket ───────────────────────────────────────────────────────────── */

/** Push of the bucket's bottom on the water, newtons, toward the centre.
 *
 *  `phi` is the angle from the TOP of the circle. Gravity's inward component
 *  there is g cos φ: all of g at the top, none at the sides, outward at the
 *  bottom. The bottom supplies whatever the turn still needs:
 *      N = m (v²/R − g cos φ).
 *  Returned signed. A negative value is the bucket being asked to PULL the
 *  water, which it cannot do: that is the water leaving. */
export function bucketPush(mass: number, v: number, R: number, phi: number, g = G_EARTH): number {
  return mass * (centripetal(v, R) - g * Math.cos(phi));
}

/** The bucket's WHOLE push on the water as a vector, at standard angle ψ:
 *  whatever, added to the weight, makes m·a (v²/R toward the centre). Its
 *  inward component is `bucketPush`; the rest is the side walls keeping the
 *  speed steady against gravity's pull along the path. */
export function bucketForce(mass: number, v: number, R: number, psi: number, g = G_EARTH): Vec2 {
  const a = centripetal(v, R);
  return [-mass * a * Math.cos(psi), -mass * a * Math.sin(psi) + mass * g];
}

/** The slowest steady speed at which the water stays in: at the top N = m(v²/R − g) ≥ 0.
 *  The mass cancels. */
export const minTopSpeed = (R: number, g = G_EARTH): number => Math.sqrt(g * R);

/** How far before the top (radians, measured from the top) the water leaves,
 *  or null if it never does. N first reaches zero where cos φ = v² / (gR). */
export function releaseBeforeTop(v: number, R: number, g = G_EARTH): number | null {
  const c = (v * v) / (g * R);
  return c >= 1 ? null : Math.acos(c);
}

/** Position on the circle for the standard angle ψ (from +x, counter-clockwise). */
export const onCircle = (R: number, psi: number): Vec2 => [R * Math.cos(psi), R * Math.sin(psi)];

/** Velocity of a point going counter-clockwise at speed v, at angle ψ. */
export const tangentVelocity = (v: number, psi: number): Vec2 => [-v * Math.sin(psi), v * Math.cos(psi)];

/** Free flight under gravity alone: what the water does once nothing pushes it. */
export function ballistic(p0: Vec2, v0: Vec2, t: number, g = G_EARTH): Vec2 {
  return [p0[0] + v0[0] * t, p0[1] + v0[1] * t - 0.5 * g * t * t];
}

export interface SwingRun {
  /** Standard angle ψ at which the water left, or null if it stayed in. */
  releasePsi: number | null;
  /** Water's distance from the centre at fixed times after release (empty if none). */
  waterRadius: number[];
}

/** Carry the bucket counter-clockwise from the bottom for `turns` turns at
 *  steady speed v, checking the bucket's push every step. */
export function swingOnce(v: number, R: number, turns = 1, dt = 1 / 2000, g = G_EARTH): SwingRun {
  const omega = v / R;
  let psi = -Math.PI / 2;
  const end = psi + turns * 2 * Math.PI;
  while (psi < end) {
    const phiFromTop = psi - Math.PI / 2;
    if (bucketPush(1, v, R, phiFromTop, g) < 0) {
      const p0 = onCircle(R, psi), v0 = tangentVelocity(v, psi);
      const waterRadius: number[] = [];
      for (let k = 1; k <= 20; k++) {
        const p = ballistic(p0, v0, k * 0.02, g);
        waterRadius.push(Math.hypot(p[0], p[1]));
      }
      return { releasePsi: psi, waterRadius };
    }
    psi += omega * dt;
  }
  return { releasePsi: null, waterRadius: [] };
}

/* ── the banked bend ──────────────────────────────────────────────────────── */

/** What the road must supply to a car of `mass` going round a bend of radius
 *  R at speed v, on a road banked at θ (outer edge high), centre to the left.
 *
 *  The car's acceleration is v²/R toward the centre, so the road's total push
 *  must be m·a minus gravity. Split that along and across the road
 *  (`surfaceComponents`): across is the normal force, along is the friction
 *  the tyres must grip with. Positive friction points UP the slope, away from
 *  the centre; negative points down the slope, toward it. */
export function bankedRoad(mass: number, v: number, R: number, thetaRad: number, g = G_EARTH): { normal: number; friction: number; accel: number } {
  const accel = centripetal(v, R);
  const road: Surface = { angleRad: thetaRad, muS: 0, muK: 0 };
  const contact: Vec2 = [-mass * accel, mass * g];
  const { along, into } = surfaceComponents(contact, road);
  return { normal: into, friction: along, accel };
}

/** The bank at which the road needs no friction at all: tan θ = v² / (gR). */
export const idealBank = (v: number, R: number, g = G_EARTH): number => Math.atan((v * v) / (g * R));
