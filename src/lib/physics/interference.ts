/**
 * Chapter 35 — interference.
 *
 * Four small pieces, each written to be read:
 *
 *  1. Two sources in a ripple tank. Each dipper sends out circular ripples
 *     a·cos(k r − ωt + φ). The water's height is the plain sum. We ignore the
 *     slow weakening of a ripple as it spreads, so both waves arrive with the
 *     same size and a quiet spot is exactly still. The height at a point
 *     bobs with an amplitude found by adding the two waves as phasors:
 *     |Σ a e^{i(k r + φ)}|. Where one path is longer by (m + ½)λ the phasors
 *     point opposite ways and the water is flat for good.
 *
 *  2. Two gaps in a barrier (Young). A plane wave reaches a barrier with two
 *     narrow gaps. Each gap is treated as a new dipper, in step with the other
 *     because both are driven by the same arriving crest. The far wall's
 *     brightness is the time-averaged intensity, the bob amplitude squared.
 *     `brightSpots` finds the loud spots on the wall by scanning that intensity
 *     numerically; nothing about λL/d is put in. The tests check that the
 *     spacing it finds comes out as λL/d when the wall is far away.
 *
 *  3. Thin films. Light reflects from the front and back of a soap film. At
 *     normal incidence the reflection coefficient at a boundary is
 *     r = (n₁ − n₂)/(n₁ + n₂), which is negative, a half-wave flip, when light
 *     meets a denser medium. `filmReflectance` is the full Airy sum of every
 *     bounce, with the flip carried by the sign of r and nothing added by
 *     hand. `filmReflections` splits out the first two reflected waves, which
 *     is what the scene draws.
 *
 *  4. The film's colour in white light. The reflectance is weighted by the
 *     CIE 1931 colour-matching functions (the Wyman–Sloan–Shirley analytic
 *     fit) and turned into sRGB, with the exposure fixed so that the film's
 *     brightest band is near full white.
 *
 * Lengths are in whatever unit the caller uses, consistently (cm in the
 * tanks, metres or nm for light); film thicknesses and wavelengths in nm.
 */

export type P2 = readonly [number, number];

/** A dipper (or gap) that makes circular waves. `phase` in radians. */
export interface Source { x: number; y: number; amp?: number; phase?: number }

const TAU = 2 * Math.PI;

export const dist = (a: P2 | Source, b: P2 | Source) => {
  const ax = 'x' in a ? a.x : a[0], ay = 'x' in a ? a.y : a[1];
  const bx = 'x' in b ? b.x : b[0], by = 'x' in b ? b.y : b[1];
  return Math.hypot(ax - bx, ay - by);
};

/** How much farther the point p is from `b` than from `a`. */
export const pathDifference = (a: P2 | Source, b: P2 | Source, p: P2) => dist(b, p) - dist(a, p);

/* ── 1. two sources ─────────────────────────────────────────────────────── */

/** The water height at p and time t: the plain sum of every ripple. */
export function waveHeight(sources: readonly Source[], p: P2, t: number, lambda: number, freq: number): number {
  const k = TAU / lambda, w = TAU * freq;
  let h = 0;
  for (const s of sources) h += (s.amp ?? 1) * Math.cos(k * dist(s, p) - w * t + (s.phase ?? 0));
  return h;
}

/** One source's contribution at p and t, for drawing the separate traces. */
export const singleHeight = (s: Source, p: P2, t: number, lambda: number, freq: number) =>
  waveHeight([s], p, t, lambda, freq);

/** Sum of the arriving waves as phasors: the point bobs with |sum|. */
export function phasorSum(sources: readonly Source[], p: P2, lambda: number): { re: number; im: number } {
  const k = TAU / lambda;
  let re = 0, im = 0;
  for (const s of sources) {
    const ph = k * dist(s, p) + (s.phase ?? 0);
    re += (s.amp ?? 1) * Math.cos(ph);
    im += (s.amp ?? 1) * Math.sin(ph);
  }
  return { re, im };
}

/** How far the water at p swings up (and down) each cycle. */
export function bobAmplitude(sources: readonly Source[], p: P2, lambda: number): number {
  const z = phasorSum(sources, p, lambda);
  return Math.hypot(z.re, z.im);
}

/** Time-averaged intensity, in units of one source of amplitude 1 alone. */
export const intensity = (sources: readonly Source[], p: P2, lambda: number) => bobAmplitude(sources, p, lambda) ** 2;

/** Path difference as a number of wavelengths, and how far that is from the
 *  nearest half (0 = dead quiet, 0.5 = as loud as it gets). */
export function stepsOutOfStep(delta: number, lambda: number) {
  const waves = delta / lambda;
  const frac = waves - Math.floor(waves);
  return { waves, offHalf: Math.abs(frac - 0.5) };
}

/** Number of quiet lines two in-step sources a distance d apart make:
 *  one for every half-integer m + ½ with |m + ½|λ < d. */
export function quietLineCount(d: number, lambda: number): number {
  let n = 0;
  for (let m = -1000; m <= 1000; m++) if (Math.abs(m + 0.5) * lambda < d) n++;
  return n;
}

/* ── 2. two gaps and a wall ─────────────────────────────────────────────── */

/** The two gaps of a barrier on the line x = 0, at y = ±d/2, as dippers.
 *  `covered` blocks the upper gap. */
export function gapSources(d: number, covered = false): Source[] {
  const out: Source[] = [{ x: 0, y: -d / 2 }];
  if (!covered) out.push({ x: 0, y: d / 2 });
  return out;
}

/** Brightness at height y on a wall at distance L beyond the gaps. */
export const wallIntensity = (y: number, d: number, lambda: number, L: number, covered = false) =>
  intensity(gapSources(d, covered), [L, y], lambda);

/** The loud spots on the wall within |y| ≤ yMax, located numerically: scan the
 *  intensity, keep strict local maxima, refine each by golden-section search. */
export function brightSpots(d: number, lambda: number, L: number, yMax: number, n = 6000): number[] {
  const f = (y: number) => wallIntensity(y, d, lambda, L);
  const h = (2 * yMax) / n;
  const out: number[] = [];
  let a = f(-yMax), b = f(-yMax + h);
  for (let i = 2; i <= n; i++) {
    const c = f(-yMax + i * h);
    if (b > a && b >= c) {
      let lo = -yMax + (i - 2) * h, hi = -yMax + i * h;
      const g = (Math.sqrt(5) - 1) / 2;
      for (let it = 0; it < 80; it++) {
        const m1 = hi - g * (hi - lo), m2 = lo + g * (hi - lo);
        if (f(m1) > f(m2)) hi = m2; else lo = m1;
      }
      out.push((lo + hi) / 2);
    }
    a = b; b = c;
  }
  return out;
}

/** The mean spacing between neighbouring loud spots, measured numerically. */
export function measuredSpacing(d: number, lambda: number, L: number, yMax: number): number {
  const s = brightSpots(d, lambda, L, yMax);
  if (s.length < 2) return NaN;
  return (s[s.length - 1] - s[0]) / (s.length - 1);
}

/** Where the first loud spot above the centre sits (m = 1). */
export function firstSpot(d: number, lambda: number, L: number): number {
  const spots = brightSpots(d, lambda, L, Math.max(4 * lambda * L / d, 2 * d));
  return spots.filter((y) => y > lambda * 1e-3).sort((p, q) => p - q)[0] ?? NaN;
}

/** Young's formula, the small-angle caption: fringe spacing λL/d. */
export const youngSpacing = (lambda: number, L: number, d: number) => (lambda * L) / d;

/** Read Young's formula backwards: a measured spacing gives λ. */
export const wavelengthFromFringes = (spacing: number, d: number, L: number) => (spacing * d) / L;

/** Average brightness over a stretch of wall, by the midpoint rule. */
export function meanWallIntensity(d: number, lambda: number, L: number, y0: number, y1: number, covered = false, n = 20000): number {
  let s = 0;
  for (let i = 0; i < n; i++) s += wallIntensity(y0 + ((i + 0.5) / n) * (y1 - y0), d, lambda, L, covered);
  return s / n;
}

/* ── 3. thin films ──────────────────────────────────────────────────────── */

export const N_SOAP = 1.33;

/** Normal-incidence reflection coefficient going from index n1 into n2.
 *  Negative means the reflected wave is flipped: half a wave of extra phase. */
export const reflectCoeff = (n1: number, n2: number) => (n1 - n2) / (n1 + n2);

/** The phase a round trip through the film adds: 4π n t / λ₀. */
export const roundTripPhase = (t: number, lambda0: number, n: number) => (4 * Math.PI * n * t) / lambda0;

/** Fraction of the light reflected by a film of thickness t (nm) and index n
 *  between media nFront and nBack: the full sum over all bounces (Airy). */
export function filmReflectance(t: number, lambda0: number, n = N_SOAP, nFront = 1, nBack = 1): number {
  const r1 = reflectCoeff(nFront, n), r2 = reflectCoeff(n, nBack);
  const d = roundTripPhase(t, lambda0, n);
  // r = (r1 + r2 e^{iδ}) / (1 + r1 r2 e^{iδ})
  const nr = r1 + r2 * Math.cos(d), ni = r2 * Math.sin(d);
  const dr = 1 + r1 * r2 * Math.cos(d), di = r1 * r2 * Math.sin(d);
  return (nr * nr + ni * ni) / (dr * dr + di * di);
}

/** The first two reflected waves, as amplitude and phase (radians), which the
 *  scene draws as traces. The front one flips if the film is denser; the back
 *  one is delayed by the round trip. */
export function filmReflections(t: number, lambda0: number, n = N_SOAP, nFront = 1, nBack = 1) {
  const r1 = reflectCoeff(nFront, n), r2 = reflectCoeff(n, nBack);
  const front = { amp: Math.abs(r1), phase: r1 < 0 ? Math.PI : 0 };
  const back = {
    amp: (1 - r1 * r1) * Math.abs(r2),
    phase: roundTripPhase(t, lambda0, n) + (r2 < 0 ? Math.PI : 0),
  };
  return { front, back };
}

/** Two-beam reflectance, optionally with the front flip removed by hand, to
 *  show what the world would look like if the flip were optional. */
export function twoBeamReflectance(t: number, lambda0: number, n = N_SOAP, flip = true): number {
  const { front, back } = filmReflections(t, lambda0, n);
  const pf = flip ? front.phase : 0;
  const re = front.amp * Math.cos(pf) + back.amp * Math.cos(back.phase);
  const im = front.amp * Math.sin(pf) + back.amp * Math.sin(back.phase);
  return re * re + im * im;
}

/* ── 4. colour in white light ───────────────────────────────────────────── */

const lobe = (l: number, mu: number, s1: number, s2: number) => {
  const s = l < mu ? s1 : s2;
  return Math.exp(-0.5 * ((l - mu) / s) ** 2);
};

/** CIE 1931 2° colour-matching functions, Wyman–Sloan–Shirley (2013) fit. */
export function cie(l: number): [number, number, number] {
  const x = 1.056 * lobe(l, 599.8, 37.9, 31.0) + 0.362 * lobe(l, 442.0, 16.0, 26.7) - 0.065 * lobe(l, 501.1, 20.4, 26.2);
  const y = 0.821 * lobe(l, 568.8, 46.9, 40.5) + 0.286 * lobe(l, 530.9, 16.3, 31.1);
  const z = 1.217 * lobe(l, 437.0, 11.8, 36.0) + 0.681 * lobe(l, 459.0, 26.0, 13.8);
  return [x, y, z];
}

const SPECTRUM: number[] = [];
for (let l = 380; l <= 780; l += 5) SPECTRUM.push(l);
const WHITE = SPECTRUM.reduce((a, l) => { const c = cie(l); return [a[0] + c[0], a[1] + c[1], a[2] + c[2]]; }, [0, 0, 0]);

/** XYZ of white light reflected by the film, as fractions of the incident
 *  white's XYZ (so a perfect mirror gives [1, 1, 1]). */
export function filmXYZ(t: number, n = N_SOAP): [number, number, number] {
  let X = 0, Y = 0, Z = 0;
  for (const l of SPECTRUM) {
    const R = filmReflectance(t, l, n);
    const c = cie(l);
    X += R * c[0]; Y += R * c[1]; Z += R * c[2];
  }
  return [X / WHITE[0], Y / WHITE[1], Z / WHITE[2]];
}

/** Fraction of white light the film reflects, weighted as the eye weights it. */
export const whiteReflectance = (t: number, n = N_SOAP) => filmXYZ(t, n)[1];

let peakCache: { n: number; peak: number; at: number } | null = null;
/** The brightest a soap film of index n gets in reflection, over 0–1500 nm. */
export function peakWhiteReflectance(n = N_SOAP): { peak: number; at: number } {
  if (peakCache && peakCache.n === n) return peakCache;
  let peak = 0, at = 0;
  for (let t = 0; t <= 1500; t += 2) {
    const r = whiteReflectance(t, n);
    if (r > peak) { peak = r; at = t; }
  }
  peakCache = { n, peak, at };
  return peakCache;
}

/** How bright the film looks, as a fraction of its brightest band. */
export const relativeBrightness = (t: number, n = N_SOAP) => whiteReflectance(t, n) / peakWhiteReflectance(n).peak;

const gamma = (u: number) => {
  const c = Math.min(1, Math.max(0, u));
  return c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;
};

/** The film's colour in reflected white light, as 0–255 sRGB. The exposure is
 *  set so the brightest band is close to full white; the hue is the physics. */
export function filmColour(t: number, n = N_SOAP): [number, number, number] {
  const [x, y, z] = filmXYZ(t, n);
  const k = 0.95 / peakWhiteReflectance(n).peak;
  // Scale to the D65 white so that a flat reflector looks neutral in sRGB.
  const X = x * k * 0.9505, Y = y * k, Z = z * k * 1.089;
  const r = 3.2406 * X - 1.5372 * Y - 0.4986 * Z;
  const g = -0.9689 * X + 1.8758 * Y + 0.0415 * Z;
  const b = 0.0557 * X - 0.204 * Y + 1.057 * Z;
  return [gamma(r) * 255, gamma(g) * 255, gamma(b) * 255];
}

/* ── the chapter's scenes, set up here so the tests can pin them ─────────── */

/** Lesson 1's ripple tank: cm and Hz. */
export const TANK = { lambda: 2, freq: 1 } as const;

/** Find the still cork: two dippers 5 cm apart on the left wall. */
export const CORK_DIPPERS: Source[] = [{ x: 0, y: 2.5 }, { x: 0, y: -2.5 }];
export const CORK_START: P2 = [14, 0];

/** Spread the dippers: A is fixed, B slides up the wall, the leaf is fixed. */
export const SPREAD = { a: { x: 0, y: -1.5 } as Source, bStart: 1.5, bRange: [0, 8.5] as const, leaf: [12, 0] as P2 };

/** Lesson 2's slit tank: cm. */
export const SLITS = { lambda: 1, d: 4, mark: 6, lStart: 14, lRange: [8, 34] as const };

/** The laser the learner measures: SI units. */
export const LASER = { lambda: 632.8e-9, d: 0.25e-3, L: 3.0 } as const;

/** The film scene: soap, and a wedge 1400 nm thicker at the bottom than the top. */
export const FILM = { n: N_SOAP, wedge: 1400, tStart: 600, tMin: 4, dark: 0.03 } as const;
