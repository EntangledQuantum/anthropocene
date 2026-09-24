/**
 * Claims made by chapter 8, "Momentum, Impulse, and Collisions", checked
 * against the code the CatchTheEgg, BatTheBall, AimTheCart and LoadTheCart
 * scenes run.
 */
import { describe, expect, it } from 'vitest';
import {
  afterImpulse, averageForce, bumperForce, collide1D, createTrack, energyLost, giveToSurvive,
  halfSineForce, halfSineImpulse, halfSinePeak, impulseOnTarget, keLost, kineticEnergy,
  reducedMass, runContact, settled, softStop, stepTrack, stiffnessFor, storedEnergy,
  totalKE, totalMomentum, velocityForRest,
} from '../momentum.ts';

/** Trapezoid rule, for measuring areas the lesson claims. */
function area(f: (t: number) => number, a: number, b: number, n = 20000): number {
  const h = (b - a) / n;
  let s = 0.5 * (f(a) + f(b));
  for (let i = 1; i < n; i++) s += f(a + i * h);
  return s * h;
}

/* ── the collision algebra ─────────────────────────────────────────────── */

describe('collide1D', () => {
  // A deterministic spread of masses, speeds and restitutions.
  const cases: [number, number, number, number, number][] = [];
  for (const m1 of [0.06, 0.5, 1, 2, 7.3])
    for (const m2 of [0.5, 1, 3, 8, 140])
      for (const [v1, v2] of [[4, 0], [6, -2], [3, 1], [-1, -5]])
        for (const e of [0, 0.3, 0.5, 0.8, 1]) cases.push([m1, v1, m2, v2, e]);

  it('conserves momentum to machine precision, whatever e is', () => {
    for (const [m1, v1, m2, v2, e] of cases) {
      const o = collide1D(m1, v1, m2, v2, e);
      const before = m1 * v1 + m2 * v2;
      const after = m1 * o.v1 + m2 * o.v2;
      expect(Math.abs(after - before)).toBeLessThanOrEqual(8 * Number.EPSILON * (m1 * Math.abs(v1) + m2 * Math.abs(v2)));
    }
  });

  it('loses exactly (1 − e²)·½μ·u² of kinetic energy', () => {
    for (const [m1, v1, m2, v2, e] of cases) {
      const o = collide1D(m1, v1, m2, v2, e);
      const lost = kineticEnergy(m1, v1) + kineticEnergy(m2, v2) - kineticEnergy(m1, o.v1) - kineticEnergy(m2, o.v2);
      const u = v1 - v2;
      const expected = (1 - e * e) * 0.5 * reducedMass(m1, m2) * u * u;
      expect(lost).toBeCloseTo(expected, 10);
      expect(keLost(m1, v1, m2, v2, e)).toBeCloseTo(expected, 12);
    }
  });

  it('reverses the relative velocity and scales it by e', () => {
    for (const [m1, v1, m2, v2, e] of cases) {
      const o = collide1D(m1, v1, m2, v2, e);
      expect(o.v2 - o.v1).toBeCloseTo(e * (v1 - v2), 10);
    }
  });

  it('equal masses, elastic: the two velocities are exchanged', () => {
    for (const [v1, v2] of [[3, 0], [5, -2], [1, 0.25]]) {
      const o = collide1D(2, v1, 2, v2, 1);
      expect(o.v1).toBeCloseTo(v2, 14);
      expect(o.v2).toBeCloseTo(v1, 14);
    }
  });

  it('does nothing when the carts are not closing', () => {
    expect(collide1D(1, 1, 1, 2, 1)).toEqual({ v1: 1, v2: 2 });
    expect(keLost(1, 1, 1, 2, 0)).toBe(0);
  });
});

/* ── lesson 2: the numbers each step prints ────────────────────────────── */

describe('the velcro carts (hook)', () => {
  it('1 kg at 4 m/s sticks to 3 kg at rest: momentum 4 before and after, KE 8 J → 2 J', () => {
    const o = collide1D(1, 4, 3, 0, 0);
    expect(o.v1).toBeCloseTo(1, 14);
    expect(o.v2).toBeCloseTo(1, 14);
    expect(1 * o.v1 + 3 * o.v2).toBeCloseTo(4, 14);
    expect(kineticEnergy(1, 4)).toBe(8);
    expect(kineticEnergy(4, 1)).toBe(2);
    expect(keLost(1, 4, 3, 0, 0)).toBeCloseTo(6, 12);
  });
});

describe('stop them dead (AimTheCart)', () => {
  it('B must come at −2 m/s, and then every joule of the 24 J is gone', () => {
    const vB = velocityForRest(1, 6, 3);
    expect(vB).toBeCloseTo(-2, 14);
    const o = collide1D(1, 6, 3, vB, 0);
    expect(o.v1).toBeCloseTo(0, 14);
    expect(o.v2).toBeCloseTo(0, 14);
    const E0 = kineticEnergy(1, 6) + kineticEnergy(3, vB);
    expect(E0).toBeCloseTo(24, 12);
    expect(keLost(1, 6, 3, vB, 0)).toBeCloseTo(24, 12);
  });

  it('matching speeds instead of momenta leaves the pair drifting', () => {
    const o = collide1D(1, 6, 3, -6, 0);
    expect(o.v1).toBeCloseTo(-3, 12); // 6 − 18 = −12 kg·m/s over 4 kg
  });
});

describe('bouncy bumpers (LoadTheCart)', () => {
  it('A (2 kg, 3 m/s) stops dead only when B is also 2 kg', () => {
    for (let mB = 0.5; mB <= 8; mB += 0.5) {
      const { v1 } = collide1D(2, 3, mB, 0, 1);
      if (mB === 2) expect(Math.abs(v1)).toBeLessThan(1e-14);
      else expect(Math.abs(v1)).toBeGreaterThan(0.2);
    }
  });

  it('loading B to 8 kg makes A bounce back at 1.8 m/s', () => {
    expect(collide1D(2, 3, 8, 0, 1).v1).toBeCloseTo(-1.8, 12);
  });

  it('light into heavy: the heavy cart leaves with nearly twice the momentum the light one brought', () => {
    const p0 = 0.5 * 4;
    const o = collide1D(0.5, 4, 8, 0, 1);
    expect(o.v1).toBeLessThan(0); // the light one bounces back
    const pB = 8 * o.v2;
    expect(pB / p0).toBeCloseTo(2 * 8 / 8.5, 12); // 1.88
    expect(pB).toBeGreaterThan(Math.abs(0.5 * o.v1)); // and more than the light one carries
    expect(o.v1).toBeCloseTo(-3.53, 2);   // "flies back at 3.5 m/s"
    expect(-0.5 * o.v1).toBeCloseTo(1.76, 2); // "only 1.8 kg·m/s"
    expect(o.v2).toBeCloseTo(0.47, 2);    // "creeps off at 0.47 m/s"
    expect(pB).toBeCloseTo(3.76, 2);      // "which is 3.8"
    expect(pB).toBeGreaterThan(0.5 * 4);  // "more than the light cart ever had"
    // …while taking under a quarter of the energy.
    expect(kineticEnergy(8, o.v2) / kineticEnergy(0.5, 4)).toBeLessThan(0.25);
  });
});

describe('impulse delivered to the target (the closing ranking)', () => {
  it('ranks as (1 + e)·μ·u: stick < half-bounce < bounce < heavier < wall', () => {
    const J = {
      stick: impulseOnTarget(1, 4, 1, 0, 0),
      half: impulseOnTarget(1, 4, 1, 0, 0.5),
      bounce: impulseOnTarget(1, 4, 1, 0, 1),
      heavy: impulseOnTarget(1, 4, 3, 0, 1),
      wall: impulseOnTarget(1, 4, Infinity, 0, 1),
    };
    expect(J.stick).toBeCloseTo(2, 14);
    expect(J.half).toBeCloseTo(3, 14);
    expect(J.bounce).toBeCloseTo(4, 14);
    expect(J.heavy).toBeCloseTo(6, 14);
    expect(J.wall).toBeCloseTo(8, 14);
    // …and each equals the target's own change in momentum.
    const o = collide1D(1, 4, 3, 0, 1);
    expect(3 * o.v2).toBeCloseTo(J.heavy, 12);
    expect(collide1D(1, 4, Infinity, 0, 1).v1).toBe(-4);
  });

  it('a bounce hits a wall with twice the impulse of a splat', () => {
    expect(impulseOnTarget(1, 4, Infinity, 0, 1) / impulseOnTarget(1, 4, Infinity, 0, 0)).toBeCloseTo(2, 14);
  });
});

/* ── the contact model the scenes animate ──────────────────────────────── */

describe('bumper contact', () => {
  const make = (mA: number, vA: number, mB: number, vB: number, e: number) =>
    createTrack({ m: mA, x: -2, v: vA }, { m: mB, x: 0.5, v: vB },
      { reach: 1.2, k: stiffnessFor(mA, mB, vA - vB, 0.25), e });

  it('conserves total momentum at every single step, not just before and after', () => {
    for (const e of [0, 0.5, 1]) {
      const s = make(1, 6, 3, -1, e);
      const scale = 6 + 3;
      let worst = 0;
      while (s.t < 3) {
        stepTrack(s, 1e-4);
        worst = Math.max(worst, Math.abs(totalMomentum(s) - s.P0));
      }
      expect(worst).toBeLessThan(1e-11 * scale);
    }
  });

  it('reproduces collide1D as the step shrinks', () => {
    for (const [mA, vA, mB, vB] of [[1, 6, 3, -1], [2, 3, 8, 0], [0.5, 4, 8, 0], [2, 3, 2, 0]])
      for (const e of [0, 0.5, 1]) {
        const s = runContact(make(mA, vA, mB, vB, e), 2e-5);
        expect(settled(s)).toBe(true);
        const o = collide1D(mA, vA, mB, vB, e);
        expect(s.a.v).toBeCloseTo(o.v1, 2);
        expect(s.b.v).toBeCloseTo(o.v2, 2);
        expect(energyLost(s)).toBeCloseTo(keLost(mA, vA, mB, vB, e), 1);
      }
  });

  it('squashes the bumper to the depth it was tuned for', () => {
    const s = runContact(make(1, 6, 3, -1, 1), 2e-5);
    expect(s.dMax).toBeCloseTo(0.25, 2);
  });

  it('even an elastic collision is not kinetic-energy-conserving mid-flash', () => {
    // Equal masses, B at rest: at the deepest squash both move at V = u/2,
    // so KE dips to half and the other half sits in the bumper.
    const s = make(2, 3, 2, 0, 1);
    let minKE = Infinity, maxStored = 0;
    while (!settled(s)) {
      stepTrack(s, 1e-5);
      minKE = Math.min(minKE, totalKE(s));
      maxStored = Math.max(maxStored, storedEnergy(s));
    }
    expect(minKE / s.E0).toBeCloseTo(0.5, 2);
    expect(maxStored / s.E0).toBeCloseTo(0.5, 2);
    expect(totalKE(s) / s.E0).toBeCloseTo(1, 2);
  });

  it('the bumper only ever pushes', () => {
    const s = make(1, 6, 3, -1, 0.5);
    while (!settled(s)) {
      stepTrack(s, 1e-4);
      expect(bumperForce(s)).toBeGreaterThanOrEqual(0);
    }
  });
});

/* ── lesson 1: impulse ─────────────────────────────────────────────────── */

describe('the half-sine stop', () => {
  const m = 0.06, v0 = 6;

  it('delivers the same area, m·v₀, whatever the give', () => {
    for (const give of [0.005, 0.01, 0.07, 0.3]) {
      const s = softStop(m, v0, give);
      expect(area(s.force, 0, s.duration)).toBeCloseTo(m * v0, 6);
      expect(s.impulse).toBeCloseTo(m * v0, 14);
    }
  });

  it('actually stops the egg, in exactly the give', () => {
    for (const give of [0.01, 0.07, 0.3]) {
      const s = softStop(m, v0, give);
      expect(s.velocity(s.duration)).toBeCloseTo(0, 12);
      expect(s.position(s.duration)).toBeCloseTo(give, 12);
      // and the position is the integral of the velocity
      expect(area(s.velocity, 0, s.duration)).toBeCloseTo(give, 8);
      // and the velocity lost so far is the impulse so far over m
      const t = 0.37 * s.duration;
      expect(v0 - s.velocity(t)).toBeCloseTo(area(s.force, 0, t) / m, 6);
    }
  });

  it('the stiff hand (1 cm) peaks near 170 N; the 8 cm hand near 21 N', () => {
    expect(softStop(m, v0, 0.01).peak).toBeCloseTo(169.6, 1);
    expect(softStop(m, v0, 0.08).peak).toBeCloseTo(21.2, 1);
  });

  it('twice the give: twice the time, half the peak', () => {
    const a = softStop(m, v0, 0.05), b = softStop(m, v0, 0.1);
    expect(b.duration / a.duration).toBeCloseTo(2, 12);
    expect(b.peak / a.peak).toBeCloseTo(0.5, 12);
  });

  it('twice the speed needs four times the give to keep the same peak', () => {
    const slow = softStop(m, 6, 0.07), fast = softStop(m, 12, 0.28);
    expect(fast.peak).toBeCloseTo(slow.peak, 10);
    expect(fast.duration / slow.duration).toBeCloseTo(2, 12);
    expect(fast.impulse / slow.impulse).toBeCloseTo(2, 12);
  });

  it('the egg in the lesson: 6.8 cm saves it at 6 m/s, 14 cm cracks it at 12 m/s, 27 cm saves it', () => {
    const crack = 25;
    expect(giveToSurvive(m, 6, crack)).toBeCloseTo(0.0679, 4);
    expect(softStop(m, 12, 0.14).peak).toBeGreaterThan(1.9 * crack);
    const need = giveToSurvive(m, 12, crack);
    expect(need).toBeCloseTo(0.2714, 4);
    expect(need).toBeLessThan(0.35); // within an arm's reach
    expect(softStop(m, 12, need).peak).toBeCloseTo(crack, 10);
  });
});

describe('the bat', () => {
  const m = 0.145, vIn = -35, vOut = 45;

  it('a half-sine pulse has area 2·F̂·T/π, and halfSinePeak inverts it', () => {
    const peak = 18000, T = 0.0007;
    const measured = area((t) => halfSineForce(peak, T, t), 0, T);
    expect(Math.abs(measured / halfSineImpulse(peak, T) - 1)).toBeLessThan(1e-8);
    expect(halfSinePeak(halfSineImpulse(peak, T), T)).toBeCloseTo(peak, 8);
  });

  it('sending the ball back at 45 m/s takes 11.6 N·s, not the 6.5 N·s that 45 m/s alone suggests', () => {
    const need = m * (vOut - vIn);
    expect(need).toBeCloseTo(11.6, 10);
    expect(afterImpulse(m, vIn, need)).toBeCloseTo(vOut, 10);
    // forget to cancel the incoming momentum and the ball dribbles off at 10 m/s
    expect(afterImpulse(m, vIn, m * vOut)).toBeCloseTo(10, 10);
  });

  it('stepping the ball through the pulse lands on the same exit speed', () => {
    const J = m * (vOut - vIn), T = 0.0008, peak = halfSinePeak(J, T);
    let v = vIn;
    const n = 4000, dt = T / n;
    for (let i = 0; i < n; i++) v += (halfSineForce(peak, T, (i + 0.5) * dt) / m) * dt;
    expect(v).toBeCloseTo(vOut, 5);
  });
});

describe('the airbag estimate', () => {
  it('a 70 kg driver stopped from 50 km/h in 0.12 s feels about 8.1 kN, some twelve body weights', () => {
    expect(70 * 50 / 3.6).toBeCloseTo(972, 0); // "970 kg·m/s of momentum"
    const F = averageForce(70, 50 / 3.6, 0.12);
    expect(F).toBeCloseTo(8102, 0);
    expect(F / (70 * 9.81)).toBeGreaterThan(11);
    expect(F / (70 * 9.81)).toBeLessThan(13);
    // the dashboard, ten times quicker, is ten times the force
    expect(averageForce(70, 50 / 3.6, 0.012) / F).toBeCloseTo(10, 12);
  });
});
