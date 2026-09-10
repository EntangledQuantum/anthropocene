import { solveDense } from './linalg.ts';

/** Classification facts for 1D fields: the continuum limit, the discrete
 *  Laplacian's null space, and the three domains of dependence.
 *
 *  Time-stepping schemes and the CFL explosion live in a different file —
 *  this one owns *what information must enter through the boundary*. */

export type PdePersonality = 'elliptic' | 'parabolic' | 'hyperbolic';

export const BUMP_CENTER = 0.5;
export const BUMP_WIDTH = 0.22;

/** Smooth bump used as the shared costume: particles and samples of one u(x). */
export function bump(x: number, center = BUMP_CENTER, width = BUMP_WIDTH): number {
  const z = (x - center) / width;
  return Math.exp(-z * z);
}

export function bumpD2(x: number, center = BUMP_CENTER, width = BUMP_WIDTH): number {
  const z = (x - center) / width;
  const u = Math.exp(-z * z);
  return ((2 * u) / (width * width)) * (2 * z * z - 1);
}

export function linspace(n: number, a = 0, b = 1): number[] {
  if (n < 2) return [a];
  const h = (b - a) / (n - 1);
  return Array.from({ length: n }, (_, i) => a + i * h);
}

export function sampleField(n: number, f: (x: number) => number = bump, a = 0, b = 1): {
  x: number[];
  u: number[];
  h: number;
} {
  const x = linspace(n, a, b);
  return { x, u: x.map((xi) => f(xi)), h: n < 2 ? b - a : (b - a) / (n - 1) };
}

/** Interior second differences. Length n − 2. Kernel is any affine sequence. */
export function secondDiff(u: number[], h: number): number[] {
  const out = new Array<number>(Math.max(0, u.length - 2));
  const s = 1 / (h * h);
  for (let i = 1; i < u.length - 1; i++) {
    out[i - 1] = (u[i - 1] - 2 * u[i] + u[i + 1]) * s;
  }
  return out;
}

export function affineSequence(n: number, intercept = 0, slope = 1): number[] {
  return Array.from({ length: n }, (_, i) => intercept + slope * i);
}

/** Tridiagonal D² on n interior points of [0, 1], Dirichlet ghosts at 0 and 1.
 *  h = 1/(n+1). Approximates u″. Negative definite once the ghosts are zero. */
export function dirichletLaplacian(n: number): number[][] {
  const h = 1 / (n + 1);
  const s = 1 / (h * h);
  const A = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  for (let i = 0; i < n; i++) {
    A[i][i] = -2 * s;
    if (i > 0) A[i][i - 1] = s;
    if (i < n - 1) A[i][i + 1] = s;
  }
  return A;
}

/** Periodic D² on n nodes of a ring of length 1. Kernel = constants. */
export function periodicLaplacian(n: number): number[][] {
  const h = 1 / n;
  const s = 1 / (h * h);
  const A = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  for (let i = 0; i < n; i++) {
    A[i][i] = -2 * s;
    A[i][(i + 1) % n] = s;
    A[i][(i - 1 + n) % n] = s;
  }
  return A;
}

export function applyMatrix(A: number[][], x: number[]): number[] {
  return A.map((row) => row.reduce((sum, a, j) => sum + a * x[j], 0));
}

/** Solve u″ = f on (0,1) with u(0)=α, u(1)=β. n = length of interior f. */
export function poissonSolve(fInterior: number[], alpha: number, beta: number): number[] | null {
  const n = fInterior.length;
  const h = 1 / (n + 1);
  const s = 1 / (h * h);
  const b = fInterior.slice();
  b[0] -= alpha * s;
  b[n - 1] -= beta * s;
  return solveDense(dirichletLaplacian(n), b);
}

/** Exact Dirichlet eigenvalues of −D²: (4/h²) sin²(kπ / (2(n+1))), k = 1..n. */
export function dirichletEigenvalue(n: number, k: number): number {
  const h = 1 / (n + 1);
  const theta = (k * Math.PI) / (2 * (n + 1));
  return (4 / (h * h)) * Math.sin(theta) ** 2;
}

export const continuumEigenvalue = (k: number): number => (k * Math.PI) ** 2;

/** max |D² u − u″| on interior nodes of n samples of f, including endpoints. */
export function laplacianError(
  n: number,
  f: (x: number) => number,
  d2f: (x: number) => number,
): number {
  const { x, u, h } = sampleField(n, f);
  const d2 = secondDiff(u, h);
  let max = 0;
  for (let i = 0; i < d2.length; i++) {
    const err = Math.abs(d2[i] - d2f(x[i + 1]));
    if (err > max) max = err;
  }
  return max;
}

export function observedLaplacianOrder(
  n: number,
  f: (x: number) => number,
  d2f: (x: number) => number,
): number {
  const e1 = laplacianError(n, f, d2f);
  const e2 = laplacianError(2 * n - 1, f, d2f); // halves h, same endpoints
  return Math.log2(e1 / e2);
}

/** Green's function for −u″ = δ_ξ on (0,1), u(0)=u(1)=0. Positive tent. */
export function poissonGreen(x: number, xi: number): number {
  if (x <= xi) return x * (1 - xi);
  return xi * (1 - x);
}

/** Heat kernel on the line. Strictly positive for every x once t > 0. */
export function heatKernel(x: number, t: number, kappa = 1): number {
  if (t <= 0) return x === 0 ? Number.POSITIVE_INFINITY : 0;
  return Math.exp(-(x * x) / (4 * kappa * t)) / Math.sqrt(4 * Math.PI * kappa * t);
}

/** G(0,t) / G(distance, t) = exp(d² / (4κt)). Infinite speed, exponential decay. */
export function heatKernelRatio(distance: number, t: number, kappa = 1): number {
  return Math.exp((distance * distance) / (4 * kappa * t));
}

/** d'Alembert, u_t(·,0) = 0: u(x,t) = [g(x−ct) + g(x+ct)] / 2. */
export function dalembert(g: (x: number) => number, x: number, t: number, c = 1): number {
  return 0.5 * (g(x - c * t) + g(x + c * t));
}

/** Right-going advection u_t + c u_x = 0, c > 0: u(x,t) = g(x − c t). */
export function advect(g: (x: number) => number, x: number, t: number, c = 1): number {
  return g(x - c * t);
}

export interface Dependence {
  lo: number;
  hi: number;
  /** True when the whole spatial interval is needed. */
  whole: boolean;
  /** Boundary segments the point also needs, as fractions of the time axis. */
  leftBoundary: boolean;
  rightBoundary: boolean;
}

/** Domain of dependence of (x, t) for the three 1D personalities on [0, L].
 *  Elliptic ignores t (the whole interval, always). Parabolic fills the whole
 *  interval the instant t > 0. Hyperbolic is the characteristic triangle. */
export function dependenceInterval(
  type: PdePersonality,
  x: number,
  t: number,
  { c = 1, length = 1 }: { c?: number; length?: number } = {},
): Dependence {
  if (type === 'elliptic') {
    return { lo: 0, hi: length, whole: true, leftBoundary: true, rightBoundary: true };
  }
  if (type === 'parabolic') {
    const instant = t > 0;
    return {
      lo: 0,
      hi: length,
      whole: instant,
      leftBoundary: instant,
      rightBoundary: instant,
    };
  }
  const lo = Math.max(0, x - c * t);
  const hi = Math.min(length, x + c * t);
  return {
    lo,
    hi,
    whole: lo <= 0 && hi >= length,
    leftBoundary: x - c * t < 0,
    rightBoundary: x + c * t > length,
  };
}

export function dependenceWidth(
  type: PdePersonality,
  x: number,
  t: number,
  opts?: { c?: number; length?: number },
): number {
  const d = dependenceInterval(type, x, t, opts);
  return d.hi - d.lo;
}
