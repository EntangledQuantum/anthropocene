import { endpointError } from '../../lib/numerics/convergence.ts';
import { forwardEuler, rk4 } from '../../lib/numerics/ode.ts';
import { decay } from '../../lib/numerics/problems.ts';
import { condInf, ill2x2, remainingDigits } from '../../lib/numerics/conditioning.ts';
import { SPECTRAL_TARGETS, smallestK } from '../../lib/numerics/spectral.ts';
import { gridEvaluations } from '../../lib/numerics/monte-carlo.ts';
import { recoverDecayLambda } from '../../lib/numerics/adjoint.ts';
import { rk4OrthoResidualAt } from '../../lib/numerics/constraints.ts';
import { heatKernelRatio } from '../../lib/numerics/pde-types.ts';
import { maxStableHeatDt } from '../../lib/numerics/pde1d.ts';
import { solveError } from '../../lib/numerics/stencil-bc.ts';
import { naiveFdToFemL2Ratio } from '../../lib/numerics/fem1d.ts';
import { leftoverMaxDiv } from '../../lib/numerics/projection.ts';
import { opposingKeRemaining } from '../../lib/numerics/mpm.ts';
import { JUMP_LEFT, JUMP_RIGHT, rankineHugoniot } from '../../lib/numerics/fvm1d.ts';
import { laplacianNnz } from '../../lib/numerics/operator.ts';
import {
  DEMO_N, itersToReduce, jacobiSpectralRadius,
  dirichletPoisson, jacobiStepsUntil, pcgStepsUntil,
} from '../../lib/numerics/iterative.ts';
import { twoGridReduction } from '../../lib/numerics/multigrid.ts';
import { QR_EPS, gramCond2Exact } from '../../lib/numerics/qr.ts';
import { CATCH_X0, atanShift, stepsUntil } from '../../lib/numerics/newton.ts';
import { pictureResidual2 } from '../../lib/numerics/svd.ts';
import { DEMO_RESTART, DEMO_WIND, GMRES_N, convectionProblem, gmres } from '../../lib/numerics/gmres.ts';
import { measuredPlasmaPeriod } from '../../lib/numerics/pic.ts';
import { CS, demoPoiseuille } from '../../lib/numerics/lbm.ts';
import { mmsErrorDrop } from '../../lib/numerics/vv.ts';
import { SURFACE_RHO_RATIO } from '../../lib/numerics/sph.ts';
import { restOverlapRatio } from '../../lib/numerics/dem.ts';

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

/* How far RK4 on vec(R) has left SO(3). The tempting answer is roundoff. */
const consRk4Ortho: EstimateScenario = {
  quantity: '‖RᵀR − I‖_F after RK4 on the nine entries of a rotation, constant ω, h = 0.2, t = 24',
  logRange: [-12, 0],
  logStart: -10,
  withinFactor: 6,
  landmarks: [
    { value: 1e-15, label: 'roundoff' },
    { value: 1e-8, label: 'tiny' },
    { value: 1e-3, label: 'a thousandth' },
  ],
  truth: () => rk4OrthoResidualAt(0.2, 24),
};

/* Infinite speed, exponentially small. The heat kernel at distance 1 versus
   the peak, at t = 0.05, κ = 1. People guess "zero" (a wave) or "about one"
   (infinite speed means equal). The number is exp(5). */
const heatTailRatio: EstimateScenario = {
  quantity: 'how many times smaller the 1D heat kernel is at distance 1 than at the source, after t = 0.05 with κ = 1',
  logRange: [0, 6],
  logStart: 1,
  withinFactor: 4,
  landmarks: [
    { value: 1, label: 'equal' },
    { value: 10, label: 'ten' },
    { value: 150, label: 'a hundred and fifty' },
    { value: 1e4, label: 'ten thousand' },
  ],
  truth: () => heatKernelRatio(1, 0.05),
};

/* Heat FTCS: r = α Δt / Δx² ≤ 1/2 on 200 cells of the unit interval.
   The number is the reason explicit diffusion is expensive — refine Δx
   by two and you pay four in Δt. Computed from the same bound the lab uses. */
const heatFtcsDtN200: EstimateScenario = {
  quantity: 'largest stable FTCS time step for heat on 200 cells of [0, 1], α = 1',
  logRange: [-7, -2],
  logStart: -3.2,
  withinFactor: 4,
  landmarks: [
    { value: 1e-3, label: 'a thousandth' },
    { value: 1e-5, label: '10⁻⁵' },
    { value: 1e-6, label: 'a millionth' },
  ],
  truth: () => maxStableHeatDt(1, 1 / 200),
};

/* Naive Neumann vs ghost, same 32-interval Poisson solve. The ratio is the
   order gap made into a number: first-order error over second-order error. */
const ghostNaiveRatioN32: EstimateScenario = {
  quantity: 'how many times larger the naive Neumann max-error is than the ghost max-error, 32 intervals, u = eˣ',
  logRange: [-0.3, 4],
  logStart: 0.3,
  withinFactor: 4,
  landmarks: [
    { value: 1, label: 'equal' },
    { value: 10, label: 'ten' },
    { value: 100, label: 'a hundred' },
  ],
  truth: () => solveError(32, 'neumann', 'naive') / solveError(32, 'neumann', 'ghost'),
};

/* Skip-a-neighbour FD versus P1 Galerkin, same 8 Chebyshev-mapped nodes,
   −u″ = 2. FEM is the interpolant (nodally exact); the uniform stencil is
   not. The ratio is computed from fem1d, not typed. */
const femFdL2Ratio: EstimateScenario = {
  quantity: 'L² error of skip-neighbour FD, divided by L² error of P1 FEM, on 8 Chebyshev-mapped elements for −u″ = 2',
  logRange: [0, 3],
  logStart: 0.5,
  withinFactor: 3,
  landmarks: [
    { value: 3, label: 'three' },
    { value: 10, label: 'ten' },
    { value: 30, label: 'thirty' },
    { value: 100, label: 'a hundred' },
  ],
  truth: () => naiveFdToFemL2Ratio(),
};

const projLeftoverDiv: EstimateScenario = {
  quantity: 'max |∇·u| after one spectral Helmholtz projection of the mixed 24×24 MAC field',
  logRange: [-16, 0],
  logStart: -2,
  withinFactor: 1000,
  landmarks: [
    { value: 1, label: 'the raw field' },
    { value: 1e-3, label: 'a thousandth' },
    { value: 1e-8, label: 'tiny' },
    { value: 1e-15, label: 'roundoff' },
  ],
  truth: () => leftoverMaxDiv('mixed', 'spectral'),
};

const mpmPicKe: EstimateScenario = {
  quantity: 'kinetic energy remaining after one PIC P2G–G2P of two mass-1 particles at v = ±1 in the same cell (KE₀ = 1)',
  logRange: [-3, 0.3],
  logStart: 0,
  withinFactor: 3,
  landmarks: [
    { value: 1, label: 'all of it' },
    { value: 0.25, label: 'a quarter' },
    { value: 0.0625, label: '1/16' },
  ],
  truth: () => opposingKeRemaining(0),
};

const fvmBurgersShock: EstimateScenario = {
  quantity: 'shock speed of inviscid Burgers with left state 1 and right state 0',
  logRange: [-1.2, 0.4],
  logStart: 0,
  withinFactor: 1.35,
  landmarks: [
    { value: 0.25, label: '¼' },
    { value: 0.5, label: '½' },
    { value: 1, label: 'the left state' },
  ],
  truth: () => rankineHugoniot('burgers', JUMP_LEFT, JUMP_RIGHT),
};

/* 1D Dirichlet Laplacian, 200 interior unknowns. nnz = 3n−2, not n².
   The slider starts at 10⁴ so the dense-table reflex is the first guess. */
const opLaplacianNnzN200: EstimateScenario = {
  quantity: 'nonzero entries in the 1D Dirichlet Laplacian on 200 interior unknowns',
  logRange: [1, 6],
  logStart: 4,
  withinFactor: 2,
  landmarks: [
    { value: 200, label: 'n' },
    { value: 600, label: '3n' },
    { value: 4e4, label: 'n²' },
  ],
  truth: () => laplacianNnz(200, 'dirichlet'),
};

/* Undamped Jacobi on n = 31. ρ = cos(π/32) ≈ 0.995, so cutting the long
   wave by 10× is hundreds of sweeps — the solver reflex guesses tens. */
const jacItersTenth: EstimateScenario = {
  quantity: 'undamped Jacobi sweeps to cut the k = 1 error by 10× on n = 31 Dirichlet Poisson',
  logRange: [1, 4],
  logStart: 1.5,
  withinFactor: 3,
  landmarks: [
    { value: 10, label: 'ten' },
    { value: 100, label: 'a hundred' },
    { value: 1000, label: 'a thousand' },
  ],
  truth: () => itersToReduce(jacobiSpectralRadius(DEMO_N, 1), 0.1),
};

const cgJacobiTo1e6: EstimateScenario = {
  quantity: 'Jacobi sweeps to drive ‖r‖₂ below 10⁻⁶ on the n = 8 Dirichlet Poisson (CG is already there at step 8)',
  logRange: [0, 4],
  logStart: 1,
  withinFactor: 3,
  landmarks: [
    { value: 8, label: 'CG steps' },
    { value: 80, label: 'eighty' },
    { value: 1000, label: 'a thousand' },
  ],
  truth: () => jacobiStepsUntil(dirichletPoisson(8, 'mixed').b, 1e-6, 2000),
};

const pcSsorSteps1e8: EstimateScenario = {
  quantity: 'SSOR-PCG steps to drive ‖r‖₂ below 10⁻⁸ on the n = 16 Dirichlet Poisson (CG hits it at step 16)',
  logRange: [0, 2],
  logStart: 1.2,
  withinFactor: 2,
  landmarks: [
    { value: 4, label: 'four' },
    { value: 8, label: 'eight' },
    { value: 16, label: 'CG at n' },
  ],
  truth: () => pcgStepsUntil(dirichletPoisson(16, 'mixed').b, 1e-8, 16, 'ssor'),
};

const mgRatioVsN: EstimateScenario = {
  quantity: 'two-grid residual remaining after one cycle at n = 63, divided by the same ratio at n = 15 (hashed start)',
  logRange: [-1, 2.5],
  logStart: 1.2,
  withinFactor: 3,
  landmarks: [
    { value: 1, label: 'same factor' },
    { value: 16, label: 'n² like Jacobi' },
  ],
  truth: () => twoGridReduction(63).res / twoGridReduction(15).res,
};

/* The lesson pair at ε = 10⁻⁸ has κ(A) ≈ 1.4×10⁸. Forming AᵀA squares it.
   The tempting guess is "about the same" or "maybe double". */
const qrKappaAtA: EstimateScenario = {
  quantity: 'κ₂ of AᵀA for the 3×2 pair with ε = 10⁻⁸ (κ₂(A) ≈ 1.4×10⁸)',
  logRange: [6, 20],
  logStart: 8.15,
  withinFactor: 20,
  landmarks: [
    { value: 1e8, label: 'κ(A)' },
    { value: 2e8, label: '2κ' },
    { value: 1e16, label: 'κ²' },
  ],
  truth: () => gramCond2Exact(QR_EPS),
};

const ntStepsToEps: EstimateScenario = {
  quantity: 'Newton steps from x₀ = 0.2 to drive |F| below 10⁻¹² on arctan(x) − 1/2',
  logRange: [0, 2],
  logStart: 1.15,
  withinFactor: 2,
  landmarks: [
    { value: 3, label: 'three' },
    { value: 10, label: 'ten' },
    { value: 30, label: 'thirty' },
  ],
  truth: () => stepsUntil(atanShift, [CATCH_X0], 1e-12),
};

/* Rank-2 truncation of the 8×8 picture. 2-norm leftover is σ₃, not σ₁
   and not the mean of the tail. */
const svdRank2Residual: EstimateScenario = {
  quantity: '‖A − A₂‖₂ of the 8×8 picture whose singular values are 5, 1.6, 0.4, 0.1, …',
  logRange: [-2, 2],
  logStart: 0.7,
  withinFactor: 2.5,
  landmarks: [
    { value: 5, label: 'σ₁' },
    { value: 1.6, label: 'σ₂' },
    { value: 0.4, label: 'σ₃' },
    { value: 0.1, label: 'σ₄' },
  ],
  truth: () => pictureResidual2(2),
};

/* Restart caps RAM. After 40 steps of GMRES(4) you still hold 4 vectors,
   not 40. The tempting count is the iteration index. */
const gmStoredRestart: EstimateScenario = {
  quantity: 'vectors stored after 40 steps of GMRES(4) on the n = 16 windy convection–diffusion',
  logRange: [0, 2],
  logStart: 1.4,
  withinFactor: 2,
  landmarks: [
    { value: 4, label: 'm = 4' },
    { value: 16, label: 'n' },
    { value: 40, label: 'k = 40' },
  ],
  truth: () => {
    const { applyA, b } = convectionProblem(GMRES_N, DEMO_WIND);
    return gmres(applyA, b, { maxIter: 40, restart: DEMO_RESTART }).at(-1)!.stored;
  },
};

/* Cold plasma with ω_p = 1. Period of the k=1 density mode, measured from
   the PIC run — not typed. Continuum Langmuir is 2π; the grid is close. */
const picPlasmaPeriod: EstimateScenario = {
  quantity: 'period of the k = 1 density mode of a cold plasma with ω_p = 1',
  logRange: [0, 1.5],
  logStart: 0.35,
  withinFactor: 1.4,
  landmarks: [
    { value: 1, label: '1' },
    { value: Math.PI, label: 'π' },
    { value: 2 * Math.PI, label: '2π' },
  ],
  truth: () => measuredPlasmaPeriod(),
};

/* Mid-channel speed of the demo D2Q9 Poiseuille. Tempting answers are the
   lattice speed 1 and the sound speed; the actual peak is a few percent of c_s. */
const lbmUmax: EstimateScenario = {
  quantity: 'mid-channel speed of the D2Q9 Poiseuille demo (τ = 1, bounce-back channel, g = 10⁻⁴), in lattice units',
  logRange: [-4, 0.5],
  logStart: 0,
  withinFactor: 4,
  landmarks: [
    { value: 1, label: 'lattice speed' },
    { value: CS, label: 'c_s' },
    { value: 0.01, label: '0.01' },
  ],
  truth: () => demoPoiseuille().umax,
};

/* Factor by which time-integrated MMS error falls when n doubles.
   Order 2 means 4×; the number is measured, not typed. */
const vvMmsDrop: EstimateScenario = {
  quantity: 'factor the MMS L² error falls when you double n from 32 to 64 on manufactured heat',
  logRange: [0, 1.7],
  logStart: 0.3,
  withinFactor: 1.7,
  landmarks: [
    { value: 2, label: 'order 1' },
    { value: 4, label: 'order 2' },
    { value: 16, label: 'order 4' },
  ],
  truth: () => mmsErrorDrop(32),
};

/* 1D free-surface particle, cubic spline, h = Δx. Self (2/3) plus one
   neighbour at q = 1 (1/6) is 5/6. Half the kernel is empty, not half the mass. */
const sphSurfaceRho: EstimateScenario = {
  quantity: 'kernel density at a 1D free-surface particle, as a fraction of ρ₀, when h = Δx',
  logRange: [-0.55, 0.15],
  logStart: 0,
  withinFactor: 1.15,
  landmarks: [
    { value: 0.5, label: '½ empty' },
    { value: 2 / 3, label: 'self' },
    { value: 1, label: 'ρ₀' },
  ],
  truth: () => SURFACE_RHO_RATIO,
};

/* A grain of mass 1, radius 0.05, k_n = 5×10⁴, sitting on a floor at g = 10.
   Rest overlap is mg/k_n. People guess 0 (hard) or 0.1 (visible). */
const demRestOverlap: EstimateScenario = {
  quantity: 'rest overlap of a grain on a floor, as a fraction of its radius (m = 1, R = 0.05, k_n = 5×10⁴, g = 10)',
  logRange: [-4, 0],
  logStart: -1,
  withinFactor: 3,
  landmarks: [
    { value: 1, label: 'a radius' },
    { value: 0.1, label: 'visible' },
    { value: 0.001, label: '10⁻³' },
  ],
  truth: () => restOverlapRatio(),
};

export const ESTIMATE_SCENARIOS: Record<string, EstimateScenario> = {
  'euler-work-1e6': eulerWorkFor1e6,
  'rk4-work-1e6': rk4WorkFor1e6,
  'double-digits': doubleDigits,
  'ill-2x2-digits': ill2x2Digits,
  'spec-modes-for-eps': specModesForEps,
  'grid-cost-d10-n4': gridCostD10N4,
  'ad-recovered-lambda': recoveredLambdaError,
  'cons-rk4-ortho': consRk4Ortho,
  'pde-heat-tail': heatTailRatio,
  'cfl-heat-dt-n200': heatFtcsDtN200,
  'ghost-naive-ratio-n32': ghostNaiveRatioN32,
  'fem-fd-l2-ratio': femFdL2Ratio,
  'proj-leftover-div': projLeftoverDiv,
  'mpm-pic-ke': mpmPicKe,
  'fvm-burgers-shock-speed': fvmBurgersShock,
  'op-laplacian-nnz-n200': opLaplacianNnzN200,
  'jac-iters-tenth': jacItersTenth,
  'cg-jacobi-to-1e-6': cgJacobiTo1e6,
  'pc-ssor-steps-1e-8': pcSsorSteps1e8,
  'mg-ratio-vs-n': mgRatioVsN,
  'qr-kappa-ata': qrKappaAtA,
  'nt-steps-to-eps': ntStepsToEps,
  'svd-rank2-residual': svdRank2Residual,
  'gm-stored-restart': gmStoredRestart,
  'pic-plasma-period': picPlasmaPeriod,
  'lbm-umax': lbmUmax,
  'vv-mms-drop': vvMmsDrop,
  'sph-surface-rho': sphSurfaceRho,
  'dem-rest-overlap': demRestOverlap,
};
