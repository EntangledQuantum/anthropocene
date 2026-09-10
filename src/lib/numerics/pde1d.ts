/* ─────────────────────────────────────────────────────────────────────────
   1D linear advection and heat on a periodic grid.

   Displayed in the CFL lesson, so the update is the formula — no clever
   indexing, no in-place tricks. Periodic wrap is the only bookkeeping.

   Advection:  u_t + c u_x = 0
   Heat:       u_t = α u_xx

   CFL number ν = c Δt / Δx is how many mesh cells the signal crosses in
   one step. Diffusion number r = α Δt / Δx² is the same idea in different
   units: how much of the second-difference stencil the time step takes.
   ───────────────────────────────────────────────────────────────────────── */

export const PERIOD = 1;

export type AdvectionScheme = 'ftcs' | 'upwind';

export function periodicGrid(n: number, length = PERIOD): { x: number[]; dx: number; length: number } {
  const dx = length / n;
  const x = Array.from({ length: n }, (_, i) => i * dx);
  return { x, dx, length };
}

/** Periodic index. */
export const wrap = (i: number, n: number): number => ((i % n) + n) % n;

/** Shortest signed distance on a periodic interval of length L. */
export function wrapDelta(d: number, length: number): number {
  let x = d % length;
  if (x > length / 2) x -= length;
  if (x < -length / 2) x += length;
  return x;
}

export function gaussianPulse(x: number[], x0 = 0.25, sigma = 0.05): number[] {
  const L = x.length > 1 ? (x[1]! - x[0]!) * x.length : PERIOD;
  return x.map((xi) => {
    const d = wrapDelta(xi - x0, L);
    return Math.exp(-(d * d) / (2 * sigma * sigma));
  });
}

/** Nyquist (checkerboard) mode — the heat-FTCS / upwind-over-CFL killer. */
export function nyquistMode(n: number, amp: number): number[] {
  return Array.from({ length: n }, (_, i) => (i % 2 === 0 ? amp : -amp));
}

/** 4Δx mode (θ = π/2) — the FTCS-advection killer. The centred difference of
 *  a checkerboard is zero, so that mode is invisible to FTCS advection. */
export function fourDxMode(n: number, amp: number): number[] {
  return Array.from({ length: n }, (_, i) => amp * Math.cos((Math.PI / 2) * i));
}

export function addField(a: number[], b: number[]): number[] {
  return a.map((v, i) => v + b[i]!);
}

export function exactAdvection(
  x: number[], t: number, c: number, x0 = 0.25, sigma = 0.05,
): number[] {
  return gaussianPulse(x, x0 + c * t, sigma);
}

export const cflNumber = (c: number, dt: number, dx: number): number => (c * dt) / dx;
export const diffusionNumber = (alpha: number, dt: number, dx: number): number =>
  (alpha * dt) / (dx * dx);

/** Largest Δt with CFL ≤ 1. */
export const maxStableAdvectionDt = (c: number, dx: number): number => dx / Math.abs(c);

/** Largest Δt with heat-FTCS r ≤ 1/2. */
export const maxStableHeatDt = (alpha: number, dx: number): number => (0.5 * dx * dx) / alpha;

export function maxAbs(u: number[]): number {
  let m = 0;
  for (const v of u) {
    const a = Math.abs(v);
    if (a > m) m = a;
  }
  return m;
}

export function l2Distance(a: number[], b: number[], dx: number): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) {
    const d = a[i]! - b[i]!;
    s += d * d;
  }
  return Math.sqrt(s * dx);
}

/* ── one-step updates ──────────────────────────────────────────────────── */

/** Forward-time centred-space advection.
 *  u_i^{n+1} = u_i^n − (ν/2) (u_{i+1} − u_{i−1}),  ν = c Δt / Δx.
 *  Unconditionally unstable: von Neumann |G| = √(1 + ν² sin²θ) ≥ 1. */
export function stepAdvectionFtcs(u: number[], nu: number): number[] {
  const n = u.length;
  const next = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    next[i] = u[i]! - 0.5 * nu * (u[wrap(i + 1, n)]! - u[wrap(i - 1, n)]!);
  }
  return next;
}

/** First-order upwind, c > 0.
 *  u_i^{n+1} = u_i^n − ν (u_i − u_{i−1}).
 *  Stable for 0 ≤ ν ≤ 1. At ν = 1 this is the exact shift u_i ← u_{i−1}. */
export function stepAdvectionUpwind(u: number[], nu: number): number[] {
  const n = u.length;
  const next = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    next[i] = u[i]! - nu * (u[i]! - u[wrap(i - 1, n)]!);
  }
  return next;
}

/** Forward-time centred-space heat.
 *  u_i^{n+1} = u_i^n + r (u_{i+1} − 2 u_i + u_{i−1}),  r = α Δt / Δx².
 *  Stable iff r ≤ 1/2 (checkerboard gain G = 1 − 4r). */
export function stepHeatFtcs(u: number[], r: number): number[] {
  const n = u.length;
  const next = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    next[i] = u[i]! + r * (u[wrap(i + 1, n)]! - 2 * u[i]! + u[wrap(i - 1, n)]!);
  }
  return next;
}

export function advectionStep(scheme: AdvectionScheme, u: number[], nu: number): number[] {
  return scheme === 'upwind' ? stepAdvectionUpwind(u, nu) : stepAdvectionFtcs(u, nu);
}

/* ── von Neumann amplification ─────────────────────────────────────────── */

/** |G| for FTCS advection. G = 1 − i ν sin θ. */
export function ftcsAdvectionGain(nu: number, theta: number): number {
  return Math.hypot(1, nu * Math.sin(theta));
}

/** |G| for first-order upwind (c > 0). */
export function upwindAdvectionGain(nu: number, theta: number): number {
  const re = 1 - nu + nu * Math.cos(theta);
  const im = -nu * Math.sin(theta);
  return Math.hypot(re, im);
}

/** G for heat FTCS (real). G = 1 − 4 r sin²(θ/2). */
export function heatFtcsGain(r: number, theta: number): number {
  return 1 - 4 * r * Math.sin(theta / 2) ** 2;
}

/* ── domain of dependence ──────────────────────────────────────────────── */

/** Cells the stencil can see, looking back `steps`. Upwind is one-sided. */
export function stencilReach(scheme: AdvectionScheme, steps: number): { left: number; right: number } {
  if (scheme === 'upwind') return { left: steps, right: 0 };
  return { left: steps, right: steps };
}

/** Cells the true characteristic travels, looking back `steps`. c > 0 → left. */
export function characteristicCells(nu: number, steps: number): number {
  return nu * steps;
}

/* ── integrate ─────────────────────────────────────────────────────────── */

export const DIVERGED = 1e12;

export interface FieldRun {
  x: number[];
  u: number[];
  u0: number[];
  exact?: number[];
  t: number;
  dx: number;
  dt: number;
  nSteps: number;
  maxAbs: number;
  height: number;
  diverged: boolean;
}

function integrate(
  u0: number[],
  step: (u: number[]) => number[],
  nSteps: number,
  dt: number,
): { u: number[]; t: number; maxAbs: number; diverged: boolean } {
  let u = u0.slice();
  let peak = maxAbs(u);
  for (let n = 0; n < nSteps; n++) {
    u = step(u);
    const m = maxAbs(u);
    if (!Number.isFinite(m) || m > DIVERGED) {
      return { u, t: (n + 1) * dt, maxAbs: Infinity, diverged: true };
    }
    if (m > peak) peak = m;
  }
  return { u, t: nSteps * dt, maxAbs: peak, diverged: false };
}

export interface AdvectionOpts {
  scheme: AdvectionScheme;
  cfl: number;
  n?: number;
  tEnd?: number;
  c?: number;
  x0?: number;
  sigma?: number;
  nyquist?: number;
  fourDx?: number;
}

export function runAdvection(opts: AdvectionOpts): FieldRun {
  const n = opts.n ?? 80;
  const c = opts.c ?? 1;
  const tEnd = opts.tEnd ?? 0.45;
  const x0 = opts.x0 ?? 0.25;
  const sigma = opts.sigma ?? 0.05;
  const { x, dx } = periodicGrid(n);
  const dt = (opts.cfl * dx) / c;
  const nSteps = Math.max(1, Math.round(tEnd / dt));
  let u0 = gaussianPulse(x, x0, sigma);
  if (opts.nyquist) u0 = addField(u0, nyquistMode(n, opts.nyquist));
  if (opts.fourDx) u0 = addField(u0, fourDxMode(n, opts.fourDx));

  const stepped = integrate(u0, (u) => advectionStep(opts.scheme, u, opts.cfl), nSteps, dt);
  const t = stepped.t;
  const exact = exactAdvection(x, t, c, x0, sigma);
  return {
    x, u: stepped.u, u0, exact, t, dx, dt, nSteps,
    maxAbs: stepped.maxAbs,
    height: stepped.diverged ? Infinity : Math.max(...stepped.u),
    diverged: stepped.diverged,
  };
}

export interface HeatOpts {
  r: number;
  n?: number;
  nSteps?: number;
  alpha?: number;
  x0?: number;
  sigma?: number;
  nyquist?: number;
}

export function runHeat(opts: HeatOpts): FieldRun {
  const n = opts.n ?? 64;
  const nSteps = opts.nSteps ?? 200;
  const alpha = opts.alpha ?? 1;
  const x0 = opts.x0 ?? 0.5;
  const sigma = opts.sigma ?? 0.07;
  const { x, dx } = periodicGrid(n);
  const dt = (opts.r * dx * dx) / alpha;
  let u0 = gaussianPulse(x, x0, sigma);
  if (opts.nyquist) u0 = addField(u0, nyquistMode(n, opts.nyquist));

  const stepped = integrate(u0, (u) => stepHeatFtcs(u, opts.r), nSteps, dt);
  return {
    x, u: stepped.u, u0, t: stepped.t, dx, dt, nSteps,
    maxAbs: stepped.maxAbs,
    height: stepped.diverged ? Infinity : Math.max(...stepped.u),
    diverged: stepped.diverged,
  };
}

/** Numerical viscosity of first-order upwind: (c Δx / 2) (1 − ν).
 *  Vanishes at ν = 1, which is why that CFL is the exact shift. */
export const upwindViscosity = (c: number, dx: number, nu: number): number =>
  0.5 * c * dx * (1 - nu);
