/* ─────────────────────────────────────────────────────────────────────────
   1D finite volume on a periodic interval.

   Conservation law:  u_t + f(u)_x = 0
   Cell average      Q_i ≈ (1/Δx) ∫_{i-1/2}^{i+1/2} u dx
   Update            Q_i^{n+1} = Q_i^n − λ (F_{i+1/2} − F_{i−1/2}),  λ = Δt/Δx

   Conservative: one numerical flux per face, used by both cells. Interior
   fluxes telescope, so on a periodic mesh Σ Q is an identity of the map.

   Non-conservative: the chain-rule form u_t + a(u) u_x = 0 with a = f'(u),
   discretized as a one-sided product. There is no shared face flux. At a
   jump the global sum drifts; for a linear flux the product happens to
   be the conservative upwind scheme, so advection does not leak.

   Rusanov / local Lax–Friedrichs is the numerical flux — a two-point
   average minus a dissipation. No Riemann solver, no reconstruction.

   Displayed in the finite-volume lesson, so the formulas stay visible.
   ───────────────────────────────────────────────────────────────────────── */

import { gaussianPulse, periodicGrid, wrap } from './pde1d.ts';

export type FvmEquation = 'advection' | 'burgers';
export type FvmScheme = 'conservative' | 'nonconservative';
export type FvmInitial = 'pulse' | 'jump';

export const FVM_PERIOD = 1;
export const ADVECTION_C = 1;

/** Burgers square wave used by the lesson, the sketch, and the tests. */
export const JUMP_LEFT = 1;
export const JUMP_RIGHT = 0;
export const JUMP_AT = 0.5;

export const DIVERGED = 1e12;

export function physicalFlux(eq: FvmEquation, u: number, c = ADVECTION_C): number {
  return eq === 'advection' ? c * u : 0.5 * u * u;
}

/** Characteristic speed a = f'(u). */
export function waveSpeed(eq: FvmEquation, u: number, c = ADVECTION_C): number {
  return eq === 'advection' ? c : u;
}

/** Rankine–Hugoniot: s [u] = [f]. Smooth states recover a = f'(u). */
export function rankineHugoniot(
  eq: FvmEquation, uL: number, uR: number, c = ADVECTION_C,
): number {
  const du = uL - uR;
  if (Math.abs(du) < 1e-15) return waveSpeed(eq, uL, c);
  return (physicalFlux(eq, uL, c) - physicalFlux(eq, uR, c)) / du;
}

/** Local Lax–Friedrichs / Rusanov. Consistent: F(u, u) = f(u). */
export function rusanovFlux(
  eq: FvmEquation, uL: number, uR: number, c = ADVECTION_C,
): number {
  const fL = physicalFlux(eq, uL, c);
  const fR = physicalFlux(eq, uR, c);
  const alpha = Math.max(
    Math.abs(waveSpeed(eq, uL, c)),
    Math.abs(waveSpeed(eq, uR, c)),
  );
  return 0.5 * (fL + fR) - 0.5 * alpha * (uR - uL);
}

export function totalMass(q: number[], dx: number): number {
  let s = 0;
  for (const v of q) s += v;
  return s * dx;
}

export function maxAbsWave(q: number[], eq: FvmEquation, c = ADVECTION_C): number {
  if (eq === 'advection') return Math.abs(c);
  let m = 0;
  for (const v of q) {
    const a = Math.abs(v);
    if (a > m) m = a;
  }
  return m;
}

export function lambdaFromCfl(
  q: number[], eq: FvmEquation, nu: number, c = ADVECTION_C,
): number {
  const aMax = maxAbsWave(q, eq, c);
  return nu / Math.max(aMax, 1e-12);
}

export function squareWave(
  x: number[], uL = JUMP_LEFT, uR = JUMP_RIGHT, xJump = JUMP_AT,
): number[] {
  return x.map((xi) => (xi < xJump ? uL : uR));
}

/** Low-amplitude sine that stays smooth on the lesson's time interval.
 *  Burgers' Gaussian pulse does not — it steepens into a shock. */
export function sineWave(x: number[], mean = 0.6, amp = 0.05): number[] {
  return x.map((xi) => mean + amp * Math.sin(2 * Math.PI * xi));
}

export function initialField(
  initial: FvmInitial, x: number[],
): number[] {
  return initial === 'jump' ? squareWave(x) : gaussianPulse(x, 0.35, 0.07);
}

export interface FaceState {
  /** Right-face flux of cell i, as cell i uses it. */
  fromLeft: number[];
  /** Left-face flux of cell i+1, as cell i+1 uses it. */
  fromRight: number[];
}

export interface FvmAdvance {
  next: number[];
  faces: FaceState;
}

function facesOf(
  q: number[],
  eq: FvmEquation,
  scheme: FvmScheme,
  c: number,
): FaceState {
  const n = q.length;
  const fromLeft = new Array<number>(n);
  const fromRight = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    const uL = q[i]!;
    const uR = q[wrap(i + 1, n)]!;
    if (scheme === 'conservative') {
      const F = rusanovFlux(eq, uL, uR, c);
      fromLeft[i] = F;
      fromRight[i] = F;
    } else {
      // Chain-rule upwind writes ΔQ_i = −λ a_i (Q_i − Q_{i−1}) for a_i ≥ 0,
      // which is the flux difference of F_right^i = a_i Q_i and
      // F_left^i = a_i Q_{i−1}. Cell i+1 uses a_{i+1} on the same face.
      const aL = waveSpeed(eq, uL, c);
      const aR = waveSpeed(eq, uR, c);
      fromLeft[i] = aL * uL;
      fromRight[i] = aR * uL;
    }
  }
  return { fromLeft, fromRight };
}

/** One step. Conservative: Q ← Q − λ (F_right − F_left) with a shared F.
 *  Non-conservative: Q ← Q − λ a(Q_i) Δ_upwind Q. */
export function stepFvm(
  q: number[],
  eq: FvmEquation,
  scheme: FvmScheme,
  lambda: number,
  c = ADVECTION_C,
): FvmAdvance {
  const n = q.length;
  const faces = facesOf(q, eq, scheme, c);
  const next = new Array<number>(n);
  if (scheme === 'conservative') {
    for (let i = 0; i < n; i++) {
      const Fr = faces.fromLeft[i]!;
      const Fl = faces.fromLeft[wrap(i - 1, n)]!;
      next[i] = q[i]! - lambda * (Fr - Fl);
    }
  } else {
    for (let i = 0; i < n; i++) {
      const a = waveSpeed(eq, q[i]!, c);
      const du = a >= 0
        ? q[i]! - q[wrap(i - 1, n)]!
        : q[wrap(i + 1, n)]! - q[i]!;
      next[i] = q[i]! - lambda * a * du;
    }
  }
  return { next, faces };
}

/** max_i |F_fromLeft − F_fromRight| at the faces. Zero iff the scheme shares
 *  a flux. The teaching number: disagreement is how mass leaves the books. */
export function maxFaceMismatch(faces: FaceState): number {
  let m = 0;
  for (let i = 0; i < faces.fromLeft.length; i++) {
    const d = Math.abs(faces.fromLeft[i]! - faces.fromRight[i]!);
    if (d > m) m = d;
  }
  return m;
}

export function faceWithLargestJump(q: number[]): number {
  const n = q.length;
  let best = 0;
  let bestD = -1;
  for (let i = 0; i < n; i++) {
    const d = Math.abs(q[i]! - q[wrap(i + 1, n)]!);
    if (d > bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

export interface MassSample {
  t: number;
  mass: number;
  ratio: number;
}

export interface FvmRun {
  x: number[];
  q: number[];
  q0: number[];
  dx: number;
  dt: number;
  t: number;
  nSteps: number;
  mass0: number;
  mass: number;
  history: MassSample[];
  diverged: boolean;
  maxAbs: number;
}

export interface FvmRunOpts {
  equation: FvmEquation;
  scheme: FvmScheme;
  initial?: FvmInitial;
  n?: number;
  cfl?: number;
  tEnd?: number;
  c?: number;
}

export function runFvm(opts: FvmRunOpts): FvmRun {
  const n = opts.n ?? 64;
  const cfl = opts.cfl ?? 0.4;
  const tEnd = opts.tEnd ?? 0.5;
  const c = opts.c ?? ADVECTION_C;
  const initial = opts.initial ?? 'jump';
  const { x, dx } = periodicGrid(n, FVM_PERIOD);
  const q0 = initialField(initial, x);
  const lambda = lambdaFromCfl(q0, opts.equation, cfl, c);
  const dt = lambda * dx;
  const nSteps = Math.max(1, Math.round(tEnd / dt));
  const mass0 = totalMass(q0, dx);

  let q = q0.slice();
  let diverged = false;
  let peak = 0;
  const history: MassSample[] = [{ t: 0, mass: mass0, ratio: 1 }];
  const stride = Math.max(1, Math.floor(nSteps / 80));

  for (let k = 0; k < nSteps; k++) {
    const { next } = stepFvm(q, opts.equation, opts.scheme, lambda, c);
    q = next;
    let m = 0;
    for (const v of q) {
      const a = Math.abs(v);
      if (a > m) m = a;
    }
    if (!Number.isFinite(m) || m > DIVERGED) {
      diverged = true;
      peak = Infinity;
      history.push({ t: (k + 1) * dt, mass: NaN, ratio: NaN });
      break;
    }
    if (m > peak) peak = m;
    if ((k + 1) % stride === 0 || k === nSteps - 1) {
      const mass = totalMass(q, dx);
      history.push({ t: (k + 1) * dt, mass, ratio: mass / mass0 });
    }
  }

  const t = diverged ? history[history.length - 1]!.t : nSteps * dt;
  const mass = diverged ? NaN : totalMass(q, dx);
  return {
    x, q, q0, dx, dt, t, nSteps: diverged ? history.length - 1 : nSteps,
    mass0, mass, history, diverged, maxAbs: peak,
  };
}

/** Linear interpolation of the first falling crossing of `level`, reading
 *  cell averages at cell centres. Used to track a smeared shock. */
export function fallingCrossing(x: number[], q: number[], level: number): number {
  const n = q.length;
  const dx = n > 1 ? x[1]! - x[0]! : FVM_PERIOD / n;
  const xc = (i: number) => {
    const xi = x[wrap(i, n)]! + 0.5 * dx;
    return xi >= FVM_PERIOD ? xi - FVM_PERIOD : xi;
  };
  for (let i = 0; i < n; i++) {
    const a = q[i]!;
    const b = q[wrap(i + 1, n)]!;
    if (a >= level && b < level) {
      const t = (a - level) / Math.max(a - b, 1e-15);
      let loc = xc(i) + t * dx;
      if (loc >= FVM_PERIOD) loc -= FVM_PERIOD;
      if (loc < 0) loc += FVM_PERIOD;
      return loc;
    }
  }
  return xc(0);
}

/** Shock speed inferred from how far the ½-level of a Burgers 1|0 jump moved. */
export function measuredShockSpeed(opts: {
  scheme: FvmScheme;
  n?: number;
  cfl?: number;
  tEnd?: number;
}): number {
  const tEnd = opts.tEnd ?? 0.4;
  const run = runFvm({
    equation: 'burgers',
    scheme: opts.scheme,
    initial: 'jump',
    n: opts.n ?? 96,
    cfl: opts.cfl ?? 0.4,
    tEnd,
  });
  if (run.diverged || run.t <= 0) return NaN;
  const x1 = fallingCrossing(run.x, run.q, 0.5);
  let dx = x1 - JUMP_AT;
  if (dx < -0.5) dx += FVM_PERIOD;
  if (dx > 0.5) dx -= FVM_PERIOD;
  return dx / run.t;
}
