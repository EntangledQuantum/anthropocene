/** Chapter 23: electric potential, a height map for charge.
 *
 *  A thin layer over `fields.ts` in SI units (metres, coulombs, volts, joules),
 *  with every source a 3D point charge ('point' model, 1/r², V = kq/r). The
 *  scenes work in centimetres and nanocoulombs and convert with `sceneToSI`.
 *
 *  potential-ch23.test.ts pins every claim the chapter's lessons make:
 *    - the work the field does carrying a charge from A to B is the same along
 *      every path, q(V_A − V_B), found by integrating qE·dl numerically;
 *    - around any closed loop that work is zero;
 *    - E = −∇V, checked by differencing the potential;
 *    - the field crosses equipotentials at right angles, pointing downhill;
 *    - a charge falling from rest through ΔV gains −qΔV of kinetic energy,
 *      whatever the gap, checked by integrating the motion step by step;
 *    - an electron and a proton through the same voltage gain the same energy;
 *    - the strongest field is where the contours crowd, not where V is high;
 *    - V can be zero where E is not (dipole bisector), and E zero where V is not.
 */

import { fieldAt, potentialAt, type Source } from './fields.ts';
import type { Vec2 } from './vectors.ts';
import { K, NANO } from './charges-ch21.ts';

export { K, NANO };

/** Elementary charge, C. */
export const E_CHARGE = 1.602176634e-19;
/** Electron mass, kg. */
export const M_ELECTRON = 9.1093837015e-31;
/** Proton mass, kg. */
export const M_PROTON = 1.67262192369e-27;
/** One electron-volt, J. */
export const EV = E_CHARGE;

const CM = 0.01;
const OPTS = { k: K, soften: 1e-8 } as const;

export type Charge = Source;

/** A scene charge: position in cm, charge in nC. */
export interface SceneCharge { x: number; y: number; q: number }

export function sceneToSI(cs: readonly SceneCharge[]): Charge[] {
  return cs.map((c) => ({ x: c.x * CM, y: c.y * CM, q: c.q * NANO }));
}

/** Potential at (x, y), volts, zero at infinity. */
export function potential(charges: readonly Charge[], x: number, y: number): number {
  return potentialAt(charges, x, y, OPTS);
}

/** Electric field at (x, y), N/C (equivalently V/m). */
export function field(charges: readonly Charge[], x: number, y: number): Vec2 {
  return fieldAt(charges, x, y, OPTS);
}

export function fieldStrength(charges: readonly Charge[], x: number, y: number): number {
  const [ex, ey] = field(charges, x, y);
  return Math.hypot(ex, ey);
}

/** Potential energy of a charge q at (x, y), J. */
export function potentialEnergy(charges: readonly Charge[], q: number, x: number, y: number): number {
  return q * potential(charges, x, y);
}

/** The work the field does on a charge q carried along a polyline, J.
 *
 *  A genuine line integral of qE·dl: each segment is cut into pieces no longer
 *  than `maxStep` and integrated by Simpson's rule. Nothing here knows about
 *  V, so the tests can hold the answer against q(V_A − V_B) honestly.
 */
export function workAlong(charges: readonly Charge[], q: number, path: readonly Vec2[], maxStep = 2e-4): number {
  let w = 0;
  for (let i = 1; i < path.length; i++) w += workOnSegment(charges, q, path[i - 1], path[i], maxStep);
  return w;
}

export function workOnSegment(charges: readonly Charge[], q: number, a: Vec2, b: Vec2, maxStep = 2e-4): number {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const L = Math.hypot(dx, dy);
  if (L === 0) return 0;
  const n = Math.max(1, Math.ceil(L / maxStep));
  const hx = dx / n, hy = dy / n;
  const edl = (t: number) => {
    const [ex, ey] = field(charges, a[0] + t * dx, a[1] + t * dy);
    return ex * hx + ey * hy;
  };
  let w = 0;
  for (let i = 0; i < n; i++) {
    const t0 = i / n, t1 = (i + 1) / n;
    w += (edl(t0) + 4 * edl((t0 + t1) / 2) + edl(t1)) / 6;
  }
  return q * w;
}

/** −∇V by central differences, V/m. Independent of `field`, so the two can be
 *  compared. */
export function minusGradV(charges: readonly Charge[], x: number, y: number, h = 1e-6): Vec2 {
  const gx = (potential(charges, x + h, y) - potential(charges, x - h, y)) / (2 * h);
  const gy = (potential(charges, x, y + h) - potential(charges, x, y - h)) / (2 * h);
  return [-gx, -gy];
}

/** Signed angle from vector a to vector b, degrees in (−180, 180]. */
export function angleBetween(a: Vec2, b: Vec2): number {
  const d = Math.atan2(a[0] * b[1] - a[1] * b[0], a[0] * b[0] + a[1] * b[1]);
  return (d * 180) / Math.PI;
}

/** Trace the equipotential through p0: step at right angles to the field, a
 *  fixed arc length at a time (RK4 on the normalised tangent), with a small
 *  Newton correction back onto V = V0 after each step. Stops when the curve
 *  closes on itself, leaves `bounds`, or runs out of steps. */
export function equipotentialThrough(
  charges: readonly Charge[],
  p0: Vec2,
  opts: { ds?: number; steps?: number; bounds?: { x0: number; y0: number; x1: number; y1: number } } = {},
): { points: Vec2[]; closed: boolean } {
  const { ds = 1e-3, steps = 4000, bounds } = opts;
  const V0 = potential(charges, p0[0], p0[1]);
  const tangent = (x: number, y: number): Vec2 => {
    const [ex, ey] = field(charges, x, y);
    const m = Math.hypot(ex, ey);
    return m === 0 ? [0, 0] : [-ey / m, ex / m];
  };
  const trace = (sign: 1 | -1) => {
    const pts: Vec2[] = [];
    let [x, y] = p0;
    for (let i = 0; i < steps; i++) {
      const t = (px: number, py: number): Vec2 => { const v = tangent(px, py); return [sign * v[0], sign * v[1]]; };
      const k1 = t(x, y);
      const k2 = t(x + (ds / 2) * k1[0], y + (ds / 2) * k1[1]);
      const k3 = t(x + (ds / 2) * k2[0], y + (ds / 2) * k2[1]);
      const k4 = t(x + ds * k3[0], y + ds * k3[1]);
      x += (ds / 6) * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]);
      y += (ds / 6) * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1]);
      // pull back onto the level set: move along E by (V − V0)/|E|
      const [ex, ey] = field(charges, x, y);
      const e2 = ex * ex + ey * ey;
      if (e2 > 0) {
        const dv = potential(charges, x, y) - V0;
        x += (dv * ex) / e2;
        y += (dv * ey) / e2;
      }
      pts.push([x, y]);
      if (i > 20 && Math.hypot(x - p0[0], y - p0[1]) < ds * 1.5) return { pts, closed: true };
      if (bounds && (x < bounds.x0 || x > bounds.x1 || y < bounds.y0 || y > bounds.y1)) break;
    }
    return { pts, closed: false };
  };
  const fwd = trace(1);
  if (fwd.closed) return { points: [p0, ...fwd.pts], closed: true };
  const back = trace(-1);
  return { points: [...back.pts.reverse(), p0, ...fwd.pts], closed: false };
}

/* ── charges falling through a voltage ─────────────────────────────────── */

/** Kinetic energy gained by charge q falling from rest through a change of
 *  potential ΔV = V_end − V_start, J. Negative means it cannot get there. */
export function kineticGain(q: number, dV: number): number {
  return -q * dV;
}

/** Speed on arrival, from rest, m/s: ½mv² = −qΔV. NaN when the charge would
 *  have to climb. */
export function speedAfter(q: number, m: number, dV: number): number {
  const k = kineticGain(q, dV);
  return k < 0 ? NaN : Math.sqrt((2 * k) / m);
}

/** The voltage an electron must be accelerated through, from rest, to reach
 *  speed v (non-relativistic), volts. */
export function voltageForSpeed(m: number, qMag: number, v: number): number {
  return (0.5 * m * v * v) / qMag;
}

/** Joules to electron-volts. */
export const toEV = (j: number) => j / EV;

/** Where a charge released from rest is, and how fast, a time t after leaving
 *  one plate of a uniform gap of width d across which it falls through |ΔV|.
 *  E = |ΔV|/d, a = |q|E/m. Clamped at the far plate. */
export function inGap(qMag: number, m: number, dVMag: number, d: number, t: number): { x: number; v: number; arrived: boolean } {
  const a = (qMag * dVMag) / (d * m);
  const x = 0.5 * a * t * t;
  if (x >= d) return { x: d, v: Math.sqrt(2 * a * d), arrived: true };
  return { x, v: a * t, arrived: false };
}

/** Time to cross the gap from rest, s. */
export function transitTime(qMag: number, m: number, dVMag: number, d: number): number {
  const a = (qMag * dVMag) / (d * m);
  return Math.sqrt((2 * d) / a);
}

/** Integrate a charge across a uniform gap with velocity Verlet, knowing only
 *  the force qE: no energy bookkeeping. Returns the arrival speed. */
export function integrateAcrossGap(qMag: number, m: number, dVMag: number, d: number, steps = 20000): number {
  const a = (qMag * dVMag) / (d * m);
  const dt = transitTime(qMag, m, dVMag, d) / steps;
  let x = 0, v = 0;
  while (x < d) {
    const xNew = x + v * dt + 0.5 * a * dt * dt;
    if (xNew >= d) {
      // finish the last partial step exactly at the plate
      const tHit = (-v + Math.sqrt(v * v + 2 * a * (d - x))) / a;
      return v + a * tHit;
    }
    x = xNew;
    v += a * dt;
  }
  return v;
}

/* ── where the field is strongest ──────────────────────────────────────── */

/** Point at parameter t ∈ [0, 1] along a straight track. */
export const along = (a: Vec2, b: Vec2, t: number): Vec2 => [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])];

/** Scan a straight track and report where the field is strongest and where the
 *  potential is highest, by parameter t. */
export function scanTrack(charges: readonly Charge[], a: Vec2, b: Vec2, n = 2000) {
  let eMax = -1, tE = 0, vMax = -Infinity, tV = 0;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const [x, y] = along(a, b, t);
    const e = fieldStrength(charges, x, y);
    const v = potential(charges, x, y);
    if (e > eMax) { eMax = e; tE = t; }
    if (v > vMax) { vMax = v; tV = t; }
  }
  return { eMax, tE, vMax, tV };
}
