import { endpointError, stepSweep } from '../../lib/numerics/convergence.ts';
import { forwardEuler, rk4, integrate, velocityVerlet, trapezoid } from '../../lib/numerics/ode.ts';
import { invariantDrift } from '../../lib/numerics/convergence.ts';
import { decay, oscillator, TWO_RATE_FAST } from '../../lib/numerics/problems.ts';
import { SCHEMES, TARGETS, complexStep, diffSweep, hSweep } from '../../lib/numerics/diff.ts';
import { SPECTRAL_TARGETS, modalSweep } from '../../lib/numerics/spectral.ts';
import { mcRmse } from '../../lib/numerics/monte-carlo.ts';

/**
 * Named targets for `<SketchCurve>`.
 *
 * Island props are JSON, so a lesson names a scenario and the truth curve is
 * computed here. Every curve comes from `src/lib/numerics`, never from a
 * hand-typed array — the thing the learner is graded against is the same code
 * the rest of the platform runs.
 */

export interface SketchScenario {
  xLabel: string;
  yLabel: string;
  /** Domain the learner draws over. */
  xRange: [number, number];
  yRange: [number, number];
  /** Log-scaled axes change what the learner is reasoning about. */
  xLog?: boolean;
  yLog?: boolean;
  /** The truth, sampled across xRange. */
  truth: () => { x: number; y: number }[];
  /** Mean absolute deviation (in y-axis units) allowed before it counts wrong. */
  tolerance: number;
  /** Anchors drawn from the start, so the learner has a foothold. */
  anchors?: { x: number; y: number; label: string }[];
}

const sample = (n: number, a: number, b: number, f: (x: number) => number) =>
  Array.from({ length: n }, (_, i) => {
    const x = a + ((b - a) * i) / (n - 1);
    return { x, y: f(x) };
  });

/* The finite-difference U-curve, drawn in log-log space. Getting this right
   means understanding that the error has TWO sources pulling opposite ways —
   which is exactly the thing a paragraph fails to convey. */
const fdUCurve: SketchScenario = {
  xLabel: 'log₁₀ h',
  yLabel: 'log₁₀ |error|',
  xRange: [-16, -1],
  yRange: [-12, 2],
  tolerance: 1.7,
  anchors: [{ x: -1, y: -1.2, label: 'coarse h' }],
  truth: () => {
    const scheme = SCHEMES.find((s) => s.key === 'forward')!;
    return diffSweep(scheme, TARGETS.sin, hSweep(1e-1, 1e-16, 5))
      .map((p) => ({ x: Math.log10(p.h), y: Math.log10(p.error) }))
      .sort((a, b) => a.x - b.x);
  },
};

/* Global error against step size for a first-order method, log-log: a
   straight line of slope 1. Simple, and it checks whether "first order" has
   actually landed as a geometric fact. */
const eulerConvergence: SketchScenario = {
  xLabel: 'log₁₀ h',
  yLabel: 'log₁₀ |error|',
  xRange: [-4, -0.4],
  yRange: [-5, -0.5],
  tolerance: 0.55,
  truth: () => {
    const problem = decay(1);
    return stepSweep(0.4, 10)
      .map((h) => ({ x: Math.log10(h), y: Math.log10(endpointError(forwardEuler, problem, h)) }))
      .filter((p) => Number.isFinite(p.y))
      .sort((a, b) => a.x - b.x);
  },
};

/* Energy under RK4 on a long oscillator run: a steady one-directional slide.
   Drawing this forces a commitment on the SHAPE of the error — bounded
   oscillation versus secular drift — which is the whole point of the chapter. */
const rk4EnergyDrift: SketchScenario = {
  xLabel: 't',
  yLabel: 'ΔE / E₀',
  xRange: [0, 2000],
  yRange: [-0.0006, 0.0006],
  tolerance: 0.00022,
  anchors: [{ x: 0, y: 0, label: 'starts exact' }],
  truth: () => {
    const { t, relative } = invariantDrift(rk4, { ...oscillator(1), span: 2000 }, 0.1);
    const stride = Math.max(1, Math.floor(t.length / 160));
    return t.filter((_, i) => i % stride === 0).map((tt, i) => ({ x: tt, y: relative[i * stride] }));
  },
};

/* The same run under Verlet: a bounded band that never widens. Sketching both
   in sequence is what makes the contrast stick. */
const verletEnergyBounded: SketchScenario = {
  xLabel: 't',
  yLabel: 'ΔE / E₀',
  xRange: [0, 2000],
  yRange: [-0.004, 0.004],
  tolerance: 0.0014,
  anchors: [{ x: 0, y: 0, label: 'starts exact' }],
  truth: () => {
    const { t, relative } = invariantDrift(velocityVerlet, { ...oscillator(1), span: 2000 }, 0.1);
    const stride = Math.max(1, Math.floor(t.length / 200));
    return t.filter((_, i) => i % stride === 0).map((tt, i) => ({ x: tt, y: relative[i * stride] }));
  },
};

/* Forward Euler past its stability limit: sign-alternating growth, not a
   smooth runaway. Sketching this separates "inaccurate" from "unstable". */
const eulerUnstable: SketchScenario = {
  xLabel: 't',
  yLabel: 'y',
  xRange: [0, 1],
  yRange: [-6, 6],
  tolerance: 1.15,
  anchors: [{ x: 0, y: 1, label: 'y(0) = 1' }],
  truth: () => {
    const problem = decay(50);
    const { t, y } = integrate(forwardEuler, problem.f, problem.y0, 0, 1, 0.05);
    return t.map((tt, i) => ({ x: tt, y: Math.max(-6, Math.min(6, y[i][0])) }));
  },
};

/* Complex-step error against h, log-log: truncation falls as h², then the
   curve sits on the roundoff floor and never turns up. Sketching this is how
   you tell "I removed the subtraction" from "I bought an order". */
const cstepAnchor = (() => {
  const t = TARGETS.sin;
  const h = 1e-1;
  const est = complexStep(t.fComplex!, t.x0, h);
  return { x: Math.log10(h), y: Math.log10(Math.max(Math.abs(est - t.df(t.x0)), 1e-18)), label: 'coarse h' };
})();

const cstepNoU: SketchScenario = {
  xLabel: 'log₁₀ h',
  yLabel: 'log₁₀ |error|',
  xRange: [-20, -1],
  yRange: [-18, 0],
  tolerance: 2.4,
  anchors: [cstepAnchor],
  truth: () => {
    const t = TARGETS.sin;
    return hSweep(1e-1, 1e-20, 4)
      .map((h) => {
        const est = complexStep(t.fComplex!, t.x0, h);
        return { x: Math.log10(h), y: Math.log10(Math.max(Math.abs(est - t.df(t.x0)), 1e-18)) };
      })
      .sort((a, b) => a.x - b.x);
  },
};

/* Implicit trapezoid on a stiff decay: A-stable, not L-stable. One step
   multiplies by ≈ −1, so the solution sign-flips at nearly full amplitude
   while the true solution is already 0. Sketching this is the L-stability
   test — a smooth drop to zero is backward Euler, and a blow-up is explicit. */
const trapezoidRing: SketchScenario = {
  xLabel: 't',
  yLabel: 'y',
  xRange: [0, 2],
  yRange: [-1.25, 1.25],
  tolerance: 0.42,
  anchors: [{ x: 0, y: 1, label: 'y(0) = 1' }],
  truth: () => {
    const problem = decay(TWO_RATE_FAST);
    const { t, y } = integrate(trapezoid, problem.f, problem.y0, 0, 2, 0.1);
    return t.map((tt, i) => ({ x: tt, y: y[i][0] }));
  },
};

/* Spectral accuracy of e^{sin x}: log10(error) vs K. A cliff, then the
   roundoff floor — not a power-law slope. Drawing this is the whole point. */
const specSmoothCliff: SketchScenario = {
  xLabel: 'K (highest mode)',
  yLabel: 'log₁₀ |error|',
  xRange: [2, 20],
  yRange: [-16, 0],
  tolerance: 2.1,
  anchors: [{ x: 2, y: -1.3, label: 'K = 2' }],
  truth: () =>
    modalSweep(SPECTRAL_TARGETS.expSin, Array.from({ length: 19 }, (_, i) => i + 2))
      .map((p) => ({ x: p.n, y: Math.log10(p.error) })),
};

/* Truncated Fourier series of a sawtooth, error away from the jump, log-log.
   A line of slope −1: first order. The tempting sketch is another cliff. */
const specJumpSlope: SketchScenario = {
  xLabel: 'log₁₀ K',
  yLabel: 'log₁₀ |error| away from jump',
  xRange: [0.9, 1.9],
  yRange: [-2.4, 0],
  tolerance: 0.38,
  anchors: [{ x: 0.9, y: -0.81, label: 'K = 8' }],
  truth: () =>
    modalSweep(
      SPECTRAL_TARGETS.sawtooth,
      Array.from({ length: 73 }, (_, i) => i + 8),
      { excludeRadius: 0.5 },
    ).map((p) => ({ x: Math.log10(p.n), y: Math.log10(p.error) })),
};

/* Monte Carlo RMSE against sample count, log-log: a straight line of slope
   −1/2. Sketching this is the commitment that "four times the samples buy
   twice the accuracy" — the tempting wrong line is slope −1. */
const mcErrorVsN: SketchScenario = {
  xLabel: 'log₁₀ N',
  yLabel: 'log₁₀ (RMSE)',
  xRange: [1.5, 4.5],
  yRange: [-3.2, -0.7],
  tolerance: 0.4,
  anchors: [{
    x: 1.5,
    y: Math.log10(mcRmse(1, 10 ** 1.5)),
    label: 'N = 32',
  }],
  truth: () => sample(80, 1.5, 4.5, (logN) => Math.log10(mcRmse(1, 10 ** logN))),
};

export const SKETCH_SCENARIOS: Record<string, SketchScenario> = {
  'fd-u-curve': fdUCurve,
  'euler-convergence': eulerConvergence,
  'rk4-energy-drift': rk4EnergyDrift,
  'verlet-energy-bounded': verletEnergyBounded,
  'euler-unstable': eulerUnstable,
  'cstep-no-u': cstepNoU,
  'trapezoid-ring': trapezoidRing,
  'spec-smooth-cliff': specSmoothCliff,
  'spec-jump-slope': specJumpSlope,
  'mc-error-vs-n': mcErrorVsN,
};
