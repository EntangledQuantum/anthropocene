/** Chapter 29: electromagnetic induction.
 *
 *  SI throughout. One rule does all the work here: the EMF round a circuit is
 *  minus the rate of change of the magnetic flux through it,
 *
 *      ε = −N dΦ/dt,        Φ = ∫ B · dA.
 *
 *  Every scene in the chapter computes a flux, differences it in time, and
 *  divides by a resistance. Nothing is tabulated or hand-tuned.
 *
 *  Four worlds, all honest, all labelled as models:
 *
 *  ── a magnet and a coil (lesson 1) ──────────────────────────────────────
 *  The magnet is a point dipole m on the coil's axis. The flux it threads
 *  through a circular turn of radius a at axial distance z is exact for a
 *  point dipole:  Φ = μ₀ m a² / 2(a² + z²)^{3/2}.  Its contours are the
 *  field lines r = R sin²θ, so counting drawn lines through the coil counts
 *  flux. The coil's self-inductance is ignored (chapter 30): I = ε / R.
 *
 *  ── a square loop and a field with an edge (lesson 1) ────────────────────
 *  A uniform field into the page fills a rectangle. The flux through the loop
 *  is B times the overlap area, so it changes only while an edge of the loop
 *  crosses an edge of the field.
 *
 *  ── a magnet falling through a pipe (lesson 2) ───────────────────────────
 *  Thin-walled pipe (wall w ≪ radius a) as a stack of rings, point-dipole
 *  magnet on the axis. Each ring's EMF is −dΦ/dt from the same flux formula,
 *  its resistance 2πa/(σ w dz), and the drag is the ohmic power over v.
 *  Summed, that gives the closed form F = 45 μ₀² m² σ w v / (1024 a⁴)
 *  (Levin, da Silveira & Rizzato, Am. J. Phys. 74, 815 (2006)); the tests
 *  check the ring sum against it. Air drag is ignored. A slot down the pipe
 *  cuts every ring, so in this model no ring current flows at all; a real
 *  slotted pipe keeps small local swirls and falls a little slower than free.
 *
 *  ── a bar sliding on rails (lesson 2) ────────────────────────────────────
 *  Rails a distance L apart in a uniform field B, closed by a resistance R.
 *  The bar sweeps area at L v, so ε = B L v, I = ε/R, and the current feels
 *  I L B against the motion. m dv/dt = F − B²L²v/R is stepped exactly.
 *
 *  __tests__/induction.test.ts pins every claim the lessons make:
 *    - a constant flux gives zero EMF, whatever its size (magnet at rest);
 *    - the EMF is proportional to the speed;
 *    - the charge through the coil depends only on the flux change, not speed;
 *    - carrying a loop inside a uniform field gives zero EMF; crossing the
 *      edge at speed v gives B s v;
 *    - the induced current always opposes the change of flux (Lenz), in the
 *      coil, the loop, the pipe's rings and the rail circuit;
 *    - the ring sum equals the closed-form pipe drag; the copper pipe takes
 *      about 9 s where plastic and slotted take 0.45 s;
 *    - on the rails, pushing power equals bulb power once the bar is steady,
 *      and over a whole run work in = kinetic energy + heat.
 */

export const MU0 = 1.25663706212e-6;
export const G = 9.81;

/* ── flux ──────────────────────────────────────────────────────────────── */

/** Flux of a uniform field B through a flat area A tilted by `tilt` (radians
 *  between the field and the area's normal). Wb. */
export const uniformFlux = (B: number, A: number, tilt = 0) => B * A * Math.cos(tilt);

/** Flux through a circular turn of radius a from a point dipole m on its axis,
 *  z being the turn's position minus the dipole's along the dipole's direction. Wb. */
export function dipoleFlux(m: number, a: number, z: number): number {
  return (MU0 * m * a * a) / (2 * (a * a + z * z) ** 1.5);
}

/** dΦ/dz of dipoleFlux, Wb/m. */
export function dipoleFluxSlope(m: number, a: number, z: number): number {
  return (-1.5 * MU0 * m * a * a * z) / (a * a + z * z) ** 2.5;
}

/** Faraday: the EMF from a flux linkage that went from λ0 to λ1 in dt. V. */
export const emfFromLinkage = (lambda0: number, lambda1: number, dt: number) => -(lambda1 - lambda0) / dt;

/** Equatorial radius of the field line of a dipole that carries flux phi:
 *  the line r = R sin²θ encloses exactly phi. Used to draw lines that count flux. */
export const fieldLineRadius = (m: number, phi: number) => (MU0 * m) / (2 * phi);

/* ── lesson 1: a magnet and a coil ─────────────────────────────────────── */

export interface Coil { m: number; a: number; N: number; R: number }

/** A 1 A·m² neodymium magnet and a 500-turn coil of radius 5 cm, 10 Ω with its meter. */
export const CH29_COIL: Coil = { m: 1.0, a: 0.05, N: 500, R: 10 };

/** Flux linkage N Φ with the coil at x = 0 and the magnet at x, its north pole
 *  (its moment) pointing +x, toward the coil when x < 0. Wb-turns. */
export const coilLinkage = (x: number, c: Coil = CH29_COIL) => c.N * dipoleFlux(c.m, c.a, -x);

/** EMF with the magnet at x moving at vx. Positive EMF drives current whose own
 *  field points +x through the coil. V. */
export function coilEmf(x: number, vx: number, c: Coil = CH29_COIL): number {
  // λ(x) = N Φ(−x) ⇒ dλ/dt = −N Φ'(−x) vx
  return c.N * dipoleFluxSlope(c.m, c.a, -x) * vx;
}

export const coilCurrent = (x: number, vx: number, c: Coil = CH29_COIL) => coilEmf(x, vx, c) / c.R;

/** Charge that flows round the coil while the magnet moves from x0 to x1, by any
 *  route at any speed: −Δλ / R. C. */
export const chargeThroughCoil = (x0: number, x1: number, c: Coil = CH29_COIL) =>
  -(coilLinkage(x1, c) - coilLinkage(x0, c)) / c.R;

/** The magnet follows your hand: a critically damped chase of the target,
 *  stepped exactly-enough at small dt. Returns the new [x, v]. */
export function followStep(x: number, v: number, target: number, dt: number, omega = 22): [number, number] {
  const a = omega * omega * (target - x) - 2 * omega * v;
  const v1 = v + a * dt;
  return [x + v1 * dt, v1];
}

/* ── lesson 1: a square loop and a field with an edge ──────────────────── */

export interface Rect { x0: number; x1: number; y0: number; y1: number }
export interface EdgeField { B: number; region: Rect; side: number; R: number }

/** 0.4 T into the page over a 60 × 40 cm patch; a 16 cm square loop, 8 Ω with its meter. */
export const CH29_EDGE: EdgeField = { B: 0.4, region: { x0: 0, x1: 0.6, y0: -0.2, y1: 0.2 }, side: 0.16, R: 8 };

export function overlapArea(a: Rect, b: Rect): number {
  const w = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
  const h = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
  return w > 0 && h > 0 ? w * h : 0;
}

export const loopRect = (cx: number, cy: number, side: number): Rect =>
  ({ x0: cx - side / 2, x1: cx + side / 2, y0: cy - side / 2, y1: cy + side / 2 });

/** Flux through the loop centred at (cx, cy), normal out of the page (+z). The
 *  field points into the page, so this is ≤ 0. Wb. */
export const edgeFlux = (cx: number, cy: number, f: EdgeField = CH29_EDGE) =>
  -f.B * overlapArea(loopRect(cx, cy, f.side), f.region);

/** Fraction of the loop's area inside the field, 0..1. */
export const edgeFill = (cx: number, cy: number, f: EdgeField = CH29_EDGE) =>
  overlapArea(loopRect(cx, cy, f.side), f.region) / (f.side * f.side);

/** Current while the loop moves from p0 to p1 in dt. Positive: counterclockwise
 *  seen from the front (its own field out of the page). A. */
export function edgeCurrent(p0: readonly [number, number], p1: readonly [number, number], dt: number, f: EdgeField = CH29_EDGE): number {
  return emfFromLinkage(edgeFlux(p0[0], p0[1], f), edgeFlux(p1[0], p1[1], f), dt) / f.R;
}

/* ── lesson 2: a magnet falling through a pipe ─────────────────────────── */

export interface Pipe {
  /** magnet's dipole moment, A·m², and mass, kg */
  m: number; M: number;
  /** pipe's mean radius, wall thickness, length, m */
  a: number; w: number; L: number;
}

/** A 12 mm × 12 mm N42 cylinder (1.4 A·m², 10 g) in a 1 m copper pipe of
 *  16.5 mm mean diameter and 0.5 mm wall. */
export const CH29_PIPE: Pipe = { m: 1.4, M: 0.0102, a: 8.25e-3, w: 0.5e-3, L: 1.0 };

export const SIGMA_COPPER = 5.96e7;
export type PipeKind = 'plastic' | 'copper' | 'slotted';

/** Conductivity a ring of the pipe offers round the axis, S/m. The slot cuts
 *  every ring, so none. */
export const ringSigma = (kind: PipeKind) => (kind === 'copper' ? SIGMA_COPPER : 0);

/** Drag coefficient k in F = −k v, closed form for a thin wall. N·s/m. */
export function pipeDragCoefficient(kind: PipeKind, p: Pipe = CH29_PIPE): number {
  return (45 * MU0 * MU0 * p.m * p.m * ringSigma(kind) * p.w) / (1024 * p.a ** 4);
}

/** The same coefficient summed ring by ring: each ring's ohmic power ε²/R_ring
 *  divided by v². */
export function pipeDragByRings(kind: PipeKind, p: Pipe = CH29_PIPE, dz = p.a / 200, span = 60 * p.a): number {
  const sigma = ringSigma(kind);
  let k = 0;
  for (let z = -span; z <= span; z += dz) {
    const slope = dipoleFluxSlope(p.m, p.a, z); // ε = slope · v for unit speed
    const Rring = (2 * Math.PI * p.a) / (sigma * p.w * dz);
    k += (slope * slope) / Rring;
  }
  return sigma === 0 ? 0 : k;
}

export const terminalSpeed = (M: number, k: number, g = G) => (k > 0 ? (M * g) / k : Infinity);

/** Exact step of M dv/dt = M g − k v (down positive). */
export function fallStep(y: number, v: number, dt: number, k: number, M: number, g = G): [number, number] {
  if (k <= 0) return [y + v * dt + 0.5 * g * dt * dt, v + g * dt];
  const vt = (M * g) / k, tau = M / k, e = Math.exp(-dt / tau);
  const v1 = vt + (v - vt) * e;
  const y1 = y + vt * dt + (v - vt) * tau * (1 - e);
  return [y1, v1];
}

/** Time to fall the pipe's length from rest, s. */
export function pipeFallTime(kind: PipeKind, p: Pipe = CH29_PIPE): number {
  const k = pipeDragCoefficient(kind, p);
  if (k <= 0) return Math.sqrt((2 * p.L) / G);
  const vt = (p.M * G) / k, tau = p.M / k;
  // y(t) = vt (t − τ(1 − e^{−t/τ})); solve y = L by Newton from t = L/vt + τ
  let t = p.L / vt + tau;
  for (let i = 0; i < 40; i++) {
    const f = vt * (t - tau * (1 - Math.exp(-t / tau))) - p.L;
    const df = vt * (1 - Math.exp(-t / tau));
    t -= f / df;
  }
  return t;
}

/** One ring of the pipe, of height dz, at height z above a magnet whose moment
 *  points down (north pole down, the lesson's magnet), falling at speed v > 0.
 *  Returns the ring's EMF and current (positive: its own field points up, a
 *  north face on top) and the vertical force it puts on the magnet (positive up).
 *  `sign` overrides the current's direction, to show what the wrong one would do. */
export function ringOnFallingMagnet(z: number, v: number, dz: number, kind: PipeKind = 'copper', p: Pipe = CH29_PIPE, sign?: 1 | -1) {
  const my = -p.m;                       // moment points down
  const slope = dipoleFluxSlope(my, p.a, z); // Φ(z) with z = ring − magnet, normal up
  const dzdt = v;                         // magnet falls at v, so z = ring − magnet grows at v
  const emf = -slope * dzdt;
  const sigma = ringSigma(kind);
  const Rring = sigma > 0 ? (2 * Math.PI * p.a) / (sigma * p.w * dz) : Infinity;
  let I = emf / Rring;
  if (sign !== undefined) I = sign * Math.abs(I);
  // force on the dipole: F = m_y ∂B_ring/∂y_magnet = m_y · 1.5 μ0 I a² z / (a²+z²)^{5/2}
  const force = (my * 1.5 * MU0 * I * p.a * p.a * z) / (p.a * p.a + z * z) ** 2.5;
  return { emf, I, force, dPhiDt: slope * dzdt };
}

/* ── lesson 2: a bar sliding on rails ──────────────────────────────────── */

export interface Rails { B: number; L: number; R: number; m: number; length: number }

/** 0.8 T, rails 1 m apart, a 1 Ω bulb, a 0.2 kg bar, 8 m of rail. */
export const CH29_RAILS: Rails = { B: 0.8, L: 1.0, R: 1.0, m: 0.2, length: 8 };

export const railEmf = (B: number, L: number, v: number) => B * L * v;

/** Everything the circuit is doing with the bar at speed v under your push F. */
export function railState(v: number, F: number, r: Rails = CH29_RAILS) {
  const emf = railEmf(r.B, r.L, v);
  const I = Number.isFinite(r.R) ? emf / r.R : 0;
  const drag = I * r.L * r.B;           // against the motion
  return { emf, I, drag, Pelec: I * I * (Number.isFinite(r.R) ? r.R : 0), Pmech: F * v, accel: (F - drag) / r.m };
}

/** Exact step of m dv/dt = F − B²L²v/R. */
export function railStep(v: number, F: number, dt: number, r: Rails = CH29_RAILS): number {
  if (!Number.isFinite(r.R)) return v + (F / r.m) * dt;
  const k = (r.B * r.B * r.L * r.L) / r.R;
  const vt = F / k, e = Math.exp((-k * dt) / r.m);
  return vt + (v - vt) * e;
}

export const railTerminalSpeed = (F: number, r: Rails = CH29_RAILS) => (F * r.R) / (r.B * r.B * r.L * r.L);

/** The push that holds the bar at a steady v. Open circuit (R = ∞): none. */
export const holdForce = (v: number, r: Rails = CH29_RAILS) =>
  Number.isFinite(r.R) ? (r.B * r.B * r.L * r.L * v) / r.R : 0;

/** The steady push that makes the bulb burn P watts. */
export const pushForPower = (P: number, r: Rails = CH29_RAILS) => r.B * r.L * Math.sqrt(P / r.R);

/** Bulb power once the bar has settled under push F. */
export const settledPower = (F: number, r: Rails = CH29_RAILS) => (F * F * r.R) / (r.B * r.B * r.L * r.L);
