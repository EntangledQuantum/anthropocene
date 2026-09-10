import { velocityVerlet } from './ode.ts';
import type { Deriv, State } from './types.ts';

/* ─────────────────────────────────────────────────────────────────────────
   2D Lennard-Jones molecular dynamics, reduced units ε = σ = m = k_B = 1.

   The force loop and the observables live here. The step is velocity Verlet
   from ode.ts — same integrator the structure-preserving lesson teaches,
   applied to N particles on a torus. A thermostat, when present, is a
   *modification of that map*, not a different stepper.
   ───────────────────────────────────────────────────────────────────────── */

export const DIM = 2;

export interface LJParams {
  epsilon: number;
  sigma: number;
  /** Neighbours beyond this are ignored. Capped at box/2 so min-image is unique. */
  cutoff: number;
}

const DEFAULT_PARAMS: LJParams = { epsilon: 1, sigma: 1, cutoff: 2.5 };

export interface MDState {
  n: number;
  box: number;
  x: Float64Array;
  y: Float64Array;
  vx: Float64Array;
  vy: Float64Array;
  ax: Float64Array;
  ay: Float64Array;
  /** Cached after the last force evaluation. */
  potential: number;
  /** Pair virial Σ r_ij · F_ij, for the pressure. */
  virial: number;
  params: LJParams;
  /** Packed [q, v] scratch so Verlet does not allocate a new State every step. */
  packed: number[];
  /** Nosé–Hoover friction ξ. Unused by NVE / Berendsen. */
  xi: number;
  /** Nosé's extra coordinate s, with ṡ = ξ. Starts at 1. */
  s: number;
  /** Cached RHS for Verlet; rebuilt if the box changes. */
  deriv: Deriv | null;
  derivBox: number;
}

export function cutoffFor(box: number, requested = DEFAULT_PARAMS.cutoff): number {
  return Math.min(requested, 0.5 * box - 1e-12);
}

/** Periodic minimum-image: the shortest signed displacement on a ring of length L. */
export function minImage(dx: number, box: number): number {
  return dx - box * Math.round(dx / box);
}

/** One LJ pair. `r2` is the squared min-image distance.
 *
 *  V = 4ε [(σ/r)¹² − (σ/r)⁶]
 *  The force on i (away from j when repulsive) is `fOverR2 * (r_i − r_j)`.
 *  Returning F/r² lets the caller multiply by the displacement vector. */
export function ljPair(r2: number, epsilon = 1, sigma = 1): { V: number; fOverR2: number } {
  const invr2 = 1 / r2;
  const s2 = (sigma * sigma) * invr2;
  const s6 = s2 * s2 * s2;
  const s12 = s6 * s6;
  return {
    V: 4 * epsilon * (s12 - s6),
    fOverR2: 24 * epsilon * (2 * s12 - s6) * invr2,
  };
}

/** Pair loop. Writes accelerations, returns potential and virial.
 *
 *  Newton's third law is used: F_j = −F_i, so the inner loop is j > i.
 *  The virial for the pressure is Σ_{i<j} r_ij · F_ij with r_ij the min-image
 *  vector from i to j and F_ij the force on j (equal to +fOverR2 · r_ij). */
export function accumulatePairs(
  x: Float64Array,
  y: Float64Array,
  n: number,
  box: number,
  params: LJParams,
  ax: Float64Array,
  ay: Float64Array,
): { V: number; virial: number } {
  ax.fill(0);
  ay.fill(0);
  let V = 0;
  let virial = 0;
  const rc2 = params.cutoff * params.cutoff;
  const { epsilon, sigma } = params;

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const dx = minImage(x[j] - x[i], box);
      const dy = minImage(y[j] - y[i], box);
      const r2 = dx * dx + dy * dy;
      if (r2 === 0 || r2 > rc2) continue;

      const pair = ljPair(r2, epsilon, sigma);
      V += pair.V;
      // Force on i is −f · r_ij, force on j is +f · r_ij.
      const fx = pair.fOverR2 * dx;
      const fy = pair.fOverR2 * dy;
      ax[i] -= fx;
      ay[i] -= fy;
      ax[j] += fx;
      ay[j] += fy;
      virial += pair.fOverR2 * r2;
    }
  }
  return { V, virial };
}

export function computeForces(s: MDState): void {
  s.params = { ...s.params, cutoff: cutoffFor(s.box, s.params.cutoff) };
  const { V, virial } = accumulatePairs(s.x, s.y, s.n, s.box, s.params, s.ax, s.ay);
  s.potential = V;
  s.virial = virial;
}

export function wrapPositions(s: MDState): void {
  const L = s.box;
  for (let i = 0; i < s.n; i++) {
    s.x[i] -= L * Math.floor(s.x[i] / L);
    s.y[i] -= L * Math.floor(s.y[i] / L);
  }
}

export function kineticEnergy(s: MDState): number {
  let k = 0;
  for (let i = 0; i < s.n; i++) k += s.vx[i] * s.vx[i] + s.vy[i] * s.vy[i];
  return 0.5 * k;
}

/** Instantaneous temperature. 2D equipartition: ⟨K⟩ = N T, so T = K / N. */
export function temperatureOf(s: MDState): number {
  return kineticEnergy(s) / s.n;
}

export function totalEnergy(s: MDState): number {
  return kineticEnergy(s) + s.potential;
}

/** Irving–Kirkwood pressure in 2D: P = ρ T + Ξ / (2 A). */
export function pressureOf(s: MDState): number {
  const area = s.box * s.box;
  const rho = s.n / area;
  return rho * temperatureOf(s) + s.virial / (DIM * area);
}

export function pack(s: MDState): State {
  const nq = 2 * s.n;
  const y = s.packed;
  if (y.length !== 2 * nq) y.length = 2 * nq;
  for (let i = 0; i < s.n; i++) {
    y[2 * i] = s.x[i];
    y[2 * i + 1] = s.y[i];
    y[nq + 2 * i] = s.vx[i];
    y[nq + 2 * i + 1] = s.vy[i];
  }
  return y;
}

export function unpack(s: MDState, y: State): void {
  const nq = 2 * s.n;
  for (let i = 0; i < s.n; i++) {
    s.x[i] = y[2 * i];
    s.y[i] = y[2 * i + 1];
    s.vx[i] = y[nq + 2 * i];
    s.vy[i] = y[nq + 2 * i + 1];
  }
}

/** First-order RHS for the generic Verlet stepper: ẏ = [v, a(q)]. */
export function ljDeriv(n: number, box: number, params: LJParams): Deriv {
  const ax = new Float64Array(n);
  const ay = new Float64Array(n);
  const px = new Float64Array(n);
  const py = new Float64Array(n);
  const p = { ...params, cutoff: cutoffFor(box, params.cutoff) };
  return (_t, y) => {
    for (let i = 0; i < n; i++) {
      px[i] = y[2 * i];
      py[i] = y[2 * i + 1];
    }
    accumulatePairs(px, py, n, box, p, ax, ay);
    const nq = 2 * n;
    const out = new Array<number>(2 * nq);
    for (let i = 0; i < n; i++) {
      out[2 * i] = y[nq + 2 * i];
      out[2 * i + 1] = y[nq + 2 * i + 1];
      out[nq + 2 * i] = ax[i];
      out[nq + 2 * i + 1] = ay[i];
    }
    return out;
  };
}

function derivOf(s: MDState): Deriv {
  if (!s.deriv || s.derivBox !== s.box) {
    s.deriv = ljDeriv(s.n, s.box, s.params);
    s.derivBox = s.box;
  }
  return s.deriv;
}

/** One NVE velocity-Verlet step. Delegates the update to `velocityVerlet`
 *  so the widget and the lesson cannot drift from the taught integrator. */
export function nveStep(s: MDState, h: number): void {
  const y = pack(s);
  const next = velocityVerlet.step(derivOf(s), 0, y, h);
  unpack(s, next);
  wrapPositions(s);
  computeForces(s);
}

/** Berendsen velocity rescaling. Not symplectic, not time-reversible, and
 *  it samples no known ensemble — which is exactly why it is the teaching
 *  thermostat: you can *see* that the map changed. λ = √(1 + (h/τ)(T₀/T − 1)). */
export function berendsenThermostat(s: MDState, T0: number, h: number, tau: number): void {
  const T = temperatureOf(s);
  if (T < 1e-18) return;
  const lambda = Math.sqrt(Math.max(0, 1 + (h / tau) * (T0 / T - 1)));
  for (let i = 0; i < s.n; i++) {
    s.vx[i] *= lambda;
    s.vy[i] *= lambda;
  }
}

/** One Nosé–Hoover step: Verlet, then a friction kick. The mechanical energy
 *  K+V is *not* conserved. The extended quantity
 *     H_NH = K + V + Q ξ²/2 + g T₀ ln s
 *  is the conserved object of the continuous NH flow (g = 2N in 2D).
 *  This splitting is first-order in the thermostat — honest about that. */
export function noseHooverStep(s: MDState, h: number, T0: number, Q: number): void {
  const g = DIM * s.n;
  const kick = Math.exp(-0.5 * h * s.xi);
  for (let i = 0; i < s.n; i++) {
    s.vx[i] *= kick;
    s.vy[i] *= kick;
  }
  nveStep(s, h);
  const K = kineticEnergy(s);
  s.xi += (h / Q) * (2 * K - g * T0);
  s.s *= Math.exp(h * s.xi);
  const kick2 = Math.exp(-0.5 * h * s.xi);
  for (let i = 0; i < s.n; i++) {
    s.vx[i] *= kick2;
    s.vy[i] *= kick2;
  }
}

export function noseHooverEnergy(s: MDState, T0: number, Q: number): number {
  const g = DIM * s.n;
  return kineticEnergy(s) + s.potential + 0.5 * Q * s.xi * s.xi + g * T0 * Math.log(s.s);
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gaussian(rng: () => number): number {
  // Box–Muller
  const u = Math.max(rng(), 1e-12);
  const v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function emptyState(n: number, box: number, params: LJParams): MDState {
  return {
    n, box,
    x: new Float64Array(n), y: new Float64Array(n),
    vx: new Float64Array(n), vy: new Float64Array(n),
    ax: new Float64Array(n), ay: new Float64Array(n),
    potential: 0, virial: 0,
    params: { ...DEFAULT_PARAMS, ...params, cutoff: cutoffFor(box, params.cutoff ?? DEFAULT_PARAMS.cutoff) },
    packed: new Array(4 * n),
    xi: 0, s: 1,
    deriv: null, derivBox: NaN,
  };
}

function setTemperature(s: MDState, T: number): void {
  // Remove centre-of-mass drift so the gas does not walk as a whole.
  let svx = 0, svy = 0;
  for (let i = 0; i < s.n; i++) { svx += s.vx[i]; svy += s.vy[i]; }
  svx /= s.n; svy /= s.n;
  for (let i = 0; i < s.n; i++) { s.vx[i] -= svx; s.vy[i] -= svy; }

  const Tnow = temperatureOf(s);
  const scale = Tnow > 1e-18 ? Math.sqrt(T / Tnow) : 0;
  for (let i = 0; i < s.n; i++) { s.vx[i] *= scale; s.vy[i] *= scale; }
}

/** Square-lattice gas with Maxwellian velocities. n should be a square. */
export function createGas(opts: {
  n: number;
  density: number;
  temperature: number;
  seed?: number;
  params?: Partial<LJParams>;
}): MDState {
  const n = opts.n;
  const box = Math.sqrt(n / opts.density);
  const s = emptyState(n, box, { ...DEFAULT_PARAMS, ...opts.params });
  const nSide = Math.max(1, Math.round(Math.sqrt(n)));
  const a = box / nSide;
  const rng = mulberry32(opts.seed ?? 1);
  const jitter = 0.08 * a;
  let k = 0;
  for (let i = 0; i < nSide && k < n; i++) {
    for (let j = 0; j < nSide && k < n; j++) {
      s.x[k] = (i + 0.5) * a + (rng() - 0.5) * jitter;
      s.y[k] = (j + 0.5) * a + (rng() - 0.5) * jitter;
      s.vx[k] = Math.sqrt(opts.temperature) * gaussian(rng);
      s.vy[k] = Math.sqrt(opts.temperature) * gaussian(rng);
      k++;
    }
  }
  wrapPositions(s);
  setTemperature(s, opts.temperature);
  computeForces(s);
  return s;
}

/** Tiny bound cluster in a large box — the NVE energy test. */
export function createCluster(opts: {
  n?: number;
  box?: number;
  temperature?: number;
  seed?: number;
}): MDState {
  const n = opts.n ?? 4;
  const box = opts.box ?? 18;
  const T = opts.temperature ?? 0.12;
  const s = emptyState(n, box, { ...DEFAULT_PARAMS, cutoff: cutoffFor(box) });
  const rng = mulberry32(opts.seed ?? 3);
  // Two-by-two square near the LJ well, centred in the box.
  const well = 2 ** (1 / 6);
  const x0 = 0.5 * box - 0.5 * well;
  const y0 = 0.5 * box - 0.5 * well;
  const spots = [
    [0, 0], [well, 0], [0, well], [well, well],
  ];
  for (let i = 0; i < n; i++) {
    const [dx, dy] = spots[i % spots.length];
    s.x[i] = x0 + dx + (rng() - 0.5) * 0.04;
    s.y[i] = y0 + dy + (rng() - 0.5) * 0.04;
    s.vx[i] = Math.sqrt(T) * gaussian(rng);
    s.vy[i] = Math.sqrt(T) * gaussian(rng);
  }
  setTemperature(s, T);
  computeForces(s);
  return s;
}

/** Two particles, explicit positions. Used by the min-image unit test. */
export function createPair(
  x0: number, y0: number, x1: number, y1: number,
  box: number, params: Partial<LJParams> = {},
): MDState {
  const s = emptyState(2, box, { ...DEFAULT_PARAMS, ...params, cutoff: cutoffFor(box, params.cutoff ?? DEFAULT_PARAMS.cutoff) });
  s.x[0] = x0; s.y[0] = y0;
  s.x[1] = x1; s.y[1] = y1;
  computeForces(s);
  return s;
}

/** Configurational virial pressure of a perfect square lattice plus the
 *  kinetic ideal-gas term ρ T. Deterministic, so a Tune can hunt P = 0. */
export function latticePressure(density: number, temperature: number, nSide = 4, params?: Partial<LJParams>): number {
  const n = nSide * nSide;
  const box = Math.sqrt(n / density);
  const a = box / nSide;
  const x = new Float64Array(n);
  const y = new Float64Array(n);
  let k = 0;
  for (let i = 0; i < nSide; i++) {
    for (let j = 0; j < nSide; j++) {
      x[k] = (i + 0.5) * a;
      y[k] = (j + 0.5) * a;
      k++;
    }
  }
  const ax = new Float64Array(n);
  const ay = new Float64Array(n);
  const p: LJParams = {
    ...DEFAULT_PARAMS,
    ...params,
    cutoff: cutoffFor(box, params?.cutoff ?? DEFAULT_PARAMS.cutoff),
  };
  const { virial } = accumulatePairs(x, y, n, box, p, ax, ay);
  const area = box * box;
  return (n / area) * temperature + virial / (DIM * area);
}

/** Density at which the lattice pressure first crosses zero, at fixed T.
 *  Compressing from an ideal-gas-like lattice: attractions have just
 *  cancelled the kinetic pressure. (A second crossing exists at high
 *  density, where the cores take over — we want the first one.) */
export function densityAtVanishingPressure(temperature: number, nSide = 4): number {
  const rhoMin = 0.18;
  const rhoMax = 1.05;
  const step = 0.01;
  let prevRho = rhoMin;
  let prevP = latticePressure(prevRho, temperature, nSide);
  for (let rho = rhoMin + step; rho <= rhoMax + 1e-12; rho += step) {
    const P = latticePressure(rho, temperature, nSide);
    if (prevP > 0 && P <= 0) {
      let lo = prevRho;
      let hi = rho;
      for (let k = 0; k < 40; k++) {
        const mid = 0.5 * (lo + hi);
        if (latticePressure(mid, temperature, nSide) > 0) lo = mid;
        else hi = mid;
      }
      return 0.5 * (lo + hi);
    }
    prevRho = rho;
    prevP = P;
  }
  throw new Error(`no P = 0 crossing at T = ${temperature}`);
}
