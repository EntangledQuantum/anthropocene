import { solveDense } from './linalg.ts';

/* ─────────────────────────────────────────────────────────────────────────
   1D Poisson on [0, 1] with a wall that is missing a neighbour.

   Interior stencil, every node that has both neighbours:

     (u_{i-1} − 2 u_i + u_{i+1}) / h²  =  f_i     (= u″)

   At x = 0 that left sample does not exist. Two ways to answer:

     naive  — switch the wall to a one-sided animal (Dirichlet: skip the
              wall value and difference only inward; Neumann: (u_1 − u_0)/h
              as the boundary equation). Local error O(h), and it infects
              the whole solve.
     ghost  — invent u_{−1} so the centred stencil can stay. Dirichlet:
              the wall node IS the missing neighbour (u_0 = α). Neumann:
              (u_1 − u_{−1}) / (2h) = σ  ⇒  u_{−1} = u_1 − 2 h σ.

   Right end is Dirichlet so the Neumann problem stays unique.
   Node-centered: x_i = i h, i = 0..n, h = 1/n.
   ───────────────────────────────────────────────────────────────────────── */

export type BcKind = 'dirichlet' | 'neumann';
export type WallMethod = 'ghost' | 'naive';

export interface Manufactured {
  u: (x: number) => number;
  du: (x: number) => number;
  d2: (x: number) => number;
}

/** Smooth manufactured field: nothing accidentally vanishes at the wall. */
export const EXP: Manufactured = {
  u: Math.exp,
  du: Math.exp,
  d2: Math.exp,
};

export function nodeGrid(n: number): { x: number[]; h: number } {
  const h = 1 / n;
  return { x: Array.from({ length: n + 1 }, (_, i) => i * h), h };
}

/** Fictitious sample at x = −h that makes the centred boundary condition hold.
 *  Dirichlet: odd reflection through the wall value, u_{−1} = 2α − u_1.
 *  Neumann:   (u_1 − u_{−1}) / (2h) = σ  ⇒  u_{−1} = u_1 − 2 h σ. */
export function ghostFromBc(kind: BcKind, u1: number, h: number, value: number): number {
  return kind === 'dirichlet' ? 2 * value - u1 : u1 - 2 * h * value;
}

export interface PoissonSolve {
  x: number[];
  u: number[];
  h: number;
  /** Left-wall ghost. Null when the method does not introduce one. */
  ghost: number | null;
  n: number;
  left: BcKind;
  method: WallMethod;
}

export interface PoissonOpts {
  n: number;
  left: BcKind;
  method: WallMethod;
  /** Left Dirichlet value α, or left Neumann flux σ. */
  leftValue: number;
  rightValue: number;
  f: (x: number) => number;
}

/**
 * Solve u″ = f on (0, 1). Right wall is Dirichlet. Left wall is Dirichlet
 * or Neumann, treated either by a ghost or by a naive one-sided stencil.
 */
export function solvePoisson(opts: PoissonOpts): PoissonSolve {
  const { n, left, method, leftValue, rightValue, f } = opts;
  if (n < 4) throw new Error('need n ≥ 4 so a one-sided wall stencil fits');
  const { x, h } = nodeGrid(n);
  const s = 1 / (h * h);
  const rhsN = rightValue;

  if (left === 'dirichlet') {
    const alpha = leftValue;
    const m = n - 1;
    const A = Array.from({ length: m }, () => new Array<number>(m).fill(0));
    const b = new Array<number>(m).fill(0);
    const idx = (i: number) => i - 1;

    // Naive Dirichlet skips the wall value and pretends the missing neighbour
    // is 0. That is a different BVP (homogeneous), not a lower-order stencil
    // of the same one — the matrix stays the centred Laplacian.
    const wall = method === 'naive' ? 0 : alpha;

    for (let i = 1; i <= n - 1; i++) {
      const r = idx(i);
      b[r] = f(x[i]!);
      A[r][r] += -2 * s;
      if (i === 1) b[r] -= wall * s;
      else A[r][idx(i - 1)] += s;
      if (i === n - 1) b[r] -= rhsN * s;
      else A[r][idx(i + 1)] += s;
    }

    const interior = solveDense(A, b);
    if (!interior) throw new Error('Dirichlet Poisson solve failed');
    const u = new Array<number>(n + 1);
    u[0] = wall;
    for (let k = 0; k < m; k++) u[k + 1] = interior[k]!;
    u[n] = rhsN;
    // Dirichlet does not invent a fictitious sample: the wall node is the
    // missing neighbour, and it is known.
    return { x, u, h, ghost: null, n, left, method };
  }

  // Neumann at x = 0. Unknowns u_0 .. u_{n-1}; u_n is Dirichlet.
  const sigma = leftValue;
  const m = n;
  const A = Array.from({ length: m }, () => new Array<number>(m).fill(0));
  const b = new Array<number>(m).fill(0);

  if (method === 'naive') {
    // One-sided first derivative as the wall equation: (u_1 − u_0) / h = σ.
    A[0][0] = -1 / h;
    A[0][1] = 1 / h;
    b[0] = sigma;
  } else {
    // Ghost u_{−1} = u_1 − 2 h σ into the centred stencil at i = 0:
    // 2(u_1 − u_0)/h² = f_0 + 2σ/h.
    A[0][0] = -2 * s;
    A[0][1] = 2 * s;
    b[0] = f(x[0]!) + (2 * sigma) / h;
  }

  for (let i = 1; i <= n - 1; i++) {
    A[i][i] += -2 * s;
    A[i][i - 1] += s;
    if (i === n - 1) b[i] = f(x[i]!) - rhsN * s;
    else {
      A[i][i + 1] += s;
      b[i] = f(x[i]!);
    }
  }

  const body = solveDense(A, b);
  if (!body) throw new Error('Neumann Poisson solve failed');
  const u = new Array<number>(n + 1);
  for (let k = 0; k < m; k++) u[k] = body[k]!;
  u[n] = rhsN;
  const ghost = method === 'ghost' ? ghostFromBc('neumann', u[1]!, h, sigma) : null;
  return { x, u, h, ghost, n, left, method };
}

export function maxAbsError(u: number[], x: number[], exact: (x: number) => number): number {
  let m = 0;
  for (let i = 0; i < u.length; i++) {
    const e = Math.abs(u[i]! - exact(x[i]!));
    if (e > m) m = e;
  }
  return m;
}

export function solveError(
  n: number,
  left: BcKind,
  method: WallMethod,
  field: Manufactured = EXP,
): number {
  const leftValue = left === 'dirichlet' ? field.u(0) : field.du(0);
  const run = solvePoisson({
    n, left, method, leftValue, rightValue: field.u(1), f: field.d2,
  });
  return maxAbsError(run.u, run.x, field.u);
}

/** log2(E(n) / E(2n)) — observed order when the mesh is halved. */
export function observedOrder(
  n: number,
  left: BcKind,
  method: WallMethod,
  field: Manufactured = EXP,
): number {
  const e1 = solveError(n, left, method, field);
  const e2 = solveError(2 * n, left, method, field);
  return Math.log2(e1 / e2);
}

export interface SweepPoint {
  n: number;
  h: number;
  error: number;
}

export function errorSweep(
  ns: number[],
  left: BcKind,
  method: WallMethod,
  field: Manufactured = EXP,
): SweepPoint[] {
  return ns.map((n) => ({ n, h: 1 / n, error: solveError(n, left, method, field) }));
}

/** Discrete Laplacian residual of a sampled field, using the same wall treatment
 *  as the solver. Interior points use the centred 3-point stencil. */
export function laplacianResidual(
  u: number[],
  h: number,
  f: (x: number) => number,
  left: BcKind,
  method: WallMethod,
  leftValue: number,
): number[] {
  const n = u.length - 1;
  const s = 1 / (h * h);
  const r = new Array<number>(n + 1).fill(0);
  for (let i = 1; i < n; i++) {
    r[i] = (u[i - 1]! - 2 * u[i]! + u[i + 1]!) * s - f(i * h);
  }
  r[n] = 0;

  if (left === 'dirichlet') {
    r[0] = u[0]! - (method === 'naive' ? 0 : leftValue);
    return r;
  }

  if (method === 'naive') {
    r[0] = (u[1]! - u[0]!) / h - leftValue;
  } else {
    const ghost = ghostFromBc('neumann', u[1]!, h, leftValue);
    r[0] = (ghost - 2 * u[0]! + u[1]!) * s - f(0);
  }
  return r;
}

/** Residual of the wall operator on the exact field — the local truncation
 *  error the cartoon is pointing at. */
export function wallTruncation(
  n: number,
  left: BcKind,
  method: WallMethod,
  field: Manufactured = EXP,
): number {
  const { x, h } = nodeGrid(n);
  const u = x.map((xi) => field.u(xi));
  const leftValue = left === 'dirichlet' ? field.u(0) : field.du(0);
  const r = laplacianResidual(u, h, field.d2, left, method, leftValue);
  return Math.abs(r[left === 'dirichlet' && method === 'naive' ? 1 : 0]!);
}

/** Interior max |D²u − f| on the exact samples (centred stencils only). */
export function interiorTruncation(n: number, field: Manufactured = EXP): number {
  const { x, h } = nodeGrid(n);
  const u = x.map((xi) => field.u(xi));
  const s = 1 / (h * h);
  let m = 0;
  for (let i = 1; i < n; i++) {
    const e = Math.abs((u[i - 1]! - 2 * u[i]! + u[i + 1]!) * s - field.d2(x[i]!));
    if (e > m) m = e;
  }
  return m;
}

/** Residual at the wall as a function of a trial ghost value, on the exact
 *  field. Zero (to O(h²)) when the ghost encodes the Neumann condition. */
export function neumannWallResidualOnExact(n: number, ghost: number, field: Manufactured = EXP): number {
  const { x, h } = nodeGrid(n);
  const s = 1 / (h * h);
  const u0 = field.u(x[0]!);
  const u1 = field.u(x[1]!);
  return (ghost - 2 * u0 + u1) * s - field.d2(x[0]!);
}

export function neumannGhostTarget(n: number, field: Manufactured = EXP): number {
  const h = 1 / n;
  return ghostFromBc('neumann', field.u(h), h, field.du(0));
}

/** Discrete Laplacian residual of the exact field, with a trial ghost at x = −h
 *  in place of the left-wall neighbour. Interior residuals stay O(h²); the
 *  wall residual collapses only when `ghost` encodes the Neumann condition. */
export function residualWithTrialGhost(
  n: number,
  ghost: number,
  field: Manufactured = EXP,
): { x: number[]; residual: number[]; wall: number } {
  const { x, h } = nodeGrid(n);
  const u = x.map((xi) => field.u(xi));
  const s = 1 / (h * h);
  const residual = new Array<number>(n + 1);
  residual[0] = (ghost - 2 * u[0]! + u[1]!) * s - field.d2(x[0]!);
  for (let i = 1; i < n; i++) {
    residual[i] = (u[i - 1]! - 2 * u[i]! + u[i + 1]!) * s - field.d2(x[i]!);
  }
  residual[n] = 0;
  return { x, residual, wall: residual[0]! };
}

export function leftData(kind: BcKind, field: Manufactured = EXP): number {
  return kind === 'dirichlet' ? field.u(0) : field.du(0);
}
