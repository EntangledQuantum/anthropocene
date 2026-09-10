/* ─────────────────────────────────────────────────────────────────────────
   Two-grid correction on the 1D Dirichlet Laplacian.

   After a few Jacobi sweeps the error is a long wave. That wave is a cheap,
   well-resolved Poisson problem on a grid twice as coarse. Restriction
   copies the residual there; an exact coarse solve computes the wave;
   prolongation adds it back.

   Fine n = 2 n_c + 1 interiors (n = 3, 7, 15, 31, …). Linear interpolation
   P and full weighting R satisfy R = (1/2) Pᵀ. Galerkin R A P is the
   geometric coarse Laplacian on this operator — the transfers are not a
   second discretisation, they *are* the coarse A.

   Nested two-grid is the V-cycle. This module stops there.
   ───────────────────────────────────────────────────────────────────────── */

import { applyLaplacian, denseLaplacian, laplacianGrid } from './operator.ts';
import { solveDense } from './linalg.ts';
import { add, norm2 } from './types.ts';
import {
  JACOBI_SMOOTH_OMEGA,
  MIXED_HIGH_K,
  MIXED_LOW_K,
  applySweeps,
  hashedField,
  modeCoeff,
  residual,
  zeros,
} from './iterative.ts';

export const MG_FINE_N = 31;
export const MG_PRE = 2;
export const MG_POST = 1;

export function isTwoGridSize(n: number): boolean {
  return n >= 3 && n % 2 === 1;
}

/** n_c = (n − 1)/2. Fine interiors 2 n_c + 1, so every other node coincides. */
export function coarseSize(n: number): number {
  if (!isTwoGridSize(n)) throw new Error(`two-grid needs odd n ≥ 3, got ${n}`);
  return (n - 1) / 2;
}

/**
 * Linear interpolation P: n_c → n.
 *   (P e)_{2I+1} = e_I                 coinciding node
 *   (P e)_{2I}   = (e_{I−1} + e_I)/2   midpoint (walls contribute 0)
 */
export function prolong(coarse: number[]): number[] {
  const nc = coarse.length;
  const n = 2 * nc + 1;
  const fine = new Array<number>(n);
  for (let I = 0; I < nc; I++) fine[2 * I + 1] = coarse[I]!;
  for (let I = 0; I <= nc; I++) {
    const left = I === 0 ? 0 : coarse[I - 1]!;
    const right = I === nc ? 0 : coarse[I]!;
    fine[2 * I] = 0.5 * (left + right);
  }
  return fine;
}

/**
 * Full weighting R: n → n_c.
 *   (R r)_I = (r_{2I} + 2 r_{2I+1} + r_{2I+2}) / 4
 * Euclidean adjoint of P up to 1/2: R = (1/2) Pᵀ.
 */
export function restrict(fine: number[]): number[] {
  const nc = coarseSize(fine.length);
  const coarse = new Array<number>(nc);
  for (let I = 0; I < nc; I++) {
    coarse[I] = 0.25 * fine[2 * I]! + 0.5 * fine[2 * I + 1]! + 0.25 * fine[2 * I + 2]!;
  }
  return coarse;
}

/** Exact coarse Poisson solve. n_c is tiny; dense is the readable method. */
export function coarseSolve(rCoarse: number[]): number[] {
  const x = solveDense(denseLaplacian(rCoarse.length, 'dirichlet'), rCoarse);
  if (!x) throw new Error('coarse Dirichlet Laplacian is SPD — solve must succeed');
  return x;
}

/** A_c v = R A^h (P v). Galerkin action, no assembled matrix. */
export function applyGalerkin(vCoarse: number[]): number[] {
  return restrict(applyLaplacian(prolong(vCoarse), 'dirichlet'));
}

export function applyCoarseLaplacian(vCoarse: number[]): number[] {
  return applyLaplacian(vCoarse, 'dirichlet');
}

export interface TwoGridOpts {
  pre?: number;
  post?: number;
  omega?: number;
}

/**
 * One two-grid V-cycle.
 *   pre-smooth → r = f − A u → r_c = R r → A_c e_c = r_c → u ← u + P e_c → post-smooth
 */
export function twoGridCycle(
  u: number[],
  f: number[],
  { pre = MG_PRE, post = MG_POST, omega = JACOBI_SMOOTH_OMEGA }: TwoGridOpts = {},
): number[] {
  let v = applySweeps(u, f, pre, 'jacobi', omega);
  const eCoarse = coarseSolve(restrict(residual(v, f)));
  v = add(v, prolong(eCoarse));
  return applySweeps(v, f, post, 'jacobi', omega);
}

/** Coarse-grid correction with no smoothing. The skip-smooth experiment. */
export function coarseGridCorrection(u: number[], f: number[]): number[] {
  return add(u, prolong(coarseSolve(restrict(residual(u, f)))));
}

/**
 * Nested two-grid until one unknown. The V-cycle: every coarse problem is
 * the same leftover-wave problem. Recursion starts from 0 on the residual.
 */
export function vcycle(
  u: number[],
  f: number[],
  { pre = MG_PRE, post = MG_POST, omega = JACOBI_SMOOTH_OMEGA }: TwoGridOpts = {},
): number[] {
  const n = u.length;
  if (n <= 1) return coarseSolve(f);
  let v = applySweeps(u, f, pre, 'jacobi', omega);
  const rCoarse = restrict(residual(v, f));
  const eCoarse = vcycle(zeros(rCoarse.length), rCoarse, { pre, post, omega });
  v = add(v, prolong(eCoarse));
  return applySweeps(v, f, post, 'jacobi', omega);
}

export interface CycleRecord {
  cycle: number;
  err: number;
  res: number;
  low: number;
  high: number;
}

export function twoGridHistory(
  u0: number[],
  f: number[],
  cycles: number,
  opts: TwoGridOpts = {},
  lowK = MIXED_LOW_K,
  highK = MIXED_HIGH_K,
): CycleRecord[] {
  const e0 = Math.max(norm2(u0), 1e-30);
  const r0 = Math.max(norm2(residual(u0, f)), 1e-30);
  const out: CycleRecord[] = [{
    cycle: 0,
    err: 1,
    res: 1,
    low: Math.abs(modeCoeff(u0, lowK)),
    high: Math.abs(modeCoeff(u0, highK)),
  }];
  let u = u0;
  for (let c = 1; c <= cycles; c++) {
    u = twoGridCycle(u, f, opts);
    out.push({
      cycle: c,
      err: norm2(u) / e0,
      res: norm2(residual(u, f)) / r0,
      low: Math.abs(modeCoeff(u, lowK)),
      high: Math.abs(modeCoeff(u, highK)),
    });
  }
  return out;
}

export interface Reduction {
  err: number;
  res: number;
}

/** One cycle from a hashed homogeneous start. The n-independence experiment. */
export function twoGridReduction(n: number, opts: TwoGridOpts = {}, seed = 3): Reduction {
  const u0 = hashedField(n, seed);
  const f = zeros(n);
  const u1 = twoGridCycle(u0, f, opts);
  return {
    err: norm2(u1) / Math.max(norm2(u0), 1e-30),
    res: norm2(residual(u1, f)) / Math.max(norm2(residual(u0, f)), 1e-30),
  };
}

/** Same start, same work: pre+post Jacobi sweeps, no coarse correction. */
export function jacobiWorkReduction(n: number, opts: TwoGridOpts = {}, seed = 3): Reduction {
  const pre = opts.pre ?? MG_PRE;
  const post = opts.post ?? MG_POST;
  const omega = opts.omega ?? JACOBI_SMOOTH_OMEGA;
  const u0 = hashedField(n, seed);
  const f = zeros(n);
  const u1 = applySweeps(u0, f, pre + post, 'jacobi', omega);
  return {
    err: norm2(u1) / Math.max(norm2(u0), 1e-30),
    res: norm2(residual(u1, f)) / Math.max(norm2(residual(u0, f)), 1e-30),
  };
}

export function twoGridCyclesUntil(
  n: number,
  factor: number,
  maxCycles = 40,
  opts: TwoGridOpts = {},
  seed = 3,
): number {
  let u = hashedField(n, seed);
  const f = zeros(n);
  const e0 = norm2(u);
  if (e0 === 0) return 0;
  for (let c = 0; c <= maxCycles; c++) {
    if (norm2(u) <= factor * e0) return c;
    if (c < maxCycles) u = twoGridCycle(u, f, opts);
  }
  return maxCycles + 1;
}

export function coarseGrid(nFine: number): { x: number[]; h: number; n: number } {
  const n = coarseSize(nFine);
  const g = laplacianGrid(n, 'dirichlet');
  return { n, x: g.x, h: g.h };
}
