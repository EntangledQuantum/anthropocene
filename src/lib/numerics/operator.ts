/* ─────────────────────────────────────────────────────────────────────────
   1D discrete Laplacian, the matrix a physicist actually meets.

   Poisson −u″ = f on [0, 1]. The three-point stencil

       (Au)_i = (−u_{i−1} + 2 u_i − u_{i+1}) / h²

   written at every unknown *is* the matrix A. There is no second object.
   Dirichlet: n interior nodes, h = 1/(n+1), walls at 0. Periodic: n nodes,
   h = 1/n, wrap-around corners. Displayed in the operators lesson, so the
   loop stays the formula.
   ───────────────────────────────────────────────────────────────────────── */

export type LaplacianBc = 'dirichlet' | 'periodic';

export interface SparseEntry {
  i: number;
  j: number;
  v: number;
}

export interface Laplacian1d {
  n: number;
  h: number;
  bc: LaplacianBc;
  /** Node locations on [0, 1]. Dirichlet omits the walls. */
  x: number[];
  /** COO of A. Exact zeros are omitted; wrap contributions are combined. */
  entries: SparseEntry[];
}

export function laplacianGrid(n: number, bc: LaplacianBc): { x: number[]; h: number } {
  if (n < 1) throw new Error('need n ≥ 1');
  if (bc === 'dirichlet') {
    const h = 1 / (n + 1);
    return { h, x: Array.from({ length: n }, (_, i) => (i + 1) * h) };
  }
  const h = 1 / n;
  return { h, x: Array.from({ length: n }, (_, i) => i * h) };
}

/** Closed-form nnz. Dirichlet ends have two entries, not three.
 *  Periodic n = 1 collapses to the zero matrix (omitted). Periodic n = 2
 *  doubles the off-diagonals, so the matrix is dense 2×2. */
export function laplacianNnz(n: number, bc: LaplacianBc): number {
  if (n < 1) return 0;
  if (bc === 'dirichlet') return n === 1 ? 1 : 3 * n - 2;
  if (n === 1) return 0;
  if (n === 2) return 4;
  return 3 * n;
}

export function laplacianEntries(n: number, bc: LaplacianBc): SparseEntry[] {
  const { h } = laplacianGrid(n, bc);
  const s = 1 / (h * h);
  const acc = new Map<string, number>();
  const add = (i: number, j: number, v: number) => {
    const key = `${i},${j}`;
    acc.set(key, (acc.get(key) ?? 0) + v);
  };

  for (let i = 0; i < n; i++) {
    add(i, i, 2 * s);
    if (bc === 'periodic') {
      add(i, (i - 1 + n) % n, -s);
      add(i, (i + 1) % n, -s);
    } else {
      if (i - 1 >= 0) add(i, i - 1, -s);
      if (i + 1 < n) add(i, i + 1, -s);
    }
  }

  const entries: SparseEntry[] = [];
  for (const [key, v] of acc) {
    if (Math.abs(v) < 1e-18) continue;
    const comma = key.indexOf(',');
    entries.push({ i: Number(key.slice(0, comma)), j: Number(key.slice(comma + 1)), v });
  }
  entries.sort((a, b) => a.i - b.i || a.j - b.j);
  return entries;
}

export function laplacian1d(n: number, bc: LaplacianBc): Laplacian1d {
  const { x, h } = laplacianGrid(n, bc);
  return { n, h, bc, x, entries: laplacianEntries(n, bc) };
}

/** The stencil loop. Dirichlet walls contribute 0 (homogeneous). */
export function applyLaplacian(u: number[], bc: LaplacianBc): number[] {
  const n = u.length;
  const { h } = laplacianGrid(n, bc);
  const s = 1 / (h * h);
  const out = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    const left = bc === 'periodic'
      ? u[(i - 1 + n) % n]!
      : i === 0 ? 0 : u[i - 1]!;
    const right = bc === 'periodic'
      ? u[(i + 1) % n]!
      : i === n - 1 ? 0 : u[i + 1]!;
    out[i] = s * (2 * u[i]! - left - right);
  }
  return out;
}

export function applyEntries(n: number, entries: SparseEntry[], u: number[]): number[] {
  const out = new Array<number>(n).fill(0);
  for (const e of entries) out[e.i]! += e.v * u[e.j]!;
  return out;
}

export function denseFromEntries(n: number, entries: SparseEntry[]): number[][] {
  const A = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  for (const e of entries) A[e.i]![e.j] = e.v;
  return A;
}

export function denseLaplacian(n: number, bc: LaplacianBc): number[][] {
  return denseFromEntries(n, laplacianEntries(n, bc));
}

export function isSymmetric(A: number[][], tol = 1e-12): boolean {
  const n = A.length;
  for (let i = 0; i < n; i++) {
    if (A[i]!.length !== n) return false;
    for (let j = 0; j < i; j++) {
      if (Math.abs(A[i]![j]! - A[j]![i]!) > tol) return false;
    }
  }
  return true;
}

/** Dense Cholesky. Returns null if A is not SPD.
 *  Pivot test is relative to the diagonal scale of A: a periodic Laplacian
 *  has entries O(1/h²), so an absolute 10⁻¹⁸ cutoff would call a singular
 *  matrix SPD. */
export function cholesky(A: number[][]): number[][] | null {
  const n = A.length;
  let scale = 1;
  for (let i = 0; i < n; i++) scale = Math.max(scale, Math.abs(A[i]![i]!));
  const L = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let sum = A[i]![j]!;
      for (let k = 0; k < j; k++) sum -= L[i]![k]! * L[j]![k]!;
      if (i === j) {
        if (sum <= 1e-14 * scale) return null;
        L[i]![j] = Math.sqrt(sum);
      } else {
        L[i]![j] = sum / L[j]![j]!;
      }
    }
  }
  return L;
}

export const isSpd = (A: number[][]): boolean => isSymmetric(A) && cholesky(A) !== null;

/** Exact eigenvalues of the Dirichlet matrix (1/h²) tridiag(−1, 2, −1).
 *  λ_k = 4 (n+1)² sin²( k π / (2(n+1)) ), k = 1..n. */
export function dirichletEigenvalues(n: number): number[] {
  const n1 = n + 1;
  return Array.from({ length: n }, (_, k) => {
    const s = Math.sin(((k + 1) * Math.PI) / (2 * n1));
    return 4 * n1 * n1 * s * s;
  });
}

export type FieldKind = 'bump' | 'sine' | 'constant' | 'spike' | 'hat';

export function sampleField(
  kind: FieldKind,
  x: number[],
  spikeIndex = Math.floor(x.length / 2),
): number[] {
  const n = x.length;
  const k = Math.min(n - 1, Math.max(0, spikeIndex));
  if (kind === 'constant') return new Array(n).fill(1);
  if (kind === 'spike') {
    const u = new Array(n).fill(0);
    if (n > 0) u[k] = 1;
    return u;
  }
  if (kind === 'sine') return x.map((xi) => Math.sin(Math.PI * xi));
  if (kind === 'hat') {
    const x0 = x[k] ?? 0.5;
    const left = x[Math.max(0, k - 1)] ?? 0;
    const right = x[Math.min(n - 1, k + 1)] ?? 1;
    return x.map((xi) => {
      if (xi === x0) return 1;
      if (xi < x0) return left === x0 ? 0 : Math.max(0, (xi - left) / (x0 - left));
      return right === x0 ? 0 : Math.max(0, (right - xi) / (right - x0));
    });
  }
  return x.map((xi) => Math.exp(-(((xi - 0.5) / 0.12) ** 2)));
}

export function dot(a: number[], b: number[]): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i]! * b[i]!;
  return s;
}

export function maxAbs(u: number[]): number {
  let m = 0;
  for (const v of u) {
    const a = Math.abs(v);
    if (a > m) m = a;
  }
  return m;
}

/** Rayleigh quotient uᵀAu / uᵀu. For the Dirichlet sine, this sits near π². */
export function rayleigh(u: number[], Au: number[]): number {
  const den = dot(u, u);
  return den === 0 ? NaN : dot(u, Au) / den;
}
