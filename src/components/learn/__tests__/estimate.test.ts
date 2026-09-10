import { describe, expect, it } from 'vitest';
import { ESTIMATE_SCENARIOS } from '../estimate-scenarios.ts';

/* The lesson prose quotes these numbers. If the numerics change and the
   quoted figures drift, the lesson starts asserting something false — so the
   claims are pinned here rather than trusted. AGENTS.md §9. */

describe('estimate scenarios agree with the prose that quotes them', () => {
  it('forward Euler needs ~8e4 evaluations for 1e-6 ("around 84,000")', () => {
    const t = ESTIMATE_SCENARIOS['euler-work-1e6'].truth();
    expect(t).toBeGreaterThan(4e4);
    expect(t).toBeLessThan(2e5);
  });

  it('RK4 needs under a hundred for the same target ("about 83")', () => {
    const t = ESTIMATE_SCENARIOS['rk4-work-1e6'].truth();
    expect(t).toBeGreaterThan(40);
    expect(t).toBeLessThan(200);
  });

  it('Euler costs roughly a thousandfold more than RK4 for the same answer', () => {
    const euler = ESTIMATE_SCENARIOS['euler-work-1e6'].truth();
    const rk4 = ESTIMATE_SCENARIOS['rk4-work-1e6'].truth();
    const ratio = euler / rk4;
    expect(ratio).toBeGreaterThan(200);
    expect(ratio).toBeLessThan(20_000);
  });

  it('a double carries ~16 significant decimal digits', () => {
    const t = ESTIMATE_SCENARIOS['double-digits'].truth();
    expect(t).toBeGreaterThan(15);
    expect(t).toBeLessThan(17);
  });

  it('the ill-conditioned 2×2 keeps about 7 digits, not 16', () => {
    const t = ESTIMATE_SCENARIOS['ill-2x2-digits'].truth();
    expect(t).toBeGreaterThan(6);
    expect(t).toBeLessThan(8.5);
  });

  it('e^{sin x} needs a dozen Fourier modes for 10^{-12} ("Twelve")', () => {
    expect(ESTIMATE_SCENARIOS['spec-modes-for-eps'].truth()).toBe(12);
  });

  it('four adjoint steps from 0.5 toward 2 leave |λ−2| around 0.014', () => {
    const t = ESTIMATE_SCENARIOS['ad-recovered-lambda'].truth();
    expect(t).toBeGreaterThan(0.005);
    expect(t).toBeLessThan(0.04);
  });

  it('RK4 on vec(R) leaves SO(3) by about 6e-4 at h = 0.2, t = 24', () => {
    const t = ESTIMATE_SCENARIOS['cons-rk4-ortho'].truth();
    expect(t).toBeGreaterThan(2e-4);
    expect(t).toBeLessThan(2e-3);
  });

  it('heat FTCS on 200 cells of [0,1] has max Δt = 1.25×10⁻⁵', () => {
    expect(ESTIMATE_SCENARIOS['cfl-heat-dt-n200'].truth()).toBeCloseTo(1.25e-5, 12);
  });

  it('naive Neumann error is ~70× the ghost error on 32 intervals', () => {
    const t = ESTIMATE_SCENARIOS['ghost-naive-ratio-n32'].truth();
    expect(t).toBeGreaterThan(40);
    expect(t).toBeLessThan(120);
  });

  it('skip-neighbour FD is ~30× worse than FEM in L² on 8 Chebyshev elements', () => {
    const t = ESTIMATE_SCENARIOS['fem-fd-l2-ratio'].truth();
    expect(t).toBeGreaterThan(15);
    expect(t).toBeLessThan(50);
  });

  it('spectral Helmholtz leftover max|div| is roundoff, not 10⁻³', () => {
    const t = ESTIMATE_SCENARIOS['proj-leftover-div'].truth();
    expect(t).toBeLessThan(1e-10);
    expect(t).toBeGreaterThan(0);
  });

  it('PIC opposing-pair transfer leaves KE = 1/16', () => {
    expect(ESTIMATE_SCENARIOS['mpm-pic-ke'].truth()).toBeCloseTo(0.0625, 12);
  });

  it('Burgers 1|0 shock speed is 1/2 by Rankine–Hugoniot', () => {
    expect(ESTIMATE_SCENARIOS['fvm-burgers-shock-speed'].truth()).toBeCloseTo(0.5, 12);
  });

  it('1D Dirichlet Laplacian on 200 unknowns has nnz = 3n−2 = 598', () => {
    expect(ESTIMATE_SCENARIOS['op-laplacian-nnz-n200'].truth()).toBe(598);
  });

  it('undamped Jacobi on n = 31 needs ~477 sweeps to cut k = 1 by 10×', () => {
    const t = ESTIMATE_SCENARIOS['jac-iters-tenth'].truth();
    expect(t).toBeGreaterThan(400);
    expect(t).toBeLessThan(600);
  });

  it('Jacobi needs a couple of hundred sweeps to hit 10⁻⁶ on n = 8 Poisson; CG does it in 8', () => {
    const t = ESTIMATE_SCENARIOS['cg-jacobi-to-1e-6'].truth();
    expect(t).toBeGreaterThan(150);
    expect(t).toBeLessThan(300);
  });

  it('SSOR-PCG hits 10⁻⁸ in 7 steps on n = 16; CG waits until step 16', () => {
    expect(ESTIMATE_SCENARIOS['pc-ssor-steps-1e-8'].truth()).toBe(7);
  });

  it('two-grid residual ratio n = 63 vs n = 15 is O(1), not n²', () => {
    const t = ESTIMATE_SCENARIOS['mg-ratio-vs-n'].truth();
    expect(t).toBeGreaterThan(0.3);
    expect(t).toBeLessThan(3);
  });

  it('κ₂(AᵀA) for the ε = 10⁻⁸ pair is ~2×10¹⁶, not κ(A)', () => {
    const t = ESTIMATE_SCENARIOS['qr-kappa-ata'].truth();
    expect(t).toBeGreaterThan(1e16);
    expect(t).toBeLessThan(3e16);
  });

  it('Newton from x₀ = 0.2 hits |F| < 10⁻¹² in four steps', () => {
    expect(ESTIMATE_SCENARIOS['nt-steps-to-eps'].truth()).toBe(4);
  });

  it('rank-2 leftover of the 8×8 picture is σ₃ = 0.4, not σ₁', () => {
    expect(ESTIMATE_SCENARIOS['svd-rank2-residual'].truth()).toBeCloseTo(0.4, 8);
  });

  it('GMRES(4) still stores 4 vectors after 40 steps, not 40', () => {
    expect(ESTIMATE_SCENARIOS['gm-stored-restart'].truth()).toBe(4);
  });

  it('cold-plasma k=1 period sits near 2π, not 1 and not π', () => {
    const t = ESTIMATE_SCENARIOS['pic-plasma-period'].truth();
    expect(t).toBeGreaterThan(0.9 * 2 * Math.PI);
    expect(t).toBeLessThan(1.1 * 2 * Math.PI);
  });

  it('D2Q9 Poiseuille mid-channel speed is a few percent of c_s, not 1', () => {
    const t = ESTIMATE_SCENARIOS['lbm-umax'].truth();
    expect(t).toBeGreaterThan(0.008);
    expect(t).toBeLessThan(0.04);
  });

  it('MMS heat error drops by about 4× when n doubles 32 → 64', () => {
    const t = ESTIMATE_SCENARIOS['vv-mms-drop'].truth();
    expect(t).toBeGreaterThan(3.2);
    expect(t).toBeLessThan(5.2);
  });

  it('1D SPH free-surface density at h = Δx is 5/6, not 1 and not 1/2', () => {
    const t = ESTIMATE_SCENARIOS['sph-surface-rho'].truth();
    expect(t).toBeCloseTo(5 / 6, 12);
  });

  it('DEM rest overlap is a few thousandths of a radius, not zero and not visible', () => {
    const t = ESTIMATE_SCENARIOS['dem-rest-overlap'].truth();
    expect(t).toBeGreaterThan(0.001);
    expect(t).toBeLessThan(0.02);
  });
});

describe('every scenario is answerable on its own slider', () => {
  for (const [key, s] of Object.entries(ESTIMATE_SCENARIOS)) {
    it(`${key}: the truth sits inside the slider range`, () => {
      const log = Math.log10(s.truth());
      expect(log).toBeGreaterThan(s.logRange[0]);
      expect(log).toBeLessThan(s.logRange[1]);
    });

    it(`${key}: the starting guess is not already correct`, () => {
      // A slider that opens on the answer tests nothing.
      const factor = 10 ** Math.abs(s.logStart - Math.log10(s.truth()));
      expect(factor).toBeGreaterThan(s.withinFactor);
    });
  }
});
