import { describe, expect, it } from 'vitest';
import {
  PLASMA_OMEGA,
  adjointResidual,
  cicWeights,
  cosineMoment,
  createPair,
  createPlasma,
  deposit,
  fieldsFromParticles,
  gridCharge,
  kineticEnergy,
  measuredPlasmaOmega,
  measuredPlasmaPeriod,
  nodeCharge,
  solvePoisson,
  stepPic,
  totalCharge,
  totalForce,
  uniformRmsE,
  wrapPos,
  xWhereLeftFraction,
} from '../pic.ts';

describe('CIC hats', () => {
  it('partition of unity: the two weights sum to 1', () => {
    for (const x of [0, 0.1, 0.25, 0.5, 0.99, 1.7]) {
      const { w0, w1 } = cicWeights(x, 4, 4);
      expect(w0 + w1).toBeCloseTo(1, 12);
    }
  });

  it('a particle at a node sends all charge there', () => {
    const { i0, w0, w1 } = cicWeights(2, 4, 4);
    expect(i0).toBe(2);
    expect(w0).toBeCloseTo(1, 12);
    expect(w1).toBeCloseTo(0, 12);
  });

  it('at a quarter-cell the left node holds three quarters', () => {
    expect(nodeCharge(0.25, 0, 4, 4)).toBeCloseTo(0.75, 12);
    expect(xWhereLeftFraction(0.75)).toBeCloseTo(0.25, 12);
  });
});

describe('charge conservation on deposit', () => {
  it('Σ ρ_i h equals Σ q_p for scattered charges', () => {
    const x = new Float64Array([0.12, 0.4, 0.88, 1.37]);
    const q = new Float64Array([1, -0.3, 0.5, 2]);
    const n = 8;
    const L = 2;
    const rho = deposit(x, q, n, L);
    expect(gridCharge(rho, L)).toBeCloseTo(totalCharge(q), 12);
  });

  it('a particle wrapping across the seam still conserves', () => {
    const x = new Float64Array([0.01, 0.99]);
    const q = new Float64Array([3, -1]);
    const rho = deposit(x, q, 10, 1);
    expect(gridCharge(rho, 1)).toBeCloseTo(2, 12);
  });
});

describe('gather is the adjoint of scatter', () => {
  it('Σ q_p φ_p = Σ ρ_i φ_i h for a random nodal potential', () => {
    const x = new Float64Array([0.07, 0.22, 0.51, 0.8, 0.94]);
    const q = new Float64Array([1, -2, 0.5, 0.25, -0.4]);
    const phi = new Float64Array(8);
    for (let i = 0; i < 8; i++) phi[i] = Math.sin((2 * Math.PI * (i + 0.3)) / 8);
    expect(adjointResidual(x, q, phi, 1)).toBeCloseTo(0, 12);
  });

  it('a mismatched gather (NGP vs CIC) does not satisfy the identity', () => {
    const x = new Float64Array([0.3]);
    const q = new Float64Array([1]);
    const n = 4;
    const L = 1;
    const phi = new Float64Array([1, 2, 3, 4]);
    const rho = deposit(x, q, n, L);
    const h = L / n;
    let grid = 0;
    for (let i = 0; i < n; i++) grid += rho[i]! * phi[i]! * h;
    // Nearest-grid-point gather: not the CIC adjoint.
    const iNgp = Math.round(wrapPos(x[0]!, L) / h) % n;
    const ngp = q[0]! * phi[iNgp]!;
    expect(Math.abs(ngp - grid)).toBeGreaterThan(0.05);
    expect(adjointResidual(x, q, phi, L)).toBeCloseTo(0, 12);
  });
});

describe('periodic Poisson', () => {
  it('recovers a sine: Poisson of sin(2πx) to second order', () => {
    const n = 64;
    const L = 1;
    const h = L / n;
    const rho = new Float64Array(n);
    const exactPhi = new Float64Array(n);
    const exactE = new Float64Array(n);
    const k = 2 * Math.PI / L;
    for (let i = 0; i < n; i++) {
      const xi = i * h;
      rho[i] = Math.sin(k * xi);
      exactPhi[i] = Math.sin(k * xi) / (k * k);
      exactE[i] = -Math.cos(k * xi) / k;
    }
    const { phi, E } = solvePoisson(rho, L);
    let errPhi = 0;
    let errE = 0;
    for (let i = 0; i < n; i++) {
      errPhi = Math.max(errPhi, Math.abs(phi[i]! - exactPhi[i]!));
      errE = Math.max(errE, Math.abs(E[i]! - exactE[i]!));
    }
    expect(errPhi).toBeLessThan(3e-3);
    expect(errE).toBeLessThan(3e-3);
  });

  it('mean φ and mean E vanish (periodic gauge)', () => {
    const rho = new Float64Array([1, 0, -0.5, -0.5, 0, 0, 0, 0]);
    const { phi, E } = solvePoisson(rho, 1);
    const mean = (a: Float64Array) => a.reduce((s, v) => s + v, 0) / a.length;
    expect(mean(phi)).toBeCloseTo(0, 12);
    expect(mean(E)).toBeCloseTo(0, 12);
  });
});

describe('two-particle identity (momentum)', () => {
  it('total force on two opposite charges vanishes', () => {
    const s = createPair(0.22, 0.63, 0.4, 32, 1, 0.02);
    expect(Math.abs(totalForce(s))).toBeLessThan(1e-12);
  });

  it('total force on two like charges (plus neutralizing background) vanishes', () => {
    const s = createPair(0.15, 0.7, 0.3, 32, 1, 0.02);
    s.q[1] = s.q[0]!;
    expect(Math.abs(totalForce(s))).toBeLessThan(1e-12);
  });
});

describe('Langmuir oscillation', () => {
  it('the k=1 density mode rings near ω_p = 1', () => {
    const T = measuredPlasmaPeriod();
    expect(T).toBeGreaterThan(0.9 * 2 * Math.PI);
    expect(T).toBeLessThan(1.1 * 2 * Math.PI);
    const omega = measuredPlasmaOmega();
    expect(omega).toBeGreaterThan(0.9 * PLASMA_OMEGA);
    expect(omega).toBeLessThan(1.1 * PLASMA_OMEGA);
  });

  it('electrostatic and kinetic energy exchange over a quarter period', () => {
    const s = createPlasma({ amplitude: 0.02, dt: 0.02 });
    fieldsFromParticles(s);
    const es0 = s.phi.reduce((a, _, i) => a + s.rho[i]! * s.phi[i]! * s.h, 0);
    const ke0 = kineticEnergy(s);
    const nQuarter = Math.round((0.5 * Math.PI) / s.dt);
    for (let i = 0; i < nQuarter; i++) stepPic(s);
    fieldsFromParticles(s);
    const es1 = s.phi.reduce((a, _, i) => a + s.rho[i]! * s.phi[i]! * s.h, 0);
    const ke1 = kineticEnergy(s);
    expect(Math.abs(es0)).toBeGreaterThan(Math.abs(es1));
    expect(ke1).toBeGreaterThan(ke0);
  });

  it('the k=1 moment is finite and starts away from zero', () => {
    const s = createPlasma({ amplitude: 0.02 });
    expect(Math.abs(cosineMoment(s.x, s.q, s.length))).toBeGreaterThan(1e-4);
  });
});

describe('shot noise vs particles per cell', () => {
  it('rms E of a uniform sea falls when ppc doubles (grid held fixed)', () => {
    const e4 = uniformRmsE(4);
    const e16 = uniformRmsE(16);
    expect(e16).toBeLessThan(e4);
    // Shot noise ~ 1/√N. Factor of 4 in ppc → about 1/2 in rms, not a grid order.
    expect(e16 / e4).toBeGreaterThan(0.2);
    expect(e16 / e4).toBeLessThan(0.7);
  });
});

describe('box wrap', () => {
  it('lands in [0, L)', () => {
    expect(wrapPos(-0.1, 1)).toBeCloseTo(0.9, 12);
    expect(wrapPos(1.1, 1)).toBeCloseTo(0.1, 12);
    expect(wrapPos(1, 1)).toBeCloseTo(0, 12);
  });
});
