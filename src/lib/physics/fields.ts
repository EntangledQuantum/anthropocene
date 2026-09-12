/** Superposed inverse-power fields: gravity, electrostatics, and the canvas
 *  that chapters 13, 21, 22, 23, 27 and 28 all draw on.
 *
 *  ── The dimension trap, read this before using `flux` ──────────────────────
 *
 *  A lesson that draws point charges in a plane and then integrates flux around
 *  a circle is, without noticing, asserting Gauss's law for a field that does
 *  not obey it. In a plane, ∮E·n̂ dl is independent of the loop only when the
 *  field falls as 1/r. A 3D point charge falls as 1/r², so its flux through a
 *  *circle* shrinks as the circle grows — which is the exact opposite of what
 *  the chapter is trying to teach.
 *
 *  So the model is explicit:
 *
 *    'point' — E ∝ 1/r², a 3D point charge seen in a slice. Right for field
 *              lines, equipotentials and dipole pictures. Its honest flux
 *              integral is over a SPHERE (`fluxThroughSphere`).
 *    'line'  — E ∝ 1/r, an infinite line charge seen end-on. The plane is the
 *              whole geometry, so ∮E·n̂ dl really is 2πk·q_enc and squashing
 *              the loop really does leave it unchanged. Right for Gauss.
 *
 *  Both are physical. Mixing them is the bug, and the tests pin both
 *  behaviours so nobody has to rediscover this.
 */

import type { Vec2 } from './vectors.ts';

export type FieldKind = 'point' | 'line';

export interface Source {
  x: number;
  y: number;
  /** Charge, or mass. Negative is allowed for charge; for gravity keep it
   *  positive and set `attractive`. */
  q: number;
}

export interface FieldOptions {
  kind?: FieldKind;
  /** Coulomb-like constant. 1 keeps the numbers readable in a lesson. */
  k?: number;
  /** Softening length, so a probe landing on a source gives a large number
   *  rather than Infinity and a blank canvas. */
  soften?: number;
  /** Gravity: the field points TOWARD a positive source. */
  attractive?: boolean;
}

const defaults = (o: FieldOptions) => ({
  kind: o.kind ?? 'point',
  k: o.k ?? 1,
  soften: o.soften ?? 0.04,
  sign: o.attractive ? -1 : 1,
});

/** The field vector at a point: Σ k q r̂ / rⁿ. */
export function fieldAt(sources: readonly Source[], x: number, y: number, opts: FieldOptions = {}): Vec2 {
  const { kind, k, soften, sign } = defaults(opts);
  let ex = 0;
  let ey = 0;
  for (const s of sources) {
    const dx = x - s.x;
    const dy = y - s.y;
    const r2 = dx * dx + dy * dy + soften * soften;
    const r = Math.sqrt(r2);
    // 1/r² gives magnitude k q / r², direction r̂ = (dx,dy)/r  →  divide by r³.
    // 1/r  gives magnitude k q / r,  direction r̂             →  divide by r².
    const denom = kind === 'point' ? r2 * r : r2;
    const m = (sign * k * s.q) / denom;
    ex += m * dx;
    ey += m * dy;
  }
  return [ex, ey];
}

/** The potential at a point, with the usual zero: at infinity for 'point',
 *  and at r = 1 for 'line' (a log potential cannot vanish at infinity). */
export function potentialAt(
  sources: readonly Source[],
  x: number,
  y: number,
  opts: FieldOptions = {},
): number {
  const { kind, k, soften, sign } = defaults(opts);
  let v = 0;
  for (const s of sources) {
    const dx = x - s.x;
    const dy = y - s.y;
    const r = Math.sqrt(dx * dx + dy * dy + soften * soften);
    v += kind === 'point' ? (sign * k * s.q) / r : -sign * k * s.q * Math.log(r);
  }
  return v;
}

/** Total source strength inside a circle. */
export function enclosedCharge(
  sources: readonly Source[],
  cx: number,
  cy: number,
  r: number,
): number {
  let q = 0;
  for (const s of sources) {
    if (Math.hypot(s.x - cx, s.y - cy) < r) q += s.q;
  }
  return q;
}

/** ∮ E·n̂ dl around a circle — the honest flux for the 'line' model.
 *
 *  Kept as a real numerical loop integral rather than "k times the enclosed
 *  charge", because the lesson's whole claim is that the integral does not
 *  care about the loop, and asserting that by construction would be circular.
 */
export function fluxThroughCircle(
  sources: readonly Source[],
  cx: number,
  cy: number,
  r: number,
  opts: FieldOptions = {},
  samples = 2048,
): number {
  let sum = 0;
  const dTheta = (2 * Math.PI) / samples;
  for (let i = 0; i < samples; i++) {
    const th = (i + 0.5) * dTheta;
    const nx = Math.cos(th);
    const ny = Math.sin(th);
    const [ex, ey] = fieldAt(sources, cx + r * nx, cy + r * ny, opts);
    sum += (ex * nx + ey * ny) * r * dTheta;
  }
  return sum;
}

/** ∮ E·n̂ dA over a sphere, for the 'point' model. Sampled on a Fibonacci
 *  lattice, which distributes directions far more evenly than a lat/long grid
 *  and so converges without a pole artefact.
 *
 *  Sources are treated as sitting in the z = 0 plane, which is where the canvas
 *  puts them. */
export function fluxThroughSphere(
  sources: readonly Source[],
  cx: number,
  cy: number,
  r: number,
  opts: FieldOptions = {},
  samples = 4096,
): number {
  const { k, soften, sign } = defaults(opts);
  const golden = Math.PI * (3 - Math.sqrt(5));
  let sum = 0;

  for (let i = 0; i < samples; i++) {
    const nz = 1 - (2 * (i + 0.5)) / samples;
    const rho = Math.sqrt(Math.max(0, 1 - nz * nz));
    const th = i * golden;
    const nx = Math.cos(th) * rho;
    const ny = Math.sin(th) * rho;

    const px = cx + r * nx;
    const py = cy + r * ny;
    const pz = r * nz;

    let ex = 0;
    let ey = 0;
    let ez = 0;
    for (const s of sources) {
      const dx = px - s.x;
      const dy = py - s.y;
      const dz = pz;
      const r2 = dx * dx + dy * dy + dz * dz + soften * soften;
      const m = (sign * k * s.q) / (r2 * Math.sqrt(r2));
      ex += m * dx;
      ey += m * dy;
      ez += m * dz;
    }
    sum += ex * nx + ey * ny + ez * nz;
  }

  // Each sample carries an equal share of the sphere's area.
  return (sum * 4 * Math.PI * r * r) / samples;
}

export interface TraceOptions extends FieldOptions {
  /** Follow the field backwards — needed to draw the half of a field line that
   *  runs into a negative source. */
  backward?: boolean;
  steps?: number;
  /** Arc length per step, in world units. */
  ds?: number;
  bounds?: { x0: number; y0: number; x1: number; y1: number };
  /** Stop when this close to any source. */
  hitRadius?: number;
}

/** Trace one field line from a starting point.
 *
 *  RK4 on the NORMALISED field, so the step is a fixed arc length rather than a
 *  fixed time — otherwise the tracer crawls where the field is weak and jumps
 *  clean over a source where it is strong.
 */
export function traceFieldLine(
  sources: readonly Source[],
  start: Vec2,
  opts: TraceOptions = {},
): Vec2[] {
  const {
    backward = false,
    steps = 600,
    ds = 0.02,
    bounds,
    hitRadius = 0.05,
  } = opts;
  const dir = backward ? -1 : 1;

  const unit = (x: number, y: number): Vec2 => {
    const [ex, ey] = fieldAt(sources, x, y, opts);
    const m = Math.hypot(ex, ey);
    return m < 1e-12 ? [0, 0] : [(dir * ex) / m, (dir * ey) / m];
  };

  const pts: Vec2[] = [start];
  let [x, y] = start;

  for (let i = 0; i < steps; i++) {
    const [k1x, k1y] = unit(x, y);
    if (k1x === 0 && k1y === 0) break;
    const [k2x, k2y] = unit(x + (ds / 2) * k1x, y + (ds / 2) * k1y);
    const [k3x, k3y] = unit(x + (ds / 2) * k2x, y + (ds / 2) * k2y);
    const [k4x, k4y] = unit(x + ds * k3x, y + ds * k3y);

    x += (ds / 6) * (k1x + 2 * k2x + 2 * k3x + k4x);
    y += (ds / 6) * (k1y + 2 * k2y + 2 * k3y + k4y);
    pts.push([x, y]);

    if (bounds && (x < bounds.x0 || x > bounds.x1 || y < bounds.y0 || y > bounds.y1)) break;
    if (sources.some((s) => Math.hypot(x - s.x, y - s.y) < hitRadius)) break;
  }
  return pts;
}

/** Seed points ringing each positive source, so the drawn lines are spaced by
 *  field strength: a charge of 2q gets twice the lines, which is what makes
 *  line density readable as magnitude rather than decoration. */
export function seedFieldLines(
  sources: readonly Source[],
  linesPerUnitCharge = 8,
  radius = 0.12,
): { start: Vec2; backward: boolean }[] {
  const seeds: { start: Vec2; backward: boolean }[] = [];
  for (const s of sources) {
    const n = Math.max(4, Math.round(Math.abs(s.q) * linesPerUnitCharge));
    for (let i = 0; i < n; i++) {
      const th = (2 * Math.PI * (i + 0.5)) / n;
      seeds.push({
        start: [s.x + radius * Math.cos(th), s.y + radius * Math.sin(th)],
        // Lines leave positive sources and enter negative ones, so a negative
        // source is traced against the field to get the same picture.
        backward: s.q < 0,
      });
    }
  }
  return seeds;
}

/** Points where the field vanishes, found by scanning then bisecting.
 *
 *  The dipole's "where is E zero but V is not" question needs these to be real
 *  rather than asserted. */
export function nullPoints(
  sources: readonly Source[],
  bounds: { x0: number; y0: number; x1: number; y1: number },
  opts: FieldOptions = {},
  grid = 160,
): Vec2[] {
  const found: Vec2[] = [];
  const dx = (bounds.x1 - bounds.x0) / grid;
  const dy = (bounds.y1 - bounds.y0) / grid;
  const soften = opts.soften ?? 0.04;

  const mag = (x: number, y: number) => {
    const [ex, ey] = fieldAt(sources, x, y, opts);
    return Math.hypot(ex, ey);
  };

  // A source's own field vanishes at its own centre, so a probe landing exactly
  // on a charge sees only the OTHER charges and reads as a local minimum
  // surrounded by enormous values. That is a singularity, not a null, and
  // reporting it would tell a learner the field is zero where it is strongest.
  const exclusion = Math.max(4 * soften, 2 * Math.max(dx, dy));
  const onASource = (x: number, y: number) =>
    sources.some((s) => Math.hypot(x - s.x, y - s.y) < exclusion);

  for (let i = 1; i < grid - 1; i++) {
    for (let j = 1; j < grid - 1; j++) {
      const x = bounds.x0 + i * dx;
      const y = bounds.y0 + j * dy;
      if (onASource(x, y)) continue;
      const m = mag(x, y);
      // A local minimum of |E| among its eight neighbours, and small.
      let isMin = true;
      for (let a = -1; a <= 1 && isMin; a++) {
        for (let b = -1; b <= 1; b++) {
          if (a === 0 && b === 0) continue;
          if (mag(x + a * dx, y + b * dy) < m) {
            isMin = false;
            break;
          }
        }
      }
      if (isMin && m < 0.5 && !found.some((p) => Math.hypot(p[0] - x, p[1] - y) < 4 * dx)) {
        found.push([x, y]);
      }
    }
  }
  return found;
}
