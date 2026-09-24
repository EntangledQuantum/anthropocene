/** Momentum, impulse and one-dimensional collisions (University Physics, ch. 8).
 *
 *  Three pieces, each small enough to read in one sitting:
 *
 *    1. The algebra. `collide1D` is the whole of a 1D collision with a
 *       coefficient of restitution, written in the centre-of-mass frame so
 *       the two conservation statements are visible in the shape of the
 *       expression: the CM velocity passes through untouched, and the
 *       relative velocity is reversed and scaled by e.
 *    2. Impulse profiles. A soft stop is modelled as a half-sine force pulse,
 *       which is what a hand, an airbag or a bat actually does: the push
 *       ramps up and back down. Its area is fixed by the change in momentum;
 *       its height is fixed by how long you let it last.
 *    3. A contact model. Two carts meet through a hysteretic bumper spring
 *       (Walton & Braun): stiffness k while it squashes, k/e² while it
 *       springs back. That returns exactly a fraction e² of the stored
 *       energy, so it reproduces `collide1D` in the limit of small steps,
 *       and because the bumper pushes both carts equally and oppositely at
 *       every instant, total momentum is conserved step by step, not just
 *       before and after. The scenes animate this, so the energy bar can dip
 *       *during* the flash while the momentum total never moves.
 *
 *  Convention: 1D, +x to the right, body 1 (A) on the left of body 2 (B).
 *  SI units throughout. A mass of `Infinity` is a wall.
 */

/* ── the ledger ────────────────────────────────────────────────────────── */

export const momentum = (m: number, v: number): number => m * v;

export const kineticEnergy = (m: number, v: number): number => 0.5 * m * v * v;

/** μ = m₁m₂/(m₁+m₂). Against a wall (m₂ = ∞) it is just m₁. */
export function reducedMass(m1: number, m2: number): number {
  if (!Number.isFinite(m2)) return m1;
  if (!Number.isFinite(m1)) return m2;
  return (m1 * m2) / (m1 + m2);
}

/** Velocity of the centre of mass. A wall drags the CM with it. */
export function cmVelocity(m1: number, v1: number, m2: number, v2: number): number {
  if (!Number.isFinite(m2)) return v2;
  if (!Number.isFinite(m1)) return v1;
  return (m1 * v1 + m2 * v2) / (m1 + m2);
}

/* ── the collision ─────────────────────────────────────────────────────── */

export interface Outcome {
  v1: number;
  v2: number;
}

/** Do they meet? A is on the left, so they close only if A is faster. */
export const approaching = (v1: number, v2: number): boolean => v1 > v2;

/**
 * A 1D collision with coefficient of restitution e (0 = they stick,
 * 1 = elastic).
 *
 *   V  = (m₁v₁ + m₂v₂)/(m₁+m₂)       the CM velocity, which nothing internal can change
 *   u  = v₁ − v₂                     the closing speed
 *   v₁′ = V − e·(m₂/M)·u
 *   v₂′ = V + e·(m₁/M)·u             so v₂′ − v₁′ = e·u
 *
 * If they are not approaching there is no collision and nothing changes.
 */
export function collide1D(m1: number, v1: number, m2: number, v2: number, e: number): Outcome {
  if (!approaching(v1, v2)) return { v1, v2 };
  const u = v1 - v2;
  if (!Number.isFinite(m2)) return { v1: v2 - e * u, v2 };
  if (!Number.isFinite(m1)) return { v1, v2: v1 + e * u };
  const M = m1 + m2;
  const V = (m1 * v1 + m2 * v2) / M;
  return { v1: V - (e * m2 * u) / M, v2: V + (e * m1 * u) / M };
}

/** Kinetic energy lost: (1 − e²)·½μu². Zero only when e = 1. */
export function keLost(m1: number, v1: number, m2: number, v2: number, e: number): number {
  if (!approaching(v1, v2)) return 0;
  const u = v1 - v2;
  return (1 - e * e) * 0.5 * reducedMass(m1, m2) * u * u;
}

/** Impulse delivered to B, +x positive: (1 + e)·μ·u. A receives the negative. */
export function impulseOnTarget(m1: number, v1: number, m2: number, v2: number, e: number): number {
  if (!approaching(v1, v2)) return 0;
  return (1 + e) * reducedMass(m1, m2) * (v1 - v2);
}

/** B's velocity that makes a stuck pair end at rest: total momentum zero. */
export const velocityForRest = (m1: number, v1: number, m2: number): number => (-m1 * v1) / m2;

/* ── impulse: the half-sine stop ───────────────────────────────────────── */

/** Area under a half-sine pulse of height `peak` lasting `T`: 2·peak·T/π. */
export const halfSineImpulse = (peak: number, T: number): number => (2 * peak * T) / Math.PI;

/** Height a half-sine pulse of duration T needs to deliver impulse J. */
export const halfSinePeak = (J: number, T: number): number => (Math.PI * J) / (2 * T);

/** Force of a half-sine pulse at time t (zero outside [0, T]). */
export function halfSineForce(peak: number, T: number, t: number): number {
  if (t < 0 || t > T) return 0;
  return peak * Math.sin((Math.PI * t) / T);
}

export interface SoftStop {
  mass: number;
  v0: number;
  give: number;
  /** Seconds from first touch to rest: 2·give/v₀. */
  duration: number;
  /** Largest force, newtons: π·m·v₀²/(4·give). */
  peak: number;
  /** Area under F(t), N·s. Always m·v₀, whatever the give. */
  impulse: number;
  force: (t: number) => number;
  velocity: (t: number) => number;
  /** Distance travelled since first touch. */
  position: (t: number) => number;
}

/**
 * Stop mass m, arriving at v₀, over a distance `give`, with a half-sine push.
 *
 * With F = F̂·sin(πt/T) the velocity is v(t) = (v₀/2)(1 + cos(πt/T)), which
 * reaches zero at T, and the distance covered is v₀T/2. Setting that equal to
 * the give fixes T = 2·give/v₀; the impulse must be m·v₀, which fixes
 * F̂ = π·m·v₀/(2T). Double the give and you double the time and halve the peak.
 */
export function softStop(mass: number, v0: number, give: number): SoftStop {
  const T = (2 * give) / v0;
  const peak = halfSinePeak(mass * v0, T);
  const clampT = (t: number) => Math.min(Math.max(t, 0), T);
  return {
    mass, v0, give, duration: T, peak, impulse: mass * v0,
    force: (t) => halfSineForce(peak, T, t),
    velocity: (t) => (v0 / 2) * (1 + Math.cos((Math.PI * clampT(t)) / T)),
    position: (t) => {
      const s = clampT(t);
      return (v0 / 2) * (s + (T / Math.PI) * Math.sin((Math.PI * s) / T));
    },
  };
}

/** The least give that keeps the peak force at or below `maxForce`. */
export const giveToSurvive = (mass: number, v0: number, maxForce: number): number =>
  (Math.PI * mass * v0 * v0) / (4 * maxForce);

/** Average force over a stop: Δp/Δt. */
export const averageForce = (mass: number, dv: number, dt: number): number => (mass * Math.abs(dv)) / dt;

/** Velocity after a pulse delivers impulse J to mass m moving at v. */
export const afterImpulse = (mass: number, v: number, J: number): number => v + J / mass;

/* ── the contact model: two carts and a bumper ─────────────────────────── */

export type ContactPhase = 'approach' | 'loading' | 'unloading' | 'latched' | 'apart';

export interface Cart {
  m: number;
  /** Centre position, m. */
  x: number;
  v: number;
}

export interface Track {
  a: Cart;
  b: Cart;
  /** Centre-to-centre distance at which the bumper first touches. */
  reach: number;
  /** Loading stiffness, N/m. */
  k: number;
  e: number;
  t: number;
  phase: ContactPhase;
  /** Deepest squash so far, m. */
  dMax: number;
  /** Momentum and energy at the start, for the ledger. */
  P0: number;
  E0: number;
}

export function createTrack(a: Cart, b: Cart, opts: { reach: number; k: number; e: number }): Track {
  const s: Track = {
    a: { ...a }, b: { ...b }, reach: opts.reach, k: opts.k, e: opts.e,
    t: 0, phase: 'approach', dMax: 0, P0: 0, E0: 0,
  };
  s.P0 = totalMomentum(s);
  s.E0 = totalKE(s);
  return s;
}

/** Stiffness that makes the bumper squash by exactly `depth` at its deepest:
 *  all of the relative kinetic energy ½μu² goes into ½k·depth². */
export function stiffnessFor(m1: number, m2: number, u: number, depth: number): number {
  return (reducedMass(m1, m2) * u * u) / (depth * depth);
}

export const overlap = (s: Track): number => s.reach - (s.b.x - s.a.x);

export const totalMomentum = (s: Track): number => s.a.m * s.a.v + s.b.m * s.b.v;

export const totalKE = (s: Track): number => kineticEnergy(s.a.m, s.a.v) + kineticEnergy(s.b.m, s.b.v);

/** Where the unloading branch returns to zero force: dMax·(1 − e²). */
const restOverlap = (s: Track) => s.dMax * (1 - s.e * s.e);

/** How hard the bumper pushes the carts apart right now (≥ 0). */
export function bumperForce(s: Track): number {
  const d = overlap(s);
  if (s.phase === 'loading') return Math.max(0, s.k * d);
  if (s.phase === 'unloading') return Math.max(0, (s.k / (s.e * s.e)) * (d - restOverlap(s)));
  return 0;
}

/** Energy held in the squashed bumper right now. */
export function storedEnergy(s: Track): number {
  const d = overlap(s);
  if (s.phase === 'loading') return d > 0 ? 0.5 * s.k * d * d : 0;
  if (s.phase === 'unloading') {
    const r = d - restOverlap(s);
    return r > 0 ? 0.5 * (s.k / (s.e * s.e)) * r * r : 0;
  }
  return 0;
}

/** What has left the ledger as heat and sound: E₀ − KE − stored. */
export const energyLost = (s: Track): number => Math.max(0, s.E0 - totalKE(s) - storedEnergy(s));

/**
 * One semi-implicit Euler step. The bumper's push is applied as +f·dt to B
 * and −f·dt to A — the third law, and the whole reason the total cannot move.
 */
export function stepTrack(s: Track, dt: number): void {
  if (s.phase === 'latched') {
    s.a.x += s.a.v * dt;
    s.b.x += s.b.v * dt;
    s.t += dt;
    return;
  }
  if (s.phase === 'approach' && overlap(s) > 0 && approaching(s.a.v, s.b.v)) s.phase = 'loading';

  const f = bumperForce(s);
  s.a.v -= (f / s.a.m) * dt;
  s.b.v += (f / s.b.m) * dt;
  s.a.x += s.a.v * dt;
  s.b.x += s.b.v * dt;
  s.t += dt;

  if (s.phase === 'loading') {
    s.dMax = Math.max(s.dMax, overlap(s));
    if (s.a.v - s.b.v <= 0) {
      if (s.e <= 0) {
        // Velcro: at the deepest squash the bumpers grab. Both carts take the
        // CM velocity, which is a redistribution and conserves the total.
        const V = cmVelocity(s.a.m, s.a.v, s.b.m, s.b.v);
        s.a.v = V;
        s.b.v = V;
        s.phase = 'latched';
      } else {
        s.phase = 'unloading';
      }
    }
  } else if (s.phase === 'unloading' && overlap(s) <= restOverlap(s)) {
    s.phase = 'apart';
  }
}

/** Is the collision over? */
export const settled = (s: Track): boolean => s.phase === 'latched' || s.phase === 'apart';

/** Run a track until the contact has finished (or tMax), for tests and checks. */
export function runContact(s: Track, dt: number, tMax = 20): Track {
  while (!settled(s) && s.t < tMax) stepTrack(s, dt);
  return s;
}
