/** Chapter 21: Coulomb's law, the electric field, and the dipole.
 *
 *  A thin layer over `fields.ts` in real SI units. Charges are in coulombs,
 *  positions in metres, forces in newtons and fields in N/C. Every source is a
 *  3D point charge ('point' model, 1/r²), because nothing in this chapter
 *  integrates flux; see the header of fields.ts for why that matters.
 *
 *  The scenes in chapter 21 print only numbers that come from here, and
 *  charges-ch21.test.ts pins every claim the lessons make:
 *    - the balance point between like charges sits at d / (1 + √(q2/q1));
 *    - between unlike charges there is none; it sits outside, beyond the smaller;
 *    - that balance is stable along the wire and unstable off it (Earnshaw);
 *    - touching identical spheres shares the total charge, which is conserved;
 *    - F/q at a place does not depend on the probe;
 *    - fields superpose;
 *    - a dipole's far field falls as 1/r³.
 */

import { fieldAt, type Source } from './fields.ts';
import type { Vec2 } from './vectors.ts';

/** Coulomb's constant, N·m²/C². */
export const K = 8.9875517923e9;
export const NANO = 1e-9;
export const MICRO = 1e-6;

/** Softening small enough to be invisible at any distance a scene can reach
 *  (a hundred-thousandth of a millimetre) but never a division by zero. */
const OPTS = { k: K, soften: 1e-8 } as const;

export type Charge = Source;

/** The electric field at (x, y), N/C: superposed Coulomb fields. */
export function eField(charges: readonly Charge[], x: number, y: number): Vec2 {
  return fieldAt(charges, x, y, OPTS);
}

/** The force on a charge q sitting at (x, y), N. It is q times the field the
 *  OTHER charges make there, which is why `charges` must not include it. */
export function forceOn(charges: readonly Charge[], q: number, x: number, y: number): Vec2 {
  const [ex, ey] = eField(charges, x, y);
  return [q * ex, q * ey];
}

/** The force one charge exerts on another, N: Coulomb's law. */
export function coulombForce(by: Charge, on: Charge): Vec2 {
  return forceOn([by], on.q, on.x, on.y);
}

/** Magnitude of Coulomb's law, N. */
export function coulombMagnitude(q1: number, q2: number, r: number): number {
  return (K * Math.abs(q1 * q2)) / (r * r);
}

/** Closed form: where a probe balances between two LIKE charges a distance d
 *  apart, measured from q1. Equal pushes need r1²/r2² = q1/q2. */
export function balanceBetween(q1: number, q2: number, d: number): number {
  return d / (1 + Math.sqrt(q2 / q1));
}

/** Closed form: for UNLIKE charges the balance point is on the far side of the
 *  smaller one (|q1| < |q2|), at this distance beyond q1. */
export function balanceOutside(q1: number, q2: number, d: number): number {
  const s = Math.sqrt(Math.abs(q2 / q1));
  return d / (s - 1);
}

/** The force along the line on a positive unit probe at x, for charges on the
 *  x axis. */
export function axialForce(charges: readonly Charge[], x: number): number {
  return eField(charges, x, 0)[0];
}

/** Every point on the axis where the axial force changes sign without passing
 *  through a charge: found by scanning and bisecting, not by the closed form,
 *  so the tests can hold the two against each other. */
export function nullsOnAxis(charges: readonly Charge[], x0: number, x1: number, n = 4000): number[] {
  const out: number[] = [];
  const dx = (x1 - x0) / n;
  const near = (x: number) => charges.some((c) => Math.abs(c.x - x) < 2 * dx);
  for (let i = 0; i < n; i++) {
    let a = x0 + i * dx;
    let b = a + dx;
    if (near(a) || near(b) || charges.some((c) => c.x > a && c.x < b)) continue;
    let fa = axialForce(charges, a);
    const fb = axialForce(charges, b);
    if (fa === 0) { out.push(a); continue; }
    if (fa * fb > 0) continue;
    for (let k = 0; k < 60; k++) {
      const m = (a + b) / 2;
      const fm = axialForce(charges, m);
      if (fa * fm <= 0) b = m;
      else { a = m; fa = fm; }
    }
    out.push((a + b) / 2);
  }
  return out;
}

/** Two identical conducting spheres touched together share their total charge
 *  equally. The total is conserved; the sign of each can flip. */
export function shareOnContact(qa: number, qb: number): [number, number] {
  const each = (qa + qb) / 2;
  return [each, each];
}

/** Where to put a small charge qs so that the field of a big charge Q (at the
 *  origin) and qs vanishes at P. The small charge must sit on the segment
 *  from Q to P, a fraction f of the way, when Q and qs have opposite signs:
 *  |Q| / L² = |qs| / ((1 - f) L)²  →  1 - f = √(|qs| / |Q|). */
export function cancelFraction(Q: number, qs: number): number {
  return 1 - Math.sqrt(Math.abs(qs / Q));
}

/** A dipole of charges ±q a distance s apart, centred at (cx, cy), pointing
 *  along +x (the + charge on the right). */
export function dipole(q: number, s: number, cx = 0, cy = 0): Charge[] {
  return [
    { x: cx + s / 2, y: cy, q },
    { x: cx - s / 2, y: cy, q: -q },
  ];
}

/** |E|, N/C. */
export function fieldMagnitude(charges: readonly Charge[], x: number, y: number): number {
  const [ex, ey] = eField(charges, x, y);
  return Math.hypot(ex, ey);
}

/** The local power law of |E| along a ray: -d ln|E| / d ln r, measured from
 *  two points. A point charge gives 2 and a dipole far away gives 3. */
export function falloffExponent(
  charges: readonly Charge[],
  dir: Vec2,
  r1: number,
  r2: number,
  from: Vec2 = [0, 0],
): number {
  const m = Math.hypot(dir[0], dir[1]);
  const u: Vec2 = [dir[0] / m, dir[1] / m];
  const e1 = fieldMagnitude(charges, from[0] + u[0] * r1, from[1] + u[1] * r1);
  const e2 = fieldMagnitude(charges, from[0] + u[0] * r2, from[1] + u[1] * r2);
  return -Math.log(e2 / e1) / Math.log(r2 / r1);
}

/** Compass words for a direction, for miss lines. */
export function directionWord(v: Vec2): string {
  const deg = (Math.atan2(v[1], v[0]) * 180) / Math.PI;
  const names = ['right', 'up-right', 'up', 'up-left', 'left', 'down-left', 'down', 'down-right'];
  return names[((Math.round(deg / 45) % 8) + 8) % 8];
}

/** Engineering format with an SI prefix: 0.00123 N → "1.2 mN". */
export function si(v: number, unit: string, digits = 2): string {
  const a = Math.abs(v);
  if (a === 0) return `0 ${unit}`;
  const steps: [number, string][] = [[1e9, 'G'], [1e6, 'M'], [1e3, 'k'], [1, ''], [1e-3, 'm'], [1e-6, 'µ'], [1e-9, 'n']];
  const [scale, p] = steps.find(([s]) => a >= s * 0.9995) ?? [1e-9, 'n'];
  const n = v / scale;
  const shown = Math.abs(n) >= 100 ? n.toFixed(0) : Math.abs(n) >= 10 ? n.toFixed(Math.max(0, digits - 2)) : n.toFixed(digits - 1);
  return `${shown} ${p}${unit}`;
}

const SUP: Record<string, string> = { '-': '⁻', '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹' };

/** Scientific format: 7.99e5 → "8.0 × 10⁵ N/C". */
export function sci(v: number, unit: string, digits = 2): string {
  if (v === 0) return `0 ${unit}`;
  let e = Math.floor(Math.log10(Math.abs(v)));
  let m = +(v / 10 ** e).toFixed(digits - 1);
  if (Math.abs(m) >= 10) { m /= 10; e += 1; }
  const exp = `${e}`.split('').map((c) => SUP[c]).join('');
  return `${m.toFixed(digits - 1)} × 10${exp} ${unit}`;
}

/** Millinewtons to two decimals, the unit every chapter 21 bead force is read in. */
export const mN = (f: number) => `${(f * 1000).toFixed(2)} mN`;
