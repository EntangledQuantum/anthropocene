/** Chapter 42: molecules and condensed matter.
 *
 *  Three small models, each the simplest one that carries a lesson honestly.
 *
 *    a molecule — two atoms in a Morse well. Near the bottom every well is a
 *                 parabola, so the bond is a spring of stiffness k = U''(r_e),
 *                 and the pair vibrates at ω = √(k/μ) with the reduced mass
 *                 μ = m₁m₂/(m₁+m₂). Swapping H for D changes μ and nothing
 *                 else, because the well is set by the electrons.
 *    a chain    — N identical atoms in a row, one orbital each, neighbours
 *                 coupled by a hopping t that grows as they approach
 *                 (tight binding). The energy levels are the eigenvalues of an
 *                 N×N tridiagonal matrix, computed here by bisection. On a
 *                 ring, filling those levels and pushing the whole sea one
 *                 step in k shows why a full band carries no current.
 *    a crystal  — silicon's free-carrier density, n ∝ T^{3/2} e^{−E_g/2kT},
 *                 and copper's resistivity in the simplest phonon picture,
 *                 ρ ∝ T.
 *
 *  solids.test.ts pins every claim the chapter's lessons make.
 */

/* ── constants ──────────────────────────────────────────────────────────── */

/** Atomic mass unit, kg. */
export const AMU = 1.6605390666e-27;
/** Elementary charge, C (also J per eV). */
export const E_CHARGE = 1.602176634e-19;
/** Speed of light, m/s. */
export const C_LIGHT = 299792458;
/** Boltzmann's constant, eV/K. */
export const K_B_EV = 8.617333262e-5;
/** Reduced Planck constant, J·s. */
export const HBAR = 1.054571817e-34;

/** Isotope masses, u. */
export const ISOTOPES = {
  H: 1.00782503,
  D: 2.01410178,
  C12: 12,
  C13: 13.00335484,
  O16: 15.99491462,
  O18: 17.99915962,
  Cl35: 34.96885268,
  Cl37: 36.96590259,
  I127: 126.904473,
} as const;
export type Isotope = keyof typeof ISOTOPES;

/* ── a molecule ─────────────────────────────────────────────────────────── */

/** μ = m₁m₂/(m₁+m₂). Dominated by the lighter partner: HCl's μ is 0.98 u. */
export const reducedMass = (m1: number, m2: number) => (m1 * m2) / (m1 + m2);

/** A Morse bond: depth D_e (eV), stiffness parameter a (1/Å), length r_e (Å). */
export interface Morse {
  De: number;
  a: number;
  re: number;
}

/** Hydrogen chloride. D_e and r_e are the measured values; a is set so the
 *  harmonic frequency of H³⁵Cl matches its measured ω_e ≈ 2991 cm⁻¹. */
export const HCL: Morse = { De: 4.618, a: 1.869, re: 1.2746 };

/** U(r) in eV, zero when the atoms are far apart, −D_e at the bottom. */
export const morseU = (b: Morse, r: number) => b.De * (1 - Math.exp(-b.a * (r - b.re))) ** 2 - b.De;

/** The bottom of a well, found numerically (golden section) so it works for
 *  any potential, not only one whose minimum we already know. */
export function wellBottom(U: (r: number) => number, lo: number, hi: number): number {
  const g = (Math.sqrt(5) - 1) / 2;
  let a = lo, b = hi;
  for (let i = 0; i < 200 && b - a > 1e-12; i++) {
    const c = b - g * (b - a), d = a + g * (b - a);
    if (U(c) < U(d)) b = d; else a = c;
  }
  return (a + b) / 2;
}

/** U''(r₀) by a central second difference. For U in eV and r in Å, eV/Å². */
export const curvatureAt = (U: (r: number) => number, r0: number, h = 1e-4) =>
  (U(r0 + h) - 2 * U(r0) + U(r0 - h)) / (h * h);

/** eV/Å² → N/m. */
export const evPerA2ToSI = (k: number) => (k * E_CHARGE) / 1e-20;

/** The spring the bottom of a Morse well is, N/m (measured off the curve). */
export const bondStiffness = (b: Morse) =>
  evPerA2ToSI(curvatureAt((r) => morseU(b, r), wellBottom((r) => morseU(b, r), b.re * 0.5, b.re * 2)));

/** ω = √(k/μ), rad/s, for k in N/m and μ in u. */
export const vibrationOmega = (k: number, muU: number) => Math.sqrt(k / (muU * AMU));

/** Frequency in THz. */
export const toTHz = (omega: number) => omega / (2 * Math.PI) / 1e12;
/** Wavenumber in cm⁻¹, the unit an infrared spectrometer reads. */
export const toWavenumber = (omega: number) => omega / (2 * Math.PI * C_LIGHT * 100);
/** Infrared wavelength in µm for a frequency in THz. */
export const thzToMicron = (f: number) => (C_LIGHT / (f * 1e12)) * 1e6;

/** Harmonic vibration frequency of a diatomic in bond b, THz. */
export const harmonicTHz = (b: Morse, m1: number, m2: number) =>
  toTHz(vibrationOmega(bondStiffness(b), reducedMass(m1, m2)));

/** The frequency of light the molecule actually absorbs, THz: the gap from
 *  its lowest vibrational level to the next in a Morse well,
 *  ħω(1 − ħω/2D_e). Slightly below the harmonic value, because the well
 *  softens as it widens. */
export function absorptionTHz(b: Morse, m1: number, m2: number): number {
  const w = harmonicTHz(b, m1, m2);
  const hw = (HBAR * w * 2 * Math.PI * 1e12) / E_CHARGE; // eV
  return w * (1 - hw / (2 * b.De));
}

/** The factor a frequency changes by when the masses change: √(μ_a/μ_b). */
export const isotopeRatio = (a: [number, number], b: [number, number]) =>
  Math.sqrt(reducedMass(...a) / reducedMass(...b));

/** How strongly a gas soaks up light near one of its lines: a resonance
 *  (Lorentzian) of half-width γ. 1 on the line, ½ at f₀ ± γ. The width is a
 *  display choice for a room-temperature gas cell, not a claim. */
export const absorbed = (f: number, f0: number, gamma = 1.2) => 1 / (1 + ((f - f0) / gamma) ** 2);

/** Fraction of the lamp's light that gets through a gas cell thick enough
 *  to take 92% at the centre of the line. */
export const cellTransmission = (f: number, f0: number) => 1 - 0.92 * absorbed(f, f0);

/** Where each atom sits, Å from the centre of mass, when the bond is
 *  stretched by s beyond r_e. The light atom does nearly all the moving. */
export function atomOffsets(m1: number, m2: number, s: number): [number, number] {
  const M = m1 + m2;
  return [-(m2 / M) * s, (m1 / M) * s];
}

/* ── a chain of atoms: tight binding ────────────────────────────────────── */

/** Number of eigenvalues of the symmetric tridiagonal matrix below x
 *  (Sturm sequence count). */
function countBelow(diag: number[], off: number[], x: number): number {
  let n = 0;
  let q = diag[0] - x;
  if (q < 0) n++;
  for (let i = 1; i < diag.length; i++) {
    const p = q === 0 ? 1e-300 : q;
    q = diag[i] - x - (off[i - 1] * off[i - 1]) / p;
    if (q < 0) n++;
  }
  return n;
}

/** Every eigenvalue of a symmetric tridiagonal matrix, ascending, by
 *  bisection on the Sturm count. Plain and exact to ~1e-12. */
export function tridiagEigenvalues(diag: number[], off: number[]): number[] {
  const N = diag.length;
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < N; i++) {
    const r = (i > 0 ? Math.abs(off[i - 1]) : 0) + (i < N - 1 ? Math.abs(off[i]) : 0);
    lo = Math.min(lo, diag[i] - r);
    hi = Math.max(hi, diag[i] + r);
  }
  const out: number[] = [];
  for (let k = 0; k < N; k++) {
    let a = lo - 1e-9, b = hi + 1e-9;
    for (let it = 0; it < 100 && b - a > 1e-13; it++) {
      const m = (a + b) / 2;
      if (countBelow(diag, off, m) > k) b = m; else a = m;
    }
    out.push((a + b) / 2);
  }
  return out;
}

/** The N levels an atomic level at ε becomes in a row of N atoms with
 *  neighbour hopping t: the eigenvalues of the chain's Hamiltonian. */
export const chainLevels = (N: number, eps: number, t: number) =>
  tridiagEigenvalues(Array(N).fill(eps), Array(Math.max(0, N - 1)).fill(-t));

/** The closed form the computed levels must agree with. */
export const chainLevelsExact = (N: number, eps: number, t: number) =>
  Array.from({ length: N }, (_, j) => eps - 2 * t * Math.cos(((j + 1) * Math.PI) / (N + 1)));

export const spread = (levels: number[]) => Math.max(...levels) - Math.min(...levels);

/** A model atom with two levels, and how strongly neighbours share each one.
 *  The upper orbital reaches further, so it couples more and fans wider.
 *  Hopping grows exponentially as the atoms close in, like orbital overlap. */
export const MODEL_ATOM = {
  levels: [
    { E: -6.2, t0: 0.55 },
    { E: -2.4, t0: 0.85 },
  ],
  /** Spacing at which t = t0, nm. */
  d0: 0.25,
  /** Overlap decay length, nm. */
  lambda: 0.045,
} as const;

export const hopping = (t0: number, d: number) => t0 * Math.exp(-(d - MODEL_ATOM.d0) / MODEL_ATOM.lambda);

/** The two bands a row of N model atoms at spacing d (nm) makes, eV. */
export const crystalBands = (N: number, d: number) =>
  MODEL_ATOM.levels.map((l) => chainLevels(N, l.E, hopping(l.t0, d)));

/** Width of a band of N atoms over the split of a pair, at the same spacing.
 *  Measured from the computed levels; tends to 2 and never reaches it. */
export function widthOverPairSplit(N: number, t = 1): number {
  return spread(chainLevels(N, 0, t)) / spread(chainLevels(2, 0, t));
}

/** Fewest atoms whose band is at least `ratio` times the pair's split. */
export function atomsForWidthRatio(ratio: number, maxN = 2000): number {
  for (let N = 2; N <= maxN; N++) if (widthOverPairSplit(N) >= ratio) return N;
  return Infinity;
}

/* ── filling a band, and pushing it ─────────────────────────────────────── */

/** A ring of N atoms (N odd). Its states are k = 2πj/N; they come in shells
 *  of equal energy −2t cos k: k = 0 alone, then ±k pairs. Each state holds
 *  two electrons (spin up and down), so shell 0 holds 2 and every other 4. */
export function ringShells(N: number): number[] {
  return Array.from({ length: (N + 1) / 2 }, (_, s) => (2 * Math.PI * s) / N);
}

/** Electrons in the lowest `filled` shells of an N-ring. */
export const electronsIn = (N: number, filled: number) => (filled <= 0 ? 0 : 2 + 4 * (filled - 1));

/** Occupied k values (one entry per electron) for the lowest `filled`
 *  shells, shifted by `steps` quanta of 2π/N: a steady push moves every
 *  electron along in k by the same amount. */
export function occupiedK(N: number, filled: number, steps = 0): number[] {
  const out: number[] = [];
  const dk = (2 * Math.PI) / N;
  for (let s = 0; s < filled; s++) {
    const ks = s === 0 ? [0] : [s * dk, -s * dk];
    for (const k of ks) out.push(k + steps * dk, k + steps * dk);
  }
  return out;
}

/** Velocity of an electron in state k, in units of t·a/ħ: dE/dk = 2t sin k. */
export const bandVelocity = (k: number) => 2 * Math.sin(k);

/** Net current of the sea (sum of electron velocities), units of e·t·a/ħ. */
export const seaCurrent = (N: number, filled: number, steps = 0) =>
  occupiedK(N, filled, steps).reduce((s, k) => s + bandVelocity(k), 0);

/** The filling (number of shells) whose sea carries the most current when
 *  pushed one step. Found by trying them all. */
export function bestFilling(N: number): number {
  let best = 1, bestI = -Infinity;
  for (let f = 1; f <= (N + 1) / 2; f++) {
    const I = seaCurrent(N, f, 1);
    if (I > bestI + 1e-12) { bestI = I; best = f; }
  }
  return best;
}

/* ── a semiconductor and a metal, warmed ────────────────────────────────── */

/** Silicon. Effective densities of states at 300 K, cm⁻³; mobilities at
 *  300 K, cm²/V·s; atoms per cm³. */
export const SILICON = {
  Eg: 1.12,
  Nc300: 2.8e19,
  Nv300: 1.83e19,
  muN300: 1400,
  muP300: 450,
  atoms: 5.0e22,
} as const;

/** Diamond's gap, eV. Everything else about it is given silicon's values, so
 *  a comparison isolates the gap. */
export const DIAMOND_GAP = 5.47;

/** Free electrons per cm³ in a pure crystal: n = √(N_c N_v) e^{−E_g/2kT},
 *  with N_c, N_v ∝ T^{3/2}. Each freed electron leaves a hole behind. */
export function intrinsicDensity(T: number, Eg: number = SILICON.Eg): number {
  const N = Math.sqrt(SILICON.Nc300 * SILICON.Nv300) * (T / 300) ** 1.5;
  return N * Math.exp(-Eg / (2 * K_B_EV * T));
}

/** Pure silicon's conductivity, S/cm. The electrons and the holes both carry,
 *  and both are scattered more by a hotter lattice (μ ∝ T^{−3/2}). */
export function siliconConductivity(T: number): number {
  const n = intrinsicDensity(T);
  const mob = (SILICON.muN300 + SILICON.muP300) * (T / 300) ** -1.5;
  return n * E_CHARGE * mob;
}

/** Kelvins of warming that multiply the free-carrier density by ten. */
export function kelvinsPerDecade(T: number, Eg: number = SILICON.Eg): number {
  const target = 10 * intrinsicDensity(T, Eg);
  let a = 0, b = 500;
  for (let i = 0; i < 100; i++) {
    const m = (a + b) / 2;
    if (intrinsicDensity(T + m, Eg) < target) a = m; else b = m;
  }
  return (a + b) / 2;
}

/** Atoms per heat-freed electron. */
export const atomsPerFreeElectron = (T: number, Eg: number = SILICON.Eg) => SILICON.atoms / intrinsicDensity(T, Eg);

/** Volume, m³, holding one heat-freed electron on average. */
export const volumePerFreeElectron = (T: number, Eg: number = SILICON.Eg) => 1e-6 / intrinsicDensity(T, Eg);

/** Copper at 20 °C, Ω·m. */
export const COPPER_RHO_293 = 1.68e-8;

/** Copper's resistivity in the simplest phonon picture. The free electrons
 *  are always there and always fast; what limits them is collisions with
 *  the vibrating lattice. The mean square vibration amplitude grows as kT
 *  (equipartition), so the collision rate, and ρ, grow linearly with T. */
export const copperResistivity = (T: number) => COPPER_RHO_293 * (T / 293.15);

/** Conductance of a sample at T relative to the same sample at T₀. */
export const copperConductanceRatio = (T: number, T0 = 293.15) => copperResistivity(T0) / copperResistivity(T);
export const siliconConductanceRatio = (T: number, T0 = 293.15) => siliconConductivity(T) / siliconConductivity(T0);
