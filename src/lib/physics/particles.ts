/**
 * Particle bookkeeping — University Physics, Chapter 44.
 *
 * A reaction is allowed only if a short list of counts is the same before and
 * after: electric charge Q, baryon number B, lepton number L (and each lepton
 * flavour separately), and, for a decay at rest, the products must be no
 * heavier than the parent. This file holds a small particle table and the
 * ledger that adds the counts up. The tests in
 * __tests__/particles.test.ts pin which reactions the lessons call allowed.
 *
 * Masses are rest energies in MeV (PDG values, rounded). An antiparticle has
 * the same mass and every count negated.
 */

export interface Particle {
  key: ParticleKey;
  /** Display symbol. A bar is the combining macron U+0304. */
  symbol: string;
  name: string;
  /** Rest energy, MeV. */
  mass: number;
  Q: number;
  B: number;
  /** Electron-flavour lepton number. */
  Le: number;
  /** Muon-flavour lepton number. */
  Lmu: number;
  anti: boolean;
}

const base = {
  p: { symbol: 'p', name: 'proton', mass: 938.272, Q: 1, B: 1, Le: 0, Lmu: 0 },
  n: { symbol: 'n', name: 'neutron', mass: 939.565, Q: 0, B: 1, Le: 0, Lmu: 0 },
  'e-': { symbol: 'e⁻', name: 'electron', mass: 0.511, Q: -1, B: 0, Le: 1, Lmu: 0 },
  'mu-': { symbol: 'μ⁻', name: 'muon', mass: 105.658, Q: -1, B: 0, Le: 0, Lmu: 1 },
  nu_e: { symbol: 'νₑ', name: 'electron neutrino', mass: 0, Q: 0, B: 0, Le: 1, Lmu: 0 },
  nu_mu: { symbol: 'ν_μ', name: 'muon neutrino', mass: 0, Q: 0, B: 0, Le: 0, Lmu: 1 },
  'pi+': { symbol: 'π⁺', name: 'positive pion', mass: 139.570, Q: 1, B: 0, Le: 0, Lmu: 0 },
  pi0: { symbol: 'π⁰', name: 'neutral pion', mass: 134.977, Q: 0, B: 0, Le: 0, Lmu: 0 },
  gamma: { symbol: 'γ', name: 'photon', mass: 0, Q: 0, B: 0, Le: 0, Lmu: 0 },
} as const;

/** Each particle's antiparticle key. γ and π⁰ are their own. */
const antiOf = {
  p: 'pbar', n: 'nbar', 'e-': 'e+', 'mu-': 'mu+', nu_e: 'nubar_e', nu_mu: 'nubar_mu', 'pi+': 'pi-',
} as const;

const antiSymbol: Record<keyof typeof antiOf, string> = {
  p: 'p̄', n: 'n̄', 'e-': 'e⁺', 'mu-': 'μ⁺', nu_e: 'ν̄ₑ', nu_mu: 'ν̄_μ', 'pi+': 'π⁻',
};
const antiName: Record<keyof typeof antiOf, string> = {
  p: 'antiproton', n: 'antineutron', 'e-': 'positron', 'mu-': 'antimuon',
  nu_e: 'electron antineutrino', nu_mu: 'muon antineutrino', 'pi+': 'negative pion',
};

export type ParticleKey = keyof typeof base | (typeof antiOf)[keyof typeof antiOf];

export const PARTICLES = (() => {
  const out = {} as Record<ParticleKey, Particle>;
  for (const k of Object.keys(base) as (keyof typeof base)[]) {
    out[k] = { key: k, ...base[k], anti: false };
  }
  for (const k of Object.keys(antiOf) as (keyof typeof antiOf)[]) {
    const b = base[k];
    out[antiOf[k]] = {
      key: antiOf[k], symbol: antiSymbol[k], name: antiName[k], mass: b.mass,
      Q: -b.Q, B: -b.B, Le: -b.Le, Lmu: -b.Lmu, anti: true,
    };
  }
  return out;
})();

/** The symbol for a key, e.g. 'nubar_e' → 'ν̄ₑ'. */
export const sym = (k: ParticleKey) => PARTICLES[k].symbol;

export interface Totals { Q: number; B: number; L: number; Le: number; Lmu: number; mass: number }

export function totals(keys: readonly ParticleKey[]): Totals {
  const t: Totals = { Q: 0, B: 0, L: 0, Le: 0, Lmu: 0, mass: 0 };
  for (const k of keys) {
    const p = PARTICLES[k];
    t.Q += p.Q; t.B += p.B; t.Le += p.Le; t.Lmu += p.Lmu; t.L += p.Le + p.Lmu; t.mass += p.mass;
  }
  t.mass = +t.mass.toFixed(6);
  return t;
}

export interface Line { before: number; after: number; ok: boolean }
export interface Ledger {
  charge: Line;
  baryon: Line;
  /** Total lepton number. */
  lepton: Line;
  /** Each flavour separately (L_e and L_μ). */
  flavour: { ok: boolean };
  /** Rest energy, MeV. For a decay (one particle before) the products must be no
   *  heavier than the parent. With two or more particles colliding, kinetic
   *  energy can pay the difference, so this line is always ok. */
  energy: Line & { decay: boolean };
}

export function ledger(before: readonly ParticleKey[], after: readonly ParticleKey[]): Ledger {
  const a = totals(before), b = totals(after);
  const line = (x: number, y: number): Line => ({ before: x, after: y, ok: x === y });
  const decay = before.length === 1;
  return {
    charge: line(a.Q, b.Q),
    baryon: line(a.B, b.B),
    lepton: line(a.L, b.L),
    flavour: { ok: a.Le === b.Le && a.Lmu === b.Lmu },
    energy: { before: a.mass, after: b.mass, ok: !decay || b.mass <= a.mass, decay },
  };
}

export type Law = 'charge' | 'baryon' | 'lepton' | 'energy';

/** The laws a reaction breaks, in the order the lessons name them. */
export function broken(before: readonly ParticleKey[], after: readonly ParticleKey[]): Law[] {
  const l = ledger(before, after);
  const out: Law[] = [];
  if (!l.charge.ok) out.push('charge');
  if (!l.baryon.ok) out.push('baryon');
  if (!l.lepton.ok || !l.flavour.ok) out.push('lepton');
  if (!l.energy.ok) out.push('energy');
  return out;
}

export const allowed = (before: readonly ParticleKey[], after: readonly ParticleKey[]) =>
  broken(before, after).length === 0;

/* ── decays and collisions as events ──────────────────────────────────── */

/**
 * The common momentum p (MeV/c) of n products flying out evenly spaced in
 * angle, so that the total momentum is zero, sharing total energy M (MeV):
 *   Σ √(p² + mᵢ²) = M.
 * One honest point in the space of possible events. Zero when M ≤ Σm.
 */
export function burstMomentum(masses: readonly number[], M: number): number {
  const E = (p: number) => masses.reduce((s, m) => s + Math.sqrt(p * p + m * m), 0);
  if (E(0) >= M) return 0;
  let lo = 0, hi = M;
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    if (E(mid) > M) hi = mid; else lo = mid;
  }
  return (lo + hi) / 2;
}

/** Speed as a fraction of c for momentum p and mass m. */
export const betaOf = (p: number, m: number) => (p === 0 ? 0 : p / Math.sqrt(p * p + m * m));

/** Total energy in the centre-of-momentum frame for two equal beams of protons
 *  meeting head on, each with kinetic energy K (MeV). */
export const colliderEnergy = (K: number, m = PARTICLES.p.mass) => 2 * (K + m);

/** The same quantity, √s, for a beam proton of kinetic energy K hitting a proton at rest. */
export const fixedTargetEnergy = (K: number, m = PARTICLES.p.mass) =>
  Math.sqrt(2 * m * m + 2 * m * (K + m));

/** Kinetic energy per beam that just makes final states of total mass M in a collider. */
export const colliderThreshold = (M: number, m = PARTICLES.p.mass) => M / 2 - m;

/** Beam kinetic energy that just makes final mass M on a proton at rest. */
export const fixedTargetThreshold = (M: number, m = PARTICLES.p.mass) => (M * M - 4 * m * m) / (2 * m);

/**
 * The lightest final state that contains `must`, keeps every count of the
 * initial state, and is built from `pool` with at most `maxN` particles.
 * A brute search over multisets: small enough to read, honest by construction.
 */
export function lightestStateWith(
  must: ParticleKey,
  initial: readonly ParticleKey[],
  pool: readonly ParticleKey[] = ['p', 'n', 'pbar', 'nbar', 'pi+', 'pi-', 'pi0'],
  maxN = 5,
): { keys: ParticleKey[]; mass: number } | null {
  let best: { keys: ParticleKey[]; mass: number } | null = null;
  const pick = (start: number, chosen: ParticleKey[]) => {
    if (chosen.length > 0 && chosen.includes(must)) {
      const ok = broken(initial, chosen).length === 0;
      const m = totals(chosen).mass;
      if (ok && (!best || m < best.mass)) best = { keys: [...chosen], mass: m };
    }
    if (chosen.length === maxN) return;
    for (let i = start; i < pool.length; i++) { chosen.push(pool[i]); pick(i, chosen); chosen.pop(); }
  };
  pick(0, []);
  return best;
}

/** The scene's antiproton factory: two proton beams meeting head on. */
export const PBAR_STATE = lightestStateWith('pbar', ['p', 'p'])!;

/** Kinetic energy per beam that just makes an antiproton: m_p c², 938 MeV. */
export const PBAR_COLLIDER_K = colliderThreshold(PBAR_STATE.mass);

/** Against a proton at rest the same state costs 6 m_p c², 5.6 GeV: the Bevatron's design energy. */
export const PBAR_FIXED_K = fixedTargetThreshold(PBAR_STATE.mass);

/**
 * What the scene shows coming out of a head-on p + p collision with K per
 * beam. Above the antiproton threshold: the lightest antiproton state plus as
 * many pions as the leftover energy allows (up to 4). Below it: the two
 * protons plus as many pions as fit (up to 6), in charge-neutral sets.
 * Every outcome keeps all the counts (tested).
 */
export function collisionOutcome(K: number): ParticleKey[] {
  const sqrtS = colliderEnergy(K);
  const pions = (spare: number, cap: number): ParticleKey[] => {
    const n = Math.min(cap, Math.max(0, Math.floor(spare / PARTICLES['pi+'].mass)));
    const out: ParticleKey[] = [];
    for (let i = 0; i + 1 < n; i += 2) out.push('pi+', 'pi-');
    if (n % 2 === 1) out.push('pi0');
    return out;
  };
  if (sqrtS >= PBAR_STATE.mass) return [...PBAR_STATE.keys, ...pions(sqrtS - PBAR_STATE.mass, 4)];
  return ['p', 'p', ...pions(sqrtS - 2 * PARTICLES.p.mass, 6)];
}
