import { describe, expect, it } from 'vitest';
import { applyLaplacian, dot, isSpd, isSymmetric } from '../operator.ts';
import { norm2 } from '../types.ts';
import { dirichletPoisson, residualOf } from '../iterative.ts';
import { lstsqQR } from '../qr.ts';
import {
  DEMO_RESTART,
  DEMO_WIND,
  GMRES_N,
  ROTATION_BREAK_THETA,
  applyConvectionDiffusion,
  applyDense,
  arnoldiRelationError,
  basisGramError,
  cgAttempt,
  cellPeclet,
  convectionProblem,
  denseConvectionDiffusion,
  gmres,
  gmresHistory,
  gmresStepsUntil,
  hessenbergLstsqResidual,
  restartNeeded,
  rotationScale,
} from '../gmres.ts';

const spdApply = (u: number[]) => applyLaplacian(u, 'dirichlet');

describe('convection–diffusion is the Laplacian plus wind', () => {
  it('wind = 0 matches the Dirichlet Laplacian stencil', () => {
    const n = 7;
    const { b } = dirichletPoisson(n, 'mixed');
    const applyC = applyConvectionDiffusion(0);
    for (const u of [b, b.map((v, i) => v + 0.1 * i)]) {
      const a = spdApply(u);
      const c = applyC(u);
      for (let i = 0; i < n; i++) expect(c[i]).toBeCloseTo(a[i]!, 12);
    }
  });

  it('wind ≠ 0 is nonsymmetric and not SPD; symmetric part is still SPD', () => {
    const A0 = denseConvectionDiffusion(8, 0);
    const A = denseConvectionDiffusion(8, DEMO_WIND);
    expect(isSymmetric(A0)).toBe(true);
    expect(isSpd(A0)).toBe(true);
    expect(isSymmetric(A)).toBe(false);
    expect(isSpd(A)).toBe(false);
    const sym = A.map((row, i) => row.map((v, j) => 0.5 * (v + A[j]![i]!)));
    expect(isSpd(sym)).toBe(true);
    expect(cellPeclet(8, DEMO_WIND)).toBeGreaterThan(1);
  });
});

describe('GMRES residual decreases', () => {
  it('full GMRES ‖r‖₂ is monotone on the windy n = 16 problem', () => {
    const { applyA, b } = convectionProblem(GMRES_N, DEMO_WIND);
    const hist = gmresHistory(applyA, b, GMRES_N);
    expect(hist).toHaveLength(GMRES_N + 1);
    for (let k = 1; k < hist.length; k++) {
      expect(hist[k]!.residualNorm).toBeLessThanOrEqual(hist[k - 1]!.residualNorm + 1e-12);
    }
    expect(hist[GMRES_N]!.residualNorm).toBeLessThan(1e-10);
  });

  it('Givens residual matches the true ‖b − Ax‖₂', () => {
    const { applyA, b } = convectionProblem(8, DEMO_WIND);
    const hist = gmresHistory(applyA, b, 8);
    for (const s of hist) {
      const trueR = norm2(residualOf(applyA, s.x, b));
      expect(s.residualNorm).toBeCloseTo(trueR, 8);
    }
  });

  it('restarted residual is also monotone, and worse than full at the same k', () => {
    const { applyA, b } = convectionProblem(GMRES_N, DEMO_WIND);
    const full = gmresHistory(applyA, b, GMRES_N);
    const rest = gmresHistory(applyA, b, GMRES_N, DEMO_RESTART);
    for (let k = 1; k <= GMRES_N; k++) {
      expect(rest[k]!.residualNorm).toBeLessThanOrEqual(rest[k - 1]!.residualNorm + 1e-12);
      expect(full[k]!.residualNorm).toBeLessThanOrEqual(rest[k]!.residualNorm + 1e-8);
    }
    expect(rest[GMRES_N]!.residualNorm).toBeGreaterThan(1e-6);
    expect(full[GMRES_N]!.residualNorm).toBeLessThan(1e-10);
  });
});

describe('on SPD, GMRES and CG share the plane and finish together', () => {
  it('at each k, GMRES Euclidean residual is ≤ CG residual', () => {
    const { b } = dirichletPoisson(8, 'mixed');
    const cg = cgAttempt(spdApply, b, 8);
    const gm = gmresHistory(spdApply, b, 8);
    expect(cg).toHaveLength(9);
    expect(gm).toHaveLength(9);
    for (let k = 0; k <= 8; k++) {
      expect(gm[k]!.residualNorm).toBeLessThanOrEqual(cg[k]!.residualNorm + 1e-10);
    }
  });

  it('at k = n both residuals sit at roundoff, so they match', () => {
    const { b } = dirichletPoisson(8, 'mixed');
    const cg = cgAttempt(spdApply, b, 8);
    const gm = gmresHistory(spdApply, b, 8);
    expect(cg[8]!.residualNorm).toBeLessThan(1e-10);
    expect(gm[8]!.residualNorm).toBeLessThan(1e-10);
    expect(Math.abs(gm[8]!.residualNorm - cg[8]!.residualNorm)).toBeLessThan(1e-10);
  });

  it('n = 16 Dirichlet Poisson: both at roundoff at k = n', () => {
    const { b } = dirichletPoisson(16, 'mixed');
    const cg = cgAttempt(spdApply, b, 16);
    const gm = gmresHistory(spdApply, b, 16);
    expect(cg[16]!.residualNorm).toBeLessThan(1e-10);
    expect(gm[16]!.residualNorm).toBeLessThan(1e-10);
  });
});

describe('on nonsymmetric A, CG fails or is slower', () => {
  it('2×2 rotation: CG residual explodes; GMRES finishes in 2 steps', () => {
    const A = rotationScale(ROTATION_BREAK_THETA);
    expect(isSpd(A)).toBe(false);
    expect(isSymmetric(A)).toBe(false);
    const applyA = applyDense(A);
    const b = [1, 0];
    const cg = cgAttempt(applyA, b, 2);
    const gm = gmresHistory(applyA, b, 2);
    expect(cg[2]!.residualNorm).toBeGreaterThan(1e6);
    expect(gm[2]!.residualNorm).toBeLessThan(1e-12);
  });

  it('n = 16 convection: CG residual at k = n is still large; GMRES is not', () => {
    const { applyA, b } = convectionProblem(GMRES_N, DEMO_WIND);
    const cg = cgAttempt(applyA, b, GMRES_N);
    const gm = gmresHistory(applyA, b, GMRES_N);
    const lastCg = cg[cg.length - 1]!;
    expect(lastCg.residualNorm).toBeGreaterThan(1e-2 * gm[0]!.residualNorm);
    expect(gm[GMRES_N]!.residualNorm).toBeLessThan(1e-10);
    expect(gm[GMRES_N]!.residualNorm).toBeLessThan(1e-4 * lastCg.residualNorm);
  });
});

describe('Arnoldi Hessenberg and QR of Ā', () => {
  it('V is orthonormal and A V ≈ V₊ H', () => {
    const { applyA, b } = convectionProblem(8, DEMO_WIND);
    const hist = gmresHistory(applyA, b, 6);
    for (const s of hist.filter((h) => h.k >= 1)) {
      expect(basisGramError(s.V)).toBeLessThan(1e-10);
      expect(arnoldiRelationError(applyA, s)).toBeLessThan(1e-10);
      expect(s.H.length).toBe(s.k + 1);
      expect(s.H[0]!.length).toBe(s.k);
      for (let i = 0; i < s.H.length; i++) {
        for (let j = 0; j < s.k; j++) {
          if (i > j + 1) expect(s.H[i]![j]).toBe(0);
        }
      }
    }
  });

  it('r_k is Euclidean-orthogonal to A K_k', () => {
    const { applyA, b } = convectionProblem(8, 12);
    const hist = gmresHistory(applyA, b, 6);
    for (const s of hist) {
      if (s.k < 1 || s.residualNorm < 1e-14) continue;
      for (const v of s.V) {
        const Av = applyA(v);
        const scale = s.residualNorm * norm2(Av) + 1e-18;
        expect(Math.abs(dot(s.r, Av))).toBeLessThan(1e-7 * scale);
      }
    }
  });

  it('Hessenberg least squares matches Householder QR from qr.ts', () => {
    const { applyA, b } = convectionProblem(8, 12);
    const hist = gmresHistory(applyA, b, 5);
    const beta = hist[0]!.residualNorm;
    for (const s of hist.filter((h) => h.k >= 1)) {
      const qrR = hessenbergLstsqResidual(s, beta);
      expect(qrR).toBeCloseTo(s.residualNorm, 8);
      const rhs = new Array(s.k + 1).fill(0);
      rhs[0] = beta;
      const y = lstsqQR(s.H, rhs);
      expect(y).not.toBeNull();
    }
  });
});

describe('memory vs restart', () => {
  it('full GMRES stores k vectors at step k; GMRES(m) stores at most m', () => {
    const { applyA, b } = convectionProblem(GMRES_N, DEMO_WIND);
    const full = gmresHistory(applyA, b, 12);
    const rest = gmresHistory(applyA, b, 12, DEMO_RESTART);
    for (const s of full) expect(s.stored).toBe(s.k);
    for (const s of rest) expect(s.stored).toBeLessThanOrEqual(DEMO_RESTART);
    expect(rest[12]!.stored).toBe(DEMO_RESTART);
    const restarts = rest.filter((s) => s.restarted);
    expect(restarts.length).toBeGreaterThan(0);
  });

  it('GMRES(4) after 40 steps still stores 4 vectors', () => {
    const { applyA, b } = convectionProblem(GMRES_N, DEMO_WIND);
    const hist = gmres(applyA, b, { maxIter: 40, restart: 4 });
    expect(hist[40]!.stored).toBe(4);
  });

  it('the restart length that first hits 10⁻⁵ at k = 16 is 11, not 4', () => {
    const { applyA, b } = convectionProblem(GMRES_N, DEMO_WIND);
    expect(restartNeeded(applyA, b, 1e-5, 16)).toBe(11);
    expect(gmresStepsUntil(applyA, b, 1e-8, 16)).toBeLessThanOrEqual(16);
    expect(gmresStepsUntil(applyA, b, 1e-8, 16, DEMO_RESTART)).toBe(17);
  });
});
