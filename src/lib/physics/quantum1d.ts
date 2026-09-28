/**
 * Chapter 40: one particle, one dimension, the Schrödinger equation.
 *
 *     −(ħ²/2m) ψ″ + U(x) ψ = E ψ      so      ψ″ = (U − E)/(ħ²/2m) · ψ
 *
 * Read the second form as a rule about bending. Where E > U the wave bends
 * back toward the axis and swings; where E < U it bends away and grows or
 * decays. The point where E = U, chapter 7's turning point, is where one
 * behaviour hands over to the other.
 *
 * Four pieces, each written to be read:
 *
 *  1. Shooting (`shoot`). Start at a hard wall with ψ = 0, march the equation
 *     across with Numerov's method, and see what arrives at the far side. For
 *     a bound particle the far wall demands ψ = 0 too, and only special
 *     energies deliver that (`eigenEnergies` finds them by bisection).
 *  2. The Born rule. ψ² is a probability density: `normalise`,
 *     `probabilityBetween`, and `sampleFromDensity` for firing detectors.
 *  3. A barrier. `barrierTransmission` is the exact textbook formula for a
 *     flat-topped barrier. `scatterNumeric` gets the same number a different
 *     way, for any U: put a pure outgoing wave on the far side, march the
 *     equation backwards through the barrier, and split what arrives into an
 *     incoming and a reflected wave. The tests hold the two to each other.
 *  4. A packet (`createPacket` / `stepPacket`). The time-dependent equation
 *     iħ ∂ψ/∂t = Hψ, stepped by Crank–Nicolson, which keeps ∫|ψ|² fixed. A
 *     packet thrown at a barrier splits into a reflection and a ghost.
 *
 * Units throughout: x in nm, energy in eV, time in fs. For an electron
 * ħ²/2m = 0.0381 eV·nm², so a 1 nm box has its lowest level at 0.376 eV.
 */

/* ── constants (CODATA 2018) ─────────────────────────────────────────────── */

const H_SI = 6.62607015e-34;          // J·s
const HBAR_SI = H_SI / (2 * Math.PI);
const EV = 1.602176634e-19;           // J
export const M_ELECTRON = 9.1093837015e-31; // kg
export const M_PROTON = 1.67262192369e-27;  // kg

/** ħ²/2m in eV·nm² for a particle of mass m (kg). */
export const hb2mFor = (mass: number) => (HBAR_SI ** 2 / (2 * mass)) / EV * 1e18;
/** ħ²/2mₑ ≈ 0.0381 eV·nm². */
export const HB2M_E = hb2mFor(M_ELECTRON);
/** ħ in eV·fs ≈ 0.658. */
export const HBAR_EV_FS = HBAR_SI / EV * 1e15;

export type Potential = (x: number) => number;

/* ── 1. shooting ─────────────────────────────────────────────────────────── */

export interface Shot {
  xs: number[];
  psi: number[];
}

/**
 * March ψ″ = g(x) ψ, g = (U − E)/(ħ²/2m), from x = a to x = b, starting from
 * a hard wall: ψ(a) = 0 with a unit slope. Numerov's recurrence
 *
 *   (1 − h²g₊/12) ψ₊ = 2 (1 + 5h²g/12) ψ − (1 − h²g₋/12) ψ₋
 *
 * is fourth-order accurate. Because ψ(a) = 0, the starting slope only sets
 * the overall scale: every choice gives the same shape.
 */
export function shoot(U: Potential, E: number, a: number, b: number, steps = 2000, hb2m = HB2M_E): Shot {
  const h = (b - a) / steps;
  const xs = Array.from({ length: steps + 1 }, (_, i) => a + i * h);
  const w = xs.map((x) => 1 - (h * h * (U(x) - E)) / hb2m / 12);
  const psi = new Array<number>(steps + 1).fill(0);
  psi[0] = 0;
  psi[1] = h;
  for (let i = 1; i < steps; i++) {
    psi[i + 1] = ((12 - 10 * w[i]) * psi[i] - w[i - 1] * psi[i - 1]) / w[i + 1];
  }
  return { xs, psi };
}

/** What a shot arrives at the far wall with, as a fraction of its biggest swing. */
export function farWallMiss(shot: Shot): number {
  const peak = Math.max(...shot.psi.map(Math.abs));
  return peak > 0 ? shot.psi[shot.psi.length - 1] / peak : 0;
}

/**
 * The energies at which a shot from the wall at a lands on ψ = 0 at the wall
 * at b: scan upward from Emin for sign changes of ψ(b), then bisect each.
 */
export function eigenEnergies(U: Potential, a: number, b: number, count: number, opts: {
  Emin?: number; Emax: number; scan?: number; steps?: number; hb2m?: number;
}): number[] {
  const { Emin = 0, Emax, scan = 4000, steps = 2000, hb2m = HB2M_E } = opts;
  const end = (E: number) => { const s = shoot(U, E, a, b, steps, hb2m); return s.psi[steps]; };
  const out: number[] = [];
  const dE = (Emax - Emin) / scan;
  let E0 = Emin, f0 = end(E0);
  for (let i = 1; i <= scan && out.length < count; i++) {
    const E1 = Emin + i * dE, f1 = end(E1);
    if (f0 === 0) out.push(E0);
    else if (f0 * f1 < 0) {
      let lo = E0, hi = E1, flo = f0;
      for (let k = 0; k < 200 && hi - lo > 1e-14 * Math.max(1, Math.abs(hi)); k++) {
        const mid = (lo + hi) / 2, fm = end(mid);
        if (fm * flo <= 0) hi = mid; else { lo = mid; flo = fm; }
      }
      out.push((lo + hi) / 2);
    }
    E0 = E1; f0 = f1;
  }
  return out;
}

/** The infinite well of width L: nothing inside, unclimbable walls at 0 and L. */
export const INFINITE_WELL: Potential = () => 0;

/** The textbook box energies, E_n = n²h²/8mL², straight from SI (L in nm, result in eV). */
export function boxEnergy(n: number, L: number, mass = M_ELECTRON): number {
  return (n * n * H_SI * H_SI) / (8 * mass * (L * 1e-9) ** 2) / EV;
}

/** The shot through an infinite well of width L at energy E. */
export function shootBox(E: number, L: number, steps = 400, hb2m = HB2M_E): Shot {
  return shoot(INFINITE_WELL, E, 0, L, steps, hb2m);
}

/** Places where ψ crosses zero strictly inside the interval (the ends are not counted). */
export function countNodes(psi: number[]): number {
  const peak = Math.max(...psi.map(Math.abs));
  const tiny = 1e-7 * peak;
  let nodes = 0, last = 0;
  for (let i = 1; i < psi.length - 1; i++) {
    const v = psi[i];
    if (Math.abs(v) <= tiny) continue;
    const sgn = Math.sign(v);
    if (last !== 0 && sgn !== last) nodes++;
    last = sgn;
  }
  return nodes;
}

/**
 * Just past a tall wall a leftover ψ grows as e^{κd}. For an unclimbable wall
 * κ → ∞ and the slope term ψ′/κ vanishes, so the tail is ψ(wall)·e^{κd}: any
 * miss at all runs away. `kappa` sets how steeply the picture shows it.
 */
export function tallWallTail(psiAtWall: number, depth: number, kappa: number): number {
  return psiAtWall * Math.exp(kappa * depth);
}

/* ── 2. the Born rule ────────────────────────────────────────────────────── */

/** ∫ f dx on a uniform grid: Simpson when the step count is even, trapezoid otherwise. */
export function integrate(xs: number[], f: number[]): number {
  const n = xs.length - 1;
  if (n < 1) return 0;
  const h = (xs[n] - xs[0]) / n;
  if (n % 2 === 0) {
    let s = f[0] + f[n];
    for (let i = 1; i < n; i++) s += (i % 2 ? 4 : 2) * f[i];
    return (s * h) / 3;
  }
  let s = (f[0] + f[n]) / 2;
  for (let i = 1; i < n; i++) s += f[i];
  return s * h;
}

/** Scale ψ so that ∫ψ² dx = 1. */
export function normalise(xs: number[], psi: number[]): number[] {
  const norm = Math.sqrt(integrate(xs, psi.map((v) => v * v)));
  return norm > 0 ? psi.map((v) => v / norm) : psi.slice();
}

/** ∫ψ² dx between lo and hi, trapezoid with the partial end cells cut linearly. */
export function probabilityBetween(xs: number[], psi: number[], lo: number, hi: number): number {
  let p = 0;
  for (let i = 0; i < xs.length - 1; i++) {
    const x0 = Math.max(lo, xs[i]), x1 = Math.min(hi, xs[i + 1]);
    if (x1 <= x0) continue;
    const at = (x: number) => {
      const t = (x - xs[i]) / (xs[i + 1] - xs[i]);
      const v = psi[i] + t * (psi[i + 1] - psi[i]);
      return v * v;
    };
    // Simpson on the sub-interval: ψ is linear there, so ψ² is quadratic and this is exact.
    p += ((x1 - x0) / 6) * (at(x0) + 4 * at((x0 + x1) / 2) + at(x1));
  }
  return p;
}

/**
 * A detector: returns a function taking u ∈ [0, 1) to the x where the
 * cumulative probability reaches u. Feed it uniform random numbers and the
 * clicks land with density ψ².
 */
export function densitySampler(xs: number[], psi: number[]): (u: number) => number {
  const cum = [0];
  for (let i = 0; i < xs.length - 1; i++) cum.push(cum[i] + probabilityBetween(xs, psi, xs[i], xs[i + 1]));
  const total = cum[cum.length - 1];
  return (u: number) => {
    const target = u * total;
    let lo = 0, hi = cum.length - 1;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (cum[mid] < target) lo = mid; else hi = mid; }
    const span = cum[hi] - cum[lo];
    return xs[lo] + (span > 0 ? (target - cum[lo]) / span : 0) * (xs[hi] - xs[lo]);
  };
}

/** A small seeded generator (mulberry32), so a run of clicks can be replayed. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The normalised box state ψ_n on a grid of `steps` cells, by shooting at E_n. */
export function boxState(n: number, L: number, steps = 400, hb2m = HB2M_E): Shot {
  const [E] = eigenEnergies(INFINITE_WELL, 0, L, n, { Emax: (n + 0.5) ** 2 * Math.PI ** 2 * hb2m / (L * L), steps, hb2m }).slice(n - 1);
  const s = shootBox(E, L, steps, hb2m);
  return { xs: s.xs, psi: normalise(s.xs, s.psi) };
}

/* ── 3. a barrier ────────────────────────────────────────────────────────── */

/** Decay rate inside a barrier U above the energy E: κ = √(2m(U − E))/ħ, per nm. */
export function decayRate(E: number, U: number, hb2m = HB2M_E): number {
  return Math.sqrt(Math.max(0, U - E) / hb2m);
}

/**
 * The exact fraction of a wave of energy E that gets through a flat barrier of
 * height V0 and thickness a (flat ground on both sides):
 *
 *   E < V0:  T = 1 / (1 + V0² sinh²(κa) / 4E(V0 − E))
 *   E > V0:  T = 1 / (1 + V0² sin²(qa)  / 4E(E − V0))
 *   E = V0:  T = 1 / (1 + V0 a² / 4(ħ²/2m))
 */
export function barrierTransmission(E: number, V0: number, a: number, hb2m = HB2M_E): number {
  if (a <= 0 || V0 === 0) return 1;
  if (E < V0) {
    const s = Math.sinh(decayRate(E, V0, hb2m) * a);
    return 1 / (1 + (V0 * V0 * s * s) / (4 * E * (V0 - E)));
  }
  if (E > V0) {
    const s = Math.sin(Math.sqrt((E - V0) / hb2m) * a);
    return 1 / (1 + (V0 * V0 * s * s) / (4 * E * (E - V0)));
  }
  return 1 / (1 + (V0 * a * a) / (4 * hb2m));
}

/** The thickness at which a flat barrier lets through the fraction T (bisection on the exact formula). */
export function thicknessFor(T: number, E: number, V0: number, hb2m = HB2M_E, aMax = 50): number {
  let lo = 0, hi = aMax;
  for (let k = 0; k < 200; k++) {
    const mid = (lo + hi) / 2;
    if (barrierTransmission(E, V0, mid, hb2m) > T) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

export interface Cx { re: number; im: number }
const cx = (re: number, im = 0): Cx => ({ re, im });
const cadd = (a: Cx, b: Cx): Cx => cx(a.re + b.re, a.im + b.im);
const cmul = (a: Cx, b: Cx): Cx => cx(a.re * b.re - a.im * b.im, a.re * b.im + a.im * b.re);
const cscale = (a: Cx, s: number): Cx => cx(a.re * s, a.im * s);
const cdiv = (a: Cx, b: Cx): Cx => { const d = b.re * b.re + b.im * b.im; return cx((a.re * b.re + a.im * b.im) / d, (a.im * b.re - a.re * b.im) / d); };
const cexpi = (t: number): Cx => cx(Math.cos(t), Math.sin(t));
export const cabs2 = (a: Cx) => a.re * a.re + a.im * a.im;

export interface Scatter {
  E: number;
  /** Wavenumber on the flat ground either side, per nm. */
  k: number;
  /** Fractions transmitted and reflected. T + R = 1. */
  T: number;
  R: number;
  /** Where the barrier region starts and ends. U = 0 outside it. */
  a: number;
  b: number;
  /** ψ inside [a, b], scaled so the incoming wave is e^{ikx}. */
  xs: number[];
  psi: Cx[];
  /** Reflected and transmitted amplitudes for that scaling. */
  r: Cx;
  t: Cx;
}

/**
 * The same T, numerically, for any barrier U on [a, b] with flat ground (U = 0)
 * outside. Beyond the barrier there is only a wave heading away, e^{ikx}. March
 * ψ″ = (U − E)ψ/(ħ²/2m) backwards from b to a with RK4, then split what arrives
 * at a into A e^{ikx} + B e^{−ikx}: the incoming and the reflected wave. Then
 * T = 1/|A|² and R = |B/A|².
 */
export function scatterNumeric(U: Potential, E: number, a: number, b: number, steps = 2000, hb2m = HB2M_E): Scatter {
  const k = Math.sqrt(E / hb2m);
  const h = (b - a) / steps;
  const g = (x: number) => (U(x) - E) / hb2m;
  const xs = Array.from({ length: steps + 1 }, (_, i) => a + i * h);
  const psi: Cx[] = new Array(steps + 1);
  let p = cexpi(k * b);                    // ψ(b)
  let q = cmul(cx(0, k), cexpi(k * b));    // ψ′(b)
  psi[steps] = p;
  // RK4 on (ψ, ψ′)′ = (ψ′, gψ), stepping by −h.
  for (let i = steps; i > 0; i--) {
    const x = xs[i], d = -h;
    const k1p = q, k1q = cscale(p, g(x));
    const p2 = cadd(p, cscale(k1p, d / 2)), q2 = cadd(q, cscale(k1q, d / 2));
    const k2p = q2, k2q = cscale(p2, g(x + d / 2));
    const p3 = cadd(p, cscale(k2p, d / 2)), q3 = cadd(q, cscale(k2q, d / 2));
    const k3p = q3, k3q = cscale(p3, g(x + d / 2));
    const p4 = cadd(p, cscale(k3p, d)), q4 = cadd(q, cscale(k3q, d));
    const k4p = q4, k4q = cscale(p4, g(x + d));
    p = cadd(p, cscale(cadd(cadd(k1p, cscale(k2p, 2)), cadd(cscale(k3p, 2), k4p)), d / 6));
    q = cadd(q, cscale(cadd(cadd(k1q, cscale(k2q, 2)), cadd(cscale(k3q, 2), k4q)), d / 6));
    psi[i - 1] = p;
  }
  // At x = a:  ψ = A e^{ika} + B e^{−ika},  ψ′ = ik (A e^{ika} − B e^{−ika}).
  const qOverIk = cdiv(q, cx(0, k));
  const A = cmul(cscale(cadd(p, qOverIk), 0.5), cexpi(-k * a));
  const B = cmul(cscale(cadd(p, cscale(qOverIk, -1)), 0.5), cexpi(k * a));
  const inv = cdiv(cx(1), A);
  return {
    E, k, a, b, xs,
    psi: psi.map((v) => cmul(v, inv)),
    T: cabs2(inv),
    R: cabs2(cdiv(B, A)),
    r: cdiv(B, A),
    t: inv,
  };
}

/** ψ anywhere: incoming plus reflected before the barrier, the marched ψ inside, the transmitted wave after. */
export function scatterWaveAt(s: Scatter, x: number): Cx {
  if (x <= s.a) return cadd(cexpi(s.k * x), cmul(s.r, cexpi(-s.k * x)));
  if (x >= s.b) return cmul(s.t, cexpi(s.k * x));
  const f = ((x - s.a) / (s.b - s.a)) * (s.xs.length - 1);
  const i = Math.min(s.xs.length - 2, Math.floor(f)), t = f - i;
  return cadd(cscale(s.psi[i], 1 - t), cscale(s.psi[i + 1], t));
}

/** A flat-topped barrier of height V0 from x = 0 to x = a. */
export const flatBarrier = (V0: number, a: number): Potential => (x) => (x >= 0 && x <= a ? V0 : 0);

/** A smooth hill of height V0 and half-width w, centred on 0: V0 cos²(πx/2w), flat beyond ±w. */
export const smoothHill = (V0: number, w: number): Potential => (x) =>
  Math.abs(x) < w ? V0 * Math.cos((Math.PI * x) / (2 * w)) ** 2 : 0;

/** Where a smooth hill first rises to the energy E on its left flank: the classical turning point. */
export function hillTurningPoint(E: number, V0: number, w: number): number | null {
  if (E >= V0) return null;
  return -((2 * w) / Math.PI) * Math.acos(Math.sqrt(E / V0));
}

/* ── 4. a packet ─────────────────────────────────────────────────────────── */

export interface Packet {
  xs: Float64Array;
  re: Float64Array;
  im: Float64Array;
  /** Cell-averaged potential on the grid, eV. */
  U: Float64Array;
  dx: number;
  t: number;
  hb2m: number;
  /** Crank–Nicolson factors for the current dt, filled on first step. */
  cn?: { dt: number; cRe: Float64Array; cIm: Float64Array; mRe: Float64Array; mIm: Float64Array };
}

/**
 * A Gaussian packet centred on x0 with mean wavenumber k0 and position spread
 * σ (so |ψ|² has standard deviation σ), on a grid of n points over [from, to]
 * with ψ = 0 at both ends. U is averaged over each grid cell, so a barrier edge
 * that falls on a grid point counts half, and the barrier keeps its width.
 */
export function createPacket(o: {
  from: number; to: number; n: number; x0: number; k0: number; sigma: number; U: Potential; hb2m?: number;
}): Packet {
  const { from, to, n, x0, k0, sigma, U, hb2m = HB2M_E } = o;
  const dx = (to - from) / (n - 1);
  const xs = new Float64Array(n), re = new Float64Array(n), im = new Float64Array(n), Ug = new Float64Array(n);
  for (let j = 0; j < n; j++) {
    const x = from + j * dx;
    xs[j] = x;
    let u = 0;
    for (let s = 0; s < 16; s++) u += U(x - dx / 2 + ((s + 0.5) * dx) / 16);
    Ug[j] = u / 16;
    if (j === 0 || j === n - 1) continue;
    const env = Math.exp(-((x - x0) ** 2) / (4 * sigma * sigma));
    re[j] = env * Math.cos(k0 * x);
    im[j] = env * Math.sin(k0 * x);
  }
  const p: Packet = { xs, re, im, U: Ug, dx, t: 0, hb2m };
  const norm = Math.sqrt(packetProbability(p, -Infinity, Infinity));
  for (let j = 0; j < n; j++) { re[j] /= norm; im[j] /= norm; }
  return p;
}

/**
 * Advance by `count` steps of dt (fs) with Crank–Nicolson:
 *   (1 + iΔt H/2ħ) ψⁿ⁺¹ = (1 − iΔt H/2ħ) ψⁿ,
 * H = −(ħ²/2m) d²/dx² + U on the grid. The step is unitary, so ∫|ψ|² stays 1.
 * The tridiagonal system is solved by the Thomas algorithm in complex numbers.
 */
export function stepPacket(p: Packet, dt: number, count = 1): void {
  const n = p.xs.length, m = n - 2; // interior unknowns 1..n-2
  const al = dt / (2 * HBAR_EV_FS);
  const off = -p.hb2m / (p.dx * p.dx);     // H off-diagonal
  const oIm = al * off;                     // iα·off, purely imaginary
  if (!p.cn || p.cn.dt !== dt) {
    // Factor A once: diag 1 + iα d_j, off-diagonals iα·off.
    const cRe = new Float64Array(m), cIm = new Float64Array(m), mRe = new Float64Array(m), mIm = new Float64Array(m);
    let pcRe = 0, pcIm = 0;
    for (let j = 0; j < m; j++) {
      const d = -2 * off + p.U[j + 1];
      // denominator = b_j − a_j c'_{j−1}, with a_j = c_j = i·oIm
      let dRe = 1, dIm = al * d;
      if (j > 0) { dRe -= -oIm * pcIm; dIm -= oIm * pcRe; }
      // store 1/denominator
      const den = dRe * dRe + dIm * dIm;
      mRe[j] = dRe / den; mIm[j] = -dIm / den;
      // c'_j = c_j / denominator = i·oIm · (1/den)
      cRe[j] = -oIm * mIm[j]; cIm[j] = oIm * mRe[j];
      pcRe = cRe[j]; pcIm = cIm[j];
    }
    p.cn = { dt, cRe, cIm, mRe, mIm };
  }
  const { cRe, cIm, mRe, mIm } = p.cn;
  const re = p.re, im = p.im;
  const dRe = new Float64Array(m), dIm = new Float64Array(m);
  for (let s = 0; s < count; s++) {
    // right-hand side r = (1 − iαH) ψ, and the forward sweep
    let pdRe = 0, pdIm = 0;
    for (let j = 0; j < m; j++) {
      const J = j + 1;
      const d = -2 * off + p.U[J];
      const nbRe = re[J - 1] + re[J + 1], nbIm = im[J - 1] + im[J + 1];
      // (1 − iαd)ψ − iα·off·(neighbours)
      let rRe = re[J] + al * d * im[J] + oIm * nbIm;
      let rIm = im[J] - al * d * re[J] - oIm * nbRe;
      if (j > 0) { rRe -= -oIm * pdIm; rIm -= oIm * pdRe; }   // − a_j d'_{j−1}, a_j = i·oIm
      dRe[j] = rRe * mRe[j] - rIm * mIm[j];
      dIm[j] = rRe * mIm[j] + rIm * mRe[j];
      pdRe = dRe[j]; pdIm = dIm[j];
    }
    // back substitution
    let nxRe = 0, nxIm = 0;
    for (let j = m - 1; j >= 0; j--) {
      const xRe = dRe[j] - (cRe[j] * nxRe - cIm[j] * nxIm);
      const xIm = dIm[j] - (cRe[j] * nxIm + cIm[j] * nxRe);
      re[j + 1] = xRe; im[j + 1] = xIm;
      nxRe = xRe; nxIm = xIm;
    }
    p.t += dt;
  }
}

/** ∫|ψ|² dx over [lo, hi] (trapezoid on the grid). */
export function packetProbability(p: Packet, lo: number, hi: number): number {
  let s = 0;
  for (let j = 0; j < p.xs.length; j++) {
    const x = p.xs[j];
    if (x < lo || x > hi) continue;
    s += p.re[j] * p.re[j] + p.im[j] * p.im[j];
  }
  return s * p.dx;
}

/**
 * What a Gaussian packet should split into, from the exact T: average T(E(k))
 * over the packet's spread of wavenumbers, |φ(k)|² ∝ exp(−2σ²(k − k0)²).
 */
export function packetAverageTransmission(k0: number, sigma: number, T: (E: number) => number, hb2m = HB2M_E): number {
  const sk = 1 / (2 * sigma);
  let num = 0, den = 0;
  for (let i = -800; i <= 800; i++) {
    const k = k0 + (i / 100) * sk;
    if (k <= 0) continue;
    const w = Math.exp(-2 * sigma * sigma * (k - k0) ** 2);
    num += w * T(hb2m * k * k);
    den += w;
  }
  return num / den;
}
