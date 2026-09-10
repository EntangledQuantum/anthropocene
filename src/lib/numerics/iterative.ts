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

import { applyLaplacian, cholesky, denseLaplacian, dirichletEigenvalues, dot, laplacian1d, laplacianGrid, sampleField } from './operator.ts';
import { axpy, norm2, sub } from './types.ts';
import { solveDense } from './linalg.ts';

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

/* ── Krylov / CG (Wave 5, appended onto the Jacobi smoother) ──────────── */

export type Matvec = (x: number[]) => number[];

export interface IterStep {
  k: number;
  x: number[];
  r: number[];
  residualNorm: number;
}

export interface CgStep extends IterStep {
  /** Search direction. A-orthogonal to every previous p. */
  p: number[];
}

export interface DirichletPoisson {
  n: number;
  h: number;
  x: number[];
  b: number[];
  applyA: Matvec;
}

export type PoissonLoad = 'ones' | 'sine' | 'mixed';

/** Canonical 1D Poisson −u″ = f on [0,1], homogeneous Dirichlet.
 *  `mixed` breaks the low-mode eigenvector so n = 2 still has a 2D Krylov
 *  plane (a constant load *is* that mode). */
export function dirichletPoisson(n: number, load: PoissonLoad = 'mixed'): DirichletPoisson {
  if (n < 1) throw new Error('need n ≥ 1');
  const op = laplacian1d(n, 'dirichlet');
  const applyA: Matvec = (u) => applyLaplacian(u, 'dirichlet');
  let b: number[];
  if (load === 'ones') b = new Array(n).fill(1);
  else if (load === 'sine') b = op.x.map((xi) => Math.PI * Math.PI * Math.sin(Math.PI * xi));
  else {
    const bump = sampleField('bump', op.x);
    const spike = sampleField('spike', op.x, Math.max(0, Math.floor(n / 3)));
    b = bump.map((v, i) => v + 0.55 * spike[i]!);
  }
  return { n, h: op.h, x: op.x, b, applyA };
}

export const residualOf = (applyA: Matvec, x: number[], b: number[]): number[] =>
  sub(b, applyA(x));

/** uᵀAv. A must be self-adjoint for this to equal vᵀAu. */
export function aInner(applyA: Matvec, u: number[], v: number[]): number {
  return dot(u, applyA(v));
}

/** [r, Ar, A²r, …, A^{k−1}r]. The columns that span K_k. */
export function krylovPowers(applyA: Matvec, r0: number[], k: number): number[][] {
  const cols: number[][] = [];
  if (k < 1) return cols;
  let v = r0.slice();
  cols.push(v.slice());
  for (let i = 1; i < k; i++) {
    v = applyA(v);
    cols.push(v);
  }
  return cols;
}

/* ── Jacobi on this Laplacian (comparison baseline for CG) ─────────────── */

/** One Jacobi sweep. For the Dirichlet three-point stencil this is
 *  xᵢ ← (x_{i−1} + x_{i+1})/2 + (h²/2) bᵢ, walls contributing 0. */
export function jacobiLaplacianSweep(x: number[], b: number[]): number[] {
  const n = x.length;
  const { h } = laplacianGrid(n, 'dirichlet');
  const w = (h * h) / 2;
  const next = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    const left = i === 0 ? 0 : x[i - 1]!;
    const right = i === n - 1 ? 0 : x[i + 1]!;
    next[i] = 0.5 * (left + right) + w * b[i]!;
  }
  return next;
}

export function jacobiResidualHistory(
  b: number[],
  steps: number,
  x0?: number[],
): IterStep[] {
  const n = b.length;
  let x = x0 ? x0.slice() : new Array(n).fill(0);
  const applyA: Matvec = (u) => applyLaplacian(u, 'dirichlet');
  const out: IterStep[] = [];
  for (let k = 0; k <= steps; k++) {
    const r = residualOf(applyA, x, b);
    out.push({ k, x: x.slice(), r, residualNorm: norm2(r) });
    if (k < steps) x = jacobiLaplacianSweep(x, b);
  }
  return out;
}

/** First k where Jacobi residual ≤ target. Returns maxSteps + 1 if it never
 *  gets there — the overlay's honest "Jacobi has not caught CG" answer. */
export function jacobiStepsUntil(
  b: number[],
  target: number,
  maxSteps: number,
  x0?: number[],
): number {
  const n = b.length;
  let x = x0 ? x0.slice() : new Array(n).fill(0);
  const applyA: Matvec = (u) => applyLaplacian(u, 'dirichlet');
  for (let k = 0; k <= maxSteps; k++) {
    if (norm2(residualOf(applyA, x, b)) <= target) return k;
    x = jacobiLaplacianSweep(x, b);
  }
  return maxSteps + 1;
}

/* ── steepest descent (the gradient-descent CG is not) ─────────────────── */

export function steepestDescentHistory(
  applyA: Matvec,
  b: number[],
  steps: number,
  x0?: number[],
): IterStep[] {
  const n = b.length;
  let x = x0 ? x0.slice() : new Array(n).fill(0);
  let r = residualOf(applyA, x, b);
  const out: IterStep[] = [{ k: 0, x: x.slice(), r: r.slice(), residualNorm: norm2(r) }];
  for (let k = 1; k <= steps; k++) {
    const rr = dot(r, r);
    if (rr === 0) {
      out.push({ k, x: x.slice(), r: r.slice(), residualNorm: 0 });
      continue;
    }
    const Ar = applyA(r);
    const rAr = dot(r, Ar);
    if (rAr <= 0) break;
    const alpha = rr / rAr;
    x = axpy(alpha, r, x);
    r = axpy(-alpha, Ar, r);
    out.push({ k, x: x.slice(), r: r.slice(), residualNorm: norm2(r) });
  }
  return out;
}

/* ── conjugate gradient ────────────────────────────────────────────────── */

/**
 * Hestenes–Stiefel CG. Short recurrence, one matvec per step.
 *
 *   α = (r·r) / (pᵀAp)
 *   x ← x + α p
 *   r ← r − α Ap
 *   β = (r₊·r₊) / (r·r)
 *   p ← r₊ + β p
 *
 * Default is to run `maxIter` steps even after the residual has dropped,
 * so the finite-termination floor is visible rather than cropped.
 */
export function conjugateGradient(
  applyA: Matvec,
  b: number[],
  { x0, maxIter, tol = 0 }: { x0?: number[]; maxIter?: number; tol?: number } = {},
): CgStep[] {
  const n = b.length;
  const steps = maxIter ?? n;
  let x = x0 ? x0.slice() : new Array(n).fill(0);
  let r = residualOf(applyA, x, b);
  let p = r.slice();
  let rr = dot(r, r);
  const out: CgStep[] = [{ k: 0, x: x.slice(), r: r.slice(), p: p.slice(), residualNorm: Math.sqrt(rr) }];

  for (let k = 1; k <= steps; k++) {
    if (rr === 0 || (tol > 0 && Math.sqrt(rr) <= tol)) {
      out.push({ k, x: x.slice(), r: r.slice(), p: p.slice(), residualNorm: Math.sqrt(rr) });
      continue;
    }
    const Ap = applyA(p);
    const pAp = dot(p, Ap);
    if (pAp <= 0) break;
    const alpha = rr / pAp;
    x = axpy(alpha, p, x);
    r = axpy(-alpha, Ap, r);
    const rrNew = dot(r, r);
    const beta = rr === 0 ? 0 : rrNew / rr;
    p = axpy(beta, p, r);
    rr = rrNew;
    out.push({ k, x: x.slice(), r: r.slice(), p: p.slice(), residualNorm: Math.sqrt(rr) });
  }
  return out;
}

export function cgHistory(
  b: number[],
  steps: number,
  x0?: number[],
): CgStep[] {
  return conjugateGradient((u) => applyLaplacian(u, 'dirichlet'), b, {
    x0,
    maxIter: steps,
  });
}

/** Exact (dense) Dirichlet Poisson solve, for energy ellipses and tests. */
export function poissonExact(b: number[]): number[] {
  const x = solveDense(denseLaplacian(b.length, 'dirichlet'), b);
  if (!x) throw new Error('Dirichlet Laplacian is SPD — solve must succeed');
  return x;
}

export function energyNormSq(applyA: Matvec, e: number[]): number {
  return aInner(applyA, e, e);
}

/** Project v onto span{cols} in the Euclidean inner product (tiny n). */
export function inSpanResidual(cols: number[][], v: number[], tol = 1e-8): boolean {
  if (cols.length === 0) return norm2(v) <= tol;
  const m = cols.length;
  const n = v.length;
  const G = Array.from({ length: m }, () => new Array<number>(m).fill(0));
  const rhs = new Array<number>(m).fill(0);
  for (let i = 0; i < m; i++) {
    rhs[i] = dot(cols[i]!, v);
    for (let j = 0; j <= i; j++) {
      const g = dot(cols[i]!, cols[j]!);
      G[i]![j] = g;
      G[j]![i] = g;
    }
  }
  const c = solveDense(G, rhs);
  if (!c) return norm2(v) <= tol;
  const proj = new Array(n).fill(0);
  for (let i = 0; i < m; i++) {
    const ci = c[i]!;
    const col = cols[i]!;
    for (let j = 0; j < n; j++) proj[j] += ci * col[j]!;
  }
  return norm2(sub(v, proj)) <= tol * Math.max(1, norm2(v));
}

/** Level set eᵀ A e = level in two unknowns. The 2D energy ellipse. */
export function spdEllipse(
  A: number[][],
  center: number[],
  level: number,
  samples = 96,
): [number, number][] {
  if (A.length !== 2) throw new Error('energy ellipse is the two-unknown picture');
  const L = cholesky(A);
  if (!L) throw new Error('A is not SPD');
  const rho = Math.sqrt(Math.max(0, level));
  const pts: [number, number][] = [];
  for (let i = 0; i <= samples; i++) {
    const th = (2 * Math.PI * i) / samples;
    const u0 = rho * Math.cos(th);
    const u1 = rho * Math.sin(th);
    const y1 = u1 / L[1]![1]!;
    const y0 = (u0 - L[1]![0]! * y1) / L[0]![0]!;
    pts.push([center[0]! + y0, center[1]! + y1]);
  }
  return pts;
}

/* ── Preconditioners (Wave 6). Jacobi / SSOR as operators, not recipes.
   Appended onto the same Dirichlet Laplacian. Do not rewrite Jacobi/CG. ── */

export type PreconditionerKind = 'jacobi' | 'ssor';

/** SSOR ω that matches the 1D-Poisson SOR optimum. 0 < ω < 2. */
export function ssorOmega(n: number): number {
  return 2 / (1 + Math.sin(Math.PI / (n + 1)));
}

export function laplacianDiag(n: number): number {
  const { h } = laplacianGrid(n, 'dirichlet');
  return 2 / (h * h);
}

export function laplacianOff(n: number): number {
  const { h } = laplacianGrid(n, 'dirichlet');
  return -1 / (h * h);
}

/** z = D⁻¹ r. On this A, D = (2/h²) I, so this is a scale. */
export function applyJacobiMinv(r: number[]): number[] {
  const d = laplacianDiag(r.length);
  return r.map((ri) => ri / d);
}

/** M = D, so Mv = (2/h²) v. */
export function applyJacobiM(v: number[]): number[] {
  const d = laplacianDiag(v.length);
  return v.map((vi) => d * vi);
}

/**
 * SSOR: M = 1/(ω(2−ω)) (D+ωL) D⁻¹ (D+ωU).
 * Apply M⁻¹ by one forward bidiagonal solve, a diagonal scale, one backward.
 */
export function applySsorMinv(r: number[], omega = 1): number[] {
  const n = r.length;
  const d = laplacianDiag(n);
  const off = laplacianOff(n);
  const y = new Array<number>(n);
  y[0] = r[0]! / d;
  for (let i = 1; i < n; i++) y[i] = (r[i]! - omega * off * y[i - 1]!) / d;
  const z = y.map((yi) => d * yi);
  const w = new Array<number>(n);
  w[n - 1] = z[n - 1]! / d;
  for (let i = n - 2; i >= 0; i--) w[i] = (z[i]! - omega * off * w[i + 1]!) / d;
  const scale = omega * (2 - omega);
  return w.map((wi) => scale * wi);
}

export function applySsorM(v: number[], omega = 1): number[] {
  const n = v.length;
  const d = laplacianDiag(n);
  const off = laplacianOff(n);
  const t = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    const right = i === n - 1 ? 0 : v[i + 1]!;
    t[i] = d * v[i]! + omega * off * right;
  }
  const s = t.map((ti) => ti / d);
  const u = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    const left = i === 0 ? 0 : s[i - 1]!;
    u[i] = d * s[i]! + omega * off * left;
  }
  const scale = omega * (2 - omega);
  return u.map((ui) => ui / scale);
}

export function applyMinv(
  kind: PreconditionerKind,
  r: number[],
  omega = 1,
): number[] {
  return kind === 'ssor' ? applySsorMinv(r, omega) : applyJacobiMinv(r);
}

export function applyM(
  kind: PreconditionerKind,
  v: number[],
  omega = 1,
): number[] {
  return kind === 'ssor' ? applySsorM(v, omega) : applyJacobiM(v);
}

/**
 * Hestenes–Stiefel PCG. Same short recurrence as CG, one extra apply of M⁻¹
 * per step. Never forms M⁻¹A. Search is A-orthogonal in x-space; residuals
 * are M⁻¹-orthogonal.
 *
 *   z = M⁻¹ r
 *   α = (r·z) / (pᵀAp)
 *   x ← x + α p
 *   r ← r − α Ap
 *   β = (r₊·z₊) / (r·z)
 *   p ← z₊ + β p
 */
export function preconditionedCg(
  applyA: Matvec,
  applyMinvFn: Matvec,
  b: number[],
  { x0, maxIter, tol = 0 }: { x0?: number[]; maxIter?: number; tol?: number } = {},
): CgStep[] {
  const n = b.length;
  const steps = maxIter ?? n;
  let x = x0 ? x0.slice() : new Array(n).fill(0);
  let r = residualOf(applyA, x, b);
  let z = applyMinvFn(r);
  let p = z.slice();
  let rz = dot(r, z);
  const out: CgStep[] = [{ k: 0, x: x.slice(), r: r.slice(), p: p.slice(), residualNorm: norm2(r) }];

  for (let k = 1; k <= steps; k++) {
    const rn = norm2(r);
    if (rn === 0 || (tol > 0 && rn <= tol)) {
      out.push({ k, x: x.slice(), r: r.slice(), p: p.slice(), residualNorm: rn });
      continue;
    }
    const Ap = applyA(p);
    const pAp = dot(p, Ap);
    if (pAp <= 0) break;
    const alpha = rz / pAp;
    x = axpy(alpha, p, x);
    r = axpy(-alpha, Ap, r);
    z = applyMinvFn(r);
    const rzNew = dot(r, z);
    const beta = rz === 0 ? 0 : rzNew / rz;
    p = axpy(beta, p, z);
    rz = rzNew;
    out.push({ k, x: x.slice(), r: r.slice(), p: p.slice(), residualNorm: norm2(r) });
  }
  return out;
}

export function pcgHistory(
  b: number[],
  steps: number,
  kind: PreconditionerKind = 'ssor',
  omega?: number,
  x0?: number[],
): CgStep[] {
  const w = omega ?? (kind === 'ssor' ? ssorOmega(b.length) : 1);
  return preconditionedCg(
    (u) => applyLaplacian(u, 'dirichlet'),
    (r) => applyMinv(kind, r, w),
    b,
    { x0, maxIter: steps },
  );
}

/** First k with residual ≤ target. Returns maxSteps+1 if it never gets there. */
export function pcgStepsUntil(
  b: number[],
  target: number,
  maxSteps: number,
  kind: PreconditionerKind = 'ssor',
  omega?: number,
  x0?: number[],
): number {
  const hist = pcgHistory(b, maxSteps, kind, omega, x0);
  for (const s of hist) if (s.residualNorm <= target) return s.k;
  return maxSteps + 1;
}

export function cgStepsUntil(
  b: number[],
  target: number,
  maxSteps: number,
  x0?: number[],
): number {
  const hist = cgHistory(b, maxSteps, x0);
  for (const s of hist) if (s.residualNorm <= target) return s.k;
  return maxSteps + 1;
}

/* ── spectrum of A vs M⁻¹A ─────────────────────────────────────────────── */

function denseFromApply(n: number, apply: Matvec): number[][] {
  const M = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  for (let j = 0; j < n; j++) {
    const e = zeros(n);
    e[j] = 1;
    const col = apply(e);
    for (let i = 0; i < n; i++) M[i]![j] = col[i]!;
  }
  return M;
}

function cholForward(L: number[][], b: number[]): number[] {
  const n = b.length;
  const y = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    let s = b[i]!;
    for (let j = 0; j < i; j++) s -= L[i]![j]! * y[j]!;
    y[i] = s / L[i]![i]!;
  }
  return y;
}

function cholBack(L: number[][], b: number[]): number[] {
  const n = b.length;
  const x = new Array<number>(n);
  for (let i = n - 1; i >= 0; i--) {
    let s = b[i]!;
    for (let j = i + 1; j < n; j++) s -= L[j]![i]! * x[j]!;
    x[i] = s / L[i]![i]!;
  }
  return x;
}

/** C = L⁻¹ A L^{-T} with M = LLᵀ. Eigenvalues of C are those of M⁻¹A. */
export function splitSimilar(A: number[][], M: number[][]): number[][] {
  const L = cholesky(M);
  if (!L) throw new Error('preconditioner M must be SPD');
  const n = A.length;
  const C = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  for (let j = 0; j < n; j++) {
    const e = zeros(n);
    e[j] = 1;
    const x = cholBack(L, e);
    const Ax = new Array<number>(n).fill(0);
    for (let i = 0; i < n; i++) {
      let s = 0;
      for (let k = 0; k < n; k++) s += A[i]![k]! * x[k]!;
      Ax[i] = s;
    }
    const c = cholForward(L, Ax);
    for (let i = 0; i < n; i++) C[i]![j] = c[i]!;
  }
  return C;
}

/**
 * Cyclic Jacobi eigensolver for a tiny SPD (or symmetric) dense matrix.
 * n ≤ 32 in the labs. Returns sorted eigenvalues.
 */
export function symmetricEigenvalues(A0: number[][], sweeps = 48): number[] {
  const n = A0.length;
  const A = A0.map((row) => row.slice());
  for (let sweep = 0; sweep < sweeps; sweep++) {
    let off = 0;
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const aij = A[i]![j]!;
        off += aij * aij;
        if (Math.abs(aij) < 1e-18) continue;
        const aii = A[i]![i]!;
        const ajj = A[j]![j]!;
        const tau = (ajj - aii) / (2 * aij);
        const t = (tau >= 0 ? 1 : -1) / (Math.abs(tau) + Math.hypot(1, tau));
        const c = 1 / Math.hypot(1, t);
        const s = c * t;
        for (let k = 0; k < n; k++) {
          if (k === i || k === j) continue;
          const aik = A[i]![k]!;
          const ajk = A[j]![k]!;
          const nik = c * aik - s * ajk;
          const njk = s * aik + c * ajk;
          A[i]![k] = nik;
          A[k]![i] = nik;
          A[j]![k] = njk;
          A[k]![j] = njk;
        }
        const nii = c * c * aii - 2 * s * c * aij + s * s * ajj;
        const njj = s * s * aii + 2 * s * c * aij + c * c * ajj;
        A[i]![i] = nii;
        A[j]![j] = njj;
        A[i]![j] = 0;
        A[j]![i] = 0;
      }
    }
    const diag = A.reduce((s, row, i) => s + Math.abs(row[i]!), 0);
    if (Math.sqrt(2 * off) <= 1e-14 * Math.max(1, diag)) break;
  }
  return A.map((row, i) => row[i]!).sort((a, b) => a - b);
}

export function kappaFromEvals(evals: number[]): number {
  const pos = evals.filter((l) => l > 1e-18);
  if (pos.length === 0) return Number.POSITIVE_INFINITY;
  return Math.max(...pos) / Math.min(...pos);
}

export function dirichletKappa(n: number): number {
  const ev = dirichletEigenvalues(n);
  return kappaFromEvals(ev);
}

export function preconditionedEigenvalues(
  n: number,
  kind: PreconditionerKind,
  omega?: number,
): number[] {
  const A = denseLaplacian(n, 'dirichlet');
  const w = omega ?? (kind === 'ssor' ? ssorOmega(n) : 1);
  const M = denseFromApply(n, (v) => applyM(kind, v, w));
  return symmetricEigenvalues(splitSimilar(A, M));
}

export function preconditionedKappa(
  n: number,
  kind: PreconditionerKind,
  omega?: number,
): number {
  return kappaFromEvals(preconditionedEigenvalues(n, kind, omega));
}

/** ω in (0, 2) that minimises κ(M_SSOR⁻¹ A) on this n, by a coarse scan. */
export function ssorOmegaMinKappa(n: number, samples = 40): number {
  let bestW = 1;
  let bestK = Infinity;
  for (let i = 1; i < samples; i++) {
    const w = (2 * i) / samples;
    if (w <= 0.05 || w >= 1.95) continue;
    const k = preconditionedKappa(n, 'ssor', w);
    if (k < bestK) {
      bestK = k;
      bestW = w;
    }
  }
  return bestW;
}

