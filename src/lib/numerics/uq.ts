/* ─────────────────────────────────────────────────────────────────────────
   Forward uncertainty quantification on a cheap scalar model.

   Remaining amplitude of y' = −λ y, which is also the first heat mode
   after you absorb π² into the clock:

     q(A₀, λ; T) = A₀ exp(−λ T)

   Monte Carlo of the *parameter*, not of the PDE. A single run at the
   mean λ is a sample. The prediction is the pushforward of the input
   cloud — a smear, not a number.

   Linear maps scale a cloud and leave E[q] = q(E[λ]). The exponential
   does neither: it fattens a tail, and Jensen says
     E[e^{−λ T}] = e^{−μ T} sinh(δ T) / (δ T)  >  e^{−μ T}
   for λ ~ Uniform[μ − δ, μ + δ].

   One-at-a-time walks a cross in the (A₀, λ) square. The smallest
   remaining lives at a corner the cross never visits.
   ───────────────────────────────────────────────────────────────────────── */

import { mulberry32, type Rng } from './monte-carlo.ts';

export const UQ_LAMBDA_MIN = 0.5;
export const UQ_LAMBDA_MAX = 1.5;
export const UQ_LAMBDA_MEAN = 1;
export const UQ_DELTA = 0.5;

export const UQ_A0_MIN = 0.5;
export const UQ_A0_MAX = 1.5;
export const UQ_A0_MEAN = 1;

export const UQ_T_DEFAULT = 3;
export const UQ_SKETCH_T = 1;
export const UQ_JENSEN_RATIO = 1.5;
export const UQ_SEED = 7;
export const UQ_N = 2000;

export type Interval = { min: number; max: number };

export const UQ_LAMBDA: Interval = { min: UQ_LAMBDA_MIN, max: UQ_LAMBDA_MAX };
export const UQ_A0: Interval = { min: UQ_A0_MIN, max: UQ_A0_MAX };

/** Remaining amplitude. The whole model. */
export function remaining(A0: number, lambda: number, T: number): number {
  return A0 * Math.exp(-lambda * T);
}

export function linearMap(x: number, a: number, b: number): number {
  return a * x + b;
}

/** Push a sample through a scalar map. This is forward UQ. */
export function push(xs: number[], f: (x: number) => number): number[] {
  const out = new Array<number>(xs.length);
  for (let i = 0; i < xs.length; i++) out[i] = f(xs[i]!);
  return out;
}

export function pushRemaining(lambdas: number[], T: number, A0 = 1): number[] {
  return push(lambdas, (lam) => remaining(A0, lam, T));
}

/* ── exact pushforward of Uniform λ through exp(−λ T) ──────────────────── */

/**
 * E[exp(−λ T)] for λ ~ Uniform[min, max].
 * Closed form: (e^{−a T} − e^{−b T}) / ((b − a) T), limit 1 as T → 0.
 */
export function exactExpMean(lambdaMin: number, lambdaMax: number, T: number): number {
  const span = lambdaMax - lambdaMin;
  if (span <= 0) return Math.exp(-lambdaMin * T);
  if (Math.abs(T) < 1e-12) return 1;
  return (Math.exp(-lambdaMin * T) - Math.exp(-lambdaMax * T)) / (span * T);
}

export function exactPointEstimate(lambdaMean: number, T: number, A0 = 1): number {
  return remaining(A0, lambdaMean, T);
}

/**
 * E[q] / q(μ) for λ ~ Uniform[μ − δ, μ + δ].
 * Equals sinh(δ T) / (δ T) ≥ 1, with equality only at T = 0.
 */
export function jensenRatio(T: number, delta = UQ_DELTA): number {
  if (Math.abs(T) < 1e-12 || delta === 0) return 1;
  return Math.sinh(delta * T) / (delta * T);
}

/** T such that sinh(δ T)/(δ T) = ratio. Binary search on the strictly
 *  increasing map x ↦ sinh(x)/x. */
export function jensenTForRatio(ratio: number, delta = UQ_DELTA): number {
  if (ratio <= 1) return 0;
  let lo = 0;
  let hi = 20;
  for (let k = 0; k < 60; k++) {
    const mid = (lo + hi) / 2;
    const s = Math.sinh(mid) / mid;
    if (s < ratio) lo = mid;
    else hi = mid;
  }
  return ((lo + hi) / 2) / delta;
}

/**
 * Density of Y = exp(−λ T) when λ ~ Uniform[a, b].
 * Jacobian: |dY/dλ| = T Y, so f_Y(y) = 1 / ((b − a) T y) on the image.
 */
export function expPushforwardDensity(
  y: number,
  lambdaMin: number,
  lambdaMax: number,
  T: number,
): number {
  if (T <= 0) return 0;
  const ymin = Math.exp(-lambdaMax * T);
  const ymax = Math.exp(-lambdaMin * T);
  if (y < ymin || y > ymax) return 0;
  return 1 / ((lambdaMax - lambdaMin) * T * y);
}

export function pushforwardSupport(
  lambdaMin: number,
  lambdaMax: number,
  T: number,
): [number, number] {
  return [Math.exp(-lambdaMax * T), Math.exp(-lambdaMin * T)];
}

/* ── sampling ──────────────────────────────────────────────────────────── */

export function sampleUniform(n: number, min: number, max: number, rng: Rng): number[] {
  const xs = new Array<number>(n);
  const span = max - min;
  for (let i = 0; i < n; i++) xs[i] = min + span * rng();
  return xs;
}

/** Standard normal via Box–Muller. */
export function gaussian(rng: Rng): number {
  const u1 = Math.max(rng(), 1e-12);
  const u2 = rng();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

export function sampleGaussian(n: number, mean: number, std: number, rng: Rng): number[] {
  const xs = new Array<number>(n);
  for (let i = 0; i < n; i++) xs[i] = mean + std * gaussian(rng);
  return xs;
}

/* ── moments of a sample ───────────────────────────────────────────────── */

export function mean(xs: number[]): number {
  if (xs.length === 0) return NaN;
  let s = 0;
  for (let i = 0; i < xs.length; i++) s += xs[i]!;
  return s / xs.length;
}

/** Population second moment — the Monte Carlo estimator of Var. */
export function variance(xs: number[]): number {
  if (xs.length === 0) return NaN;
  const m = mean(xs);
  let s = 0;
  for (let i = 0; i < xs.length; i++) {
    const d = xs[i]! - m;
    s += d * d;
  }
  return s / xs.length;
}

export function skewness(xs: number[]): number {
  if (xs.length === 0) return NaN;
  const m = mean(xs);
  let m2 = 0;
  let m3 = 0;
  for (let i = 0; i < xs.length; i++) {
    const d = xs[i]! - m;
    m2 += d * d;
    m3 += d * d * d;
  }
  m2 /= xs.length;
  m3 /= xs.length;
  if (m2 <= 0) return 0;
  return m3 / Math.pow(m2, 1.5);
}

export function quantile(xs: number[], p: number): number {
  const s = xs.filter((v) => Number.isFinite(v)).slice().sort((a, b) => a - b);
  if (s.length === 0) return NaN;
  const t = Math.min(1, Math.max(0, p)) * (s.length - 1);
  const lo = Math.floor(t);
  const hi = Math.ceil(t);
  const w = t - lo;
  return s[lo]! * (1 - w) + s[hi]! * w;
}

/** (q95 − q50) / (q50 − q5). Equals 1 for a symmetric cloud; > 1 when the
 *  right tail is the fat one. */
export function tailRatio(xs: number[]): number {
  const q5 = quantile(xs, 0.05);
  const q50 = quantile(xs, 0.5);
  const q95 = quantile(xs, 0.95);
  const left = q50 - q5;
  if (left <= 1e-15) return Infinity;
  return (q95 - q50) / left;
}

export function histogram(
  xs: number[],
  lo: number,
  hi: number,
  bins: number,
): { edges: number[]; centers: number[]; counts: number[]; density: number[] } {
  const nBins = Math.max(1, bins);
  const width = (hi - lo) / nBins;
  const edges = new Array<number>(nBins + 1);
  const counts = new Array<number>(nBins).fill(0);
  const centers = new Array<number>(nBins);
  for (let i = 0; i <= nBins; i++) edges[i] = lo + i * width;
  for (let i = 0; i < nBins; i++) centers[i] = lo + (i + 0.5) * width;
  const n = xs.length;
  for (let i = 0; i < n; i++) {
    const x = xs[i]!;
    if (!Number.isFinite(x) || x < lo || x > hi) continue;
    let b = Math.floor((x - lo) / width);
    if (b === nBins) b = nBins - 1;
    if (b < 0 || b >= nBins) continue;
    counts[b]! += 1;
  }
  const density = counts.map((c) => (width > 0 && n > 0 ? c / (n * width) : 0));
  return { edges, centers, counts, density };
}

/** Step polyline of a histogram, for an area series. */
export function histPolyline(
  edges: number[],
  values: number[],
): { x: number; y: number }[] {
  const pts: { x: number; y: number }[] = [];
  for (let i = 0; i < values.length; i++) {
    pts.push({ x: edges[i]!, y: values[i]! });
    pts.push({ x: edges[i + 1]!, y: values[i]! });
  }
  return pts;
}

/* ── one-at-a-time vs joint ────────────────────────────────────────────── */

export interface Envelope {
  oatMin: number;
  oatMax: number;
  jointMin: number;
  jointMax: number;
}

/**
 * Image of the OAT cross versus the image of the input square under
 * q = A₀ exp(−λ T). Joint min is the small-A₀, large-λ corner; OAT never
 * visits it.
 */
export function envelopes(
  T: number,
  a0: Interval = UQ_A0,
  lam: Interval = UQ_LAMBDA,
): Envelope {
  const muA = (a0.min + a0.max) / 2;
  const muL = (lam.min + lam.max) / 2;
  const oatA0 = [remaining(a0.min, muL, T), remaining(a0.max, muL, T)];
  const oatLam = [remaining(muA, lam.min, T), remaining(muA, lam.max, T)];
  const oatMin = Math.min(oatA0[0]!, oatA0[1]!, oatLam[0]!, oatLam[1]!);
  const oatMax = Math.max(oatA0[0]!, oatA0[1]!, oatLam[0]!, oatLam[1]!);
  return {
    oatMin,
    oatMax,
    jointMin: remaining(a0.min, lam.max, T),
    jointMax: remaining(a0.max, lam.min, T),
  };
}

export interface PairSample {
  A0: number;
  lambda: number;
}

/** Plus-sign through the centre of the rectangle. */
export function oatCross(
  nPerArm: number,
  a0: Interval = UQ_A0,
  lam: Interval = UQ_LAMBDA,
): PairSample[] {
  const n = Math.max(2, nPerArm);
  const muA = (a0.min + a0.max) / 2;
  const muL = (lam.min + lam.max) / 2;
  const out: PairSample[] = [];
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0.5 : i / (n - 1);
    out.push({ A0: a0.min + t * (a0.max - a0.min), lambda: muL });
    out.push({ A0: muA, lambda: lam.min + t * (lam.max - lam.min) });
  }
  return out;
}

export function jointSquare(
  n: number,
  rng: Rng,
  a0: Interval = UQ_A0,
  lam: Interval = UQ_LAMBDA,
): PairSample[] {
  const out: PairSample[] = new Array(n);
  for (let i = 0; i < n; i++) {
    out[i] = {
      A0: a0.min + (a0.max - a0.min) * rng(),
      lambda: lam.min + (lam.max - lam.min) * rng(),
    };
  }
  return out;
}

export function pairPush(samples: PairSample[], T: number): number[] {
  return samples.map((s) => remaining(s.A0, s.lambda, T));
}

/** Default input cloud used by the lesson widgets. Same seed everywhere. */
export function defaultLambdaSample(n = UQ_N, seed = UQ_SEED): number[] {
  return sampleUniform(n, UQ_LAMBDA_MIN, UQ_LAMBDA_MAX, mulberry32(seed));
}
