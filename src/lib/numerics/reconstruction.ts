/* ─────────────────────────────────────────────────────────────────────────
   MUSCL reconstruction for 1D linear advection on a periodic interval.

   Cell averages Q_i are stored. Inside cell i you reconstruct a line
   whose jump across the cell is δ_i, then the faces of that cell are

     u_{i−1/2}^R = Q_i − ½ δ_i ,   u_{i+1/2}^L = Q_i + ½ δ_i

   Unlimited Fromm takes the central slope δ_i = ½(Q_{i+1} − Q_{i−1}).
   That scheme is linear and second-order, so Godunov's theorem says it
   cannot be monotone: a jump rings. minmod / superbee clip δ_i so the
   faces stay between the neighbouring averages. The update is still
   conservation form — reconstruction picks the *states* the flux sees.

   MUSCL-Hancock time-centres the face: for c > 0 the upwind value is
   Q_i + ½(1 − ν) δ_i. Displayed in the reconstruction lesson.
   ───────────────────────────────────────────────────────────────────────── */

import { periodicGrid, wrap } from './pde1d.ts';
import {
  ADVECTION_C,
  FVM_PERIOD,
  JUMP_LEFT,
  JUMP_RIGHT,
  squareWave,
  totalMass,
} from './fvm1d.ts';

export type RecLimiter = 'constant' | 'unlimited' | 'minmod' | 'superbee';
export type RecInitial = 'jump' | 'sine';

export const REC_PERIOD = FVM_PERIOD;
export const REC_CFL = 0.4;
export const REC_C = ADVECTION_C;

/** Three-cell zoom used by the TVD-bound Tune: a ramp that Fromm overshoots. */
export const TUNE_QL = 0;
export const TUNE_QC = 0.8;
export const TUNE_QR = 1;

export const DIVERGED = 1e12;

/** minmod(a, b) = 0 if the slopes disagree; else the one with smaller |·|. */
export function minmod2(a: number, b: number): number {
  if (a * b <= 0) return 0;
  return Math.abs(a) < Math.abs(b) ? a : b;
}

/** Larger-magnitude same-sign value; 0 if they disagree. */
export function maxmod2(a: number, b: number): number {
  if (a * b <= 0) return 0;
  return Math.abs(a) > Math.abs(b) ? a : b;
}

/**
 * Change in Q across cell i. Units of the unknown, not of x: the faces
 * are then Q ± δ/2, independent of Δx.
 *
 *   constant  δ = 0                         piecewise constant (Godunov)
 *   unlimited δ = ½(Δ₋ + Δ₊)                Fromm / κ = 0
 *   minmod    δ = minmod(Δ₋, Δ₊)            lower Sweby boundary
 *   superbee  δ = maxmod(minmod(Δ₊, 2Δ₋),
 *                        minmod(2Δ₊, Δ₋))   upper Sweby boundary
 */
export function limitedDelta(
  qm: number, q: number, qp: number, limiter: RecLimiter,
): number {
  const dm = q - qm;
  const dp = qp - q;
  switch (limiter) {
    case 'constant':
      return 0;
    case 'unlimited':
      return 0.5 * (dm + dp);
    case 'minmod':
      return minmod2(dm, dp);
    case 'superbee':
      return maxmod2(minmod2(dp, 2 * dm), minmod2(2 * dp, dm));
  }
}

export function deltasOf(q: number[], limiter: RecLimiter): number[] {
  const n = q.length;
  const d = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    d[i] = limitedDelta(q[wrap(i - 1, n)]!, q[i]!, q[wrap(i + 1, n)]!, limiter);
  }
  return d;
}

/** Largest |δ| that keeps both faces of the middle cell between its neighbours.
 *  Sweby upper bound: |δ| ≤ 2 min(|Δ₋|, |Δ₊|) when the slopes agree, else 0. */
export function tvdDeltaBound(qL: number, qC: number, qR: number): number {
  const dm = qC - qL;
  const dp = qR - qC;
  if (dm * dp <= 0) return 0;
  return 2 * Math.min(Math.abs(dm), Math.abs(dp));
}

export function faceFromDelta(q: number, delta: number): { left: number; right: number } {
  return { left: q - 0.5 * delta, right: q + 0.5 * delta };
}

/** Piecewise-linear reconstruction of three cells, neighbours held constant.
 *  x runs over [0, 3] with one cell per unit. Used by the Tune and the tests. */
export function reconstructionPolyline(
  qL: number, qC: number, qR: number, delta: number,
): { x: number; y: number }[] {
  const { left, right } = faceFromDelta(qC, delta);
  return [
    { x: 0, y: qL }, { x: 1, y: qL },
    { x: 1, y: left }, { x: 2, y: right },
    { x: 2, y: qR }, { x: 3, y: qR },
  ];
}

export function totalVariation(q: number[]): number {
  const n = q.length;
  let s = 0;
  for (let i = 0; i < n; i++) s += Math.abs(q[wrap(i + 1, n)]! - q[i]!);
  return s;
}

export function extrema(q: number[]): { min: number; max: number } {
  let lo = Infinity;
  let hi = -Infinity;
  for (const v of q) {
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  return { min: lo, max: hi };
}

/** Cell averages of sin(2π(x − c t)) on a uniform mesh of [0, 1). */
export function sineAverages(n: number, t = 0, c = REC_C, period = REC_PERIOD): number[] {
  const dx = period / n;
  const k = 2 * Math.PI / period;
  const q = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    const a = i * dx;
    const b = a + dx;
    q[i] = (Math.cos(k * (a - c * t)) - Math.cos(k * (b - c * t))) / (k * dx);
  }
  return q;
}

export function initialRecField(initial: RecInitial, n: number, period = REC_PERIOD): number[] {
  if (initial === 'sine') return sineAverages(n, 0, REC_C, period);
  const { x } = periodicGrid(n, period);
  return squareWave(x);
}

export interface RecAdvance {
  next: number[];
  delta: number[];
  /** Hancock-extrapolated upwind state at face i+1/2 (c > 0). */
  face: number[];
}

/** One MUSCL-Hancock step of u_t + c u_x = 0, c > 0.
 *  next[i] = Q[i] − ν (face[i] − face[i−1]),
 *  face[i] = Q[i] + ½(1 − ν) δ_i. */
export function stepMuscl(
  q: number[],
  limiter: RecLimiter,
  nu: number,
): RecAdvance {
  const n = q.length;
  const delta = deltasOf(q, limiter);
  const face = new Array<number>(n);
  const next = new Array<number>(n);
  const hancock = 0.5 * (1 - nu);
  for (let i = 0; i < n; i++) face[i] = q[i]! + hancock * delta[i]!;
  for (let i = 0; i < n; i++) {
    next[i] = q[i]! - nu * (face[i]! - face[wrap(i - 1, n)]!);
  }
  return { next, delta, face };
}

export function l1Distance(a: number[], b: number[], dx: number): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += Math.abs(a[i]! - b[i]!);
  return s * dx;
}

export function observedOrder(eCoarse: number, eFine: number, ratio = 2): number {
  return Math.log(eCoarse / eFine) / Math.log(ratio);
}

export interface TvSample {
  t: number;
  tv: number;
  ratio: number;
  qMin: number;
  qMax: number;
}

export interface RecRun {
  x: number[];
  q: number[];
  q0: number[];
  dx: number;
  dt: number;
  t: number;
  nSteps: number;
  tv0: number;
  tv: number;
  mass0: number;
  mass: number;
  history: TvSample[];
  diverged: boolean;
  qMin: number;
  qMax: number;
}

export interface RecRunOpts {
  limiter: RecLimiter;
  initial?: RecInitial;
  n?: number;
  cfl?: number;
  tEnd?: number;
  c?: number;
}

export function runMuscl(opts: RecRunOpts): RecRun {
  const n = opts.n ?? 64;
  const cfl = opts.cfl ?? REC_CFL;
  const tEnd = opts.tEnd ?? 0.5;
  const c = opts.c ?? REC_C;
  const initial = opts.initial ?? 'jump';
  const { x, dx } = periodicGrid(n, REC_PERIOD);
  const q0 = initialRecField(initial, n);
  const nu = cfl;
  const dt = (nu * dx) / Math.max(Math.abs(c), 1e-15);
  const nSteps = Math.max(1, Math.round(tEnd / dt));
  const tv0 = totalVariation(q0);
  const mass0 = totalMass(q0, dx);
  const ext0 = extrema(q0);

  let q = q0.slice();
  let diverged = false;
  let qMin = ext0.min;
  let qMax = ext0.max;
  const history: TvSample[] = [{ t: 0, tv: tv0, ratio: 1, qMin, qMax }];
  const stride = Math.max(1, Math.floor(nSteps / 80));

  for (let k = 0; k < nSteps; k++) {
    const { next } = stepMuscl(q, opts.limiter, nu);
    q = next;
    const ext = extrema(q);
    if (!Number.isFinite(ext.max) || !Number.isFinite(ext.min) ||
        Math.abs(ext.max) > DIVERGED || Math.abs(ext.min) > DIVERGED) {
      diverged = true;
      history.push({ t: (k + 1) * dt, tv: NaN, ratio: NaN, qMin: NaN, qMax: NaN });
      break;
    }
    if (ext.min < qMin) qMin = ext.min;
    if (ext.max > qMax) qMax = ext.max;
    if ((k + 1) % stride === 0 || k === nSteps - 1) {
      const tv = totalVariation(q);
      history.push({
        t: (k + 1) * dt, tv, ratio: tv / tv0, qMin: ext.min, qMax: ext.max,
      });
    }
  }

  const t = diverged ? history[history.length - 1]!.t : nSteps * dt;
  const tv = diverged ? NaN : totalVariation(q);
  const mass = diverged ? NaN : totalMass(q, dx);
  const ext = diverged ? { min: qMin, max: qMax } : extrema(q);
  return {
    x, q, q0, dx, dt, t, nSteps: diverged ? history.length - 1 : nSteps,
    tv0, tv, mass0, mass, history, diverged,
    qMin: ext.min, qMax: ext.max,
  };
}

/** L¹ error of a sine advected for one period. Exact cell averages, not samples. */
export function sineL1Error(opts: {
  limiter: RecLimiter;
  n: number;
  cfl?: number;
  periods?: number;
}): number {
  const periods = opts.periods ?? 1;
  const tEnd = periods * REC_PERIOD / REC_C;
  const run = runMuscl({
    limiter: opts.limiter, initial: 'sine', n: opts.n,
    cfl: opts.cfl ?? REC_CFL, tEnd,
  });
  if (run.diverged) return Number.POSITIVE_INFINITY;
  const exact = sineAverages(opts.n, run.t);
  return l1Distance(run.q, exact, run.dx);
}
