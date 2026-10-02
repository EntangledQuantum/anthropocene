/**
 * The expanding universe as kinematics — University Physics, Chapter 44.
 *
 * Galaxies sit on a sheet that stretches uniformly. If every distance grows by
 * the same factor, then seen from ANY galaxy every other one recedes at a speed
 * proportional to its distance: v = H₀ d. There is no centre, because the rule
 * reads the same from every home.
 *
 * Run the film backwards at today's speeds and every separation reaches zero
 * at the same moment, 1/H₀ ago, about 14 billion years. Light crossing the
 * sheet is stretched with it: 1 + z = a_now / a_then, so each photon's energy
 * and the temperature of a thermal glow both fall by that factor. The cosmic
 * microwave background is 3000 K light stretched about 1100 times.
 *
 * The tests in __tests__/cosmos.test.ts pin every claim the lessons make.
 */

/** Hubble constant used throughout the lessons, km/s per megaparsec. */
export const H0 = 70;
/** Kilometres in a megaparsec. */
export const KM_PER_MPC = 3.0857e19;
/** Seconds in a billion (Julian) years. */
export const S_PER_GYR = 3.15576e16;
/** Speed of light, km/s. */
export const C_KM_S = 299_792.458;

export type Pt = readonly [number, number];

/** Recession speed, km/s, of something d megaparsecs away. */
export const hubbleSpeed = (dMpc: number, H = H0) => H * dMpc;

/** The Hubble time 1/H₀ in billions of years: about 13.97 for H₀ = 70. */
export const hubbleTimeGyr = (H = H0) => KM_PER_MPC / H / S_PER_GYR;

/** Time for a pair to close distance d at constant speed v (km/s), in Gyr. */
export const meetTimeGyr = (dMpc: number, vKmS: number) => (dMpc * KM_PER_MPC) / vKmS / S_PER_GYR;

/** Velocity of galaxy `p` as seen from `home` on a uniformly stretching sheet, km/s.
 *  Positions in Mpc. Every observer gets the same rule: v = H (p − home). */
export const relativeVelocity = (home: Pt, p: Pt, H = H0): Pt => [H * (p[0] - home[0]), H * (p[1] - home[1])];

export const dist = (a: Pt, b: Pt) => Math.hypot(b[0] - a[0], b[1] - a[1]);

/** Each galaxy's distance and recession speed from `home`. */
export function seenFrom(home: Pt, all: readonly Pt[], H = H0): { d: number; v: number }[] {
  return all.map((p) => {
    const u = relativeVelocity(home, p, H);
    return { d: dist(home, p), v: Math.hypot(u[0], u[1]) };
  });
}

/** Positions after the sheet stretches by factor s, drawn from `home`'s point of view. */
export const stretchedAbout = (home: Pt, p: Pt, s: number): Pt => [home[0] + s * (p[0] - home[0]), home[1] + s * (p[1] - home[1])];

/** A small deterministic random number generator, so a scene draws the same sky every time. */
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

/** Galaxies scattered on a jittered grid over [0, w] × [0, h] Mpc. */
export function galaxySheet(cols: number, rows: number, w: number, h: number, seed = 7, jitter = 0.32): Pt[] {
  const r = seeded(seed);
  const out: Pt[] = [];
  const dx = w / cols, dy = h / rows;
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      out.push([(i + 0.5 + (r() - 0.5) * 2 * jitter) * dx, (j + 0.5 + (r() - 0.5) * 2 * jitter) * dy]);
    }
  }
  return out;
}

/** Index of the galaxy farthest from galaxy `q`. */
export function farthestFrom(q: number, all: readonly Pt[]): number {
  let best = -1, bd = -1;
  all.forEach((p, i) => { const d = dist(all[q], p); if (i !== q && d > bd) { bd = d; best = i; } });
  return best;
}

/**
 * Scale factor `t` billion years ago if every galaxy had always moved at
 * today's speed (a coasting sheet): a = 1 − t·H₀. It reaches zero at 1/H₀,
 * for every pair at once. Clamped at zero: the rewind has nothing earlier.
 */
export const coastingScale = (tAgoGyr: number, H = H0) => Math.max(0, 1 - tAgoGyr / hubbleTimeGyr(H));

/** A separation of d₀ today, t billion years ago, on the coasting sheet. */
export const rewindDistance = (d0Mpc: number, tAgoGyr: number, H = H0) => d0Mpc * coastingScale(tAgoGyr, H);

/* ── light on the stretching sheet ────────────────────────────────────── */

/** Redshift of light that left when the scale factor was aThen. */
export const redshiftOf = (aThen: number, aNow = 1) => aNow / aThen - 1;

/** Wavelengths are stretched by the same factor as the sheet. */
export const stretchedWavelength = (lambda: number, stretch: number) => lambda * stretch;

/** Each photon's energy falls by the stretch, since E = hc/λ. */
export const stretchedPhotonEnergy = (E: number, stretch: number) => E / stretch;

/** A thermal glow stays thermal, at a temperature lowered by the stretch. */
export const stretchedTemperature = (T: number, stretch: number) => T / stretch;

/** Wien's displacement constant, m·K. */
export const WIEN_B = 2.897771955e-3;

/** Peak wavelength of a thermal glow at temperature T, metres. */
export const peakWavelength = (T: number) => WIEN_B / T;

/** The cosmic microwave background: light released by 3000 K gas, seen today at 2.725 K. */
export const CMB = { tEmit: 3000, tNow: 2.725 } as const;

/** How many times the universe has stretched since the CMB light left: about 1100. */
export const CMB_STRETCH = CMB.tEmit / CMB.tNow;

/* ── where the stretching does not apply ──────────────────────────────── */

/**
 * Hubble's law describes things nothing holds together. A system whose own
 * internal speeds (orbits, attraction) far exceed H₀d over its size is bound,
 * and does not stretch. Returns the ratio H₀d / internal speed: tiny for bound
 * systems, large for the gap between distant clusters.
 */
export const flowToBinding = (dMpc: number, internalKmS: number, H = H0) => hubbleSpeed(dMpc, H) / internalKmS;

/** Scales the lesson compares, Mpc and km/s. Speeds are measured values. */
export const SCALES = {
  /** Earth–Sun, 1 au; Earth's orbital speed. */
  earthSun: { dMpc: 1.495978707e11 / 3.0857e22, internalKmS: 29.8 },
  /** Sun to Galactic centre, about 8.2 kpc; the Sun's orbital speed. */
  milkyWay: { dMpc: 8.2e-3, internalKmS: 230 },
  /** Andromeda, 0.78 Mpc away and approaching at about 110 km/s. */
  andromeda: { dMpc: 0.78, measuredKmS: -110 },
  /** Two galaxy clusters 300 Mpc apart; peculiar speeds of a few hundred km/s. */
  clusters: { dMpc: 300, internalKmS: 500 },
} as const;

/** The lesson's sheet: 35 galaxies over 420 × 300 Mpc, and the galaxy marked Q. */
export const CH44_SHEET = galaxySheet(7, 5, 420, 300, 43);
export const CH44_Q = 6;
