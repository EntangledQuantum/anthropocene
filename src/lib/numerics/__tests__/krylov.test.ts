import { describe, expect, it } from 'vitest';
import { applyLaplacian, denseLaplacian, dot, isSpd } from '../operator.ts';
import { norm2, sub } from '../types.ts';
import {
  aInner,
  cgHistory,
  conjugateGradient,
  dirichletPoisson,
  energyNormSq,
  inSpanResidual,
  jacobiResidualHistory,
  jacobiLaplacianSweep,
  jacobiStepsUntil,
  krylovPowers,
  poissonExact,
  residualOf,
  spdEllipse,
  steepestDescentHistory,
} from '../iterative.ts';

/* Pedagogical claims of the Krylov / CG lesson. If the lesson says CG
   drops faster than Jacobi, that successive residuals are orthogonal,
   that search directions are A-orthogonal, or that CG is exact in n
   steps on an n-dimensional SPD problem, this file pins it. */

const applyA = (u: number[]) => applyLaplacian(u, 'dirichlet');

describe('Jacobi sweep matches the stencil average', () => {
  it('xᵢ ← (x_{i−1} + x_{i+1})/2 + (h²/2) bᵢ, walls 0', () => {
    const { n, h, b } = dirichletPoisson(5, 'ones');
    const x = [0.1, 0.4, 0.2, 0.5, 0.3];
    const next = jacobiLaplacianSweep(x, b);
    const w = (h * h) / 2;
    expect(next[0]).toBeCloseTo(0.5 * (0 + x[1]!) + w * b[0]!, 12);
    expect(next[2]).toBeCloseTo(0.5 * (x[1]! + x[3]!) + w * b[2]!, 12);
    expect(next[n - 1]).toBeCloseTo(0.5 * (x[n - 2]! + 0) + w * b[n - 1]!, 12);
  });
});

describe('CG residual drops faster than Jacobi on this SPD', () => {
  it('Dirichlet Laplacian is SPD, so CG applies', () => {
    for (const n of [2, 3, 8, 16]) {
      expect(isSpd(denseLaplacian(n, 'dirichlet'))).toBe(true);
    }
  });

  it('after n steps on n = 16, CG is at roundoff and Jacobi has barely moved', () => {
    const { b } = dirichletPoisson(16, 'mixed');
    const n = 16;
    const jac = jacobiResidualHistory(b, n);
    const sd = steepestDescentHistory(applyA, b, n);
    const cg = cgHistory(b, n);
    expect(jac[n]!.residualNorm).toBeGreaterThan(0.4 * jac[0]!.residualNorm);
    expect(cg[n]!.residualNorm).toBeLessThan(1e-12);
    expect(cg[n]!.residualNorm).toBeLessThan(1e-10 * sd[n]!.residualNorm);
  });

  it('A-norm of the CG error is below Jacobi at every step k ≥ 1', () => {
    const { b } = dirichletPoisson(16, 'mixed');
    const xStar = poissonExact(b);
    const jac = jacobiResidualHistory(b, 8);
    const cg = cgHistory(b, 8);
    for (let k = 1; k <= 8; k++) {
      const eC = energyNormSq(applyA, sub(xStar, cg[k]!.x));
      const eJ = energyNormSq(applyA, sub(xStar, jac[k]!.x));
      expect(eC).toBeLessThan(eJ);
    }
  });

  it('first CG step equals steepest descent; later steps do not', () => {
    const { b } = dirichletPoisson(8, 'mixed');
    const sd = steepestDescentHistory(applyA, b, 3);
    const cg = cgHistory(b, 3);
    expect(cg[1]!.residualNorm).toBeCloseTo(sd[1]!.residualNorm, 10);
    expect(Math.abs(cg[2]!.residualNorm - sd[2]!.residualNorm)).toBeGreaterThan(1e-8);
  });
});

describe('A-orthogonality of successive residuals and directions', () => {
  it('CG residuals are pairwise orthogonal', () => {
    const { b } = dirichletPoisson(5, 'mixed');
    const cg = conjugateGradient(applyA, b, { maxIter: 5 });
    for (let i = 0; i < 5; i++) {
      for (let j = 0; j < i; j++) {
        const rr = Math.abs(dot(cg[i]!.r, cg[j]!.r));
        expect(rr).toBeLessThan(1e-10 * (cg[i]!.residualNorm * cg[j]!.residualNorm + 1e-18));
      }
    }
  });

  it('search directions are A-orthogonal: pᵢᵀ A pⱼ = 0', () => {
    const { b } = dirichletPoisson(5, 'mixed');
    const cg = conjugateGradient(applyA, b, { maxIter: 5 });
    for (let i = 0; i < 5; i++) {
      for (let j = 0; j < i; j++) {
        const pAp = Math.abs(aInner(applyA, cg[i]!.p, cg[j]!.p));
        const scale = Math.hypot(...cg[i]!.p) * Math.hypot(...applyA(cg[j]!.p)) + 1e-18;
        expect(pAp / scale).toBeLessThan(1e-8);
      }
    }
  });

  it('the residual is orthogonal to the Krylov space so far (error is A-orthogonal to K_k)', () => {
    const { b } = dirichletPoisson(6, 'mixed');
    const r0 = b.slice();
    const cg = conjugateGradient(applyA, b, { maxIter: 5 });
    for (let k = 1; k <= 5; k++) {
      const K = krylovPowers(applyA, r0, k);
      const r = cg[k]!.r;
      for (const col of K) {
        expect(Math.abs(dot(r, col))).toBeLessThan(1e-8 * (norm2(r) * norm2(col) + 1e-18));
      }
    }
  });
});

describe('exact in n steps on an n-dimensional SPD problem', () => {
  it('tiny n: residual after n steps is roundoff', () => {
    for (const n of [2, 3, 4, 5]) {
      const { b } = dirichletPoisson(n, 'mixed');
      const cg = conjugateGradient(applyA, b, { maxIter: n });
      const r0 = cg[0]!.residualNorm;
      expect(cg[n]!.residualNorm).toBeLessThan(1e-10 * Math.max(r0, 1));
      const xStar = poissonExact(b);
      expect(norm2(sub(cg[n]!.x, xStar))).toBeLessThan(1e-9 * Math.max(1, norm2(xStar)));
    }
  });

  it('when x0 = 0, x_k lives in K_k = span{r, Ar, …, A^{k−1}r}', () => {
    const { b } = dirichletPoisson(6, 'mixed');
    const cg = conjugateGradient(applyA, b, { maxIter: 4 });
    for (let k = 1; k <= 4; k++) {
      const K = krylovPowers(applyA, b, k);
      expect(inSpanResidual(K, cg[k]!.x, 1e-7)).toBe(true);
    }
  });

  it('energy ‖e‖_A decreases at every CG step until it hits zero', () => {
    const { b, applyA: A } = dirichletPoisson(5, 'mixed');
    const xStar = poissonExact(b);
    const cg = conjugateGradient(A, b, { maxIter: 5 });
    let prev = Infinity;
    for (const step of cg) {
      const e2 = energyNormSq(A, sub(xStar, step.x));
      expect(e2).toBeLessThanOrEqual(prev + 1e-12);
      prev = e2;
    }
    expect(prev).toBeLessThan(1e-20);
  });
});

describe('Jacobi does not catch CG on this problem', () => {
  it('reaching ‖r‖ = 10⁻⁶ on n = 8 takes more than a hundred Jacobi sweeps; CG is already there', () => {
    const { b } = dirichletPoisson(8, 'mixed');
    const kJ = jacobiStepsUntil(b, 1e-6, 2000);
    expect(kJ).toBeGreaterThan(150);
    expect(kJ).toBeLessThan(300);
    const cg = cgHistory(b, 8);
    expect(cg[8]!.residualNorm).toBeLessThan(1e-12);
  });
});

describe('residual identity', () => {
  it('r = b − Ax along a Jacobi and a CG trajectory', () => {
    const { b } = dirichletPoisson(7, 'sine');
    const x = [0.2, -0.1, 0.4, 0.1, 0, 0.3, -0.2];
    const r = residualOf(applyA, x, b);
    expect(norm2(sub(r, sub(b, applyA(x))))).toBe(0);

    const jac = jacobiResidualHistory(b, 3, x);
    const cg = cgHistory(b, 3, x);
    for (const step of [...jac, ...cg]) {
      expect(norm2(sub(step.r, residualOf(applyA, step.x, b)))).toBeLessThan(1e-12);
    }
  });
});

describe('two-unknown energy ellipse', () => {
  it('a sampled point has eᵀAe equal to the level', () => {
    const { b } = dirichletPoisson(2, 'mixed');
    const A = denseLaplacian(2, 'dirichlet');
    const xStar = poissonExact(b);
    const level = 0.04;
    const pts = spdEllipse(A, xStar, level, 48);
    expect(pts.length).toBe(49);
    const p = pts[12]!;
    const e = [p[0] - xStar[0]!, p[1] - xStar[1]!];
    const Ae = [A[0]![0]! * e[0] + A[0]![1]! * e[1], A[1]![0]! * e[0] + A[1]![1]! * e[1]];
    expect(e[0]! * Ae[0]! + e[1]! * Ae[1]!).toBeCloseTo(level, 10);
  });
});
