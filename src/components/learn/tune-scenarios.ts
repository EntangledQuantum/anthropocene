import type { Series } from '../viz/chart-core.ts';
import type { AxisSpec } from '../viz/chart-core.ts';
import type { ParamSpec } from '../viz/controls.tsx';
import { SCHEMES, TARGETS, diffSweep, hSweep } from '../../lib/numerics/diff.ts';
import { integrate, forwardEuler, backwardEuler } from '../../lib/numerics/ode.ts';
import { decay, twoRate, TWO_RATE_FAST } from '../../lib/numerics/problems.ts';
import { norm2, sub } from '../../lib/numerics/types.ts';
import {
  ILL_EPS,
  condInf,
  ill2x2,
  naiveNearRoot,
  quadraticStable,
  relRootError,
  solveIllPerturbed,
} from '../../lib/numerics/conditioning.ts';

/**
 * Named scenarios for `<Tune>`.
 *
 * Astro serialises island props as JSON, so a lesson cannot hand a widget a
 * `compute` function. Instead a lesson names a scenario and the computation
 * lives here, in client code. Adding a `<Tune>` interaction means adding an
 * entry to this registry — see AGENTS.md.
 */

export interface TuneScenario {
  param: ParamSpec;
  target: number;
  tolerance: number;
  x: AxisSpec;
  y: AxisSpec;
  rules?: { x?: number; y?: number; label?: string; color?: string }[];
  compute: (value: number) => { series: Series[]; readouts?: { label: string; value: string }[] };
}

/* ── the finite-difference U-curve ─────────────────────────────────────── */

const fdSweep = hSweep(1e-1, 1e-16, 6);
const forwardScheme = SCHEMES.find((s) => s.key === 'forward')!;

const fdOptimum: TuneScenario = {
  param: { key: 'logh', label: 'step size', symbol: 'log₁₀ h', min: -16, max: -1, step: 0.25, value: -2 },
  target: -7.8,          // log10(sqrt(eps)) ≈ -7.83
  tolerance: 0.075,      // ±0.6 in log10 — a decade-scale hunt, not a pixel hunt
  x: { label: 'log₁₀ h' },
  y: { label: 'log₁₀ |error|' },
  compute: (logh: number) => {
    const curve = diffSweep(forwardScheme, TARGETS.sin, fdSweep);
    const h = 10 ** logh;
    const err = diffSweep(forwardScheme, TARGETS.sin, [h])[0].error;

    return {
      series: [
        {
          key: 'curve', label: 'forward difference', color: 'cyan',
          points: curve.map((p) => [Math.log10(p.h), Math.log10(p.error)] as const),
        },
        {
          key: 'you', label: 'your h', color: 'magenta', style: 'dots', width: 5,
          points: [[logh, Math.log10(err)]],
        },
      ],
      readouts: [
        { label: 'h', value: h.toExponential(2) },
        { label: '|error|', value: err.toExponential(3) },
      ],
    };
  },
};

/* ── the forward-Euler stability cliff ─────────────────────────────────── */

const eulerStability: TuneScenario = {
  param: { key: 'h', label: 'step size', symbol: 'h', min: 0.005, max: 0.12, step: 0.001, value: 0.01 },
  target: 2 / 50,        // forward Euler on y' = -50y is stable iff h < 2/λ
  tolerance: 0.06,
  x: { label: 't' },
  y: { label: 'y' },
  rules: [{ y: 0, color: 'rgba(242,238,247,0.35)' }],
  compute: (h: number) => {
    const problem = decay(50);
    const run = integrate(forwardEuler, problem.f, problem.y0, 0, 2, h);
    const peak = Math.max(...run.y.map((s) => Math.abs(s[0])));

    return {
      series: [
        {
          key: 'euler', label: `forward Euler, h = ${h.toFixed(3)}`, color: peak > 1.001 ? 'magenta' : 'cyan',
          points: run.t.map((t, i) => [t, run.y[i][0]] as const),
        },
        {
          key: 'exact', label: 'exact', color: 'ink', dash: [3, 3], width: 1,
          points: Array.from({ length: 200 }, (_, i) => {
            const t = (2 * i) / 199;
            return [t, Math.exp(-50 * t)] as const;
          }),
        },
      ],
      readouts: [
        { label: 'hλ', value: (h * 50).toFixed(3) },
        { label: 'peak |y|', value: peak.toExponential(2) },
        { label: 'behaviour', value: peak > 1.001 ? 'growing' : 'decaying' },
      ],
    };
  },
};

/* ── nearly-singular 2×2: the algorithm is not a variable ─────────────── */

const logspace = (a: number, b: number, n: number) =>
  Array.from({ length: n }, (_, i) => a * (b / a) ** (i / (n - 1)));

const ill = ill2x2();
const illKappa = condInf(ill.A);
const deltaMin = 1e-12;
const deltaMax = 3e-8;
const illSweep = logspace(deltaMin, deltaMax, 80).map((d) => {
  const x = solveIllPerturbed(d)!;
  return { d, x1: x[0], x2: x[1] };
});

const ill2x2Perturb: TuneScenario = {
  param: {
    key: 'delta', label: 'perturbation of b₂', symbol: 'δ',
    min: deltaMin, max: deltaMax, step: 1e-12, value: 1e-12, log: true,
  },
  target: ILL_EPS,
  tolerance: 0.22,
  x: { label: 'δ', scale: 'log', domain: [deltaMin, deltaMax] },
  y: { label: 'x', domain: [-1.3, 3.2] },
  rules: [
    { y: 0, label: 'x₂ unperturbed', color: 'rgba(242,238,247,0.35)' },
    { y: 1, label: 'x₂ = 1', color: 'rgba(255,77,158,0.55)' },
    { y: 2, label: 'x₁ unperturbed', color: 'rgba(242,238,247,0.35)' },
  ],
  compute: (delta: number) => {
    const x = solveIllPerturbed(delta)!;
    const relB = Math.abs(delta) / norm2(ill.b);
    const relX = norm2(sub(x, ill.xExact)) / norm2(ill.xExact);
    return {
      series: [
        {
          key: 'x1', label: 'x₁', color: 'cyan',
          points: illSweep.map((p) => [p.d, p.x1] as const),
        },
        {
          key: 'x2', label: 'x₂', color: 'magenta',
          points: illSweep.map((p) => [p.d, p.x2] as const),
        },
        {
          key: 'now', label: 'your δ', color: 'warn', style: 'dots', width: 6,
          points: [[delta, x[0]], [delta, x[1]]],
        },
      ],
      readouts: [
        { label: 'x₁', value: x[0].toFixed(4) },
        { label: 'x₂', value: x[1].toFixed(4) },
        { label: 'κ_∞', value: illKappa.toExponential(2) },
        { label: '‖Δb‖/‖b‖', value: relB.toExponential(2) },
        { label: '‖Δx‖/‖x‖', value: relX.toExponential(2) },
      ],
    };
  },
};

/* ── textbook quadratic vs Vieta rearrangement ────────────────────────── */

const quadExampleB = 1e8;
const quadBs = logspace(10, 1e10, 90);
const quadSweep = quadBs.map((b) => {
  const truth = quadraticStable(1, b, 1).near;
  const naive = Math.max(relRootError(naiveNearRoot(1, b, 1), truth), 1e-18);
  const stable = Math.max(relRootError(quadraticStable(1, b, 1).near, truth), 1e-18);
  return { b, naive, stable };
});

const quadNaiveCliff: TuneScenario = {
  param: {
    key: 'b', label: 'linear coefficient', symbol: '|b|',
    min: 10, max: 1e10, step: 1, value: 20, log: true,
  },
  // The worked example in the lesson. The interesting event is not a
  // smooth threshold — naive error is quantized by ulps — so the hunt
  // is "go to the polynomial you just saw" rather than a cliff-edge.
  target: quadExampleB,
  tolerance: 0.12,
  x: { label: '|b|', scale: 'log', domain: [10, 1e10] },
  y: { label: 'relative error of small root', scale: 'log', domain: [1e-17, 2] },
  rules: [
    { y: Number.EPSILON, label: 'machine ε', color: 'rgba(242,238,247,0.4)' },
  ],
  compute: (b: number) => {
    const truth = quadraticStable(1, b, 1).near;
    const naive = naiveNearRoot(1, b, 1);
    const naiveErr = Math.max(relRootError(naive, truth), 1e-18);
    const stableErr = 1e-18;
    return {
      series: [
        {
          key: 'naive', label: 'textbook ±', color: 'magenta',
          points: quadSweep.map((p) => [p.b, p.naive] as const),
        },
        {
          key: 'stable', label: 'rearranged', color: 'cyan',
          points: quadSweep.map((p) => [p.b, p.stable] as const),
        },
        {
          key: 'you', label: 'your |b|', color: 'warn', style: 'dots', width: 6,
          points: [[b, naiveErr], [b, stableErr]],
        },
      ],
      readouts: [
        { label: '|b|', value: b.toExponential(2) },
        { label: 'textbook root', value: naive.toExponential(3) },
        { label: 'rearranged root', value: truth.toExponential(3) },
        { label: 'textbook error', value: naiveErr.toExponential(2) },
      ],
    };
  },
};

/* ── two-rate stiffness cliff ──────────────────────────────────────────── */

const clip = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

const twoRateCliff: TuneScenario = {
  param: {
    key: 'h', label: 'step size', symbol: 'h',
    min: 0.001, max: 0.12, step: 0.0005, value: 0.05, log: true,
    hint: 'A step that looks generous for the slow clock. The fast one disagrees.',
  },
  target: 2 / TWO_RATE_FAST,   // forward Euler dies when h λ_fast > 2
  tolerance: 0.2,
  x: { label: 't' },
  y: { label: 'y' },
  rules: [{ y: 0, color: 'rgba(242,238,247,0.35)' }],
  compute: (h: number) => {
    const problem = twoRate();
    const fe = integrate(forwardEuler, problem.f, problem.y0, 0, 2, h);
    const be = integrate(backwardEuler, problem.f, problem.y0, 0, 2, h);
    const peakSlow = Math.max(...fe.y.map((s) => Math.abs(s[0])));
    const growing = peakSlow > 1.5 || fe.diverged;

    return {
      series: [
        {
          key: 'fe-slow', label: 'forward Euler, slow', color: growing ? 'magenta' : 'orchid',
          points: fe.t.map((t, i) => [t, clip(fe.y[i][0], -3, 3)] as const),
        },
        {
          key: 'fe-fast', label: 'forward Euler, fast', color: 'iris',
          points: fe.t.map((t, i) => [t, clip(fe.y[i][1], -3, 3)] as const),
        },
        {
          key: 'be-slow', label: 'backward Euler, slow', color: 'cyan',
          points: be.t.map((t, i) => [t, clip(be.y[i][0], -3, 3)] as const),
        },
        {
          key: 'exact-slow', label: 'exact slow', color: 'ink', dash: [3, 3], width: 1,
          points: Array.from({ length: 200 }, (_, i) => {
            const t = (2 * i) / 199;
            return [t, problem.exact!(t)[0]] as const;
          }),
        },
      ],
      readouts: [
        { label: 'h λ_fast', value: (h * TWO_RATE_FAST).toFixed(2) },
        { label: 'peak |slow|', value: peakSlow.toExponential(2) },
        { label: 'forward Euler', value: growing ? 'growing' : 'decaying' },
      ],
    };
  },
};

export const TUNE_SCENARIOS: Record<string, TuneScenario> = {
  'fd-optimum': fdOptimum,
  'euler-stability': eulerStability,
  'ill-2x2-perturb': ill2x2Perturb,
  'quad-naive-cliff': quadNaiveCliff,
  'two-rate-cliff': twoRateCliff,
};
