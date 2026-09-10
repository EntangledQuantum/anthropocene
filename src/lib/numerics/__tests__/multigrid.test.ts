import { describe, expect, it } from 'vitest';
import { applyLaplacian, denseLaplacian, dot } from '../operator.ts';
import { norm2 } from '../types.ts';
import {
  DEMO_N,
  JACOBI_SMOOTH_OMEGA,
  MIXED_HIGH_K,
  MIXED_LOW_K,
  applySweeps,
  demoMixed,
  dirichletMode,
  hashedField,
  itersToReduce,
  jacobiSpectralRadius,
  modeCoeff,
  residual,
  zeros,
} from '../iterative.ts';
import {
  MG_FINE_N,
  MG_POST,
  MG_PRE,
  applyCoarseLaplacian,
  applyGalerkin,
  coarseGridCorrection,
  coarseSize,
  coarseSolve,
  jacobiWorkReduction,
  prolong,
  restrict,
  twoGridCycle,
  twoGridCyclesUntil,
  twoGridReduction,
  vcycle,
} from '../multigrid.ts';

const closeVec = (a: number[], b: number[], digits = 10) => {
  expect(a.length).toBe(b.length);
  for (let i = 0; i < a.length; i++) expect(a[i]).toBeCloseTo(b[i]!, digits);
};

describe('grid hierarchy', () => {
  it('n = 31 coarsens to 15, then 7, 3, 1', () => {
    expect(MG_FINE_N).toBe(DEMO_N);
    expect(coarseSize(31)).toBe(15);
    expect(coarseSize(15)).toBe(7);
    expect(coarseSize(7)).toBe(3);
    expect(coarseSize(3)).toBe(1);
  });
});

describe('restriction is the adjoint of prolongation', () => {
  it('R = (1/2) Pᵀ: 2 ⟨R f, c⟩ = ⟨f, P c⟩ on n = 3, 7, 15, 31', () => {
    for (const n of [3, 7, 15, 31]) {
      const nc = coarseSize(n);
      const f = hashedField(n, 11);
      const c = hashedField(nc, 19);
      expect(2 * dot(restrict(f), c)).toBeCloseTo(dot(f, prolong(c)), 10);
    }
  });

  it('the 1×1 picture: P(1) = (1/2, 1, 1/2) and R is full weighting', () => {
    closeVec(prolong([1]), [0.5, 1, 0.5], 12);
    expect(restrict([4, 8, 12])[0]).toBeCloseTo(0.25 * 4 + 0.5 * 8 + 0.25 * 12, 12);
  });

  it('linear interpolation reproduces a coarse hat at coinciding nodes', () => {
    const c = [0.3, 1, -0.4];
    const fine = prolong(c);
    expect(fine[1]).toBeCloseTo(0.3, 12);
    expect(fine[3]).toBeCloseTo(1, 12);
    expect(fine[5]).toBeCloseTo(-0.4, 12);
    expect(fine[2]).toBeCloseTo(0.65, 12);
    expect(fine[0]).toBeCloseTo(0.15, 12);
  });
});

describe('Galerkin identity', () => {
  it('R A^h P equals the geometric coarse Laplacian A^{2h}', () => {
    for (const n of [3, 7, 15, 31]) {
      const nc = coarseSize(n);
      const e = hashedField(nc, 5);
      closeVec(applyGalerkin(e), applyCoarseLaplacian(e), 8);
    }
  });

  it('n = 3: R A P is the 1×1 coarse stencil 2/H² = 8', () => {
    const Ac = denseLaplacian(1, 'dirichlet');
    expect(Ac[0]![0]).toBeCloseTo(8, 12);
    expect(applyGalerkin([1])[0]).toBeCloseTo(8, 12);
  });
});

describe('coarse-grid correction kills the leftover long wave', () => {
  it('five Jacobi sweeps then CGC: |c_1| drops >10×; five more Jacobi barely move it', () => {
    const n = MG_FINE_N;
    const f = zeros(n);
    const u0 = demoMixed(n);
    const c1 = Math.abs(modeCoeff(u0, MIXED_LOW_K));
    const c16 = Math.abs(modeCoeff(u0, MIXED_HIGH_K));

    const smoothed = applySweeps(u0, f, 5, 'jacobi', JACOBI_SMOOTH_OMEGA);
    expect(Math.abs(modeCoeff(smoothed, MIXED_HIGH_K)) / c16).toBeLessThan(0.01);
    expect(Math.abs(modeCoeff(smoothed, MIXED_LOW_K)) / c1).toBeGreaterThan(0.95);

    const corrected = coarseGridCorrection(smoothed, f);
    expect(Math.abs(modeCoeff(corrected, MIXED_LOW_K)) / c1).toBeLessThan(0.1);
    expect(norm2(corrected) / norm2(smoothed)).toBeLessThan(0.15);

    const moreJacobi = applySweeps(smoothed, f, 5, 'jacobi', JACOBI_SMOOTH_OMEGA);
    expect(Math.abs(modeCoeff(moreJacobi, MIXED_LOW_K)) / Math.abs(modeCoeff(smoothed, MIXED_LOW_K)))
      .toBeGreaterThan(0.95);
  });

  it('a pure k = 1 sine is almost in range(P), so CGC nearly annihilates it', () => {
    const n = MG_FINE_N;
    const u = dirichletMode(n, 1);
    const next = coarseGridCorrection(u, zeros(n));
    expect(norm2(next) / norm2(u)).toBeLessThan(0.05);
  });
});

describe('skip-smoothing: the ripple is invisible to the coarse grid', () => {
  it('k = 16 is in ker(R): full weighting of its residual is roundoff', () => {
    const n = MG_FINE_N;
    const u = dirichletMode(n, MIXED_HIGH_K);
    const r = residual(u, zeros(n));
    expect(norm2(restrict(r)) / norm2(r)).toBeLessThan(1e-12);
  });

  it('a nearby high mode aliases: restricted residual of k = 24 is not small, and CGC amplifies it', () => {
    const n = MG_FINE_N;
    const u = dirichletMode(n, 24);
    const r = residual(u, zeros(n));
    expect(norm2(restrict(r)) / norm2(r)).toBeGreaterThan(0.05);
    const after = coarseGridCorrection(u, zeros(n));
    expect(norm2(after) / norm2(u)).toBeGreaterThan(1);
  });

  it('CGC without smoothing leaves the mixed ripple; pre-smoothed CGC does not', () => {
    const n = MG_FINE_N;
    const f = zeros(n);
    const u0 = demoMixed(n);
    const c16 = Math.abs(modeCoeff(u0, MIXED_HIGH_K));

    const skipped = coarseGridCorrection(u0, f);
    expect(Math.abs(modeCoeff(skipped, MIXED_HIGH_K)) / c16).toBeGreaterThan(0.3);
    expect(Math.abs(modeCoeff(skipped, MIXED_LOW_K))).toBeLessThan(0.01);

    const smoothed = applySweeps(u0, f, 5, 'jacobi', JACOBI_SMOOTH_OMEGA);
    const honest = coarseGridCorrection(smoothed, f);
    expect(Math.abs(modeCoeff(honest, MIXED_HIGH_K)) / c16).toBeLessThan(0.01);
  });
});

describe('two-grid residual drop is much weaker in n than Jacobi', () => {
  const opts = { pre: MG_PRE, post: MG_POST, omega: JACOBI_SMOOTH_OMEGA };

  it('one cycle from hashed: error factor stays O(1) from n = 15 to n = 63', () => {
    const r15 = twoGridReduction(15, opts);
    const r31 = twoGridReduction(31, opts);
    const r63 = twoGridReduction(63, opts);
    for (const r of [r15, r31, r63]) {
      expect(r.err).toBeLessThan(0.25);
      expect(r.err).toBeGreaterThan(1e-4);
    }
    expect(r63.err / r15.err).toBeLessThan(3);
    expect(r63.err / r15.err).toBeGreaterThan(1 / 3);
    expect(r31.res).toBeLessThan(0.3);
  });

  it('on the leftover sine, Jacobi remaining error marches to 1 with n; two-grid does not', () => {
    const factor = (n: number, kind: 'tg' | 'jac') => {
      const u0 = dirichletMode(n, 1);
      const f = zeros(n);
      const u1 = kind === 'tg'
        ? twoGridCycle(u0, f, opts)
        : applySweeps(u0, f, MG_PRE + MG_POST, 'jacobi', JACOBI_SMOOTH_OMEGA);
      return norm2(u1) / norm2(u0);
    };
    const tg15 = factor(15, 'tg');
    const tg63 = factor(63, 'tg');
    const j15 = factor(15, 'jac');
    const j63 = factor(63, 'jac');
    expect(tg15).toBeLessThan(0.02);
    expect(tg63).toBeLessThan(tg15);
    expect(j15).toBeGreaterThan(0.9);
    expect(j63).toBeGreaterThan(j15);
    expect(j63).toBeGreaterThan(0.99);
    const jac = jacobiWorkReduction(63, opts);
    expect(jac.err).toBeGreaterThan(0.3);
    expect(jac.err).toBeGreaterThan(twoGridReduction(63, opts).err * 4);
  });

  it('cycles to cut hashed error 10× stay O(1); undamped Jacobi on k = 1 grows like n²', () => {
    const c15 = twoGridCyclesUntil(15, 0.1);
    const c31 = twoGridCyclesUntil(31, 0.1);
    const c63 = twoGridCyclesUntil(63, 0.1);
    expect(c15).toBeLessThanOrEqual(2);
    expect(c31).toBeLessThanOrEqual(2);
    expect(c63).toBeLessThanOrEqual(2);

    const j15 = itersToReduce(jacobiSpectralRadius(15, 1), 0.1);
    const j31 = itersToReduce(jacobiSpectralRadius(31, 1), 0.1);
    const j63 = itersToReduce(jacobiSpectralRadius(63, 1), 0.1);
    expect(j31 / j15).toBeGreaterThan(3);
    expect(j63 / j31).toBeGreaterThan(3);
    expect(j31).toBeGreaterThan(100);
  });
});

describe('nested V-cycle is two-grid applied to the coarse problem', () => {
  it('on two levels (n = 3) V-cycle matches two-grid', () => {
    const n = 3;
    const u0 = hashedField(n, 3);
    const f = zeros(n);
    closeVec(vcycle(u0, f), twoGridCycle(u0, f), 10);
  });

  it('V-cycle residual drop is also weakly dependent on n', () => {
    const factor = (n: number) => {
      const u0 = hashedField(n, 3);
      const f = zeros(n);
      const u1 = vcycle(u0, f);
      return norm2(u1) / norm2(u0);
    };
    const a = factor(15);
    const b = factor(63);
    expect(a).toBeLessThan(0.2);
    expect(b).toBeLessThan(0.2);
    expect(b / a).toBeLessThan(3);
  });
});

describe('coarse solve is the stencil Poisson', () => {
  it('A_c e_c = r_c to working precision', () => {
    const rc = hashedField(15, 8);
    const ec = coarseSolve(rc);
    closeVec(applyLaplacian(ec, 'dirichlet'), rc, 8);
  });
});
