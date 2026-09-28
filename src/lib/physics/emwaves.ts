/**
 * Chapter 32 — electromagnetic waves.
 *
 * Four pieces, each small enough to read:
 *
 *  1. The speed. c is not typed in: it is computed from two constants you can
 *     measure on a bench with a capacitor and a coil, c = 1/√(μ₀ε₀).
 *
 *  2. The shaken charge. A charge on a vertical rod, moved by hand. Its field
 *     lines are drawn by the *emission rule*: the field line that leaves at
 *     angle θ is the set of points P(r) = q(t − r/c) + r·û(θ). Each piece of
 *     the line sits where news that left the charge r/c ago has reached, in
 *     the direction θ. This is an honest simplified model, not the full
 *     Liénard–Wiechert field:
 *       · Outside every shell of news it is exact. Where the charge was at rest
 *         when the news left, the line is radial from that rest position, which
 *         is what Gauss's law demands. So for a charge that moves and comes to
 *         rest, the old lines outside and the new lines inside are both right,
 *         and the kink joining them is offset sideways by Δy·sinθ, which is the
 *         Purcell construction.
 *       · Inside a shell (news that left while the charge was moving) the shape
 *         is a first-order-in-v/c sketch. Scenes cap the charge at half of c and
 *         say so.
 *     The rule builds in only one physical fact, that news travels at c. The
 *     tests measure that the kink front sits at r = c·(t − t_start) whatever
 *     the shake, and that its sideways size goes as sinθ.
 *
 *  3. The plane wave. E along y, B along z, travelling along x. Any frozen
 *     snapshot (E, cB) splits into a right-mover (E + cB)/2 and a left-mover
 *     (E − cB)/2, and each slides at c. That is the exact solution of the two
 *     curl equations in one dimension, and it is how a scene "lets go" of a
 *     snapshot the learner built.
 *
 *  4. Energy and momentum. Intensity ½cε₀E₀², radiation pressure I/c absorbed
 *     and 2I/c reflected, a sail, and the standing wave in a microwave oven
 *     whose hot spots sit every half wavelength.
 *
 * Units: SI throughout, except the shaken-charge scene, which works in metres
 * and nanoseconds (c ≈ 0.2998 m/ns) because a light-nanosecond is about a foot.
 */

/* ── 1. the speed of light, from two electrical constants ─────────────── */

/** Vacuum permeability, N/A² (CODATA 2022, measured). */
export const MU0 = 1.25663706127e-6;
/** Vacuum permittivity, F/m (CODATA 2022, measured). */
export const EPS0 = 8.8541878188e-12;
/** Planck's constant, J s. */
export const PLANCK = 6.62607015e-34;

/** Speed of a wave in the fields of a medium with μ and ε. */
export const waveSpeed = (mu: number, eps: number) => 1 / Math.sqrt(mu * eps);

/** The speed of light in vacuum, m/s, computed — not typed. */
export const C = waveSpeed(MU0, EPS0);
/** The same speed in metres per nanosecond. */
export const C_NS = C * 1e-9;

/** In a plane wave, E = cB. */
export const bFromE = (E: number) => E / C;

/* ── 2. the shaken charge ─────────────────────────────────────────────── */

/** One moment of the charge's history: time (ns) and height on the rod (m). */
export interface Sample { t: number; y: number }
export type History = Sample[];
export type P2 = [number, number];

/** A charge that has sat at `y` since forever. */
export const restHistory = (y = 0, t = 0): History => [{ t, y }];

/** The charge's height at time t: linear between samples, held before and after. */
export function chargeY(h: History, t: number): number {
  if (t <= h[0].t) return h[0].y;
  const n = h.length;
  if (t >= h[n - 1].t) return h[n - 1].y;
  let lo = 0, hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (h[mid].t <= t) lo = mid; else hi = mid;
  }
  const a = h[lo], b = h[hi];
  return a.y + ((b.y - a.y) * (t - a.t)) / (b.t - a.t);
}

/** The charge's velocity at time t (m/ns), from the history. */
export function chargeV(h: History, t: number, eps = 1e-3): number {
  return (chargeY(h, t + eps) - chargeY(h, t - eps)) / (2 * eps);
}

/** Direction of emission angle θ, measured from +y (the rod) toward +x. */
export const emissionDir = (theta: number): P2 => [Math.sin(theta), Math.cos(theta)];

/**
 * The field line leaving at angle θ, at time t, by the emission rule:
 * P(r) = (0, y(t − r/c)) + r·û(θ), for r from rMin to rMax in steps of dr.
 */
export function fieldLine(h: History, t: number, theta: number, rMax: number, dr: number, c = C_NS, rMin = 0): P2[] {
  const [ux, uy] = emissionDir(theta);
  const out: P2[] = [];
  for (let r = rMin; r <= rMax + 1e-12; r += dr) {
    const y = chargeY(h, t - r / c);
    out.push([r * ux, y + r * uy]);
  }
  return out;
}

/**
 * The retarded time at point D: the moment τ whose news is arriving at D at
 * time t, found by solving t − τ = |D − q(τ)|/c. Bisection; needs |v| < c.
 */
export function retardedTime(h: History, D: P2, t: number, c = C_NS): number {
  let maxY = 0;
  for (const s of h) maxY = Math.max(maxY, Math.abs(s.y));
  const f = (tau: number) => t - tau - Math.hypot(D[0], D[1] - chargeY(h, tau)) / c;
  let lo = t - (Math.hypot(D[0], D[1]) + maxY + 1) / c, hi = t;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (f(mid) > 0) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

/**
 * The direction of the field at D at time t: the tangent of the field line
 * through D, which by the emission rule is û − β, with û pointing from where
 * the charge was at the retarded time and β its velocity then, over c.
 */
export function fieldDirection(h: History, D: P2, t: number, c = C_NS): P2 {
  const tau = retardedTime(h, D, t, c);
  const y = chargeY(h, tau);
  const d = Math.hypot(D[0], D[1] - y);
  const beta = chargeV(h, tau) / c;
  const x = D[0] / d, yy = (D[1] - y) / d - beta;
  const m = Math.hypot(x, yy);
  return [x / m, yy / m];
}

/** Angle between two unit directions, degrees. */
export const angleBetween = (a: P2, b: P2) =>
  (Math.acos(Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1]))) * 180) / Math.PI;

/** Move the charge toward a target height, never faster than vmax (m/ns). */
export function moveCharge(y: number, target: number, dt: number, vmax: number): number {
  const d = target - y, lim = vmax * dt;
  return Math.abs(d) <= lim ? target : y + Math.sign(d) * lim;
}

/**
 * A stopwatch for the news. It starts when the charge leaves rest and stops
 * when the retarded time at the detector passes that start: the first moment
 * the detector's field is set by the charge's new motion. The arrival is
 * found to a fraction of a picosecond by bisecting between frames. Nothing in it uses
 * c except through `retardedTime`, which is the physics being measured.
 */
export interface NewsClock {
  state: 'idle' | 'armed' | 'done';
  tStart: number;
  yStart: number;
  D: P2;
  tPrev: number;
  /** Time from leaving rest to arrival at D, ns. */
  delay: number | null;
}

export const createNewsClock = (): NewsClock =>
  ({ state: 'idle', tStart: 0, yStart: 0, D: [0, 0], tPrev: 0, delay: null });

/** Start timing: the charge, at height y, leaves rest now. */
export function startNews(clock: NewsClock, t: number, y: number, D: P2) {
  Object.assign(clock, { state: 'armed', tStart: t, yStart: y, D: [D[0], D[1]], tPrev: t, delay: null });
}

/** Advance the stopwatch to time t. Interpolates the arrival between frames. */
export function newsStep(clock: NewsClock, h: History, t: number, c = C_NS) {
  if (clock.state !== 'armed') return;
  const tau = retardedTime(h, clock.D, t, c);
  if (tau >= clock.tStart) {
    // The arrival lies between the last frame and this one: find it by bisection.
    let lo = clock.tPrev, hi = t;
    for (let i = 0; i < 40; i++) {
      const mid = (lo + hi) / 2;
      if (retardedTime(h, clock.D, mid, c) >= clock.tStart) hi = mid; else lo = mid;
    }
    clock.delay = (lo + hi) / 2 - clock.tStart;
    clock.state = 'done';
  }
  clock.tPrev = t;
}

/** Distance from where the charge was when it left rest to the detector, m. */
export const newsDistance = (clock: NewsClock) => Math.hypot(clock.D[0], clock.D[1] - clock.yStart);

/** Measured speed of the news, m/s. */
export const measuredSpeed = (clock: NewsClock) =>
  clock.delay === null ? null : (newsDistance(clock) / clock.delay) * 1e9;

/* ── 3. the plane wave: E along y, B along z, travel along x ──────────── */

/** A frozen snapshot in which B's crest sits a phase φ behind E's: E = cos kx, cB = cos(kx − φ). */
export const snapshot = (phi: number, x: number, k: number) => ({ E: Math.cos(k * x), cB: Math.cos(k * x - phi) });

/**
 * Let a snapshot go. Any (E, cB) splits into a right-mover R = (E + cB)/2 and
 * a left-mover L = (E − cB)/2; Maxwell's curl equations in one dimension slide
 * R right and L left at c. Returns the fields at x after the light has gone ct.
 */
export function evolveField(E0: (x: number) => number, cB0: (x: number) => number, x: number, ct: number) {
  const R = (s: number) => (E0(s) + cB0(s)) / 2;
  const L = (s: number) => (E0(s) - cB0(s)) / 2;
  return { E: R(x - ct) + L(x + ct), cB: R(x - ct) - L(x + ct) };
}

/** The sinusoidal snapshot of `snapshot`, let go. */
export const evolveSnapshot = (phi: number, x: number, k: number, ct: number) =>
  evolveField((s) => Math.cos(k * s), (s) => Math.cos(k * s - phi), x, ct);

/** Fraction of the snapshot's energy that runs left (−x). Zero only when B is in step with E. */
export const leftFraction = (phi: number) => (1 - Math.cos(phi)) / 2;

/** Energy flow along x at a point, in units where E and cB are drawn alike: S ∝ E·cB. */
export const poyntingX = (E: number, cB: number) => E * cB;

/* ── 4. energy and momentum ───────────────────────────────────────────── */

/** Mean sunlight above the atmosphere at Earth's distance, W/m². */
export const SOLAR_CONSTANT = 1361;

/** Time-averaged intensity of a plane wave of peak field E0, W/m². */
export const intensity = (E0: number) => 0.5 * C * EPS0 * E0 * E0;
/** Peak electric field of a plane wave of intensity I, V/m. */
export const peakField = (I: number) => Math.sqrt((2 * I) / (C * EPS0));

export type Surface = 'absorb' | 'reflect';

/** Radiation pressure on a surface square to the beam, Pa. */
export const radiationPressure = (I: number, surface: Surface) => (surface === 'reflect' ? 2 : 1) * I / C;

/**
 * The same pressure counted photon by photon: I/(hf) photons per second per
 * square metre, each carrying momentum hf/c, handed over once if absorbed and
 * twice if it bounces straight back.
 */
export function photonPressure(I: number, f: number, surface: Surface) {
  const perSecond = I / (PLANCK * f);
  const pEach = (PLANCK * f) / C;
  return perSecond * pEach * (surface === 'reflect' ? 2 : 1);
}

/** A square sail of side `side` (m) square to sunlight of intensity I. */
export const sailForce = (I: number, side: number, surface: Surface) => radiationPressure(I, surface) * side * side;
export const sailAcceleration = (I: number, side: number, mass: number, surface: Surface) => sailForce(I, side, surface) / mass;
/** Distance from rest under constant acceleration a after time t. */
export const distanceAfter = (a: number, t: number) => 0.5 * a * t * t;
/** The side of square sail that covers `d` metres from rest in time t. */
export const sideForDistance = (d: number, t: number, I: number, mass: number, surface: Surface) =>
  Math.sqrt(((2 * d) / (t * t)) * mass / radiationPressure(I, surface));

/** Wavelength of an EM wave of frequency f, m. */
export const wavelength = (f: number) => C / f;

/**
 * Heating along a line in a microwave oven, from the metal wall at x = 0: the
 * standing wave is E ∝ sin(kx) cos(ωt), zero at the wall, and the heating goes
 * as the time-average of E², so sin²(kx), in units of its peak.
 */
export const standingHeat = (x: number, lambda: number) => Math.sin((2 * Math.PI * x) / lambda) ** 2;

/** The standing field itself at x and time t (same units): sin kx cos ωt. */
export const standingField = (x: number, lambda: number, phase: number) =>
  Math.sin((2 * Math.PI * x) / lambda) * Math.cos(phase);

/**
 * Where the chocolate melted: the intervals of [x0, x1] whose heating is above
 * `threshold`, found by scanning, not by formula.
 */
export function meltedSpots(lambda: number, x0: number, x1: number, threshold: number, n = 4000): { from: number; to: number; centre: number }[] {
  const out: { from: number; to: number; centre: number }[] = [];
  let start: number | null = null, best = -1, bestX = 0;
  for (let i = 0; i <= n; i++) {
    const x = x0 + ((x1 - x0) * i) / n;
    const q = standingHeat(x, lambda);
    if (q > threshold) {
      if (start === null) { start = x; best = -1; }
      if (q > best) { best = q; bestX = x; }
    } else if (start !== null) {
      out.push({ from: start, to: x, centre: bestX });
      start = null;
    }
  }
  if (start !== null) out.push({ from: start, to: x1, centre: bestX });
  return out;
}

/** The speed you infer from two pins `spacing` apart, if you take them to be one wavelength apart. */
export const speedFromPins = (spacing: number, f: number) => spacing * f;
