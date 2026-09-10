/** Singular value decomposition, the 2×2 ellipse, and Eckart–Young truncation.
 *
 *  2×2 is closed-form (eigenvalues of AᵀA). A tiny dense SVD (Jacobi on AᵀA)
 *  is enough for the picture in the lesson. Neither is a production SVD —
 *  Golub–Kahan bidiagonalization is a different lecture. Forming AᵀA here is
 *  fine because the matrices are 2×2 or 8×8; the QR lesson is why you would
 *  not do this at κ ~ 10⁸.
 */

import { frobenius, identity, matMul, matVec, subMat, symEig2, transpose } from './qr.ts';

export interface SVD {
  /** Left singular vectors, m×r, columns orthonormal. */
  U: number[][];
  /** Singular values, length r, descending, ≥ 0. */
  S: number[];
  /** Right singular vectors, n×r, columns orthonormal. */
  V: number[][];
}

/** Golden ratio. Singular values of the lesson shear are φ and 1/φ. */
export const PHI = (1 + Math.sqrt(5)) / 2;

/** The shear that opens the lesson. Unit square → parallelogram with sides
 *  (1, 0) and (1, 1). Unit circle → ellipse with axis lengths φ and 1/φ.
 *  Eigenvalues are both 1, so |λ_max|/|λ_min| = 1 while κ₂ = φ². */
export const SHEAR: number[][] = [
  [1, 1],
  [0, 1],
];

export const PICTURE_N = 8;

/** Prescribed spectrum of the demo picture. Rank-2 residual in 2-norm is σ₃. */
export const PICTURE_SIGMAS = [5, 1.6, 0.4, 0.1, 0.025, 0.006, 0.0015, 0.0004];

const EPS = 1e-14;

const dot = (a: number[], b: number[]): number =>
  a.reduce((s, ai, i) => s + ai * b[i]!, 0);

/** Unit eigenvector of a symmetric 2×2 for a given eigenvalue. */
export function eigenvector2(S: number[][], lambda: number): [number, number] {
  const a = S[0]![0]!;
  const b = S[0]![1]!;
  const c = S[1]![1]!;
  if (Math.abs(b) < EPS * (Math.abs(a) + Math.abs(c) + 1)) {
    return Math.abs(lambda - a) <= Math.abs(lambda - c) ? [1, 0] : [0, 1];
  }
  // First row of (S − λI)v = 0: (a−λ)x + b y = 0.
  const x = b;
  const y = -(a - lambda);
  const n = Math.hypot(x, y);
  return n === 0 ? [1, 0] : [x / n, y / n];
}

/** Analytic SVD of a 2×2. σ from √eig(AᵀA); V from those eigenvectors;
 *  u_i = A v_i / σ_i, with a perpendicular completion if σ₂ = 0. */
export function svd2x2(A: number[][]): SVD {
  const a00 = A[0]![0]!, a01 = A[0]![1]!, a10 = A[1]![0]!, a11 = A[1]![1]!;
  const G = [
    [a00 * a00 + a10 * a10, a00 * a01 + a10 * a11],
    [0, a01 * a01 + a11 * a11],
  ];
  G[1]![0] = G[0]![1]!;
  const [l1, l2] = symEig2(G);
  const s1 = Math.sqrt(Math.max(0, l1));
  const s2 = Math.sqrt(Math.max(0, l2));

  const v1 = eigenvector2(G, l1);
  const v2: [number, number] = [-v1[1], v1[0]];
  const V = [
    [v1[0], v2[0]],
    [v1[1], v2[1]],
  ];

  const Av1 = matVec(A, v1);
  const Av2 = matVec(A, v2);
  let u1: [number, number];
  if (s1 > EPS) u1 = [Av1[0]! / s1, Av1[1]! / s1];
  else u1 = [1, 0];

  let u2: [number, number];
  if (s2 > EPS * Math.max(s1, 1)) {
    u2 = [Av2[0]! / s2, Av2[1]! / s2];
  } else {
    u2 = [-u1[1], u1[0]];
    if (u2[0] * Av2[0]! + u2[1] * Av2[1]! < 0) u2 = [-u2[0], -u2[1]];
  }

  return {
    U: [
      [u1[0], u2[0]],
      [u1[1], u2[1]],
    ],
    S: [s1, s2],
    V,
  };
}

/** Classic Jacobi eigensolver for a small dense symmetric matrix.
 *  Returns eigenvalues (unsorted) and V with A V = V Λ. */
export function jacobiEig(
  S: number[][],
  maxSweeps = 40,
): { values: number[]; vectors: number[][] } {
  const n = S.length;
  const A = S.map((row) => row.slice());
  const V = identity(n);
  const tol = 1e-15;

  for (let sweep = 0; sweep < maxSweeps; sweep++) {
    let off = 0;
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) off += A[i]![j]! * A[i]![j]!;
    }
    const fro = frobenius(A);
    if (Math.sqrt(2 * off) <= tol * Math.max(fro, 1e-30)) break;

    for (let p = 0; p < n; p++) {
      for (let q = p + 1; q < n; q++) {
        const apq = A[p]![q]!;
        const app = A[p]![p]!;
        const aqq = A[q]![q]!;
        if (Math.abs(apq) <= tol * (Math.abs(app) + Math.abs(aqq))) continue;

        const tau = (aqq - app) / (2 * apq);
        const sgt = tau >= 0 ? 1 : -1;
        const t = sgt / (Math.abs(tau) + Math.hypot(1, tau));
        const c = 1 / Math.hypot(1, t);
        const s = c * t;

        for (let i = 0; i < n; i++) {
          if (i === p || i === q) continue;
          const aip = A[i]![p]!;
          const aiq = A[i]![q]!;
          A[i]![p] = c * aip - s * aiq;
          A[i]![q] = s * aip + c * aiq;
          A[p]![i] = A[i]![p]!;
          A[q]![i] = A[i]![q]!;
        }
        A[p]![p] = c * c * app - 2 * c * s * apq + s * s * aqq;
        A[q]![q] = s * s * app + 2 * c * s * apq + c * c * aqq;
        A[p]![q] = 0;
        A[q]![p] = 0;

        for (let i = 0; i < n; i++) {
          const vip = V[i]![p]!;
          const viq = V[i]![q]!;
          V[i]![p] = c * vip - s * viq;
          V[i]![q] = s * vip + c * viq;
        }
      }
    }
  }

  return { values: A.map((row, i) => row[i]!), vectors: V };
}

function setCol(M: number[][], j: number, col: number[]): void {
  for (let i = 0; i < M.length; i++) M[i]![j] = col[i]!;
}

function getCol(M: number[][], j: number): number[] {
  return M.map((row) => row[j]!);
}

/** Gram–Schmidt a column against previous columns, then normalise. */
function completeCol(U: number[][], j: number): void {
  const m = U.length;
  let col = getCol(U, j);
  if (Math.hypot(...col) < EPS) {
    col = Array.from({ length: m }, (_, i) => (i === j % m ? 1 : 0));
  }
  for (let k = 0; k < j; k++) {
    const uk = getCol(U, k);
    const proj = dot(col, uk);
    col = col.map((ci, i) => ci - proj * uk[i]!);
  }
  const nrm = Math.hypot(...col);
  if (nrm < EPS) return;
  setCol(U, j, col.map((ci) => ci / nrm));
}

/** Thin SVD of a small dense matrix via Jacobi on AᵀA. Square or tall. */
export function svdDense(A: number[][]): SVD {
  const m = A.length;
  const n = A[0]!.length;
  const G = matMul(transpose(A), A);
  const { values, vectors } = jacobiEig(G);
  const idx = values.map((_, i) => i).sort((i, j) => values[j]! - values[i]!);
  const S = idx.map((i) => Math.sqrt(Math.max(0, values[i]!)));
  const V = vectors.map((row) => idx.map((i) => row[i]!));

  const AV = matMul(A, V);
  const U: number[][] = Array.from({ length: m }, () => new Array(n).fill(0));
  const s0 = S[0] ?? 1;
  for (let j = 0; j < n; j++) {
    const col = getCol(AV, j);
    const nrm = Math.hypot(...col);
    if (nrm > EPS * Math.max(s0, 1)) setCol(U, j, col.map((ci) => ci / nrm));
    else completeCol(U, j);
  }
  return { U, S, V };
}

export function svd(A: number[][]): SVD {
  if (A.length === 2 && A[0]!.length === 2) return svd2x2(A);
  return svdDense(A);
}

/** A = U Σ Vᵀ as a sum of outer products. */
export function reconstruct(U: number[][], S: number[], V: number[][]): number[][] {
  const m = U.length;
  const n = V.length;
  const r = S.length;
  const C: number[][] = Array.from({ length: m }, () => new Array(n).fill(0));
  for (let k = 0; k < r; k++) {
    const s = S[k]!;
    for (let i = 0; i < m; i++) {
      const u = s * U[i]![k]!;
      for (let j = 0; j < n; j++) C[i]![j] += u * V[j]![k]!;
    }
  }
  return C;
}

/** Keep the first k singular components. k = 0 is the zero matrix. */
export function truncateSvd(fact: SVD, k: number): SVD {
  const r = Math.max(0, Math.min(Math.floor(k), fact.S.length));
  return {
    U: fact.U.map((row) => row.slice(0, r)),
    S: fact.S.slice(0, r),
    V: fact.V.map((row) => row.slice(0, r)),
  };
}

export function rankK(A: number[][], k: number): number[][] {
  const t = truncateSvd(svd(A), k);
  if (t.S.length === 0) {
    return A.map((row) => row.map(() => 0));
  }
  return reconstruct(t.U, t.S, t.V);
}

/** ‖A‖₂ = σ_max. */
export function opnorm2(A: number[][]): number {
  return svd(A).S[0] ?? 0;
}

/** Eckart–Young: ‖A − A_k‖₂ = σ_{k+1}. Measured by an SVD of the residual. */
export function spectralResidual(A: number[][], k: number): number {
  return opnorm2(subMat(A, rankK(A, k)));
}

/** Eckart–Young–Mirsky: ‖A − A_k‖_F = √(σ_{k+1}² + ⋯). */
export function frobeniusResidual(A: number[][], k: number): number {
  return frobenius(subMat(A, rankK(A, k)));
}

/** The leftover 2-norm predicted by the dropped σ, not by forming A − A_k. */
export function droppedSigma(A: number[][], k: number): number {
  const { S } = svd(A);
  return S[k] ?? 0;
}

export function kappa2(A: number[][]): number {
  const { S } = svd(A);
  const sMax = S[0] ?? 0;
  const sMin = S[S.length - 1] ?? 0;
  if (!(sMin > 0)) return Number.POSITIVE_INFINITY;
  return sMax / sMin;
}

/** Same U, V as the lesson shear, with a chosen minor axis. Thinning σ₂
 *  flattens the ellipse without rotating the axes. */
export function lessonEllipse(sigma2: number): number[][] {
  const { U, V } = svd2x2(SHEAR);
  return reconstruct(U, [PHI, Math.max(0, sigma2)], V);
}

/** σ₂ that makes κ₂(lessonEllipse) = κ. σ₁ is pinned at φ. */
export function flattenSigma2ForKappa(kappa: number): number {
  return PHI / kappa;
}

export function shearEigenvalues(): [number, number] {
  // Characteristic polynomial (1 − λ)². A Jordan block; not diagonalizable.
  return [1, 1];
}

/** DCT-II mode k on n points — an ONB for k = 0..n−1. */
export function dctMode(n: number, k: number): number[] {
  const scale = k === 0 ? Math.sqrt(1 / n) : Math.sqrt(2 / n);
  return Array.from(
    { length: n },
    (_, i) => scale * Math.cos((Math.PI * k * (i + 0.5)) / n),
  );
}

/** 8×8 picture: Σ prescribed, U and V orthonormal DCT modes. The spectrum
 *  the widget prints is this list, not a fitted curve. */
export function demoPicture(sigmas: number[] = PICTURE_SIGMAS): number[][] {
  const n = sigmas.length;
  const A: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let k = 0; k < n; k++) {
    const u = dctMode(n, k);
    // 3 is coprime to 8, so k ↦ 3k mod 8 permutes the ONB.
    const v = dctMode(n, (k * 3) % n);
    const s = sigmas[k]!;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) A[i]![j] += s * u[i]! * v[j]!;
    }
  }
  return A;
}

/** ‖picture − picture_k‖₂ = σ_{k+1}. Same number the estimate widget uses. */
export function pictureResidual2(k: number): number {
  return droppedSigma(demoPicture(), k);
}

export function mapCircle(
  A: number[][],
  n = 128,
): { x: number; y: number }[] {
  return Array.from({ length: n }, (_, i) => {
    const t = (2 * Math.PI * i) / n;
    const w = matVec(A, [Math.cos(t), Math.sin(t)]);
    return { x: w[0]!, y: w[1]! };
  });
}

export function radiusRange(
  A: number[][],
  n = 360,
): { rMin: number; rMax: number } {
  let rMin = Infinity;
  let rMax = 0;
  for (const p of mapCircle(A, n)) {
    const r = Math.hypot(p.x, p.y);
    if (r < rMin) rMin = r;
    if (r > rMax) rMax = r;
  }
  return { rMin, rMax };
}

/** Semi-axis vectors σ_i u_i — the arrows the ellipse actually wears. */
export function singularAxes(A: number[][]): {
  s1: number;
  s2: number;
  u1: [number, number];
  u2: [number, number];
  axis1: [number, number];
  axis2: [number, number];
} {
  const { U, S } = svd2x2(A);
  const s1 = S[0] ?? 0;
  const s2 = S[1] ?? 0;
  const u1: [number, number] = [U[0]![0]!, U[1]![0]!];
  const u2: [number, number] = [U[0]![1]!, U[1]![1]!];
  return {
    s1,
    s2,
    u1,
    u2,
    axis1: [s1 * u1[0], s1 * u1[1]],
    axis2: [s2 * u2[0], s2 * u2[1]],
  };
}

export function columns2(A: number[][]): { a1: [number, number]; a2: [number, number] } {
  return {
    a1: [A[0]![0]!, A[1]![0]!],
    a2: [A[0]![1]!, A[1]![1]!],
  };
}

export function frobeniusOfSigma(S: number[], from = 0): number {
  let s = 0;
  for (let i = from; i < S.length; i++) s += S[i]! * S[i]!;
  return Math.sqrt(s);
}
