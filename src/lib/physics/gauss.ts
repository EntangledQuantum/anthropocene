/** Chapter 22: Gauss's law, drawn on the one flat geometry where it is honest.
 *
 *  ── Why rods, and never point charges in a plane ──────────────────────────
 *
 *  Every scene in this chapter shows long straight RODS of charge seen end-on
 *  (the 'line' model of fields.ts: E = λ / 2πε₀r, falling as 1/r). A closed
 *  loop drawn around them is the cross-section of a closed SLEEVE, 1 m long,
 *  whose end caps catch no flux because the field runs along them. So
 *  ∮ E·n̂ dl around the loop, times 1 m, is the true flux through a closed
 *  surface, and Gauss's law holds for it exactly: λ_enc · 1 m / ε₀.
 *
 *  Draw 1/r² point charges in the plane instead and integrate around a circle,
 *  and the "flux" halves every time the circle doubles: the exact opposite of
 *  the lesson. fields.ts pins that trap; gauss.test.ts pins it again here.
 *  A 3D sphere is handled separately and properly, by `sphereShellField`.
 *
 *  Units are SI throughout: metres, C/m for a rod's charge per length, N/C for
 *  the field, and N·m²/C for the flux through 1 m of sleeve.
 *
 *  Every claim the chapter makes is pinned in __tests__/gauss.test.ts:
 *    - flux through a sleeve does not depend on its size, shape or position,
 *      only on which rods it wraps;
 *    - a rod outside changes the field on the sleeve but not the flux;
 *    - the field inside a uniform tube (and a uniform spherical shell) is zero,
 *      and outside it equals that of all the charge on the axis (at the centre);
 *    - only a sleeve concentric with the tube has one field value all round,
 *      and then E = Φ / (2πr · 1 m);
 *    - charge put anywhere in a conductor ends on its surface, leaves the
 *      inside field-free, and crowds toward the sharp edge, where the field
 *      just outside is strongest.
 */

import { fieldAt, traceFieldLine, type Source } from './fields.ts';
import type { Vec2 } from './vectors.ts';

/** Coulomb's constant, N·m²/C². */
export const K = 8.9875517923e9;
/** Permittivity of free space, F/m, from the same K so the two never disagree. */
export const EPS0 = 1 / (4 * Math.PI * K);
export const NANO = 1e-9;

/** A rod of charge seen end-on: position in m, q = charge per length, C/m. */
export type Rod = Source;

/** The rod field is k λ r̂ / r with k = 2K, i.e. λ / (2πε₀ r). */
const ROD = { kind: 'line' as const, k: 2 * K, soften: 1e-7 };

/** Electric field of a set of rods at (x, y), N/C. */
export function rodField(rods: readonly Rod[], x: number, y: number): Vec2 {
  return fieldAt(rods, x, y, ROD);
}

/** Rods given in nC/m, as lessons write them, converted to C/m. */
export function rodsFromNano(list: readonly { x: number; y: number; q: number }[]): Rod[] {
  return list.map((r) => ({ x: r.x, y: r.y, q: r.q * NANO }));
}

/** What Gauss's law says the flux through 1 m of sleeve must be, N·m²/C. */
export const gaussFlux = (lambdaEnclosed: number) => lambdaEnclosed / EPS0;

/* ── loops: the cross-section of a closed sleeve ───────────────────────── */

export type Loop = readonly Vec2[];

function signedArea(loop: Loop): number {
  let a = 0;
  for (let i = 0; i < loop.length; i++) {
    const [x1, y1] = loop[i];
    const [x2, y2] = loop[(i + 1) % loop.length];
    a += x1 * y2 - x2 * y1;
  }
  return a / 2;
}

/** The loop run counter-clockwise, so (dy, −dx) on each edge points outward. */
export function counterClockwise(loop: Loop): Vec2[] {
  return signedArea(loop) >= 0 ? [...loop] : [...loop].reverse();
}

/** An ellipse with semi-axes a (along x) and b (along y), counter-clockwise. */
export function ellipseLoop(cx: number, cy: number, a: number, b: number, n = 192): Vec2[] {
  const out: Vec2[] = [];
  for (let i = 0; i < n; i++) {
    const t = (2 * Math.PI * i) / n;
    out.push([cx + a * Math.cos(t), cy + b * Math.sin(t)]);
  }
  return out;
}

export function perimeter(loop: Loop): number {
  let p = 0;
  for (let i = 0; i < loop.length; i++) {
    const [x1, y1] = loop[i];
    const [x2, y2] = loop[(i + 1) % loop.length];
    p += Math.hypot(x2 - x1, y2 - y1);
  }
  return p;
}

/** Even-odd ray cast. */
export function contains(loop: Loop, x: number, y: number): boolean {
  let inside = false;
  for (let i = 0, j = loop.length - 1; i < loop.length; j = i++) {
    const [xi, yi] = loop[i];
    const [xj, yj] = loop[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Nearest point on the loop's boundary, and how far away it is. */
export function nearestOnLoop(loop: Loop, p: Vec2): { at: Vec2; d: number; edge: number } {
  let best = { at: loop[0] as Vec2, d: Infinity, edge: 0 };
  for (let i = 0; i < loop.length; i++) {
    const [ax, ay] = loop[i];
    const [bx, by] = loop[(i + 1) % loop.length];
    const ex = bx - ax, ey = by - ay;
    const L2 = ex * ex + ey * ey;
    const t = L2 > 0 ? Math.max(0, Math.min(1, ((p[0] - ax) * ex + (p[1] - ay) * ey) / L2)) : 0;
    const q: Vec2 = [ax + t * ex, ay + t * ey];
    const d = Math.hypot(p[0] - q[0], p[1] - q[1]);
    if (d < best.d) best = { at: q, d, edge: i };
  }
  return best;
}

/** Total charge per length of the rods inside the loop, C/m. */
export function enclosedLambda(rods: readonly Rod[], loop: Loop): number {
  return rods.reduce((q, r) => (contains(loop, r.x, r.y) ? q + r.q : q), 0);
}

/** The outward normal component of E sampled along the loop: what the flux
 *  ticks on a sleeve draw. One sample at the midpoint of each edge. */
export function normalFieldAlong(rods: readonly Rod[], loopIn: Loop): { at: Vec2; n: Vec2; en: number; len: number }[] {
  const loop = counterClockwise(loopIn);
  const out: { at: Vec2; n: Vec2; en: number; len: number }[] = [];
  for (let i = 0; i < loop.length; i++) {
    const [ax, ay] = loop[i];
    const [bx, by] = loop[(i + 1) % loop.length];
    const len = Math.hypot(bx - ax, by - ay);
    if (len === 0) continue;
    const n: Vec2 = [(by - ay) / len, -(bx - ax) / len];
    const at: Vec2 = [(ax + bx) / 2, (ay + by) / 2];
    const [ex, ey] = rodField(rods, at[0], at[1]);
    out.push({ at, n, en: ex * n[0] + ey * n[1], len });
  }
  return out;
}

/** ∮ E·n̂ dl around the loop, times 1 m of sleeve: the flux, N·m²/C.
 *
 *  A real numerical surface integral of the field the scene draws, NOT
 *  "λ_enc / ε₀". The lesson's claim is that this number ignores the sleeve's
 *  shape, and computing it from the enclosed charge would assert that by
 *  construction. Gauss–Legendre on each edge, so a rod close to the sleeve
 *  is still integrated accurately. */
export function fluxThroughLoop(rods: readonly Rod[], loopIn: Loop, perEdge = 4): number {
  const loop = counterClockwise(loopIn);
  // 4-point Gauss–Legendre nodes and weights on [0, 1].
  const g = [0.0694318442029737, 0.3300094782075719, 0.6699905217924281, 0.9305681557970263];
  const w = [0.1739274225687269, 0.3260725774312731, 0.3260725774312731, 0.1739274225687269];
  let sum = 0;
  for (let i = 0; i < loop.length; i++) {
    const [ax, ay] = loop[i];
    const [bx, by] = loop[(i + 1) % loop.length];
    const ex = bx - ax, ey = by - ay;
    const L = Math.hypot(ex, ey);
    if (L === 0) continue;
    const nx = ey / L, ny = -ex / L;
    for (let s = 0; s < perEdge; s++) {
      const t0 = s / perEdge;
      for (let k = 0; k < 4; k++) {
        const t = t0 + g[k] / perEdge;
        const [fx, fy] = rodField(rods, ax + t * ex, ay + t * ey);
        sum += (fx * nx + fy * ny) * w[k] * (L / perEdge);
      }
    }
  }
  return sum * 1; // × 1 m of sleeve length
}

/* ── field lines, for drawing ──────────────────────────────────────────── */

/** Field lines leaving the positive rods, `perNano` lines per nC/m, so the
 *  number of lines crossing a sleeve outward is proportional to its flux. */
export function rodFieldLines(
  rods: readonly Rod[],
  bounds: { x0: number; y0: number; x1: number; y1: number },
  perNano = 6,
  seedRadius = 0.07,
): Vec2[][] {
  const lines: Vec2[][] = [];
  for (const r of rods) {
    if (r.q <= 0) continue;
    const n = Math.max(1, Math.round((r.q / NANO) * perNano));
    for (let i = 0; i < n; i++) {
      const th = (2 * Math.PI * (i + 0.5)) / n;
      lines.push(traceFieldLine(rods, [r.x + seedRadius * Math.cos(th), r.y + seedRadius * Math.sin(th)],
        { ...ROD, ds: 0.03, steps: 260, bounds, hitRadius: 0.05 }));
    }
  }
  return lines;
}

/* ── the charged tube and the charged shell ────────────────────────────── */

/** A long thin-walled tube of radius R carrying λ per metre on its wall,
 *  modelled honestly as n rods spread evenly round it. */
export function tubeRods(cx: number, cy: number, R: number, lambda: number, n = 360): Rod[] {
  const out: Rod[] = [];
  for (let i = 0; i < n; i++) {
    const t = (2 * Math.PI * (i + 0.5)) / n;
    out.push({ x: cx + R * Math.cos(t), y: cy + R * Math.sin(t), q: lambda / n });
  }
  return out;
}

/** Radial field of a uniform spherical shell (charge Q, radius R) at distance
 *  d from its centre, N/C, by summing thin rings of the shell. Each ring's
 *  field on its axis is K dq z / (z² + a²)^{3/2}: plain superposition, with no
 *  Gauss anywhere in it, so the tests can check Gauss against it. */
export function sphereShellField(Q: number, R: number, d: number, rings = 20000): number {
  let e = 0;
  const dTh = Math.PI / rings;
  for (let i = 0; i < rings; i++) {
    const th = (i + 0.5) * dTh;
    const dq = (Q / 2) * Math.sin(th) * dTh;
    const z = d - R * Math.cos(th);
    const a = R * Math.sin(th);
    e += (K * dq * z) / Math.pow(z * z + a * a, 1.5);
  }
  return e;
}

/** Field of a point charge, N/C. */
export const pointField = (Q: number, r: number) => (K * Q) / (r * r);

/* ── a conductor: charge free to move inside a metal bar ───────────────── */

/** A teardrop cross-section, counter-clockwise: a round end of radius `rho`
 *  centred on (cx, cy), and two straight flanks meeting in a sharp edge on the
 *  +x side with an apex angle of `apexDeg`. Starts at the sharp edge. */
export function dropOutline(cx: number, cy: number, rho: number, apexDeg = 60, perFlank = 16, arcPoints = 56): Vec2[] {
  const half = (apexDeg * Math.PI) / 360;
  const tip: Vec2 = [cx + rho / Math.sin(half), cy];
  const tangent = Math.PI / 2 - half; // where each flank meets the round end
  const upper: Vec2 = [cx + rho * Math.cos(tangent), cy + rho * Math.sin(tangent)];
  const lower: Vec2 = [cx + rho * Math.cos(tangent), cy - rho * Math.sin(tangent)];
  const out: Vec2[] = [];
  for (let i = 0; i < perFlank; i++) {
    const t = i / perFlank;
    out.push([tip[0] + t * (upper[0] - tip[0]), tip[1] + t * (upper[1] - tip[1])]);
  }
  for (let i = 0; i < arcPoints; i++) {
    const a = tangent + ((2 * Math.PI - 2 * tangent) * i) / arcPoints;
    out.push([cx + rho * Math.cos(a), cy + rho * Math.sin(a)]);
  }
  for (let i = 0; i < perFlank; i++) {
    const t = i / perFlank;
    out.push([lower[0] + t * (tip[0] - lower[0]), lower[1] + t * (tip[1] - lower[1])]);
  }
  return out;
}

/** The path a distance d outside a convex outline: each vertex pushed out
 *  along its normal, and a sharp corner rounded by an arc, so every point
 *  of it really is d from the metal. */
export function offsetOutline(poly: Loop, d: number): Vec2[] {
  const loop = counterClockwise(poly);
  const n = loop.length;
  const normal = (a: Vec2, b: Vec2): number => Math.atan2(-(b[0] - a[0]), b[1] - a[1]);
  const out: Vec2[] = [];
  for (let i = 0; i < n; i++) {
    const p = loop[i];
    const a1 = normal(loop[(i - 1 + n) % n], p);
    let a2 = normal(p, loop[(i + 1) % n]);
    while (a2 - a1 > Math.PI) a2 -= 2 * Math.PI;
    while (a2 - a1 < -Math.PI) a2 += 2 * Math.PI;
    const steps = Math.max(1, Math.ceil(Math.abs(a2 - a1) / (Math.PI / 36)));
    if (steps === 1) {
      const m = (a1 + a2) / 2;
      out.push([p[0] + d * Math.cos(m), p[1] + d * Math.sin(m)]);
    } else {
      for (let k = 0; k <= steps; k++) {
        const m = a1 + ((a2 - a1) * k) / steps;
        out.push([p[0] + d * Math.cos(m), p[1] + d * Math.sin(m)]);
      }
    }
  }
  return out;
}

/** n charges placed in a tight sunflower around (x, y): where an injection lands. */
export function clusterAt(x: number, y: number, n: number, spread: number): Vec2[] {
  const golden = Math.PI * (3 - Math.sqrt(5));
  const out: Vec2[] = [];
  for (let i = 0; i < n; i++) {
    const r = spread * Math.sqrt((i + 0.5) / n);
    out.push([x + r * Math.cos(i * golden), y + r * Math.sin(i * golden)]);
  }
  return out;
}

/** One step of the charges settling: each moves along the push of all the
 *  others (equal like rods, so the push is Σ r̂/r), no farther than `cap`,
 *  and any that would leave the metal stop at its surface. Overdamped, which
 *  is what charge in a real conductor is: electrons drift, they do not coast.
 *  Moves `pos` in place and returns the largest move. */
export function settleStep(pos: Vec2[], metal: Loop, rate: number, cap: number): number {
  const n = pos.length;
  const fx = new Float64Array(n), fy = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const dx = pos[i][0] - pos[j][0], dy = pos[i][1] - pos[j][1];
      const r2 = dx * dx + dy * dy + 1e-8;
      fx[i] += dx / r2; fy[i] += dy / r2;
      fx[j] -= dx / r2; fy[j] -= dy / r2;
    }
  }
  let biggest = 0;
  for (let i = 0; i < n; i++) {
    let mx = rate * fx[i], my = rate * fy[i];
    const m = Math.hypot(mx, my);
    if (m > cap) { mx *= cap / m; my *= cap / m; }
    let px = pos[i][0] + mx, py = pos[i][1] + my;
    if (!contains(metal, px, py)) [px, py] = projectToBoundary(metal, px, py);
    biggest = Math.max(biggest, Math.hypot(px - pos[i][0], py - pos[i][1]));
    pos[i] = [px, py];
  }
  return biggest;
}

/** `nearestOnLoop(...).at` without the allocations, for the settling loop. */
function projectToBoundary(loop: Loop, x: number, y: number): [number, number] {
  let bd = Infinity, bx = x, by = y;
  for (let i = 0; i < loop.length; i++) {
    const a = loop[i], b = loop[(i + 1) % loop.length];
    const ex = b[0] - a[0], ey = b[1] - a[1];
    const L2 = ex * ex + ey * ey;
    let t = L2 > 0 ? ((x - a[0]) * ex + (y - a[1]) * ey) / L2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const qx = a[0] + t * ex, qy = a[1] + t * ey;
    const d = (x - qx) * (x - qx) + (y - qy) * (y - qy);
    if (d < bd) { bd = d; bx = qx; by = qy; }
  }
  return [bx, by];
}

export const SETTLE_RATE = 6e-4;
export const SETTLE_CAP = 0.03;

/** Let the charges settle fully. */
export function settle(start: readonly Vec2[], metal: Loop, iters = 2500): Vec2[] {
  const pos = start.map((p) => [p[0], p[1]] as Vec2);
  for (let k = 0; k < iters; k++) settleStep(pos, metal, SETTLE_RATE, SETTLE_CAP);
  return pos;
}

/** How many charges sit deeper than `depth` inside the metal. */
export function chargesInside(pos: readonly Vec2[], metal: Loop, depth = 0.01): number {
  return pos.filter((p) => contains(metal, p[0], p[1]) && nearestOnLoop(metal, p).d > depth).length;
}

/** The settled charges as rods, sharing λ per metre between them. */
export function chargesAsRods(pos: readonly Vec2[], lambda: number): Rod[] {
  return pos.map((p) => ({ x: p[0], y: p[1], q: lambda / pos.length }));
}
