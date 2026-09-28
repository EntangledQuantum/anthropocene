/**
 * Chapter 38 — photons.
 *
 * Four small pieces, each written to be read:
 *
 *  1. The photoelectric effect. Light of frequency f arrives in lumps of
 *     energy E = hf. An electron in a metal needs at least the work function φ
 *     to get out, and it takes the energy of exactly one photon. So nothing
 *     leaves below the cutoff f₀ = φ/h, however bright the light, and the
 *     fastest electron leaves with K_max = hf − φ. Brightness sets how many
 *     photons arrive each second, so it sets how many electrons leave, and
 *     nothing else.
 *
 *  2. The stopping voltage. A reverse voltage V between the plate and the
 *     collector turns back every electron with K < eV. The photocurrent stops
 *     at eV₀ = K_max = hf − φ, a straight line against f with slope h/e.
 *     The spread of electron energies below K_max is modelled as uniform on
 *     [0, K_max] (the simplest model with the right end point); the stopping
 *     voltage depends only on the end point, which is what Millikan measured.
 *
 *  3. Photons one at a time through two slits. Fraunhofer double slit with
 *     slit width a and separation d: each slit alone gives the amplitude
 *     sinc(π a sinθ / λ); both together add with phase δ = 2π d sinθ / λ.
 *     Each photon lands at one spot, drawn at random from that intensity by
 *     inverse-CDF sampling on a fine grid. A seeded generator keeps runs
 *     repeatable.
 *
 *  4. Compton scattering. A photon carries momentum h/λ. Bouncing off a free
 *     electron at rest, it comes out at angle θ with λ' = λ + (h/mc)(1 − cos θ),
 *     and the electron takes the momentum difference. Energy is checked
 *     relativistically in the tests.
 *
 * Constants are the exact SI defining values (and CODATA 2018 for mₑ).
 * Work functions are CRC Handbook values for clean polycrystalline surfaces.
 */

/* ── constants ─────────────────────────────────────────────────────────── */

/** Planck's constant, J s (exact). */
export const H = 6.62607015e-34;
/** Elementary charge, C (exact). */
export const E_CHARGE = 1.602176634e-19;
/** Speed of light, m/s (exact). */
export const C_LIGHT = 299792458;
/** Electron mass, kg. */
export const M_E = 9.1093837015e-31;
/** hc in eV·nm: a photon of λ nm carries HC_EV_NM / λ electron-volts. */
export const HC_EV_NM = (H * C_LIGHT) / E_CHARGE * 1e9;

/* ── 1. photon energy and the photoelectric effect ─────────────────────── */

/** Work functions, eV (CRC Handbook). */
export const METALS = {
  cesium: { name: 'cesium', phi: 2.14 },
  potassium: { name: 'potassium', phi: 2.30 },
  sodium: { name: 'sodium', phi: 2.36 },
  calcium: { name: 'calcium', phi: 2.87 },
  zinc: { name: 'zinc', phi: 4.33 },
  copper: { name: 'copper', phi: 4.65 },
} as const;
export type Metal = keyof typeof METALS;

/** Frequency of light of vacuum wavelength λ (nm), Hz. */
export const frequencyOf = (nm: number) => C_LIGHT / (nm * 1e-9);
/** Wavelength (nm) of light of frequency f (Hz). */
export const wavelengthOf = (f: number) => (C_LIGHT / f) * 1e9;

/** E = hf, joules. */
export const photonEnergyJ = (f: number) => H * f;
/** Photon energy of light of wavelength λ (nm), eV. */
export const photonEnergyEv = (nm: number) => photonEnergyJ(frequencyOf(nm)) / E_CHARGE;

/** The longest wavelength that frees an electron: hc/φ, nm. */
export const cutoffNm = (phiEv: number) => HC_EV_NM / phiEv;
/** The lowest frequency that frees an electron: φ/h, Hz. */
export const cutoffHz = (phiEv: number) => (phiEv * E_CHARGE) / H;

/** Does one photon of this light carry enough to free an electron? */
export const emits = (nm: number, phiEv: number) => photonEnergyEv(nm) > phiEv;

/** The fastest electron's kinetic energy, hf − φ, eV. Zero below cutoff. */
export const kMaxEv = (nm: number, phiEv: number) => Math.max(0, photonEnergyEv(nm) - phiEv);

/** Photons per second in a beam of power P (W) at wavelength λ (nm). */
export const photonRate = (powerW: number, nm: number) => powerW / photonEnergyJ(frequencyOf(nm));

/**
 * Fraction of arriving photons that free an electron above cutoff. An
 * illustrative value; clean alkali cathodes run from about 1% to 20% in the
 * violet. It scales the electron count and nothing else.
 */
export const QUANTUM_EFFICIENCY = 0.01;

/** Electrons freed per second. Zero below cutoff at any power. */
export const electronRate = (powerW: number, nm: number, phiEv: number, qe = QUANTUM_EFFICIENCY) =>
  emits(nm, phiEv) ? qe * photonRate(powerW, nm) : 0;

/** Speed of an electron with kinetic energy K (eV), m/s (K ≪ mc², fine here). */
export const electronSpeed = (kEv: number) => Math.sqrt((2 * kEv * E_CHARGE) / M_E);

/**
 * Wave-model estimate: light of intensity I (W/m²) spread evenly over the
 * metal, with one atom-sized square of side `patch` (m) soaking it up. The
 * seconds before that patch has collected the work function.
 */
export const classicalSoakTime = (intensity: number, patch: number, phiEv: number) =>
  (phiEv * E_CHARGE) / (intensity * patch * patch);

/* ── 2. the stopping voltage ───────────────────────────────────────────── */

/** eV₀ = hf − φ: the reverse voltage that just stops the current, volts. */
export const stoppingVoltage = (nm: number, phiEv: number) => kMaxEv(nm, phiEv);

/**
 * Photocurrent (A) against a reverse voltage V (V), for light of power P on
 * the plate. With electron energies spread uniformly on [0, K_max], the
 * fraction still reaching the collector is 1 − V/V₀, and it is exactly zero
 * from V₀ on. Forward voltages collect everything (saturation).
 */
export function photocurrent(V: number, powerW: number, nm: number, phiEv: number): number {
  const sat = E_CHARGE * electronRate(powerW, nm, phiEv);
  const v0 = stoppingVoltage(nm, phiEv);
  if (sat === 0 || v0 === 0) return 0;
  if (V <= 0) return sat;
  return sat * Math.max(0, 1 - V / v0);
}

/** A mercury arc lamp's strong lines, nm: the lamp Millikan used. */
export const MERCURY_LINES = [
  { nm: 365.0, name: 'ultraviolet' },
  { nm: 404.7, name: 'violet' },
  { nm: 435.8, name: 'blue' },
  { nm: 546.1, name: 'green' },
  { nm: 578.0, name: 'yellow' },
] as const;

/** Least-squares straight line through (x, y) points. */
export function lineFit(pts: readonly (readonly [number, number])[]): { slope: number; intercept: number } {
  const n = pts.length;
  const mx = pts.reduce((s, p) => s + p[0], 0) / n;
  const my = pts.reduce((s, p) => s + p[1], 0) / n;
  let sxy = 0, sxx = 0;
  for (const [x, y] of pts) { sxy += (x - mx) * (y - my); sxx += (x - mx) ** 2; }
  const slope = sxy / sxx;
  return { slope, intercept: my - slope * mx };
}

/** Planck's constant from measured (frequency Hz, stopping voltage V) points: e × slope. */
export const planckFromPoints = (pts: readonly (readonly [number, number])[]) => E_CHARGE * lineFit(pts).slope;

/* ── 3. photons one at a time through two slits ────────────────────────── */

/** The apparatus: a helium-neon laser, two slits, a screen a metre away. */
export const SLITS = { lambda: 633e-9, d: 0.25e-3, a: 0.05e-3, L: 1.0, screenMm: 15 } as const;
export type Open = 'both' | 'A' | 'B';

const sinc = (x: number) => (Math.abs(x) < 1e-12 ? 1 : Math.sin(x) / x);

/** Intensity on the screen at y (mm), in units where one slit alone peaks at 1. */
export function screenIntensity(yMm: number, open: Open, s: { lambda: number; d: number; a: number; L: number } = SLITS): number {
  const y = yMm * 1e-3;
  const sin = y / Math.hypot(y, s.L);
  const one = sinc((Math.PI * s.a * sin) / s.lambda) ** 2;
  if (open !== 'both') return one;
  const half = (Math.PI * s.d * sin) / s.lambda; // δ/2
  return 4 * one * Math.cos(half) ** 2;
}

/** Spacing between neighbouring bright stripes, λL/d, mm. */
export const stripeSpacingMm = (s = SLITS) => ((s.lambda * s.L) / s.d) * 1e3;

/** Dark stripes of the two-slit pattern on the screen, mm (where cos(δ/2) = 0). */
export function darkStripesMm(s = SLITS): number[] {
  const out: number[] = [];
  for (let m = -40; m <= 40; m++) {
    const sin = ((m + 0.5) * s.lambda) / s.d;
    if (Math.abs(sin) >= 1) continue;
    const y = (s.L * sin) / Math.sqrt(1 - sin * sin) * 1e3;
    if (Math.abs(y) <= s.screenMm) out.push(y);
  }
  return out;
}

/** A pattern on [−Y, Y] mm, tabulated for sampling and for exact shares. */
export interface Pattern { open: Open; ys: Float64Array; cdf: Float64Array; Y: number }

export function makePattern(open: Open, n = 30000, s = SLITS): Pattern {
  const Y = s.screenMm;
  const ys = new Float64Array(n + 1), cdf = new Float64Array(n + 1);
  const h = (2 * Y) / n;
  for (let i = 0; i <= n; i++) ys[i] = -Y + i * h;
  for (let i = 1; i <= n; i++) {
    // midpoint rule per cell: piecewise-constant density
    cdf[i] = cdf[i - 1] + screenIntensity((ys[i - 1] + ys[i]) / 2, open, s) * h;
  }
  const tot = cdf[n];
  for (let i = 0; i <= n; i++) cdf[i] /= tot;
  return { open, ys, cdf, Y };
}

/** Fraction of the pattern's photons landing on [y0, y1] mm. */
export function shareOf(p: Pattern, y0: number, y1: number): number {
  const F = (y: number) => {
    const n = p.ys.length - 1;
    const u = Math.min(Math.max((y + p.Y) / (2 * p.Y), 0), 1) * n;
    const i = Math.min(Math.floor(u), n - 1);
    return p.cdf[i] + (u - i) * (p.cdf[i + 1] - p.cdf[i]);
  };
  return F(Math.max(y0, y1)) - F(Math.min(y0, y1));
}

/** Where one photon lands: invert the CDF at a uniform random number. */
export function sampleArrival(p: Pattern, u: number): number {
  let lo = 0, hi = p.cdf.length - 1;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (p.cdf[mid] < u) lo = mid; else hi = mid; }
  const w = p.cdf[hi] - p.cdf[lo];
  const t = w > 0 ? (u - p.cdf[lo]) / w : 0.5;
  return p.ys[lo] + t * (p.ys[hi] - p.ys[lo]);
}

/** A small seeded generator (mulberry32): repeatable runs. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Fire photons at the barrier. With one slit covered, half of them hit the
 * cover and are absorbed (null); the rest land by that slit's pattern.
 */
export function fire(p: Pattern, n: number, rand: () => number): (number | null)[] {
  const out: (number | null)[] = [];
  for (let i = 0; i < n; i++) {
    if (p.open !== 'both' && rand() < 0.5) { out.push(null); continue; }
    out.push(sampleArrival(p, rand()));
  }
  return out;
}

/** Expected fraction of fired photons that land in [y0, y1]. */
export const firedShare = (p: Pattern, y0: number, y1: number) =>
  (p.open === 'both' ? 1 : 0.5) * shareOf(p, y0, y1);

/* ── 4. Compton scattering ─────────────────────────────────────────────── */

/** A photon's momentum, h/λ (λ in m), kg m/s. */
export const photonMomentum = (lambda: number) => H / lambda;

/** The Compton wavelength h/mc, m. */
export const COMPTON_LAMBDA = H / (M_E * C_LIGHT);

/** λ' − λ for scattering through θ (rad), m. */
export const comptonShift = (theta: number) => COMPTON_LAMBDA * (1 - Math.cos(theta));

/** Molybdenum Kα X-rays, the line Compton used, scattered through 90°. */
export const COMPTON = { lambda: 71.1e-12, theta: Math.PI / 2 } as const;

/**
 * Everything about one Compton event: photon in along +x, photon out at θ
 * above the axis, electron at rest before. Momenta in kg m/s, energies in eV.
 */
export function comptonEvent(lambda: number, theta: number) {
  const lambdaOut = lambda + comptonShift(theta);
  const pIn: [number, number] = [photonMomentum(lambda), 0];
  const pOut: [number, number] = [photonMomentum(lambdaOut) * Math.cos(theta), photonMomentum(lambdaOut) * Math.sin(theta)];
  const pE: [number, number] = [pIn[0] - pOut[0], pIn[1] - pOut[1]];
  const mc2 = M_E * C_LIGHT ** 2;
  const pc = Math.hypot(pE[0], pE[1]) * C_LIGHT;
  const kE = (Math.sqrt(pc * pc + mc2 * mc2) - mc2) / E_CHARGE;
  return {
    lambdaOut, pIn, pOut, pE, electronKeV: kE / 1000,
    eInKeV: (H * C_LIGHT) / lambda / E_CHARGE / 1000,
    eOutKeV: (H * C_LIGHT) / lambdaOut / E_CHARGE / 1000,
  };
}
