import { describe, expect, it } from 'vitest';
import { applyLaplacian, laplacianGrid } from '../operator.ts';
import { norm2 } from '../types.ts';
import {
  DEMO_N,
  JACOBI_SMOOTH_OMEGA,
  MIXED_HIGH_K,
  MIXED_LOW_K,
  applySweeps,
  demoMixed,
  dirichletMode,
  gaussSeidelSpectralRadius,
  gaussSeidelSweep,
  itersToReduce,
  jacobiDamping,
  jacobiSmoothingFactor,
  jacobiSpectralRadius,
  jacobiSweep,
  modeCoeff,
  powerRadius,
  residual,
  sweepHistory,
  zeros,
} from '../iterative.ts';

const closeVec = (a: number[], b: number[], digits = 10) => {
  expect(a.length).toBe(b.length);
  for (let i = 0; i < a.length; i++) expect(a[i]).toBeCloseTo(b[i]!, digits);
};

describe('Jacobi sweep matches u ← u + ω D⁻¹ (f − Au)', () => {
  it('homogeneous and manufactured rhs, ω = 1 and ω = 2/3', () => {
    const n = 11;
    const { h } = laplacianGrid(n, 'dirichlet');
    const invD = (h * h) / 2;
    const exact = dirichletMode(n, 2);
    const f = applyLaplacian(exact, 'dirichlet');
    const u = exact.map((v, i) => v + 0.3 * dirichletMode(n, 5)[i]!);

    for (const omega of [1, JACOBI_SMOOTH_OMEGA]) {
      const r = residual(u, f);
      const matrixForm = u.map((ui, i) => ui + omega * invD * r[i]!);
      closeVec(jacobiSweep(u, f, omega), matrixForm, 12);
    }
  });

  it('residual is f − applyLaplacian(u)', () => {
    const n = 8;
    const u = dirichletMode(n, 3);
    const f = zeros(n);
    const r = residual(u, f);
    const Au = applyLaplacian(u, 'dirichlet');
    closeVec(r, Au.map((v) => -v), 12);
  });
});

describe('sine modes are Jacobi eigenvectors', () => {
  it('one sweep scales mode k by μ_k = 1 − 2ω sin²(kπ / (2(n+1)))', () => {
    const n = DEMO_N;
    const f = zeros(n);
    for (const omega of [1, JACOBI_SMOOTH_OMEGA]) {
      for (const k of [1, 4, MIXED_HIGH_K, n]) {
        const u = dirichletMode(n, k);
        const next = jacobiSweep(u, f, omega);
        const mu = jacobiDamping(k, n, omega);
        closeVec(next, u.map((v) => mu * v), 10);
        expect(modeCoeff(next, k)).toBeCloseTo(mu, 10);
      }
    }
  });

  it('a pure mode stays a pure mode: other DST coefficients stay at roundoff', () => {
    const n = 15;
    const u = dirichletMode(n, 4);
    const next = jacobiSweep(u, zeros(n), JACOBI_SMOOTH_OMEGA);
    for (let k = 1; k <= n; k++) {
      if (k === 4) continue;
      expect(Math.abs(modeCoeff(next, k))).toBeLessThan(1e-12);
    }
  });
});

describe('Jacobi spectral radius on this A', () => {
  it('undamped ρ = cos(π/(n+1))', () => {
    for (const n of [7, 15, DEMO_N]) {
      const closed = Math.cos(Math.PI / (n + 1));
      expect(jacobiSpectralRadius(n, 1)).toBeCloseTo(closed, 12);
      expect(Math.abs(jacobiDamping(1, n, 1))).toBeCloseTo(closed, 12);
      expect(Math.abs(jacobiDamping(n, n, 1))).toBeCloseTo(closed, 12);
    }
  });

  it('power iteration on homogeneous Jacobi recovers ρ', () => {
    const n = 15;
    expect(powerRadius(n, 'jacobi', 1, 60)).toBeCloseTo(jacobiSpectralRadius(n, 1), 3);
  });
});

describe('weighted Jacobi ω = 2/3 is a smoother, not a solver', () => {
  it('high-k |μ| ≤ 1/3 and low-k |μ| sits near 1', () => {
    const n = DEMO_N;
    expect(jacobiSmoothingFactor(n, JACOBI_SMOOTH_OMEGA)).toBeCloseTo(1 / 3, 8);
    expect(Math.abs(jacobiDamping(MIXED_HIGH_K, n, JACOBI_SMOOTH_OMEGA))).toBeCloseTo(1 / 3, 8);
    expect(Math.abs(jacobiDamping(n, n, JACOBI_SMOOTH_OMEGA))).toBeCloseTo(1 / 3, 2);
    expect(jacobiDamping(MIXED_LOW_K, n, JACOBI_SMOOTH_OMEGA)).toBeGreaterThan(0.99);
    expect(jacobiSpectralRadius(n, JACOBI_SMOOTH_OMEGA)).toBeGreaterThan(
      jacobiSpectralRadius(n, 1),
    );
  });

  it('high-mode decays, low-mode stalls, on the mixed start', () => {
    const n = DEMO_N;
    const u0 = demoMixed(n);
    const f = zeros(n);
    const c1 = Math.abs(modeCoeff(u0, MIXED_LOW_K));
    const c16 = Math.abs(modeCoeff(u0, MIXED_HIGH_K));

    const u5 = applySweeps(u0, f, 5, 'jacobi', JACOBI_SMOOTH_OMEGA);
    expect(Math.abs(modeCoeff(u5, MIXED_HIGH_K)) / c16).toBeLessThan(0.01);
    expect(Math.abs(modeCoeff(u5, MIXED_LOW_K)) / c1).toBeGreaterThan(0.95);

    const u50 = applySweeps(u0, f, 50, 'jacobi', JACOBI_SMOOTH_OMEGA);
    expect(Math.abs(modeCoeff(u50, MIXED_HIGH_K)) / c16).toBeLessThan(1e-10);
    expect(Math.abs(modeCoeff(u50, MIXED_LOW_K)) / c1).toBeGreaterThan(0.8);
    expect(norm2(u50) / norm2(u0)).toBeGreaterThan(0.7);
  });

  it('after a few sweeps the residual is the long wave, then barely moves', () => {
    const hist = sweepHistory(demoMixed(), zeros(DEMO_N), 40, 'jacobi', JACOBI_SMOOTH_OMEGA);
    expect(hist[5]!.res).toBeLessThan(0.02);
    expect(hist[5]!.high / hist[0]!.high).toBeLessThan(0.01);
    const late = hist[40]!.res / hist[10]!.res;
    expect(late).toBeGreaterThan(0.9);
    expect(late).toBeLessThan(1);
  });
});

describe('undamped Jacobi leaves the Nyquist mode', () => {
  it('|μ_n| ≈ 1 when ω = 1, and |μ_n| = 1/3 when ω = 2/3', () => {
    const n = DEMO_N;
    expect(Math.abs(jacobiDamping(n, n, 1))).toBeGreaterThan(0.99);
    expect(Math.abs(jacobiDamping(n, n, JACOBI_SMOOTH_OMEGA))).toBeCloseTo(1 / 3, 2);
  });
});

describe('Gauss–Seidel is a tighter beat of the same smoother', () => {
  it('ρ_GS = cos²(π/(n+1)) = ρ_J²', () => {
    for (const n of [7, 15, DEMO_N]) {
      const rhoJ = jacobiSpectralRadius(n, 1);
      expect(gaussSeidelSpectralRadius(n)).toBeCloseTo(rhoJ * rhoJ, 12);
    }
  });

  it('power iteration recovers ρ_GS', () => {
    const n = 15;
    expect(powerRadius(n, 'gauss-seidel', 1, 80)).toBeCloseTo(gaussSeidelSpectralRadius(n), 2);
  });

  it('five GS sweeps leave a smaller leftover than Jacobi, still the long wave', () => {
    const n = DEMO_N;
    const u0 = demoMixed(n);
    const f = zeros(n);
    const jac = applySweeps(u0, f, 5, 'jacobi', JACOBI_SMOOTH_OMEGA);
    const gs = applySweeps(u0, f, 5, 'gauss-seidel');
    expect(norm2(gs)).toBeLessThan(norm2(jac));
    // GS does not share A's sine eigenvectors, so a single c_16 is the
    // wrong meter. High-k energy still collapses; k = 1 still stalls.
    const highEnergy = (u: number[]) => {
      let s = 0;
      for (let k = MIXED_HIGH_K; k <= n; k++) s += modeCoeff(u, k) ** 2;
      return s;
    };
    expect(highEnergy(gs)).toBeLessThan(0.02 * highEnergy(u0));
    expect(Math.abs(modeCoeff(gs, MIXED_LOW_K))).toBeGreaterThan(0.7 * Math.abs(modeCoeff(u0, MIXED_LOW_K)));
  });

  it('one GS sweep uses the already-updated left neighbour', () => {
    const n = 5;
    const u = [0.2, 0.5, 0.1, -0.4, 0.3];
    const f = zeros(n);
    const gs = gaussSeidelSweep(u, f);
    const { h } = laplacianGrid(n, 'dirichlet');
    const h2 = h * h;
    expect(gs[0]).toBeCloseTo((0 + u[1]! + h2 * f[0]!) / 2, 12);
    expect(gs[1]).toBeCloseTo((gs[0]! + u[2]! + h2 * f[1]!) / 2, 12);
  });
});

describe('iters-to-reduce is the spectral-radius count', () => {
  it('undamped Jacobi on n = 31 needs hundreds of sweeps to cut k = 1 by 10×', () => {
    const rho = jacobiSpectralRadius(DEMO_N, 1);
    const nSweeps = itersToReduce(rho, 0.1);
    expect(nSweeps).toBeGreaterThan(400);
    expect(nSweeps).toBeLessThan(600);
    const mu = jacobiDamping(1, DEMO_N, 1);
    expect(Math.abs(mu) ** nSweeps).toBeCloseTo(0.1, 8);
  });
});
