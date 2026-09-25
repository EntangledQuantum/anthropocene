/**
 * Sound — University Physics, Chapter 16.
 *
 * Plain functions, written to be read. Every number the chapter's scenes print
 * comes from here, and `__tests__/sound.test.ts` pins each claim the lessons
 * make: pressure is a quarter-wave out of step with displacement, a closed
 * pipe fits only odd quarter-waves, a moving source's pitch is shifted but
 * steady while it approaches, a moving listener needs more speed than a moving
 * source for the same shift, and two close tones throb at their difference.
 *
 * Units are SI throughout: metres, seconds, hertz, pascals.
 */

/* ── the medium ────────────────────────────────────────────────────────── */

export const P_ATM = 101_325;          // Pa
export const GAMMA_AIR = 1.4;          // ratio of heat capacities for air
export const RHO_AIR = 1.204;          // kg/m³ at 20 °C
/** Adiabatic bulk modulus of air: how hard it resists a quick squeeze. */
export const B_AIR = GAMMA_AIR * P_ATM;
export const R_GAS = 8.314;            // J/(mol·K)
/** The speed of sound in air at 20 °C that the lessons quote. */
export const V_AIR = 343;

/** v = √(B/ρ): stiffness against inertia. */
export function speedOfSound(bulkModulus: number, density: number): number {
  return Math.sqrt(bulkModulus / density);
}

/** v = √(γRT/M) for an ideal gas at temperature T (K), molar mass M (kg/mol). */
export function idealGasSoundSpeed(T: number, molarMass: number, gamma: number): number {
  return Math.sqrt((gamma * R_GAS * T) / molarMass);
}

/* ── a travelling sound wave ───────────────────────────────────────────── */

export interface SoundWave {
  /** Frequency, Hz. */
  f: number;
  /** Wave speed, m/s. */
  v: number;
  /** Displacement amplitude of the air, m. */
  s0: number;
  /** Bulk modulus of the medium, Pa. Defaults to air. */
  B?: number;
}

export const wavenumber = (f: number, v: number) => (2 * Math.PI * f) / v;
export const wavelength = (f: number, v: number) => v / f;

/** How far the air that lives at x has moved from home at time t (rightward +). */
export function displacement(w: SoundWave, x: number, t: number): number {
  const k = wavenumber(w.f, w.v);
  return w.s0 * Math.cos(k * x - 2 * Math.PI * w.f * t);
}

/**
 * Gauge pressure at x: p = −B ∂s/∂x. Air is squeezed where the parcels behind
 * have moved forward more than the parcels ahead, which is where the
 * displacement is passing through zero, not where it is largest.
 */
export function pressure(w: SoundWave, x: number, t: number): number {
  const B = w.B ?? B_AIR;
  const k = wavenumber(w.f, w.v);
  return B * w.s0 * k * Math.sin(k * x - 2 * Math.PI * w.f * t);
}

/** Pressure amplitude B·k·s₀, which equals ρvω·s₀ when B = ρv². */
export function pressureAmplitude(w: SoundWave): number {
  return (w.B ?? B_AIR) * wavenumber(w.f, w.v) * w.s0;
}

/** The note in the ShuffleTheAir scene: 171.5 Hz, so one wavelength is exactly 2 m, loud (≈ 9 Pa). */
export const CROWD_WAVE: SoundWave = { f: 171.5, v: V_AIR, s0: 20e-6 };

/* ── standing waves in pipes ───────────────────────────────────────────── */

/** A pipe closed at one end fits odd quarter-waves: f = n·v/4L, n = 1, 3, 5, … */
export function closedPipeHarmonics(L: number, v: number, count: number): number[] {
  return Array.from({ length: count }, (_, i) => ((2 * i + 1) * v) / (4 * L));
}

/** A pipe open at both ends fits whole half-waves: f = n·v/2L, n = 1, 2, 3, … */
export function openPipeHarmonics(L: number, v: number, count: number): number[] {
  return Array.from({ length: count }, (_, i) => ((i + 1) * v) / (2 * L));
}

/** Air-column lengths, up to Lmax, that resonate with frequency f in a closed tube. */
export function closedTubeResonantLengths(f: number, v: number, Lmax: number): number[] {
  const out: number[] = [];
  for (let n = 1; ; n += 2) {
    const L = (n * v) / (4 * f);
    if (L > Lmax) return out;
    out.push(L);
  }
}

/**
 * A tube closed at the bottom (the water) and open at the mouth, where a fork
 * holds the pressure oscillating with a small amplitude p₀. With a lossy
 * wavenumber k̃ = k − iα the pressure is p(y) = p₀ cos(k̃y)/cos(k̃L), y measured
 * up from the water: a pressure maximum at the closed end, as a wall demands.
 * The air's displacement follows ∂p/∂y ∝ sin(k̃y)/cos(k̃L).
 *
 * Returns |sin(k̃y)| / |cos(k̃L)|: the displacement amplitude of the layer at
 * height y, in units where a column one-eighth of a wavelength long moves
 * its mouth layer by 1.
 */
export function closedTubeDisplacement(y: number, L: number, f: number, v: number, alpha: number): number {
  const k = wavenumber(f, v);
  // |sin(a − ib)|² = sin²a + sinh²b and |cos(a − ib)|² = cos²a + sinh²b
  const num = Math.sqrt(Math.sin(k * y) ** 2 + Math.sinh(alpha * y) ** 2);
  const den = Math.sqrt(Math.cos(k * L) ** 2 + Math.sinh(alpha * L) ** 2);
  return num / den;
}

/** The PourToBoom tube: a 440 Hz fork over a 70 cm glass tube, loss α = 0.5 per metre. */
export const BOOM_TUBE = { f: 440, v: V_AIR, alpha: 0.5, height: 0.7, tolerance: 0.015 } as const;

/** How hard the column's mouth moves: the displacement amplitude at y = L. */
export function closedTubeResponse(L: number, f: number, v: number, alpha: number): number {
  return closedTubeDisplacement(L, L, f, v, alpha);
}

/** The response in decibels, 20·log₁₀, floored so silence stays on the scale. */
export function responseDb(response: number, floor = -30): number {
  return Math.max(floor, 20 * Math.log10(Math.max(response, 1e-9)));
}

/* ── Doppler ───────────────────────────────────────────────────────────── */

/**
 * Along the line joining them: f' = f (v + v_L)/(v − v_S), with each speed
 * positive when that party moves toward the other. The medium is the stage:
 * a moving source changes the wavelength in the air, a moving listener only
 * changes how fast it meets unchanged crests.
 */
export function dopplerShift(f: number, v: number, vSource: number, vListener: number): number {
  return (f * (v + vListener)) / (v - vSource);
}

/** Source speed toward a still listener that shifts f up to fTarget. */
export function sourceSpeedFor(f: number, fTarget: number, v: number): number {
  return v * (1 - f / fTarget);
}

/** Listener speed toward a still source that shifts f up to fTarget. */
export function listenerSpeedFor(f: number, fTarget: number, v: number): number {
  return v * (fTarget / f - 1);
}

/** Crest spacing in the air: ahead of a source moving at u it is (v − u)/f. */
export function wavelengthAhead(f: number, v: number, u: number): number {
  return (v - u) / f;
}
export function wavelengthBehind(f: number, v: number, u: number): number {
  return (v + u) / f;
}

/**
 * A source moving steadily along y = 0, at x(t) = x0 + u·t for all t, heard
 * by a still listener at (0, d).
 */
export interface Pass { f: number; v: number; u: number; x0: number; d: number }

/**
 * The emission that reaches the listener at time t left the source a time τ
 * earlier, with v·τ = distance from where the source was then. That is a
 * quadratic in τ; the positive root is the only one when u < v.
 */
export function emissionLag(p: Pass, t: number): number {
  const X = p.x0 + p.u * t;
  const a = p.v * p.v - p.u * p.u;
  const b = 2 * X * p.u;
  const c = -(X * X + p.d * p.d);
  return (-b + Math.sqrt(b * b - 4 * a * c)) / (2 * a);
}

/** Where the source was when it emitted the sound heard at time t. */
export function emittedFrom(p: Pass, t: number): number {
  return p.x0 + p.u * (t - emissionLag(p, t));
}

/**
 * The pitch heard at time t: f / (1 − u·cosθ/v), where θ is the angle between
 * the source's velocity and the line to the listener *at emission*. Only the
 * velocity component along that line matters, never the distance.
 */
export function heardFrequency(p: Pass, t: number): number {
  const xe = emittedFrom(p, t);
  const r = Math.hypot(xe, p.d);
  const towards = (-xe / r) * p.u; // velocity component toward the listener
  return p.f / (1 - towards / p.v);
}

/**
 * Crests drawn every `every` periods, as circles at time t: each centred where
 * the source was when it emitted it, radius v·(t − t_emit).
 */
export function crests(p: Pass, t: number, every: number, rMax: number): { cx: number; r: number }[] {
  const T = every / p.f;
  const out: { cx: number; r: number }[] = [];
  for (let k = Math.floor(t / T); ; k--) {
    const te = k * T;
    const r = p.v * (t - te);
    if (r > rMax) break;
    out.push({ cx: p.x0 + p.u * te, r });
  }
  return out;
}

/** The chapter's train: a 700 Hz whistle; the wine glass rings at 800 Hz with Q = 50. */
export const WHISTLE = { f: 700, v: V_AIR, glass: 800, Q: 50, passSpeed: 40, passDistance: 30 } as const;

/* ── a driven resonator (the wine glass) ───────────────────────────────── */

/** Steady amplitude of a resonator of natural frequency f0 and quality Q, driven at f, relative to its low-frequency response. */
export function resonatorAmplitude(f: number, f0: number, Q: number): number {
  const r = f / f0;
  return 1 / Math.sqrt((1 - r * r) ** 2 + (r / Q) ** 2);
}

/* ── beats ─────────────────────────────────────────────────────────────── */

export const beatFrequency = (f1: number, f2: number) => Math.abs(f1 - f2);

/** Two equal tones added at your ear: cos(2πf₁t) + cos(2πf₂t). */
export function superpose(f1: number, f2: number, t: number): number {
  return Math.cos(2 * Math.PI * f1 * t) + Math.cos(2 * Math.PI * f2 * t);
}

/** The slow swell of that sum: |2 cos(π(f₁ − f₂)t)|, peaking |f₁ − f₂| times a second. */
export function beatEnvelope(f1: number, f2: number, t: number): number {
  return Math.abs(2 * Math.cos(Math.PI * (f1 - f2) * t));
}

/**
 * The same swell written with the running phase difference φ = ∫2π(f₁ − f₂)dt,
 * so it stays continuous when one tone is retuned mid-sound: |2 cos(φ/2)|.
 */
export function beatEnvelopeAtPhase(phi: number): number {
  return Math.abs(2 * Math.cos(phi / 2));
}

/**
 * A tuning fork with a small clamp (a rider) on one tine. The tine bends like
 * a cantilever, whose static deflection shape, normalised to 1 at the tip, is
 * φ(ξ) = ξ²(6 − 4ξ + ξ²)/3 for ξ from 0 at the root to 1 at the tip. A rider
 * of mass ratio μ there adds μφ² to the modal mass (Rayleigh's estimate), so
 * f = f₀ / √(1 + μφ²): the farther out the rider, the lower the note.
 */
export function cantileverShape(xi: number): number {
  return (xi * xi * (6 - 4 * xi + xi * xi)) / 3;
}

export function riderForkFrequency(f0: number, xi: number, mu: number): number {
  const phi = cantileverShape(xi);
  return f0 / Math.sqrt(1 + mu * phi * phi);
}

/** The fork the lesson uses: bare at 444.5 Hz, 432 Hz with the rider at the tip. */
export const RIDER_FORK = { f0: 444.5, mu: (444.5 / 432) ** 2 - 1, reference: 440 } as const;

/** Where on the tine the rider brings the fork to fTarget (bisection; f falls as ξ grows). */
export function riderPositionFor(f0: number, mu: number, fTarget: number): number {
  let lo = 0, hi = 1;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (riderForkFrequency(f0, mid, mu) > fTarget) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}
