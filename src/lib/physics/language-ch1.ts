/** Chapter 1, the focused rewrite: the small pieces of physics its scenes
 *  print, written to be read. Dimensions and vectors themselves live in
 *  `dimensions.ts` and `vectors.ts`; this file only composes them into the
 *  exact questions the scenes pose.
 *
 *    swingPendulum     two bobs of different mass on the same string
 *    beamTilts         the three-beam dimension scale (M, L, T)
 *    applyCards        a conversion as a product of flippable cards worth 1
 *    gridReading       an arrow's components on a grid turned by θ
 *    railShare         how much of a push a rail keeps
 */
import {
  balance, dimSymbol, QUANTITY_TABLE, UNITS, type Dimension, type Term,
} from './dimensions.ts';
import { add2, along, componentsIn, decompose, mag2, rotate2, scale2, type Vec2 } from './vectors.ts';

/* ── the pendulum: mass appears, then cancels ──────────────────────────────
   Torque about the pivot is −m g L sin θ and the moment of inertia is m L², so
   α = τ / I. The mass is written in both on purpose: it cancels in the
   division, which is the physical reason two bobs keep step.
   ──────────────────────────────────────────────────────────────────────── */

export interface Swing {
  /** Angle from straight down, radians. */
  theta: number;
  /** Angular velocity, rad/s. */
  omega: number;
  t: number;
}

export interface PendulumSpec { L: number; g: number; m: number }

export const pendulumTorque = (theta: number, p: PendulumSpec): number => -p.m * p.g * p.L * Math.sin(theta);
export const pendulumInertia = (p: PendulumSpec): number => p.m * p.L * p.L;
export const pendulumAlpha = (theta: number, p: PendulumSpec): number => pendulumTorque(theta, p) / pendulumInertia(p);

/** One velocity-Verlet step. Symplectic, so the swing neither grows nor dies
 *  over the minutes a learner watches it. */
export function swingPendulum(s: Swing, p: PendulumSpec, dt: number): Swing {
  const a0 = pendulumAlpha(s.theta, p);
  const theta = s.theta + s.omega * dt + 0.5 * a0 * dt * dt;
  const a1 = pendulumAlpha(theta, p);
  return { theta, omega: s.omega + 0.5 * (a0 + a1) * dt, t: s.t + dt };
}

/** Run from rest at `theta0` and return the times at which the bob passes
 *  through the bottom moving in the same direction as it first does: one
 *  entry per full period. */
export function measurePeriods(theta0: number, p: PendulumSpec, tEnd: number, dt = 1e-4): number[] {
  let s: Swing = { theta: theta0, omega: 0, t: 0 };
  const crossings: number[] = [];
  while (s.t < tEnd) {
    const next = swingPendulum(s, p, dt);
    if (s.theta > 0 && next.theta <= 0) {
      const f = s.theta / (s.theta - next.theta);
      crossings.push(s.t + f * dt);
    }
    s = next;
  }
  return crossings.slice(1).map((t, i) => t - crossings[i]);
}

/* ── the dimension scale ───────────────────────────────────────────────────
   One beam per base dimension that the mechanics palette uses. A beam is
   level when both sides carry the same exponent of that dimension; its tilt
   is the difference.
   ──────────────────────────────────────────────────────────────────────── */

export const SCALE_BEAMS = [
  { index: 0, symbol: 'M', name: 'mass' },
  { index: 1, symbol: 'L', name: 'length' },
  { index: 2, symbol: 'T', name: 'time' },
] as const;

export interface BeamReading {
  symbol: string;
  name: string;
  left: number;
  right: number;
  /** left − right: positive means the left pan is heavier. */
  tilt: number;
  level: boolean;
}

export interface ScaleReading {
  beams: BeamReading[];
  balanced: boolean;
  left: Dimension;
  right: Dimension;
  leftSymbol: string;
  rightSymbol: string;
}

export function beamTilts(left: readonly Term[], right: readonly Term[]): ScaleReading {
  const r = balance(left, right, QUANTITY_TABLE);
  const beams = SCALE_BEAMS.map((b) => {
    const l = r.left[b.index], rr = r.right[b.index];
    return { symbol: b.symbol, name: b.name, left: l, right: rr, tilt: l - rr, level: Math.abs(l - rr) < 1e-9 };
  });
  return {
    beams, balanced: r.balanced, left: r.left, right: r.right,
    leftSymbol: dimSymbol(r.left), rightSymbol: dimSymbol(r.right),
  };
}

/* ── conversion cards ──────────────────────────────────────────────────────
   A card is an identity between two names for the same amount, written as a
   fraction: 1000 m over 1 km. Its value is exactly 1, whichever way up it is,
   so applying it can never change the quantity — only the units it is written
   in. Flipping it the wrong way is legal and useless: the symbol you wanted
   gone doubles instead of cancelling.
   ──────────────────────────────────────────────────────────────────────── */

export interface Card {
  /** e.g. { n: 1000, unit: 'm' } over { n: 1, unit: 'km' } */
  top: { n: number; unit: string };
  bottom: { n: number; unit: string };
}

export interface Written {
  value: number;
  /** Unit keys from UNITS with integer exponents. Zero entries are dropped. */
  units: Record<string, number>;
}

const cleaned = (u: Record<string, number>) =>
  Object.fromEntries(Object.entries(u).filter(([, e]) => e !== 0));

/** What a card is worth: its two sides measured in SI. Exactly 1 for a true identity. */
export function cardWorth(c: Card): number {
  return (c.top.n * UNITS[c.top.unit].toSI) / (c.bottom.n * UNITS[c.bottom.unit].toSI);
}

export function applyCards(start: Written, cards: readonly Card[], flipped: readonly boolean[]): Written {
  let value = start.value;
  const units = { ...start.units };
  cards.forEach((c, i) => {
    const up = flipped[i] ? c.bottom : c.top;
    const down = flipped[i] ? c.top : c.bottom;
    value *= up.n / down.n;
    units[up.unit] = (units[up.unit] ?? 0) + 1;
    units[down.unit] = (units[down.unit] ?? 0) - 1;
  });
  return { value, units: cleaned(units) };
}

/** The quantity's size in SI base units: invariant under every card. */
export function inSI(w: Written): number {
  return Object.entries(w.units).reduce((acc, [u, e]) => acc * UNITS[u].toSI ** e, w.value);
}

export function sameUnits(a: Record<string, number>, b: Record<string, number>): boolean {
  const ca = cleaned(a), cb = cleaned(b);
  const keys = new Set([...Object.keys(ca), ...Object.keys(cb)]);
  return [...keys].every((k) => (ca[k] ?? 0) === (cb[k] ?? 0));
}

const SUP = ['⁰', '¹', '²', '³', '⁴', '⁵', '⁶', '⁷', '⁸', '⁹'];
const sup = (e: number) => (e === 1 ? '' : (e < 0 ? '⁻' : '') + String(Math.abs(e)).split('').map((d) => SUP[+d]).join(''));

/** `km/h`, `m²·h/(km·s²)`: numerator over denominator, symbols from UNITS. */
export function unitLabel(units: Record<string, number>): string {
  const u = cleaned(units);
  const num = Object.entries(u).filter(([, e]) => e > 0).map(([k, e]) => UNITS[k].symbol + sup(e));
  const den = Object.entries(u).filter(([, e]) => e < 0).map(([k, e]) => UNITS[k].symbol + sup(-e));
  const top = num.length ? num.join('·') : '1';
  if (!den.length) return top;
  return `${top}/${den.length > 1 ? `(${den.join('·')})` : den[0]}`;
}

/* ── keeping pace ──────────────────────────────────────────────────────── */

/** Gap in metres that car B opens on car A after `t` seconds, both speeds
 *  converted to SI through the unit registry first. */
export function gapAfter(t: number, a: { value: number; unit: string }, b: { value: number; unit: string }): number {
  return (b.value * UNITS[b.unit].toSI - a.value * UNITS[a.unit].toSI) * t;
}

/* ── an arrow on a turned grid ─────────────────────────────────────────────
   The grid's unit arrows ê₁, ê₂ are the square grid's turned by θ. The
   components are what the arrow measures along them; the two legs, laid tip
   to tail, rebuild the arrow exactly.
   ──────────────────────────────────────────────────────────────────────── */

export interface GridReading {
  e1: Vec2;
  e2: Vec2;
  /** Components on this grid. */
  a1: number;
  a2: number;
  /** a1 ê₁ + a2 ê₂: equal to the arrow, always. */
  rebuilt: Vec2;
  length: number;
}

export function gridReading(a: Vec2, theta: number): GridReading {
  const e1 = rotate2([1, 0], theta);
  const e2 = rotate2([0, 1], theta);
  const [a1, a2] = componentsIn(a, theta);
  return { e1, e2, a1, a2, rebuilt: add2(scale2(e1, a1), scale2(e2, a2)), length: mag2(a) };
}

/* ── a push on a rail ──────────────────────────────────────────────────────
   The rail keeps only the part of the push that lies along it — the dot
   product of the push with the rail's unit arrow. The rest presses sideways
   into the rail, which pushes straight back and moves nothing.
   ──────────────────────────────────────────────────────────────────────── */

export interface RailShare {
  /** Signed: negative means the cart is driven backwards. */
  along: number;
  alongVec: Vec2;
  sideways: Vec2;
  /** along / mass */
  accel: number;
}

export function railShare(push: Vec2, railAngle: number, mass: number): RailShare {
  const t: Vec2 = [Math.cos(railAngle), Math.sin(railAngle)];
  const { parallel, perpendicular } = decompose(push, t);
  const a = along(push, t);
  return { along: a, alongVec: parallel, sideways: perpendicular, accel: a / mass };
}
