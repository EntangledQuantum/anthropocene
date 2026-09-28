/** Chapter 31: alternating current, with phasors.
 *
 *  A sinusoid v(t) = V₀ sin(ωt + φ) is the shadow of an arrow of length V₀
 *  turning anticlockwise at ω: its height above the axis. The arrow, frozen at
 *  t = 0, is the complex number V₀ e^{iφ}, and the shadow is Im(V₀ e^{iφ} e^{iωt}).
 *  We use the imaginary part (the height) so that the picture on screen, a
 *  vertical shadow traced out to the right, is exactly the formula.
 *
 *  Adding two sinusoids of the same frequency is adding their arrows, and an
 *  element's opposition to current is a complex impedance Z, with V = Z I:
 *    resistor  Z = R          current in step with voltage
 *    inductor  Z = iωL        current a quarter cycle behind  (v = L di/dt)
 *    capacitor Z = 1/(iωC)    current a quarter cycle ahead   (i = C dv/dt)
 *
 *  Real SI units throughout. Every number a chapter-31 scene prints comes from
 *  here, and ac.test.ts pins each claim the lessons make, most of them twice:
 *  once by complex arithmetic and once by stepping the real circuit in time.
 */

/* ── complex numbers, just enough ─────────────────────────────────────── */

export interface Cx { re: number; im: number }

export const cx = (re: number, im = 0): Cx => ({ re, im });
export const polar = (r: number, theta: number): Cx => ({ re: r * Math.cos(theta), im: r * Math.sin(theta) });
export const add = (...zs: Cx[]): Cx => zs.reduce((a, b) => ({ re: a.re + b.re, im: a.im + b.im }), cx(0));
export const sub = (a: Cx, b: Cx): Cx => ({ re: a.re - b.re, im: a.im - b.im });
export const mul = (a: Cx, b: Cx): Cx => ({ re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re });
export const div = (a: Cx, b: Cx): Cx => {
  const d = b.re * b.re + b.im * b.im;
  return { re: (a.re * b.re + a.im * b.im) / d, im: (a.im * b.re - a.re * b.im) / d };
};
export const abs = (z: Cx): number => Math.hypot(z.re, z.im);
export const arg = (z: Cx): number => Math.atan2(z.im, z.re);

/** Wrap an angle into (−π, π]. */
export function wrap(theta: number): number {
  let t = theta % (2 * Math.PI);
  if (t <= -Math.PI) t += 2 * Math.PI;
  if (t > Math.PI) t -= 2 * Math.PI;
  return t;
}
export const deg = (rad: number) => (rad * 180) / Math.PI;
export const rad = (d: number) => (d * Math.PI) / 180;

/* ── phasors: the arrow and its shadow ────────────────────────────────── */

/** The shadow of phasor `p` turning at ω, at time t: Im(p e^{iωt}). */
export function shadow(p: Cx, omega: number, t: number): number {
  return abs(p) * Math.sin(omega * t + arg(p));
}

/** How far `a` is ahead of `b`, in radians, in (−π, π]. Positive means `a`
 *  reaches each peak first. */
export const lead = (a: Cx, b: Cx): number => wrap(arg(a) - arg(b));

/** The arrow angle at which a sinusoid of peak `peak` reads `value`, on its
 *  rising or its falling side. Two angles share each height; only the
 *  direction of travel tells them apart. */
export function angleAt(value: number, peak: number, falling: boolean): number {
  const a = Math.asin(Math.max(-1, Math.min(1, value / peak)));
  return wrap(falling ? Math.PI - a : a);
}

/** True if the shadow is rising at arrow angle θ (the arrow turns anticlockwise). */
export const risingAt = (theta: number) => Math.cos(theta) > 0;

/* ── elements ─────────────────────────────────────────────────────────── */

export const zR = (R: number): Cx => cx(R);
export const zL = (L: number, omega: number): Cx => cx(0, omega * L);
export const zC = (C: number, omega: number): Cx => cx(0, -1 / (omega * C));

/** Reactances, ohms. */
export const xL = (L: number, omega: number) => omega * L;
export const xC = (C: number, omega: number) => 1 / (omega * C);

/** Current phasor through an impedance with voltage phasor V across it. */
export const currentThrough = (V: Cx, Z: Cx): Cx => div(V, Z);

/* ── RMS and average power, by honest integration ─────────────────────── */

/** Root-mean-square of f over one period T: √( (1/T) ∫ f² dt ), by the
 *  composite Simpson rule on n (even) intervals. */
export function rms(f: (t: number) => number, T: number, n = 2000): number {
  return Math.sqrt(meanOver((t) => f(t) ** 2, T, n));
}

/** Mean of f over [0, T] by composite Simpson. */
export function meanOver(f: (t: number) => number, T: number, n = 2000): number {
  const m = n % 2 ? n + 1 : n;
  const h = T / m;
  let s = f(0) + f(T);
  for (let k = 1; k < m; k++) s += (k % 2 ? 4 : 2) * f(k * h);
  return (s * h) / 3 / T;
}

/** Average power delivered to an element with voltage v(t) and current i(t)
 *  over one period: the mean of v·i. */
export const averagePower = (v: (t: number) => number, i: (t: number) => number, T: number) =>
  meanOver((t) => v(t) * i(t), T);

/** Mains, European style: 230 V is the RMS; the peak is what the wire reaches. */
export const MAINS = { vrms: 230, hz: 50, peak: 230 * Math.SQRT2 } as const;

/** The heater in the glow-matching scene, ohms. */
export const HEATER_R = 100;

/** Average power a resistor R takes from a sine of peak V₀, measured by
 *  integrating v²/R over one cycle. */
export function sinePowerInResistor(V0: number, R: number, hz: number): number {
  const w = 2 * Math.PI * hz;
  return meanOver((t) => (V0 * Math.sin(w * t)) ** 2 / R, 1 / hz);
}

/** The steady (DC) voltage that heats the same resistor just as fast as a
 *  sine of peak V₀: √(P R) with P measured by integration. */
export const dcEquivalent = (V0: number, hz = 50) => Math.sqrt(sinePowerInResistor(V0, 1, hz));

/* ── one element on a sine source: the lead-or-lag scenes ─────────────── */

/** A 10 V-peak, 50 Hz source across one element. The capacitor and coil are
 *  chosen so both carry about 31 mA peak. */
export const SINGLE = { V0: 10, hz: 50, C: 10e-6, L: 1.0 } as const;

export type Element = 'capacitor' | 'inductor' | 'resistor';

/** Current phasor through `el` when the source phasor is V₀∠0. */
export function singleCurrent(el: Element, s: { V0: number; hz: number; C: number; L: number; R?: number } = SINGLE): Cx {
  const w = 2 * Math.PI * s.hz;
  const Z = el === 'capacitor' ? zC(s.C, w) : el === 'inductor' ? zL(s.L, w) : zR(s.R ?? 100);
  return currentThrough(cx(s.V0), Z);
}

/* ── series RLC ───────────────────────────────────────────────────────── */

export interface Rlc { R: number; L: number; C: number }

export interface SeriesResponse {
  Z: Cx;
  /** Current phasor, source voltage taken as Vs∠0. */
  I: Cx;
  VR: Cx; VL: Cx; VC: Cx;
  /** How far the current leads the source voltage, radians. */
  phase: number;
}

/** Steady-state response of R, L and C in series across a source phasor Vs∠0. */
export function seriesRLC(c: Rlc, Vs: number, omega: number): SeriesResponse {
  const Z = add(zR(c.R), zL(c.L, omega), zC(c.C, omega));
  const I = div(cx(Vs), Z);
  return {
    Z, I,
    VR: mul(I, zR(c.R)), VL: mul(I, zL(c.L, omega)), VC: mul(I, zC(c.C, omega)),
    phase: lead(I, cx(Vs)),
  };
}

export const resonantOmega = (L: number, C: number) => 1 / Math.sqrt(L * C);
export const qualityFactor = (c: Rlc) => Math.sqrt(c.L / c.C) / c.R;

/** The tuning scene: a 10 V (rms) supply, an 80 Ω lamp, 40 mH, 0.25 µF.
 *  ω₀ = 10⁴ rad/s (f₀ ≈ 1592 Hz), Q = 5, so at resonance the coil and the
 *  capacitor each have 50 V across them. */
export const TUNE = { R: 80, L: 0.04, C: 0.25e-6, Vs: 10 } as const;

/** The same circuit stepped in time: returns the steady-state peak of the
 *  capacitor voltage and of the current, measured from the run, for a drive
 *  Vs_peak·sin(ωt). RK4 on q'' = (v(t) − R q' − q/C)/L. Used by the tests to
 *  confirm that the phasor answer is what a real circuit does. */
export function simulateSeries(c: Rlc, VsPeak: number, omega: number, cycles = 60, perCycle = 400) {
  const T = (2 * Math.PI) / omega, h = T / perCycle;
  const f = (t: number, q: number, i: number): [number, number] =>
    [i, (VsPeak * Math.sin(omega * t) - c.R * i - q / c.C) / c.L];
  let q = 0, i = 0, t = 0;
  let qMax = 0, iMax = 0, vTop = -Infinity, iTop = -Infinity, tPeakV = 0, tPeakI = 0;
  for (let k = 0; k < cycles * perCycle; k++) {
    const [a1, b1] = f(t, q, i);
    const [a2, b2] = f(t + h / 2, q + (h / 2) * a1, i + (h / 2) * b1);
    const [a3, b3] = f(t + h / 2, q + (h / 2) * a2, i + (h / 2) * b2);
    const [a4, b4] = f(t + h, q + h * a3, i + h * b3);
    q += (h / 6) * (a1 + 2 * a2 + 2 * a3 + a4);
    i += (h / 6) * (b1 + 2 * b2 + 2 * b3 + b4);
    t += h;
    // measure over the last full cycle, long after the start-up transient
    if (k >= (cycles - 1) * perCycle) {
      qMax = Math.max(qMax, Math.abs(q));
      iMax = Math.max(iMax, Math.abs(i));
      const v = VsPeak * Math.sin(omega * t);
      if (v > vTop) { vTop = v; tPeakV = t; }
      if (i > iTop) { iTop = i; tPeakI = t; }
    }
  }
  /** How far the current's peak leads the supply's, radians, in (−π, π]. */
  const currentLead = wrap(((tPeakV - tPeakI) / T) * 2 * Math.PI);
  return { vcPeak: qMax / c.C, iPeak: iMax, currentLead, T };
}

/* ── the radio: tune the capacitor, not the frequency ─────────────────── */

/** An AM tuner: a 250 µH coil and a 40–450 pF variable capacitor sweep
 *  0.47–1.6 MHz, the AM band. R sets how sharp it is (Q ≈ 30 at 1 MHz). */
export const RADIO = {
  L: 250e-6, R: 50, cMin: 40e-12, cMax: 450e-12,
  stations: [0.6e6, 0.85e6, 1.2e6, 1.45e6],
} as const;

/** The capacitance that tunes the radio's coil to frequency f (Hz). */
export const capForFrequency = (f: number, L: number = RADIO.L) => 1 / ((2 * Math.PI * f) ** 2 * L);
/** The frequency (Hz) the radio rings at with capacitance C. */
export const tunedFrequency = (C: number, L: number = RADIO.L) => resonantOmega(L, C) / (2 * Math.PI);

/** A station at frequency f, as heard with capacitance C: its current as a
 *  fraction of what it gives when tuned exactly. 1 on the nose. */
export function reception(f: number, C: number): number {
  const w = 2 * Math.PI * f;
  const c = { R: RADIO.R, L: RADIO.L, C };
  return abs(seriesRLC(c, 1, w).I) * RADIO.R;
}
