import { integrateTo } from './ode.ts';
import type { Integrator } from './types.ts';
import type { Problem } from './problems.ts';

export interface ConvergencePoint {
  h: number;
  error: number;
  /** f-evaluations spent reaching the endpoint — the honest cost axis. */
  work: number;
}

/** Global error at the endpoint, measured against the exact solution. */
export function endpointError(method: Integrator, problem: Problem, h: number): number {
  if (!problem.exact) throw new Error(`Problem "${problem.key}" has no exact solution`);
  const end = problem.t0 + problem.span;
  const y = integrateTo(method, problem.f, problem.y0, problem.t0, problem.span, h);
  if (!y) return Number.POSITIVE_INFINITY;

  const truth = problem.exact(end);
  let worst = 0;
  for (let i = 0; i < truth.length; i++) worst = Math.max(worst, Math.abs(y[i] - truth[i]));
  return worst;
}

export interface ConvergenceResult {
  /** Every sampled step size, including the regimes excluded from the fit —
   *  those are the most instructive part of the picture and are always plotted. */
  points: ConvergencePoint[];
  /** Least-squares slope of log(error) vs log(h) over the asymptotic window. */
  observedOrder: number;
  /** Order claimed by the method's theory, for comparison. */
  claimedOrder: number;
  /** Indices into `points` that were actually fitted. */
  fitted: number[];
  /** Order between each consecutive pair — what you'd compute by hand. */
  localOrders: number[];
}

/** Below this, error is dominated by floating-point noise rather than by
 *  truncation, and the log-log curve flattens then turns back up. */
const ROUNDOFF_FLOOR = 1e-12;

/** Local orders inside one asymptotic regime should agree to about this much. */
const ORDER_TOLERANCE = 0.4;

/** Order implied by one consecutive pair: log(e₁/e₂) / log(h₁/h₂). */
function localOrder(a: ConvergencePoint, b: ConvergencePoint): number {
  return Math.log(a.error / b.error) / Math.log(a.h / b.h);
}

/**
 * Runs a step-size sweep and fits the observed order.
 *
 * Fitting every sampled point would be wrong in both directions. At the coarse
 * end a method is pre-asymptotic: RK4's first halving can drop the error by
 * 2000x rather than 16x, because the leading h^4 term does not dominate yet.
 * At the fine end truncation error falls under the floating-point floor and
 * the curve flattens and then rises. Either regime drags a global fit away
 * from the true order.
 *
 * So we do what you would do by hand: compute the order between each
 * consecutive pair, then fit only over the longest run where those local
 * orders agree with each other. Excluded points are still returned for plotting.
 */
export function convergenceStudy(
  method: Integrator,
  problem: Problem,
  steps: number[],
): ConvergenceResult {
  const points: ConvergencePoint[] = steps.map((h) => ({
    h,
    error: endpointError(method, problem, h),
    work: Math.round(problem.span / h) * method.cost,
  }));

  // Usable = finite, above the roundoff floor, and not a blown-up run.
  const usable = points
    .map((p, i) => ({ p, i }))
    .filter(({ p }) => Number.isFinite(p.error) && p.error > ROUNDOFF_FLOOR && p.error < 1e3);

  const localOrders = usable
    .slice(0, -1)
    .map((_, k) => localOrder(usable[k].p, usable[k + 1].p));

  const window = longestConsistentRun(localOrders, ORDER_TOLERANCE);
  const chosen = window
    ? usable.slice(window.start, window.end + 2)
    : usable;

  return {
    points,
    observedOrder:
      chosen.length >= 2
        ? fitSlope(chosen.map(({ p }) => [Math.log(p.h), Math.log(p.error)]))
        : NaN,
    claimedOrder: method.order,
    fitted: chosen.map(({ i }) => i),
    localOrders,
  };
}

/** Longest contiguous run of values whose spread stays within `tol`.
 *  Ties break toward the finer step sizes (the later run). */
function longestConsistentRun(
  values: number[],
  tol: number,
): { start: number; end: number } | null {
  if (values.length === 0) return null;

  let best: { start: number; end: number; len: number } | null = null;

  for (let start = 0; start < values.length; start++) {
    let lo = values[start];
    let hi = values[start];
    for (let end = start; end < values.length; end++) {
      lo = Math.min(lo, values[end]);
      hi = Math.max(hi, values[end]);
      if (hi - lo > tol) break;

      const len = end - start + 1;
      if (!best || len >= best.len) best = { start, end, len };
    }
  }
  return best ? { start: best.start, end: best.end } : null;
}

/** Ordinary least-squares slope through log-log points. */
export function fitSlope(pts: [number, number][]): number {
  const n = pts.length;
  if (n < 2) return NaN;
  let sx = 0, sy = 0, sxx = 0, sxy = 0;
  for (const [x, y] of pts) {
    sx += x; sy += y; sxx += x * x; sxy += x * y;
  }
  const denom = n * sxx - sx * sx;
  return denom === 0 ? NaN : (n * sxy - sx * sy) / denom;
}

/** Geometric sweep of step sizes, largest first. */
export function stepSweep(hMax = 0.5, count = 9, ratio = 2): number[] {
  return Array.from({ length: count }, (_, i) => hMax / ratio ** i);
}

/** Energy drift over a run: how far the invariant wanders from its start.
 *  Symplectic methods keep this bounded and oscillating; RK4 lets it walk. */
export function invariantDrift(
  method: Integrator,
  problem: Problem,
  h: number,
): { t: number[]; relative: number[]; maxAbs: number } {
  if (!problem.invariant) throw new Error(`Problem "${problem.key}" has no invariant`);
  const steps = Math.max(1, Math.round(problem.span / h));
  const e0 = problem.invariant(problem.y0);
  const scale = Math.max(Math.abs(e0), 1e-12);

  const t: number[] = [problem.t0];
  const relative: number[] = [0];
  let maxAbs = 0;
  let y = problem.y0.slice();

  for (let i = 0; i < steps; i++) {
    y = method.step(problem.f, problem.t0 + i * h, y, h);
    if (!y.every(Number.isFinite)) break;
    const d = (problem.invariant(y) - e0) / scale;
    t.push(problem.t0 + (i + 1) * h);
    relative.push(d);
    maxAbs = Math.max(maxAbs, Math.abs(d));
  }
  return { t, relative, maxAbs };
}
