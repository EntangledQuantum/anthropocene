/**
 * Chapter 36 — diffraction.
 *
 * Every pattern here is interference: a sum of wavelets, one from each little
 * piece of the opening. The closed-form curves (sinc², Airy, the grating
 * formula) are provided too, and the tests check that the plain sums agree
 * with them rather than taking them on trust.
 *
 *  1. The single slit. `slitSources` cuts a slit of width a into n equal
 *     strips and puts one Huygens source at the centre of each. Far away, in
 *     direction θ, the strip at height y is ahead by y sin θ, and
 *     `huygensFar` adds the n arrows. With sources at strip centres the sum is
 *     exactly zero when a sin θ = λ, for any n: the top half and the bottom
 *     half pair off, each pair half a wavelength apart.
 *
 *     `slitField` is the same sum at a finite distance, in 2D (a long slit
 *     seen from above), with the Kirchhoff wavelet e^{ikr}/√r and obliquity
 *     (1 + cos χ)/2, normalised so an unobstructed plane wave comes out with
 *     amplitude 1. It is what the scene's wall and its shader both paint.
 *
 *  2. The round aperture. `airy` is (2 J₁(x)/x)² with J₁ from its integral
 *     representation, and `discHuygensFar` sums sources over a disc to check
 *     it. The first dark ring is at the first zero of J₁, found by bisection,
 *     so the 1.22 in 1.22 λ/D is computed, not typed.
 *
 *  3. Two points. `twoPointProfile` adds two Airy patterns (two stars shine
 *     independently, so intensities add) and `dipBetween` measures how deep
 *     the valley between them is.
 *
 *  4. The grating. N narrow slits a distance d apart. Bright lines where
 *     d sin θ = mλ, whatever N is; more slits only make them narrower, with the
 *     first dark next to a line at Δ(sin θ) = λ/(N d). Two colours are split by
 *     Rayleigh's rule once N m ≥ λ/Δλ.
 *
 * Lengths are in any one unit (the scenes use wavelengths, metres or nm);
 * angles are radians.
 */

export interface Cx { re: number; im: number }

const TAU = 2 * Math.PI;
const abs2 = (z: Cx) => z.re * z.re + z.im * z.im;

/* ── 1. the single slit ─────────────────────────────────────────────── */

/** Heights of n Huygens sources across a slit of width a centred on 0: one at
 *  the middle of each of n equal strips. */
export function slitSources(a: number, n: number): number[] {
  return Array.from({ length: n }, (_, j) => -a / 2 + ((j + 0.5) * a) / n);
}

/**
 * Far-field amplitude in direction θ from n equal wavelets across the slit,
 * each shifted in phase by its extra path −y sin θ. Normalised to 1 straight
 * ahead, so |A|² is the brightness as a fraction of the central peak.
 */
export function huygensFar(a: number, lambda: number, theta: number, n = 400): Cx {
  const k = TAU / lambda, s = Math.sin(theta);
  let re = 0, im = 0;
  for (const y of slitSources(a, n)) {
    const p = -k * y * s;
    re += Math.cos(p);
    im += Math.sin(p);
  }
  return { re: re / n, im: im / n };
}

export const huygensFarIntensity = (a: number, lambda: number, theta: number, n = 400) =>
  abs2(huygensFar(a, lambda, theta, n));

/** The phasor chain the sum above adds: n unit arrows, the j-th turned by its
 *  phase. Returned as the running tip positions, starting at the origin. */
export function phasorChain(a: number, lambda: number, theta: number, n: number): [number, number][] {
  const k = TAU / lambda, s = Math.sin(theta);
  const pts: [number, number][] = [[0, 0]];
  let x = 0, y = 0;
  // Start from the source nearest the far point so the chain turns one way.
  for (const yj of slitSources(a, n).reverse()) {
    const p = -k * yj * s + k * (a / 2) * s;
    x += Math.cos(p);
    y += Math.sin(p);
    pts.push([x, y]);
  }
  return pts;
}

/** The closed form: (sin β / β)², β = π a sin θ / λ. */
export function sincSquared(a: number, lambda: number, theta: number): number {
  const b = (Math.PI * a * Math.sin(theta)) / lambda;
  if (Math.abs(b) < 1e-12) return 1;
  const r = Math.sin(b) / b;
  return r * r;
}

/** Extra path of the far edge over the near edge, for a direction θ. */
export const edgePathDifference = (a: number, theta: number) => a * Math.sin(theta);

/** Direction of the m-th dark band: a sin θ = mλ. NaN if there is none. */
export function slitDarkAngle(a: number, lambda: number, m = 1): number {
  const s = (m * lambda) / a;
  return s <= 1 ? Math.asin(s) : NaN;
}

/** Width of the central bright band on a far wall at distance L, between the
 *  two first dark bands. */
export function centralWidthFar(a: number, lambda: number, L: number): number {
  return 2 * L * Math.tan(slitDarkAngle(a, lambda));
}

/** Enough sources that neighbours are well under a wavelength apart. */
export const sourcesFor = (a: number, lambda: number) => Math.max(64, Math.ceil((24 * a) / lambda));

/**
 * The field at (x, y), a distance x beyond a slit of width a in the plane
 * x = 0, lit by a plane wave of amplitude 1. A 2D Kirchhoff sum of n
 * cylindrical wavelets e^{i(kr − π/4)}/√(λr), weighted by their strip width
 * and the obliquity (1 + x/r)/2.
 */
export function slitField(a: number, lambda: number, x: number, y: number, n = sourcesFor(a, lambda)): Cx {
  const k = TAU / lambda, w = a / n / Math.sqrt(lambda);
  let re = 0, im = 0;
  for (const yj of slitSources(a, n)) {
    const r = Math.hypot(x, y - yj);
    const amp = (w * (1 + x / r)) / 2 / Math.sqrt(r);
    const p = k * r - Math.PI / 4;
    re += amp * Math.cos(p);
    im += amp * Math.sin(p);
  }
  return { re, im };
}

/** Brightness on a wall at distance L, height y, in units of the incoming
 *  wave's brightness. */
export const wallIntensity = (a: number, lambda: number, L: number, y: number, n = sourcesFor(a, lambda)) =>
  abs2(slitField(a, lambda, L, y, n));

/**
 * Height of the first dark band above the centre of a wall at distance L:
 * the first local minimum of the summed brightness, walking out from the
 * middle. null if the brightness only falls all the way to yMax.
 */
export function firstDarkOnWall(a: number, lambda: number, L: number, yMax: number): number | null {
  const n = sourcesFor(a, lambda);
  const f = (y: number) => wallIntensity(a, lambda, L, y, n);
  const h = lambda / 8;
  let prev = f(0), cur = f(h);
  for (let y = h; y + h <= yMax; y += h) {
    const next = f(y + h);
    if (cur < prev && cur <= next) {
      // golden-section refine inside [y − h, y + h]
      let lo = y - h, hi = y + h;
      const g = (Math.sqrt(5) - 1) / 2;
      for (let i = 0; i < 40; i++) {
        const m1 = hi - g * (hi - lo), m2 = lo + g * (hi - lo);
        if (f(m1) < f(m2)) hi = m2; else lo = m1;
      }
      return (lo + hi) / 2;
    }
    prev = cur;
    cur = next;
  }
  return null;
}

/** The slit width whose first dark bands land at ±y on a wall at distance L.
 *  Bisection: a wider slit always pulls the dark bands in. */
export function slitForDarkAt(y: number, lambda: number, L: number, aLo: number, aHi: number, yMax = 2 * y): number {
  let lo = aLo, hi = aHi;
  for (let i = 0; i < 50; i++) {
    const mid = (lo + hi) / 2;
    const d = firstDarkOnWall(mid, lambda, L, yMax);
    if (d === null || d > y) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

/* ── 2. the round aperture ──────────────────────────────────────────── */

/** Bessel J₁ from its integral, (1/π) ∫₀^π cos(τ − x sin τ) dτ, by Simpson. */
export function besselJ1(x: number, steps = 400): number {
  const h = Math.PI / steps;
  let s = 0;
  for (let i = 0; i <= steps; i++) {
    const t = i * h;
    const w = i === 0 || i === steps ? 1 : i % 2 ? 4 : 2;
    s += w * Math.cos(t - x * Math.sin(t));
  }
  return (s * h) / 3 / Math.PI;
}

/** The Airy pattern, (2 J₁(x)/x)², normalised to 1 at the centre. */
export function airy(x: number): number {
  if (Math.abs(x) < 1e-9) return 1;
  const r = (2 * besselJ1(x)) / x;
  return r * r;
}

/** First zero of J₁ after the origin: where the first dark ring sits. */
export const AIRY_FIRST_ZERO = (() => {
  let lo = 3, hi = 4.5;
  for (let i = 0; i < 60; i++) {
    const m = (lo + hi) / 2;
    if (besselJ1(lo) * besselJ1(m) <= 0) hi = m; else lo = m;
  }
  return (lo + hi) / 2;
})();

/** The 1.22 in 1.22 λ/D. */
export const RAYLEIGH_FACTOR = AIRY_FIRST_ZERO / Math.PI;

/** Brightness at angle θ from the centre of a round aperture's image. */
export const airyAt = (D: number, lambda: number, theta: number) =>
  airy((Math.PI * D * Math.sin(theta)) / lambda);

/** Angle of the first dark ring: sin θ = 1.22 λ / D. */
export const firstRingAngle = (D: number, lambda: number) => Math.asin((RAYLEIGH_FACTOR * lambda) / D);

/** Aperture that puts the first dark ring at angle α: Rayleigh's "just split". */
export const apertureToSplit = (alpha: number, lambda: number) => (RAYLEIGH_FACTOR * lambda) / Math.sin(alpha);

/**
 * The same far field, summed: sources on a square grid clipped to a disc of
 * diameter D, each shifted by its extra path x sin θ. Normalised to 1 straight
 * ahead.
 */
export function discHuygensFar(D: number, lambda: number, theta: number, grid = 161): number {
  const k = TAU / lambda, s = Math.sin(theta), R = D / 2, h = D / grid;
  let re = 0, im = 0, count = 0;
  for (let i = 0; i < grid; i++) {
    const x = -R + (i + 0.5) * h;
    for (let j = 0; j < grid; j++) {
      const y = -R + (j + 0.5) * h;
      if (x * x + y * y > R * R) continue;
      re += Math.cos(k * x * s);
      im += Math.sin(k * x * s);
      count++;
    }
  }
  return (re * re + im * im) / (count * count);
}

/* ── 3. two points of light ─────────────────────────────────────────── */

/** Brightness along the line through two equal stars `sep` apart (angle),
 *  at angle t from their midpoint. Independent sources: intensities add. */
export const twoPointProfile = (D: number, lambda: number, sep: number, t: number) =>
  airyAt(D, lambda, t - sep / 2) + airyAt(D, lambda, t + sep / 2);

/**
 * How deep the valley between two stars is, as a fraction of the peaks:
 * 1 − (brightness at the midpoint) / (brightest point). Zero when they have
 * merged into one blob.
 */
export function dipBetween(D: number, lambda: number, sep: number): number {
  const mid = twoPointProfile(D, lambda, sep, 0);
  let peak = mid;
  for (let i = 1; i <= 400; i++) {
    const t = (i / 400) * sep;
    peak = Math.max(peak, twoPointProfile(D, lambda, sep, t));
  }
  return 1 - mid / peak;
}

/* ── 4. the grating ─────────────────────────────────────────────────── */

/** N equal wavelets from narrow slits d apart, summed. Normalised to 1 at a
 *  bright line. */
export function gratingSum(N: number, d: number, lambda: number, theta: number): Cx {
  const p = (TAU * d * Math.sin(theta)) / lambda;
  let re = 0, im = 0;
  for (let j = 0; j < N; j++) {
    re += Math.cos(j * p);
    im += Math.sin(j * p);
  }
  return { re: re / N, im: im / N };
}

/** The closed form: [sin(Nφ/2) / (N sin(φ/2))]², φ = 2π d sin θ / λ. */
export function gratingIntensity(N: number, d: number, lambda: number, theta: number): number {
  const half = (Math.PI * d * Math.sin(theta)) / lambda;
  const den = N * Math.sin(half);
  if (Math.abs(den) < 1e-9 * N) return 1;
  const r = Math.sin(N * half) / den;
  return r * r;
}

/** Direction of the m-th order bright line: d sin θ = mλ. NaN if past 90°. */
export function gratingAngle(d: number, lambda: number, m: number): number {
  const s = (m * lambda) / d;
  return Math.abs(s) <= 1 ? Math.asin(s) : NaN;
}

/** Angle from the m-th bright line to its first dark neighbour (outward). */
export function lineHalfWidth(N: number, d: number, lambda: number, m: number): number {
  const s = (m * lambda) / d;
  return Math.asin(Math.min(1, s + lambda / (N * d))) - Math.asin(s);
}

/** Slits needed to split λ₁ < λ₂ in order m by Rayleigh's rule: N m = λ₁/Δλ. */
export const slitsToSplit = (l1: number, l2: number, m: number) => l1 / (m * Math.abs(l2 - l1));

/** Two lines of equal strength, in intensity. */
export const doubletProfile = (N: number, d: number, l1: number, l2: number, theta: number) =>
  gratingIntensity(N, d, l1, theta) + gratingIntensity(N, d, l2, theta);

/** Depth of the valley between the two lines of a doublet in order m, as a
 *  fraction of the dimmer of the two peaks. Zero once they have merged into a
 *  single hump. */
export function doubletDip(N: number, d: number, l1: number, l2: number, m: number): number {
  const t1 = gratingAngle(d, l1, m), t2 = gratingAngle(d, l2, m);
  const pad = (t2 - t1) * 0.5, K = 1200;
  const v = Array.from({ length: K + 1 }, (_, i) => doubletProfile(N, d, l1, l2, t1 - pad + ((t2 - t1 + 2 * pad) * i) / K));
  // the two tallest local maxima, and the lowest point between them
  const peaks: number[] = [];
  for (let i = 1; i < K; i++) if (v[i] > v[i - 1] && v[i] >= v[i + 1]) peaks.push(i);
  if (peaks.length < 2) return 0;
  const [p, q] = peaks.sort((i, j) => v[j] - v[i]).slice(0, 2).sort((i, j) => i - j);
  let lo = Infinity;
  for (let i = p; i <= q; i++) lo = Math.min(lo, v[i]);
  return Math.max(0, 1 - lo / Math.min(v[p], v[q]));
}

/* ── the scenes' fixed worlds ───────────────────────────────────────── */

/** Chapter 36's two-star scene: a pair 1 arcsecond apart, seen in green light. */
export const ARCSEC = Math.PI / 180 / 3600;
export const STARS = { sep: 1 * ARCSEC, lambda: 550e-9 } as const;

/** A mercury lamp's yellow pair through a 600 line/mm grating. */
export const MERCURY = { l1: 576.96e-9, l2: 579.07e-9, d: 1e-3 / 600 } as const;
