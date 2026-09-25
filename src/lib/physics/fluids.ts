/** Fluid statics and steady flow (University Physics, ch. 12).
 *
 *  Two halves, each small enough to read in one sitting:
 *
 *    1. Statics. Pressure in still water depends only on how far below the
 *       free surface you are: p = ρ g h. Buoyancy is not a new force. It is
 *       that pressure, integrated over the surface of whatever is in the
 *       water. `pressureForceOnPolygon` and `pressureForceOnSphere` do the
 *       integral honestly, face by face, and Archimedes' ρ g V falls out —
 *       the tests check that it does, for shapes that are not boxes.
 *    2. Flow. An incompressible fluid in a pipe carries the same volume per
 *       second through every cross-section (continuity), and along one
 *       streamline of a steady, frictionless flow p + ½ρv² + ρgy is constant
 *       (Bernoulli). Torricelli's jet is Bernoulli between the free surface
 *       and the hole; its range is then plain projectile motion.
 *
 *  Conventions: SI units, y up. Pressures are gauge pressures (above the air)
 *  unless a name says absolute. 2D shapes are cross-sections: their forces
 *  are per metre of length into the page unless a `length` is given.
 */

export type Vec2 = readonly [number, number];

export const G = 9.81;
export const RHO_WATER = 1000;
export const RHO_SEAWATER = 1025;
export const P_ATM = 101_325;

/* ── 1. statics ─────────────────────────────────────────────────────────── */

/** Gauge pressure at a depth below the free surface. Above the surface, zero. */
export function hydrostaticPressure(depth: number, rho = RHO_WATER, g = G): number {
  return rho * g * Math.max(depth, 0);
}

export function absolutePressure(depth: number, rho = RHO_WATER, g = G, pAir = P_ATM): number {
  return pAir + hydrostaticPressure(depth, rho, g);
}

/**
 * Walk from a point on the free surface to somewhere in the water along any
 * path that stays in the water, adding up dp = −ρ g dy. Horizontal moves add
 * nothing, so the answer cannot depend on the path — or on the shape of the
 * vessel the path winds through. The tests walk two very different paths.
 */
export function pressureAlongPath(path: readonly Vec2[], rho = RHO_WATER, g = G): number {
  let p = 0;
  for (let i = 1; i < path.length; i++) p += -rho * g * (path[i][1] - path[i - 1][1]);
  return p;
}

/** Even–odd point-in-polygon test. */
export function pointInPolygon(pt: Vec2, poly: readonly Vec2[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Signed shoelace area: positive for counter-clockwise vertices. */
export function polygonArea(poly: readonly Vec2[]): number {
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const [x1, y1] = poly[i], [x2, y2] = poly[(i + 1) % poly.length];
    a += x1 * y2 - x2 * y1;
  }
  return a / 2;
}

/** The part of a polygon at or below the line y = level (Sutherland–Hodgman
 *  against one half-plane). This is the water inside a vessel, or the part of
 *  a hull that sits in the water. */
export function clipBelow(poly: readonly Vec2[], level: number): Vec2[] {
  const out: Vec2[] = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const aIn = a[1] <= level, bIn = b[1] <= level;
    if (aIn) out.push(a);
    if (aIn !== bIn) {
      const t = (level - a[1]) / (b[1] - a[1]);
      out.push([a[0] + t * (b[0] - a[0]), level]);
    }
  }
  return out;
}

/** Area of a cross-section that lies below the free surface. */
export function submergedArea(poly: readonly Vec2[], surfaceY: number): number {
  const c = clipBelow(poly, surfaceY);
  return c.length < 3 ? 0 : Math.abs(polygonArea(c));
}

/**
 * The total force the water exerts on a body, found by adding up pressure
 * times area over every face — nothing else. Each edge of the (counter-
 * clockwise) cross-section is split where it crosses the surface; on each
 * piece the pressure is linear in y, so ∫p ds is exact as the mean of the
 * end pressures times the length. The water pushes inward: F = −∮ p n̂ ds.
 *
 * Returns [Fx, Fy] in newtons for a prism `length` metres deep into the page.
 */
export function pressureForceOnPolygon(
  poly: readonly Vec2[], surfaceY: number, rho = RHO_WATER, g = G, length = 1,
): [number, number] {
  const ccw = polygonArea(poly) > 0;
  const p = (y: number) => hydrostaticPressure(surfaceY - y, rho, g);
  let fx = 0, fy = 0;
  for (let i = 0; i < poly.length; i++) {
    let a = poly[i], b = poly[(i + 1) % poly.length];
    if (!ccw) [a, b] = [b, a];
    const pieces: [Vec2, Vec2][] = [];
    if ((a[1] - surfaceY) * (b[1] - surfaceY) < 0) {
      const t = (surfaceY - a[1]) / (b[1] - a[1]);
      const m: Vec2 = [a[0] + t * (b[0] - a[0]), surfaceY];
      pieces.push([a, m], [m, b]);
    } else pieces.push([a, b]);
    for (const [u, v] of pieces) {
      const dx = v[0] - u[0], dy = v[1] - u[1];
      const L = Math.hypot(dx, dy);
      if (L === 0) continue;
      const nx = dy / L, ny = -dx / L; // outward normal of a CCW edge
      const pInt = ((p(u[1]) + p(v[1])) / 2) * L;
      fx -= pInt * nx;
      fy -= pInt * ny;
    }
  }
  return [fx * length, fy * length];
}

/**
 * The same integral over a real 3D sphere, by midpoint quadrature in polar
 * angle θ and azimuth φ (dA = r² sin θ dθ dφ). Returns the vertical force;
 * the horizontal parts cancel by symmetry.
 */
export function pressureForceOnSphere(
  r: number, centreY: number, surfaceY: number, rho = RHO_WATER, g = G, n = 400,
): number {
  let fz = 0;
  const dth = Math.PI / n, dph = (2 * Math.PI) / n;
  for (let i = 0; i < n; i++) {
    const th = (i + 0.5) * dth;
    const z = centreY + r * Math.cos(th);
    const nz = Math.cos(th);
    const p = hydrostaticPressure(surfaceY - z, rho, g);
    // every azimuth at this θ has the same pressure and the same n_z
    fz -= p * nz * r * r * Math.sin(th) * dth * dph * n;
  }
  return fz;
}

/** Archimedes, as a closed form to check the integrals against. */
export const displacedWeight = (volume: number, rho = RHO_WATER, g = G): number => rho * g * volume;

/** Volume of a spherical cap of height h cut from a sphere of radius r. */
export const sphericalCap = (r: number, h: number): number => {
  const c = Math.min(Math.max(h, 0), 2 * r);
  return (Math.PI * c * c * (3 * r - c)) / 3;
};

/** An axis-aligned block as a CCW polygon, from its top edge downward. */
export function blockPolygon(cx: number, topY: number, w: number, h: number): Vec2[] {
  return [[cx - w / 2, topY - h], [cx + w / 2, topY - h], [cx + w / 2, topY], [cx - w / 2, topY]];
}

/**
 * The four faces of a submerged block, each pushed inward by the water:
 * the force on each face, found from the pressure at its ends. Scenes draw
 * these; the net is `pressureForceOnPolygon` of the same block.
 */
export function blockFaceForces(topDepth: number, w: number, h: number, length: number, rho = RHO_WATER, g = G) {
  const pTop = hydrostaticPressure(topDepth, rho, g);
  const pBot = hydrostaticPressure(topDepth + h, rho, g);
  const block = blockPolygon(0, -topDepth, w, h);
  const [, net] = pressureForceOnPolygon(block, 0, rho, g, length);
  return { pTop, pBot, down: pTop * w * length, up: pBot * w * length, net };
}

/* ── floating ───────────────────────────────────────────────────────────── */

export interface Barge {
  /** Hull length along the page, beam into the page, side height: metres. */
  length: number;
  beam: number;
  height: number;
  /** Empty hull, kg. */
  mass: number;
}

/** Upward force of the water on a box hull floating at a given draft, from
 *  the pressure integral over the hull's cross-section (× beam). */
export function hullBuoyancy(b: Barge, draft: number, rho = RHO_WATER, g = G): number {
  const hull = blockPolygon(0, b.height - draft, b.length, b.height);
  return pressureForceOnPolygon(hull, 0, rho, g, b.beam)[1];
}

/** Draft at which a box hull carrying `total` kg floats, in closed form. */
export const floatDraft = (b: Barge, total: number, rho = RHO_WATER): number =>
  total / (rho * b.length * b.beam);

/** Mass of the water the hull pushes aside at a given draft. */
export const displacedMass = (b: Barge, draft: number, rho = RHO_WATER): number =>
  rho * b.length * b.beam * Math.min(Math.max(draft, 0), b.height);

export interface Heave { draft: number; v: number }

/**
 * One step of the hull bobbing up and down: weight down, the pressure
 * integral up, and a little damping from the water so it settles. Positive
 * v means sinking deeper. Semi-implicit Euler, which is stable here.
 */
export function heaveStep(b: Barge, total: number, s: Heave, dt: number, rho = RHO_WATER, g = G, zeta = 0.35): Heave {
  const omega = Math.sqrt((rho * g * b.length * b.beam) / total);
  const f = total * g - hullBuoyancy(b, s.draft, rho, g) - 2 * zeta * omega * total * s.v;
  const v = s.v + (f / total) * dt;
  return { draft: Math.min(Math.max(s.draft + v * dt, 0), b.height), v };
}

/* ── 2. flow ────────────────────────────────────────────────────────────── */

/** Cross-section of a round pipe. It goes as the diameter squared. */
export const pipeArea = (d: number): number => (Math.PI * d * d) / 4;

/** Continuity: the same volume per second through every section. */
export const flowSpeed = (Q: number, d: number): number => Q / pipeArea(d);

/**
 * Bernoulli along one streamline of a steady, frictionless, incompressible
 * flow: p + ½ρv² + ρgy is the same at both ends. Solve for the pressure at 2.
 */
export function bernoulliPressure(
  p1: number, v1: number, y1: number, v2: number, y2: number, rho = RHO_WATER, g = G,
): number {
  return p1 + 0.5 * rho * (v1 * v1 - v2 * v2) + rho * g * (y1 - y2);
}

/** The same budget solved for the speed at 2. NaN if the budget cannot pay. */
export function bernoulliSpeed(
  p1: number, v1: number, y1: number, p2: number, y2: number, rho = RHO_WATER, g = G,
): number {
  const v2sq = v1 * v1 + (2 * (p1 - p2)) / rho + 2 * g * (y1 - y2);
  return v2sq < 0 ? NaN : Math.sqrt(v2sq);
}

/** Height of water a gauge pressure holds up in an open tube. */
export const columnHeight = (pGauge: number, rho = RHO_WATER, g = G): number => pGauge / (rho * g);

/**
 * A round pipe of diameter D pinched smoothly to a waist of diameter d,
 * centred at xc with half-length hw (a raised-cosine profile).
 */
export function waistDiameter(x: number, D: number, d: number, xc: number, hw: number): number {
  const u = (x - xc) / hw;
  if (Math.abs(u) >= 1) return D;
  return D - (D - d) * 0.5 * (1 + Math.cos(Math.PI * u));
}

export interface Venturi {
  D: number; d: number; xc: number; hw: number;
  /** Speed in the full-bore pipe, m/s. */
  v1: number;
  /** Gauge pressure in the full-bore pipe, Pa. */
  p1: number;
}

/** Speed and gauge pressure anywhere along a horizontal venturi. */
export function venturiAt(vt: Venturi, x: number, rho = RHO_WATER) {
  const Q = vt.v1 * pipeArea(vt.D);
  const v = flowSpeed(Q, waistDiameter(x, vt.D, vt.d, vt.xc, vt.hw));
  return { v, p: bernoulliPressure(vt.p1, vt.v1, 0, v, 0, rho) };
}

/**
 * Torricelli: from the still free surface (gauge p = 0, v ≈ 0) to the jet
 * just outside the hole (gauge p = 0 again). Only the height difference is
 * left to pay for the speed, so v = √(2 g depth) — computed through the
 * Bernoulli budget, not typed in.
 */
export const torricelliSpeed = (depth: number, g = G): number =>
  bernoulliSpeed(0, 0, depth, 0, 0, RHO_WATER, g);

/** Where a horizontal jet from a hole at height `holeY` above the floor lands,
 *  with the free surface held at `surfaceY`. A deeper hole is faster but has
 *  less far to fall. */
export function jetRange(holeY: number, surfaceY: number, g = G): number {
  const v = torricelliSpeed(surfaceY - holeY, g);
  return v * Math.sqrt((2 * Math.max(holeY, 0)) / g);
}

/** Points along the jet, from the hole to the floor. */
export function jetPath(holeY: number, surfaceY: number, n = 40, g = G): Vec2[] {
  const v = torricelliSpeed(surfaceY - holeY, g);
  const T = Math.sqrt((2 * Math.max(holeY, 0)) / g);
  const out: Vec2[] = [];
  for (let i = 0; i <= n; i++) {
    const t = (T * i) / n;
    out.push([v * t, holeY - 0.5 * g * t * t]);
  }
  return out;
}
