import { endpointError } from '../../lib/numerics/convergence.ts';
import { forwardEuler, rk4 } from '../../lib/numerics/ode.ts';
import { decay } from '../../lib/numerics/problems.ts';
import { condInf, ill2x2, remainingDigits } from '../../lib/numerics/conditioning.ts';
import { SPECTRAL_TARGETS, smallestK } from '../../lib/numerics/spectral.ts';
import { gridEvaluations } from '../../lib/numerics/monte-carlo.ts';
import { recoverDecayLambda } from '../../lib/numerics/adjoint.ts';

/**
 * Named quantities for `<Estimate>`.
 *
 * Every answer is COMPUTED from `src/lib/numerics`, never typed in. An
 * estimation question whose "true" value was hand-entered is a trivia
 * question wearing a slider.
 */

export interface EstimateScenario {
  /** What is being estimated, in the learner's terms. */
  quantity: string;
  unit?: string;
  /** Slider bounds, as powers of ten. */
  logRange: [number, number];
  logStart: number;
  /** The truth. Computed, not authored. */
  truth: () => number;
  /** Counts as close enough if within this multiplicative factor. */
  withinFactor: number;
  /** Optional reference points so the scale means something. */
  landmarks?: { value: number; label: string }[];
}

/* How much work does forward Euler need for a given accuracy? The point is
   that first order is ruinously expensive at tight tolerances, and most people
   underestimate it by several orders of magnitude. */
const eulerWorkFor1e6: EstimateScenario = {
  quantity: 'f-evaluations forward Euler needs to reach 10⁻⁶ error on y′ = −y over t ∈ [0, 5]',
  logRange: [2, 9],
  logStart: 4,
  withinFactor: 6,
  landmarks: [
    { value: 1e3, label: 'a thousand' },
    { value: 1e5, label: '100k' },
    { value: 1e7, label: '10M' },
  ],
  truth: () => {
    // Error ≈ C·h for a first-order method: fit C from a measured point, then
    // solve for the h that hits the target and convert to evaluations.
    const problem = decay(1);
    const hProbe = 1e-3;
    const C = endpointError(forwardEuler, problem, hProbe) / hProbe;
    const hNeeded = 1e-6 / C;
    return (problem.span / hNeeded) * forwardEuler.cost;
  },
};

/* The same question for RK4 — the contrast is the lesson. */
const rk4WorkFor1e6: EstimateScenario = {
  quantity: 'f-evaluations RK4 needs for the SAME 10⁻⁶ error on the same problem',
  logRange: [0, 7],
  logStart: 3.5,
  withinFactor: 6,
  landmarks: [
    { value: 1e1, label: 'ten' },
    { value: 1e3, label: 'a thousand' },
    { value: 1e5, label: '100k' },
  ],
  truth: () => {
    const problem = decay(1);
    const hProbe = 0.05;
    const C = endpointError(rk4, problem, hProbe) / hProbe ** 4;
    const hNeeded = (1e-6 / C) ** (1 / 4);
    return (problem.span / hNeeded) * rk4.cost;
  },
};

/* Machine epsilon, from the other direction: how many decimal digits does a
   double actually carry? People routinely say "about 32". */
const doubleDigits: EstimateScenario = {
  quantity: 'significant decimal digits a float64 carries',
  logRange: [0, 2],
  logStart: 1.4,
  withinFactor: 1.35,
  landmarks: [
    { value: 7, label: 'float32' },
    { value: 16, label: '?' },
  ],
  truth: () => -Math.log10(Number.EPSILON),
};

/* Rule of thumb from Trefethen Thm 15.1: a backward-stable algorithm keeps
   −log₁₀(κ ε) digits. For the lesson 2×2 that is about seven, not sixteen. */
const ill2x2Digits: EstimateScenario = {
  quantity: 'correct decimal digits a backward-stable float64 solve can promise for the 2×2 with ε = 10⁻⁸',
  logRange: [0, 2],
  logStart: 1.2,
  withinFactor: 1.5,
  landmarks: [
    { value: 1, label: 'one' },
    { value: 8, label: 'half' },
    { value: 16, label: 'all 16' },
  ],
  truth: () => remainingDigits(condInf(ill2x2().A)),
};

/* How many Fourier modes does spectral accuracy actually need? Finite-difference
   instinct says thousands. The answer is a dozen. */
const specModesForEps: EstimateScenario = {
  quantity: 'Fourier modes K needed so that ||S_K − e^{sin x}||_∞ drops below 10⁻¹² on [0, 2π]',
  logRange: [0, 4],
  logStart: 2.4,
  withinFactor: 2.5,
  landmarks: [
    { value: 12, label: 'a dozen' },
    { value: 100, label: '100' },
    { value: 1000, label: '1000' },
  ],
  truth: () => smallestK(SPECTRAL_TARGETS.expSin, 1e-12),
};

/* The curse as a number: four points per axis feels modest until you raise
   it to the tenth power. Computed from the same n^d the grid actually spends. */
const gridCostD10N4: EstimateScenario = {
  quantity: 'function evaluations a 4-point-per-axis product grid spends in 10 dimensions',
  logRange: [3, 8],
  logStart: 4.3,
  withinFactor: 5,
  landmarks: [
    { value: 1e4, label: 'ten thousand' },
    { value: 1e6, label: 'a million' },
    { value: 1e8, label: 'a hundred million' },
  ],
  truth: () => gridEvaluations(4, 10),
};

/* Four adjoint steps from a deliberately bad guess. The number is computed
   from the same recoverDecayLambda the inverse lab runs — not typed in. */
const recoveredLambdaError: EstimateScenario = {
  quantity: '|λ − 2| after 4 adjoint gradient steps, starting from λ = 0.5 on y′ = −λy',
  logRange: [-4, 0.5],
  logStart: 0,
  withinFactor: 4,
  landmarks: [
    { value: 1, label: 'still at the start' },
    { value: 0.1, label: 'a tenth' },
    { value: 0.001, label: 'a thousandth' },
  ],
  truth: () => Math.abs(recoverDecayLambda(2, 0.5, { steps: 4, method: 'rk4' }).lambda - 2),
};

export const ESTIMATE_SCENARIOS: Record<string, EstimateScenario> = {
  'euler-work-1e6': eulerWorkFor1e6,
  'rk4-work-1e6': rk4WorkFor1e6,
  'double-digits': doubleDigits,
  'ill-2x2-digits': ill2x2Digits,
  'spec-modes-for-eps': specModesForEps,
  'grid-cost-d10-n4': gridCostD10N4,
  'ad-recovered-lambda': recoveredLambdaError,
};
