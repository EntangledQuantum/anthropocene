/* ─────────────────────────────────────────────────────────────────────────
   Newton on F(x) = 0.

   One step is a linear solve: J(x) δ = −F(x), then x ← x + δ. Linearise,
   solve, repeat. The formula is local. The object that actually decides
   whether you finish is the basin of attraction: start inside and the
   residual drops quadratically; start outside and the same operator throws
   you to infinity.

   The inner solve is any linear solver you already own. Dense LU for the
   tiny systems in this lesson; CG when J is SPD (the 2×2 coupled exponential
   near the origin). A wrong Jacobian is a different operator — Picard is
   Newton with J = I, globally convergent here and only linear.

   Demo residual: F(x) = arctan(x) − 1/2. Unique real root, F' never zero,
   F''(root) ≠ 0 so the catch is genuinely quadratic, and the basin is a
   bounded interval. That combination is the whole lesson.
   ───────────────────────────────────────────────────────────────────────── */

import { conjugateGradient } from './iterative.ts';
import { solveDense } from './linalg.ts';
import { add, axpy, norm2, sub, type State } from './types.ts';

export type Vec = State;

export interface NonlinearSys {
  id: string;
  dim: number;
  F: (x: Vec) => Vec;
  J: (x: Vec) => number[][];
  root: Vec;
}

export type NewtonSolver = 'dense' | 'cg';
export type JacobianMode = 'exact' | 'identity';

export type NewtonFate = 'catch' | 'diverge' | 'singular';

export interface NewtonIterate {
  k: number;
  x: Vec;
  residual: Vec;
  residualNorm: number;
  delta: Vec | null;
  finite: boolean;
}

export const ATAN_SHIFT = 0.5;
export const ATAN_ROOT = Math.tan(ATAN_SHIFT);
export const NEWTON_MAX_ITER = 24;
export const NEWTON_TOL = 1e-12;
export const NEWTON_DIVERGE_ABS = 1e6;

/** F(x) = arctan(x) − 1/2. F'(x) = 1/(1+x²) > 0. Root tan(1/2). */
export const atanShift: NonlinearSys = {
  id: 'atan-shift',
  dim: 1,
  F: (x) => [Math.atan(x[0]!) - ATAN_SHIFT],
  J: (x) => [[1 / (1 + x[0]! * x[0]!)]],
  root: [ATAN_ROOT],
};

/** F(x, y) = (e^x + 0.3 y − 1, 0.3 x + e^y − 1). Root at the origin.
 *  J(0,0) = [[1, 0.3], [0.3, 1]] is SPD, so the inner solve may be CG. */
export const EXP_COUPLE_OFF = 0.3;
export const expCouple: NonlinearSys = {
  id: 'exp-couple',
  dim: 2,
  F: (x) => [
    Math.exp(x[0]!) + EXP_COUPLE_OFF * x[1]! - 1,
    EXP_COUPLE_OFF * x[0]! + Math.exp(x[1]!) - 1,
  ],
  J: (x) => [
    [Math.exp(x[0]!), EXP_COUPLE_OFF],
    [EXP_COUPLE_OFF, Math.exp(x[1]!)],
  ],
  root: [0, 0],
};

/** |r_{n+1}| / |r_n|² → tan(1/2) for atan-shift, from the Taylor identity. */
export function atanShiftQuadraticConstant(): number {
  return Math.abs(ATAN_ROOT);
}

export function applyMat(A: number[][], v: Vec): Vec {
  return A.map((row) => row.reduce((s, aij, j) => s + aij * v[j]!, 0));
}

export function identityMat(n: number): number[][] {
  return Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)),
  );
}

/** Solve J δ = −F. Dense LU, or CG when J is SPD. */
export function newtonCorrection(
  J: number[][],
  Fx: Vec,
  solver: NewtonSolver = 'dense',
): Vec | null {
  const b = Fx.map((v) => -v);
  if (solver === 'dense') return solveDense(J, b);

  const hist = conjugateGradient((v) => applyMat(J, v), b, {
    maxIter: b.length,
    tol: 1e-14,
  });
  const delta = hist.at(-1)?.x;
  if (!delta || !delta.every(Number.isFinite)) return null;
  const lin = norm2(add(applyMat(J, delta), Fx));
  if (!Number.isFinite(lin) || lin > 1e-6 * Math.max(1, norm2(Fx))) return null;
  return delta;
}

export function jacobianAt(
  sys: NonlinearSys,
  x: Vec,
  mode: JacobianMode = 'exact',
): number[][] {
  if (mode === 'identity') return identityMat(sys.dim);
  return sys.J(x);
}

export function newtonStep(
  sys: NonlinearSys,
  x: Vec,
  {
    solver = 'dense',
    jacobian = 'exact',
  }: { solver?: NewtonSolver; jacobian?: JacobianMode } = {},
): { x: Vec; delta: Vec | null; residual: Vec; residualNorm: number; finite: boolean } {
  const residual = sys.F(x);
  const residualNorm = norm2(residual);
  const J = jacobianAt(sys, x, jacobian);
  const delta = newtonCorrection(J, residual, solver);
  if (!delta) {
    return { x: x.slice(), delta: null, residual, residualNorm, finite: false };
  }
  const next = add(x, delta);
  return {
    x: next,
    delta,
    residual,
    residualNorm,
    finite: next.every(Number.isFinite),
  };
}

export function newtonRun(
  sys: NonlinearSys,
  x0: Vec,
  {
    maxIter = NEWTON_MAX_ITER,
    tol = NEWTON_TOL,
    solver = 'dense',
    jacobian = 'exact',
    divergeAbs = NEWTON_DIVERGE_ABS,
  }: {
    maxIter?: number;
    tol?: number;
    solver?: NewtonSolver;
    jacobian?: JacobianMode;
    divergeAbs?: number;
  } = {},
): NewtonIterate[] {
  const out: NewtonIterate[] = [];
  let x = x0.slice();
  for (let k = 0; k <= maxIter; k++) {
    const residual = sys.F(x);
    const residualNorm = Number.isFinite(norm2(residual)) ? norm2(residual) : Infinity;
    const finite = x.every(Number.isFinite) && Number.isFinite(residualNorm);
    const blown =
      !finite || residualNorm > divergeAbs || x.some((v) => Math.abs(v) > divergeAbs);

    if (blown) {
      out.push({ k, x: x.slice(), residual, residualNorm, delta: null, finite: false });
      break;
    }
    if (residualNorm < tol || k === maxIter) {
      out.push({ k, x: x.slice(), residual, residualNorm, delta: null, finite: true });
      break;
    }

    const J = jacobianAt(sys, x, jacobian);
    const delta = newtonCorrection(J, residual, solver);
    out.push({ k, x: x.slice(), residual, residualNorm, delta, finite: true });
    if (!delta) break;
    x = add(x, delta);
  }
  return out;
}

export function fateOf(run: NewtonIterate[], sys: NonlinearSys, tol = 1e-8): NewtonFate {
  const last = run.at(-1);
  if (!last) return 'diverge';
  if (!last.finite) return 'diverge';
  if (last.residualNorm < tol && norm2(sub(last.x, sys.root)) < 1e-5) return 'catch';
  if (newtonCorrection(sys.J(last.x), last.residual, 'dense') === null) return 'singular';
  return 'diverge';
}

export function newtonFate(
  sys: NonlinearSys,
  x0: Vec,
  opts?: Parameters<typeof newtonRun>[2],
): NewtonFate {
  return fateOf(newtonRun(sys, x0, opts), sys);
}

/** Binary-search the first start to the right of the root that diverges. */
export function basinRightEdge(
  sys: NonlinearSys = atanShift,
  {
    lo = sys.root[0]!,
    hi = 8,
    iters = 48,
  }: { lo?: number; hi?: number; iters?: number } = {},
): number {
  let a = lo;
  let b = hi;
  for (let i = 0; i < iters; i++) {
    const mid = 0.5 * (a + b);
    if (newtonFate(sys, [mid]) === 'catch') a = mid;
    else b = mid;
  }
  return 0.5 * (a + b);
}

export function basinLeftEdge(
  sys: NonlinearSys = atanShift,
  {
    lo = -8,
    hi = sys.root[0]!,
    iters = 48,
  }: { lo?: number; hi?: number; iters?: number } = {},
): number {
  let a = lo;
  let b = hi;
  for (let i = 0; i < iters; i++) {
    const mid = 0.5 * (a + b);
    if (newtonFate(sys, [mid]) === 'catch') b = mid;
    else a = mid;
  }
  return 0.5 * (a + b);
}

export interface BasinSample {
  x: number;
  fate: NewtonFate;
  residualNorm: number;
  steps: number;
}

export function basinScan(
  sys: NonlinearSys,
  xMin: number,
  xMax: number,
  n: number,
  opts?: Parameters<typeof newtonRun>[2],
): BasinSample[] {
  return Array.from({ length: n }, (_, i) => {
    const x = xMin + ((xMax - xMin) * i) / (n - 1);
    const run = newtonRun(sys, [x], opts);
    const last = run.at(-1)!;
    return {
      x,
      fate: fateOf(run, sys),
      residualNorm: last.residualNorm,
      steps: last.k,
    };
  });
}

export function stepsUntil(
  sys: NonlinearSys,
  x0: Vec,
  tol = NEWTON_TOL,
  opts?: Parameters<typeof newtonRun>[2],
): number {
  const run = newtonRun(sys, x0, { ...opts, maxIter: 40, tol });
  const hit = run.find((s) => s.residualNorm < tol && s.finite);
  return hit ? hit.k : Infinity;
}

export function finalAbsError(
  sys: NonlinearSys,
  x0: Vec,
  opts?: Parameters<typeof newtonRun>[2],
): number {
  const last = newtonRun(sys, x0, opts).at(-1);
  if (!last || !last.finite) return Infinity;
  return norm2(sub(last.x, sys.root));
}

/** Starts used by the lesson. CATCH is inside; DIVERGE is the Predict hook. */
export const CATCH_X0 = 0.2;
export const DIVERGE_X0 = 3;
export const SKETCH_X0 = 0.05;
export const ATAN_XMIN = -2.4;
export const ATAN_XMAX = 3.4;

export function logResidualHistory(
  sys: NonlinearSys,
  x0: Vec,
  maxIter = 8,
  opts?: Parameters<typeof newtonRun>[2],
): { k: number; logR: number }[] {
  return newtonRun(sys, x0, { ...opts, maxIter }).map((s) => ({
    k: s.k,
    logR: Math.log10(Math.max(s.residualNorm, 1e-18)),
  }));
}

/** |r_{k+1}| / |r_k|² over the window where both residuals are in (1e-14, 1e-2). */
export function measuredQuadraticRatio(
  sys: NonlinearSys,
  x0: Vec,
  opts?: Parameters<typeof newtonRun>[2],
): number[] {
  const run = newtonRun(sys, x0, { ...opts, maxIter: 16, tol: 1e-16 });
  const ratios: number[] = [];
  for (let i = 0; i + 1 < run.length; i++) {
    const a = run[i]!.residualNorm;
    const b = run[i + 1]!.residualNorm;
    if (a < 1e-2 && a > 1e-13 && b > 0 && Number.isFinite(b)) {
      ratios.push(b / (a * a));
    }
  }
  return ratios;
}

export function linearSolveResidual(J: number[][], delta: Vec, Fx: Vec): number {
  return norm2(axpy(1, applyMat(J, delta), Fx));
}
