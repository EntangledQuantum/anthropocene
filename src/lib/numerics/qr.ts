import { solveDense } from './linalg.ts';
import { norm2, sub } from './types.ts';

/** The 3×2 used throughout the lesson. ε = 10⁻⁸ makes κ₂(A) ≈ √2 / ε ≈ 1.4×10⁸
 *  and κ₂(AᵀA) ≈ 2/ε² ≈ 2×10¹⁶. In float64, 1 + ε² rounds to 1, so the
 *  computed Gram is exactly singular — a column of AᵀA has been lost. */
export const QR_EPS = 1e-8;

/** Two nearly parallel columns in R³. Independent for any ε ≠ 0. */
export function nearParallelPair(eps = QR_EPS): number[][] {
  return [
    [1, 1],
    [eps, 0],
    [0, eps],
  ];
}

/** Largest ε at which 1 + ε² rounds to 1 in float64. Below this, forming
 *  AᵀA of the lesson pair yields [[1, 1], [1, 1]]. √(ε_mach/2) overshoots
 *  by a rounding hair, so this is measured, not guessed. */
export function lostColumnEps(): number {
  let lo = 0;
  let hi = 1e-7;
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    if (1 + mid * mid === 1) lo = mid;
    else hi = mid;
  }
  return lo;
}

export function transpose(A: number[][]): number[][] {
  const m = A.length;
  const n = A[0]!.length;
  const T: number[][] = Array.from({ length: n }, () => new Array<number>(m).fill(0));
  for (let i = 0; i < m; i++) {
    for (let j = 0; j < n; j++) T[j]![i] = A[i]![j]!;
  }
  return T;
}

export function matMul(A: number[][], B: number[][]): number[][] {
  const m = A.length;
  const k = A[0]!.length;
  const n = B[0]!.length;
  const C: number[][] = Array.from({ length: m }, () => new Array<number>(n).fill(0));
  for (let i = 0; i < m; i++) {
    for (let j = 0; j < n; j++) {
      let s = 0;
      for (let t = 0; t < k; t++) s += A[i]![t]! * B[t]![j]!;
      C[i]![j] = s;
    }
  }
  return C;
}

export function matVec(A: number[][], x: number[]): number[] {
  return A.map((row) => row.reduce((s, aij, j) => s + aij * x[j]!, 0));
}

export function gram(A: number[][]): number[][] {
  return matMul(transpose(A), A);
}

export function identity(n: number): number[][] {
  return Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)));
}

export function frobenius(A: number[][]): number {
  let s = 0;
  for (const row of A) for (const v of row) s += v * v;
  return Math.sqrt(s);
}

export function subMat(A: number[][], B: number[][]): number[][] {
  return A.map((row, i) => row.map((v, j) => v - B[i]![j]!));
}

const dot = (a: number[], b: number[]): number =>
  a.reduce((s, ai, i) => s + ai * b[i]!, 0);

/** Symmetric 2×2 eigenvalues, largest first. Closed form, so κ of a Gram
 *  matrix is the same calculation the widget prints. */
export function symEig2(S: number[][]): [number, number] {
  const a = S[0]![0]!;
  const b = S[0]![1]!;
  const c = S[1]![1]!;
  const tr = a + c;
  const disc = Math.sqrt(Math.max(0, (a - c) * (a - c) + 4 * b * b));
  return [(tr + disc) / 2, (tr - disc) / 2];
}

/** κ₂ of a 2×2 SPD Gram matrix. Infinity if a computed eigenvalue is ≤ 0. */
export function cond2Gram(G: number[][]): number {
  const [lMax, lMin] = symEig2(G);
  if (!(lMin > 0) || !(lMax > 0)) return Number.POSITIVE_INFINITY;
  return lMax / lMin;
}

/** κ₂(A) = σ_max / σ_min, via eigenvalues of AᵀA. */
export function cond2(A: number[][]): number {
  const kG = cond2Gram(gram(A));
  return Number.isFinite(kG) ? Math.sqrt(kG) : Number.POSITIVE_INFINITY;
}

/** Real-arithmetic κ₂ of the lesson pair: √((2+ε²)/ε²). Does not form 1+ε². */
export function pairCond2Exact(eps: number): number {
  return Math.sqrt((2 + eps * eps) / (eps * eps));
}

/** Real-arithmetic κ₂(AᵀA) = (2+ε²)/ε² = κ₂(A)². */
export function gramCond2Exact(eps: number): number {
  return (2 + eps * eps) / (eps * eps);
}

/** Householder vector for the reflector that maps x onto the axis.
 *  Trefethen & Bau, Algorithm 10.1: v = x + sign(x₁) ‖x‖ e₁, so the first
 *  entry is enlarged rather than cancelled. F = I − 2vvᵀ / vᵀv then sends
 *  x to −sign(x₁) ‖x‖ e₁. */
export function house(x: number[]): number[] {
  const nrm = Math.hypot(...x);
  if (nrm === 0) return x.slice();
  const v = x.slice();
  const s = Math.sign(v[0]!) || 1;
  v[0] += s * nrm;
  return v;
}

/** Apply F = I − 2vvᵀ / vᵀv to a single vector of the same length as v. */
export function reflect(v: number[], x: number[]): number[] {
  const vtv = dot(v, v);
  if (vtv === 0) return x.slice();
  const beta = 2 / vtv;
  const vtx = dot(v, x);
  return x.map((xi, i) => xi - beta * vtx * v[i]!);
}

/** Apply the embedded reflector to rows row0 : row0+|v| of M, columns col0 : . */
function applyHouseToRows(M: number[][], row0: number, col0: number, v: number[]): void {
  const vtv = dot(v, v);
  if (vtv === 0) return;
  const beta = 2 / vtv;
  const nCols = M[0]!.length;
  for (let j = col0; j < nCols; j++) {
    let s = 0;
    for (let i = 0; i < v.length; i++) s += v[i]! * M[row0 + i]![j]!;
    s *= beta;
    for (let i = 0; i < v.length; i++) M[row0 + i]![j] -= s * v[i]!;
  }
}

export interface QR {
  /** Thin Q, m×n, columns orthonormal. */
  Q: number[][];
  /** Thin R, n×n, upper triangular. */
  R: number[][];
}

/** Householder QR of a tall or square matrix. Q is thin (m×n), R is n×n.
 *  The code is the algorithm: one reflector per column, then the stored
 *  vectors are applied to I to assemble Q. */
export function householderQR(A: number[][]): QR {
  const m = A.length;
  const n = A[0]!.length;
  const work = A.map((row) => row.slice());
  const vs: number[][] = [];
  const steps = Math.min(n, Math.max(0, m - 1));

  for (let k = 0; k < steps; k++) {
    const x: number[] = [];
    for (let i = k; i < m; i++) x.push(work[i]![k]!);
    const v = house(x);
    vs.push(v);
    applyHouseToRows(work, k, k, v);
  }

  const Qfull = identity(m);
  for (let k = steps - 1; k >= 0; k--) applyHouseToRows(Qfull, k, 0, vs[k]!);

  const Q = Qfull.map((row) => row.slice(0, n));
  const R: number[][] = [];
  for (let i = 0; i < n; i++) {
    const row: number[] = [];
    for (let j = 0; j < n; j++) row.push(i > j ? 0 : work[i]![j]!);
    R.push(row);
  }
  return { Q, R };
}

export function solveUpper(R: number[][], y: number[]): number[] | null {
  const n = y.length;
  const x = new Array<number>(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    if (Math.abs(R[i]![i]!) < 1e-18) return null;
    let s = y[i]!;
    for (let j = i + 1; j < n; j++) s -= R[i]![j]! * x[j]!;
    x[i] = s / R[i]![i]!;
  }
  return x.every(Number.isFinite) ? x : null;
}

/** Least squares via thin QR: solve R x = Qᵀ b. */
export function lstsqQR(A: number[][], b: number[]): number[] | null {
  const { Q, R } = householderQR(A);
  return solveUpper(R, matVec(transpose(Q), b));
}

/** Least squares via the normal equations AᵀA x = Aᵀ b. Squares κ. */
export function lstsqNormal(A: number[][], b: number[]): number[] | null {
  return solveDense(gram(A), matVec(transpose(A), b));
}

export function lsResidual(A: number[][], x: number[], b: number[]): number {
  return norm2(sub(matVec(A, x), b));
}

/** |(AᵀA)₁₁ − 1| for the lesson pair. Equals ε² until 1+ε² rounds to 1. */
export function gramExcess(eps: number): number {
  return Math.abs(gram(nearParallelPair(eps))[0]![0]! - 1);
}

/** |R₂₂| from Householder QR of the lesson pair. Tracks ε √(2+ε²)/√(1+ε²). */
export function r22Abs(eps: number): number {
  const { R } = householderQR(nearParallelPair(eps));
  return Math.abs(R[1]![1]!);
}

/** Exact |R₂₂| of the lesson pair: the parallelogram area over ‖a₁‖. */
export function r22Exact(eps: number): number {
  return eps * Math.sqrt(2 + eps * eps) / Math.sqrt(1 + eps * eps);
}

/** Coordinates of the two columns in their own span, a₁ along the x-axis. */
export function spanCoords(eps: number): {
  a1: [number, number];
  a2: [number, number];
  theta: number;
} {
  const n1 = Math.hypot(1, eps);
  const n2 = n1;
  const c = 1 / (n1 * n2);
  const theta = Math.acos(Math.min(1, Math.max(-1, c)));
  return {
    a1: [n1, 0],
    a2: [n2 * Math.cos(theta), n2 * Math.sin(theta)],
    theta,
  };
}

/** κ₂(A) and κ₂(AᵀA) along a log-ε sweep that stays above the roundoff floor
 *  of 1+ε², so the measured Gram still has two eigenvalues. */
export function kappaSweep(
  epsHi = 1e-1,
  epsLo = 1e-6,
  n = 24,
): { eps: number; kappaA: number; kappaAtA: number }[] {
  return Array.from({ length: n }, (_, i) => {
    const t = i / (n - 1);
    const eps = epsHi * Math.pow(epsLo / epsHi, t);
    const A = nearParallelPair(eps);
    return { eps, kappaA: cond2(A), kappaAtA: cond2Gram(gram(A)) };
  });
}
