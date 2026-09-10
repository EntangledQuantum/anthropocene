/* ─────────────────────────────────────────────────────────────────────────
   Stationary iteration on the 1D Dirichlet Laplacian.

   Poisson Au = f, A from operator.ts. Jacobi and Gauss–Seidel as *smoothers*:
   they kill high-k error in a few sweeps and stall on the long wave. The
   iterate of the homogeneous problem (f = 0) is the error itself.

   Weighted Jacobi, ω = 2/3, is the textbook smoother (Briggs ch. 2): every
   mode with k ≥ n/2 contracts by at most 1/3 per sweep. Undamped Jacobi
   (ω = 1) has spectral radius cos(π/(n+1)) and leaves the Nyquist mode.

   Gauss–Seidel uses the neighbour just written. Same leftover wave, tighter
   beat: ρ_GS = ρ_J². Not a second method — a faster smoother.

   Krylov (CG) is appended in this module by the next lesson, so both share
   residual() and the same A.
   ───────────────────────────────────────────────────────────────────────── */

import { applyLaplacian, dot, laplacianGrid } from './operator.ts';
import { norm2 } from './types.ts';

export const DEMO_N = 31;
export const JACOBI_SMOOTH_OMEGA = 2 / 3;
export const MIXED_LOW_K = 1;
export const MIXED_HIGH_K = 16;

export type StationaryMethod = 'jacobi' | 'gauss-seidel';

export function zeros(n: number): number[] {
  return new Array(n).fill(0);
}

/** Discrete sine mode φ_k[i] = sin((i+1) k π / (n+1)), k = 1..n. */
export function dirichletMode(n: number, k: number): number[] {
  if (k < 1 || k > n) throw new Error(`mode k must be in 1..${n}`);
  const den = n + 1;
  return Array.from({ length: n }, (_, i) => Math.sin(((i + 1) * k * Math.PI) / den));
}

export function mixedError(n: number, terms: { k: number; amp: number }[]): number[] {
  const u = zeros(n);
  for (const t of terms) {
    const phi = dirichletMode(n, t.k);
    for (let i = 0; i < n; i++) u[i]! += t.amp * phi[i]!;
  }
  return u;
}

export function demoMixed(n = DEMO_N): number[] {
  return mixedError(n, [
    { k: MIXED_LOW_K, amp: 1 },
    { k: MIXED_HIGH_K, amp: 0.45 },
  ]);
}

/** DST coefficient of mode k. Modes are orthogonal; ‖φ_k‖² = (n+1)/2. */
export function modeCoeff(u: number[], k: number): number {
  const n = u.length;
  const phi = dirichletMode(n, k);
  const den = dot(phi, phi);
  return den === 0 ? 0 : dot(u, phi) / den;
}

export function modeSpectrum(u: number[]): number[] {
  const n = u.length;
  return Array.from({ length: n }, (_, i) => Math.abs(modeCoeff(u, i + 1)));
}

export function residual(u: number[], f: number[]): number[] {
  const Au = applyLaplacian(u, 'dirichlet');
  return f.map((fi, i) => fi - Au[i]!);
}

/** μ_k = 1 − 2ω sin²(kπ / (2(n+1))). Eigenvalue of weighted Jacobi on this A. */
export function jacobiDamping(k: number, n: number, omega = 1): number {
  const s = Math.sin((k * Math.PI) / (2 * (n + 1)));
  return 1 - 2 * omega * s * s;
}

export function jacobiSpectralRadius(n: number, omega = 1): number {
  let rho = 0;
  for (let k = 1; k <= n; k++) rho = Math.max(rho, Math.abs(jacobiDamping(k, n, omega)));
  return rho;
}

/** max_{k ≥ n/2} |μ_k|. For ω = 2/3 this is 1/3, independent of h. */
export function jacobiSmoothingFactor(n: number, omega = JACOBI_SMOOTH_OMEGA): number {
  const start = Math.max(1, Math.ceil(n / 2));
  let mu = 0;
  for (let k = start; k <= n; k++) mu = Math.max(mu, Math.abs(jacobiDamping(k, n, omega)));
  return mu;
}

export function gaussSeidelSpectralRadius(n: number): number {
  const c = Math.cos(Math.PI / (n + 1));
  return c * c;
}

export function itersToReduce(rho: number, factor: number): number {
  if (!(rho > 0 && rho < 1) || factor <= 0 || factor >= 1) return Infinity;
  return Math.log(factor) / Math.log(rho);
}

/**
 * One weighted Jacobi sweep.
 *   u_i ← (1−ω) u_i + ω (u_{i−1} + u_{i+1} + h² f_i) / 2
 * Homogeneous Dirichlet walls contribute 0.
 */
export function jacobiSweep(u: number[], f: number[], omega = 1): number[] {
  const n = u.length;
  const { h } = laplacianGrid(n, 'dirichlet');
  const h2 = h * h;
  const out = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    const left = i === 0 ? 0 : u[i - 1]!;
    const right = i === n - 1 ? 0 : u[i + 1]!;
    const jacobi = (left + right + h2 * f[i]!) / 2;
    out[i] = (1 - omega) * u[i]! + omega * jacobi;
  }
  return out;
}

/**
 * One lexicographic Gauss–Seidel sweep. Left neighbour is already new.
 *   u_i ← (u_{i−1}^{new} + u_{i+1}^{old} + h² f_i) / 2
 */
export function gaussSeidelSweep(u: number[], f: number[]): number[] {
  const n = u.length;
  const { h } = laplacianGrid(n, 'dirichlet');
  const h2 = h * h;
  const out = u.slice();
  for (let i = 0; i < n; i++) {
    const left = i === 0 ? 0 : out[i - 1]!;
    const right = i === n - 1 ? 0 : out[i + 1]!;
    out[i] = (left + right + h2 * f[i]!) / 2;
  }
  return out;
}

export function stationarySweep(
  u: number[],
  f: number[],
  method: StationaryMethod,
  omega = JACOBI_SMOOTH_OMEGA,
): number[] {
  return method === 'gauss-seidel' ? gaussSeidelSweep(u, f) : jacobiSweep(u, f, omega);
}

export function applySweeps(
  u: number[],
  f: number[],
  count: number,
  method: StationaryMethod = 'jacobi',
  omega = JACOBI_SMOOTH_OMEGA,
): number[] {
  let v = u;
  for (let s = 0; s < count; s++) v = stationarySweep(v, f, method, omega);
  return v;
}

export interface SweepRecord {
  sweep: number;
  err: number;
  res: number;
  low: number;
  high: number;
}

export function sweepHistory(
  u0: number[],
  f: number[],
  sweeps: number,
  method: StationaryMethod = 'jacobi',
  omega = JACOBI_SMOOTH_OMEGA,
  lowK = MIXED_LOW_K,
  highK = MIXED_HIGH_K,
): SweepRecord[] {
  const e0 = Math.max(norm2(u0), 1e-30);
  const r0 = Math.max(norm2(residual(u0, f)), 1e-30);
  const out: SweepRecord[] = [{
    sweep: 0,
    err: 1,
    res: 1,
    low: Math.abs(modeCoeff(u0, lowK)),
    high: Math.abs(modeCoeff(u0, highK)),
  }];
  let u = u0;
  for (let s = 1; s <= sweeps; s++) {
    u = stationarySweep(u, f, method, omega);
    out.push({
      sweep: s,
      err: norm2(u) / e0,
      res: norm2(residual(u, f)) / r0,
      low: Math.abs(modeCoeff(u, lowK)),
      high: Math.abs(modeCoeff(u, highK)),
    });
  }
  return out;
}

/** Deterministic in [-1, 1], so the lab and the tests agree. */
export function hashedField(n: number, seed = 1): number[] {
  const u = new Array<number>(n);
  let s = seed | 0;
  for (let i = 0; i < n; i++) {
    s = (Math.imul(s, 1664525) + 1013904223) | 0;
    u[i] = ((s >>> 0) / 0xffffffff) * 2 - 1;
  }
  return u;
}

/** Dominant |eigenvalue| of a homogeneous iteration, from a normalised start. */
export function powerRadius(
  n: number,
  method: StationaryMethod,
  omega = 1,
  warm = 80,
): number {
  const f = zeros(n);
  let u = hashedField(n, 7);
  const nrm0 = norm2(u);
  u = u.map((v) => v / nrm0);
  for (let s = 0; s < warm; s++) {
    u = stationarySweep(u, f, method, omega);
    const nrm = norm2(u);
    if (nrm === 0) return 0;
    u = u.map((v) => v / nrm);
  }
  return norm2(stationarySweep(u, f, method, omega));
}
