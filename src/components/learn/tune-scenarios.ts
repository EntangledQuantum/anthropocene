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
import {
  COMPARISON_BUDGET,
  crossoverDimension,
  finestGrid,
  gridRelativeError,
  gridSweep,
  mcRelativeRmse,
} from '../../lib/numerics/monte-carlo.ts';
import { densityAtVanishingPressure, latticePressure } from '../../lib/numerics/md.ts';
import { hWhereRadiusFallsBelow, pendulumRadiusAt } from '../../lib/numerics/constraints.ts';
import { runAdvection, runHeat } from '../../lib/numerics/pde1d.ts';
import { neumannGhostTarget, residualWithTrialGhost } from '../../lib/numerics/stencil-bc.ts';
import {
  cloneMac,
  divergence,
  jacobiItersUntil,
  jacobiSweep,
  makeField,
  maxAbsDiv,
  subtractGradient,
} from '../../lib/numerics/projection.ts';
import { flipWhereKeFraction, opposingKeRemaining } from '../../lib/numerics/mpm.ts';
import {
  DEMO_N, JACOBI_SMOOTH_OMEGA, jacobiDamping, jacobiSmoothingFactor,
  cgHistory, dirichletKappa, dirichletPoisson, preconditionedKappa, ssorOmega,
} from '../../lib/numerics/iterative.ts';
import {
  cond2Gram, gram, gramExcess, householderQR, lostColumnEps,
  nearParallelPair, r22Abs,
} from '../../lib/numerics/qr.ts';

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

/* ── Monte Carlo vs product grid as dimension climbs ───────────────────── */

const mcCrossover: TuneScenario = {
  param: { key: 'd', label: 'dimension', symbol: 'd', min: 1, max: 12, step: 1, value: 1 },
  target: crossoverDimension(COMPARISON_BUDGET),
  tolerance: 0.08,   // integer d; only the exact crossover checks
  x: { label: 'N (evaluations)', scale: 'log', domain: [4, 8192] },
  y: { label: 'relative error', scale: 'log', domain: [1e-4, 0.4] },
  compute: (dRaw: number) => {
    const d = Math.round(dRaw);
    const grid = gridSweep(d, COMPARISON_BUDGET);
    const { n, N } = finestGrid(d, COMPARISON_BUDGET);
    const mcN = Array.from({ length: 40 }, (_, i) => 8 * 2 ** ((i / 39) * Math.log2(COMPARISON_BUDGET / 8)));
    const gridErr = n === 0 ? Number.POSITIVE_INFINITY : gridRelativeError(d, n);
    const mcErr = mcRelativeRmse(d, n === 0 ? COMPARISON_BUDGET : N);
    const mcWins = n === 0 || mcErr < gridErr;

    return {
      series: [
        {
          key: 'mc', label: 'Monte Carlo RMSE', color: 'magenta',
          points: mcN.map((Nv) => [Nv, mcRelativeRmse(d, Nv)] as const),
        },
        {
          key: 'grid', label: 'product midpoint', color: 'cyan', style: 'line+dots', width: 3,
          points: grid.map((p) => [p.N, p.err] as const),
        },
      ],
      readouts: [
        { label: 'n / axis', value: n === 0 ? 'cannot fit' : String(n) },
        { label: 'N grid', value: n === 0 ? '—' : String(N) },
        { label: 'grid error', value: n === 0 ? '—' : gridErr.toExponential(2) },
        { label: 'MC RMSE', value: mcErr.toExponential(2) },
        { label: 'winner', value: mcWins ? 'Monte Carlo' : 'grid' },
      ],
    };
  },
};

/* ── LJ lattice: hunt the density where attractions cancel kinetic pressure ─ */

const LJ_TUNE_T = 0.5;
const ljZeroPressureRho = densityAtVanishingPressure(LJ_TUNE_T);

const mdVanishingPressure: TuneScenario = {
  param: { key: 'rho', label: 'density', symbol: 'ρ', min: 0.18, max: 0.55, step: 0.01, value: 0.20,
           hint: 'Number density of a square lattice. Compress until the virial cancels ρT.' },
  target: ljZeroPressureRho,
  tolerance: 0.1,
  x: { label: 'ρ', domain: [0.18, 0.9] },
  y: { label: 'P' },
  rules: [{ y: 0, color: 'rgba(242,238,247,0.35)', label: 'P = 0' }],
  compute: (rho: number) => {
    const rhos: number[] = [];
    for (let r = 0.18; r <= 0.9 + 1e-12; r += 0.02) rhos.push(Number(r.toFixed(2)));
    const Pof = (r: number) => latticePressure(r, LJ_TUNE_T);
    const P = Pof(rho);
    const ideal = rho * LJ_TUNE_T;
    return {
      series: [
        {
          key: 'lj', label: 'LJ lattice P', color: 'cyan',
          points: rhos.map((r) => [r, Pof(r)] as const),
        },
        {
          key: 'ideal', label: 'ideal gas ρT', color: 'ink', dash: [3, 3], width: 1,
          points: rhos.map((r) => [r, r * LJ_TUNE_T] as const),
        },
        {
          key: 'you', label: 'your ρ', color: 'magenta', style: 'dots', width: 6,
          points: [[rho, P]],
        },
      ],
      readouts: [
        { label: 'ρ', value: rho.toFixed(2) },
        { label: 'P', value: P.toFixed(3) },
        { label: 'ρT', value: ideal.toFixed(3) },
        { label: 'P − ρT', value: (P - ideal).toFixed(3) },
      ],
    };
  },
};

/* ── index-reduced RK4 walks off the circle; hunt the h where |q| = 0.95 ─ */

const CONS_TUNE_SPAN = 30;
const CONS_TUNE_R = 0.95;
const consDriftHTarget = hWhereRadiusFallsBelow(CONS_TUNE_R, CONS_TUNE_SPAN);

const consDriftH: TuneScenario = {
  param: { key: 'h', label: 'step size', symbol: 'h', min: 0.05, max: 0.36, step: 0.005, value: 0.08,
           hint: 'Index-reduced RK4. Find the h at which |q| has fallen to 0.95 by t = 30.' },
  target: consDriftHTarget,
  tolerance: 0.12,
  x: { label: 'h', domain: [0.05, 0.36] },
  y: { label: '|q| at t = 30', domain: [0.58, 1.12] },
  rules: [
    { y: 1, color: 'rgba(159,232,112,0.4)', label: 'circle' },
    { y: 0.95, color: 'rgba(242,238,247,0.35)', label: '|q| = 0.95' },
  ],
  compute: (h: number) => {
    const hs: number[] = [];
    for (let v = 0.05; v <= 0.36 + 1e-12; v += 0.01) hs.push(Number(v.toFixed(3)));
    const rad = (hv: number) => {
      const r = pendulumRadiusAt('index-rk4', hv, CONS_TUNE_SPAN);
      if (!Number.isFinite(r) || r > 2) return 0.58;
      return r;
    };
    const r = rad(h);
    return {
      series: [
        {
          key: 'r', label: '|q|', color: 'cyan',
          points: hs.map((hv) => [hv, rad(hv)] as const),
        },
        {
          key: 'you', label: 'your h', color: 'magenta', style: 'dots', width: 6,
          points: [[h, r]],
        },
      ],
      readouts: [
        { label: 'h', value: h.toFixed(3) },
        { label: '|q|', value: r.toFixed(4) },
        { label: '|q| − 1', value: (r - 1).toExponential(2) },
      ],
    };
  },
};

const capField = (v: number) => (Number.isFinite(v) ? Math.max(-8, Math.min(8, v)) : 8);

/* ── CFL: hunt the upwind cliff at ν = 1 ──────────────────────────────── */

const cflUpwindCliff: TuneScenario = {
  param: {
    key: 'cfl', label: 'CFL number', symbol: 'ν', min: 0.2, max: 1.6, step: 0.02, value: 0.45,
    hint: 'How many mesh cells the bump travels in one step.',
  },
  target: 1,
  tolerance: 0.08,
  x: { label: 'x', domain: [0, 1] },
  y: { label: 'u', domain: [-0.3, 1.4] },
  compute: (cfl: number) => {
    const run = runAdvection({ scheme: 'upwind', cfl, n: 80, tEnd: 0.45, nyquist: 1e-4 });
    const blown = run.diverged || run.maxAbs > 1.6;
    return {
      series: [
        {
          key: 'exact', label: 'exact', color: 'ink', dash: [3, 3], width: 1,
          points: (run.exact ?? []).map((u, i) => [run.x[i]!, u] as const),
        },
        {
          key: 'upwind', label: blown ? 'upwind (exploded)' : 'upwind',
          color: blown ? 'magenta' : 'cyan',
          points: run.u.map((u, i) => [run.x[i]!, capField(u)] as const),
        },
      ],
      readouts: [
        { label: 'ν', value: cfl.toFixed(2) },
        { label: '‖u‖∞', value: run.diverged ? '∞' : run.maxAbs.toFixed(3) },
        { label: 'peak', value: run.diverged ? '—' : run.height.toFixed(3) },
        { label: 'behaviour', value: blown ? 'exploding' : (cfl < 0.95 ? 'smearing' : 'translating') },
      ],
    };
  },
};

/* ── heat FTCS: hunt r = 1/2 ──────────────────────────────────────────── */

const cflHeatR: TuneScenario = {
  param: {
    key: 'r', label: 'diffusion number', symbol: 'r', min: 0.2, max: 0.8, step: 0.01, value: 0.28,
    hint: 'r = α Δt / Δx². The checkerboard mode of FTCS heat dies when r exceeds 1/2.',
  },
  target: 0.5,
  tolerance: 0.08,
  x: { label: 'x', domain: [0, 1] },
  y: { label: 'u', domain: [-0.3, 1.4] },
  compute: (r: number) => {
    const run = runHeat({ r, n: 64, nSteps: 200, nyquist: 1e-3 });
    const blown = run.diverged || run.maxAbs > 1.6;
    return {
      series: [
        {
          key: 'u0', label: 'initial', color: 'ink', dash: [3, 3], width: 1,
          points: run.u0.map((u, i) => [run.x[i]!, u] as const),
        },
        {
          key: 'heat', label: blown ? 'FTCS (exploded)' : 'FTCS heat',
          color: blown ? 'magenta' : 'cyan',
          points: run.u.map((u, i) => [run.x[i]!, capField(u)] as const),
        },
      ],
      readouts: [
        { label: 'r', value: r.toFixed(2) },
        { label: '‖u‖∞', value: run.diverged ? '∞' : run.maxAbs.toFixed(3) },
        { label: 'behaviour', value: blown ? 'exploding' : 'diffusing' },
      ],
    };
  },
};

/* ── hunt the Neumann ghost ────────────────────────────────────────────── */

const GHOST_N = 8;
const ghostNeumannValue: TuneScenario = {
  param: {
    key: 'ghost', label: 'ghost value', symbol: 'u₋₁', min: 0.05, max: 1.6, step: 0.01, value: 0.28,
    hint: 'Fictitious sample at x = −h. The centred wall stencil is (u₋₁ − 2u₀ + u₁)/h².',
  },
  target: neumannGhostTarget(GHOST_N),
  tolerance: 0.07,
  x: { label: 'x', domain: [0, 1] },
  y: { label: 'residual D²u − u″' },
  compute: (ghost: number) => {
    const { x, residual, wall } = residualWithTrialGhost(GHOST_N, ghost);
    const target = neumannGhostTarget(GHOST_N);
    return {
      series: [
        {
          key: 'interior', label: 'centred residual', color: 'cyan',
          points: x.slice(1, -1).map((xi, i) => [xi, residual[i + 1]!] as const),
        },
        {
          key: 'wall', label: 'wall residual', color: 'magenta', style: 'dots', width: 7,
          points: [[0, wall]],
        },
      ],
      readouts: [
        { label: 'u₋₁', value: ghost.toFixed(3) },
        { label: 'target', value: target.toFixed(3) },
        { label: 'wall residual', value: wall.toExponential(2) },
        { label: 'interior max', value: Math.max(...residual.slice(1, -1).map(Math.abs)).toExponential(2) },
      ],
    };
  },
};

/* ── Jacobi is not the Helmholtz projection ─────────────────────────────
   Local averaging of the Poisson residual. The leftover max|div| drops,
   slowly, because the lowest mode of the 5-point Laplacian is barely
   damped. Spectral projection sits at roundoff after one solve. */

const JACOBI_N = 16;
const JACOBI_MAX = 160;
const jacobiLeftover = (() => {
  const g = makeField('mixed', JACOBI_N);
  const div0 = maxAbsDiv(g);
  const rhs = divergence(g);
  let phi: Float64Array = new Float64Array(JACOBI_N * JACOBI_N);
  const pts: (readonly [number, number])[] = [[0, Math.log10(Math.max(div0, 1e-16))]];
  for (let k = 1; k <= JACOBI_MAX; k++) {
    phi = jacobiSweep(phi, rhs, JACOBI_N, 1 / JACOBI_N);
    const trial = cloneMac(g);
    subtractGradient(trial, phi);
    pts.push([k, Math.log10(Math.max(maxAbsDiv(trial), 1e-16))]);
  }
  return { pts, div0, target: jacobiItersUntil(0.01, JACOBI_N, 'mixed') };
})();

const projJacobiOnePercent: TuneScenario = {
  param: {
    key: 'iters', label: 'Jacobi sweeps', symbol: 'k', min: 4, max: JACOBI_MAX, step: 1, value: 16,
    hint: 'Each sweep locally averages the Poisson residual. The slow mode is the one that takes forever.',
  },
  target: jacobiLeftover.target,
  tolerance: 0.18,
  x: { label: 'Jacobi sweeps', domain: [0, JACOBI_MAX] },
  y: { label: 'log₁₀ max |∇·u|', domain: [-3.2, 0.5] },
  rules: [
    { y: Math.log10(jacobiLeftover.div0 * 0.01), label: '1% of start', color: 'magenta' },
  ],
  compute: (iters: number) => {
    const k = Math.max(0, Math.min(JACOBI_MAX, Math.round(iters)));
    const pt = jacobiLeftover.pts[k]!;
    return {
      series: [
        {
          key: 'curve', label: 'Jacobi leftover', color: 'cyan',
          points: jacobiLeftover.pts,
        },
        {
          key: 'you', label: 'your k', color: 'magenta', style: 'dots', width: 5,
          points: [pt],
        },
      ],
      readouts: [
        { label: 'k', value: String(k) },
        { label: 'max |∇·u|', value: (10 ** pt[1]).toExponential(2) },
      ],
    };
  },
};

/* PIC (α = 0) kills the opposing pair's KE; FLIP (α = 1) keeps it. Hunt the
   blend where half survives — a number the transfer, not a material, sets. */
const mpmFlipHalfKe: TuneScenario = {
  param: {
    key: 'flip', label: 'FLIP fraction', symbol: 'α', min: 0, max: 1, step: 0.02, value: 0.15,
    hint: '0 overwrites particle velocity with the interpolated grid field (PIC). 1 adds only the grid increment (FLIP).',
  },
  target: flipWhereKeFraction(0.5),
  tolerance: 0.12,
  x: { label: 'α', domain: [0, 1] },
  y: { label: 'KE / KE₀', domain: [0, 1.08] },
  rules: [{ y: 0.5, label: 'half remains' }],
  compute: (flip: number) => {
    const curve: [number, number][] = [];
    for (let k = 0; k <= 40; k++) {
      const a = k / 40;
      curve.push([a, opposingKeRemaining(a)]);
    }
    const ke = opposingKeRemaining(flip);
    return {
      series: [
        { key: 'curve', label: 'remaining KE', color: 'cyan', points: curve },
        { key: 'you', label: 'your α', color: 'magenta', style: 'dots', width: 6, points: [[flip, ke]] },
      ],
      readouts: [
        { label: 'α', value: flip.toFixed(2) },
        { label: 'KE / KE₀', value: ke.toFixed(3) },
      ],
    };
  },
};

/* Hunt ω that equalises |μ| at k = n/2 and at Nyquist. That is ω = 2/3,
   and the high-k band then sits at 1/3 — the smoothing factor. */
const jacOmegaSmooth: TuneScenario = {
  param: {
    key: 'omega', label: 'Jacobi weight', symbol: 'ω', min: 0.25, max: 1, step: 0.01, value: 1,
    hint: 'ω = 1 is a full Jacobi step. Smaller ω damps the Nyquist mode; too small leaves k = n/2.',
  },
  target: JACOBI_SMOOTH_OMEGA,
  tolerance: 0.08,
  x: { label: 'mode k', domain: [1, DEMO_N] },
  y: { label: '|μ_k|', domain: [0, 1.08] },
  rules: [
    { x: Math.ceil(DEMO_N / 2), label: 'high-k', color: 'rgba(255,77,158,0.45)' },
    { y: 1 / 3, label: '1/3' },
  ],
  compute: (omega: number) => {
    const mag = Array.from({ length: DEMO_N }, (_, i) => {
      const k = i + 1;
      return [k, Math.abs(jacobiDamping(k, DEMO_N, omega))] as const;
    });
    const highMax = jacobiSmoothingFactor(DEMO_N, omega);
    return {
      series: [
        { key: 'mu', label: '|μ_k|', color: 'cyan', points: mag },
      ],
      readouts: [
        { label: 'ω', value: omega.toFixed(2) },
        { label: 'high-k max |μ|', value: highMax.toFixed(3) },
        { label: '|μ_1|', value: Math.abs(jacobiDamping(1, DEMO_N, omega)).toFixed(4) },
      ],
    };
  },
};

/* Finite termination: n = 8, residual first drops below 10⁻¹⁰ at k = 7. */
const cgCliffRun = cgHistory(dirichletPoisson(8, 'mixed').b, 12);
const cgCliffK = cgCliffRun.findIndex((s) => s.k > 0 && s.residualNorm < 1e-10);
const cgTerminationCliff: TuneScenario = {
  param: {
    key: 'k', label: 'CG steps', symbol: 'k', min: 0, max: 12, step: 1, value: 3,
    hint: 'The Euclidean residual can wobble for a while. Then the Krylov plane is the whole space.',
  },
  target: cgCliffK,
  tolerance: 0.18,
  x: { label: 'k', domain: [0, 12] },
  y: { label: 'log₁₀ ‖r‖₂', domain: [-16.5, 1] },
  rules: [{ y: -10, label: '10⁻¹⁰', color: 'magenta' }],
  compute: (kRaw: number) => {
    const k = Math.max(0, Math.min(12, Math.round(kRaw)));
    const pt = cgCliffRun[k]!;
    return {
      series: [
        {
          key: 'curve', label: 'CG residual', color: 'magenta',
          points: cgCliffRun.map((s) => [s.k, Math.log10(Math.max(s.residualNorm, 1e-18))] as const),
        },
        {
          key: 'you', label: 'your k', color: 'cyan', style: 'dots', width: 6,
          points: [[k, Math.log10(Math.max(pt.residualNorm, 1e-18))]],
        },
      ],
      readouts: [
        { label: 'k', value: String(k) },
        { label: '‖r‖₂', value: pt.residualNorm.toExponential(2) },
      ],
    };
  },
};

/* Hunt SSOR ω that minimises κ(M⁻¹A) on the n = 16 Dirichlet Laplacian.
   The 1D-Poisson SOR optimum 2/(1+sin(π/17)) sits in the well. */
const PC_N = 16;
const pcSsorWStar = ssorOmega(PC_N);
const pcSsorKappaA = dirichletKappa(PC_N);
const pcSsorKappaCurve: [number, number][] = Array.from({ length: 36 }, (_, i) => {
  const w = 0.2 + i * 0.05;
  return [w, preconditionedKappa(PC_N, 'ssor', w)];
});
const pcSsorOmega: TuneScenario = {
  param: {
    key: 'omega', label: 'SSOR weight', symbol: 'ω', min: 0.2, max: 1.95, step: 0.05, value: 1,
    hint: 'ω = 1 is symmetric Gauss–Seidel. Too close to 0 or 2 and M stops looking like A.',
  },
  target: pcSsorWStar,
  tolerance: 0.14,
  x: { label: 'ω', domain: [0.2, 1.95] },
  y: { label: 'κ(M⁻¹A)', domain: [0, 100] },
  rules: [{ x: pcSsorWStar, label: 'ω*', color: 'magenta' }],
  compute: (omega: number) => {
    const w = Math.max(0.2, Math.min(1.95, omega));
    const k = preconditionedKappa(PC_N, 'ssor', w);
    return {
      series: [
        { key: 'curve', label: 'κ(M⁻¹A)', color: 'cyan', points: pcSsorKappaCurve },
        { key: 'you', label: 'your ω', color: 'magenta', style: 'dots', width: 6, points: [[w, k]] },
      ],
      readouts: [
        { label: 'ω', value: w.toFixed(2) },
        { label: 'κ(M⁻¹A)', value: k.toFixed(2) },
        { label: 'κ(A)', value: pcSsorKappaA.toFixed(0) },
      ],
    };
  },
};

/* ── Householder R₂₂ survives; the Gram excess ε² dies at √(ε_mach/2) ── */

const qrEpsGrid = Array.from({ length: 48 }, (_, i) => 0.2 * Math.pow(1e-10 / 0.2, i / 47));
const qrExcessCurve: [number, number][] = qrEpsGrid.map((e) => [e, Math.max(gramExcess(e), 1e-18)]);
const qrR22Curve: [number, number][] = qrEpsGrid.map((e) => [e, Math.max(r22Abs(e), 1e-18)]);
const qrLostAt = lostColumnEps();

const qrLostColumn: TuneScenario = {
  param: {
    key: 'eps', label: 'column gap', symbol: 'ε', min: 1e-10, max: 0.2, step: 1e-12, value: 0.05, log: true,
    hint: '1 + x equals 1 in float64 when x < ε_mach / 2. You want ε² just below that.',
  },
  target: qrLostAt,
  tolerance: 0.55,
  x: { label: 'ε', scale: 'log', domain: [1e-10, 0.2] },
  y: { label: '|entry|', scale: 'log', domain: [1e-18, 1] },
  compute: (eps: number) => {
    const e = Math.max(1e-10, Math.min(0.2, eps));
    const A = nearParallelPair(e);
    const G = gram(A);
    const { R } = householderQR(A);
    const excess = Math.max(Math.abs(G[0]![0]! - 1), 1e-18);
    const r22 = Math.max(Math.abs(R[1]![1]!), 1e-18);
    const kG = cond2Gram(G);
    return {
      series: [
        { key: 'excess', label: '|(AᵀA)₁₁ − 1|', color: 'magenta', points: qrExcessCurve },
        { key: 'r22', label: '|R₂₂|', color: 'cyan', points: qrR22Curve },
        { key: 'you-e', label: 'your Gram excess', color: 'magenta', style: 'dots', width: 6, points: [[e, excess]] },
        { key: 'you-r', label: 'your |R₂₂|', color: 'cyan', style: 'dots', width: 6, points: [[e, r22]] },
      ],
      readouts: [
        { label: 'ε', value: e.toExponential(2) },
        { label: '(AᵀA)₁₁', value: G[0]![0] === 1 ? '1' : G[0]![0]!.toPrecision(6) },
        { label: '|R₂₂|', value: r22.toExponential(2) },
        { label: 'κ(AᵀA)', value: Number.isFinite(kG) ? kG.toExponential(2) : '∞' },
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
  'mc-crossover': mcCrossover,
  'md-vanishing-pressure': mdVanishingPressure,
  'cons-drift-h': consDriftH,
  'cfl-upwind-cliff': cflUpwindCliff,
  'cfl-heat-r': cflHeatR,
  'ghost-neumann-value': ghostNeumannValue,
  'proj-jacobi-1pct': projJacobiOnePercent,
  'mpm-flip-half': mpmFlipHalfKe,
  'jac-omega-smooth': jacOmegaSmooth,
  'cg-termination-cliff': cgTerminationCliff,
  'pc-ssor-omega': pcSsorOmega,
  'qr-lost-column': qrLostColumn,
};
