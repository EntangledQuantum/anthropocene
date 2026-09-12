import { describe, expect, it } from 'vitest';
/** Math.max(...arr) blows the call stack past ~100k elements, and these runs
 *  are 200k samples long on purpose — a drift test that only runs for a short
 *  while is not a drift test. */
const maxOf = (xs: readonly number[]) => xs.reduce((m, v) => (v > m ? v : m), -Infinity);
const minOf = (xs: readonly number[]) => xs.reduce((m, v) => (v < m ? v : m), Infinity);

import {
  LANDSCAPES,
  allowedRegions,
  equilibriaOf,
  measuredPeriod,
  rollMarble,
  speedAt,
  turningPointsOf,
  type Landscape,
} from '../landscape.ts';

/** Every landscape's dU must actually be the derivative of its U. A sign slip
 *  here would push the marble uphill and no test of the physics would catch
 *  it — the energy would still be conserved, just of the wrong system. */
describe('landscape derivatives', () => {
  for (const [key, land] of Object.entries(LANDSCAPES)) {
    it(`${key}: dU matches a finite difference of U`, () => {
      const [a, b] = land.domain;
      const h = 1e-6;
      for (const f of [0.2, 0.4, 0.6, 0.8]) {
        const x = a + (b - a) * f;
        const fd = (land.U(x + h) - land.U(x - h)) / (2 * h);
        expect(land.dU(x)).toBeCloseTo(fd, 4);
      }
    });
  }
});

describe('velocity Verlet on a landscape', () => {
  it('keeps energy bounded over a long run rather than drifting', () => {
    // The claim the energy-conservation lesson rests on. A method that leaked
    // would show the marble sinking out of its own valley.
    const path = rollMarble(LANDSCAPES.spring, 1.5, 0, { dt: 0.004, steps: 200_000 });
    const E0 = path[0].E;
    const errs = path.map((p) => Math.abs(p.E - E0) / Math.abs(E0));
    expect(maxOf(errs)).toBeLessThan(1e-4);

    // And bounded means bounded: the last stretch is no worse than the first.
    const early = maxOf(errs.slice(0, 5000));
    const late = maxOf(errs.slice(-5000));
    expect(late).toBeLessThan(early * 3 + 1e-9);
  });

  it('energy sloshes between kinetic and potential while the total sits still', () => {
    const path = rollMarble(LANDSCAPES.spring, 1.5, 0, { dt: 0.002, steps: 4000 });
    const Ks = path.map((p) => p.K);
    const Us = path.map((p) => p.U);
    expect(maxOf(Ks)).toBeGreaterThan(0.9 * maxOf(Us));
    expect(minOf(Ks)).toBeLessThan(1e-3);
  });

  it('a marble released from rest comes back to where it started', () => {
    const path = rollMarble(LANDSCAPES.spring, 1.2, 0, { dt: 0.001, steps: 20_000 });
    const maxX = maxOf(path.map((p) => p.x));
    const minX = minOf(path.map((p) => p.x));
    expect(maxX).toBeCloseTo(1.2, 2);
    expect(minX).toBeCloseTo(-1.2, 2);
  });
});

describe('turning points and allowed regions', () => {
  it('matches the analytic turning points of a spring', () => {
    // ½kx² = E with k = 4  →  x = ±√(E/2)
    const tps = turningPointsOf(LANDSCAPES.spring, 8);
    expect(tps).toHaveLength(2);
    expect(tps[0]).toBeCloseTo(-2, 4);
    expect(tps[1]).toBeCloseTo(2, 4);
  });

  it('refuses a speed where the energy line is below the curve', () => {
    expect(speedAt(LANDSCAPES.spring, 2, 0)).toBeCloseTo(2, 6);
    // U(2) = 8, well above E = 2.
    expect(speedAt(LANDSCAPES.spring, 2, 2)).toBeNull();
  });

  it('a low energy line traps the marble in one well of a double well', () => {
    const land = LANDSCAPES.doubleWell;
    const barrier = equilibriaOf(land).find((e) => e.stability === 'unstable')!;
    const regions = allowedRegions(land, barrier.U - 0.25);
    expect(regions.length).toBe(2);
  });

  it('raising the line above the barrier joins the two wells into one region', () => {
    const land = LANDSCAPES.doubleWell;
    const barrier = equilibriaOf(land).find((e) => e.stability === 'unstable')!;
    const regions = allowedRegions(land, barrier.U + 0.3);
    expect(regions.length).toBe(1);
  });

  it('a marble below the barrier never reaches the other well', () => {
    const land = LANDSCAPES.doubleWell;
    const eqs = equilibriaOf(land);
    const barrier = eqs.find((e) => e.stability === 'unstable')!;
    const well = eqs.filter((e) => e.stability === 'stable').sort((a, b) => a.x - b.x)[0];
    const start = well.x - 0.28;
    const E = land.U(start);
    expect(E).toBeLessThan(barrier.U);

    const path = rollMarble(land, start, 0, { dt: 0.002, steps: 60_000 });
    expect(maxOf(path.map((p) => p.x))).toBeLessThan(barrier.x);
  });
});

describe('equilibria', () => {
  it('finds a single stable minimum for a spring', () => {
    const eqs = equilibriaOf(LANDSCAPES.spring);
    expect(eqs).toHaveLength(1);
    expect(eqs[0].x).toBeCloseTo(0, 4);
    expect(eqs[0].stability).toBe('stable');
  });

  it('a double well has two stable minima with an unstable maximum between', () => {
    const eqs = equilibriaOf(LANDSCAPES.doubleWell).sort((a, b) => a.x - b.x);
    expect(eqs.map((e) => e.stability)).toEqual(['stable', 'unstable', 'stable']);
  });

  it('the Lennard-Jones minimum sits at the textbook 2^(1/6) sigma', () => {
    const eqs = equilibriaOf(LANDSCAPES.lennardJones);
    const min = eqs.find((e) => e.stability === 'stable')!;
    expect(min.x).toBeCloseTo(Math.pow(2, 1 / 6), 4);
    expect(min.U).toBeCloseTo(-1, 4);
  });

  it('small-oscillation frequency comes from the curvature', () => {
    // U = ½kx² with k = 4, mass 1  →  omega = 2.
    const eq = equilibriaOf(LANDSCAPES.spring, 1)[0];
    expect(eq.omega).toBeCloseTo(2, 5);
  });
});

describe('does the period depend on amplitude?', () => {
  it('for a spring it does not — the surprising answer', () => {
    const small = measuredPeriod(LANDSCAPES.spring, 0.3)!;
    const large = measuredPeriod(LANDSCAPES.spring, 2.0)!;
    expect(small).toBeCloseTo(Math.PI, 2); // 2π/ω with ω = 2
    expect(large).toBeCloseTo(small, 3);
  });

  it('for a real pendulum it does — and the swing gets slower, not faster', () => {
    const small = measuredPeriod(LANDSCAPES.pendulum, 0.15)!;
    const large = measuredPeriod(LANDSCAPES.pendulum, 2.6)!;
    expect(large).toBeGreaterThan(small * 1.3);
  });

  it('the small-angle pendulum matches the harmonic prediction', () => {
    // U = mgL(1 − cos θ) with the coefficient 4  →  omega = 2 for small θ.
    const measured = measuredPeriod(LANDSCAPES.pendulum, 0.08)!;
    expect(measured).toBeCloseTo(Math.PI, 2);
  });
});

describe('asymmetry has consequences', () => {
  it('a Lennard-Jones bond stretches on average as energy rises — thermal expansion', () => {
    const land: Landscape = LANDSCAPES.lennardJones;
    const mean = (x0: number) => {
      const path = rollMarble(land, x0, 0, { dt: 0.0005, steps: 120_000 });
      return path.reduce((s, p) => s + p.x, 0) / path.length;
    };
    const cold = mean(1.06);
    const hot = mean(1.02);
    expect(hot).toBeGreaterThan(cold);
  });

  it('a symmetric spring does not — its mean stays at the minimum', () => {
    const mean = (x0: number) => {
      const path = rollMarble(LANDSCAPES.spring, x0, 0, { dt: 0.0005, steps: 120_000 });
      return path.reduce((s, p) => s + p.x, 0) / path.length;
    };
    expect(Math.abs(mean(0.4))).toBeLessThan(0.01);
    expect(Math.abs(mean(1.8))).toBeLessThan(0.01);
  });
});
