/** The second law (University Physics, ch. 20).
 *
 *  Four small pieces, each readable in one sitting:
 *
 *    1. A box of gas with a divider. Point particles fly in straight lines and
 *       bounce off the walls; nothing else happens. Pull the divider and they
 *       spread; close it and each stays on the side it happens to be on. The
 *       motion is perfectly reversible, particle by particle, and yet the
 *       spreading never undoes itself in practice. Every measurement a scene
 *       prints (how many are on the left, how long the box spends in each
 *       arrangement) is a tally over this motion.
 *    2. Counting. N labelled particles, each on the left or the right, have
 *       2^N arrangements, all equally likely. "All on the left" is one of
 *       them; "half and half" is C(N, N/2) of them. Entropy is the log of the
 *       count, S = k ln W, so counts that multiply give entropies that add.
 *    3. Engines and refrigerators between two baths. Heat Q leaving a bath at
 *       temperature T takes entropy Q/T with it; work carries none. A cycle
 *       ends where it started, so the baths' entropy is the whole ledger, and
 *       the second law says the total cannot fall. That one inequality is the
 *       Carnot limit, the mandatory dump, and the price of a cold fridge.
 *    4. Two finite blocks with a perfect engine between them. The engine runs
 *       until they share a temperature, and because it adds no entropy they
 *       meet at the geometric mean, not the average. The energy they did not
 *       keep is the work it delivered.
 *
 *  SI units, temperatures in kelvin.
 */
import { mixTemperature } from './heat.ts';

/** Boltzmann's constant, J/K. */
export const KB = 1.380649e-23;
/** Avogadro's number. */
export const AVOGADRO = 6.02214076e23;
/** Gas constant, J/(mol·K). */
export const R_GAS = KB * AVOGADRO;
/** Age of the universe, s (13.8 billion years). */
export const AGE_OF_UNIVERSE_S = 13.8e9 * 365.25 * 86400;

/* ── seeded randomness ─────────────────────────────────────────────────── */

/** mulberry32: a tiny 32-bit generator returning [0, 1). Same seed, same run. */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ── 1. the box with a divider ─────────────────────────────────────────── */

/** Box width and height (arbitrary length units). The divider sits at x = BOX_W / 2. */
export const BOX_W = 2;
export const BOX_H = 1;
export const MID = BOX_W / 2;

export interface GasBox {
  n: number;
  x: Float64Array; y: Float64Array;
  vx: Float64Array; vy: Float64Array;
  /** Closed: nothing crosses x = MID. */
  closed: boolean;
  t: number;
}

/** N particles scattered through the left half, divider closed. Horizontal
 *  speeds lie in [0.25, 0.6] box-units per second, so each particle crosses
 *  the half-box in two to four seconds. */
export function createGasBox(n: number, seed = 1): GasBox {
  const r = seeded(seed);
  const box: GasBox = {
    n, closed: true, t: 0,
    x: new Float64Array(n), y: new Float64Array(n), vx: new Float64Array(n), vy: new Float64Array(n),
  };
  for (let i = 0; i < n; i++) {
    box.x[i] = 0.05 + r() * (MID - 0.1);
    box.y[i] = 0.05 + r() * (BOX_H - 0.1);
    box.vx[i] = (r() < 0.5 ? -1 : 1) * (0.25 + 0.35 * r());
    box.vy[i] = (r() < 0.5 ? -1 : 1) * (0.1 + 0.3 * r());
  }
  return box;
}

/** Fold a coordinate back into [lo, hi], flipping the velocity on each bounce. */
function bounce(p: number, v: number, lo: number, hi: number): [number, number] {
  while (p < lo || p > hi) {
    if (p < lo) { p = 2 * lo - p; v = -v; }
    if (p > hi) { p = 2 * hi - p; v = -v; }
  }
  return [p, v];
}

/** Advance every particle by dt. With the divider closed, a particle is held
 *  on whichever side it started the step. */
export function stepGas(box: GasBox, dt: number): void {
  for (let i = 0; i < box.n; i++) {
    const left = box.x[i] < MID;
    const lo = box.closed && !left ? MID : 0;
    const hi = box.closed && left ? MID : BOX_W;
    [box.x[i], box.vx[i]] = bounce(box.x[i] + box.vx[i] * dt, box.vx[i], lo, hi);
    [box.y[i], box.vy[i]] = bounce(box.y[i] + box.vy[i] * dt, box.vy[i], 0, BOX_H);
  }
  box.t += dt;
}

export const countLeft = (box: GasBox): number => {
  let k = 0;
  for (let i = 0; i < box.n; i++) if (box.x[i] < MID) k++;
  return k;
};

/** Which arrangement the box is in: bit i is set when particle i is on the left. */
export const arrangementOf = (box: GasBox): number => {
  let a = 0;
  for (let i = 0; i < box.n; i++) if (box.x[i] < MID) a |= 1 << i;
  return a;
};

/** Particles on the left in arrangement `a`. */
export const leftIn = (a: number): number => {
  let k = 0;
  for (; a; a &= a - 1) k++;
  return k;
};

/** Pull the divider, run for `duration`, and return the share of the time each
 *  arrangement was held. Index is the arrangement bitmask; N ≤ 16. */
export function arrangementTally(n: number, seed: number, duration: number, dt = 0.02): Float64Array {
  const box = createGasBox(n, seed);
  box.closed = false;
  const tally = new Float64Array(2 ** n);
  const steps = Math.round(duration / dt);
  for (let s = 0; s < steps; s++) { stepGas(box, dt); tally[arrangementOf(box)] += 1 / steps; }
  return tally;
}

/** Share of the time the open box holds every particle on the left. */
export function timeAllLeft(n: number, seed: number, duration: number, dt = 0.02): number {
  const box = createGasBox(n, seed);
  box.closed = false;
  const steps = Math.round(duration / dt);
  let hits = 0;
  for (let s = 0; s < steps; s++) { stepGas(box, dt); if (countLeft(box) === n) hits++; }
  return hits / steps;
}

/** Look at the open box every `gap` seconds and count the looks until one
 *  shows all N on the left; repeat `trials` times and return the mean. */
export function meanLooksUntilAllLeft(n: number, seed: number, gap: number, trials: number, dt = 0.02): number {
  const box = createGasBox(n, seed);
  box.closed = false;
  const per = Math.round(gap / dt);
  let looks = 0;
  for (let k = 0; k < trials; k++) {
    for (;;) {
      for (let s = 0; s < per; s++) stepGas(box, dt);
      looks++;
      if (countLeft(box) === n) break;
    }
  }
  return looks / trials;
}

/* ── 2. counting ───────────────────────────────────────────────────────── */

/** C(n, k), exact in a double for n ≤ 60. */
export function binomial(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  k = Math.min(k, n - k);
  let c = 1;
  for (let i = 1; i <= k; i++) c = (c * (n - k + i)) / i;
  return Math.round(c);
}

/** Every arrangement of N particles over two halves. */
export const arrangements = (n: number): number => 2 ** n;

/** Chance a random look finds exactly k of N on the left. */
export const chanceOfSplit = (n: number, k: number): number => binomial(n, k) / arrangements(n);

/** Chance a random look finds all N on the left: one arrangement of 2^N. */
export const chanceAllLeft = (n: number): number => 1 / arrangements(n);

/** Looks you expect to need, each an independent shuffle, before one shows all
 *  N on the left: the mean of a geometric wait, 1/p = 2^N. */
export const expectedLooks = (n: number): number => arrangements(n);

/** How many particles before the expected wait, looking every `lookSeconds`,
 *  exceeds `waitSeconds`: 2^N · look = wait. */
export const particlesForWait = (waitSeconds: number, lookSeconds = 1): number =>
  Math.log2(waitSeconds / lookSeconds);

/** Boltzmann's entropy of a macrostate with W arrangements, J/K. */
export const boltzmannEntropy = (W: number): number => KB * Math.log(W);

/** Entropy (in units of k) of the split "k of N on the left". */
export const splitEntropyInK = (n: number, k: number): number => Math.log(binomial(n, k));

/** Entropy rise when N particles are given `ratio` times the volume: each
 *  particle has `ratio` times the places, so W grows by ratio^N. J/K. */
export const freeExpansionEntropy = (nParticles: number, ratio: number): number =>
  nParticles * KB * Math.log(ratio);

/* Einstein solid: N oscillators sharing q quanta. The count is
   C(q + N − 1, q), so ln Ω needs a log-gamma. */

function lnGamma(z: number): number {
  // Lanczos, g = 7, n = 9.
  const g = 7;
  const c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
    -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  if (z < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * z)) - lnGamma(1 - z);
  z -= 1;
  let x = c[0];
  for (let i = 1; i < g + 2; i++) x += c[i] / (z + i);
  const t = z + g + 0.5;
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
}

/** ln Ω for an Einstein solid of N oscillators holding q quanta. */
export const lnEinstein = (N: number, q: number): number => lnGamma(q + N) - lnGamma(q + 1) - lnGamma(N);

/* ── 3. engines and refrigerators between two baths ────────────────────── */

export interface EngineLedger {
  /** Heat taken from the hot bath, J. */
  Qh: number;
  /** Heat dumped into the cold bath, J. */
  Qc: number;
  /** Work delivered, Qh − Qc (first law over a cycle), J. */
  W: number;
  /** Entropy change of the hot bath, −Qh/Th, J/K. */
  dSHot: number;
  /** Entropy change of the cold bath, +Qc/Tc, J/K. */
  dSCold: number;
  /** The whole ledger: the engine itself returns to its start each cycle. */
  dSTotal: number;
  efficiency: number;
  /** The second law: the total may not fall. */
  runs: boolean;
}

/** Rounding slack for "the total is zero", J/K. */
const EPS_S = 1e-9;

export function engineLedger(Qh: number, Qc: number, Th: number, Tc: number): EngineLedger {
  const dSHot = -Qh / Th, dSCold = Qc / Tc, dSTotal = dSHot + dSCold;
  return { Qh, Qc, W: Qh - Qc, dSHot, dSCold, dSTotal, efficiency: (Qh - Qc) / Qh, runs: dSTotal >= -EPS_S };
}

/** The best any engine can do between Th and Tc. */
export const carnotEfficiency = (Th: number, Tc: number): number => 1 - Tc / Th;

/** The least heat an engine can dump: the entropy Qh/Th must leave as Qc/Tc. */
export const minimumDump = (Qh: number, Th: number, Tc: number): number => (Qh * Tc) / Th;

/** The smallest dump on a grid of `step` joules that still runs. */
export const smallestRunningDump = (Qh: number, Th: number, Tc: number, step: number): number =>
  Math.ceil(minimumDump(Qh, Th, Tc) / step - 1e-9) * step;

export interface FridgeLedger {
  /** Heat pulled out of the cold side, J. */
  Qc: number;
  /** Work put in, J. */
  W: number;
  /** Heat delivered to the hot side, Qc + W, J. */
  Qh: number;
  dSCold: number; dSHot: number; dSTotal: number;
  runs: boolean;
}

/** An engine run backwards: work in, heat pulled from cold, more heat out hot. */
export function fridgeLedger(Qc: number, W: number, Th: number, Tc: number): FridgeLedger {
  const Qh = Qc + W;
  const dSCold = -Qc / Tc, dSHot = Qh / Th, dSTotal = dSCold + dSHot;
  return { Qc, W, Qh, dSCold, dSHot, dSTotal, runs: dSTotal >= -EPS_S };
}

/** Heat pulled from the cold side per joule of work, at best. */
export const carnotCoolingCOP = (Th: number, Tc: number): number => Tc / (Th - Tc);
/** Heat delivered to the hot side per joule of work, at best. */
export const carnotHeatingCOP = (Th: number, Tc: number): number => Th / (Th - Tc);

/* ── 4. two finite blocks and a perfect engine ─────────────────────────── */

export interface Blocks {
  /** Heat capacities, J/K. */
  Ch: number; Cc: number;
  Th: number; Tc: number;
  /** Work delivered so far, J. */
  W: number;
}

/**
 * One stroke of a perfect engine: the hot block cools by dTh. The engine adds
 * no entropy, so the cold block warms by exactly as much as keeps
 * Ch ln(Th'/Th) + Cc ln(Tc'/Tc) = 0, and the energy neither block kept is the
 * work. For a small stroke the dump is dQh · Tc/Th, the Carnot share.
 */
export function perfectStroke(b: Blocks, dTh: number): Blocks {
  const Th = Math.max(b.Th - dTh, b.Tc);
  const Tc = b.Tc * (b.Th / Th) ** (b.Ch / b.Cc);
  const W = b.W + b.Ch * (b.Th - Th) - b.Cc * (Tc - b.Tc);
  return { ...b, Th, Tc, W };
}

/** Where a perfect engine leaves them: the capacity-weighted geometric mean. */
export const perfectMeetingTemperature = (Ch: number, Th: number, Cc: number, Tc: number): number =>
  Math.exp((Ch * Math.log(Th) + Cc * Math.log(Tc)) / (Ch + Cc));

/** Where they end if they simply touch: the capacity-weighted average. */
export const contactTemperature = (Ch: number, Th: number, Cc: number, Tc: number): number =>
  mixTemperature([{ m: Ch, c: 1, T: Th }, { m: Cc, c: 1, T: Tc }]);

/** All the work there is to take from the pair. */
export function availableWork(Ch: number, Th: number, Cc: number, Tc: number): number {
  const Tf = perfectMeetingTemperature(Ch, Th, Cc, Tc);
  return Ch * (Th - Tf) - Cc * (Tf - Tc);
}

/** Entropy change of the pair in going from (Th0, Tc0) to (Th1, Tc1), J/K. */
export const blocksEntropyChange = (Ch: number, Th0: number, Cc: number, Tc0: number, Th1: number, Tc1: number): number =>
  Ch * Math.log(Th1 / Th0) + Cc * Math.log(Tc1 / Tc0);
