import { describe, expect, it } from 'vitest';
import {
  ALPHA2,
  compressiveMinSpacing,
  createColumn1d,
  createDam2d,
  createLattice1d,
  createTensile1d,
  cubicGradW1d,
  cubicGradW2d,
  cubicShape,
  cubicW1d,
  cubicW2d,
  densities1d,
  hydrostaticTopDrop,
  interiorIndex,
  latticeDensityRatio,
  maxAbsVel1d,
  meanFluidX2d,
  minSpacing1d,
  neighborCount1d,
  periodicRestDrift,
  pressure,
  run1d,
  run2d,
  step1d,
  SURFACE_RHO_RATIO,
  surfaceDensityRatio,
  surfaceIndex,
  tensileMinSpacing,
  totalForce1d,
  totalMass1d,
  totalMass2d,
  totalMomentum1d,
} from '../sph.ts';

describe('cubic spline kernel', () => {
  it('is normalised: the 1D shape integrates to 1', () => {
    const n = 8000;
    const qMax = 2;
    const dq = qMax / n;
    let acc = 0;
    for (let i = 0; i < n; i++) {
      const q = (i + 0.5) * dq;
      acc += cubicShape(q);
    }
    // ∫_{-2}^{2} w(q) dq = 1, and w is even, so 2 ∫_0^2 w = 1.
    expect(2 * acc * dq).toBeCloseTo(1, 3);
  });

  it('W(r,h) = w(|r|/h)/h, so ∫ W dr = 1 at any h', () => {
    const h = 0.37;
    const n = 4000;
    const rMax = 2 * h;
    const dr = (2 * rMax) / n;
    let acc = 0;
    for (let i = 0; i < n; i++) {
      const r = -rMax + (i + 0.5) * dr;
      acc += cubicW1d(r, h);
    }
    expect(acc * dr).toBeCloseTo(1, 3);
  });

  it('vanishes for q ≥ 2 and peaks at 2/3', () => {
    expect(cubicShape(0)).toBeCloseTo(2 / 3, 12);
    expect(cubicShape(1)).toBeCloseTo(1 / 6, 12);
    expect(cubicShape(2)).toBe(0);
    expect(cubicShape(2.1)).toBe(0);
    expect(cubicW1d(0, 1)).toBeCloseTo(2 / 3, 12);
  });

  it('the 1D gradient is odd and zero at the origin and past 2h', () => {
    const h = 0.4;
    for (const x of [0.05, 0.2, 0.5, 0.79]) {
      expect(cubicGradW1d(-x, h)).toBeCloseTo(-cubicGradW1d(x, h), 12);
    }
    expect(cubicGradW1d(0, h)).toBe(0);
    expect(cubicGradW1d(2 * h, h)).toBe(0);
    expect(cubicGradW1d(2 * h + 0.01, h)).toBe(0);
  });

  it('2D kernel is isotropic and ∇W points toward the neighbour', () => {
    const h = 0.3;
    const r = 0.2;
    expect(cubicW2d(r, h)).toBeCloseTo(cubicW2d(r, h), 12);
    const g = cubicGradW2d(r, 0, h);
    expect(g.gx).toBeLessThan(0);
    expect(g.gy).toBeCloseTo(0, 12);
    const g2 = cubicGradW2d(0, r, h);
    expect(g2.gy).toBeCloseTo(g.gx, 12);
    expect(cubicW2d(0, h)).toBeCloseTo(ALPHA2 / (h * h), 12);
  });
});

describe('constant field recovered under a complete kernel', () => {
  it('η = 1 recovers ρ₀ exactly: self plus two neighbours at q = 1', () => {
    expect(latticeDensityRatio(1)).toBeCloseTo(1, 12);
    expect(cubicShape(0) + 2 * cubicShape(1)).toBeCloseTo(1, 12);
  });

  it('a periodic 1D lattice at η = 1.2 recovers the geometric density to a percent', () => {
    const s = createLattice1d({ nFluid: 24, dx: 0.05, eta: 1.2, rho0: 1 });
    const i = 10;
    expect(s.rho[i]!).toBeCloseTo(latticeDensityRatio(1.2), 8);
    expect(Math.abs(s.rho[i]! - 1)).toBeLessThan(0.02);
  });

  it('shrinking h below Δx/2 leaves only the self term, so density is not ρ₀', () => {
    expect(latticeDensityRatio(0.5)).toBeCloseTo((2 / 3) / 0.5, 12);
    expect(latticeDensityRatio(0.5)).toBeCloseTo(4 / 3, 12);
    expect(neighborCount1d(0.5)).toBe(1);
    expect(neighborCount1d(1)).toBe(3);
  });
});

describe('incomplete kernel at a free surface', () => {
  it('η = 1 surface particle returns 5/6, not 1', () => {
    expect(surfaceDensityRatio(1)).toBeCloseTo(5 / 6, 12);
    expect(SURFACE_RHO_RATIO).toBeCloseTo(5 / 6, 12);
  });

  it('a column surface is low; the interior is not', () => {
    const s = createColumn1d({ nFluid: 20, nDummy: 4, eta: 1, g: 0, alpha: 0 });
    const surf = surfaceIndex(s);
    const mid = interiorIndex(s);
    expect(s.rho[surf]!).toBeLessThan(0.9);
    expect(s.rho[mid]!).toBeGreaterThan(0.95);
    expect(s.rho[surf]!).toBeCloseTo(surfaceDensityRatio(1), 2);
  });
});

describe('pairwise force conserves momentum', () => {
  it('internal force sums to zero on a periodic lattice (no gravity)', () => {
    const s = createLattice1d({ nFluid: 18, perturb: 0.03, g: 0, alpha: 0 });
    expect(totalForce1d(s)).toBeCloseTo(0, 10);
  });

  it('mass is carried, not computed — a step does not change Σ m', () => {
    const s = createLattice1d({ nFluid: 12, perturb: 0.02 });
    const m0 = totalMass1d(s);
    run1d(s, 40);
    expect(totalMass1d(s)).toBeCloseTo(m0, 12);
  });

  it('periodic, no gravity: total momentum stays put', () => {
    const s = createLattice1d({ nFluid: 16, perturb: 0.05, g: 0, alpha: 0.2 });
    for (let i = 0; i < s.n; i++) s.v[i] = 0.02 * Math.sin((2 * Math.PI * i) / s.n);
    densities1d(s);
    const p0 = totalMomentum1d(s);
    run1d(s, 30);
    expect(totalMomentum1d(s)).toBeCloseTo(p0, 8);
  });
});

describe('hydrostatic rest (or known leak)', () => {
  it('a complete periodic lattice at rest stays at rest', () => {
    expect(periodicRestDrift(180)).toBeLessThan(1e-8);
  });

  it('a free-surface column under gravity is not at rest — the top kernel is incomplete', () => {
    const { vmax } = hydrostaticTopDrop(80);
    expect(vmax).toBeGreaterThan(1e-3);
    expect(periodicRestDrift(80)).toBeLessThan(1e-8);
  });

  it('linear EOS: P < 0 exactly when ρ < ρ₀', () => {
    expect(pressure(0.8, 1, 10)).toBeCloseTo(-20, 12);
    expect(pressure(1.1, 1, 10)).toBeCloseTo(10, 12);
    expect(pressure(1, 1, 10)).toBe(0);
  });
});

describe('tensile clumping when unchecked', () => {
  it('negative pressure clumps: min spacing collapses well below Δx', () => {
    const ratio = tensileMinSpacing(260);
    expect(ratio).toBeLessThan(0.45);
  });

  it('the same seed in compression does not pair', () => {
    const ratio = compressiveMinSpacing(260);
    expect(ratio).toBeGreaterThan(0.7);
  });

  it('a tensile lattice starts with P < 0 at every fluid particle', () => {
    const s = createTensile1d();
    let negative = 0;
    for (let i = 0; i < s.n; i++) if (s.p[i]! < 0) negative += 1;
    expect(negative).toBe(s.n);
    expect(minSpacing1d(s)).toBeGreaterThan(0.7);
  });
});

describe('2D dam-break', () => {
  it('mass is conserved and the blob moves into the empty tank', () => {
    const s = createDam2d({ nx: 8, ny: 6, dx: 0.06 });
    const m0 = totalMass2d(s);
    const x0 = meanFluidX2d(s);
    run2d(s, 160);
    expect(totalMass2d(s)).toBeCloseTo(m0, 12);
    expect(meanFluidX2d(s)).toBeGreaterThan(x0 + 0.015);
  });
});

describe('a step is density → pressure → pairwise force → Verlet', () => {
  it('one step on a perturbed lattice changes positions only after accelerations exist', () => {
    const s = createLattice1d({ nFluid: 12, perturb: 0.04, alpha: 0 });
    const x0 = s.x.slice();
    expect(s.a[3]!).not.toBe(0);
    step1d(s);
    let moved = 0;
    for (let i = 0; i < s.n; i++) moved = Math.max(moved, Math.abs(s.x[i]! - x0[i]!));
    expect(moved).toBeGreaterThan(0);
    expect(s.steps).toBe(1);
    expect(maxAbsVel1d(s)).toBeGreaterThan(0);
  });
});
