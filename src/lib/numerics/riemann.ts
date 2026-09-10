/* ─────────────────────────────────────────────────────────────────────────
   Riemann problems and Godunov flux.

   A face has a left state and a right state. The unique entropy solution of
   that jump is self-similar: u(x, t) = û(x/t). Godunov flux is the physical
   flux of that solution, evaluated at the face (ξ = x/t = 0).

   Scalar: inviscid Burgers and linear advection. Exact, no approximation.
   Systems: Sod's shock tube, the same face question in Euler clothing.

   Displayed in the Riemann lesson, so the formulas stay visible.
   ───────────────────────────────────────────────────────────────────────── */

import { periodicGrid, wrap } from './pde1d.ts';
import {
  ADVECTION_C,
  FVM_PERIOD,
  JUMP_AT,
  JUMP_LEFT,
  JUMP_RIGHT,
  DIVERGED,
  fallingCrossing,
  lambdaFromCfl,
  physicalFlux,
  rankineHugoniot,
  squareWave,
  totalMass,
  waveSpeed,
  type FvmEquation,
} from './fvm1d.ts';

export {
  ADVECTION_C,
  DIVERGED,
  FVM_PERIOD,
  JUMP_AT,
  JUMP_LEFT,
  JUMP_RIGHT,
  lambdaFromCfl,
  physicalFlux,
  rankineHugoniot,
  totalMass,
  waveSpeed,
  type FvmEquation,
};

export type WaveKind = 'shock' | 'rarefaction' | 'contact';
export type RiemannScheme = 'godunov' | 'centered';

export const RIE_PERIOD = FVM_PERIOD;

/** Self-similar coordinate ξ = x/t of the Riemann solution. */
export function riemannState(
  eq: FvmEquation, uL: number, uR: number, xi: number, c = ADVECTION_C,
): number {
  if (eq === 'advection') return xi < c ? uL : uR;
  // Burgers: shock if uL > uR, rarefaction if uL < uR, else uniform.
  if (uL > uR) {
    const s = 0.5 * (uL + uR);
    return xi < s ? uL : uR;
  }
  if (uL < uR) {
    if (xi <= uL) return uL;
    if (xi >= uR) return uR;
    return xi;
  }
  return uL;
}

export function waveKind(eq: FvmEquation, uL: number, uR: number): WaveKind {
  if (eq === 'advection' || Math.abs(uL - uR) < 1e-15) return 'contact';
  return uL > uR ? 'shock' : 'rarefaction';
}

export interface ScalarRiemann {
  kind: WaveKind;
  uL: number;
  uR: number;
  /** Shock / contact speed. For a rarefaction, the mid-fan speed (uL+uR)/2. */
  speed: number;
  /** Left-most characteristic of the wave. */
  head: number;
  /** Right-most characteristic of the wave. */
  tail: number;
  /** û(0) — the state the face sits in. Ambiguous only for a shock with s = 0,
   *  where the flux is still unique. */
  star: number;
  flux: number;
}

export function scalarRiemann(
  eq: FvmEquation, uL: number, uR: number, c = ADVECTION_C,
): ScalarRiemann {
  const kind = waveKind(eq, uL, uR);
  const flux = godunovFlux(eq, uL, uR, c);
  if (eq === 'advection') {
    return {
      kind: 'contact', uL, uR, speed: c, head: c, tail: c,
      star: c >= 0 ? uL : uR, flux,
    };
  }
  if (kind === 'shock') {
    const s = 0.5 * (uL + uR);
    return {
      kind, uL, uR, speed: s, head: s, tail: s,
      star: s >= 0 ? uL : uR, flux,
    };
  }
  if (kind === 'rarefaction') {
    const star = uL >= 0 ? uL : uR <= 0 ? uR : 0;
    return {
      kind, uL, uR, speed: 0.5 * (uL + uR), head: uL, tail: uR, star, flux,
    };
  }
  return { kind: 'contact', uL, uR, speed: uL, head: uL, tail: uL, star: uL, flux };
}

/** Godunov flux: f(û(0; uL, uR)). For a convex flux this is the Osher formula
 *  min/max of f between the two states; Burgers is written out so the cases
 *  (shock, rarefaction, transonic) stay visible. */
export function godunovFlux(
  eq: FvmEquation, uL: number, uR: number, c = ADVECTION_C,
): number {
  if (eq === 'advection') return (c >= 0 ? c * uL : c * uR);
  // Burgers, f = u²/2, sonic point at 0.
  if (uL > uR) {
    const s = 0.5 * (uL + uR);
    return s >= 0 ? physicalFlux('burgers', uL) : physicalFlux('burgers', uR);
  }
  if (uL >= 0) return physicalFlux('burgers', uL);
  if (uR <= 0) return physicalFlux('burgers', uR);
  return 0;
}

/** Osher / Engquist–Osher form of the Godunov flux for a convex scalar flux:
 *  min of f on [uL, uR] if uL ≤ uR, max of f on [uR, uL] otherwise. */
export function osherFlux(
  eq: FvmEquation, uL: number, uR: number, c = ADVECTION_C,
): number {
  const lo = Math.min(uL, uR);
  const hi = Math.max(uL, uR);
  const f = (u: number) => physicalFlux(eq, u, c);
  if (uL <= uR) {
    let m = f(lo);
    // For Burgers the minimum on an interval is at 0 if 0 is inside, else an end.
    if (eq === 'burgers' && lo < 0 && hi > 0) m = Math.min(m, 0);
    m = Math.min(m, f(hi));
    return m;
  }
  let M = f(lo);
  if (eq === 'burgers' && lo < 0 && hi > 0) M = Math.max(M, 0);
  M = Math.max(M, f(hi));
  return M;
}

/** Arithmetic mean of the two physical fluxes. Consistent, centred, and the
 *  flux FTCS uses. Not upwind. */
export function meanFlux(
  eq: FvmEquation, uL: number, uR: number, c = ADVECTION_C,
): number {
  return 0.5 * (physicalFlux(eq, uL, c) + physicalFlux(eq, uR, c));
}

/** Richtmyer two-step Lax–Wendroff flux. Centred, second-order, rings at a
 *  jump. λ = Δt/Δx. */
export function laxWendroffFlux(
  eq: FvmEquation, uL: number, uR: number, lambda: number, c = ADVECTION_C,
): number {
  const fL = physicalFlux(eq, uL, c);
  const fR = physicalFlux(eq, uR, c);
  const uMid = 0.5 * (uL + uR) - 0.5 * lambda * (fR - fL);
  return physicalFlux(eq, uMid, c);
}

export function numericalFlux(
  scheme: RiemannScheme,
  eq: FvmEquation,
  uL: number,
  uR: number,
  lambda: number,
  c = ADVECTION_C,
): number {
  return scheme === 'godunov'
    ? godunovFlux(eq, uL, uR, c)
    : laxWendroffFlux(eq, uL, uR, lambda, c);
}

export function sampleRiemann(
  eq: FvmEquation, uL: number, uR: number,
  xiMin: number, xiMax: number, n: number, c = ADVECTION_C,
): { xi: number; u: number }[] {
  const out = new Array<{ xi: number; u: number }>(n);
  const n1 = Math.max(2, n);
  for (let i = 0; i < n1; i++) {
    const xi = xiMin + ((xiMax - xiMin) * i) / (n1 - 1);
    out[i] = { xi, u: riemannState(eq, uL, uR, xi, c) };
  }
  return out;
}

export function totalVariation(q: number[]): number {
  const n = q.length;
  let s = 0;
  for (let i = 0; i < n; i++) s += Math.abs(q[i]! - q[wrap(i + 1, n)]!);
  return s;
}

/** How far q has left the interval [lo, hi]. Zero iff the field stays inside. */
export function overshoot(q: number[], lo: number, hi: number): number {
  let m = 0;
  for (const v of q) {
    if (v > hi) m = Math.max(m, v - hi);
    if (v < lo) m = Math.max(m, lo - v);
  }
  return m;
}

export interface RiemannAdvance {
  next: number[];
  fluxes: number[];
}

export function stepRiemann(
  q: number[],
  eq: FvmEquation,
  scheme: RiemannScheme,
  lambda: number,
  c = ADVECTION_C,
): RiemannAdvance {
  const n = q.length;
  const fluxes = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    fluxes[i] = numericalFlux(scheme, eq, q[i]!, q[wrap(i + 1, n)]!, lambda, c);
  }
  const next = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    const Fr = fluxes[i]!;
    const Fl = fluxes[wrap(i - 1, n)]!;
    next[i] = q[i]! - lambda * (Fr - Fl);
  }
  return { next, fluxes };
}

export interface RiemannRun {
  x: number[];
  q: number[];
  q0: number[];
  dx: number;
  dt: number;
  t: number;
  nSteps: number;
  mass0: number;
  mass: number;
  diverged: boolean;
  maxAbs: number;
  tv0: number;
  tv: number;
  overshoot: number;
}

export interface RiemannRunOpts {
  equation: FvmEquation;
  scheme: RiemannScheme;
  uL?: number;
  uR?: number;
  n?: number;
  cfl?: number;
  tEnd?: number;
  c?: number;
  initial?: 'jump' | 'pulse';
}

function pulse(x: number[]): number[] {
  return x.map((xi) => 0.25 + 0.7 * Math.exp(-((xi - 0.35) ** 2) / (2 * 0.07 * 0.07)));
}

export function initialJump(
  x: number[], uL = JUMP_LEFT, uR = JUMP_RIGHT, xJump = JUMP_AT,
): number[] {
  return squareWave(x, uL, uR, xJump);
}

export function runRiemann(opts: RiemannRunOpts): RiemannRun {
  const n = opts.n ?? 64;
  const cfl = opts.cfl ?? 0.4;
  const tEnd = opts.tEnd ?? 0.4;
  const c = opts.c ?? ADVECTION_C;
  const uL = opts.uL ?? JUMP_LEFT;
  const uR = opts.uR ?? JUMP_RIGHT;
  const { x, dx } = periodicGrid(n, RIE_PERIOD);
  const q0 = opts.initial === 'pulse' ? pulse(x) : initialJump(x, uL, uR);
  const lo = Math.min(...q0);
  const hi = Math.max(...q0);
  const lambda = lambdaFromCfl(q0, opts.equation, cfl, c);
  const dt = lambda * dx;
  const nSteps = Math.max(1, Math.round(tEnd / dt));
  const mass0 = totalMass(q0, dx);
  const tv0 = totalVariation(q0);

  let q = q0.slice();
  let diverged = false;
  let peak = 0;

  for (let k = 0; k < nSteps; k++) {
    const { next } = stepRiemann(q, opts.equation, opts.scheme, lambda, c);
    q = next;
    let m = 0;
    for (const v of q) {
      const a = Math.abs(v);
      if (a > m) m = a;
    }
    if (!Number.isFinite(m) || m > DIVERGED) {
      diverged = true;
      peak = Infinity;
      break;
    }
    if (m > peak) peak = m;
  }

  const t = nSteps * dt;
  const mass = diverged ? NaN : totalMass(q, dx);
  return {
    x, q, q0, dx, dt, t, nSteps: diverged ? 0 : nSteps,
    mass0, mass, diverged, maxAbs: peak,
    tv0, tv: diverged ? NaN : totalVariation(q),
    overshoot: diverged ? Infinity : overshoot(q, lo, hi),
  };
}

/** Shock speed inferred from how far the ½-level of a Burgers 1|0 jump moved
 *  under Godunov (or another scheme). */
export function measuredShockSpeed(opts: {
  scheme: RiemannScheme;
  n?: number;
  cfl?: number;
  tEnd?: number;
}): number {
  const tEnd = opts.tEnd ?? 0.35;
  const run = runRiemann({
    equation: 'burgers',
    scheme: opts.scheme,
    uL: JUMP_LEFT,
    uR: JUMP_RIGHT,
    n: opts.n ?? 96,
    cfl: opts.cfl ?? 0.4,
    tEnd,
  });
  if (run.diverged || run.t <= 0) return NaN;
  const x1 = fallingCrossing(run.x, run.q, 0.5);
  let dx = x1 - JUMP_AT;
  if (dx < -0.5) dx += RIE_PERIOD;
  if (dx > 0.5) dx -= RIE_PERIOD;
  return dx / run.t;
}

/* ── Sod shock tube (Euler, γ-law gas) ────────────────────────────────────
   Transfer costume: the same Riemann problem, three waves. Exact solver
   follows Toro, Riemann Solvers, ch. 4. Used to draw the tube, not to
   teach HLLC. */

export const GAMMA = 1.4;

export interface GasState { rho: number; u: number; p: number }

export const SOD_LEFT: GasState = { rho: 1, u: 0, p: 1 };
export const SOD_RIGHT: GasState = { rho: 0.125, u: 0, p: 0.1 };
export const SOD_X0 = 0.5;

export function soundSpeed(p: number, rho: number, gamma = GAMMA): number {
  return Math.sqrt(gamma * p / Math.max(rho, 1e-15));
}

function waveFn(
  pStar: number, pK: number, rhoK: number, gamma = GAMMA,
): { f: number; df: number } {
  const aK = soundSpeed(pK, rhoK, gamma);
  if (pStar > pK) {
    const A = 2 / ((gamma + 1) * rhoK);
    const B = ((gamma - 1) / (gamma + 1)) * pK;
    const root = Math.sqrt(A / (pStar + B));
    return {
      f: (pStar - pK) * root,
      df: root * (1 - (pStar - pK) / (2 * (pStar + B))),
    };
  }
  const pr = Math.max(pStar, 1e-15) / pK;
  const exp = (gamma - 1) / (2 * gamma);
  return {
    f: (2 * aK / (gamma - 1)) * (pr ** exp - 1),
    df: (1 / (rhoK * aK)) * pr ** (-(gamma + 1) / (2 * gamma)),
  };
}

export interface EulerStar {
  p: number;
  u: number;
}

/** Newton solve for the star pressure of a 1D Euler Riemann problem. */
export function eulerStar(
  left: GasState, right: GasState, gamma = GAMMA,
): EulerStar {
  const aL = soundSpeed(left.p, left.rho, gamma);
  const aR = soundSpeed(right.p, right.rho, gamma);
  let p = 0.5 * (left.p + right.p)
    - 0.125 * (right.u - left.u) * (left.rho + right.rho) * (aL + aR);
  p = Math.max(p, 1e-8);
  for (let k = 0; k < 20; k++) {
    const L = waveFn(p, left.p, left.rho, gamma);
    const R = waveFn(p, right.p, right.rho, gamma);
    const phi = L.f + R.f + right.u - left.u;
    const dphi = L.df + R.df;
    const next = p - phi / Math.max(dphi, 1e-15);
    const pNew = Math.max(next, 1e-8);
    if (Math.abs(pNew - p) < 1e-14 * (1 + p)) {
      p = pNew;
      break;
    }
    p = pNew;
  }
  const L = waveFn(p, left.p, left.rho, gamma);
  const R = waveFn(p, right.p, right.rho, gamma);
  const u = 0.5 * (left.u + right.u) + 0.5 * (R.f - L.f);
  return { p, u };
}

export interface EulerWaves {
  star: EulerStar;
  /** Rarefaction head (left-going for Sod). */
  rarefactionHead: number;
  rarefactionTail: number;
  contact: number;
  shock: number;
}

export function sodWaves(gamma = GAMMA): EulerWaves {
  const left = SOD_LEFT;
  const right = SOD_RIGHT;
  const star = eulerStar(left, right, gamma);
  const aL = soundSpeed(left.p, left.rho, gamma);
  const aStarL = aL * (star.p / left.p) ** ((gamma - 1) / (2 * gamma));
  const rhoR = right.rho;
  const pR = right.p;
  const pStar = star.p;
  const shock = right.u + soundSpeed(pR, rhoR, gamma)
    * Math.sqrt(((gamma + 1) / (2 * gamma)) * (pStar / pR) + ((gamma - 1) / (2 * gamma)));
  return {
    star,
    rarefactionHead: left.u - aL,
    rarefactionTail: star.u - aStarL,
    contact: star.u,
    shock,
  };
}

function sodDensityStarLeft(star: EulerStar, gamma = GAMMA): number {
  const pL = SOD_LEFT.p;
  const rhoL = SOD_LEFT.rho;
  // Rarefaction: isentropic.
  return rhoL * (star.p / pL) ** (1 / gamma);
}

function sodDensityStarRight(star: EulerStar, gamma = GAMMA): number {
  const pR = SOD_RIGHT.p;
  const rhoR = SOD_RIGHT.rho;
  const g = (gamma - 1) / (gamma + 1);
  const pr = star.p / pR;
  return rhoR * (pr + g) / (g * pr + 1);
}

/** Exact Sod state at position x, time t. Diaphragm at SOD_X0. */
export function sodExact(x: number, t: number, gamma = GAMMA): GasState {
  const left = SOD_LEFT;
  const right = SOD_RIGHT;
  const waves = sodWaves(gamma);
  const xi = t > 1e-15 ? (x - SOD_X0) / t : (x < SOD_X0 ? -1e15 : 1e15);
  const { star, rarefactionHead, rarefactionTail, contact, shock } = waves;

  if (xi <= rarefactionHead) return { ...left };
  if (xi >= shock) return { ...right };

  if (xi <= rarefactionTail) {
    // Left rarefaction fan: u − a = ξ and u + 2a/(γ−1) is invariant.
    const aL = soundSpeed(left.p, left.rho, gamma);
    const a = ((gamma - 1) / (gamma + 1)) * (left.u - xi) + (2 / (gamma + 1)) * aL;
    const u = xi + a;
    const p = left.p * (a / aL) ** (2 * gamma / (gamma - 1));
    const rho = left.rho * (a / aL) ** (2 / (gamma - 1));
    return { rho, u, p };
  }

  if (xi <= contact) {
    return { rho: sodDensityStarLeft(star, gamma), u: star.u, p: star.p };
  }
  return { rho: sodDensityStarRight(star, gamma), u: star.u, p: star.p };
}

export function sampleSod(
  t: number, n = 200, xMin = 0, xMax = 1, gamma = GAMMA,
): { x: number; rho: number; u: number; p: number }[] {
  const out = new Array<{ x: number; rho: number; u: number; p: number }>(n);
  for (let i = 0; i < n; i++) {
    const x = xMin + ((xMax - xMin) * i) / (n - 1);
    const s = sodExact(x, t, gamma);
    out[i] = { x, ...s };
  }
  return out;
}
