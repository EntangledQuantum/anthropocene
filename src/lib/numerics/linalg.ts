import type { State } from './types.ts';

/** Dense LU with partial pivoting, solving A x = b in place.
 *  Systems in these lessons are tiny (2–6 unknowns), so a textbook dense
 *  solve is both fast enough and the thing a learner can actually read. */
export function solveDense(A: number[][], b: number[]): State | null {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);

  for (let col = 0; col < n; col++) {
    // Partial pivot: largest magnitude in this column, for numerical stability.
    let pivot = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(M[r][col]) > Math.abs(M[pivot][col])) pivot = r;
    }
    if (Math.abs(M[pivot][col]) < 1e-14) return null; // singular
    [M[col], M[pivot]] = [M[pivot], M[col]];

    for (let r = col + 1; r < n; r++) {
      const factor = M[r][col] / M[col][col];
      if (factor === 0) continue;
      for (let c = col; c <= n; c++) M[r][c] -= factor * M[col][c];
    }
  }

  const x = new Array<number>(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    let sum = M[r][n];
    for (let c = r + 1; c < n; c++) sum -= M[r][c] * x[c];
    x[r] = sum / M[r][r];
  }
  return x.every(Number.isFinite) ? x : null;
}

/** Forward-difference Jacobian ∂g/∂y. Step is scaled per-component so it
 *  stays meaningful for both small and large state values. */
export function numericalJacobian(g: (y: State) => State, y: State): number[][] {
  const n = y.length;
  const g0 = g(y);
  const J: number[][] = Array.from({ length: n }, () => new Array<number>(n).fill(0));

  for (let c = 0; c < n; c++) {
    const eps = Math.sqrt(Number.EPSILON) * Math.max(Math.abs(y[c]), 1);
    const yp = y.slice();
    yp[c] += eps;
    const gp = g(yp);
    for (let r = 0; r < n; r++) J[r][c] = (gp[r] - g0[r]) / eps;
  }
  return J;
}

/** Newton's method on g(y) = 0.
 *
 *  Implicit steps MUST use Newton rather than fixed-point iteration: the
 *  fixed-point map y ↦ y_n + h f(t, y) contracts only when h·|∂f/∂y| < 1,
 *  which is exactly the regime where an implicit method has no advantage.
 *  Solving with Newton is what actually delivers unconditional stability. */
export function newtonSolve(
  g: (y: State) => State,
  guess: State,
  { maxIter = 50, tol = 1e-12 } = {},
): State {
  let y = guess.slice();

  for (let i = 0; i < maxIter; i++) {
    const residual = g(y);
    if (Math.max(...residual.map(Math.abs)) < tol) break;

    const delta = solveDense(numericalJacobian(g, y), residual.map((r) => -r));
    if (!delta) break; // singular Jacobian: keep the best iterate we have

    y = y.map((v, j) => v + delta[j]);
    if (!y.every(Number.isFinite)) return guess;
    if (Math.max(...delta.map(Math.abs)) < tol) break;
  }
  return y;
}
