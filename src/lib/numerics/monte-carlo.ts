/** Monte Carlo integration versus product-grid quadrature.
 *
 *  The pedagogical claim this file exists to make: a product midpoint that is
 *  second order in 1D is order 2/d in d dimensions, because N = n^d so
 *  h = N^{-1/d}. Monte Carlo's RMSE is σ/√N in every dimension. The two
 *  exponents cross, and past that crossing the random method is the more
 *  accurate one at equal cost.
 *
 *  Displayed inside the lesson, so the math stays visible in the shape of
 *  the expressions — no cleverness, no hidden constants. */

export type Rng = () => number;
export type Integrand = (x: number[]) => number;

/* ── seeded PRNG ───────────────────────────────────────────────────────── */

/**
 * Mulberry32. Same seed, same stream — tests and widgets stay deterministic.
 * Not for cryptography; for a reproducible dart throw.
 */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ── the integrand ─────────────────────────────────────────────────────── */

/**
 * f(x) = exp(∑ xᵢ) on the unit cube [0,1]^d.
 *
 * Separable, smooth, and with a closed-form integral and variance in every
 * dimension — so every error a widget prints is a real residual against an
 * exact answer, not a fitted curve.
 */
export function expSum(x: number[]): number {
  let s = 0;
  for (let i = 0; i < x.length; i++) s += x[i];
  return Math.exp(s);
}

/** ∫_{[0,1]^d} exp(∑ xᵢ) dx = (e − 1)^d */
export function expSumIntegral(dim: number): number {
  return (Math.E - 1) ** dim;
}

/** Var(f(U)) for U ~ Uniform[0,1]^d. Equals E[f²] − I². */
export function expSumVariance(dim: number): number {
  const meanSq = ((Math.E * Math.E - 1) / 2) ** dim;
  const I = expSumIntegral(dim);
  return meanSq - I * I;
}

/** RMSE of the plain Monte Carlo estimator: σ / √N. */
export function mcRmse(dim: number, N: number): number {
  return Math.sqrt(expSumVariance(dim) / N);
}

export function relativeError(estimate: number, exact: number): number {
  return Math.abs(estimate - exact) / Math.abs(exact);
}

/* ── estimators ────────────────────────────────────────────────────────── */

/**
 * Plain Monte Carlo on the unit cube: I_N = (1/N) ∑ f(Xᵢ), Xᵢ ~ Uniform[0,1]^d.
 * Volume is 1, so the sample mean is the integral estimator.
 */
export function monteCarlo(f: Integrand, dim: number, N: number, rng: Rng): number {
  let sum = 0;
  const x = new Array<number>(dim);
  for (let i = 0; i < N; i++) {
    for (let k = 0; k < dim; k++) x[k] = rng();
    sum += f(x);
  }
  return sum / N;
}

/**
 * Product midpoint rule on [0,1]^d: n points per axis, N = n^d evaluations,
 * each cell sampled at its centre, equal weights 1/N.
 *
 * One-dimensional midpoint is second order. The product rule therefore has
 * error O(h²) = O(n^{-2}) = O(N^{-2/d}) — the exponent that dies with
 * dimension.
 */
export function productMidpoint(f: Integrand, dim: number, nPerAxis: number): number {
  const h = 1 / nPerAxis;
  const x = new Array<number>(dim);
  const walk = (k: number): number => {
    if (k === dim) return f(x);
    let s = 0;
    for (let i = 0; i < nPerAxis; i++) {
      x[k] = (i + 0.5) * h;
      s += walk(k + 1);
    }
    return s;
  };
  return walk(0) / nPerAxis ** dim;
}

/** Function evaluations a product grid of n-per-axis in d dimensions spends. */
export function gridEvaluations(nPerAxis: number, dim: number): number {
  return nPerAxis ** dim;
}

/**
 * Finest n with n^d ≤ budget. Returns n = 0 when even two points per axis
 * overflow the budget — the grid has died.
 */
export function finestGrid(dim: number, budget: number): { n: number; N: number } {
  if (dim < 1 || budget < 1) return { n: 0, N: 0 };
  let n = 0;
  for (let k = 2; ; k++) {
    const N = k ** dim;
    if (N > budget) break;
    n = k;
    if (k > budget) break;
  }
  return n === 0 ? { n: 0, N: 0 } : { n, N: n ** dim };
}

/** Relative error of the product midpoint at a given n, against the exact integral. */
export function gridRelativeError(dim: number, nPerAxis: number): number {
  const I = expSumIntegral(dim);
  return relativeError(productMidpoint(expSum, dim, nPerAxis), I);
}

/** Relative RMSE of plain Monte Carlo at N samples. */
export function mcRelativeRmse(dim: number, N: number): number {
  return mcRmse(dim, N) / expSumIntegral(dim);
}

/**
 * Function-eval budget used to compare the two methods in the lesson.
 * 4096 is 2^{12} = 4^6 = 8^4 = 16^3 = 64^2, so many dimensions land on an
 * exact tensor-product size rather than wasting leftover evaluations.
 */
export const COMPARISON_BUDGET = 4096;

/**
 * Lowest dimension at which Monte Carlo's relative RMSE at the grid's actual
 * spend N = n^d is strictly smaller than the product-midpoint relative error.
 * If the grid cannot fit two points per axis in the budget, MC wins by default.
 */
export function crossoverDimension(budget: number = COMPARISON_BUDGET): number {
  for (let d = 1; d <= 24; d++) {
    const { n, N } = finestGrid(d, budget);
    if (n === 0) return d;
    if (mcRelativeRmse(d, N) < gridRelativeError(d, n)) return d;
  }
  return 24;
}

/** Product-midpoint relative error at a handful of tensor sizes up to maxN. */
export function gridSweep(dim: number, maxN: number = COMPARISON_BUDGET): { n: number; N: number; err: number }[] {
  const nMax = finestGrid(dim, maxN).n;
  if (nMax < 2) return [];
  const ns = new Set<number>([2, nMax]);
  const steps = Math.min(8, nMax - 1);
  for (let i = 0; i <= steps; i++) {
    const n = Math.round(2 * (nMax / 2) ** (i / Math.max(steps, 1)));
    if (n >= 2 && n ** dim <= maxN) ns.add(n);
  }
  return [...ns]
    .sort((a, b) => a - b)
    .map((n) => ({ n, N: n ** dim, err: gridRelativeError(dim, n) }));
}

/* ── importance sampling ───────────────────────────────────────────────── */

/**
 * Sample x ∈ [0,1]^d from the product density q(x) = ∏ q₁(xᵢ) with
 * q₁(t) = α e^{α t} / (e^α − 1), the exponential tilt. α = 0 is uniform
 * (in the limit); α = 1 is the *optimal* density for exp(∑ xᵢ), which makes
 * f/q constant and the estimator exact. Anything in between cuts variance
 * without touching the 1/√N rate.
 */
export function tiltedExpSample(dim: number, alpha: number, rng: Rng): { x: number[]; q: number } {
  const denom = Math.exp(alpha) - 1;
  const x = new Array<number>(dim);
  let q = 1;
  for (let k = 0; k < dim; k++) {
    x[k] = Math.log(1 + rng() * denom) / alpha;
    q *= (alpha * Math.exp(alpha * x[k])) / denom;
  }
  return { x, q };
}

/** I_N = (1/N) ∑ f(Xᵢ) / q(Xᵢ). Unbiased for any q that charges the cube. */
export function importanceEstimate(
  f: Integrand,
  dim: number,
  N: number,
  alpha: number,
  rng: Rng,
): number {
  let sum = 0;
  for (let i = 0; i < N; i++) {
    const { x, q } = tiltedExpSample(dim, alpha, rng);
    sum += f(x) / q;
  }
  return sum / N;
}

/**
 * Closed-form variance of the importance-sampling weight f/q for the
 * exponential-tilt family. A better q shrinks this constant and leaves the
 * N^{-1/2} exponent alone. α = 1 is optimal for exp(∑ xᵢ): the weight is
 * constant and the variance is exactly zero.
 *
 * f/q = ((e^α − 1)/α)^d · exp((1 − α) ∑ xᵢ), so E[(f/q)²] factors into the
 * one-dimensional integral ∫ f₁²/q₁ dt = ((e^α − 1)/α) (e^{2−α} − 1)/(2 − α).
 */
export function importanceVariance(dim: number, alpha: number): number {
  const I = expSumIntegral(dim);
  // One-dimensional pieces of E[(f/q)²] = [∫_0^1 f₁(t)² / q₁(t) dt]^d
  // f₁² / q₁ = e^{2t} · (e^α − 1) / (α e^{α t}) = ((e^α − 1)/α) e^{(2-α)t}
  const meanSq1 = ((Math.exp(alpha) - 1) / alpha) * (Math.exp(2 - alpha) - 1) / (2 - alpha);
  return meanSq1 ** dim - I * I;
}

export function importanceRmse(dim: number, N: number, alpha: number): number {
  return Math.sqrt(importanceVariance(dim, alpha) / N);
}
