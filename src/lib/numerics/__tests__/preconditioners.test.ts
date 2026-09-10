import { describe, expect, it } from 'vitest';
import { applyLaplacian, denseLaplacian, dirichletEigenvalues, isSpd } from '../operator.ts';
import { norm2, sub } from '../types.ts';
import {
  applyJacobiM,
  applyJacobiMinv,
  applyM,
  applyMinv,
  applySsorM,
  applySsorMinv,
  cgHistory,
  cgStepsUntil,
  dirichletKappa,
  dirichletPoisson,
  hashedField,
  kappaFromEvals,
  pcgHistory,
  pcgStepsUntil,
  poissonExact,
  preconditionedCg,
  preconditionedEigenvalues,
  preconditionedKappa,
  ssorOmega,
  ssorOmegaMinKappa,
  symmetricEigenvalues,
} from '../iterative.ts';

/* Pedagogical claims of the preconditioners lesson. If the lesson says
   κ(M⁻¹A) < κ(A) for SSOR, that Jacobi is a scale on this Laplacian, or
   that PCG takes fewer steps than CG, this file pins it. */

const applyA = (u: number[]) => applyLaplacian(u, 'dirichlet');

const closeVec = (a: number[], b: number[], digits = 10) => {
  expect(a.length).toBe(b.length);
  for (let i = 0; i < a.length; i++) expect(a[i]).toBeCloseTo(b[i]!, digits);
};

describe('Jacobi / SSOR apply as operators, not recipes', () => {
  it('M⁻¹ M = I for Jacobi and SSOR', () => {
    const n = 11;
    const v = hashedField(n, 4);
    closeVec(applyJacobiMinv(applyJacobiM(v)), v, 12);
    for (const w of [1, ssorOmega(n), 1.5]) {
      closeVec(applySsorMinv(applySsorM(v, w), w), v, 10);
    }
  });

  it('Jacobi M is the constant diagonal 2/h²', () => {
    const n = 8;
    const { h } = dirichletPoisson(n);
    const d = 2 / (h * h);
    const v = hashedField(n, 2);
    closeVec(applyJacobiM(v), v.map((x) => d * x), 12);
  });

  it('SSOR M is SPD for ω in (0, 2)', () => {
    const n = 7;
    for (const w of [0.5, 1, ssorOmega(n), 1.7]) {
      const M = Array.from({ length: n }, (_, j) => {
        const e = new Array(n).fill(0);
        e[j] = 1;
        return applyM('ssor', e, w);
      });
      // columns → rows
      const dense = Array.from({ length: n }, (_, i) => M.map((col) => col[i]!));
      expect(isSpd(dense)).toBe(true);
    }
  });
});

describe('cyclic Jacobi recovers the Dirichlet spectrum', () => {
  it('symmetricEigenvalues(A) matches the closed-form sine eigenvalues', () => {
    for (const n of [4, 8, 16]) {
      const ev = symmetricEigenvalues(denseLaplacian(n, 'dirichlet'));
      const exact = dirichletEigenvalues(n);
      expect(ev.length).toBe(n);
      for (let i = 0; i < n; i++) {
        expect(ev[i]).toBeCloseTo(exact[i]!, 6);
      }
    }
  });
});

describe('κ(M⁻¹A) vs κ(A) on this Laplacian', () => {
  it('point Jacobi is a scale, so κ(D⁻¹A) = κ(A)', () => {
    for (const n of [8, 16, 31]) {
      const kA = dirichletKappa(n);
      const kJ = preconditionedKappa(n, 'jacobi');
      expect(Math.abs(kJ - kA) / kA).toBeLessThan(1e-8);
    }
  });

  it('Jacobi-preconditioned eigenvalues are λ_k(A) / (2/h²)', () => {
    const n = 12;
    const { h } = dirichletPoisson(n);
    const d = 2 / (h * h);
    const ev = preconditionedEigenvalues(n, 'jacobi');
    const exact = dirichletEigenvalues(n).map((l) => l / d);
    for (let i = 0; i < n; i++) expect(ev[i]).toBeCloseTo(exact[i]!, 8);
  });

  it('SSOR bunches: κ(M⁻¹A) is smaller than κ(A)', () => {
    for (const n of [8, 16, 31]) {
      const kA = dirichletKappa(n);
      const kS = preconditionedKappa(n, 'ssor');
      expect(kS).toBeLessThan(kA);
      expect(kS).toBeLessThan(0.12 * kA);
      expect(kS).toBeGreaterThan(1);
    }
  });

  it('n = 16: κ(A) ≈ 116, κ(SSOR⁻¹A) ≈ 6', () => {
    expect(dirichletKappa(16)).toBeGreaterThan(100);
    expect(dirichletKappa(16)).toBeLessThan(130);
    expect(preconditionedKappa(16, 'ssor')).toBeGreaterThan(4);
    expect(preconditionedKappa(16, 'ssor')).toBeLessThan(8);
  });

  it('SSOR spectrum sits closer to 1 than A does', () => {
    const n = 16;
    const evA = dirichletEigenvalues(n);
    const evS = preconditionedEigenvalues(n, 'ssor');
    const spread = (ev: number[]) => Math.max(...ev) / Math.min(...ev);
    expect(spread(evS)).toBeLessThan(spread(evA));
    const mid = evS.filter((l) => l > 0.3 && l < 1.8).length;
    expect(mid).toBeGreaterThan(n / 2);
  });
});

describe('PCG takes fewer steps than CG', () => {
  it('Jacobi-PCG matches CG: D is a scale, so the recurrence is the same', () => {
    const { b } = dirichletPoisson(12, 'mixed');
    const cg = cgHistory(b, 12);
    const pcg = pcgHistory(b, 12, 'jacobi');
    for (let k = 0; k <= 12; k++) {
      expect(pcg[k]!.residualNorm).toBeCloseTo(cg[k]!.residualNorm, 8);
    }
  });

  it('SSOR-PCG reaches 10⁻⁸ in fewer steps than CG on n = 16', () => {
    const { b } = dirichletPoisson(16, 'mixed');
    const kCg = cgStepsUntil(b, 1e-8, 16);
    const kPcg = pcgStepsUntil(b, 1e-8, 16, 'ssor');
    expect(kPcg).toBe(7);
    expect(kCg).toBe(16);
  });

  it('at every k ≥ 1, SSOR-PCG residual is below CG on n = 16', () => {
    const { b } = dirichletPoisson(16, 'mixed');
    const cg = cgHistory(b, 12);
    const pcg = pcgHistory(b, 12, 'ssor');
    for (let k = 1; k <= 12; k++) {
      expect(pcg[k]!.residualNorm).toBeLessThan(cg[k]!.residualNorm);
    }
  });

  it('SSOR-PCG still hits the Poisson solution (same x*)', () => {
    const { b } = dirichletPoisson(8, 'mixed');
    const xStar = poissonExact(b);
    const pcg = pcgHistory(b, 8, 'ssor');
    expect(norm2(sub(pcg[8]!.x, xStar))).toBeLessThan(1e-8 * Math.max(1, norm2(xStar)));
  });
});

describe('PCG is CG on the split-preconditioned operator', () => {
  it('preconditionedCg with M = I recovers conjugateGradient', () => {
    const { b } = dirichletPoisson(6, 'mixed');
    const identity = (v: number[]) => v.slice();
    const cg = cgHistory(b, 6);
    const pcg = preconditionedCg(applyA, identity, b, { maxIter: 6 });
    for (let k = 0; k <= 6; k++) {
      expect(pcg[k]!.residualNorm).toBeCloseTo(cg[k]!.residualNorm, 10);
    }
  });
});

describe('SSOR ω that minimises κ sits near the SOR optimum', () => {
  it('the scanned minimiser is within 0.25 of 2/(1+sin(π/(n+1)))', () => {
    const n = 16;
    const wStar = ssorOmegaMinKappa(n, 36);
    const wSor = ssorOmega(n);
    expect(Math.abs(wStar - wSor)).toBeLessThan(0.25);
    expect(preconditionedKappa(n, 'ssor', wStar)).toBeLessThan(
      preconditionedKappa(n, 'ssor', 1),
    );
  });
});

describe('kappaFromEvals is λmax/λmin of the positive ones', () => {
  it('matches the closed-form Dirichlet κ', () => {
    const n = 16;
    const ev = dirichletEigenvalues(n);
    const closed = ev[n - 1]! / ev[0]!;
    expect(dirichletKappa(n)).toBeCloseTo(closed, 12);
    expect(kappaFromEvals(ev)).toBeCloseTo(closed, 12);
  });
});
