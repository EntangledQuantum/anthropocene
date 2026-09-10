/* ─────────────────────────────────────────────────────────────────────────
   1D electrostatic particle-in-cell, periodic.

   Particles carry charge and mass. The field lives on a mesh. One step is
   four beats:

     deposit   q_p  →  ρ_i      (CIC / linear hats)
     Poisson   φ''  = −ρ,  E = −∇φ
     gather    E_i  →  E_p      (the same hats)
     push      leapfrog x, v

   Units: ε₀ = 1. A uniform ion background cancels the mean electron density
   so the periodic Poisson problem is solvable (mean ρ = 0). Displayed in
   the PIC lesson, so the formulas stay visible — no pair loop, no FFT.
   ───────────────────────────────────────────────────────────────────────── */

export const PIC_LENGTH = 1;
export const PIC_N_GRID = 32;
export const PIC_PPC = 8;
export const PIC_DT = 0.02;

/** Analytic plasma frequency for the lesson plasma: n_m q_p² / m_p = 1. */
export const PLASMA_OMEGA = 1;

export type PicKind = 'plasma' | 'streams' | 'pair';

export interface PicState {
  n: number;
  length: number;
  h: number;
  dt: number;
  np: number;
  x: Float64Array;
  v: Float64Array;
  q: Float64Array;
  m: Float64Array;
  a: Float64Array;
  rho: Float64Array;
  phi: Float64Array;
  E: Float64Array;
  t: number;
  steps: number;
  kind: PicKind;
}

export interface PlasmaOpts {
  n?: number;
  ppc?: number;
  length?: number;
  dt?: number;
  /** Sinusoidal displacement amplitude, in units of the box. */
  amplitude?: number;
}

export function wrapIndex(i: number, n: number): number {
  return ((i % n) + n) % n;
}

export function wrapPos(x: number, length: number): number {
  let y = x % length;
  if (y < 0) y += length;
  return y;
}

/** Shortest signed displacement on a ring of length L. */
export function wrapDelta(d: number, length: number): number {
  let x = d % length;
  if (x > length / 2) x -= length;
  if (x < -length / 2) x += length;
  return x;
}

/**
 * Cloud-in-cell / linear hat. Particle at `x` on a periodic mesh of `n`
 * nodes, spacing h = L/n. Weights on the two surrounding nodes sum to 1.
 */
export function cicWeights(
  x: number,
  n: number,
  length: number,
): { i0: number; i1: number; w0: number; w1: number; h: number } {
  const h = length / n;
  const xi = wrapPos(x, length) / h;
  const i0 = Math.floor(xi) % n;
  const f = xi - Math.floor(xi);
  return { i0, i1: (i0 + 1) % n, w0: 1 - f, w1: f, h };
}

/** Charge density on n nodes. ρ_i = Σ_p q_p W_i(x_p) / h. */
export function deposit(
  x: Float64Array,
  q: Float64Array,
  n: number,
  length: number,
): Float64Array {
  const rho = new Float64Array(n);
  const h = length / n;
  for (let p = 0; p < x.length; p++) {
    const { i0, i1, w0, w1 } = cicWeights(x[p]!, n, length);
    rho[i0]! += (q[p]! * w0) / h;
    rho[i1]! += (q[p]! * w1) / h;
  }
  return rho;
}

/** Interpolate a nodal field with the same CIC hats used to deposit. */
export function gather(field: Float64Array, x: number, length: number): number {
  const { i0, i1, w0, w1 } = cicWeights(x, field.length, length);
  return w0 * field[i0]! + w1 * field[i1]!;
}

/**
 * Periodic Poisson: φ'' = −ρ, mean φ = 0, mean E = 0.
 *
 * Integrate Gauss's law on cell faces, subtract the mean so φ closes,
 * then E_i = −(φ_{i+1} − φ_{i−1}) / (2h). The ion background is the
 * subtracted mean of ρ — periodic Poisson has no solution otherwise.
 */
export function solvePoisson(
  rho: Float64Array,
  length: number,
): { phi: Float64Array; E: Float64Array } {
  const n = rho.length;
  const h = length / n;

  let mean = 0;
  for (let i = 0; i < n; i++) mean += rho[i]!;
  mean /= n;

  const face = new Float64Array(n);
  let running = 0;
  for (let i = 0; i < n; i++) {
    running += (rho[i]! - mean) * h;
    face[i] = running;
  }
  let meanFace = 0;
  for (let i = 0; i < n; i++) meanFace += face[i]!;
  meanFace /= n;
  for (let i = 0; i < n; i++) face[i]! -= meanFace;

  const phi = new Float64Array(n);
  for (let i = 0; i < n - 1; i++) {
    phi[i + 1] = phi[i]! - face[i]! * h;
  }
  let meanPhi = 0;
  for (let i = 0; i < n; i++) meanPhi += phi[i]!;
  meanPhi /= n;
  for (let i = 0; i < n; i++) phi[i]! -= meanPhi;

  const E = new Float64Array(n);
  const twoH = 2 * h;
  for (let i = 0; i < n; i++) {
    const ip = wrapIndex(i + 1, n);
    const im = wrapIndex(i - 1, n);
    E[i] = -(phi[ip]! - phi[im]!) / twoH;
  }
  return { phi, E };
}

export function emptyPic(n: number, np: number, length: number, dt: number, kind: PicKind): PicState {
  return {
    n, length, h: length / n, dt, np, kind,
    x: new Float64Array(np),
    v: new Float64Array(np),
    q: new Float64Array(np),
    m: new Float64Array(np),
    a: new Float64Array(np),
    rho: new Float64Array(n),
    phi: new Float64Array(n),
    E: new Float64Array(n),
    t: 0,
    steps: 0,
  };
}

/** Deposit, Poisson, gather. Writes ρ, φ, E, and particle accelerations. */
export function fieldsFromParticles(s: PicState): void {
  const rho = deposit(s.x, s.q, s.n, s.length);
  s.rho.set(rho);
  const { phi, E } = solvePoisson(rho, s.length);
  s.phi.set(phi);
  s.E.set(E);
  for (let p = 0; p < s.np; p++) {
    const Ep = gather(E, s.x[p]!, s.length);
    s.a[p] = (s.q[p]! / s.m[p]!) * Ep;
  }
}

/**
 * One PIC step. Leapfrog: v lives at half-steps after the initial backward
 * kick in `primeLeapfrog`. Deposit → Poisson → gather → kick v, drift x.
 */
export function stepPic(s: PicState): void {
  fieldsFromParticles(s);
  const dt = s.dt;
  for (let p = 0; p < s.np; p++) {
    s.v[p]! += s.a[p]! * dt;
    s.x[p] = wrapPos(s.x[p]! + s.v[p]! * dt, s.length);
  }
  s.t += dt;
  s.steps += 1;
}

/** Offset v by −½ a Δt so leapfrog starts on-time from integer-time data. */
export function primeLeapfrog(s: PicState): void {
  fieldsFromParticles(s);
  const half = 0.5 * s.dt;
  for (let p = 0; p < s.np; p++) s.v[p]! -= s.a[p]! * half;
}

export function totalCharge(q: Float64Array): number {
  let s = 0;
  for (let p = 0; p < q.length; p++) s += q[p]!;
  return s;
}

export function gridCharge(rho: Float64Array, length: number): number {
  const h = length / rho.length;
  let s = 0;
  for (let i = 0; i < rho.length; i++) s += rho[i]! * h;
  return s;
}

export function kineticEnergy(s: PicState): number {
  let k = 0;
  for (let p = 0; p < s.np; p++) k += 0.5 * s.m[p]! * s.v[p]! * s.v[p]!;
  return k;
}

export function fieldEnergy(s: PicState): number {
  let u = 0;
  for (let i = 0; i < s.n; i++) u += s.E[i]! * s.E[i]!;
  return 0.5 * u * s.h;
}

/** k-mode of the deposited charge: Σ q_p cos(2π k x_p / L). */
export function cosineMoment(x: Float64Array, q: Float64Array, length: number, k = 1): number {
  const kappa = (2 * Math.PI * k) / length;
  let c = 0;
  for (let p = 0; p < x.length; p++) c += q[p]! * Math.cos(kappa * x[p]!);
  return c;
}

/**
 * Charge landing on a given node from one particle, as a fraction of q.
 * For a particle in (0, h) this is the left-node CIC weight 1 − x/h.
 */
export function nodeCharge(
  x: number, node: number, n: number, length: number, q = 1,
): number {
  const rho = deposit(new Float64Array([x]), new Float64Array([q]), n, length);
  return rho[node]! * (length / n);
}

/** Position in a cell of width 1 where the left node holds `fraction` of q. */
export function xWhereLeftFraction(fraction: number): number {
  return 1 - fraction;
}

/**
 * Adjoint residual: Σ q_p φ_p − Σ ρ_i φ_i h.
 * Zero (to roundoff) when gather uses the same hats as deposit.
 */
export function adjointResidual(
  x: Float64Array, q: Float64Array, phi: Float64Array, length: number,
): number {
  const rho = deposit(x, q, phi.length, length);
  const h = length / phi.length;
  let particle = 0;
  for (let p = 0; p < x.length; p++) particle += q[p]! * gather(phi, x[p]!, length);
  let grid = 0;
  for (let i = 0; i < phi.length; i++) grid += rho[i]! * phi[i]! * h;
  return particle - grid;
}

/** Total force Σ q_p E_p on a periodic mesh. Momentum-conserving CIC → ~0. */
export function totalForce(s: PicState): number {
  fieldsFromParticles(s);
  let f = 0;
  for (let p = 0; p < s.np; p++) f += s.q[p]! * gather(s.E, s.x[p]!, s.length);
  return f;
}

/* ── lesson plasmas ────────────────────────────────────────────────────── */

/**
 * Cold electron sea against a uniform ion background.
 * q_p = −1/N, m_p = 1/N, so ω_p² = n_m q_p² / m_p = 1/L.
 * Default L = 1 ⇒ ω_p = 1. A k=1 displacement rings a Langmuir oscillation.
 */
export function createPlasma(opts: PlasmaOpts = {}): PicState {
  const n = opts.n ?? PIC_N_GRID;
  const ppc = opts.ppc ?? PIC_PPC;
  const length = opts.length ?? PIC_LENGTH;
  const dt = opts.dt ?? PIC_DT;
  const A = opts.amplitude ?? 0.02;
  const np = n * ppc;
  const s = emptyPic(n, np, length, dt, 'plasma');
  const qp = -1 / np;
  const mp = 1 / np;
  const k = (2 * Math.PI) / length;
  for (let p = 0; p < np; p++) {
    const x0 = ((p + 0.5) / np) * length;
    s.x[p] = wrapPos(x0 + A * Math.sin(k * x0), length);
    s.v[p] = 0;
    s.q[p] = qp;
    s.m[p] = mp;
  }
  primeLeapfrog(s);
  return s;
}

/** Two equal electron beams at ±vBeam, slight position jitter. Ion background. */
export function createTwoStream(opts: PlasmaOpts & { vBeam?: number } = {}): PicState {
  const n = opts.n ?? PIC_N_GRID;
  const ppc = opts.ppc ?? PIC_PPC;
  const length = opts.length ?? PIC_LENGTH;
  const dt = opts.dt ?? PIC_DT;
  const vBeam = opts.vBeam ?? 0.12;
  const np = n * ppc;
  const s = emptyPic(n, np, length, dt, 'streams');
  const qp = -1 / np;
  const mp = 1 / np;
  const half = Math.floor(np / 2);
  for (let p = 0; p < np; p++) {
    const jitter = 1e-3 * Math.sin(p * 12.9898 + 78.233);
    s.x[p] = wrapPos(((p + 0.5) / np) * length + jitter, length);
    s.v[p] = p < half ? vBeam : -vBeam;
    s.q[p] = qp;
    s.m[p] = mp;
  }
  primeLeapfrog(s);
  return s;
}

/** Two opposite charges. Mean ρ is already zero — no background needed. */
export function createPair(
  x0 = 0.3, x1 = 0.7, q = 0.08, n = PIC_N_GRID, length = PIC_LENGTH, dt = PIC_DT,
): PicState {
  const s = emptyPic(n, 2, length, dt, 'pair');
  s.x[0] = wrapPos(x0, length);
  s.x[1] = wrapPos(x1, length);
  s.q[0] = q;
  s.q[1] = -q;
  s.m[0] = 1;
  s.m[1] = 1;
  primeLeapfrog(s);
  return s;
}

/**
 * Period of the k=1 charge-density mode, from interpolated zero crossings
 * of Σ q cos(2πx/L). A cold plasma starting at rest from a displacement
 * is a cosine; two crossings are a half-period.
 */
export function measuredPlasmaPeriod(opts: PlasmaOpts = {}): number {
  const s = createPlasma({ amplitude: 0.015, dt: 0.02, ...opts });
  const nSteps = Math.ceil((4 * Math.PI) / s.dt);
  const samples = new Float64Array(nSteps + 1);
  samples[0] = cosineMoment(s.x, s.q, s.length);
  for (let i = 0; i < nSteps; i++) {
    stepPic(s);
    samples[i + 1] = cosineMoment(s.x, s.q, s.length);
  }
  const zeros: number[] = [];
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1]!;
    const b = samples[i]!;
    if (a === 0) {
      zeros.push((i - 1) * s.dt);
    } else if (a * b < 0) {
      zeros.push(((i - 1) + a / (a - b)) * s.dt);
    }
    if (zeros.length >= 3) break;
  }
  if (zeros.length < 2) return Number.NaN;
  // First two zeros are a half-period for a cosine that starts at a peak.
  return 2 * (zeros[1]! - zeros[0]!);
}

export const measuredPlasmaOmega = (opts: PlasmaOpts = {}): number =>
  (2 * Math.PI) / measuredPlasmaPeriod(opts);

/** Deterministic hash in (0, 1). Shot-noise positions, same stream every call. */
function hash01(p: number, salt = 0): number {
  const s = Math.sin((p + 1) * 127.1 + salt * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

/** rms |E| of a uniform (unperturbed) electron sea — shot noise on the grid. */
export function uniformRmsE(ppc: number, n = PIC_N_GRID, length = PIC_LENGTH): number {
  const np = n * ppc;
  const s = emptyPic(n, np, length, PIC_DT, 'plasma');
  const qp = -1 / np;
  const mp = 1 / np;
  for (let p = 0; p < np; p++) {
    s.x[p] = hash01(p) * length;
    s.q[p] = qp;
    s.m[p] = mp;
  }
  fieldsFromParticles(s);
  let s2 = 0;
  for (let i = 0; i < n; i++) s2 += s.E[i]! * s.E[i]!;
  return Math.sqrt(s2 / n);
}
