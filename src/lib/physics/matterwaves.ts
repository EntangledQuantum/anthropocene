/**
 * Chapter 39 — particles behaving as waves.
 *
 * Three small pieces, each written to be read:
 *
 *  1. de Broglie. Anything with momentum p has a wavelength λ = h/p. An
 *     electron that falls from rest through V volts has kinetic energy eV, so
 *     p = √(2m·eV) and λ = h/√(2m·eV). Past a few kilovolts the electron is fast
 *     enough that the relativistic momentum pc = √(K² + 2K·mc²) matters, and
 *     `electronWavelength(V, true)` uses it.
 *
 *  2. Diffraction by a crystal. Two experiments.
 *     - The teaching tube: a beam through a thin film of graphite, whose many
 *       tiny crystals sit at every orientation. Planes of spacing d send a
 *       strong beam out wherever the Bragg condition 2d·sinθ = λ holds, a cone
 *       of half-angle 2θ that meets the screen in a ring of radius L·tan 2θ.
 *     - Davisson and Germer (1927): 54 V electrons straight down onto a nickel
 *       face. The surface rows, D apart, each send back a wavelet; the wavelets
 *       from N rows add as phasors, and neighbouring rows differ in path by
 *       D·sinφ. The beam is strongest where that extra path is one wavelength.
 *
 *  3. Bohr's orbits as standing waves. On a circular orbit of radius r round a
 *     nucleus of charge Ze, the Coulomb pull supplies the centripetal force,
 *     μv²/r = kZe²/r², which fixes the speed and so λ = h/(μv). Wrap that wave
 *     round the orbit: after each trip it comes back shifted by 2πr/λ whole
 *     turns. `lapSurvival` adds K trips as phasors. Only when 2πr/λ is a whole
 *     number n do the trips reinforce; that happens at r = n²·a/Z, and gives
 *     the energies E = −Z²·(μ/mₑ)·13.6 eV/n². A jump between two levels sends out
 *     one photon of wavelength hc/ΔE. The reduced mass μ = mₑM/(mₑ+M) is used
 *     throughout so the lines land where a spectrometer finds them.
 *
 * Everything is SI unless a name says otherwise (…EV, …Nm).
 */

/* ── constants (CODATA 2018) ─────────────────────────────────────────────── */

export const H = 6.62607015e-34;          // J·s
export const HBAR = H / (2 * Math.PI);
export const E_CHARGE = 1.602176634e-19;  // C
export const M_E = 9.1093837015e-31;      // kg
export const M_P = 1.67262192369e-27;     // kg
export const M_ALPHA = 6.6446573357e-27;  // kg, helium-4 nucleus
export const C_LIGHT = 299792458;         // m/s
export const EPS0 = 8.8541878128e-12;
export const K_COULOMB = 1 / (4 * Math.PI * EPS0);
export const EV = E_CHARGE;               // J per eV

/* ── 1. de Broglie ───────────────────────────────────────────────────────── */

/** λ = h/p. */
export const deBroglie = (p: number) => H / p;

/** Wavelength of a body of mass m moving at speed v (non-relativistic). */
export const wavelengthOf = (m: number, v: number) => deBroglie(m * v);

/** Momentum after falling from rest through V volts. */
export function momentumFromVolts(V: number, relativistic = false, m = M_E, q = E_CHARGE): number {
  const K = q * V;
  if (!relativistic) return Math.sqrt(2 * m * K);
  const mc2 = m * C_LIGHT * C_LIGHT;
  return Math.sqrt(K * K + 2 * K * mc2) / C_LIGHT;
}

/** An electron's wavelength after V volts of acceleration, metres. */
export const electronWavelength = (V: number, relativistic = false, m = M_E) =>
  deBroglie(momentumFromVolts(V, relativistic, m));

/** How far the plain formula overstates λ: λ_plain / λ_relativistic − 1. */
export const relativisticError = (V: number) =>
  electronWavelength(V, false) / electronWavelength(V, true) - 1;

/** A baseball as thrown: 145 g at 40 m/s (90 mph). */
export const BASEBALL = { m: 0.145, v: 40 } as const;
export const baseballWavelength = () => wavelengthOf(BASEBALL.m, BASEBALL.v);

/* ── 2a. the graphite tube ───────────────────────────────────────────────── */

/**
 * A teaching electron-diffraction tube. Graphite's two strongest ring sets
 * come from planes 0.213 nm and 0.123 nm apart; the screen is 13.5 cm from
 * the film. `blurMm` is the ring's apparent half-width on the phosphor, set by
 * the beam's spread and the crystallites' size (an apparatus property, not a
 * wave property). `share` is how the hits divide between spot and rings.
 */
export const TUBE = {
  L: 0.135,
  d: [0.213e-9, 0.123e-9] as const,
  vMin: 1000,
  vMax: 5000,
  screenMm: 50,
  blurMm: 0.55,
  share: { spot: 0.46, rings: [0.33, 0.21] as const },
} as const;

/** Bragg angle θ (between beam and planes), first order: 2d·sinθ = λ. */
export function braggAngle(d: number, lambda: number, order = 1): number {
  const s = (order * lambda) / (2 * d);
  return s <= 1 ? Math.asin(s) : NaN;
}

/** Radius of the ring on a flat screen L away: the beam is turned by 2θ. */
export const ringRadius = (V: number, d: number, L: number = TUBE.L, relativistic = true) =>
  L * Math.tan(2 * braggAngle(d, electronWavelength(V, relativistic)));

/** The voltage that puts the ring from planes `d` at radius r, by bisection. */
export function voltageForRing(r: number, d: number, L: number = TUBE.L, lo = 50, hi = 2e5): number {
  // radius falls as V rises
  for (let i = 0; i < 200; i++) {
    const m = Math.sqrt(lo * hi);
    if (ringRadius(m, d, L) > r) lo = m; else hi = m;
  }
  return Math.sqrt(lo * hi);
}

/** The task in the lesson: start at 1.2 kV and make the inner ring half as big. */
export const HALF_RING = {
  startV: 1200,
  target: () => ringRadius(1200, TUBE.d[0]) / 2,
  toleranceMm: 0.35,
} as const;

/* ── 2b. Davisson and Germer ─────────────────────────────────────────────── */

/** 54 V electrons at normal incidence on a nickel face whose rows are 0.215 nm apart. */
export const NICKEL = { D: 0.215e-9, rows: 10, V: 54, measuredPeakDeg: 50 } as const;

/** The extra path of one row's echo over its neighbour's, towards angle φ from the beam. */
export const extraPath = (phi: number, D: number = NICKEL.D) => D * Math.sin(phi);

/**
 * Relative intensity scattered towards φ by N equally spaced rows, the
 * phasor sum |Σ e^{i·2πj·D sinφ/λ}|² normalised so a perfect match is 1.
 */
export function rowIntensity(phi: number, lambda: number, D: number = NICKEL.D, N: number = NICKEL.rows): number {
  let re = 0, im = 0;
  const step = (2 * Math.PI * D * Math.sin(phi)) / lambda;
  for (let j = 0; j < N; j++) { re += Math.cos(j * step); im += Math.sin(j * step); }
  return (re * re + im * im) / (N * N);
}

/** The first-order peak: D·sinφ = λ. */
export const echoPeakAngle = (lambda: number, D: number = NICKEL.D) => Math.asin(lambda / D);

/* ── 3. Bohr's orbits as standing waves ──────────────────────────────────── */

export const reducedMass = (M: number, m = M_E) => (m * M) / (m + M);
export const MU_H = reducedMass(M_P);
export const MU_HE = reducedMass(M_ALPHA);

/** a = 4πε₀ħ²/(μe²); with μ = mₑ this is the textbook a₀ = 0.0529 nm. */
export const bohrRadius = (mu = M_E) => (HBAR * HBAR) / (mu * K_COULOMB * E_CHARGE * E_CHARGE);
export const A0 = bohrRadius(M_E);

/** Speed on a circular orbit of radius r: μv²/r = kZe²/r². */
export const orbitSpeed = (r: number, Z = 1, mu = MU_H) => Math.sqrt((K_COULOMB * Z * E_CHARGE * E_CHARGE) / (mu * r));

/** The electron's de Broglie wavelength on that orbit. */
export const orbitWavelength = (r: number, Z = 1, mu = MU_H) => H / (mu * orbitSpeed(r, Z, mu));

/** How many wavelengths fit once round the orbit, 2πr/λ. */
export const wavesPerOrbit = (r: number, Z = 1, mu = MU_H) => (2 * Math.PI * r) / orbitWavelength(r, Z, mu);

/** Radius of the n-th allowed orbit, n²·a/Z. */
export const allowedRadius = (n: number, Z = 1, mu = MU_H) => (n * n * bohrRadius(mu)) / Z;

/** Energy of a circular orbit of radius r (kinetic plus Coulomb): −kZe²/2r. */
export const orbitEnergy = (r: number, Z = 1) => -(K_COULOMB * Z * E_CHARGE * E_CHARGE) / (2 * r);

/**
 * The wave after K trips round, added as phasors: Σₖ e^{i·2πkν} / K.
 * Its size is 1 when ν is a whole number and near 0 otherwise.
 */
export function lapSum(nu: number, K: number): { re: number; im: number } {
  let re = 0, im = 0;
  for (let k = 0; k < K; k++) { re += Math.cos(2 * Math.PI * k * nu); im += Math.sin(2 * Math.PI * k * nu); }
  return { re: re / K, im: im / K };
}
export const lapSurvival = (nu: number, K: number) => Math.hypot(lapSum(nu, K).re, lapSum(nu, K).im);

/**
 * The displacement of the summed wave at angle φ round the orbit (0 ≤ φ < 2π),
 * frozen at one instant: Re[ S · e^{iνφ} ]. Not continuous across φ = 0
 * unless ν is whole, which is the seam the scene draws.
 */
export function lapWave(nu: number, phi: number, K: number, S = lapSum(nu, K)): number {
  return S.re * Math.cos(nu * phi) - S.im * Math.sin(nu * phi);
}

/** Rydberg energy for a nucleus of reduced mass μ, eV. */
export const rydbergEV = (mu = MU_H) => (mu * K_COULOMB ** 2 * E_CHARGE ** 4) / (2 * HBAR * HBAR) / EV;

/** Level energy, eV: −Z²·Ry(μ)/n². */
export const levelEV = (n: number, Z = 1, mu = MU_H) => (-Z * Z * rydbergEV(mu)) / (n * n);

/** Photon energy for a drop from nUp to nLow, eV (negative if it is a climb). */
export const photonEV = (nUp: number, nLow: number, Z = 1, mu = MU_H) => levelEV(nUp, Z, mu) - levelEV(nLow, Z, mu);

/** Photon wavelength for that drop, metres: hc/ΔE. */
export const transitionWavelength = (nUp: number, nLow: number, Z = 1, mu = MU_H) =>
  (H * C_LIGHT) / (photonEV(nUp, nLow, Z, mu) * EV);

/** Hydrogen's visible (Balmer) lines, nm: drops from n = 3…6 to n = 2. */
export const balmerLinesNm = (mu = MU_H) => [3, 4, 5, 6].map((n) => transitionWavelength(n, 2, 1, mu) * 1e9);

export type Band = 'ultraviolet' | 'visible' | 'infrared';
export const bandOf = (nm: number): Band => (nm < 380 ? 'ultraviolet' : nm > 750 ? 'infrared' : 'visible');

/**
 * An sRGB colour for a visible wavelength (Bruton's piecewise fit, with the
 * usual fall-off at the ends of the eye's range). Null outside 380–750 nm.
 */
export function spectralRgb(nm: number): [number, number, number] | null {
  if (nm < 380 || nm > 750) return null;
  let r = 0, g = 0, b = 0;
  if (nm < 440) { r = -(nm - 440) / 60; b = 1; }
  else if (nm < 490) { g = (nm - 440) / 50; b = 1; }
  else if (nm < 510) { g = 1; b = -(nm - 510) / 20; }
  else if (nm < 580) { r = (nm - 510) / 70; g = 1; }
  else if (nm < 645) { r = 1; g = -(nm - 645) / 65; }
  else r = 1;
  const f = nm < 420 ? 0.3 + (0.7 * (nm - 380)) / 40 : nm > 700 ? 0.3 + (0.7 * (750 - nm)) / 50 : 1;
  const gam = (c: number) => Math.round(255 * Math.pow(c * f, 0.8));
  return [gam(r), gam(g), gam(b)];
}
