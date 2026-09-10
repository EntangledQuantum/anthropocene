import { describe, expect, it } from 'vitest';
import {
  applyEntries,
  applyLaplacian,
  denseLaplacian,
  dirichletEigenvalues,
  isSpd,
  isSymmetric,
  laplacian1d,
  laplacianEntries,
  laplacianNnz,
  rayleigh,
  sampleField,
} from '../operator.ts';

/* Pedagogical claims of the discrete-operator lesson. If the lesson says
   the 1D Laplacian has nnz = 3n−2, that applying A equals the stencil, or
   that Dirichlet A is SPD, this file pins it. */

const closeVec = (a: number[], b: number[], digits = 10) => {
  expect(a.length).toBe(b.length);
  for (let i = 0; i < a.length; i++) expect(a[i]).toBeCloseTo(b[i]!, digits);
};

describe('1D Dirichlet Laplacian nnz', () => {
  it('is 3n − 2 for n ≥ 2, and 1 for n = 1', () => {
    expect(laplacianNnz(1, 'dirichlet')).toBe(1);
    expect(laplacianNnz(2, 'dirichlet')).toBe(4);
    expect(laplacianNnz(5, 'dirichlet')).toBe(13);
    expect(laplacianNnz(200, 'dirichlet')).toBe(3 * 200 - 2);
    for (const n of [1, 2, 3, 5, 8, 16, 32]) {
      expect(laplacianEntries(n, 'dirichlet').length).toBe(laplacianNnz(n, 'dirichlet'));
    }
  });

  it('periodic is 3n for n ≥ 3, with wrap-around corners', () => {
    expect(laplacianNnz(3, 'periodic')).toBe(9);
    expect(laplacianNnz(8, 'periodic')).toBe(24);
    const A = denseLaplacian(5, 'periodic');
    expect(A[0]![4]).not.toBe(0);
    expect(A[4]![0]).not.toBe(0);
    expect(A[0]![2]).toBe(0);
    for (const n of [3, 4, 7, 12]) {
      expect(laplacianEntries(n, 'periodic').length).toBe(laplacianNnz(n, 'periodic'));
    }
  });
});

describe('apply A equals the stencil', () => {
  const fieldsFor = (n: number, bc: 'dirichlet' | 'periodic') => {
    const x = laplacian1d(n, bc).x;
    return [
      sampleField('constant', x),
      sampleField('sine', x),
      sampleField('bump', x),
      sampleField('spike', x, 1),
      sampleField('hat', x, Math.floor(n / 2)),
    ];
  };

  it('COO product matches the three-point loop, Dirichlet and periodic', () => {
    for (const bc of ['dirichlet', 'periodic'] as const) {
      for (const n of [3, 5, 8, 16]) {
        const entries = laplacianEntries(n, bc);
        for (const u of fieldsFor(n, bc)) {
          closeVec(applyEntries(n, entries, u), applyLaplacian(u, bc));
        }
      }
    }
  });

  it('dense A u matches the stencil', () => {
    for (const n of [3, 7]) {
      const A = denseLaplacian(n, 'dirichlet');
      const u = sampleField('bump', laplacian1d(n, 'dirichlet').x);
      const Au = A.map((row) => row.reduce((s, v, j) => s + v * u[j]!, 0));
      closeVec(Au, applyLaplacian(u, 'dirichlet'));
    }
  });

  it('a unit spike pulls out one column, which is the stencil', () => {
    const n = 6;
    const A = denseLaplacian(n, 'dirichlet');
    const { h } = laplacian1d(n, 'dirichlet');
    const s = 1 / (h * h);
    const i = 2;
    const e = sampleField('spike', laplacian1d(n, 'dirichlet').x, i);
    const col = applyLaplacian(e, 'dirichlet');
    for (let r = 0; r < n; r++) expect(col[r]).toBeCloseTo(A[r]![i]!, 12);
    expect(col[i]).toBeCloseTo(2 * s, 12);
    expect(col[i - 1]).toBeCloseTo(-s, 12);
    expect(col[i + 1]).toBeCloseTo(-s, 12);
    expect(col[0]).toBe(0);
  });
});

describe('Dirichlet A is SPD; periodic is not', () => {
  it('Dirichlet matrices are symmetric positive definite', () => {
    for (const n of [1, 2, 3, 5, 8, 16]) {
      const A = denseLaplacian(n, 'dirichlet');
      expect(isSymmetric(A)).toBe(true);
      expect(isSpd(A)).toBe(true);
    }
  });

  it('periodic matrices are symmetric but singular — constants are a kernel', () => {
    for (const n of [3, 4, 8]) {
      const A = denseLaplacian(n, 'periodic');
      expect(isSymmetric(A)).toBe(true);
      expect(isSpd(A)).toBe(false);
      const ones = new Array(n).fill(1);
      closeVec(applyLaplacian(ones, 'periodic'), new Array(n).fill(0));
    }
  });

  it('Dirichlet constants are not in the kernel: walls pull the ends', () => {
    const n = 5;
    const ones = new Array(n).fill(1);
    const Au = applyLaplacian(ones, 'dirichlet');
    const { h } = laplacian1d(n, 'dirichlet');
    const s = 1 / (h * h);
    expect(Au[0]).toBeCloseTo(s, 12);
    expect(Au[n - 1]).toBeCloseTo(s, 12);
    for (let i = 1; i < n - 1; i++) expect(Au[i]).toBeCloseTo(0, 12);
  });
});

describe('Dirichlet spectrum matches the closed form', () => {
  it('λ_k = 4(n+1)² sin²(kπ / (2(n+1)))', () => {
    const n = 7;
    const A = denseLaplacian(n, 'dirichlet');
    const closed = dirichletEigenvalues(n);
    // Trace = sum of eigenvalues = n · (2/h²).
    const trace = A.reduce((s, row, i) => s + row[i]!, 0);
    const sum = closed.reduce((s, v) => s + v, 0);
    expect(sum).toBeCloseTo(trace, 8);
    expect(Math.min(...closed)).toBeGreaterThan(0);
    expect(Math.max(...closed) / Math.min(...closed)).toBeGreaterThan(1);
  });

  it('the sine mode is an approximate eigenvector with Rayleigh → π²', () => {
    const residual = (n: number) => {
      const op = laplacian1d(n, 'dirichlet');
      const u = sampleField('sine', op.x);
      const Au = applyLaplacian(u, 'dirichlet');
      return Math.abs(rayleigh(u, Au) - Math.PI ** 2);
    };
    expect(residual(8)).toBeGreaterThan(residual(32));
    expect(residual(40)).toBeLessThan(0.05);
  });
});
