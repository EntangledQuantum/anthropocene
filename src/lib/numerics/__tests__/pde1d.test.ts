import { describe, expect, it } from 'vitest';
import {
  characteristicCells,
  exactAdvection,
  ftcsAdvectionGain,
  gaussianPulse,
  heatFtcsGain,
  l2Distance,
  maxAbs,
  maxStableHeatDt,
  periodicGrid,
  runAdvection,
  runHeat,
  stepAdvectionFtcs,
  stepAdvectionUpwind,
  stepHeatFtcs,
  stencilReach,
  upwindAdvectionGain,
  upwindViscosity,
} from '../pde1d.ts';

/* Pedagogical claims of the CFL lesson. If the lesson says FTCS advection
   detonates for CFL > 1, or that heat FTCS dies for r > 1/2, or that upwind
   stays bounded past the centred cliff and smears, this file is what pins it. */

describe('von Neumann amplification', () => {
  const thetas = Array.from({ length: 64 }, (_, i) => (Math.PI * (i + 1)) / 64);

  it('FTCS advection has |G| = √(1 + ν² sin²θ) ≥ 1 for every ν ≠ 0', () => {
    for (const nu of [0.25, 0.5, 1, 1.5]) {
      for (const th of thetas) {
        const g = ftcsAdvectionGain(nu, th);
        const expected = Math.hypot(1, nu * Math.sin(th));
        expect(g).toBeCloseTo(expected, 12);
        expect(g).toBeGreaterThanOrEqual(1 - 1e-12);
      }
    }
    // Worst mode is θ = π/2 (the centred difference of a checkerboard is 0).
    expect(ftcsAdvectionGain(0.5, Math.PI / 2)).toBeCloseTo(Math.sqrt(1.25), 12);
    expect(ftcsAdvectionGain(0.5, Math.PI / 2)).toBeGreaterThan(1);
  });

  it('upwind |G| ≤ 1 for ν ∈ [0, 1] and |G| > 1 for ν > 1 at the checkerboard', () => {
    for (const nu of [0, 0.3, 0.8, 1]) {
      for (const th of thetas) {
        expect(upwindAdvectionGain(nu, th)).toBeLessThanOrEqual(1 + 1e-12);
      }
    }
    expect(upwindAdvectionGain(1.3, Math.PI)).toBeGreaterThan(1);
    expect(upwindAdvectionGain(1, Math.PI)).toBeCloseTo(1, 12);
  });

  it('heat FTCS |G| ≤ 1 iff r ≤ 1/2 (checkerboard G = 1 − 4r)', () => {
    expect(heatFtcsGain(0.4, Math.PI)).toBeCloseTo(1 - 1.6, 12);
    expect(Math.abs(heatFtcsGain(0.4, Math.PI))).toBeLessThan(1);
    expect(heatFtcsGain(0.5, Math.PI)).toBeCloseTo(-1, 12);
    expect(Math.abs(heatFtcsGain(0.6, Math.PI))).toBeGreaterThan(1);
    for (const th of thetas) {
      expect(Math.abs(heatFtcsGain(0.5, th))).toBeLessThanOrEqual(1 + 1e-12);
    }
  });
});

describe('FTCS advection is unstable', () => {
  it('explodes for CFL > 1', () => {
    const run = runAdvection({ scheme: 'ftcs', cfl: 1.3, n: 64, tEnd: 0.4, nyquist: 1e-4 });
    expect(run.diverged || run.maxAbs > 10).toBe(true);
  });

  it('also explodes for CFL = 0.5 — CFL < 1 is not sufficient', () => {
    const run = runAdvection({ scheme: 'ftcs', cfl: 0.5, n: 64, tEnd: 1.2, nyquist: 1e-4 });
    expect(run.diverged || run.maxAbs > 10).toBe(true);
  });

  it('a handful of FTCS steps at CFL = 1.5 already grows the 4Δx mode', () => {
    const { x } = periodicGrid(48);
    let u = gaussianPulse(x);
    u = u.map((v, i) => v + 1e-3 * Math.cos((Math.PI / 2) * i));
    const start = maxAbs(u);
    for (let k = 0; k < 16; k++) u = stepAdvectionFtcs(u, 1.5);
    expect(maxAbs(u)).toBeGreaterThan(start * 5);
  });
});

describe('heat FTCS r-limit', () => {
  it('stays bounded for r = 0.4', () => {
    const run = runHeat({ r: 0.4, n: 64, nSteps: 200, nyquist: 1e-3 });
    expect(run.diverged).toBe(false);
    expect(run.maxAbs).toBeLessThan(2);
    expect(run.height).toBeLessThan(run.u0.reduce((m, v) => Math.max(m, v), 0) + 0.05);
  });

  it('explodes for r = 0.6', () => {
    const run = runHeat({ r: 0.6, n: 64, nSteps: 80, nyquist: 1e-3 });
    expect(run.diverged || run.maxAbs > 10).toBe(true);
  });

  it('maxStableHeatDt is the r = 1/2 bound', () => {
    const dx = 1 / 200;
    const dt = maxStableHeatDt(1, dx);
    expect(dt).toBeCloseTo(0.5 * dx * dx, 12);
    expect(dt).toBeCloseTo(1.25e-5, 12);
  });
});

describe('first-order upwind: stable past the centred cliff, smears', () => {
  it('stays bounded at CFL = 0.8, where FTCS has already died', () => {
    const up = runAdvection({ scheme: 'upwind', cfl: 0.8, n: 80, tEnd: 0.6 });
    const ftcs = runAdvection({ scheme: 'ftcs', cfl: 0.8, n: 80, tEnd: 0.6, nyquist: 1e-4 });
    expect(up.diverged).toBe(false);
    expect(up.maxAbs).toBeLessThan(1.5);
    expect(ftcs.diverged || ftcs.maxAbs > 5).toBe(true);
  });

  it('explodes for CFL = 1.3', () => {
    const run = runAdvection({ scheme: 'upwind', cfl: 1.3, n: 64, tEnd: 0.5, nyquist: 1e-3 });
    expect(run.diverged || run.maxAbs > 10).toBe(true);
  });

  it('at CFL = 1 is an exact one-cell shift', () => {
    const { x } = periodicGrid(64);
    const u0 = gaussianPulse(x, 0.25, 0.05);
    let u = u0.slice();
    for (let k = 0; k < 64; k++) u = stepAdvectionUpwind(u, 1);
    for (let i = 0; i < 64; i++) {
      expect(u[i]).toBeCloseTo(u0[i]!, 10);
    }
  });

  it('at CFL = 0.4 the pulse height drops while the field stays bounded — dissipation, not blow-up', () => {
    const run = runAdvection({ scheme: 'upwind', cfl: 0.4, n: 80, tEnd: 0.6 });
    const u0Height = Math.max(...run.u0);
    expect(run.diverged).toBe(false);
    expect(run.maxAbs).toBeLessThan(1.2);
    expect(run.height).toBeLessThan(0.85 * u0Height);
    expect(run.exact).toBeDefined();
    const err = l2Distance(run.u, run.exact!, run.dx);
    expect(err).toBeGreaterThan(0.02);
  });

  it('numerical viscosity (c Δx/2)(1 − ν) vanishes at CFL = 1', () => {
    expect(upwindViscosity(1, 0.01, 1)).toBeCloseTo(0, 12);
    expect(upwindViscosity(1, 0.01, 0.4)).toBeCloseTo(0.003, 12);
  });
});

describe('CFL triangle — information in mesh units', () => {
  it('upwind reach is one-sided; a CFL > 1 characteristic steps outside it', () => {
    const steps = 6;
    const reach = stencilReach('upwind', steps);
    expect(reach.left).toBe(6);
    expect(reach.right).toBe(0);
    expect(characteristicCells(0.7, steps)).toBeLessThanOrEqual(reach.left);
    expect(characteristicCells(1.4, steps)).toBeGreaterThan(reach.left);
  });

  it('FTCS reach is two-sided, and still does not make the scheme stable', () => {
    const reach = stencilReach('ftcs', 6);
    expect(reach.left).toBe(6);
    expect(reach.right).toBe(6);
    expect(characteristicCells(0.5, 6)).toBeLessThanOrEqual(reach.left);
  });
});

describe('the exact shift of a Gaussian is periodic', () => {
  it('exactAdvection at t = 1 matches t = 0 on the unit interval with c = 1', () => {
    const { x } = periodicGrid(80);
    const a = gaussianPulse(x, 0.25, 0.05);
    const b = exactAdvection(x, 1, 1, 0.25, 0.05);
    for (let i = 0; i < x.length; i++) expect(b[i]).toBeCloseTo(a[i]!, 10);
  });
});

describe('heat FTCS step is the three-point stencil', () => {
  it('a constant field is a fixed point', () => {
    const u = new Array(16).fill(3);
    const next = stepHeatFtcs(u, 0.3);
    for (let i = 0; i < 16; i++) expect(next[i]).toBeCloseTo(3, 12);
  });
});
