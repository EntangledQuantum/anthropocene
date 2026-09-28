/**
 * Chapter 37, Relativity: the stage is spacetime.
 *
 * One postulate does nearly all the work: light goes at c in every inertial
 * frame. Everything in this file follows from it.
 *
 *   light clock:  (c t)² = L² + (v t)²      →  t = γ L/c,   γ = 1/√(1 − β²)
 *   Lorentz:      ct′ = γ(ct − βx),  x′ = γ(x − β ct)
 *   interval:     s² = (cΔt)² − Δx²,  the same in every frame
 *
 * Events are { x, ct } with both coordinates in metres, so light moves one
 * metre of x per metre of ct and the light line sits at 45°. Speeds are
 * β = v/c. The tests in __tests__/relativity.test.ts pin every claim the
 * chapter's lessons make.
 */

/** Speed of light, m/s (exact by definition of the metre). */
export const C = 299_792_458;
/** Metres of ct per microsecond. */
export const CT_PER_US = C * 1e-6;

export const gamma = (beta: number) => 1 / Math.sqrt(1 - beta * beta);

/** The speed with a given γ. */
export const betaForGamma = (g: number) => Math.sqrt(1 - 1 / (g * g));

/** ct in metres → microseconds. */
export const ctToUs = (ct: number) => ct / CT_PER_US;
/** microseconds → ct in metres. */
export const usToCt = (us: number) => us * CT_PER_US;

/* ── the light clock ───────────────────────────────────────────────────── */

/**
 * Time for the photon to cross the mirror gap once, as seen by someone the
 * clock moves past at speed v. It is NOT computed from γ: it comes straight
 * from the right triangle the photon draws. In time t the photon climbs the
 * gap L while the clock slides v t, and the slanted leg is c t long:
 * (c t)² = L² + (v t)²  →  t = L / √(c² − v²).
 */
export function lightClockHalfTick(gap: number, v: number, c = C): number {
  return gap / Math.sqrt(c * c - v * v);
}

/** One tick: up and back down. */
export const lightClockTick = (gap: number, v: number, c = C) => 2 * lightClockHalfTick(gap, v, c);

/** The three sides of one leg of the zig-zag. `slant` is how far the light went. */
export function zigzagLeg(gap: number, v: number, c = C) {
  const t = lightClockHalfTick(gap, v, c);
  const along = v * t;
  return { t, up: gap, along, slant: Math.hypot(gap, along) };
}

/** Moving-clock tick ÷ resting-clock tick, from the zig-zag alone. */
export const tickRatio = (gap: number, v: number, c = C) => lightClockTick(gap, v, c) / lightClockTick(gap, 0, c);

/**
 * Where the photon of a light clock is at time t, in the frame the clock moves
 * through at speed v. The clock's floor mirror starts at x0 at t = 0 with the
 * photon on it. Returns [x, height above the floor mirror].
 */
export function lightClockPhoton(t: number, gap: number, v: number, c = C, x0 = 0): [number, number] {
  const half = lightClockHalfTick(gap, v, c);
  const phase = (t / half) % 2;
  const h = phase <= 1 ? phase * gap : (2 - phase) * gap;
  return [x0 + v * t, h];
}

/* ── dilation and contraction ──────────────────────────────────────────── */

/** A time interval of `proper` on a clock moving at β, as the frame it moves through measures it. */
export const dilated = (proper: number, beta: number) => gamma(beta) * proper;

/** A length `proper` at rest in one frame, measured from a frame it moves through at β. */
export const contracted = (proper: number, beta: number) => proper / gamma(beta);

/* ── cosmic-ray muons ──────────────────────────────────────────────────── */

export const MUON = {
  /** Mean lifetime at rest, s. */
  lifetime: 2.197e-6,
  /** Where cosmic rays make them, m above the ground. */
  height: 15_000,
  /** The fast muon shown in the opening payoff. */
  betaShown: 0.9995,
  /** The speed control spans these β (log scale in 1 − β). */
  betaWindow: [0.99, 0.9999] as const,
  /** "Just reaches": decays no farther than this beyond the ground, as a fraction of the height. */
  reachSlack: 0.1,
} as const;

/** Distance a muon covers in its lifetime, in the ground frame: β c γ τ. */
export const muonRange = (beta: number, tau: number = MUON.lifetime) => beta * C * dilated(tau, beta);

/** The same, if its clock kept ground time: β c τ. */
export const muonRangeUndilated = (beta: number, tau: number = MUON.lifetime) => beta * C * tau;

/** What the muon's own clock reads after it has fallen `distance` (ground frame). */
export const muonClockAfter = (distance: number, beta: number) => distance / (beta * C) / gamma(beta);

/** Ground-clock time to fall `distance`. */
export const groundTimeFor = (distance: number, beta: number) => distance / (beta * C);

/** The slowest muon whose mean lifetime carries it down `height`: γβ = h/(cτ). */
export function muonReachBeta(height: number = MUON.height, tau: number = MUON.lifetime): number {
  const k = height / (C * tau);
  return k / Math.sqrt(1 + k * k);
}

/** Fraction of muons still alive after falling `distance` at β (exponential decay on their own clocks). */
export const muonSurvival = (distance: number, beta: number, tau: number = MUON.lifetime) =>
  Math.exp(-muonClockAfter(distance, beta) / tau);

/** The same fraction if their clocks kept ground time. */
export const muonSurvivalUndilated = (distance: number, beta: number, tau: number = MUON.lifetime) =>
  Math.exp(-groundTimeFor(distance, beta) / tau);

/** Thickness of the air in the muon's own frame. */
export const atmosphereForMuon = (height: number, beta: number) => contracted(height, beta);

/** Is β inside the "just reaches the ground" band? */
export function muonJustReaches(beta: number, height: number = MUON.height): boolean {
  const r = muonRange(beta);
  return r >= height && r <= height * (1 + MUON.reachSlack);
}

/* ── events and the Lorentz transformation ─────────────────────────────── */

export interface Event {
  x: number;
  ct: number;
}

/** Coordinates of an event in a frame moving at +β along x (origins coincide). */
export function boost(e: Event, beta: number): Event {
  const g = gamma(beta);
  return { x: g * (e.x - beta * e.ct), ct: g * (e.ct - beta * e.x) };
}

/** Relativistic velocity addition, in units of c. */
export const addVelocity = (b1: number, b2: number) => (b1 + b2) / (1 + b1 * b2);

/** s² = (cΔt)² − Δx², m². Positive: timelike. Negative: spacelike. */
export function interval(a: Event, b: Event): number {
  const dct = b.ct - a.ct, dx = b.x - a.x;
  return dct * dct - dx * dx;
}

export type Separation = 'timelike' | 'spacelike' | 'lightlike';
export function separation(a: Event, b: Event, eps = 1e-9): Separation {
  const s = interval(a, b);
  const scale = Math.max(1, (b.ct - a.ct) ** 2 + (b.x - a.x) ** 2);
  if (Math.abs(s) <= eps * scale) return 'lightlike';
  return s > 0 ? 'timelike' : 'spacelike';
}

/** cΔt′ = ct′_b − ct′_a in a frame moving at β. */
export const dctIn = (a: Event, b: Event, beta: number) => boost(b, beta).ct - boost(a, beta).ct;

/** The frame speed in which a and b are simultaneous, or null if none exists (|cΔt| ≥ |Δx|). */
export function simultaneousBeta(a: Event, b: Event): number | null {
  const dct = b.ct - a.ct, dx = b.x - a.x;
  if (Math.abs(dct) >= Math.abs(dx)) return dct === 0 && dx === 0 ? 0 : null;
  return dct / dx;
}

/* ── the train of lesson 2 ─────────────────────────────────────────────── */

export const CH37_TRAIN = {
  /** Proper length of the car, m. */
  L0: 400,
  beta: 0.6,
} as const;

/**
 * Lightning hits the rear of the train at (x = 0, ct = 0) in the platform
 * frame, and the front `delayCt` metres of ct later, wherever the front is by
 * then. The passenger sits halfway along the car.
 */
export function trainStrikes(delayCt: number, L0: number = CH37_TRAIN.L0, beta: number = CH37_TRAIN.beta) {
  const L = contracted(L0, beta);
  return {
    L,
    rear: { x: 0, ct: 0 } as Event,
    front: { x: L + beta * delayCt, ct: delayCt } as Event,
  };
}

/**
 * When each flash reaches the passenger, as platform ct (m). Her worldline is
 * x = L/2 + β ct. The rear flash runs forward from (0, 0); the front flash
 * runs backward from the front strike.
 */
export function flashArrivals(delayCt: number, L0: number = CH37_TRAIN.L0, beta: number = CH37_TRAIN.beta) {
  const { L, front } = trainStrikes(delayCt, L0, beta);
  // rear: ct = L/2 + β ct
  const rear = (L / 2) / (1 - beta);
  // front: front.x − (ct − front.ct) = L/2 + β ct
  const frontCt = (front.x + front.ct - L / 2) / (1 + beta);
  return {
    rear: { x: L / 2 + beta * rear, ct: rear } as Event,
    front: { x: L / 2 + beta * frontCt, ct: frontCt } as Event,
  };
}

/** Rear arrival minus front arrival on the passenger's own watch, µs. Positive: front flash first. */
export function arrivalGapOnWatchUs(delayCt: number, L0: number = CH37_TRAIN.L0, beta: number = CH37_TRAIN.beta): number {
  const a = flashArrivals(delayCt, L0, beta);
  return ctToUs((a.rear.ct - a.front.ct) / gamma(beta));
}

/** The delay (ct, m) that makes the strikes simultaneous on the train: γβL₀. */
export const delayForTrainNow = (L0: number = CH37_TRAIN.L0, beta: number = CH37_TRAIN.beta) => gamma(beta) * beta * L0;

/** Two named event pairs for the spacetime diagram. */
export const CH37_PAIRS = {
  /** The strikes, timed so the train calls them simultaneous. Spacelike. */
  strikes: (() => {
    const { rear, front } = trainStrikes(delayForTrainNow());
    return { a: rear, b: front, aLabel: 'rear strike', bLabel: 'front strike' };
  })(),
  /** A guard 200 m up the track sees the rear flash and fires a flare 100 m of ct later. Timelike. */
  cause: { a: { x: 0, ct: 0 } as Event, b: { x: 200, ct: 300 } as Event, aLabel: 'strike', bLabel: 'flare' },
} as const;
export type Ch37Pair = keyof typeof CH37_PAIRS;

/** The frame speeds the diagram's handle allows. */
export const CH37_TILT_MAX = 0.9;
