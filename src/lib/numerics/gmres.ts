/* ─────────────────────────────────────────────────────────────────────────
   GMRES — generalised minimal residual (Saad & Schultz 1986).

   Same Krylov plane CG searches, different inner product. Pick
     x ∈ x₀ + K_k    minimising    ‖b − A x‖₂.
   Arnoldi builds an orthonormal basis V of that plane and a tiny upper
   Hessenberg Ā so A V_k = V_{k+1} Ā. The least-squares problem lives on Ā
   and is a QR of a (k+1)×k matrix — the QR lesson, on a postcard. The
   residual norm is the last entry of the rotated right-hand side; you
   know ‖r‖ before you form x.

   CG's three-term recurrence needed A SPD so that A-inner products were
   an inner product. This does not. The cost is storing every Arnoldi
   vector. Restart discards the basis every m steps and trades optimality
   for RAM.

   Convection–diffusion −u″ + c u′ on the 1D Dirichlet grid is the
   nonsymmetric costume: c = 0 is the Laplacian CG already solved.
   ───────────────────────────────────────────────────────────────────────── */

import { dot, laplacianGrid } from './operator.ts';
import {
  conjugateGradient,
  dirichletPoisson,
  residualOf,
  type IterStep,
  type Matvec,
} from './iterative.ts';
import { lstsqQR, solveUpper } from './qr.ts';
import { axpy, norm2 } from './types.ts';

export const GMRES_N = 16;
/** Wind that makes A visibly nonsymmetric while the symmetric part stays
 *  the Laplacian (so CG's pᵀAp stays positive and the short recurrence
 *  is the thing that dies, not a breakdown). */
export const DEMO_WIND = 48;
export const DEMO_RESTART = 4;
export const ROTATION_S1 = 2;
export const ROTATION_S2 = 0.5;

export interface GmresStep extends IterStep {
  /** Arnoldi columns v₁ … v_k that span the current cycle's K_k. */
  V: number[][];
  /** Unreduced upper Hessenberg, (k+1)×k. Empty at k = 0. */
  H: number[][];
  /** Vectors in RAM this step: k in a full cycle, at most `restart`. */
  stored: number;
  /** True on the first step of a new cycle (basis was discarded). */
  restarted: boolean;
  /** Happy breakdown: K_k is A-invariant, residual is exact. */
  breakdown: boolean;
}

export function zeros(n: number): number[] {
  return new Array(n).fill(0);
}

export function applyDense(A: number[][]): Matvec {
  return (x) => {
    const n = A.length;
    const y = new Array<number>(n);
    for (let i = 0; i < n; i++) {
      let s = 0;
      const row = A[i]!;
      for (let j = 0; j < x.length; j++) s += row[j]! * x[j]!;
      y[i] = s;
    }
    return y;
  };
}

/** A = R(θ) diag(s₁, s₂). θ = 0 is SPD; θ = π/2 has pᵀAp = 0 on e₁. */
export function rotationScale(
  theta: number,
  s1 = ROTATION_S1,
  s2 = ROTATION_S2,
): number[][] {
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  return [
    [c * s1, -s * s2],
    [s * s1, c * s2],
  ];
}

export const ROTATION_BREAK_THETA = Math.PI / 2;

/** −u″ + c u′ on n interior Dirichlet nodes. c = 0 is the Laplacian. */
export function applyConvectionDiffusion(wind: number): Matvec {
  return (u) => {
    const n = u.length;
    const { h } = laplacianGrid(n, 'dirichlet');
    const s = 1 / (h * h);
    const c2h = wind / (2 * h);
    const out = new Array<number>(n);
    for (let i = 0; i < n; i++) {
      const left = i === 0 ? 0 : u[i - 1]!;
      const right = i === n - 1 ? 0 : u[i + 1]!;
      out[i] = s * (2 * u[i]! - left - right) + c2h * (right - left);
    }
    return out;
  };
}

export function denseConvectionDiffusion(n: number, wind: number): number[][] {
  const { h } = laplacianGrid(n, 'dirichlet');
  const s = 1 / (h * h);
  const c2h = wind / (2 * h);
  const A = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  for (let i = 0; i < n; i++) {
    A[i]![i] = 2 * s;
    if (i > 0) A[i]![i - 1] = -s - c2h;
    if (i < n - 1) A[i]![i + 1] = -s + c2h;
  }
  return A;
}

export function cellPeclet(n: number, wind: number): number {
  const { h } = laplacianGrid(n, 'dirichlet');
  return Math.abs(wind) * h / 2;
}

export interface ConvectionProblem {
  n: number;
  h: number;
  x: number[];
  b: number[];
  applyA: Matvec;
  wind: number;
  peclet: number;
}

/** Same mixed load as the Krylov lesson, so wind = 0 is that Poisson. */
export function convectionProblem(
  n = GMRES_N,
  wind = DEMO_WIND,
): ConvectionProblem {
  const poisson = dirichletPoisson(n, 'mixed');
  return {
    n,
    h: poisson.h,
    x: poisson.x,
    b: poisson.b,
    applyA: applyConvectionDiffusion(wind),
    wind,
    peclet: cellPeclet(n, wind),
  };
}

function combine(cols: number[][], y: number[]): number[] {
  const n = cols[0]?.length ?? 0;
  const x = zeros(n);
  for (let j = 0; j < y.length; j++) {
    const yj = y[j]!;
    const v = cols[j]!;
    for (let i = 0; i < n; i++) x[i]! += yj * v[i]!;
  }
  return x;
}

function topR(R: number[][], k: number): number[][] {
  const out: number[][] = [];
  for (let i = 0; i < k; i++) {
    const row = new Array<number>(k).fill(0);
    for (let j = i; j < k; j++) row[j] = R[i]![j]!;
    out.push(row);
  }
  return out;
}

function sliceH(H: number[][], k: number): number[][] {
  const rows = k + 1;
  const out: number[][] = [];
  for (let i = 0; i < rows; i++) {
    const row = new Array<number>(k).fill(0);
    for (let j = 0; j < k; j++) row[j] = H[i]![j]!;
    out.push(row);
  }
  return out;
}

interface CycleOpts {
  x0: number[];
  maxSteps: number;
  tol: number;
  restarted: boolean;
}

/** One Arnoldi–GMRES cycle from a fixed x₀. Restart is a new cycle. */
function gmresCycle(
  applyA: Matvec,
  b: number[],
  { x0, maxSteps, tol, restarted }: CycleOpts,
): GmresStep[] {
  const r0 = residualOf(applyA, x0, b);
  const beta = norm2(r0);
  if (beta === 0 || maxSteps < 1) return [];

  const m = maxSteps;
  const V: number[][] = [r0.map((v) => v / beta)];
  const H: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(m).fill(0));
  const R: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(m).fill(0));
  const cs = new Array<number>(m).fill(0);
  const sn = new Array<number>(m).fill(0);
  const g = new Array<number>(m + 1).fill(0);
  g[0] = beta;

  const out: GmresStep[] = [];

  for (let j = 0; j < m; j++) {
    let w = applyA(V[j]!);
    for (let i = 0; i <= j; i++) {
      const hij = dot(w, V[i]!);
      H[i]![j] = hij;
      w = axpy(-hij, V[i]!, w);
    }
    const hNext = norm2(w);
    H[j + 1]![j] = hNext;
    const breakdown = hNext <= 1e-14 * Math.max(1, beta);
    if (!breakdown) V.push(w.map((wi) => wi / hNext));
    else V.push(zeros(w.length));

    for (let i = 0; i <= j + 1; i++) R[i]![j] = H[i]![j]!;
    for (let i = 0; i < j; i++) {
      const a = R[i]![j]!;
      const bH = R[i + 1]![j]!;
      R[i]![j] = cs[i]! * a + sn[i]! * bH;
      R[i + 1]![j] = -sn[i]! * a + cs[i]! * bH;
    }
    const a = R[j]![j]!;
    const bH = R[j + 1]![j]!;
    const r = Math.hypot(a, bH);
    const c = r === 0 ? 1 : a / r;
    const sG = r === 0 ? 0 : bH / r;
    cs[j] = c;
    sn[j] = sG;
    R[j]![j] = r;
    R[j + 1]![j] = 0;
    const gj = g[j]!;
    const gj1 = g[j + 1]!;
    g[j] = c * gj + sG * gj1;
    g[j + 1] = -sG * gj + c * gj1;

    const k = j + 1;
    const y = solveUpper(topR(R, k), g.slice(0, k));
    const dx = y ? combine(V.slice(0, k), y) : zeros(x0.length);
    const x = axpy(1, dx, x0);
    const residualNorm = Math.abs(g[k]!);
    out.push({
      k,
      x,
      r: residualOf(applyA, x, b),
      residualNorm,
      V: V.slice(0, k).map((v) => v.slice()),
      H: sliceH(H, k),
      stored: k,
      restarted: j === 0 && restarted,
      breakdown,
    });
    if (residualNorm <= tol || breakdown) break;
  }
  return out;
}

/**
 * Full or restarted GMRES. `restart` omitted (or ≥ maxIter) is full GMRES:
 * one cycle, k vectors in RAM at step k. `restart: m` is GMRES(m).
 */
export function gmres(
  applyA: Matvec,
  b: number[],
  {
    x0,
    maxIter,
    restart,
    tol = 0,
  }: { x0?: number[]; maxIter?: number; restart?: number; tol?: number } = {},
): GmresStep[] {
  const n = b.length;
  const steps = maxIter ?? n;
  let x = x0 ? x0.slice() : zeros(n);
  const r0 = residualOf(applyA, x, b);
  const out: GmresStep[] = [{
    k: 0,
    x: x.slice(),
    r: r0.slice(),
    residualNorm: norm2(r0),
    V: [],
    H: [],
    stored: 0,
    restarted: false,
    breakdown: false,
  }];
  if (steps < 1 || out[0]!.residualNorm === 0) return out;

  const m = restart !== undefined && restart > 0 ? restart : steps;
  let k = 0;
  let cycle = 0;
  while (k < steps) {
    const inner = gmresCycle(applyA, b, {
      x0: x,
      maxSteps: Math.min(m, steps - k),
      tol,
      restarted: cycle > 0,
    });
    if (inner.length === 0) break;
    for (const s of inner) {
      k++;
      out.push({ ...s, k });
      x = s.x;
      if (s.residualNorm <= tol || k >= steps) return out;
    }
    cycle++;
  }
  return out;
}

export function gmresHistory(
  applyA: Matvec,
  b: number[],
  steps: number,
  restart?: number,
  x0?: number[],
): GmresStep[] {
  return gmres(applyA, b, { x0, maxIter: steps, restart });
}

/** First k with residual ≤ target. Returns maxSteps+1 if it never gets there. */
export function gmresStepsUntil(
  applyA: Matvec,
  b: number[],
  target: number,
  maxSteps: number,
  restart?: number,
  x0?: number[],
): number {
  const hist = gmres(applyA, b, { x0, maxIter: maxSteps, restart });
  for (const s of hist) if (s.residualNorm <= target) return s.k;
  return maxSteps + 1;
}

/** CG as written in iterative.ts. Do not reimplement. */
export function cgAttempt(
  applyA: Matvec,
  b: number[],
  steps: number,
  x0?: number[],
): ReturnType<typeof conjugateGradient> {
  return conjugateGradient(applyA, b, { x0, maxIter: steps });
}

/**
 * Arnoldi relation using a reconstructed v_{k+1} from the last column:
 *   w = A v_k − Σ_{i=1..k} h_ik v_i,   v_{k+1} = w / h_{k+1,k}
 * then A V ≈ [V | v_{k+1}] H. Returns relative Frobenius residual.
 */
export function arnoldiRelationError(applyA: Matvec, step: GmresStep): number {
  const k = step.V.length;
  if (k === 0) return 0;
  const n = step.V[0]!.length;
  const Vk1: number[][] = step.V.map((v) => v.slice());
  const hLast = step.H[k]?.[k - 1] ?? 0;
  if (Math.abs(hLast) > 1e-18) {
    let w = applyA(step.V[k - 1]!);
    for (let i = 0; i < k; i++) w = axpy(-step.H[i]![k - 1]!, step.V[i]!, w);
    const nrm = norm2(w);
    Vk1.push(nrm === 0 ? zeros(n) : w.map((wi) => wi / nrm));
  } else {
    Vk1.push(zeros(n));
  }

  let num = 0;
  let den = 0;
  for (let j = 0; j < k; j++) {
    const Av = applyA(step.V[j]!);
    const recon = zeros(n);
    const rows = Math.min(step.H.length, Vk1.length);
    for (let i = 0; i < rows; i++) {
      const hij = step.H[i]![j]!;
      const vi = Vk1[i]!;
      for (let t = 0; t < n; t++) recon[t]! += hij * vi[t]!;
    }
    for (let t = 0; t < n; t++) {
      const d = Av[t]! - recon[t]!;
      num += d * d;
      den += Av[t]! * Av[t]!;
    }
  }
  if (den === 0) return Math.sqrt(num);
  return Math.sqrt(num / den);
}

/** Columns of V should be orthonormal. */
export function basisGramError(V: number[][]): number {
  const k = V.length;
  if (k === 0) return 0;
  let e = 0;
  for (let i = 0; i < k; i++) {
    for (let j = 0; j < k; j++) {
      const g = dot(V[i]!, V[j]!);
      const t = i === j ? 1 : 0;
      e = Math.max(e, Math.abs(g - t));
    }
  }
  return e;
}

/** Householder QR of H̄ (the QR lesson) must recover the same y as Givens. */
export function hessenbergLstsqResidual(step: GmresStep, beta: number): number {
  const k = step.V.length;
  if (k === 0) return beta;
  const rhs = new Array<number>(k + 1).fill(0);
  rhs[0] = beta;
  const y = lstsqQR(step.H, rhs);
  if (!y) return beta;
  const Hy = new Array<number>(k + 1).fill(0);
  for (let i = 0; i < step.H.length; i++) {
    let s = 0;
    for (let j = 0; j < k; j++) s += step.H[i]![j]! * y[j]!;
    Hy[i] = s;
  }
  let e = 0;
  for (let i = 0; i < rhs.length; i++) {
    const d = Hy[i]! - rhs[i]!;
    e += d * d;
  }
  return Math.sqrt(e);
}

/** Smallest restart m in 1..n whose residual at `atK` is ≤ target. */
export function restartNeeded(
  applyA: Matvec,
  b: number[],
  target: number,
  atK: number,
  nMax?: number,
): number {
  const cap = nMax ?? b.length;
  for (let m = 1; m <= cap; m++) {
    const hist = gmres(applyA, b, { maxIter: atK, restart: m });
    const last = hist[Math.min(atK, hist.length - 1)]!;
    if (last.residualNorm <= target) return m;
  }
  return cap + 1;
}
