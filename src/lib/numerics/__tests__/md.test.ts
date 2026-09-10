import { describe, expect, it } from 'vitest';
import { velocityVerlet } from '../ode.ts';
import {
  accumulatePairs,
  berendsenThermostat,
  createCluster,
  createGas,
  createPair,
  densityAtVanishingPressure,
  kineticEnergy,
  latticePressure,
  ljDeriv,
  ljPair,
  minImage,
  noseHooverEnergy,
  noseHooverStep,
  nveStep,
  pack,
  pressureOf,
  temperatureOf,
  totalEnergy,
} from '../md.ts';

const WELL = 2 ** (1 / 6);

describe('Lennard-Jones pair potential', () => {
  it('vanishes at r = σ and sits at −ε at the well', () => {
    expect(ljPair(1).V).toBeCloseTo(0, 12);
    expect(ljPair(WELL * WELL).V).toBeCloseTo(-1, 10);
  });

  it('has zero force at the well and is repulsive at r = σ', () => {
    expect(ljPair(WELL * WELL).fOverR2).toBeCloseTo(0, 10);
    expect(ljPair(1).fOverR2).toBeGreaterThan(0);
  });
});

describe('periodic minimum-image, two particles', () => {
  it('wraps the short way around the seam, not the long way', () => {
    expect(minImage(9, 10)).toBeCloseTo(-1, 12);
    expect(minImage(-9, 10)).toBeCloseTo(1, 12);
    expect(minImage(1, 10)).toBeCloseTo(1, 12);
  });

  it('two particles across a periodic seam feel the r = 1 image, not r = 9', () => {
    // p0 at x = 0.5, p1 at x = 9.5, box = 10 → min-image Δx = −1.
    const s = createPair(0.5, 5, 9.5, 5, 10);
    const analytic = ljPair(1);
    const naive = ljPair(9 * 9);

    // Force on p0 is away from the image of p1 (image sits at x = −0.5), so +x.
    expect(s.ax[0]).toBeCloseTo(analytic.fOverR2, 8);
    expect(s.ax[1]).toBeCloseTo(-analytic.fOverR2, 8);
    expect(s.ay[0]).toBeCloseTo(0, 12);
    expect(s.ay[1]).toBeCloseTo(0, 12);
    expect(s.potential).toBeCloseTo(analytic.V, 8);

    // The naive (unwrapped) pair at r = 9 would be essentially unforced.
    expect(Math.abs(s.ax[0])).toBeGreaterThan(Math.abs(naive.fOverR2) * 1e6);
  });

  it('recovers the isolated pair when they sit well inside the box', () => {
    const s = createPair(4, 5, 4 + WELL, 5, 10);
    expect(s.ax[0]).toBeCloseTo(0, 8);
    expect(s.ax[1]).toBeCloseTo(0, 8);
    expect(s.potential).toBeCloseTo(-1, 8);
  });

  it('obeys Newton III', () => {
    const s = createPair(1.2, 2.4, 3.1, 4.0, 12);
    expect(s.ax[0] + s.ax[1]).toBeCloseTo(0, 12);
    expect(s.ay[0] + s.ay[1]).toBeCloseTo(0, 12);
  });
});

describe('NVE velocity Verlet on a tiny LJ cluster', () => {
  it('one nveStep matches velocityVerlet.step on the packed state', () => {
    const s = createCluster({ n: 4, box: 18, temperature: 0.12, seed: 7 });
    const y0 = pack(s).slice();
    const f = ljDeriv(s.n, s.box, s.params);
    const fromOde = velocityVerlet.step(f, 0, y0, 0.005);

    nveStep(s, 0.005);
    const fromMd = pack(s);

    for (let i = 0; i < fromOde.length; i++) {
      expect(fromMd[i]).toBeCloseTo(fromOde[i], 10);
    }
  });

  it('mechanical energy is bounded — late peak matches early peak', () => {
    const s = createCluster({ n: 4, box: 18, temperature: 0.12, seed: 11 });
    const h = 0.005;
    const steps = 4000;
    const E0 = totalEnergy(s);
    expect(Number.isFinite(E0)).toBe(true);
    expect(Math.abs(E0)).toBeGreaterThan(0.1);

    const samples: number[] = [];
    for (let i = 0; i < steps; i++) {
      nveStep(s, h);
      if (!Number.isFinite(totalEnergy(s))) throw new Error('NVE energy went non-finite');
      if (i % 5 === 0) samples.push((totalEnergy(s) - E0) / Math.abs(E0));
    }

    const peak = (xs: number[]) => Math.max(...xs.map(Math.abs));
    const q = Math.floor(samples.length / 4);
    const early = peak(samples.slice(0, q));
    const late = peak(samples.slice(-q));

    // Bounded: the envelope does not grow. A secular method would fail this.
    expect(late).toBeLessThan(early * 1.4);
    expect(late).toBeLessThan(0.02);
  });
});

describe('a thermostat is a modification of the dynamics', () => {
  it('Berendsen targeting a colder T walks the mechanical energy off its NVE band', () => {
    const make = () => createGas({ n: 9, density: 0.35, temperature: 0.8, seed: 4 });
    const h = 0.005;
    const steps = 2500;

    const nve = make();
    const E0 = totalEnergy(nve);
    let nvePeak = 0;
    for (let i = 0; i < steps; i++) {
      nveStep(nve, h);
      nvePeak = Math.max(nvePeak, Math.abs(totalEnergy(nve) - E0) / Math.abs(E0));
    }

    const bath = make();
    const T0 = 0.3;
    for (let i = 0; i < steps; i++) {
      nveStep(bath, h);
      berendsenThermostat(bath, T0, h, 0.12);
    }
    const walked = Math.abs(totalEnergy(bath) - E0) / Math.abs(E0);

    // The gas NVE band is a few percent (cutoff jumps, stiff collisions).
    // The thermostat walks the energy by an amount that band cannot explain.
    expect(nvePeak).toBeLessThan(0.08);
    expect(walked).toBeGreaterThan(0.5);
    expect(walked).toBeGreaterThan(nvePeak * 8);
    // And it actually approached the target temperature.
    expect(temperatureOf(bath)).toBeLessThan(0.5);
    expect(temperatureOf(bath)).toBeGreaterThan(0.2);
  });

  it('Nosé–Hoover does not bound mechanical energy the way NVE does; the extended quantity is a different object', () => {
    const make = () => createGas({ n: 9, density: 0.35, temperature: 0.7, seed: 8 });
    const h = 0.005;
    const steps = 2000;
    const T0 = 0.7;
    const Q = 2 * 9 * T0 * 0.2 * 0.2; // g kT τ² with τ = 0.2

    const nve = make();
    const E0nve = totalEnergy(nve);
    let nvePeak = 0;
    for (let i = 0; i < steps; i++) {
      nveStep(nve, h);
      nvePeak = Math.max(nvePeak, Math.abs(totalEnergy(nve) - E0nve) / Math.abs(E0nve));
    }

    const nh = make();
    const mech: number[] = [];
    const ext: number[] = [];
    const H0 = noseHooverEnergy(nh, T0, Q);
    for (let i = 0; i < steps; i++) {
      noseHooverStep(nh, h, T0, Q);
      mech.push(totalEnergy(nh));
      ext.push(noseHooverEnergy(nh, T0, Q));
    }
    const mechSpan = Math.max(...mech) - Math.min(...mech);
    const extDrift = Math.max(...ext.map((H) => Math.abs(H - H0)));

    // Mechanical energy of the NH run fluctuates on a scale the NVE band does not.
    expect(mechSpan / Math.abs(E0nve)).toBeGreaterThan(nvePeak);
    // The extended quantity is a different object from K+V.
    expect(Math.abs(H0 - totalEnergy(nh))).not.toBeCloseTo(0, 2);
    // First-order splitting of NH is not a geometric integrator, so H_NH will
    // drift — but it is still a *different* conserved target than K+V.
    expect(Number.isFinite(extDrift)).toBe(true);
  });
});

describe('pressure from the virial', () => {
  it('recovers the 2D ideal-gas law when the cores never meet', () => {
    // Tiny σ → lattice neighbours sit far outside the well. P = ρ T.
    const P = latticePressure(0.3, 1.0, 4, { sigma: 0.05, cutoff: 0.2 });
    expect(P).toBeCloseTo(0.3 * 1.0, 5);
  });

  it('attractions pull P below ρ T, and a P = 0 density exists at T = 0.5', () => {
    const T = 0.5;
    const rho = densityAtVanishingPressure(T);
    expect(rho).toBeGreaterThan(0.18);
    expect(rho).toBeLessThan(0.55);
    expect(Math.abs(latticePressure(rho, T))).toBeLessThan(0.02);
    // Kinetic pressure alone would have been ρ T > 0.
    expect(rho * T).toBeGreaterThan(0.1);
  });

  it('instantaneous pressure on a live gas is finite and the kinetic piece is ρ T', () => {
    const s = createGas({ n: 16, density: 0.4, temperature: 0.8, seed: 2 });
    const P = pressureOf(s);
    expect(Number.isFinite(P)).toBe(true);
    const rho = s.n / (s.box * s.box);
    expect(rho * temperatureOf(s) + s.virial / (2 * s.box * s.box)).toBeCloseTo(P, 12);
    expect(kineticEnergy(s)).toBeCloseTo(s.n * temperatureOf(s), 12);
  });
});

describe('accumulatePairs skips the cutoff', () => {
  it('a pair beyond cutoff contributes nothing', () => {
    const x = Float64Array.from([0, 3]);
    const y = Float64Array.from([0, 0]);
    const ax = new Float64Array(2);
    const ay = new Float64Array(2);
    const { V, virial } = accumulatePairs(
      x, y, 2, 20,
      { epsilon: 1, sigma: 1, cutoff: 2.5 },
      ax, ay,
    );
    expect(V).toBe(0);
    expect(virial).toBe(0);
    expect(ax[0]).toBe(0);
    expect(ax[1]).toBe(0);
  });
});
