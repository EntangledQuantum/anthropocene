/** Chapter 28: the sources of the magnetic field.
 *
 *  Two worlds, both honest:
 *
 *  ── 2D: long straight wires seen end-on ──────────────────────────────────
 *  A long straight wire's field has no component along the wire and does not
 *  change along it, so a slice across the wires is the whole story. Current
 *  I > 0 comes OUT of the page (+z, drawn as a dot), I < 0 goes in (a cross).
 *  B = μ₀ I / 2πr, circling counterclockwise round a wire whose current comes
 *  out of the page. A wire may have a radius a; inside it the current is
 *  spread evenly, so the field there grows as r (the enclosed current does).
 *
 *  ── 3D: Biot–Savart by numerical integration ─────────────────────────────
 *  Any wire is a polyline. Each short piece dl contributes
 *      dB = (μ₀ / 4π) I dl × r / |r|³
 *  evaluated at the piece's midpoint, and the pieces are summed. Rings,
 *  helices and finite straight wires are all built this way; nothing is
 *  special-cased. A closed-form ring field (complete elliptic integrals)
 *  exists only to check the numerical one.
 *
 *  Coil axes run along x, so a side section of a coil is the x–y plane and
 *  a ring at x = x₀ with I > 0 comes out of the page at its top (y = +R) and
 *  goes in at its bottom: the field inside it points +x.
 *
 *  __tests__/biot.test.ts pins every claim the chapter makes:
 *    - a long straight wire: B = μ₀I/2πr, circling by the right-hand grip, and
 *      a numerically integrated long wire agrees;
 *    - parallel currents attract, antiparallel repel, F/L = μ₀I₁I₂/2πd, and
 *      1 A in wires 1 m apart gives 2×10⁻⁷ N/m;
 *    - ∮B·dl round any loop (circle, square, ellipse, star, off-centre) is
 *      μ₀ × the current it encloses, zero for current outside, negative when
 *      walked clockwise; and it holds in 3D for a loop threading a ring;
 *    - a long solenoid's interior field is μ₀nI, independent of its radius,
 *      uniform to a few percent across its middle, nearly zero outside, and
 *      half as strong at its mouth;
 *    - two coaxial coils wound oppositely cancel in the core when n₁I₁ = n₂I₂,
 *      whatever their radii, and leave μ₀n₂I₂ between them;
 *    - two beams of bare charge repel: the electric push beats the magnetic
 *      pull by c²/v².
 */

import { cross, type V3 } from './magnetism.ts';

/** Permeability of free space, T·m/A. */
export const MU0 = 4e-7 * Math.PI;
/** Speed of light, m/s. */
export const C_LIGHT = 299_792_458;
/** Permittivity of free space, F/m, from μ₀ε₀c² = 1. */
export const EPS0 = 1 / (MU0 * C_LIGHT * C_LIGHT);

/* ── 2D: long straight wires ──────────────────────────────────────────── */

/** A long straight wire crossing the page at (x, y), m. I in A, + out of the
 *  page. `a`, if given, is the wire's radius in m. */
export interface Wire { x: number; y: number; I: number; a?: number }

/** Field strength a distance r from a long straight wire, T. */
export const wireFieldMagnitude = (I: number, r: number) => (MU0 * Math.abs(I)) / (2 * Math.PI * r);

/** The field of a set of long wires at (x, y), T. Counterclockwise round a
 *  wire whose current comes out of the page (ẑ × r̂). */
export function wireField(wires: readonly Wire[], x: number, y: number): [number, number] {
  let bx = 0, by = 0;
  for (const w of wires) {
    const dx = x - w.x, dy = y - w.y;
    const r2 = dx * dx + dy * dy;
    const a = w.a ?? 0;
    // outside: μ₀I/2πr along φ̂, i.e. μ₀I/2π × (−dy, dx)/r²; inside: the
    // enclosed share (r/a)² of the current, which is μ₀I/2π × (−dy, dx)/a².
    const d = Math.max(r2, a * a);
    if (d === 0) continue;
    const k = (MU0 * w.I) / (2 * Math.PI * d);
    bx += -dy * k;
    by += dx * k;
  }
  return [bx, by];
}

/** Force per metre on wire `i` from all the others, N/m: I ẑ × B. */
export function forcePerLength(wires: readonly Wire[], i: number): [number, number] {
  const others = wires.filter((_, j) => j !== i);
  const [bx, by] = wireField(others, wires[i].x, wires[i].y);
  const I = wires[i].I;
  // ẑ × (bx, by, 0) = (−by, bx, 0)
  return [-by * I, bx * I];
}

/** Size of the push or pull between two long parallel wires d apart, N/m.
 *  Positive means they attract (currents the same way). */
export const parallelForcePerLength = (I1: number, I2: number, d: number) =>
  (MU0 * I1 * I2) / (2 * Math.PI * d);

/** A closed loop in the page, as its corner points in m. The last point joins
 *  back to the first. */
export type Loop2 = readonly (readonly [number, number])[];

/** ∮ B·dl round a closed loop in the page, T·m, integrated numerically: each
 *  edge is cut into pieces no longer than a twentieth of the distance to the
 *  nearest wire, and B·dl is summed at each piece's midpoint. */
export function circulation(wires: readonly Wire[], loop: Loop2, fine = 20): number {
  let sum = 0;
  const n = loop.length;
  for (let k = 0; k < n; k++) {
    const [x0, y0] = loop[k];
    const [x1, y1] = loop[(k + 1) % n];
    const L = Math.hypot(x1 - x0, y1 - y0);
    if (L === 0) continue;
    let near = Infinity;
    for (const w of wires) near = Math.min(near, Math.max(segmentDistance(w.x, w.y, x0, y0, x1, y1), w.a ?? 0, 1e-6));
    const pieces = Math.min(20000, Math.max(1, Math.ceil((L * fine) / near)));
    const dx = (x1 - x0) / pieces, dy = (y1 - y0) / pieces;
    for (let j = 0; j < pieces; j++) {
      const [bx, by] = wireField(wires, x0 + (j + 0.5) * dx, y0 + (j + 0.5) * dy);
      sum += bx * dx + by * dy;
    }
  }
  return sum;
}

function segmentDistance(px: number, py: number, x0: number, y0: number, x1: number, y1: number): number {
  const vx = x1 - x0, vy = y1 - y0;
  const t = Math.max(0, Math.min(1, ((px - x0) * vx + (py - y0) * vy) / (vx * vx + vy * vy || 1)));
  return Math.hypot(px - (x0 + t * vx), py - (y0 + t * vy));
}

/** How many times a loop winds counterclockwise round a point. */
export function windingNumber(loop: Loop2, x: number, y: number): number {
  let turn = 0;
  const n = loop.length;
  for (let k = 0; k < n; k++) {
    const a = Math.atan2(loop[k][1] - y, loop[k][0] - x);
    const b = Math.atan2(loop[(k + 1) % n][1] - y, loop[(k + 1) % n][0] - x);
    let d = b - a;
    if (d > Math.PI) d -= 2 * Math.PI;
    if (d < -Math.PI) d += 2 * Math.PI;
    turn += d;
  }
  return Math.round(turn / (2 * Math.PI));
}

/** Current threading a loop, counted with its winding (thin wires), A. */
export function enclosedCurrent(wires: readonly Wire[], loop: Loop2): number {
  return wires.reduce((s, w) => s + w.I * windingNumber(loop, w.x, w.y), 0);
}

/** Loops for the tests and the lessons. All counterclockwise. */
export function circleLoop(cx: number, cy: number, r: number, n = 256): Loop2 {
  return Array.from({ length: n }, (_, k) => [cx + r * Math.cos((2 * Math.PI * k) / n), cy + r * Math.sin((2 * Math.PI * k) / n)] as const);
}
export function ellipseLoop(cx: number, cy: number, a: number, b: number, n = 256): Loop2 {
  return Array.from({ length: n }, (_, k) => [cx + a * Math.cos((2 * Math.PI * k) / n), cy + b * Math.sin((2 * Math.PI * k) / n)] as const);
}
export function starLoop(cx: number, cy: number, rOut: number, rIn: number, points = 5): Loop2 {
  return Array.from({ length: 2 * points }, (_, k) => {
    const r = k % 2 === 0 ? rOut : rIn;
    const t = (Math.PI * k) / points + Math.PI / 2;
    return [cx + r * Math.cos(t), cy + r * Math.sin(t)] as const;
  });
}

/* ── 3D: Biot–Savart, numerically ─────────────────────────────────────── */

/** A wire as a list of points in m, carrying I amperes from first to last. */
export interface Path3 { pts: readonly V3[]; I: number; closed?: boolean }

/** The field of one or more wires at p, T: the Biot–Savart sum over every
 *  short straight piece, each evaluated at its midpoint. */
export function biotSavart(paths: readonly Path3[], p: V3): V3 {
  let bx = 0, by = 0, bz = 0;
  for (const path of paths) {
    const { pts, I } = path;
    const n = path.closed ? pts.length : pts.length - 1;
    const k = (MU0 * I) / (4 * Math.PI);
    for (let i = 0; i < n; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      const dl: V3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
      const r: V3 = [p[0] - (a[0] + b[0]) / 2, p[1] - (a[1] + b[1]) / 2, p[2] - (a[2] + b[2]) / 2];
      const r2 = r[0] * r[0] + r[1] * r[1] + r[2] * r[2];
      if (r2 === 0) continue;
      const c = cross(dl, r);
      const f = k / (r2 * Math.sqrt(r2));
      bx += c[0] * f; by += c[1] * f; bz += c[2] * f;
    }
  }
  return [bx, by, bz];
}

/** A straight wire from a to b cut into n pieces. */
export function straightPath(a: V3, b: V3, I: number, n = 2000): Path3 {
  const pts = Array.from({ length: n + 1 }, (_, i) => {
    const t = i / n;
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t] as V3;
  });
  return { pts, I };
}

/** A ring of radius R round the x axis at x = x0. I > 0 comes out of the page
 *  (+z) at its top, so the field in its middle points +x. */
export function ringPath(x0: number, R: number, I: number, n = 96): Path3 {
  const pts = Array.from({ length: n }, (_, i) => {
    const t = (2 * Math.PI * i) / n;
    return [x0, R * Math.cos(t), R * Math.sin(t)] as V3;
  });
  return { pts, I, closed: true };
}

/** A helical solenoid round the x axis, centred on the origin: `turns` turns
 *  over `length`, radius R, same sense as `ringPath`. */
export function helixPath(R: number, length: number, turns: number, I: number, perTurn = 48): Path3 {
  const n = Math.round(turns * perTurn);
  const pts = Array.from({ length: n + 1 }, (_, i) => {
    const t = (2 * Math.PI * i) / perTurn;
    return [-length / 2 + (length * i) / n, R * Math.cos(t), R * Math.sin(t)] as V3;
  });
  return { pts, I };
}

/** A coil as evenly spaced rings: N turns over `length`, centred on x = cx. */
export function coilRings(N: number, length: number, R: number, I: number, cx = 0, perTurn = 48): Path3[] {
  return Array.from({ length: N }, (_, k) => ringPath(cx - length / 2 + ((k + 0.5) * length) / N, R, I, perTurn));
}

/** x positions of a coil's turns, m, as `coilRings` places them. */
export const turnPositions = (N: number, length: number, cx = 0) =>
  Array.from({ length: N }, (_, k) => cx - length / 2 + ((k + 0.5) * length) / N);

/** What Ampère's law says an ideal long solenoid holds inside, T. */
export const idealSolenoidField = (n: number, I: number) => MU0 * n * I;

/** Turns per metre an ideal solenoid needs for field B at current I. */
export const turnsPerMetreFor = (B: number, I: number) => B / (MU0 * I);

/** A closed loop in 3D, for circulation checks. */
export function circulation3(paths: readonly Path3[], loop: readonly V3[], pieces = 40): number {
  let sum = 0;
  for (let k = 0; k < loop.length; k++) {
    const a = loop[k], b = loop[(k + 1) % loop.length];
    for (let j = 0; j < pieces; j++) {
      const t = (j + 0.5) / pieces;
      const p: V3 = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
      const B = biotSavart(paths, p);
      sum += (B[0] * (b[0] - a[0]) + B[1] * (b[1] - a[1]) + B[2] * (b[2] - a[2])) / pieces;
    }
  }
  return sum;
}

/* ── the closed-form ring, only to check the numerics ─────────────────── */

/** Complete elliptic integrals K(m), E(m), parameter m = k², by the AGM. */
export function ellipticKE(m: number): [number, number] {
  let a = 1, b = Math.sqrt(1 - m), c = Math.sqrt(m);
  let sum = 0.5 * c * c, pow = 0.5;
  for (let i = 0; i < 30 && Math.abs(c) > 1e-16; i++) {
    const an = (a + b) / 2;
    c = (a - b) / 2;
    b = Math.sqrt(a * b);
    a = an;
    pow *= 2;
    sum += pow * c * c;
  }
  const K = Math.PI / (2 * a);
  return [K, K * (1 - sum)];
}

/** Exact field of a ring of radius R at axial distance z and radius ρ from
 *  its axis: [B_axial, B_radial], T. */
export function ringFieldExact(R: number, I: number, rho: number, z: number): [number, number] {
  const s = (R + rho) ** 2 + z * z;
  const q = (R - rho) ** 2 + z * z;
  const [K, E] = ellipticKE((4 * R * rho) / s);
  const k = (MU0 * I) / (2 * Math.PI * Math.sqrt(s));
  const Bz = k * (K + ((R * R - rho * rho - z * z) / q) * E);
  const Br = rho === 0 ? 0 : ((k * z) / rho) * (-K + ((R * R + rho * rho + z * z) / q) * E);
  return [Bz, Br];
}

/* ── beams: charges without the metal ─────────────────────────────────── */

/** Two parallel beams carrying current I each, charge per metre λ = I / v,
 *  d apart. Returns the electric push and the magnetic pull, N/m. */
export function beamForces(I: number, v: number, d: number): { electric: number; magnetic: number } {
  const lambda = I / v;
  return {
    electric: (lambda * lambda) / (2 * Math.PI * EPS0 * d),
    magnetic: parallelForcePerLength(I, I, d),
  };
}

/* ── words for scenes ─────────────────────────────────────────────────── */

/** Eight-way direction word for an in-page vector. */
export function directionWord(v: readonly [number, number]): string {
  const deg = (Math.atan2(v[1], v[0]) * 180) / Math.PI;
  const names = ['right', 'up-right', 'up', 'up-left', 'left', 'down-left', 'down', 'down-right'];
  return names[((Math.round(deg / 45) % 8) + 8) % 8];
}

/** A value in tesla (or T·m, N/m…) with an SI prefix, e.g. "12.0 µT". */
export function siUnit(v: number, unit: string, digits = 3): string {
  const a = Math.abs(v);
  const pre: [number, string][] = [[1, ''], [1e-3, 'm'], [1e-6, 'µ'], [1e-9, 'n']];
  const [f, p] = pre.find(([f]) => a >= f * 0.9995) ?? [1e-9, 'n'];
  const x = v / f, ax = Math.abs(x);
  const dec = Math.max(0, digits - (ax >= 100 ? 3 : ax >= 10 ? 2 : 1));
  return `${x.toFixed(dec).replace('-', '−')} ${p}${unit}`;
}
