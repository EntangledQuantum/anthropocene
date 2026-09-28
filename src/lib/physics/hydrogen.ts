/**
 * Hydrogen, Chapter 41: the atom as a three-dimensional standing wave.
 *
 * Lengths are in Bohr radii a₀ (52.9 pm) and energies in eV. The wave function
 * separates into a radial part and an angular part,
 *
 *   ψ_nlm(r, θ, φ) = R_nl(r) · Y_lm(θ, φ),
 *
 * with R_nl built from an associated Laguerre polynomial and Y_lm a *real*
 * spherical harmonic (the cos mφ / sin mφ combinations chemists draw as p_x,
 * p_y, p_z). Everything is written to be read: plain loops, the formula
 * visible in the shape of the code.
 *
 * The lesson's claims, each pinned in __tests__/hydrogen.test.ts:
 *   · every R_nl is normalised, ∫ r² R² dr = 1;
 *   · |ψ_1s|² is largest at the nucleus, yet r² R² peaks at exactly a₀;
 *   · 2s has two bumps, and the outer one holds far more;
 *   · R_nl changes sign n − l − 1 times, Y_lm has l nodal surfaces;
 *   · E_n = −13.6 eV / n², whatever l and m are.
 */

/** Bohr radius, pm. */
export const A0_PM = 52.9177;
/** Rydberg energy, eV: the binding energy of the ground state. */
export const RYDBERG_EV = 13.6057;

/** Energy of level n, eV. It depends on n alone. */
export const energyEV = (n: number) => -RYDBERG_EV / (n * n);

export const L_LETTERS = 'spdfgh';
/** '2p', '3d', … */
export const stateName = (n: number, l: number) => `${n}${L_LETTERS[l]}`;

export function factorial(k: number): number {
  let f = 1;
  for (let i = 2; i <= k; i++) f *= i;
  return f;
}

/** Generalised Laguerre polynomial L_k^(α)(x), by the three-term recurrence. */
export function genLaguerre(k: number, alpha: number, x: number): number {
  if (k === 0) return 1;
  let prev = 1;
  let cur = 1 + alpha - x;
  for (let j = 1; j < k; j++) {
    const next = ((2 * j + 1 + alpha - x) * cur - (j + alpha) * prev) / (j + 1);
    prev = cur;
    cur = next;
  }
  return cur;
}

/** The normalising constant of R_nl, in a₀^(−3/2). */
export function radialNorm(n: number, l: number): number {
  return Math.sqrt((2 / n) ** 3 * factorial(n - l - 1) / (2 * n * factorial(n + l)));
}

/** R_nl(r), r in a₀. */
export function radialR(n: number, l: number, r: number): number {
  const rho = (2 * r) / n;
  return radialNorm(n, l) * Math.exp(-rho / 2) * rho ** l * genLaguerre(n - l - 1, 2 * l + 1, rho);
}

/** Radial probability density P(r) = r² R², per a₀: the chance per unit
 *  radius, with the angles already summed over. */
export function radialProbability(n: number, l: number, r: number): number {
  const R = radialR(n, l, r);
  return r * r * R * R;
}

/** Simpson's rule on [a, b] with an even number of panels. */
export function simpson(f: (x: number) => number, a: number, b: number, panels = 400): number {
  const m = panels % 2 === 0 ? panels : panels + 1;
  const h = (b - a) / m;
  let s = f(a) + f(b);
  for (let i = 1; i < m; i++) s += (i % 2 ? 4 : 2) * f(a + i * h);
  return (s * h) / 3;
}

/** The chance of finding the electron in the thin shell r0 ≤ r ≤ r0 + dr. */
export function shellProbability(n: number, l: number, r0: number, dr: number): number {
  return simpson((r) => radialProbability(n, l, r), Math.max(0, r0), Math.max(0, r0) + dr, 40);
}

/** The chance of finding the electron farther than R from the nucleus. */
export function probabilityBeyond(n: number, l: number, R: number): number {
  return simpson((r) => radialProbability(n, l, r), R, R + 60 * n * n, 4000);
}

/** Radii of the local maxima of P(r), innermost first, located on a fine grid
 *  and refined by golden-section search. */
export function radialPeaks(n: number, l: number): number[] {
  const rMax = 6 * n * n + 10;
  const N = 6000;
  const h = rMax / N;
  const P = (r: number) => radialProbability(n, l, r);
  const out: number[] = [];
  for (let i = 1; i < N; i++) {
    const a = P((i - 1) * h), b = P(i * h), c = P((i + 1) * h);
    if (b > a && b >= c && b > 1e-12) {
      let lo = (i - 1) * h, hi = (i + 1) * h;
      const g = (Math.sqrt(5) - 1) / 2;
      for (let k = 0; k < 80; k++) {
        const x1 = hi - g * (hi - lo), x2 = lo + g * (hi - lo);
        if (P(x1) > P(x2)) hi = x2; else lo = x1;
      }
      out.push((lo + hi) / 2);
    }
  }
  return out;
}

/** The radius where P(r) is largest: the most likely distance. */
export function mostLikelyRadius(n: number, l: number): number {
  const peaks = radialPeaks(n, l);
  return peaks.reduce((best, r) => (radialProbability(n, l, r) > radialProbability(n, l, best) ? r : best), peaks[0]);
}

/** Radii where R_nl changes sign: the dark spherical shells. */
export function radialNodes(n: number, l: number): number[] {
  const rMax = 6 * n * n + 10;
  const N = 8000;
  const h = rMax / N;
  const out: number[] = [];
  let prev = radialR(n, l, h);
  for (let i = 2; i <= N; i++) {
    const cur = radialR(n, l, i * h);
    if (prev !== 0 && Math.sign(cur) !== Math.sign(prev) && Math.abs(cur) + Math.abs(prev) > 1e-14) {
      let lo = (i - 1) * h, hi = i * h;
      for (let k = 0; k < 60; k++) {
        const mid = (lo + hi) / 2;
        if (Math.sign(radialR(n, l, mid)) === Math.sign(radialR(n, l, lo))) lo = mid; else hi = mid;
      }
      out.push((lo + hi) / 2);
    }
    prev = cur;
  }
  return out;
}

/* ── the angular part ─────────────────────────────────────────────────── */

/** Associated Legendre function P_l^m(x) for m ≥ 0, without the Condon–Shortley
 *  sign (it cancels in |ψ|², and real harmonics do not need it). */
export function assocLegendre(l: number, m: number, x: number): number {
  let pmm = 1;
  const s = Math.sqrt(Math.max(0, 1 - x * x));
  for (let i = 1; i <= m; i++) pmm *= (2 * i - 1) * s;
  if (l === m) return pmm;
  let pm1 = x * (2 * m + 1) * pmm;
  if (l === m + 1) return pm1;
  let pl = 0;
  for (let k = m + 2; k <= l; k++) {
    pl = ((2 * k - 1) * x * pm1 - (k + m - 1) * pmm) / (k - m);
    pmm = pm1;
    pm1 = pl;
  }
  return pl;
}

/** The constant in front of a real spherical harmonic. */
export function ylmNorm(l: number, m: number): number {
  const am = Math.abs(m);
  const base = Math.sqrt(((2 * l + 1) / (4 * Math.PI)) * (factorial(l - am) / factorial(l + am)));
  return am === 0 ? base : Math.SQRT2 * base;
}

/** Real spherical harmonic: m > 0 carries cos mφ, m < 0 carries sin |m|φ. */
export function realYlm(l: number, m: number, theta: number, phi: number): number {
  const am = Math.abs(m);
  const P = assocLegendre(l, am, Math.cos(theta));
  const az = m > 0 ? Math.cos(am * phi) : m < 0 ? Math.sin(am * phi) : 1;
  return ylmNorm(l, m) * P * az;
}

/** ψ_nlm at a point (x, y, z) in a₀. */
export function psi(n: number, l: number, m: number, x: number, y: number, z: number): number {
  const r = Math.hypot(x, y, z);
  const theta = r === 0 ? 0 : Math.acos(Math.max(-1, Math.min(1, z / r)));
  const phi = Math.atan2(y, x);
  return radialR(n, l, r) * realYlm(l, m, theta, phi);
}

/** |ψ|², per a₀³: the chance per unit volume. */
export function density(n: number, l: number, m: number, x: number, y: number, z: number): number {
  const v = psi(n, l, m, x, y, z);
  return v * v;
}

/** Polar angles where the θ-part changes sign in (0, π): nodal cones (a cone at
 *  θ = π/2 is the flat plane z = 0). */
export function polarNodes(l: number, m: number): number[] {
  const am = Math.abs(m);
  const N = 4000;
  const out: number[] = [];
  const f = (t: number) => assocLegendre(l, am, Math.cos(t));
  let prev = f(1e-6);
  for (let i = 1; i <= N; i++) {
    const t = (i / N) * (Math.PI - 2e-6) + 1e-6;
    const cur = f(t);
    if (Math.sign(cur) !== Math.sign(prev) && prev !== 0) {
      let lo = t - (Math.PI - 2e-6) / N, hi = t;
      for (let k = 0; k < 60; k++) {
        const mid = (lo + hi) / 2;
        if (Math.sign(f(mid)) === Math.sign(f(lo))) lo = mid; else hi = mid;
      }
      out.push((lo + hi) / 2);
    }
    prev = cur;
  }
  return out;
}

/** Azimuths in [0, π) where the φ-part vanishes: each is one vertical nodal
 *  plane through the z axis. */
export function azimuthalNodePlanes(m: number): number[] {
  const am = Math.abs(m);
  if (am === 0) return [];
  const out: number[] = [];
  // cos(mφ) = 0 at φ = (k + ½)π/m, sin(mφ) = 0 at φ = kπ/m.
  for (let k = 0; k < am; k++) out.push(m > 0 ? ((k + 0.5) * Math.PI) / am : (k * Math.PI) / am);
  return out;
}

/** Everything a slice picture needs to count: dark shells and dark surfaces
 *  through the nucleus. */
export function nodeCount(n: number, l: number, m: number) {
  return {
    radial: radialNodes(n, l).length,
    angular: polarNodes(l, m).length + azimuthalNodePlanes(m).length,
  };
}

/** Density on the x–z plane (y = 0), the slice the scenes draw. */
export const sliceDensity = (n: number, l: number, m: number, x: number, z: number) => density(n, l, m, x, 0, z);

/** The largest density on a square x–z slice of half-width `half`, sampled on
 *  a grid. The scenes divide by it so the brightest pixel is 1. */
export function sliceMax(n: number, l: number, m: number, half: number, N = 161): number {
  let best = 0;
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) {
      const x = -half + (2 * half * i) / (N - 1);
      const z = -half + (2 * half * j) / (N - 1);
      best = Math.max(best, sliceDensity(n, l, m, x, z));
    }
  }
  return best;
}

/** How far out the cloud reaches: the radius holding 99% of the chance. */
export function radius99(n: number, l: number): number {
  let lo = 0, hi = 8 * n * n + 12;
  for (let k = 0; k < 50; k++) {
    const mid = (lo + hi) / 2;
    if (probabilityBeyond(n, l, mid) > 0.01) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}
