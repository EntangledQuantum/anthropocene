/**
 * Nuclear physics for chapter 43: binding as an energy ledger, and decay as a
 * coin flipped every tick.
 *
 * Two sources of truth, kept apart on purpose:
 *
 *  - MEASURED atomic masses (AME, in u) for every specific reaction a lesson
 *    quotes: D–T fusion, uranium fission, the stellar burning stages, the
 *    helium binding energy. Atomic masses carry their electrons, and with
 *    hydrogen atoms standing in for protons the electrons cancel.
 *  - The LIQUID-DROP (semi-empirical) mass formula for the smooth landscape:
 *    the valley that every nucleus sits on, and the drop that splits.
 *    It fails for the lightest nuclei, so the valley below A = 20 is drawn
 *    through measured nuclides instead.
 *
 * The decay half is a seeded coin: each nucleus, each tick, decays with the
 * same chance p. Nothing about a nucleus remembers how long it has waited.
 */

/* ── constants ─────────────────────────────────────────────────────────── */

/** Energy of one atomic mass unit, MeV (E = mc² with m = 1 u). */
export const MEV_PER_U = 931.49410242;
export const M_NEUTRON_U = 1.00866491595;
/** The hydrogen-1 atom: a proton plus its electron. */
export const M_HYDROGEN_U = 1.00782503207;

/* ── measured nuclides ─────────────────────────────────────────────────── */

export interface Nuclide {
  key: string;
  /** Display name, e.g. 'uranium-235'. */
  name: string;
  /** Short label, e.g. 'U-235'. */
  label: string;
  Z: number;
  A: number;
  /** Atomic mass, u (AME 2020). */
  massU: number;
}

const nuc = (key: string, name: string, Z: number, A: number, massU: number): Nuclide =>
  ({ key, name, label: key, Z, A, massU });

export const NUCLIDES: Record<string, Nuclide> = Object.fromEntries([
  nuc('n', 'neutron', 0, 1, M_NEUTRON_U),
  nuc('H-1', 'hydrogen-1', 1, 1, M_HYDROGEN_U),
  nuc('H-2', 'deuterium', 1, 2, 2.01410177812),
  nuc('H-3', 'tritium', 1, 3, 3.01604928199),
  nuc('He-3', 'helium-3', 2, 3, 3.01602932265),
  nuc('He-4', 'helium-4', 2, 4, 4.00260325413),
  nuc('Li-6', 'lithium-6', 3, 6, 6.0151228874),
  nuc('Li-7', 'lithium-7', 3, 7, 7.0160034366),
  nuc('Be-9', 'beryllium-9', 4, 9, 9.012183065),
  nuc('B-10', 'boron-10', 5, 10, 10.01293695),
  nuc('B-11', 'boron-11', 5, 11, 11.00930536),
  nuc('C-12', 'carbon-12', 6, 12, 12),
  nuc('C-14', 'carbon-14', 6, 14, 14.0032419884),
  nuc('N-14', 'nitrogen-14', 7, 14, 14.00307400443),
  nuc('O-16', 'oxygen-16', 8, 16, 15.99491461957),
  nuc('Ne-20', 'neon-20', 10, 20, 19.9924401762),
  nuc('Al-28', 'aluminium-28', 13, 28, 27.98191021),
  nuc('Si-28', 'silicon-28', 14, 28, 27.97692653465),
  nuc('Fe-56', 'iron-56', 26, 56, 55.93493633),
  nuc('Ni-56', 'nickel-56', 28, 56, 55.94212855),
  nuc('Ni-62', 'nickel-62', 28, 62, 61.92834537),
  nuc('Kr-92', 'krypton-92', 36, 92, 91.926173094),
  nuc('Zr-94', 'zirconium-94', 40, 94, 93.90631252),
  nuc('Ce-140', 'cerium-140', 58, 140, 139.9054431),
  nuc('Ba-141', 'barium-141', 56, 141, 140.9144033),
  nuc('Pb-208', 'lead-208', 82, 208, 207.9766525),
  nuc('U-235', 'uranium-235', 92, 235, 235.0439301),
  nuc('U-236', 'uranium-236', 92, 236, 236.0455682),
  nuc('U-238', 'uranium-238', 92, 238, 238.0507884),
].map((n) => [n.key, n]));

/** Measured binding energy, MeV: the mass the parts lose by joining, times c². */
export function bindingEnergy(n: Nuclide): number {
  return (n.Z * M_HYDROGEN_U + (n.A - n.Z) * M_NEUTRON_U - n.massU) * MEV_PER_U;
}

export function bindingPerNucleon(n: Nuclide): number {
  return n.A > 0 ? bindingEnergy(n) / n.A : 0;
}

/**
 * Mass difference reactants − products, u. Positive: the products are lighter.
 * Nucleon number must balance. Charge may change only through beta decay,
 * which atomic masses already account for (the atom gains or loses the
 * electron), so pass `weak` for a ledger that includes beta decays.
 */
export function massDefectU(reactants: string[], products: string[], weak = false): number {
  const sum = (ks: string[]) => ks.reduce((s, k) => s + NUCLIDES[k].massU, 0);
  const tally = (ks: string[], f: (n: Nuclide) => number) => ks.reduce((s, k) => s + f(NUCLIDES[k]), 0);
  if (!weak && tally(reactants, (n) => n.Z) !== tally(products, (n) => n.Z)) throw new Error('charge not conserved');
  if (tally(reactants, (n) => n.A) !== tally(products, (n) => n.A)) throw new Error('nucleon number not conserved');
  return sum(reactants) - sum(products);
}

/** Q-value, MeV: energy released (positive) or needed (negative). Q = Δm c². */
export function qValue(reactants: string[], products: string[], weak = false): number {
  return massDefectU(reactants, products, weak) * MEV_PER_U;
}

/** Named reactions the lessons quote. */
export const REACTIONS = {
  /** Deuterium + tritium → helium-4 + neutron. */
  dt: { reactants: ['H-2', 'H-3'], products: ['He-4', 'n'] },
  /** One prompt fission channel of uranium-235. */
  u235Prompt: { reactants: ['n', 'U-235'], products: ['Ba-141', 'Kr-92', 'n', 'n', 'n'] },
  /** Fission of U-235 followed by the fragments' six beta decays to stable nuclei. */
  u235ToStable: { reactants: ['n', 'U-235'], products: ['Ce-140', 'Zr-94', 'n', 'n'], weak: true },
  /** Stellar burning stages. The Sun's chain turns two protons into neutrons. */
  hydrogenToHelium: { reactants: ['H-1', 'H-1', 'H-1', 'H-1'], products: ['He-4'], weak: true },
  heliumToCarbon: { reactants: ['He-4', 'He-4', 'He-4'], products: ['C-12'] },
  siliconToNickel: { reactants: ['Si-28', 'Si-28'], products: ['Ni-56'] },
  ironInHalf: { reactants: ['Fe-56'], products: ['Al-28', 'Al-28'] },
} as const satisfies Record<string, { reactants: readonly string[]; products: readonly string[]; weak?: boolean }>;

export type ReactionKey = keyof typeof REACTIONS;

export function reactionQ(key: ReactionKey): number {
  const r: { reactants: readonly string[]; products: readonly string[]; weak?: boolean } = REACTIONS[key];
  return qValue([...r.reactants], [...r.products], r.weak ?? false);
}

/** Energy released per nucleon of fuel, MeV. */
export function reactionQPerNucleon(key: ReactionKey): number {
  const A = REACTIONS[key].reactants.reduce((s, k) => s + NUCLIDES[k].A, 0);
  return reactionQ(key) / A;
}

/* ── the liquid drop ───────────────────────────────────────────────────── */

/** Krane's coefficients, MeV. */
export const SEMF = { aV: 15.8, aS: 18.3, aC: 0.714, aA: 23.2, aP: 12 } as const;

/**
 * Semi-empirical binding energy, MeV:
 *   B = aV·A − aS·A^{2/3} − aC·Z(Z−1)/A^{1/3} − aA·(A−2Z)²/A ± aP/√A
 * volume (every nucleon grips its neighbours), surface (the ones on the
 * outside have fewer), Coulomb (every proton repels every other), asymmetry
 * (unequal numbers cost), pairing. Z may be non-integer; pairing then off.
 */
export function semfBinding(A: number, Z: number, pairing = true): number {
  const { aV, aS, aC, aA, aP } = SEMF;
  let B = aV * A - aS * A ** (2 / 3) - (aC * Z * (Z - 1)) / A ** (1 / 3) - (aA * (A - 2 * Z) ** 2) / A;
  if (pairing && Number.isInteger(A) && Number.isInteger(Z)) {
    const N = A - Z;
    if (Z % 2 === 0 && N % 2 === 0) B += aP / Math.sqrt(A);
    else if (Z % 2 === 1 && N % 2 === 1) B -= aP / Math.sqrt(A);
  }
  return B;
}

/** The most tightly bound charge for A nucleons, without pairing (continuous). */
export function valleyZ(A: number): number {
  const { aC, aA } = SEMF;
  const c = aC / A ** (1 / 3);
  // dB/dZ = −c(2Z − 1) + 4aA(A − 2Z)/A = 0
  return (4 * aA + c) / ((8 * aA) / A + 2 * c);
}

/** The integer Z with the largest drop-model binding for this A. */
export function stableZ(A: number): number {
  let best = 1, bb = -Infinity;
  for (let Z = 1; Z < A; Z++) {
    const b = semfBinding(A, Z);
    if (b > bb) { bb = b; best = Z; }
  }
  return best;
}

/** Drop-model binding per nucleon along the floor of the valley of stability. */
export function dropDepth(A: number): number {
  return semfBinding(A, valleyZ(A), false) / A;
}

/**
 * Measured light nuclides that carry the valley below A = 20, where the drop
 * formula fails. A = 5 and A = 8 have no bound nucleus and are bridged.
 */
export const LIGHT_PATH = ['H-1', 'H-2', 'H-3', 'He-4', 'Li-6', 'Li-7', 'Be-9', 'B-10', 'B-11', 'C-12', 'N-14', 'O-16', 'Ne-20'] as const;

/** Where the measured light path hands over to the drop. */
export const DROP_FROM_A = 20;

/**
 * The valley: binding per nucleon, MeV, for the most tightly bound way to
 * hold A nucleons. Measured nuclides joined by straight lines below A = 20,
 * the liquid drop above it. The scenes draw this as the ground.
 */
export function valleyDepth(A: number): number {
  if (A >= DROP_FROM_A) return dropDepth(A);
  const pts = LIGHT_PATH.map((k) => [NUCLIDES[k].A, bindingPerNucleon(NUCLIDES[k])] as const);
  if (A <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) {
    const [a1, b1] = pts[i];
    if (A <= a1) {
      const [a0, b0] = pts[i - 1];
      return b0 + ((A - a0) / (a1 - a0)) * (b1 - b0);
    }
  }
  return pts[pts.length - 1][1];
}

/** Total binding on the valley floor, MeV. */
export const valleyBinding = (A: number) => A * valleyDepth(A);

/** The bottom of the valley: the A whose nucleons are held most tightly. */
export function valleyFloor(lo = 20, hi = 250): { A: number; depth: number } {
  let A = lo, d = -Infinity;
  for (let a = lo; a <= hi; a++) {
    const v = valleyDepth(a);
    if (v > d) { d = v; A = a; }
  }
  return { A, depth: d };
}

/** The most tightly bound nucleus in the drop model with pairing, over integer A on the stable Z. */
export function dropPeak(lo = 20, hi = 250): { A: number; Z: number; perNucleon: number } {
  let best = { A: lo, Z: stableZ(lo), perNucleon: -Infinity };
  for (let A = lo; A <= hi; A++) {
    const Z = stableZ(A);
    const b = semfBinding(A, Z) / A;
    if (b > best.perNucleon) best = { A, Z, perNucleon: b };
  }
  return best;
}

/** Energy released by fusing a nucleus of A nucleons with an identical one, both settling on the valley. */
export function fuseTwinQ(A: number): number {
  return valleyBinding(2 * A) - 2 * valleyBinding(A);
}

/** Energy released by splitting A into two halves (⌊A/2⌋ and ⌈A/2⌉), both settling on the valley. */
export function splitHalfQ(A: number): number {
  const a1 = Math.floor(A / 2);
  return valleyBinding(a1) + valleyBinding(A - a1) - valleyBinding(A);
}

/**
 * Energy released by cutting a drop of (A, Z) into a piece of A1 nucleons and
 * the rest, each keeping the parent's share of protons (as real fission
 * fragments do at the instant of the split). Drop model with pairing off.
 */
export function cutQ(A: number, Z: number, A1: number): { Q: number; Z1: number; depth1: number; depth2: number; depthParent: number } {
  const A2 = A - A1;
  const Z1 = (Z * A1) / A, Z2 = Z - Z1;
  const B1 = semfBinding(A1, Z1, false), B2 = semfBinding(A2, Z2, false), B = semfBinding(A, Z, false);
  return { Q: B1 + B2 - B, Z1, depth1: B1 / A1, depth2: B2 / A2, depthParent: B / A };
}

/** The cut that releases the most energy. */
export function bestCut(A: number, Z: number): { A1: number; Q: number } {
  let A1 = 1, Q = -Infinity;
  for (let a = 1; a <= A / 2; a++) {
    const q = cutQ(A, Z, a).Q;
    if (q > Q) { Q = q; A1 = a; }
  }
  return { A1, Q };
}

/* ── decay: a coin per nucleus per tick ────────────────────────────────── */

/** Seeded uniform [0, 1) generator, so every run and every test can be replayed. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The chance per tick that gives a half-life of `halfLifeTicks` ticks. */
export function chancePerTick(halfLifeTicks: number): number {
  return 1 - 2 ** (-1 / halfLifeTicks);
}

/** Fraction left after `ticks` ticks when each nucleus decays with chance p per tick. */
export function survivingFraction(p: number, ticks: number): number {
  return (1 - p) ** ticks;
}

/**
 * Flip the coin for every nucleus, every tick, until it decays or the run
 * ends. Returns the tick on which each nucleus decayed (1-based), or
 * Infinity if it outlived the run. Every nucleus faces the same p every tick.
 */
export function decayTicks(n: number, p: number, maxTicks: number, seed: number): number[] {
  const rnd = mulberry32(seed);
  const out = new Array<number>(n).fill(Infinity);
  for (let i = 0; i < n; i++) {
    for (let k = 1; k <= maxTicks; k++) {
      if (rnd() < p) { out[i] = k; break; }
    }
  }
  return out;
}

/** How many are left after each tick 0..maxTicks, from `decayTicks`. */
export function remainingByTick(ticks: number[], maxTicks: number): number[] {
  const left = new Array<number>(maxTicks + 1).fill(0);
  for (let k = 0; k <= maxTicks; k++) left[k] = ticks.reduce((s, t) => s + (t > k ? 1 : 0), 0);
  return left;
}

/** Expected number left: N₀·(½)^{t/t½}. */
export function expectedRemaining(N0: number, t: number, halfLife: number): number {
  return N0 * 2 ** (-t / halfLife);
}

/** Time for the expected count to fall to a fraction f: t½·log₂(1/f). */
export function timeToFraction(f: number, halfLife: number): number {
  return halfLife * Math.log2(1 / f);
}

/** Decay constant λ = ln 2 / t½: the chance per unit time, for short times. */
export const decayConstant = (halfLife: number) => Math.LN2 / halfLife;

/** Carbon-14 half-life, years (the Cambridge value used for dating). */
export const C14_HALF_LIFE_YR = 5730;

/** Age of a sample whose C-14 has fallen to `ratio` of the living value, years. */
export function radiocarbonAge(ratio: number, halfLife = C14_HALF_LIFE_YR): number {
  return timeToFraction(ratio, halfLife);
}
