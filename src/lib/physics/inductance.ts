/**
 * Chapter 30, Inductance: an inductor is inertia for current.
 *
 * A coil makes a voltage −L dI/dt that fights any change in its current, the
 * way a mass makes a force −m dv/dt that fights any change in its velocity.
 * Everything in this file follows from that one line.
 *
 *   RL:  ε = IR + L dI/dt   →  I(t) = (ε/R)(1 − e^{−t/τ}),   τ = L/R
 *   LC:  L d²q/dt² = −q/C   →  q(t) = Q₀ cos ωt,             ω = 1/√(LC)
 *
 * The LC loop is integrated with velocity Verlet (a symplectic method), so its
 * energy ½q²/C + ½LI² stays bounded forever instead of drifting. The tests in
 * __tests__/inductance.test.ts pin every claim the chapter's lessons make.
 */

export const TAU = 2 * Math.PI;

/* ── one coil ──────────────────────────────────────────────────────────── */

/** The coil's own voltage, ε_L = −L dI/dt, volts. */
export const coilEmf = (L: number, dIdt: number) => -L * dIdt;

/** Energy held in the coil's magnetic field, ½LI², joules. */
export const coilEnergy = (L: number, I: number) => 0.5 * L * I * I;

/** The current at which the field holds a fraction f of its energy at `Ifull`. */
export const currentForEnergyFraction = (f: number, Ifull: number) => Ifull * Math.sqrt(f);

/** Fraction of the full field energy held at current I (energy goes as I²). */
export const energyFraction = (I: number, Ifull: number) => (I / Ifull) ** 2;

/* ── RL: a coil and a resistor on a battery ────────────────────────────── */

/** Time constant τ = L/R, seconds. */
export const rlTau = (L: number, R: number) => L / R;

/** The current the loop settles to, ε/R. The coil plays no part in it. */
export const rlFinal = (emf: number, R: number) => emf / R;

/** Current t seconds after the switch closes, from I = 0. */
export function rlRise(t: number, emf: number, R: number, L: number): number {
  return rlFinal(emf, R) * (1 - Math.exp(-t / rlTau(L, R)));
}

/** Current t seconds after the battery is taken away, from I0, through R. */
export function rlFall(t: number, I0: number, R: number, L: number): number {
  return I0 * Math.exp(-t / rlTau(L, R));
}

/** dI/dt in an RL loop driven by `emf` (0 for a loop with no battery). */
export const rlSlope = (I: number, emf: number, R: number, L: number) => (emf - I * R) / L;

/**
 * Advance the current by dt. The equation is linear, so this is the exact
 * solution over the step, not an approximation: I relaxes toward ε/R by the
 * factor e^{−dt/τ}. Works for rise (emf > 0) and fall (emf = 0) alike.
 */
export function rlStep(I: number, dt: number, emf: number, R: number, L: number): number {
  const Iinf = rlFinal(emf, R);
  return Iinf + (I - Iinf) * Math.exp(-dt / rlTau(L, R));
}

/** Time for the current to climb to a fraction f of its final value. */
export const rlTimeToFraction = (f: number, L: number, R: number) => -rlTau(L, R) * Math.log(1 - f);

/** Time for the current to reach half its final value: τ ln 2. */
export const rlHalfTime = (L: number, R: number) => rlTimeToFraction(0.5, L, R);

/** The inductance that makes the current reach half its final value at t. */
export const inductanceForHalfTime = (t: number, R: number) => (t * R) / Math.LN2;

/**
 * Energy the battery has pushed into the coil after t seconds of rise, found by
 * adding up the power the coil takes, I·L dI/dt, step by step. It exists so a
 * test can check that this sum equals ½LI²: the work goes into the field.
 */
export function energyIntoCoil(t: number, emf: number, R: number, L: number, steps = 20000): number {
  const dt = t / steps;
  let W = 0;
  for (let k = 0; k < steps; k++) {
    const tm = (k + 0.5) * dt;
    const I = rlRise(tm, emf, R, L);
    W += I * L * rlSlope(I, emf, R, L) * dt;
  }
  return W;
}

/* ── a lamp beside the coil: the two-branch demonstration ─────────────── */

/**
 * A battery feeds two branches in parallel: lamp A alone, and lamp B in series
 * with an ideal coil. Both lamps have resistance R. Closed, lamp A's current is
 * ε/R at once and lamp B's rises as rlRise. Opened at current I0 in the coil,
 * the coil keeps its current going round the only loop left, B → A, through
 * both lamps (2R), so lamp A carries it backwards and fades with τ = L/2R.
 */
export interface TwinState { closed: boolean; iA: number; iB: number }

export function twinStep(s: TwinState, dt: number, emf: number, R: number, L: number): TwinState {
  if (s.closed) {
    return { closed: true, iA: emf / R, iB: rlStep(s.iB, dt, emf, R, L) };
  }
  const iB = rlStep(s.iB, dt, 0, 2 * R, L);
  return { closed: false, iA: -iB, iB };
}

/* ── the iron core: L grows as the core slides in ──────────────────────── */

/**
 * A teaching model of a coil with a sliding iron core: each centimetre pushed in
 * multiplies L by the same factor, from `Lair` (no core) to `Lfull` (all in).
 * Real cores are close to this over most of their travel.
 */
export const coreInductance = (x: number, Lair: number, Lfull: number) =>
  Lair * (Lfull / Lair) ** Math.min(1, Math.max(0, x));

/** How far in the core must be for inductance L. */
export const coreForInductance = (L: number, Lair: number, Lfull: number) =>
  Math.log(L / Lair) / Math.log(Lfull / Lair);

/* ── LC: a charged capacitor across a coil ─────────────────────────────── */

/** Angular frequency of an LC loop, 1/√(LC), rad/s. */
export const lcOmega = (L: number, C: number) => 1 / Math.sqrt(L * C);

/** Frequency of an LC loop, hertz. */
export const lcFrequency = (L: number, C: number) => lcOmega(L, C) / TAU;

/** Period of an LC loop, seconds. */
export const lcPeriod = (L: number, C: number) => TAU * Math.sqrt(L * C);

/** The inductance that tunes capacitor C to frequency f (Hz). */
export const inductanceForFrequency = (f: number, C: number) => 1 / ((TAU * f) ** 2 * C);

/** Charge q on the capacitor and current I = dq/dt round the loop. */
export interface LcState { q: number; I: number; t: number }

export const capEnergy = (q: number, C: number) => (q * q) / (2 * C);

/** Total energy ½q²/C + ½LI², joules. */
export const lcEnergy = (s: LcState, L: number, C: number) => capEnergy(s.q, C) + coilEnergy(L, s.I);

/** Share of the loop's energy that sits in the coil right now, 0..1. */
export const coilShare = (s: LcState, L: number, C: number) => coilEnergy(L, s.I) / lcEnergy(s, L, C);

/**
 * One velocity-Verlet step of L q'' = −q/C. Charge plays position, current
 * plays velocity, L plays mass and 1/C plays the spring constant: this is
 * chapter 14's cart on a spring, line for line. Verlet is symplectic, so the
 * energy wobbles by O(ω²dt²) and never drifts.
 */
export function lcStep(s: LcState, dt: number, L: number, C: number): LcState {
  const a0 = -s.q / (L * C);
  const q = s.q + s.I * dt + 0.5 * a0 * dt * dt;
  const a1 = -q / (L * C);
  return { q, I: s.I + 0.5 * (a0 + a1) * dt, t: s.t + dt };
}

/** A capacitor charged to V0 volts, just connected to the coil: q = CV0, I = 0. */
export const lcRelease = (V0: number, C: number): LcState => ({ q: C * V0, I: 0, t: 0 });

/** Largest current the loop reaches, Q₀ω (all the energy in the coil). */
export const lcPeakCurrent = (V0: number, L: number, C: number) => C * V0 * lcOmega(L, C);

/** Run n steps and return the trajectory, first state included. */
export function lcRun(s0: LcState, dt: number, n: number, L: number, C: number): LcState[] {
  const out = [s0];
  let s = s0;
  for (let k = 0; k < n; k++) { s = lcStep(s, dt, L, C); out.push(s); }
  return out;
}

/**
 * Times at which the charge crosses zero, by linear interpolation between
 * steps. Consecutive crossings are half a period apart; at each one the
 * capacitor is empty and all the energy is in the coil.
 */
export function chargeZeroCrossings(run: LcState[]): number[] {
  const out: number[] = [];
  for (let k = 1; k < run.length; k++) {
    const a = run[k - 1], b = run[k];
    if (a.q === 0 || a.q * b.q < 0) out.push(a.t + (b.t - a.t) * (a.q / (a.q - b.q)));
  }
  return out;
}

/* ── a radio tuner: an LC tank picking one station ─────────────────────── */

/**
 * How strongly a tank of natural frequency f0 and quality Q responds to a
 * station broadcasting at f, 0..1: the resonance curve of a driven, damped
 * oscillator (chapter 14), normalised to 1 at f = f0. It falls to 1/√2, half
 * the power, at f0(1 ± 1/2Q) for large Q.
 */
export function tankResponse(f: number, f0: number, Q: number): number {
  const d = f / f0 - f0 / f;
  return 1 / Math.sqrt(1 + Q * Q * d * d);
}

/** Half-power band of the tank, [low, high] in Hz. */
export function tankBand(f0: number, Q: number): [number, number] {
  const r = 1 / (2 * Q);
  const k = Math.sqrt(1 + r * r);
  return [f0 * (k - r), f0 * (k + r)];
}

/* ── the chapter's fixed numbers ───────────────────────────────────────── */

/** Lesson 1: a 6 V battery and 12 Ω lamps (0.5 A lit, 3 W). */
export const CH30_RL = { emf: 6, R: 12 } as const;

/** Hook: the coil beside a lamp, τ = 1 s. */
export const CH30_TWIN_L = 12;

/** "Make it wait": a coil with a sliding iron core, and the half-way time to hit. */
export const CH30_CORE = { Lair: 1, Lfull: 40, start: 0.25, halfAt: 1.0 } as const;

/** "Let it go": a 24 H coil, τ = 2 s, opened when it holds half its full energy. */
export const CH30_SPARK = { L: 24, target: 0.5, tolerance: 0.05 } as const;

/** Lesson 2: the sloshing loop. 0.25 H and 100 µF ring at 31.8 Hz, shown slowed. */
export const CH30_LC = { L: 0.25, C: 100e-6, V0: 10, slow: 150 } as const;

/** Lesson 2: the radio. A 200 pF tuning capacitor, a slug-tuned coil, Q = 15. */
export const CH30_RADIO = { C: 200e-12, Lair: 40e-6, Lfull: 600e-6, Q: 15, startHz: 600e3, stationHz: 1200e3 } as const;
