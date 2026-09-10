import { describe, expect, it } from 'vitest';
import {
  SPECTRAL_TARGETS, TWO_PI, applyRows, centralDiffError, cheb, chebDerivative,
  derivativeError, evenSweep, fourierDerivative, gibbsOvershoot, interpolantAt,
  interpolantError, interpolantSweep, modalError, observedOrder, periodicGrid,
  reconstruct, smallestK, smallestN,
} from '../spectral.ts';

const expSin = SPECTRAL_TARGETS.expSin;
const sawtooth = SPECTRAL_TARGETS.sawtooth;

/* Every pedagogical claim the spectral lesson makes is asserted here. */

describe('band-limited functions are recovered exactly', () => {
  it('sin(3x) at N = 16 interpolates to machine precision off the nodes', () => {
    const n = 16;
    const samples = periodicGrid(n).map((x) => Math.sin(3 * x));
    const xs = [0.1, 0.7, 1.3, 2.2, 4.8];
    const p = interpolantAt(samples, xs);
    for (let i = 0; i < xs.length; i++) {
      expect(p[i]).toBeCloseTo(Math.sin(3 * xs[i]), 12);
    }
  });

  it('spectral derivative of sin(3x) is 3 cos(3x) at every node', () => {
    const n = 16;
    const xs = periodicGrid(n);
    const d = fourierDerivative(xs.map((x) => Math.sin(3 * x)));
    for (let i = 0; i < n; i++) {
      expect(d[i]).toBeCloseTo(3 * Math.cos(3 * xs[i]), 12);
    }
  });
});

describe('smooth periodic → error falls faster than any fixed power of N', () => {
  it('e^{sin x} interpolant at N = 24 is already under 10^{-12}', () => {
    expect(interpolantError(expSin, 24)).toBeLessThan(1e-12);
  });

  it('going from N = 8 to N = 16 beats fourth-order by a wide margin', () => {
    const e8 = interpolantError(expSin, 8);
    const e16 = interpolantError(expSin, 16);
    const fourthOrder = (8 / 16) ** 4; // 1/16
    expect(e16 / e8).toBeLessThan(fourthOrder / 4);
    expect(e16).toBeLessThan(1e-6);
  });

  it('spectral derivative of e^{sin x} hits roundoff by N = 24', () => {
    expect(derivativeError(expSin, 24)).toBeLessThan(1e-10);
  });

  it('smallest N reaching 10^{-12} interpolant error is a handful of points, not hundreds', () => {
    const n = smallestN(expSin, 1e-12);
    expect(n).toBeGreaterThanOrEqual(16);
    expect(n).toBeLessThanOrEqual(32);
  });

  it('truncated series of e^{sin x} is under 10^{-12} by K = 12 modes', () => {
    expect(modalError(expSin, 11)).toBeGreaterThan(1e-12);
    expect(modalError(expSin, 12)).toBeLessThan(1e-12);
    expect(smallestK(expSin, 1e-12)).toBe(12);
  });
});

describe('same grid, spectral derivative crushes the local stencil', () => {
  it('at N = 16, spectral error on e^{sin x} is ≥10^4 times smaller than central difference', () => {
    const spectral = derivativeError(expSin, 16);
    const central = centralDiffError(expSin, 16);
    expect(central / spectral).toBeGreaterThan(1e4);
    expect(central).toBeGreaterThan(1e-4);
  });
});

describe('one jump → Gibbs / ~first-order', () => {
  const AWAY = { excludeRadius: 0.5 };

  it('max-norm error including the jump is a wall — it does not go to zero', () => {
    const e32 = modalError(sawtooth, 32);
    const e128 = modalError(sawtooth, 128);
    // S_K(0) = 0 while f(0+) = π/2, so ||S_K − f||_∞ ≥ π/2 forever.
    expect(e32).toBeGreaterThan(1.4);
    expect(e128).toBeGreaterThan(1.4);
    expect(e128 / e32).toBeGreaterThan(0.8);
    expect(e128 / e32).toBeLessThan(1.2);
  });

  it('away from the jump, the rate collapses to first order', () => {
    const a = { n: 32, error: modalError(sawtooth, 32, AWAY) };
    const b = { n: 64, error: modalError(sawtooth, 64, AWAY) };
    const c = { n: 128, error: modalError(sawtooth, 128, AWAY) };
    const p1 = observedOrder(a, b);
    const p2 = observedOrder(b, c);
    expect(p1).toBeGreaterThan(0.7);
    expect(p1).toBeLessThan(1.4);
    expect(p2).toBeGreaterThan(0.7);
    expect(p2).toBeLessThan(1.4);
    // Nowhere near spectral: doubling K barely quarters the error, it does not crush it.
    expect(c.error / a.error).toBeGreaterThan(0.15);
  });

  it('Gibbs overshoot is ~9% of the jump and does not die with K', () => {
    const g64 = gibbsOvershoot(sawtooth, 64);
    const g128 = gibbsOvershoot(sawtooth, 128);
    expect(g64).toBeGreaterThan(0.07);
    expect(g64).toBeLessThan(0.12);
    expect(g128).toBeGreaterThan(0.07);
    expect(g128).toBeLessThan(0.12);
    // Not a quantity that refinement removes.
    expect(Math.abs(g128 - g64)).toBeLessThan(0.02);
  });

  it('the truncated sawtooth series is Σ sin(kx)/k', () => {
    const xs = [0.4, 1.1, 2.0];
    const p = reconstruct(sawtooth, 8, xs);
    for (let i = 0; i < xs.length; i++) {
      let s = 0;
      for (let k = 1; k <= 8; k++) s += Math.sin(k * xs[i]) / k;
      expect(p[i]).toBeCloseTo(s, 12);
    }
  });
});

describe('Chebyshev differentiation on [-1, 1]', () => {
  it('differentiates polynomials of degree ≤ N exactly', () => {
    const N = 4;
    const { D, x } = cheb(N);
    const u = x.map((t) => t ** 4 - 2 * t);
    const du = applyRows(D, u);
    for (let i = 0; i <= N; i++) {
      expect(du[i]).toBeCloseTo(4 * x[i] ** 3 - 2, 10);
    }
  });

  it('e^x on [-1, 1] converges exponentially in N', () => {
    const err = (N: number) => {
      const { x } = cheb(N);
      const du = chebDerivative(x.map(Math.exp));
      return Math.max(...du.map((d, i) => Math.abs(d - Math.exp(x[i]))));
    };
    const e8 = err(8);
    const e16 = err(16);
    expect(e8).toBeLessThan(1e-6);
    expect(e16).toBeLessThan(1e-12);
    expect(e16 / e8).toBeLessThan((8 / 16) ** 4);
  });
});

describe('sweep helpers used by the widget', () => {
  it('evenSweep and interpolantSweep agree with interpolantError', () => {
    const ns = evenSweep(8, 16, 4);
    expect(ns).toEqual([8, 12, 16]);
    const sweep = interpolantSweep(expSin, ns);
    for (const p of sweep) {
      expect(p.error).toBeCloseTo(interpolantError(expSin, p.n), 15);
    }
  });

  it('the 2π-periodic grid closes on itself', () => {
    const xs = periodicGrid(8);
    expect(xs[0]).toBe(0);
    expect(xs[1]).toBeCloseTo(TWO_PI / 8, 15);
    expect(xs.at(-1)! + TWO_PI / 8).toBeCloseTo(TWO_PI, 12);
  });
});
