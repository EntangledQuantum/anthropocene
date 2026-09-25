/** Mechanical waves on a stretched rope (University Physics, ch. 15).
 *
 *  Four pieces, each small enough to read in one sitting:
 *
 *    1. The speed. A rope under tension F with mass per length μ carries
 *       every small disturbance at v = √(F/μ). Nothing about the flick enters.
 *    2. The travelling form. A pulse is a shape g sliding along: y = A g(x − x₀ − s t).
 *       Differentiate in time and a bead's velocity is −s times the slope of
 *       the rope under it, so a frozen snapshot already says how every bead moves.
 *    3. A discretised rope. The wave equation on a grid, marched with the
 *       leapfrog update at Courant number exactly 1 (dt = dx / v). At that
 *       one step size the scheme is exact on the grid: a pulse moves one cell
 *       per step and keeps its shape, and two pulses pass through each other
 *       untouched. It is the rope the scenes animate and the tests measure.
 *    4. The driven rope. Shake one end at frequency f with a light damping γ
 *       and wait: the rope settles into y = Re[Y(x) e^{iωt}] with
 *       Y(x) = A sin k(L − x) / sin kL. The swing is huge only where
 *       sin kL ≈ 0, which is where a whole number of half-wavelengths fit:
 *       fₙ = n v / 2L.
 *
 *  Convention: x along the rope in metres, y the sideways displacement, +y up.
 *  SI units throughout.
 */

export const G = 9.81;

/* ── 1. the speed ──────────────────────────────────────────────────────── */

/** v = √(F/μ): the rope's stiffness against its inertia. */
export function waveSpeed(tension: number, mu: number): number {
  return Math.sqrt(tension / mu);
}

/** Tension from a mass hanging over a pulley at rest: F = m g. */
export function hangerTension(mass: number, g = G): number {
  return mass * g;
}

/** Time for a disturbance to cover `distance` along a rope with a hanger of `mass`. */
export function crossingTime(distance: number, mass: number, mu: number, g = G): number {
  return distance / waveSpeed(hangerTension(mass, g), mu);
}

/** The hanger mass that makes a pulse cover `distance` in `time`: m = μ (d/t)² / g. */
export function hangerForCrossing(distance: number, time: number, mu: number, g = G): number {
  return (mu * (distance / time) ** 2) / g;
}

/* ── 2. the travelling form ────────────────────────────────────────────── */

/** A pulse: a Gaussian bump of height `amp` and e-fold half-width `width`,
 *  centred at `centre` at t = 0 and sliding at signed `speed` (+ to the right). */
export interface Pulse { centre: number; amp: number; width: number; speed: number }

const bump = (u: number, w: number) => Math.exp(-((u / w) ** 2));
const bumpSlope = (u: number, w: number) => (-2 * u / (w * w)) * Math.exp(-((u / w) ** 2));

/** The rope's height: the pulses simply add (superposition). */
export function ropeHeight(pulses: readonly Pulse[], x: number, t = 0): number {
  let y = 0;
  for (const p of pulses) y += p.amp * bump(x - p.centre - p.speed * t, p.width);
  return y;
}

/** The rope's slope ∂y/∂x. */
export function ropeSlope(pulses: readonly Pulse[], x: number, t = 0): number {
  let s = 0;
  for (const p of pulses) s += p.amp * bumpSlope(x - p.centre - p.speed * t, p.width);
  return s;
}

/** A bead's velocity ∂y/∂t = Σ −sᵢ · (slope of pulse i). Purely sideways: the
 *  bead has no velocity along the rope. */
export function beadVelocity(pulses: readonly Pulse[], x: number, t = 0): number {
  let v = 0;
  for (const p of pulses) v += -p.speed * p.amp * bumpSlope(x - p.centre - p.speed * t, p.width);
  return v;
}

/** A smooth flick of the hand: up to `amp` and back down over `dur` seconds. */
export function flick(t: number, amp: number, dur: number): number {
  if (t <= 0 || t >= dur) return 0;
  return amp * Math.sin((Math.PI * t) / dur) ** 2;
}

/* ── 3. the discretised rope ───────────────────────────────────────────── */

export interface Rope {
  /** Node spacing, m. Node 0 is the left end, node n−1 the right end. */
  dx: number;
  /** Heights now and one step ago. */
  y: Float64Array;
  yPrev: Float64Array;
  tension: number;
  mu: number;
  /** Damping rate γ in y_tt + γ y_t = v² y_xx, per second. */
  damping: number;
  t: number;
}

export function createRope(opts: { length: number; cells: number; tension: number; mu: number; damping?: number }): Rope {
  const n = opts.cells + 1;
  return {
    dx: opts.length / opts.cells,
    y: new Float64Array(n),
    yPrev: new Float64Array(n),
    tension: opts.tension,
    mu: opts.mu,
    damping: opts.damping ?? 0,
    t: 0,
  };
}

/** Node position, m, with node 0 at `x0`. */
export const nodeX = (r: Rope, i: number, x0 = 0) => x0 + i * r.dx;

/** The one step size at which the grid is exact: dt = dx / v. */
export function ropeDt(r: Rope): number {
  return r.dx / waveSpeed(r.tension, r.mu);
}

/** Change the tension (a new hanger). Keeps the rope's shape and velocity. */
export function setTension(r: Rope, tension: number): void {
  // The velocity lives in y − yPrev over the old dt; rescale it to the new dt.
  const k = Math.sqrt(r.tension / tension);
  for (let i = 0; i < r.y.length; i++) r.yPrev[i] = r.y[i] - (r.y[i] - r.yPrev[i]) * k;
  r.tension = tension;
}

/** Lay pulses on the rope, each already moving at its own speed. `x0` is the
 *  position of node 0. The previous step is the same shapes one dt earlier,
 *  so each pulse starts out travelling rather than splitting in two. */
export function layPulses(r: Rope, pulses: readonly Pulse[], x0 = 0): void {
  const dt = ropeDt(r);
  for (let i = 0; i < r.y.length; i++) {
    const x = nodeX(r, i, x0);
    r.y[i] = ropeHeight(pulses, x, 0);
    r.yPrev[i] = ropeHeight(pulses, x, -dt);
  }
  const last = r.y.length - 1;
  r.y[0] = r.y[last] = r.yPrev[0] = r.yPrev[last] = 0;
  r.t = 0;
}

/** Flatten and still the rope. */
export function stillRope(r: Rope): void {
  r.y.fill(0);
  r.yPrev.fill(0);
}

/**
 * One leapfrog step of y_tt + γ y_t = v² y_xx at Courant number 1:
 *   (1 + γdt/2) yᵢⁿ⁺¹ = yᵢ₊₁ⁿ + yᵢ₋₁ⁿ − (1 − γdt/2) yᵢⁿ⁻¹.
 * The left end is set to `left` (a hand or a shaker); the right end is fixed.
 */
export function stepRope(r: Rope, left = 0): void {
  const dt = ropeDt(r);
  const a = 1 + (r.damping * dt) / 2, b = 1 - (r.damping * dt) / 2;
  const n = r.y.length;
  const next = new Float64Array(n);
  for (let i = 1; i < n - 1; i++) next[i] = (r.y[i + 1] + r.y[i - 1] - b * r.yPrev[i]) / a;
  next[0] = left;
  next[n - 1] = 0;
  r.yPrev = r.y;
  r.y = next;
  r.t += dt;
}

/** Sideways velocity of node i, from the last step (it belongs to t − dt/2). */
export function nodeVelocity(r: Rope, i: number): number {
  return (r.y[i] - r.yPrev[i]) / ropeDt(r);
}

/** Largest |y| over the rope's interior. */
export function maxHeight(r: Rope): number {
  let m = 0;
  for (let i = 1; i < r.y.length - 1; i++) m = Math.max(m, Math.abs(r.y[i]));
  return m;
}

/**
 * The energy the leapfrog rope conserves exactly (with no damping and still
 * ends), taken across the last step:
 *   motion  K = ½ μ dx Σ ((yᵢⁿ − yᵢⁿ⁻¹)/dt)²
 *   stretch U = (F / 2dx) Σ (yᵢ₊₁ⁿ − yᵢⁿ)(yᵢ₊₁ⁿ⁻¹ − yᵢⁿ⁻¹)
 * When the rope is flat, every stretch term has a zero factor, so U = 0 exactly.
 */
export function ropeEnergy(r: Rope): { motion: number; stretch: number; total: number } {
  const dt = ropeDt(r);
  let K = 0, U = 0;
  for (let i = 0; i < r.y.length; i++) K += ((r.y[i] - r.yPrev[i]) / dt) ** 2;
  for (let i = 0; i < r.y.length - 1; i++) U += (r.y[i + 1] - r.y[i]) * (r.yPrev[i + 1] - r.yPrev[i]);
  K *= 0.5 * r.mu * r.dx;
  U *= r.tension / (2 * r.dx);
  return { motion: K, stretch: U, total: K + U };
}

/** Run a rope with pulses laid on it and keep a copy of every step: the
 *  frames a scrubbed scene plays back. Frame k is at t = k dt. */
export function recordRope(r: Rope, steps: number): Float64Array[] {
  const frames = [Float64Array.from(r.y)];
  for (let k = 0; k < steps; k++) { stepRope(r); frames.push(Float64Array.from(r.y)); }
  return frames;
}

/* ── the stopwatch: hand to bead ───────────────────────────────────────── */

/**
 * Times a flick from the hand to a bead down the rope. Both ends of the
 * measurement use the same threshold, a tenth of the flick's height, so a
 * big flick and a small one are judged alike. The rope must be still when
 * the hand starts, or there is nothing clean to time.
 */
export interface Stopwatch {
  state: 'idle' | 'armed' | 'done';
  hist: { t: number; y: number }[];
  handMax: number;
  crossing: number | null;
}

export const createStopwatch = (): Stopwatch => ({ state: 'idle', hist: [], handMax: 0, crossing: null });

const ARM = 0.002; // m

export function stopwatchStep(sw: Stopwatch, t: number, hand: number, atBead: number, ropeStill: boolean): void {
  if (sw.state === 'idle') {
    if (!ropeStill || Math.abs(hand) < ARM) return;
    sw.state = 'armed';
    sw.hist = [];
    sw.handMax = 0;
  }
  if (sw.state !== 'armed') return;
  sw.hist.push({ t, y: hand });
  sw.handMax = Math.max(sw.handMax, Math.abs(hand));
  const th = 0.1 * sw.handMax;
  if (th < ARM || Math.abs(atBead) < th) return;
  const start = sw.hist.find((h) => Math.abs(h.y) >= th);
  if (!start) return;
  sw.crossing = t - start.t;
  sw.state = 'done';
}

/** Flick a still rope by hand and time the pulse to the node nearest `beadX`. */
export function timeFlick(opts: {
  length: number; cells: number; tension: number; mu: number;
  beadX: number; amp: number; dur: number; maxT?: number;
}): number | null {
  const r = createRope(opts);
  const bead = Math.round(opts.beadX / r.dx);
  const sw = createStopwatch();
  const maxT = opts.maxT ?? 10;
  while (r.t < maxT && sw.state !== 'done') {
    const still = maxHeight(r) < ARM;
    stepRope(r, flick(r.t + ropeDt(r), opts.amp, opts.dur));
    stopwatchStep(sw, r.t, r.y[0], r.y[bead], still || sw.state === 'armed');
  }
  return sw.crossing;
}

/* ── 4. the driven rope ────────────────────────────────────────────────── */

export interface Cx { re: number; im: number }
const cx = (re: number, im = 0): Cx => ({ re, im });
const mul = (a: Cx, b: Cx): Cx => cx(a.re * b.re - a.im * b.im, a.re * b.im + a.im * b.re);
const div = (a: Cx, b: Cx): Cx => { const d = b.re * b.re + b.im * b.im; return cx((a.re * b.re + a.im * b.im) / d, (a.im * b.re - a.re * b.im) / d); };
const csin = (z: Cx): Cx => cx(Math.sin(z.re) * Math.cosh(z.im), Math.cos(z.re) * Math.sinh(z.im));
const cexpi = (z: Cx): Cx => { const m = Math.exp(-z.im); return cx(m * Math.cos(z.re), m * Math.sin(z.re)); }; // e^{iz}
const csqrt = (z: Cx): Cx => {
  const r = Math.hypot(z.re, z.im);
  const re = Math.sqrt((r + z.re) / 2);
  const im = Math.sign(z.im || 1) * Math.sqrt(Math.max(0, (r - z.re) / 2));
  return cx(re, im);
};
export const cabs = (z: Cx) => Math.hypot(z.re, z.im);

export interface Drive {
  /** Rope length between the shaker (x = 0) and the fixed end (x = L), m. */
  length: number;
  /** Wave speed, m/s. */
  speed: number;
  /** Damping rate γ, per second. */
  damping: number;
  /** Shaker amplitude, m. */
  amp: number;
  /** Shaker frequency, Hz. */
  freq: number;
}

/** Complex wavenumber of the damped rope: k² = (ω² − iγω)/v². */
function wavenumber(d: Drive): Cx {
  const w = 2 * Math.PI * d.freq;
  const k = csqrt(cx(w * w, -d.damping * w));
  return cx(k.re / d.speed, k.im / d.speed);
}

/** Settled complex amplitude Y(x) = A sin k(L − x) / sin kL, so y = Re[Y e^{iωt}]. */
export function drivenAmplitude(d: Drive, x: number): Cx {
  const k = wavenumber(d);
  return mul(cx(d.amp), div(csin(mul(k, cx(d.length - x))), csin(mul(k, cx(d.length)))));
}

/** The settled rope's height at x and time t. */
export function drivenHeight(d: Drive, x: number, t: number): number {
  const Y = drivenAmplitude(d, x), w = 2 * Math.PI * d.freq;
  return Y.re * Math.cos(w * t) - Y.im * Math.sin(w * t);
}

/**
 * The same settled rope as two travellers. Writing sin as two exponentials,
 * Y = R e^{−ikx} + Lf e^{ikx}: the first slides right (away from the shaker),
 * the second slides left (back from the wall, flipped by it).
 */
export function drivenTravellers(d: Drive, x: number): { right: Cx; left: Cx } {
  const k = wavenumber(d);
  const s = csin(mul(k, cx(d.length)));
  const twoIs = mul(cx(0, 2), s);
  const right = mul(div(mul(cx(d.amp), cexpi(mul(k, cx(d.length)))), twoIs), cexpi(mul(k, cx(-x))));
  const left = mul(div(mul(cx(-d.amp), cexpi(mul(k, cx(-d.length)))), twoIs), cexpi(mul(k, cx(x))));
  return { right, left };
}

/** Height of one complex traveller at time t. */
export const travellerHeight = (Y: Cx, freq: number, t: number) =>
  Y.re * Math.cos(2 * Math.PI * freq * t) - Y.im * Math.sin(2 * Math.PI * freq * t);

/** fₙ = n v / 2L: n half-wavelengths fit between two still ends. */
export function harmonic(n: number, length: number, speed: number): number {
  return (n * speed) / (2 * length);
}

/** Widest settled swing anywhere on the rope, m (sampled). */
export function widestSwing(d: Drive, samples = 400): number {
  let m = 0;
  for (let i = 0; i <= samples; i++) m = Math.max(m, cabs(drivenAmplitude(d, (i / samples) * d.length)));
  return m;
}

/** Positions where the settled swing has a local minimum inside the rope: the still points.
 *  The shaker end and the wall are excluded: they are ends, not points the wave chose. */
export function stillPoints(d: Drive, samples = 800): number[] {
  const a = Array.from({ length: samples + 1 }, (_, i) => cabs(drivenAmplitude(d, (i / samples) * d.length)));
  const out: number[] = [];
  const edge = Math.ceil(samples * 0.03);
  for (let i = edge; i < samples - edge; i++) if (a[i] < a[i - 1] && a[i] <= a[i + 1]) out.push((i / samples) * d.length);
  return out;
}

/**
 * How the rope answers a shaker: the nearest harmonic n, and whether the
 * swing is resonant there (at least half the swing at fₙ itself).
 */
export function drivenPattern(d: Drive): { n: number; swing: number; peak: number; resonant: boolean } {
  const n = Math.max(1, Math.round((2 * d.length * d.freq) / d.speed));
  const swing = widestSwing(d);
  const peak = widestSwing({ ...d, freq: harmonic(n, d.length, d.speed) });
  return { n, swing, peak, resonant: swing >= 0.5 * peak };
}
