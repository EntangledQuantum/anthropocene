/** Periodic motion: the universal small tick, and what happens when you push it.
 *
 *  Chapter 14's single source of truth. Three families live here:
 *
 *    1. Simple harmonic motion as the projection of uniform circular motion —
 *       the chapter's reusable picture, written so that x, v and a all come
 *       from one rotating vector rather than from three separate formulas.
 *    2. The real pendulum, exactly. The small-angle period is the famous
 *       amplitude-independent one; the exact period is an elliptic integral,
 *       and the gap between them is the most surprising fact in the chapter.
 *    3. The driven damped oscillator, both as a closed-form steady state and
 *       as an integration that actually shows the transient arriving.
 *
 *  The oscillator's potential landscape lives in `landscape.ts` and is not
 *  duplicated here; this module imports it where a period has to be measured
 *  from a real run rather than derived.
 */

/** Standard gravity, m/s². */
export const G = 9.80665;

/* ── simple harmonic motion as a shadow on the wall ───────────────────────
   A point goes round a circle of radius A at a steady ω. Its shadow on one
   axis is x = A cos(ωt + φ). The velocity of the shadow is the horizontal
   component of the tangent vector (length Aω), and its acceleration is the
   horizontal component of the centripetal vector (length Aω², pointing at
   the centre) — which is the whole of ẍ = −ω²x, drawn rather than derived.
   ──────────────────────────────────────────────────────────────────────── */

export interface Shm {
  /** Amplitude — the radius of the circle. */
  A: number;
  /** Angular frequency, rad/s — how fast the point goes round. */
  omega: number;
  /** Phase constant, rad — where on the circle it was at t = 0. */
  phase: number;
}

/** Angle of the rotating point at time t. */
export const shmAngle = (s: Shm, t: number): number => s.omega * t + s.phase;

export const shmX = (s: Shm, t: number): number => s.A * Math.cos(shmAngle(s, t));
export const shmV = (s: Shm, t: number): number => -s.A * s.omega * Math.sin(shmAngle(s, t));
export const shmA = (s: Shm, t: number): number => -s.A * s.omega ** 2 * Math.cos(shmAngle(s, t));

export const shmPeriod = (s: Shm): number => (2 * Math.PI) / s.omega;
export const shmFrequency = (s: Shm): number => s.omega / (2 * Math.PI);
export const shmMaxSpeed = (s: Shm): number => s.A * s.omega;
export const shmMaxAccel = (s: Shm): number => s.A * s.omega ** 2;

/** The point on the circle, and its two vectors, in circle coordinates.
 *
 *  Returned together rather than as three calls because the pedagogical claim
 *  is that they are one object seen three ways. `vx` and `ax` are the shadow's
 *  velocity and acceleration; that they are the x-components of `v` and `a` is
 *  the entire projection argument. */
export interface CirclePoint {
  angle: number;
  /** Position of the rotating point. */
  px: number;
  py: number;
  /** Tangent velocity vector of the rotating point, length Aω. */
  vx: number;
  vy: number;
  /** Centripetal acceleration vector, length Aω², pointing at the centre. */
  ax: number;
  ay: number;
}

export function circlePoint(s: Shm, t: number): CirclePoint {
  const th = shmAngle(s, t);
  const c = Math.cos(th);
  const sn = Math.sin(th);
  return {
    angle: th,
    px: s.A * c,
    py: s.A * sn,
    vx: -s.A * s.omega * sn,
    vy: s.A * s.omega * c,
    ax: -s.A * s.omega ** 2 * c,
    ay: -s.A * s.omega ** 2 * sn,
  };
}

export interface ShmSample {
  t: number;
  x: number;
  v: number;
  a: number;
}

export function shmSamples(s: Shm, t0: number, t1: number, n = 241): ShmSample[] {
  return Array.from({ length: n }, (_, i) => {
    const t = t0 + ((t1 - t0) * i) / (n - 1);
    return { t, x: shmX(s, t), v: shmV(s, t), a: shmA(s, t) };
  });
}

/** Angular frequency of a mass on a spring. The only two things that set the
 *  tick — and the amplitude is not one of them. */
export const springOmega = (k: number, mass: number): number => Math.sqrt(k / mass);

/* ── the real pendulum ────────────────────────────────────────────────────
   Small-angle: sin θ ≈ θ makes the pendulum a harmonic oscillator and its
   period amplitude-independent. Exactly: it is not, and the correction is an
   elliptic integral.
   ──────────────────────────────────────────────────────────────────────── */

/** Complete elliptic integral of the first kind, K(m), in the PARAMETER
 *  convention m = k². Computed by the arithmetic–geometric mean, which
 *  converges quadratically: six iterations is machine precision except right
 *  at m = 1, where K genuinely diverges (a pendulum balanced at the top never
 *  comes back down, so the divergence is the physics, not a bug). */
export function ellipticK(m: number): number {
  if (m >= 1) return Number.POSITIVE_INFINITY;
  if (m <= 0) return Math.PI / 2;
  let a = 1;
  let b = Math.sqrt(1 - m);
  for (let i = 0; i < 60; i++) {
    if (Math.abs(a - b) < 1e-16 * Math.abs(a)) break;
    const an = (a + b) / 2;
    b = Math.sqrt(a * b);
    a = an;
  }
  return Math.PI / (2 * a);
}

/** Period of a simple pendulum in the small-angle limit: 2π√(L/g). */
export const smallAnglePeriod = (L = 1, g = G): number => 2 * Math.PI * Math.sqrt(L / g);

/** Exact period of a simple pendulum released from rest at θ₀.
 *
 *  T = 4√(L/g) K(sin²(θ₀/2)). Reduces to the small-angle period as θ₀ → 0 and
 *  diverges as θ₀ → π. */
export function pendulumPeriod(theta0: number, L = 1, g = G): number {
  const a = Math.abs(theta0);
  if (a === 0) return smallAnglePeriod(L, g);
  const k = Math.sin(a / 2);
  return 4 * Math.sqrt(L / g) * ellipticK(k * k);
}

/** T(θ₀)/T₀ — how much slower the real swing is than the textbook one.
 *  Dimensionless, so it does not care about L or g. */
export const pendulumPeriodRatio = (theta0: number): number =>
  pendulumPeriod(theta0) / smallAnglePeriod();

/** The two-term series everyone quotes: T/T₀ ≈ 1 + θ₀²/16 + 11θ₀⁴/3072. */
export const pendulumSeriesRatio = (theta0: number): number =>
  1 + theta0 ** 2 / 16 + (11 * theta0 ** 4) / 3072;

/** Release angle at which the exact period first exceeds the small-angle
 *  period by the given fraction. Bisection on the exact ratio — the answer a
 *  `<Tune>` is graded against must not be the series approximation of itself. */
export function amplitudeForPeriodExcess(fraction: number): number {
  let lo = 1e-6;
  let hi = Math.PI * 0.999;
  const f = (th: number) => pendulumPeriodRatio(th) - (1 + fraction);
  if (f(hi) < 0) return hi;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    if (f(mid) < 0) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/* ── damping and driving ──────────────────────────────────────────────────
   ẍ + 2βẋ + ω₀²x = f₀ cos(ωt),  f₀ = F₀/m.

   β rather than γ = 2β, consistently, because the three frequencies this
   chapter has to keep apart — ringing, amplitude peak, phase crossing — are
   cleanest written in β, and mixing conventions is how people lose a factor
   of two and never find it.
   ──────────────────────────────────────────────────────────────────────── */

export interface Driven {
  /** Undamped natural angular frequency, rad/s. */
  omega0: number;
  /** Damping coefficient β, rad/s. The free amplitude decays as e^(−βt). */
  beta: number;
  /** Drive amplitude per unit mass, f₀ = F₀/m, in m/s². */
  drive: number;
  mass: number;
}

export const DEFAULT_DRIVEN: Driven = { omega0: 1, beta: 0.12, drive: 1, mass: 1 };

/** Steady-state amplitude of the response at driving frequency ω. */
export const steadyAmplitude = (p: Driven, omega: number): number =>
  p.drive / Math.hypot(p.omega0 ** 2 - omega * omega, 2 * p.beta * omega);

/** How far the response lags the drive, in radians, on (0, π).
 *
 *  atan2 rather than atan: past ω₀ the denominator goes negative and a plain
 *  arctangent folds the curve back on itself, turning the S into a sawtooth
 *  and destroying the one feature worth seeing. */
export const steadyPhaseLag = (p: Driven, omega: number): number =>
  Math.atan2(2 * p.beta * omega, p.omega0 ** 2 - omega * omega);

/** Response to a drive so slow the mass just follows it: f₀/ω₀². The natural
 *  yardstick for "how much did resonance buy you". */
export const staticResponse = (p: Driven): number => p.drive / p.omega0 ** 2;

/** Frequency at which the AMPLITUDE peaks: √(ω₀² − 2β²). Zero once the damping
 *  is heavy enough (β ≥ ω₀/√2) that the response just sags from its static
 *  value with no peak at all. */
export function resonantFrequency(p: Driven): number {
  const s = p.omega0 ** 2 - 2 * p.beta ** 2;
  return s > 0 ? Math.sqrt(s) : 0;
}

/** Frequency at which a kicked, undriven oscillator actually rings:
 *  √(ω₀² − β²). Different from both ω₀ and the amplitude peak. */
export function ringingFrequency(p: Driven): number {
  const s = p.omega0 ** 2 - p.beta ** 2;
  return s > 0 ? Math.sqrt(s) : 0;
}

export const qualityFactor = (p: Driven): number => p.omega0 / (2 * p.beta);

/** Peak amplitude divided by the static response. Tends to Q for light
 *  damping, and is not equal to it. */
export function peakGain(p: Driven): number {
  const wr = resonantFrequency(p);
  return steadyAmplitude(p, wr) / staticResponse(p);
}

/** Cycle-averaged power the drive delivers: ⟨P⟩ = m β ω² A².
 *
 *  Peaks exactly at ω = ω₀ for every β — unlike the amplitude, which peaks
 *  lower. At ω₀ the response lags by exactly 90°, so the drive is in phase
 *  with the velocity and none of the push is wasted. */
export const averagePower = (p: Driven, omega: number): number =>
  p.mass * p.beta * omega * omega * steadyAmplitude(p, omega) ** 2;

/** The two frequencies where the delivered power has fallen to half its peak,
 *  found by bisection on the computed power curve.
 *
 *  Closed form says ω± = ∓β + √(ω₀² + β²), so the width is exactly 2β and
 *  Q = ω₀/Δω with no light-damping approximation. Bisecting the actual curve
 *  rather than returning 2β is the honest version: the test then checks that
 *  the measured width and the formula are the same number. */
export function halfPowerWidth(p: Driven): { lo: number; hi: number; width: number } {
  const peak = averagePower(p, p.omega0);
  const half = peak / 2;
  const bisect = (a: number, b: number) => {
    let loW = a;
    let hiW = b;
    for (let i = 0; i < 200; i++) {
      const mid = (loW + hiW) / 2;
      if (averagePower(p, mid) > half) hiW = mid;
      else loW = mid;
    }
    return (loW + hiW) / 2;
  };
  // Below ω₀ the power rises to the peak; above it, it falls. Bracket each
  // side generously — 0 has zero power and 8ω₀ + 8β is far past the shoulder.
  const lo = bisect(1e-9, p.omega0);
  const hi = bisect(8 * (p.omega0 + p.beta), p.omega0);
  return { lo, hi, width: hi - lo };
}

/** Damping that makes the resonance peak exactly `gain` times the static
 *  response. Inverts ω₀²/(2β√(ω₀²−β²)) by bisection. */
export function betaForPeakGain(gain: number, omega0 = 1): number {
  const g = (beta: number) => peakGain({ omega0, beta, drive: 1, mass: 1 });
  let lo = 1e-9;
  let hi = omega0 / Math.SQRT2 - 1e-9;
  // g is monotone decreasing in β on this interval.
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    if (g(mid) > gain) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

export type DampingRegime = 'undamped' | 'under' | 'critical' | 'over';

/** Which of the three stories a free oscillator tells. Critical damping is a
 *  knife edge, so it is reported for a band rather than an exact equality. */
export function dampingRegime(p: Driven, tol = 1e-3): DampingRegime {
  if (p.beta <= 0) return 'undamped';
  const r = p.beta / p.omega0;
  if (Math.abs(r - 1) <= tol) return 'critical';
  return r < 1 ? 'under' : 'over';
}

/* ── integrating the real thing ──────────────────────────────────────────── */

export interface DrivenState {
  t: number;
  x: number;
  v: number;
  /** The drive force per unit mass at this instant, for drawing the push. */
  f: number;
}

/** One RK4 step of ẍ = −ω₀²x − 2βẋ + f₀cos(ωt).
 *
 *  RK4 rather than the Verlet used on the potential track: Verlet's energy
 *  bound is the right property for a conservative landscape, and exactly the
 *  wrong tool here, where the velocity-dependent damping term is half the
 *  physics. Plain arrays, the math visible in the shape of the expression. */
export function drivenStep(
  p: Driven,
  omega: number,
  x: number,
  v: number,
  t: number,
  dt: number,
): [number, number] {
  const acc = (xx: number, vv: number, tt: number) =>
    -(p.omega0 ** 2) * xx - 2 * p.beta * vv + p.drive * Math.cos(omega * tt);

  const k1x = v;
  const k1v = acc(x, v, t);
  const k2x = v + (dt / 2) * k1v;
  const k2v = acc(x + (dt / 2) * k1x, v + (dt / 2) * k1v, t + dt / 2);
  const k3x = v + (dt / 2) * k2v;
  const k3v = acc(x + (dt / 2) * k2x, v + (dt / 2) * k2v, t + dt / 2);
  const k4x = v + dt * k3v;
  const k4v = acc(x + dt * k3x, v + dt * k3v, t + dt);

  return [
    x + (dt / 6) * (k1x + 2 * k2x + 2 * k3x + k4x),
    v + (dt / 6) * (k1v + 2 * k2v + 2 * k3v + k4v),
  ];
}

export interface DrivenRunOptions {
  x0?: number;
  v0?: number;
  dt?: number;
  /** How long to run, in units of the DRIVE period. */
  periods?: number;
  /** Samples returned; the integration always uses dt. */
  samples?: number;
}

/** Run the driven oscillator from rest and keep the whole history, transient
 *  and all. The transient is not noise to be discarded — "resonance takes time
 *  to build" is half of why resonance is not infinite. */
export function runDriven(p: Driven, omega: number, opts: DrivenRunOptions = {}): DrivenState[] {
  const T = (2 * Math.PI) / omega;
  const periods = opts.periods ?? 20;
  const tEnd = periods * T;
  const dt = opts.dt ?? T / 200;
  const steps = Math.max(1, Math.round(tEnd / dt));
  const keep = Math.max(1, Math.floor(steps / (opts.samples ?? steps)));

  let x = opts.x0 ?? 0;
  let v = opts.v0 ?? 0;
  const out: DrivenState[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i * dt;
    if (i % keep === 0) out.push({ t, x, v, f: p.drive * Math.cos(omega * t) });
    [x, v] = drivenStep(p, omega, x, v, t, dt);
  }
  return out;
}

/** Amplitude and phase lag MEASURED from an integration, not read off the
 *  formula.
 *
 *  Runs until the transient has decayed (it dies as e^(−βt), so a few times
 *  1/β), then projects the response onto cos(ωt) and sin(ωt) over a whole
 *  number of drive periods. Those two integrals are the Fourier coefficients
 *  of the response at the drive frequency, and together they are exactly
 *  A cos(ωt − δ). A widget that prints this next to the closed form is making
 *  a falsifiable claim rather than drawing a curve it was told to draw. */
export function measuredResponse(
  p: Driven,
  omega: number,
  opts: { periods?: number; dt?: number } = {},
): { amplitude: number; phaseLag: number } {
  const T = (2 * Math.PI) / omega;
  const dt = opts.dt ?? T / 400;

  // Settle for several damping times, rounded up to a whole drive period.
  const settleTime = Math.max(6 / Math.max(p.beta, 1e-3), 8 * T);
  const settleSteps = Math.ceil(settleTime / dt);

  let x = 0;
  let v = 0;
  let t = 0;
  for (let i = 0; i < settleSteps; i++) {
    [x, v] = drivenStep(p, omega, x, v, t, dt);
    t += dt;
  }

  // Then average over a whole number of drive periods, so the projection is
  // clean: ∫cos·sin over complete cycles is zero and the two coefficients do
  // not leak into one another.
  const cycles = opts.periods ?? 12;
  const window = cycles * T;
  const n = Math.round(window / dt);
  let cSum = 0;
  let sSum = 0;
  for (let i = 0; i < n; i++) {
    const c = Math.cos(omega * t);
    const s = Math.sin(omega * t);
    cSum += x * c;
    sSum += x * s;
    [x, v] = drivenStep(p, omega, x, v, t, dt);
    t += dt;
  }
  const cCoef = (2 * cSum) / n;
  const sCoef = (2 * sSum) / n;

  // x ≈ cCoef·cos(ωt) + sCoef·sin(ωt) = A cos(ωt − δ).
  return { amplitude: Math.hypot(cCoef, sCoef), phaseLag: Math.atan2(sCoef, cCoef) };
}

/** Sampled response curves for plotting. Amplitude as a gain relative to the
 *  static response, so the vertical axis means "how much did the tuning buy
 *  you" rather than carrying arbitrary units. */
export function responseCurve(
  p: Driven,
  wLo: number,
  wHi: number,
  n = 240,
): { omega: number; gain: number; lagDeg: number; power: number }[] {
  const stat = staticResponse(p);
  return Array.from({ length: n }, (_, i) => {
    const omega = wLo + ((wHi - wLo) * i) / (n - 1);
    return {
      omega,
      gain: steadyAmplitude(p, omega) / stat,
      lagDeg: (steadyPhaseLag(p, omega) * 180) / Math.PI,
      power: averagePower(p, omega),
    };
  });
}
