/* ─────────────────────────────────────────────────────────────────────────
   1D linear finite elements for Poisson:  −u″ = f  on [a, b],
   Dirichlet u(a) = ua, u(b) = ub.

   Weak form: find u with u(a)=ua, u(b)=ub such that

       ∫ u′ v′ dx  =  ∫ f v dx     for every v that vanishes at the ends.

   Galerkin with piecewise-linear hats φᵢ turns that into K u = F,
   Kᵢⱼ = ∫ φᵢ′ φⱼ′ dx. Each hat overlaps only its neighbours, so K is
   tridiagonal. It is assembled by dropping a local 2×2 onto each element.

   On a uniform mesh the interior rows are (1/h)(−1, 2, −1) — the same
   stencil as central differences, after multiplying the FD equation by h.
   On an irregular mesh the same inner product still produces a matrix;
   writing (−1, 2, −1) and ignoring that the neighbours moved does not.

   Displayed in the hat-functions lesson, so the formulas stay visible.
   ───────────────────────────────────────────────────────────────────────── */

import { solveDense } from './linalg.ts';

export type ScalarFn = (x: number) => number;

export interface FemLoad {
  key: string;
  label: string;
  f: ScalarFn;
  /** Exact solution of −u″ = f on (0, 1) with u(0) = u(1) = 0. */
  exact: ScalarFn;
}

export const LOADS: Record<string, FemLoad> = {
  const: {
    key: 'const',
    label: '−u″ = 2',
    f: () => 2,
    exact: (x) => x * (1 - x),
  },
  sine: {
    key: 'sine',
    label: '−u″ = π² sin(πx)',
    f: (x) => Math.PI * Math.PI * Math.sin(Math.PI * x),
    exact: (x) => Math.sin(Math.PI * x),
  },
};

/** Irregular mesh for the hat-sketch: peak at 0.5, zeros at 0.2 and 0.9. */
export const HAT_SKETCH_NODES = [0, 0.2, 0.5, 0.9, 1];
export const HAT_SKETCH_INDEX = 2;

/** Chebyshev-mapped 8-element mesh used by the FD-vs-FEM error ratio. */
export const RATIO_ELEMENTS = 8;
export const RATIO_CLUSTER = 1;

/* ── meshes ────────────────────────────────────────────────────────────── */

export function uniformNodes(nElements: number, a = 0, b = 1): number[] {
  const n = nElements;
  return Array.from({ length: n + 1 }, (_, i) => a + (i / n) * (b - a));
}

/** Chebyshev extrema mapped onto [a, b] — clustered at both walls. */
export function chebyshevNodes(nElements: number, a = 0, b = 1): number[] {
  const n = nElements;
  return Array.from({ length: n + 1 }, (_, i) => {
    const t = (1 - Math.cos((Math.PI * i) / n)) / 2;
    return a + t * (b - a);
  });
}

/** cluster = 0 is uniform; cluster = 1 is Chebyshev-mapped. */
export function blendNodes(nElements: number, cluster: number, a = 0, b = 1): number[] {
  const uni = uniformNodes(nElements, a, b);
  if (cluster === 0) return uni;
  const cheb = chebyshevNodes(nElements, a, b);
  return uni.map((x, i) => x + cluster * (cheb[i]! - x));
}

export function spacings(nodes: number[]): number[] {
  const h: number[] = [];
  for (let e = 0; e < nodes.length - 1; e++) h.push(nodes[e + 1]! - nodes[e]!);
  return h;
}

export const maxSpacing = (nodes: number[]): number => Math.max(...spacings(nodes));

export function moveNode(nodes: number[], i: number, x: number, minGap = 0.02): number[] {
  const copy = nodes.slice();
  const lo = nodes[i - 1]! + minGap;
  const hi = nodes[i + 1]! - minGap;
  copy[i] = Math.min(hi, Math.max(lo, x));
  return copy;
}

/* ── hats ──────────────────────────────────────────────────────────────── */

/** Cardinal piecewise-linear hat φᵢ. Linear on each element, 1 at xᵢ, 0 at every other node. */
export function hat(nodes: number[], i: number, x: number): number {
  const last = nodes.length - 1;
  const xi = nodes[i]!;
  if (i > 0) {
    const xL = nodes[i - 1]!;
    if (x >= xL && x <= xi) return (x - xL) / (xi - xL);
  }
  if (i < last) {
    const xR = nodes[i + 1]!;
    if (x >= xi && x <= xR) return (xR - x) / (xR - xi);
  }
  return 0;
}

/** φᵢ′ is piecewise constant: +1/h_L on the left element, −1/h_R on the right. */
export function hatPrime(nodes: number[], i: number, x: number): number {
  const last = nodes.length - 1;
  const xi = nodes[i]!;
  if (i > 0) {
    const xL = nodes[i - 1]!;
    if (x > xL && x < xi) return 1 / (xi - xL);
  }
  if (i < last) {
    const xR = nodes[i + 1]!;
    if (x > xi && x < xR) return -1 / (xR - xi);
  }
  return 0;
}

export function partitionOfUnity(nodes: number[], x: number): number {
  let s = 0;
  for (let i = 0; i < nodes.length; i++) s += hat(nodes, i, x);
  return s;
}

/** Polyline of φᵢ, including the zeros outside its support so a plot sits on the axis. */
export function hatPolyline(nodes: number[], i: number): [number, number][] {
  const last = nodes.length - 1;
  const pts: [number, number][] = [[nodes[0]!, 0]];
  if (i > 0) pts.push([nodes[i - 1]!, 0]);
  pts.push([nodes[i]!, 1]);
  if (i < last) pts.push([nodes[i + 1]!, 0]);
  pts.push([nodes[last]!, 0]);
  return pts;
}

/* ── assembly ──────────────────────────────────────────────────────────── */

/** Local stiffness on an element of length h: (1/h) [[1, −1], [−1, 1]]. */
export function elementStiffness(h: number): number[][] {
  const s = 1 / h;
  return [
    [s, -s],
    [-s, s],
  ];
}

/** Dense global stiffness including boundary dofs. Tridiagonal from overlapping 2×2s. */
export function assembleStiffness(nodes: number[]): number[][] {
  const n = nodes.length;
  const K = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  for (let e = 0; e < n - 1; e++) {
    const ke = elementStiffness(nodes[e + 1]! - nodes[e]!);
    for (let a = 0; a < 2; a++) {
      for (let b = 0; b < 2; b++) K[e + a]![e + b]! += ke[a]![b]!;
    }
  }
  return K;
}

/** 2-point Gauss–Legendre on [a, b]. Exact for cubics. */
function gauss2(a: number, b: number, f: ScalarFn): number {
  const mid = 0.5 * (a + b);
  const half = 0.5 * (b - a);
  const t = half / Math.sqrt(3);
  return half * (f(mid - t) + f(mid + t));
}

/** Composite 2-point Gauss. Smooth f against a hat is then accurate enough
 *  that 1D Poisson P1 is nodally exact to ~1e-12. */
function integrate(a: number, b: number, f: ScalarFn, panels = 16): number {
  const h = (b - a) / panels;
  let s = 0;
  for (let i = 0; i < panels; i++) s += gauss2(a + i * h, a + (i + 1) * h, f);
  return s;
}

/** Load Fᵢ = ∫ f φᵢ dx, assembled elementwise from the two local hats. */
export function assembleLoad(nodes: number[], f: ScalarFn): number[] {
  const n = nodes.length;
  const F = new Array<number>(n).fill(0);
  for (let e = 0; e < n - 1; e++) {
    const a = nodes[e]!;
    const b = nodes[e + 1]!;
    const h = b - a;
    F[e]! += integrate(a, b, (x) => f(x) * ((b - x) / h));
    F[e + 1]! += integrate(a, b, (x) => f(x) * ((x - a) / h));
  }
  return F;
}

/** Drop Dirichlet rows/cols 0 and n−1; lift known boundary values onto the RHS. */
export function reduceDirichlet(
  K: number[][],
  F: number[],
  ua = 0,
  ub = 0,
): { K: number[][]; F: number[] } {
  const n = F.length;
  const idx = Array.from({ length: n - 2 }, (_, i) => i + 1);
  const Kr = idx.map((i) => idx.map((j) => K[i]![j]!));
  const Fr = idx.map((i) => F[i]! - K[i]![0]! * ua - K[i]![n - 1]! * ub);
  return { K: Kr, F: Fr };
}

export function interiorStiffness(nodes: number[]): number[][] {
  return reduceDirichlet(assembleStiffness(nodes), assembleLoad(nodes, () => 0)).K;
}

export interface FemSolve {
  u: number[];
  K: number[][];
  F: number[];
  Kr: number[][];
  Fr: number[];
}

export function solvePoisson(nodes: number[], f: ScalarFn, ua = 0, ub = 0): FemSolve {
  const K = assembleStiffness(nodes);
  const F = assembleLoad(nodes, f);
  const { K: Kr, F: Fr } = reduceDirichlet(K, F, ua, ub);
  const ui = solveDense(Kr, Fr);
  if (!ui) throw new Error('singular FEM stiffness — the hats of interior nodes should be independent');
  return { u: [ua, ...ui, ub], K, F, Kr, Fr };
}

/* ── the FD reflex this lesson is against ──────────────────────────────── */

export interface Stencil3 {
  left: number;
  diag: number;
  right: number;
}

/** FEM row i (a global node index 1..n−2): (−1/h_L, 1/h_L + 1/h_R, −1/h_R). */
export function femStencil(nodes: number[], i: number): Stencil3 {
  const hL = nodes[i]! - nodes[i - 1]!;
  const hR = nodes[i + 1]! - nodes[i]!;
  return { left: -1 / hL, diag: 1 / hL + 1 / hR, right: -1 / hR };
}

/** Uniform three-point stencil that ignores unequal spacing.
 *  Pretends the neighbours sit at ±h̄, h̄ = (x_{i+1} − x_{i−1})/2,
 *  and writes (−u_{i−1} + 2 uᵢ − u_{i+1}) / h̄² = fᵢ. */
export function naiveFdStencil(nodes: number[], i: number): Stencil3 {
  const hBar = 0.5 * (nodes[i + 1]! - nodes[i - 1]!);
  const s = 1 / (hBar * hBar);
  return { left: -s, diag: 2 * s, right: -s };
}

export function stencilsMatch(nodes: number[], i: number, tol = 1e-10): boolean {
  const fem = femStencil(nodes, i);
  const hL = nodes[i]! - nodes[i - 1]!;
  const hR = nodes[i + 1]! - nodes[i]!;
  if (Math.abs(hL - hR) > tol) return false;
  const h = hL;
  return (
    Math.abs(fem.left + 1 / h) < tol &&
    Math.abs(fem.diag - 2 / h) < tol &&
    Math.abs(fem.right + 1 / h) < tol
  );
}

export function meshStencilsMatch(nodes: number[], tol = 1e-10): boolean {
  for (let i = 1; i < nodes.length - 1; i++) {
    if (!stencilsMatch(nodes, i, tol)) return false;
  }
  return true;
}

/** Skip-a-neighbour FD: assemble the uniform (−1, 2, −1)/h̄² stencil on whatever nodes you were given. */
export function naiveFdPoisson(nodes: number[], f: ScalarFn, ua = 0, ub = 0): number[] {
  const n = nodes.length;
  const m = n - 2;
  const A = Array.from({ length: m }, () => new Array<number>(m).fill(0));
  const b = new Array<number>(m).fill(0);
  for (let k = 0; k < m; k++) {
    const i = k + 1;
    const s = naiveFdStencil(nodes, i);
    if (k > 0) A[k]![k - 1] = s.left;
    A[k]![k] = s.diag;
    if (k < m - 1) A[k]![k + 1] = s.right;
    b[k] = f(nodes[i]!);
    if (k === 0) b[k] -= s.left * ua;
    if (k === m - 1) b[k] -= s.right * ub;
  }
  const ui = solveDense(A, b);
  if (!ui) throw new Error('singular naive FD matrix');
  return [ua, ...ui, ub];
}

/* ── fields and errors ─────────────────────────────────────────────────── */

export function evaluateUh(nodes: number[], u: number[], x: number): number {
  const last = nodes.length - 1;
  if (x <= nodes[0]!) return u[0]!;
  if (x >= nodes[last]!) return u[last]!;
  let e = 0;
  while (e < last - 1 && nodes[e + 1]! < x) e++;
  const a = nodes[e]!;
  const b = nodes[e + 1]!;
  const t = (x - a) / (b - a);
  return (1 - t) * u[e]! + t * u[e + 1]!;
}

export function sampleUh(
  nodes: number[],
  u: number[],
  n = 200,
): { x: number[]; y: number[] } {
  const a = nodes[0]!;
  const b = nodes[nodes.length - 1]!;
  const x = Array.from({ length: n }, (_, i) => a + (i / (n - 1)) * (b - a));
  return { x, y: x.map((xi) => evaluateUh(nodes, u, xi)) };
}

export function maxNodalError(nodes: number[], u: number[], exact: ScalarFn): number {
  let m = 0;
  for (let i = 0; i < nodes.length; i++) {
    m = Math.max(m, Math.abs(u[i]! - exact(nodes[i]!)));
  }
  return m;
}

export function l2Error(nodes: number[], u: number[], exact: ScalarFn): number {
  let acc = 0;
  for (let e = 0; e < nodes.length - 1; e++) {
    const a = nodes[e]!;
    const b = nodes[e + 1]!;
    acc += integrate(a, b, (x) => {
      const d = evaluateUh(nodes, u, x) - exact(x);
      return d * d;
    });
  }
  return Math.sqrt(acc);
}

/** L²(naive FD) / L²(FEM) on a Chebyshev-mapped mesh. The number the estimate asks for. */
export function naiveFdToFemL2Ratio(
  nElements = RATIO_ELEMENTS,
  cluster = RATIO_CLUSTER,
  load: FemLoad = LOADS.const,
): number {
  const nodes = blendNodes(nElements, cluster);
  const fem = solvePoisson(nodes, load.f);
  const fd = naiveFdPoisson(nodes, load.f);
  const eFem = l2Error(nodes, fem.u, load.exact);
  const eFd = l2Error(nodes, fd, load.exact);
  return eFd / eFem;
}

/* ── SPD ───────────────────────────────────────────────────────────────── */

export function isSymmetric(K: number[][], tol = 1e-12): boolean {
  const n = K.length;
  for (let i = 0; i < n; i++) {
    if (K[i]!.length !== n) return false;
    for (let j = 0; j < i; j++) {
      if (Math.abs(K[i]![j]! - K[j]![i]!) > tol) return false;
    }
  }
  return true;
}

/** Dense Cholesky. Returns null if K is not SPD — used as the SPD test. */
export function cholesky(K: number[][]): number[][] | null {
  const n = K.length;
  const L = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let sum = K[i]![j]!;
      for (let k = 0; k < j; k++) sum -= L[i]![k]! * L[j]![k]!;
      if (i === j) {
        if (sum <= 1e-18) return null;
        L[i]![j] = Math.sqrt(sum);
      } else {
        L[i]![j] = sum / L[j]![j]!;
      }
    }
  }
  return L;
}

export const isSpd = (K: number[][]): boolean => isSymmetric(K) && cholesky(K) !== null;
