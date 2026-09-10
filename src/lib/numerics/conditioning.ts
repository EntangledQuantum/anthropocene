import { solveDense } from './linalg.ts';
import { norm2, sub, type State } from './types.ts';

/** The 2×2 used throughout the lesson. ε = 10⁻⁸ makes κ_∞ ≈ 4×10⁸:
 *  eight digits of stretch, eight digits of float64 left — the swing is
 *  visible and the residual is still tiny. */
export const ILL_EPS = 1e-8;

export function ill2x2(eps = ILL_EPS): { A: number[][]; b: number[]; xExact: State } {
  return {
    A: [
      [1, 1],
      [1, 1 + eps],
    ],
    b: [2, 2],
    xExact: [2, 0],
  };
}

export function infNormMat(A: number[][]): number {
  return Math.max(...A.map((row) => row.reduce((s, v) => s + Math.abs(v), 0)));
}

export function infNormVec(x: number[]): number {
  return Math.max(...x.map(Math.abs));
}

/** Inverse via n solves of A e_j = e_j, so κ is measured with the same
 *  LU the lesson runs, not a second implementation. */
export function inverseDense(A: number[][]): number[][] | null {
  const n = A.length;
  const inv: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let j = 0; j < n; j++) {
    const e = new Array(n).fill(0);
    e[j] = 1;
    const col = solveDense(A, e);
    if (!col) return null;
    for (let i = 0; i < n; i++) inv[i][j] = col[i];
  }
  return inv;
}

/** κ_∞(A) = ||A||_∞ ||A⁻¹||_∞. Infinity if A is singular to the solver. */
export function condInf(A: number[][]): number {
  const inv = inverseDense(A);
  if (!inv) return Number.POSITIVE_INFINITY;
  return infNormMat(A) * infNormMat(inv);
}

export function matVec(A: number[][], x: number[]): number[] {
  return A.map((row) => row.reduce((s, aij, j) => s + aij * x[j], 0));
}

export function residual(A: number[][], x: number[], b: number[]): number[] {
  const Ax = matVec(A, x);
  return b.map((bi, i) => bi - Ax[i]);
}

export function relResidual(A: number[][], x: number[], b: number[]): number {
  const r = residual(A, x, b);
  const denom = infNormVec(b);
  return denom === 0 ? infNormVec(r) : infNormVec(r) / denom;
}

export function relError(computed: number[], exact: number[]): number {
  const n = norm2(exact);
  return n === 0 ? norm2(computed) : norm2(sub(computed, exact)) / n;
}

/** Digits a backward-stable algorithm is entitled to: −log₁₀(κ ε). */
export function remainingDigits(kappa: number, eps = Number.EPSILON): number {
  if (!(kappa > 0) || !Number.isFinite(kappa)) return 0;
  return Math.max(0, -Math.log10(kappa * eps));
}

/** Solve the lesson 2×2 with b₂ perturbed by `delta`, using the platform LU. */
export function solveIllPerturbed(delta: number, eps = ILL_EPS): State | null {
  const { A, b } = ill2x2(eps);
  return solveDense(A, [b[0], b[1] + delta]);
}

/* ── quadratic formula: well-conditioned roots, two algorithms ─────────── */

export function quadraticNaive(a: number, b: number, c: number): { plus: number; minus: number } {
  const disc = Math.sqrt(b * b - 4 * a * c);
  return {
    plus: (-b + disc) / (2 * a),
    minus: (-b - disc) / (2 * a),
  };
}

/** Numerical Recipes §5.6 / Higham: non-cancelling root first, other from Vieta. */
export function quadraticStable(a: number, b: number, c: number): { far: number; near: number } {
  const disc = Math.sqrt(b * b - 4 * a * c);
  const q = -0.5 * (b + (Math.sign(b) || 1) * disc);
  return { far: q / a, near: c / q };
}

/** For b ≥ 0 the textbook "+" root is the one that subtracts. */
export function naiveNearRoot(a: number, b: number, c: number): number {
  const n = quadraticNaive(a, b, c);
  return b >= 0 ? n.plus : n.minus;
}

export function polyEval(a: number, b: number, c: number, x: number): number {
  return (a * x + b) * x + c;
}

export function relRootError(computed: number, truth: number): number {
  if (!Number.isFinite(computed)) return 1;
  const denom = Math.max(Math.abs(truth), Number.EPSILON);
  return Math.abs(computed - truth) / denom;
}

/** Smallest |b| (a = c = 1, b > 0) where the naive near-root is wrong by `rel`. */
export function naiveQuadraticCliff(rel = 0.5): number {
  const a = 1;
  const c = 1;
  let lo = 10;
  let hi = 1e12;
  const truthAt = (b: number) => quadraticStable(a, b, c).near;
  const errAt = (b: number) => relRootError(naiveNearRoot(a, b, c), truthAt(b));
  if (errAt(lo) >= rel) return lo;
  if (errAt(hi) < rel) return hi;
  for (let i = 0; i < 80; i++) {
    const mid = Math.exp(0.5 * (Math.log(lo) + Math.log(hi)));
    if (errAt(mid) >= rel) hi = mid;
    else lo = mid;
  }
  return hi;
}
