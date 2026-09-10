/** Fourier (and Chebyshev) spectral differentiation.
 *
 *  Local finite differences look two neighbours away. A spectral method fits
 *  a global trigonometric (or polynomial) interpolant through every sample
 *  and differentiates that. On a periodic grid the interpolant is a sum of
 *  e^{ikx}, so differentiation is multiplication by ik in frequency space:
 *
 *      û_k  →  (ik)^m û_k
 *
 *  Trefethen, Spectral Methods in MATLAB, ch. 1–5. The DFT is written out
 *  as a sum — N stays small in these lessons, and the formula should be
 *  readable as the math. */

export const TWO_PI = 2 * Math.PI;

/** Floor used on log-error plots so a lucky 0 still has a place to sit. */
export const ERROR_FLOOR = 1e-18;

export type Fn = (x: number) => number;

/* ── grid ──────────────────────────────────────────────────────────────── */

/** Equi-spaced periodic nodes x_j = 2π j / n, j = 0..n-1. */
export const periodicGrid = (n: number): number[] =>
  Array.from({ length: n }, (_, j) => (TWO_PI * j) / n);

/** Shortest distance on the circle [0, 2π). */
export function circularDistance(a: number, b: number): number {
  const d = Math.abs(a - b) % TWO_PI;
  return Math.min(d, TWO_PI - d);
}

/* ── DFT ───────────────────────────────────────────────────────────────── */

export interface Spectrum {
  re: number[];
  im: number[];
}

/** Unnormalised DFT: X[k] = Σ_j x[j] exp(-2π i jk / n). Real input. */
export function dft(x: number[]): Spectrum {
  const n = x.length;
  const re = new Array<number>(n).fill(0);
  const im = new Array<number>(n).fill(0);
  for (let k = 0; k < n; k++) {
    let rk = 0;
    let ik = 0;
    for (let j = 0; j < n; j++) {
      const theta = (TWO_PI * k * j) / n;
      rk += x[j] * Math.cos(theta);
      ik -= x[j] * Math.sin(theta);
    }
    re[k] = rk;
    im[k] = ik;
  }
  return { re, im };
}

/** Inverse DFT: x[j] = (1/n) Σ_k X[k] exp(+2π i jk / n). */
export function idft(spec: Spectrum): { re: number[]; im: number[] } {
  const n = spec.re.length;
  const re = new Array<number>(n).fill(0);
  const im = new Array<number>(n).fill(0);
  for (let j = 0; j < n; j++) {
    let rj = 0;
    let ij = 0;
    for (let k = 0; k < n; k++) {
      const theta = (TWO_PI * k * j) / n;
      const c = Math.cos(theta);
      const s = Math.sin(theta);
      rj += spec.re[k] * c - spec.im[k] * s;
      ij += spec.re[k] * s + spec.im[k] * c;
    }
    re[j] = rj / n;
    im[j] = ij / n;
  }
  return { re, im };
}

/**
 * DFT wave-numbers, Trefethen p5.
 *
 * For even n the Nyquist mode k = n/2 is set to 0 on odd-order derivatives:
 * that mode is a cosine on the grid, and its derivative (a Nyquist sine)
 * vanishes at every node — the grid cannot see it.
 */
export function waveNumbers(n: number, order = 1): number[] {
  const k = new Array<number>(n);
  const half = Math.floor(n / 2);
  for (let i = 0; i <= half; i++) k[i] = i;
  for (let i = half + 1; i < n; i++) k[i] = i - n;
  if (n % 2 === 0 && order % 2 === 1) k[half] = 0;
  return k;
}

/* ── differentiation ───────────────────────────────────────────────────── */

/** Multiply a spectrum by (i κ)^order, in place. */
function multiplyIk(spec: Spectrum, order: number): void {
  const n = spec.re.length;
  const kappa = waveNumbers(n, order);
  for (let m = 0; m < order; m++) {
    for (let k = 0; k < n; k++) {
      const wr = -kappa[k] * spec.im[k];
      const wi = kappa[k] * spec.re[k];
      spec.re[k] = wr;
      spec.im[k] = wi;
    }
  }
}

/** m-th spectral derivative of samples on the periodic grid. */
export function fourierDerivative(samples: number[], order = 1): number[] {
  const spec = dft(samples);
  multiplyIk(spec, order);
  return idft(spec).re;
}

/**
 * Periodic central difference on the same grid — the local stencil the
 * spectral derivative is competing with. Second order, two neighbours.
 */
export function periodicCentralDiff(samples: number[]): number[] {
  const n = samples.length;
  const h = TWO_PI / n;
  return samples.map((_, j) => {
    const left = samples[(j - 1 + n) % n];
    const right = samples[(j + 1) % n];
    return (right - left) / (2 * h);
  });
}

/* ── interpolant ───────────────────────────────────────────────────────── */

/**
 * Trigonometric interpolant of `samples`, evaluated at arbitrary x.
 *
 * p(x) = (1/n) Σ_k X[k] e^{i κ_k x}, optionally truncated at |κ| ≤ kMax.
 * For even n the Nyquist term is a cosine, included when kMax ≥ n/2.
 */
export function interpolantAt(samples: number[], xs: number[], kMax?: number): number[] {
  const n = samples.length;
  const { re, im } = dft(samples);
  const kNyq = n / 2;
  const kCap = kMax ?? Math.floor(n / 2);
  const kHi = Math.min(kCap, Math.floor((n - 1) / 2));
  const includeNyquist = n % 2 === 0 && kCap >= kNyq;

  return xs.map((x) => {
    let s = re[0] / n;
    for (let k = 1; k <= kHi; k++) {
      const a = re[k] / n;
      const b = im[k] / n;
      s += 2 * (a * Math.cos(k * x) - b * Math.sin(k * x));
    }
    if (includeNyquist) s += (re[kNyq] / n) * Math.cos(kNyq * x);
    return s;
  });
}

export interface Coeff {
  k: number;
  re: number;
  im: number;
  mag: number;
}

/** Modal coefficients ĉ_k = X[k]/n for k = 0, 1, …, floor(n/2). */
export function fourierCoefficients(samples: number[]): Coeff[] {
  const n = samples.length;
  const { re, im } = dft(samples);
  const nModes = Math.floor(n / 2);
  const out: Coeff[] = [];
  for (let k = 0; k <= nModes; k++) {
    const mag = k === 0 || k === n / 2
      ? Math.hypot(re[k], im[k]) / n
      : Math.hypot(re[k], im[k]) * (2 / n);
    out.push({ k, re: re[k] / n, im: im[k] / n, mag });
  }
  return out;
}

/* ── targets ───────────────────────────────────────────────────────────── */

export interface SpectralTarget {
  key: string;
  label: string;
  latex: string;
  f: Fn;
  df: Fn;
  /** Jump locations on [0, 2π). Empty if the periodic extension is continuous. */
  jumps: number[];
  /** Size of each jump, used to scale the Gibbs overshoot. */
  jumpHeight: number;
  /** Exact ĉ_k when the series is known in closed form. */
  coeff?: (k: number) => { re: number; im: number };
}

export const SPECTRAL_TARGETS: Record<string, SpectralTarget> = {
  /* Analytic and periodic. Fourier coefficients are Bessel I_k(1) and die
     faster than exponentially — the textbook spectral-accuracy example. */
  expSin: {
    key: 'expSin',
    label: 'e^{sin x}',
    latex: String.raw`e^{\sin x}`,
    f: (x) => Math.exp(Math.sin(x)),
    df: (x) => Math.cos(x) * Math.exp(Math.sin(x)),
    jumps: [],
    jumpHeight: 0,
  },
  /* One jump, of height π, at x = 0 ≡ 2π. Fourier series Σ sin(kx)/k.
     Sampled at the jump we take the average (0), which is where the series
     itself converges. */
  sawtooth: {
    key: 'sawtooth',
    label: 'sawtooth',
    latex: String.raw`(\pi - x)/2`,
    f: (x) => {
      const t = ((x % TWO_PI) + TWO_PI) % TWO_PI;
      if (t < 1e-12 || TWO_PI - t < 1e-12) return 0;
      return (Math.PI - t) / 2;
    },
    df: () => -0.5,
    jumps: [0],
    jumpHeight: Math.PI,
    // Σ_{k=1}^∞ sin(kx)/k  ⇔  ĉ_k = −i/(2k) for k ≠ 0.
    coeff: (k) => (k === 0 ? { re: 0, im: 0 } : { re: 0, im: -1 / (2 * k) }),
  },
};

export interface InterpolantErrorOpts {
  /** Fine grid used to probe the interpolant between the nodes. */
  fine?: number;
  /** Drop points within this radius of a jump — Gibbs lives there. */
  excludeRadius?: number;
}

export interface ErrorPoint {
  n: number;
  error: number;
}

/* ── truncated series ("build from modes") ─────────────────────────────── */

const MODE_DFT = 256;

/** ĉ_k for k = 0..kMax. Exact formula when the target has one; otherwise a fine DFT. */
export function modalCoefficients(target: SpectralTarget, kMax = 64): Coeff[] {
  if (target.coeff) {
    return Array.from({ length: kMax + 1 }, (_, k) => {
      const c = target.coeff!(k);
      const mag = k === 0 ? Math.hypot(c.re, c.im) : 2 * Math.hypot(c.re, c.im);
      return { k, re: c.re, im: c.im, mag };
    });
  }
  const samples = periodicGrid(MODE_DFT).map(target.f);
  return fourierCoefficients(samples).slice(0, kMax + 1);
}

/**
 * Partial sum S_K(x) = ĉ_0 + Σ_{k=1}^K 2 (Re ĉ_k cos kx − Im ĉ_k sin kx).
 * This is the thing the learner builds, mode by mode.
 */
export function partialSum(coeffs: Coeff[], K: number, xs: number[]): number[] {
  const kHi = Math.min(K, coeffs.length - 1);
  return xs.map((x) => {
    let s = coeffs[0]?.re ?? 0;
    for (let k = 1; k <= kHi; k++) {
      s += 2 * (coeffs[k].re * Math.cos(k * x) - coeffs[k].im * Math.sin(k * x));
    }
    return s;
  });
}

export function reconstruct(target: SpectralTarget, K: number, xs: number[]): number[] {
  return partialSum(modalCoefficients(target, K), K, xs);
}

/**
 * Max |S_K − f| of the truncated Fourier series.
 * Pass excludeRadius to measure away from jumps (the 1/K story); leave it
 * off to see the Gibbs wall.
 */
export function modalError(
  target: SpectralTarget,
  K: number,
  opts: InterpolantErrorOpts = {},
): number {
  const fine = opts.fine ?? 800;
  const xs = Array.from({ length: fine }, (_, i) => (TWO_PI * i) / fine);
  // A uniform grid misses the jump as K grows (the layer is O(1/K)).
  // Pin two probes just off each discontinuity so the max-norm wall is real.
  if (opts.excludeRadius === undefined) {
    for (const j of target.jumps) {
      xs.push((j + 1e-6 + TWO_PI) % TWO_PI);
      xs.push((j - 1e-6 + TWO_PI) % TWO_PI);
    }
  }
  const p = reconstruct(target, K, xs);
  let worst = 0;
  let seen = 0;
  for (let i = 0; i < xs.length; i++) {
    if (opts.excludeRadius !== undefined && target.jumps.length > 0) {
      const near = target.jumps.some((j) => circularDistance(xs[i], j) < opts.excludeRadius!);
      if (near) continue;
    }
    worst = Math.max(worst, Math.abs(p[i] - target.f(xs[i])));
    seen++;
  }
  return seen === 0 ? Infinity : Math.max(worst, ERROR_FLOOR);
}

export function modalSweep(
  target: SpectralTarget,
  ks: number[],
  opts?: InterpolantErrorOpts,
): ErrorPoint[] {
  return ks.map((n) => ({ n, error: modalError(target, n, opts) }));
}

/** Smallest K whose truncated-series error drops below `tol`. */
export function smallestK(target: SpectralTarget, tol: number, max = 48): number {
  for (let K = 1; K <= max; K++) {
    if (modalError(target, K) < tol) return K;
  }
  return max;
}

/* ── collocation error ─────────────────────────────────────────────────── */

/**
 * Max |p_N − f| of the trigonometric interpolant through N samples of f.
 * Pass excludeRadius to measure away from jumps (the 1/N story); leave it
 * off to see the Gibbs wall.
 */
export function interpolantError(
  target: SpectralTarget,
  n: number,
  opts: InterpolantErrorOpts = {},
): number {
  const fine = opts.fine ?? 400;
  const samples = periodicGrid(n).map(target.f);
  const xs = Array.from({ length: fine }, (_, i) => (TWO_PI * i) / fine);
  const p = interpolantAt(samples, xs);
  let worst = 0;
  let seen = 0;
  for (let i = 0; i < fine; i++) {
    if (opts.excludeRadius !== undefined && target.jumps.length > 0) {
      const near = target.jumps.some((j) => circularDistance(xs[i], j) < opts.excludeRadius!);
      if (near) continue;
    }
    worst = Math.max(worst, Math.abs(p[i] - target.f(xs[i])));
    seen++;
  }
  return seen === 0 ? Infinity : Math.max(worst, ERROR_FLOOR);
}

/** Max nodal error of the first spectral derivative. */
export function derivativeError(target: SpectralTarget, n: number): number {
  const xs = periodicGrid(n);
  const approx = fourierDerivative(xs.map(target.f));
  let worst = 0;
  for (let i = 0; i < n; i++) worst = Math.max(worst, Math.abs(approx[i] - target.df(xs[i])));
  return Math.max(worst, ERROR_FLOOR);
}

/** Max nodal error of the periodic central difference (first derivative). */
export function centralDiffError(target: SpectralTarget, n: number): number {
  const xs = periodicGrid(n);
  const approx = periodicCentralDiff(xs.map(target.f));
  let worst = 0;
  for (let i = 0; i < n; i++) worst = Math.max(worst, Math.abs(approx[i] - target.df(xs[i])));
  return Math.max(worst, ERROR_FLOOR);
}

export function evenSweep(from: number, to: number, step = 2): number[] {
  const out: number[] = [];
  for (let n = from; n <= to; n += step) out.push(n);
  return out;
}

export function interpolantSweep(
  target: SpectralTarget,
  ns: number[],
  opts?: InterpolantErrorOpts,
): ErrorPoint[] {
  return ns.map((n) => ({ n, error: interpolantError(target, n, opts) }));
}

/** log(e1/e2) / log(n2/n1) — observed algebraic order between two resolutions. */
export const observedOrder = (a: ErrorPoint, b: ErrorPoint): number =>
  Math.log(a.error / b.error) / Math.log(b.n / a.n);

/** Smallest even n whose interpolant error drops below `tol`. */
export function smallestN(target: SpectralTarget, tol: number, max = 64): number {
  for (let n = 4; n <= max; n += 2) {
    if (interpolantError(target, n) < tol) return n;
  }
  return max;
}

/**
 * Gibbs overshoot as a fraction of the jump.
 *
 * For a jump of height a the partial sums overshoot by ≈ 0.08949 a, on
 * either side, and that fraction does not go to zero with N. Measured as
 * (max |p| − |one-sided limit|) / jumpHeight near the discontinuity.
 */
export function gibbsOvershoot(target: SpectralTarget, K: number): number {
  if (target.jumps.length === 0 || target.jumpHeight === 0) return 0;
  const fine = 2000;
  const xs = Array.from({ length: fine }, (_, i) => (TWO_PI * i) / fine);
  const p = reconstruct(target, K, xs);
  // One-sided limit: for the sawtooth, |f| just off the jump is π/2.
  const half = Math.abs(target.f(1e-6));
  let peak = 0;
  for (let i = 0; i < fine; i++) peak = Math.max(peak, Math.abs(p[i]));
  return (peak - half) / target.jumpHeight;
}

/* ── Chebyshev ─────────────────────────────────────────────────────────── */

/**
 * Chebyshev differentiation matrix on [−1, 1], Trefethen cheb.m.
 * N is the polynomial degree; there are N+1 extrema nodes
 * x_j = cos(π j / N), j = 0..N.
 */
export function cheb(N: number): { D: number[][]; x: number[] } {
  if (N === 0) return { D: [[0]], x: [1] };
  const x = Array.from({ length: N + 1 }, (_, j) => Math.cos((Math.PI * j) / N));
  const c = Array.from({ length: N + 1 }, (_, j) => {
    const scale = j === 0 || j === N ? 2 : 1;
    return scale * (j % 2 === 0 ? 1 : -1);
  });
  const D = Array.from({ length: N + 1 }, () => new Array<number>(N + 1).fill(0));
  for (let i = 0; i <= N; i++) {
    for (let j = 0; j <= N; j++) {
      if (i === j) continue;
      D[i][j] = c[i] / c[j] / (x[i] - x[j]);
    }
  }
  for (let i = 0; i <= N; i++) {
    let sum = 0;
    for (let j = 0; j <= N; j++) if (i !== j) sum += D[i][j];
    D[i][i] = -sum;
  }
  return { D, x };
}

export function applyRows(M: number[][], v: number[]): number[] {
  return M.map((row) => row.reduce((s, a, j) => s + a * v[j], 0));
}

export function chebDerivative(values: number[]): number[] {
  const { D } = cheb(values.length - 1);
  return applyRows(D, values);
}
