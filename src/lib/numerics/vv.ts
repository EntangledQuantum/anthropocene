/* ─────────────────────────────────────────────────────────────────────────
   Verification vs validation on the 1D periodic heat/advection code.

   Same updates as pde1d.ts. Three ways to run them:

     mms           heat FTCS + manufactured source. Recovers order 2.
     half-stencil  the 3-point Laplacian with an extra /2. Looks like heat.
                   Converges to α/2, not to the intended α.
     advection     first-order upwind. Looks like a travelling bump.
                   Converges to advection, not to heat.

   Manufactured solution (Roache): pick û, plug into the PDE, take the
   residual as a source. û need not be physics — verification is a
   mathematical exercise.

     û(x,t) = sin(2πx) cos(2π t)
     u_t = α u_xx + f,   f = û_t − α û_xx
   ───────────────────────────────────────────────────────────────────────── */

import { fitSlope } from './convergence.ts';
import {
  exactAdvection,
  gaussianPulse,
  l2Distance,
  maxAbs,
  periodicGrid,
  runAdvection,
  stepHeatFtcs,
  wrap,
} from './pde1d.ts';

export const VV_ALPHA = 1;
export const VV_R = 0.25;
export const VV_T_END = 0.2;
export const VV_SWEEP_N = [16, 24, 32, 48, 64, 96] as const;

const TWO_PI = 2 * Math.PI;

export type VvKind = 'mms' | 'half-stencil' | 'advection';

/** û(x,t) = sin(2πx) cos(2π t). Not a heat eigenmode — the source is real. */
export function manufactured(x: number, t: number): number {
  return Math.sin(TWO_PI * x) * Math.cos(TWO_PI * t);
}

export function manufacturedDt(x: number, t: number): number {
  return -TWO_PI * Math.sin(TWO_PI * x) * Math.sin(TWO_PI * t);
}

export function manufacturedDxx(x: number, t: number): number {
  return -(TWO_PI * TWO_PI) * manufactured(x, t);
}

/** f = û_t − α û_xx, so û solves u_t = α u_xx + f exactly. */
export function manufacturedSource(x: number, t: number, alpha = VV_ALPHA): number {
  return manufacturedDt(x, t) - alpha * manufacturedDxx(x, t);
}

/** Discrete Laplacian at i, no 1/dx² yet: u_{i+1} − 2u_i + u_{i−1}. */
export function stencilD2(u: number[], i: number): number {
  const n = u.length;
  return u[wrap(i + 1, n)]! - 2 * u[i]! + u[wrap(i - 1, n)]!;
}

/**
 * Spatial MMS residual of the 3-point heat operator at t = 0.
 * α_stencil (D²_h û)/dx²  −  α_source û_xx.
 * Matching α: O(dx²). Half stencil vs intended α: O(1).
 */
export function spatialResidual(
  n: number,
  alphaStencil = VV_ALPHA,
  alphaSource = VV_ALPHA,
): { x: number[]; residual: number[]; l2: number; dx: number } {
  const { x, dx } = periodicGrid(n);
  const uh = x.map((xi) => manufactured(xi, 0));
  const residual = x.map((xi, i) => {
    const discrete = alphaStencil * stencilD2(uh, i) / (dx * dx);
    const exact = alphaSource * manufacturedDxx(xi, 0);
    return discrete - exact;
  });
  const zeros = residual.map(() => 0);
  return { x, residual, l2: l2Distance(residual, zeros, dx), dx };
}

export function stepHeatWithSource(u: number[], r: number, dt: number, f: number[]): number[] {
  const next = stepHeatFtcs(u, r);
  for (let i = 0; i < next.length; i++) next[i]! += dt * f[i]!;
  return next;
}

export interface VvRun {
  kind: VvKind;
  x: number[];
  u: number[];
  /** Intended physics / manufactured field. */
  intended: number[];
  /** Exact field of the equation the stencil actually discretises, if cheap. */
  implemented: number[];
  dx: number;
  dt: number;
  t: number;
  n: number;
  nSteps: number;
  error: number;
  implementedError: number;
  maxAbs: number;
  residual: number;
  diverged: boolean;
}

export interface VvOpts {
  kind: VvKind;
  n?: number;
  tEnd?: number;
  r?: number;
  alpha?: number;
  cfl?: number;
}

export function runVv(opts: VvOpts): VvRun {
  const kind = opts.kind;
  const n = opts.n ?? 32;
  const tEnd = opts.tEnd ?? VV_T_END;
  const r = opts.r ?? VV_R;
  const alpha = opts.alpha ?? VV_ALPHA;

  if (kind === 'advection') {
    const cfl = opts.cfl ?? 0.4;
    const adv = runAdvection({ scheme: 'upwind', cfl, n, tEnd, x0: 0.25, sigma: 0.06 });
    const heatTimed = runHeatTo(n, tEnd, r, alpha, 0.25, 0.06);
    const intended = heatTimed.u;
    const implemented = adv.exact ?? exactAdvection(adv.x, adv.t, 1, 0.25, 0.06);
    return {
      kind, x: adv.x, u: adv.u, intended, implemented,
      dx: adv.dx, dt: adv.dt, t: adv.t, n, nSteps: adv.nSteps,
      error: l2Distance(adv.u, intended, adv.dx),
      implementedError: l2Distance(adv.u, implemented, adv.dx),
      maxAbs: adv.maxAbs, residual: spatialResidual(n).l2,
      diverged: adv.diverged,
    };
  }

  const { x, dx } = periodicGrid(n);
  const dt = (r * dx * dx) / alpha;
  const nSteps = Math.max(1, Math.round(tEnd / dt));
  const t = nSteps * dt;
  const rStencil = kind === 'half-stencil' ? r / 2 : r;
  const alphaStencil = kind === 'half-stencil' ? alpha / 2 : alpha;

  let u = x.map((xi) => manufactured(xi, 0));
  let diverged = false;
  let peak = maxAbs(u);
  for (let k = 0; k < nSteps; k++) {
    const tk = k * dt;
    const f = x.map((xi) => manufacturedSource(xi, tk, alpha));
    u = stepHeatWithSource(u, rStencil, dt, f);
    const m = maxAbs(u);
    if (!Number.isFinite(m) || m > 1e6) {
      diverged = true;
      peak = Infinity;
      break;
    }
    if (m > peak) peak = m;
  }

  const intended = x.map((xi) => manufactured(xi, t));
  const { l2: residual } = spatialResidual(n, alphaStencil, alpha);

  return {
    kind, x, u, intended, implemented: intended,
    dx, dt, t, n, nSteps,
    error: diverged ? Infinity : l2Distance(u, intended, dx),
    implementedError: diverged ? Infinity : l2Distance(u, intended, dx),
    maxAbs: peak, residual, diverged,
  };
}

function runHeatTo(
  n: number, tEnd: number, r: number, alpha: number, x0: number, sigma: number,
): { u: number[]; x: number[]; dx: number } {
  const { x, dx } = periodicGrid(n);
  const dt = (r * dx * dx) / alpha;
  const nSteps = Math.max(1, Math.round(tEnd / dt));
  let u = gaussianPulse(x, x0, sigma);
  for (let k = 0; k < nSteps; k++) u = stepHeatFtcs(u, r);
  return { u, x, dx };
}

/**
 * MMS with source and stencil using the SAME α. Recovers the design order
 * even when that α is not the intended physics — verification of the
 * discrete problem you actually wrote.
 */
export function runVvMatched(n: number, alpha: number, tEnd = VV_T_END, r = VV_R): VvRun {
  const { x, dx } = periodicGrid(n);
  const dt = (r * dx * dx) / alpha;
  const nSteps = Math.max(1, Math.round(tEnd / dt));
  const t = nSteps * dt;
  let u = x.map((xi) => manufactured(xi, 0));
  let diverged = false;
  let peak = maxAbs(u);
  for (let k = 0; k < nSteps; k++) {
    const f = x.map((xi) => manufacturedSource(xi, k * dt, alpha));
    u = stepHeatWithSource(u, r, dt, f);
    const m = maxAbs(u);
    if (!Number.isFinite(m) || m > 1e6) { diverged = true; peak = Infinity; break; }
    if (m > peak) peak = m;
  }
  const intended = x.map((xi) => manufactured(xi, t));
  const { l2: residual } = spatialResidual(n, alpha, alpha);
  return {
    kind: 'mms', x, u, intended, implemented: intended,
    dx, dt, t, n, nSteps,
    error: diverged ? Infinity : l2Distance(u, intended, dx),
    implementedError: diverged ? Infinity : l2Distance(u, intended, dx),
    maxAbs: peak, residual, diverged,
  };
}

export interface VvSweepPoint {
  n: number;
  dx: number;
  error: number;
  residual: number;
  implementedError: number;
}

export function vvSweep(kind: VvKind, ns: readonly number[] = VV_SWEEP_N): VvSweepPoint[] {
  return ns.map((n) => {
    const run = runVv({ kind, n });
    return {
      n,
      dx: run.dx,
      error: run.error,
      residual: run.residual,
      implementedError: run.implementedError,
    };
  });
}

export function residualSweep(
  alphaStencil: number,
  alphaSource = VV_ALPHA,
  ns: readonly number[] = VV_SWEEP_N,
): { n: number; dx: number; residual: number }[] {
  return ns.map((n) => {
    const { dx, l2 } = spatialResidual(n, alphaStencil, alphaSource);
    return { n, dx, residual: l2 };
  });
}

/** Least-squares log-log slope of error vs dx, finite points only. */
export function observedOrder(points: { dx: number; error: number }[]): number {
  const usable = points.filter((p) => Number.isFinite(p.error) && p.error > 0);
  if (usable.length < 2) return NaN;
  return fitSlope(usable.map((p) => [Math.log(p.dx), Math.log(p.error)]));
}

export function observedResidualOrder(
  alphaStencil: number,
  alphaSource = VV_ALPHA,
  ns: readonly number[] = VV_SWEEP_N,
): number {
  const pts = residualSweep(alphaStencil, alphaSource, ns);
  return observedOrder(pts.map((p) => ({ dx: p.dx, error: p.residual })));
}

/** Local order from one doubling: log2(E(n)/E(2n)). */
export function localOrder(kind: VvKind, n: number): number {
  const a = runVv({ kind, n });
  const b = runVv({ kind, n: 2 * n });
  if (!(a.error > 0 && b.error > 0) || !Number.isFinite(a.error) || !Number.isFinite(b.error)) {
    return NaN;
  }
  return Math.log2(a.error / b.error);
}

export function mmsErrorDrop(n: number): number {
  const coarse = runVv({ kind: 'mms', n });
  const fine = runVv({ kind: 'mms', n: 2 * n });
  return coarse.error / fine.error;
}
