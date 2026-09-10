import { endpointError, stepSweep } from '../../lib/numerics/convergence.ts';
import { forwardEuler, rk4, integrate, velocityVerlet, trapezoid } from '../../lib/numerics/ode.ts';
import { invariantDrift } from '../../lib/numerics/convergence.ts';
import { decay, oscillator, TWO_RATE_FAST } from '../../lib/numerics/problems.ts';
import { SCHEMES, TARGETS, complexStep, diffSweep, hSweep } from '../../lib/numerics/diff.ts';
import { SPECTRAL_TARGETS, modalSweep } from '../../lib/numerics/spectral.ts';
import { mcRmse } from '../../lib/numerics/monte-carlo.ts';
import { decayForward, decayLoss } from '../../lib/numerics/adjoint.ts';
import { runPendulum } from '../../lib/numerics/constraints.ts';
import { dependenceWidth } from '../../lib/numerics/pde-types.ts';
import { errorSweep } from '../../lib/numerics/stencil-bc.ts';
import { HAT_SKETCH_INDEX, HAT_SKETCH_NODES, hat } from '../../lib/numerics/fem1d.ts';
import { runBlob } from '../../lib/numerics/projection.ts';
import { runFvm } from '../../lib/numerics/fvm1d.ts';
import { runMuscl } from '../../lib/numerics/reconstruction.ts';
import {
  DEMO_N, JACOBI_SMOOTH_OMEGA, demoMixed, sweepHistory, zeros,
  cgHistory, dirichletPoisson, pcgHistory, hashedField,
} from '../../lib/numerics/iterative.ts';
import { twoGridHistory } from '../../lib/numerics/multigrid.ts';
import { SKETCH_X0, atanShift, logResidualHistory } from '../../lib/numerics/newton.ts';
import { demoPicture, droppedSigma } from '../../lib/numerics/svd.ts';
import { DEMO_WIND, GMRES_N, convectionProblem, gmresHistory } from '../../lib/numerics/gmres.ts';
import { riemannState } from '../../lib/numerics/riemann.ts';
import { poiseuilleSketchProfile } from '../../lib/numerics/lbm.ts';
import { residualSweep } from '../../lib/numerics/vv.ts';

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

/* Inverse-problem loss L(λ) against observations generated at λ = 2.
   A bowl touching zero at the true value — the other view of the trajectory
   mismatch. Same code the inverse lab walks downhill on. */
const decayLossBowl: SketchScenario = {
  xLabel: 'λ',
  yLabel: 'L(λ)',
  xRange: [0.25, 4],
  yRange: [-0.01, 0.12],
  tolerance: 0.028,
  anchors: [{ x: 2, y: 0, label: 'true λ' }],
  truth: () => {
    const yObs = decayForward(2).y;
    return sample(80, 0.25, 4, (lambda) => decayLoss(decayForward(lambda).y, yObs));
  },
};

/* Index-reduced RK4 on the Cartesian pendulum: |q|² − 1 walks off zero.
   Sketching this is the commitment that the discrete map does not inherit
   the manifold of the ODE. Tempting sketches sit at zero or oscillate. */
const consManifoldDrift: SketchScenario = {
  xLabel: 't',
  yLabel: '|q|² − 1',
  xRange: [0, 40],
  yRange: [-0.12, 0.04],
  tolerance: 0.028,
  anchors: [{ x: 0, y: 0, label: 'on the circle' }],
  truth: () => {
    const run = runPendulum('index-rk4', 0.2, 40);
    const stride = Math.max(1, Math.floor(run.length / 160));
    return run.filter((_, i) => i % stride === 0).map((s) => ({ x: s.t, y: 2 * s.g }));
  },
};

/* Domain of dependence of the 1D wave equation: a triangle of width 2ct.
   Drawing this is committing to the triangle, not to a name. */
const waveDodWidth: SketchScenario = {
  xLabel: 't',
  yLabel: 'width of domain of dependence',
  xRange: [0, 0.8],
  yRange: [0, 1.15],
  tolerance: 0.14,
  anchors: [{ x: 0, y: 0, label: 't = 0' }],
  truth: () => sample(80, 0, 0.8, (t) => dependenceWidth('hyperbolic', 0.5, t)),
};

/* Naive Neumann wall on Poisson: global max-error vs h, log-log. Slope 1,
   not the interior stencil's slope of 2. The first point is given so the
   learner has to commit to the slope. */
const naiveNeumannSweep = errorSweep([8, 12, 16, 24, 32, 48, 64], 'neumann', 'naive');
const naiveNeumannFirst = naiveNeumannSweep[0]!;
const ghostNaiveErrorSlope: SketchScenario = {
  xLabel: 'log₁₀ h',
  yLabel: 'log₁₀ |error|',
  xRange: [-1.85, -0.85],
  yRange: [-2.35, -1.0],
  tolerance: 0.32,
  anchors: [{
    x: Math.log10(naiveNeumannFirst.h),
    y: Math.log10(naiveNeumannFirst.error),
    label: 'n = 8',
  }],
  truth: () => naiveNeumannSweep.map((p) => ({ x: Math.log10(p.h), y: Math.log10(p.error) })),
};

const femHat: SketchScenario = {
  xLabel: 'x',
  yLabel: 'φ₂',
  xRange: [0, 1],
  yRange: [0, 1.2],
  tolerance: 0.08,
  anchors: [{ x: 0.5, y: 1, label: 'φ = 1' }],
  truth: () => sample(80, 0, 1, (x) => hat(HAT_SKETCH_NODES, HAT_SKETCH_INDEX, x)),
};

/* Conservative Burgers jump, periodic. Mass / mass₀ is identically 1 up to
   roundoff — the identity the lesson asks you to commit to as a shape. */
const fvmMassFlat: SketchScenario = {
  xLabel: 't',
  yLabel: 'M / M₀',
  xRange: [0, 0.6],
  yRange: [0.72, 1.12],
  tolerance: 0.045,
  anchors: [{ x: 0, y: 1, label: 'M₀' }],
  truth: () => runFvm({
    equation: 'burgers', scheme: 'conservative', initial: 'jump',
    n: 64, cfl: 0.4, tEnd: 0.6,
  }).history.map((s) => ({ x: s.t, y: s.ratio })),
};

const projBlobArea: SketchScenario = {
  xLabel: 't',
  yLabel: 'A / A₀',
  xRange: [0, 1],
  yRange: [0, 1.15],
  tolerance: 0.14,
  anchors: [{ x: 0, y: 1, label: 'A₀' }],
  truth: () => {
    const run = runBlob({ field: 'mixed', project: false, tEnd: 1 });
    const stride = Math.max(1, Math.floor(run.length / 80));
    return run.filter((_, i) => i % stride === 0 || i === run.length - 1)
      .map((s) => ({ x: s.t, y: s.area / s.area0 }));
  },
};

/* Weighted Jacobi on mixed k=1 + k=16 error. Residual crashes while the
   high-k dies, then sits on the long-wave floor. Linear decay to zero is
   the solver reflex this sketch is there to break. */
const jacResidualStall: SketchScenario = {
  xLabel: 'sweeps',
  yLabel: 'log₁₀ ‖r‖ / ‖r₀‖',
  xRange: [0, 40],
  yRange: [-3.1, 0.25],
  tolerance: 0.55,
  anchors: [{ x: 0, y: 0, label: 'start' }],
  truth: () => sweepHistory(
    demoMixed(DEMO_N), zeros(DEMO_N), 40, 'jacobi', JACOBI_SMOOTH_OMEGA,
  ).map((h) => ({ x: h.sweep, y: Math.log10(Math.max(h.res, 1e-16)) })),
};

/* CG on n = 8 Dirichlet Poisson. Euclidean residual wobbles, then hits
   roundoff at k = n. Jacobi on this scale is a line at the top. */
const cgN8 = cgHistory(dirichletPoisson(8, 'mixed').b, 12);
const cgResidualCliff: SketchScenario = {
  xLabel: 'k',
  yLabel: 'log₁₀ ‖r‖₂',
  xRange: [0, 12],
  yRange: [-16.5, 1],
  tolerance: 2.3,
  anchors: [{ x: 0, y: Math.log10(Math.max(cgN8[0]!.residualNorm, 1e-18)), label: '‖r₀‖' }],
  truth: () => cgN8.map((s) => ({ x: s.k, y: Math.log10(Math.max(s.residualNorm, 1e-18)) })),
};

/* SSOR-PCG on n = 16. Residual wobbles at k = 1 then crashes; the floor
   is by k = 8, not CG's cliff at k = n. */
const pcN16 = pcgHistory(dirichletPoisson(16, 'mixed').b, 16, 'ssor');
const pcSsorResidual: SketchScenario = {
  xLabel: 'k',
  yLabel: 'log₁₀ ‖r‖₂',
  xRange: [0, 16],
  yRange: [-16.5, 1],
  tolerance: 1.8,
  anchors: [{ x: 0, y: Math.log10(Math.max(pcN16[0]!.residualNorm, 1e-18)), label: '‖r₀‖' }],
  truth: () => pcN16.map((s) => ({ x: s.k, y: Math.log10(Math.max(s.residualNorm, 1e-18)) })),
};

const mgHashed = hashedField(DEMO_N, 3);
/* Two-grid residual keeps falling. The Jacobi sketch in this chapter
   floors; this one does not. Slope is the n-independent factor. */
const mgResidualCycles: SketchScenario = {
  xLabel: 'V-cycles',
  yLabel: 'log₁₀ ‖r‖ / ‖r₀‖',
  xRange: [0, 6],
  yRange: [-8, 0.3],
  tolerance: 0.9,
  anchors: [{ x: 0, y: 0, label: 'start' }],
  truth: () => twoGridHistory(mgHashed, zeros(DEMO_N), 6).map((h) => ({
    x: h.cycle,
    y: Math.log10(Math.max(h.res, 1e-16)),
  })),
};

/* Newton on arctan(x) − 1/2 from a start inside the basin. Residual
   drops 10⁻¹, 10⁻³, 10⁻⁶, 10⁻¹³ — quadratic, then a roundoff floor. */
const ntResidualCatch: SketchScenario = {
  xLabel: 'k',
  yLabel: 'log₁₀ |F|',
  xRange: [0, 8],
  yRange: [-16.5, 0.5],
  tolerance: 1.8,
  anchors: [{ x: 0, y: Math.log10(Math.max(atanShift.F([SKETCH_X0])[0]!, 1e-18)), label: '|F(x₀)|' }],
  truth: () => {
    const hist = logResidualHistory(atanShift, [SKETCH_X0], 8, { maxIter: 8, tol: 1e-18 });
    const last = hist.at(-1)!;
    const out = hist.map((s) => ({ x: s.k, y: s.logR }));
    for (let k = last.k + 1; k <= 8; k++) out.push({ x: k, y: last.logR });
    return out;
  },
};

/* 2-norm leftover after keeping k modes of the 8×8 picture: log₁₀ σ_{k+1}.
   A staircase, not a smooth decay — each dropped σ is a hard floor. */
const svdPicture = demoPicture();
const svdResidualVsRank: SketchScenario = {
  xLabel: 'rank k',
  yLabel: 'log₁₀ ‖A − Aₖ‖₂',
  xRange: [0, 7],
  yRange: [-4.2, 1.1],
  tolerance: 0.85,
  anchors: [{ x: 0, y: Math.log10(droppedSigma(svdPicture, 0)), label: 'σ₁' }],
  truth: () => Array.from({ length: 8 }, (_, k) => ({
    x: k,
    y: Math.log10(Math.max(droppedSigma(svdPicture, k), 1e-18)),
  })),
};

/* Full GMRES on n = 16 convection–diffusion. Plateau, then a cliff near
   k = n — monotone, unlike CG on the same A, which climbs. */
const gmWindy = convectionProblem(GMRES_N, DEMO_WIND);
const gmWindyHist = gmresHistory(gmWindy.applyA, gmWindy.b, GMRES_N);
const gmResidualSketch: SketchScenario = {
  xLabel: 'k',
  yLabel: 'log₁₀ ‖r‖₂',
  xRange: [0, 16],
  yRange: [-16.5, 1],
  tolerance: 2.0,
  anchors: [{ x: 0, y: Math.log10(Math.max(gmWindyHist[0]!.residualNorm, 1e-18)), label: '‖r₀‖' }],
  truth: () => gmWindyHist.map((s) => ({ x: s.k, y: Math.log10(Math.max(s.residualNorm, 1e-18)) })),
};

/* Unlimited Fromm on a periodic square pulse. TV/TV₀ starts at 1 and climbs
   as the reconstructed slope invents new extrema. minmod's curve is a ruler
   at 1 — that is a different sketch, and a different lesson beat. */
const recTvUnlimited: SketchScenario = {
  xLabel: 't',
  yLabel: 'TV / TV₀',
  xRange: [0, 0.5],
  yRange: [0.88, 1.48],
  tolerance: 0.09,
  anchors: [{ x: 0, y: 1, label: 'TV₀' }],
  truth: () => runMuscl({
    limiter: 'unlimited', initial: 'jump', n: 64, cfl: 0.4, tEnd: 0.5,
  }).history.map((s) => ({ x: s.t, y: s.ratio })),
};

/* Burgers rarefaction −1|1. Entropy forbids a jump at ξ = 0; û is the ramp
   u = ξ between the two states. A sketched shock is the entropy-violating
   stationary jump. */
const rieRarefactionFan: SketchScenario = {
  xLabel: 'ξ = x/t',
  yLabel: 'u',
  xRange: [-2, 2],
  yRange: [-1.6, 1.6],
  tolerance: 0.32,
  anchors: [{ x: -2, y: -1, label: 'u_L' }],
  truth: () => sample(81, -2, 2, (xi) => riemannState('burgers', -1, 1, xi)),
};

/* Force-driven D2Q9 channel, walls at y/H = 0 and 1. The truth is the
   measured profile, not a typed parabola — bounce-back lives on the links. */
const lbmPoiseuilleParabola: SketchScenario = {
  xLabel: 'y / H',
  yLabel: 'u / u_max',
  xRange: [0, 1],
  yRange: [-0.08, 1.18],
  tolerance: 0.16,
  anchors: [{ x: 0, y: 0, label: 'wall' }],
  truth: () => poiseuilleSketchProfile(),
};

/* Spatial MMS residual of the 3-point heat operator vs Δx, log-log.
   A slope of 2 is the verification signature of the stencil. */
const vvResidual16 = residualSweep(1, 1).find((p) => p.n === 16)!;
const vvMmsResidual: SketchScenario = {
  xLabel: 'log₁₀ Δx',
  yLabel: 'log₁₀ residual',
  xRange: [-2.05, -1.15],
  yRange: [-2.2, -0.25],
  tolerance: 0.28,
  anchors: [{ x: Math.log10(vvResidual16.dx), y: Math.log10(vvResidual16.residual), label: 'n = 16' }],
  truth: () =>
    residualSweep(1, 1)
      .filter((p) => p.residual > 0)
      .map((p) => ({ x: Math.log10(p.dx), y: Math.log10(p.residual) }))
      .sort((a, b) => a.x - b.x),
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
  'spec-jump-rate': specJumpSlope,
  'mc-error-vs-n': mcErrorVsN,
  'ad-decay-loss-bowl': decayLossBowl,
  'cons-manifold-drift': consManifoldDrift,
  'pde-wave-width': waveDodWidth,
  'ghost-naive-slope': ghostNaiveErrorSlope,
  'fem-hat': femHat,
  'proj-blob-area': projBlobArea,
  'fvm-mass-flat': fvmMassFlat,
  'jac-residual-stall': jacResidualStall,
  'cg-residual-cliff': cgResidualCliff,
  'pc-ssor-residual': pcSsorResidual,
  'mg-residual-cycles': mgResidualCycles,
  'nt-residual-catch': ntResidualCatch,
  'svd-residual-vs-rank': svdResidualVsRank,
  'gm-residual-nonsym': gmResidualSketch,
  'rec-tv-unlimited': recTvUnlimited,
  'rie-rarefaction-fan': rieRarefactionFan,
  'lbm-poiseuille-parabola': lbmPoiseuilleParabola,
  'vv-mms-residual': vvMmsResidual,
};
