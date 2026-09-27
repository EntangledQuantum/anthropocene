import { describe, expect, it } from 'vitest';
import {
  E_CHARGE, G, M_ELECTRON, M_PROTON, borisStep, commutatorSign, cross, cyclotronPeriod, cyclotronRadius,
  dipoleMoment, fieldToLandAt, floatCurrent, intoPage, lapInField, landingDistance, lorentzForce,
  loopEnergy, loopSides, loopTorque, magneticPower, motorStep, norm, outOfPage, selectorSpeed,
  spectrometerShot, traceCharge, turnSense, wireForce, type ChargeState, type MotorParams, type V3,
} from '../magnetism.ts';

const CM = 0.01;
const ZERO: V3 = [0, 0, 0];

/* Lesson 1 — "A push that only turns" */

describe('the magnetic force on a moving charge', () => {
  it('is q v × B: a proton moving up in a field into the page is pushed left', () => {
    const F = lorentzForce(E_CHARGE, [0, 1e6, 0], intoPage(0.1));
    expect(F[0]).toBeLessThan(0);
    expect(F[0]).toBeCloseTo(-E_CHARGE * 1e6 * 0.1, 25);
    expect(F[1]).toBe(0);
  });

  it('pushes an electron the other way', () => {
    const F = lorentzForce(-E_CHARGE, [0, 1e6, 0], intoPage(0.1));
    expect(F[0]).toBeGreaterThan(0);
  });

  it('is perpendicular to the velocity, so its power is zero at every angle', () => {
    for (let a = 0; a < 2 * Math.PI; a += 0.37) {
      const v: V3 = [Math.cos(a) * 3e5, Math.sin(a) * 3e5, 0];
      const B: V3 = [0.02, -0.3, 0.7];
      // zero to round-off, measured against the size of each term q v² B
      expect(Math.abs(magneticPower(E_CHARGE, v, B)) / (E_CHARGE * norm(v) ** 2 * norm(B))).toBeLessThan(1e-14);
    }
  });

  it('vanishes for a charge moving along the field, which goes straight', () => {
    expect(norm(lorentzForce(E_CHARGE, [0, 0, 1e6], outOfPage(1)))).toBe(0);
    const path = traceCharge({
      q: E_CHARGE, m: M_PROTON, x0: ZERO, v0: [0, 0, 1e6], dt: 1e-9, maxSteps: 500,
      fields: () => ({ E: ZERO, B: outOfPage(1) }),
    });
    const end = path[path.length - 1];
    expect(end.x[0]).toBe(0);
    expect(end.x[1]).toBe(0);
    expect(end.x[2]).toBeCloseTo(1e6 * 500e-9, 9);
  });

  it('the scene’s electron (B out of the page, moving at 30°) is pushed toward 120°', () => {
    const v: V3 = [Math.cos(Math.PI / 6), Math.sin(Math.PI / 6), 0];
    const F = lorentzForce(-E_CHARGE, v, outOfPage(1));
    expect((Math.atan2(F[1], F[0]) * 180) / Math.PI).toBeCloseTo(120, 9);
    // a proton, the rule without the sign, would be pushed exactly the other way
    const P = lorentzForce(E_CHARGE, v, outOfPage(1));
    expect((Math.atan2(P[1], P[0]) * 180) / Math.PI).toBeCloseTo(-60, 9);
  });

  it('turns a proton counterclockwise in a field into the page, an electron clockwise', () => {
    expect(turnSense(E_CHARGE, intoPage(1))).toBe(1);
    expect(turnSense(-E_CHARGE, intoPage(1))).toBe(-1);
    expect(turnSense(-E_CHARGE, outOfPage(1))).toBe(1);
  });
});

describe('the Boris push', () => {
  it('keeps the speed constant to 1e-9 under a pure B field, over twenty turns', () => {
    const B = intoPage(0.13);
    const T = cyclotronPeriod(M_PROTON, E_CHARGE, 0.13);
    let s: ChargeState = { x: ZERO, v: [3e5, 7e5, 2e5], t: 0 };
    const v0 = norm(s.v);
    let worst = 0;
    for (let i = 0; i < 20 * 400; i++) {
      s = borisStep(s, E_CHARGE, M_PROTON, ZERO, B, T / 400);
      worst = Math.max(worst, Math.abs(norm(s.v) - v0) / v0);
    }
    expect(worst).toBeLessThan(1e-9);
  });

  it('keeps the speed even with a coarse step: the rotation is exact', () => {
    const T = cyclotronPeriod(M_ELECTRON, E_CHARGE, 1e-3);
    let s: ChargeState = { x: ZERO, v: [1e6, 0, 0], t: 0 };
    for (let i = 0; i < 1000; i++) s = borisStep(s, -E_CHARGE, M_ELECTRON, ZERO, intoPage(1e-3), T / 7);
    expect(Math.abs(norm(s.v) - 1e6) / 1e6).toBeLessThan(1e-9);
  });

  it('an electric field, by contrast, does change the speed', () => {
    let s: ChargeState = { x: ZERO, v: [1e5, 0, 0], t: 0 };
    for (let i = 0; i < 100; i++) s = borisStep(s, E_CHARGE, M_PROTON, [1e3, 0, 0], ZERO, 1e-9);
    expect(norm(s.v)).toBeGreaterThan(1e5);
  });
});

describe('the circle', () => {
  it('has radius m v / (q B), measured from the path', () => {
    for (const [v, B] of [[1e6, 0.1], [2e6, 0.1], [1e6, 0.2], [4e5, 0.05]]) {
      const lap = lapInField(M_PROTON, E_CHARGE, v, intoPage(B), 4000);
      expect(lap.diameter / 2 / cyclotronRadius(M_PROTON, v, E_CHARGE, B)).toBeCloseTo(1, 4);
    }
  });

  it('doubling the field halves the circle and leaves the speed alone', () => {
    const a = spectrometerShot(M_PROTON, E_CHARGE, 1e6, 0.1);
    const b = spectrometerShot(M_PROTON, E_CHARGE, 1e6, 0.2);
    expect(Math.abs(b.landX) / Math.abs(a.landX)).toBeCloseTo(0.5, 4);
    for (const s of b.path) expect(Math.abs(norm(s.v) - 1e6)).toBeLessThan(1e-3);
  });

  it('has a period 2π m / (q B) that does not depend on the speed', () => {
    const B = intoPage(0.1);
    const T = cyclotronPeriod(M_PROTON, E_CHARGE, 0.1);
    const laps = [2e5, 1e6, 2e6, 5e6].map((v) => lapInField(M_PROTON, E_CHARGE, v, B).lap);
    for (const t of laps) expect(t / T).toBeCloseTo(1, 5);
    // and the laps agree with one another far better than with the formula
    for (const t of laps) expect(t / laps[0]).toBeCloseTo(1, 9);
    expect(T * 1e6).toBeCloseTo(0.656, 3); // 0.66 µs at 0.10 T
  });

  it('twice as fast: twice the circle, the same lap time', () => {
    const slow = lapInField(M_PROTON, E_CHARGE, 1e6, intoPage(0.1));
    const fast = lapInField(M_PROTON, E_CHARGE, 2e6, intoPage(0.1));
    expect(fast.diameter / slow.diameter).toBeCloseTo(2, 4);
    expect(fast.lap / slow.lap).toBeCloseTo(1, 8);
  });
});

describe('the spectrometer scene', () => {
  const v = 1e6;

  it('lands the proton 2r from the entrance, on the left, measured from the path', () => {
    const shot = spectrometerShot(M_PROTON, E_CHARGE, v, 0.1);
    expect(shot.landX).toBeLessThan(0);
    expect(-shot.landX / landingDistance(M_PROTON, v, E_CHARGE, 0.1)).toBeCloseTo(1, 4);
    expect(-shot.landX / CM).toBeCloseTo(20.9, 1); // the scene's starting field
    // half a lap, whatever the speed
    expect(shot.tLand / cyclotronPeriod(M_PROTON, E_CHARGE, 0.1)).toBeCloseTo(0.5, 2);
  });

  it('needs about 0.13 T to land in the slot 16 cm away', () => {
    const B = fieldToLandAt(M_PROTON, v, E_CHARGE, 16 * CM);
    expect(B).toBeCloseTo(0.1305, 4);
    const shot = spectrometerShot(M_PROTON, E_CHARGE, v, B);
    expect(-shot.landX / CM).toBeCloseTo(16, 2);
  });

  it('keeps the proton’s kinetic energy unchanged from gun to wall', () => {
    const shot = spectrometerShot(M_PROTON, E_CHARGE, v, 0.3);
    const k0 = 0.5 * M_PROTON * v * v;
    const k1 = 0.5 * M_PROTON * norm(shot.path[shot.path.length - 1].v) ** 2;
    expect(Math.abs(k1 - k0) / k0).toBeLessThan(1e-12);
  });
});

describe('crossed fields', () => {
  it('pass the speed E/B straight through and bend the others', () => {
    const B = intoPage(0.2);
    const E0 = 4e4;
    const vPass = selectorSpeed(E0, 0.2);
    // for a proton moving +x in B into the page, v × B points +y; E must point −y
    const run = (vx: number) => traceCharge({
      q: E_CHARGE, m: M_PROTON, x0: ZERO, v0: [vx, 0, 0], dt: 1e-10, maxSteps: 2000,
      fields: () => ({ E: [0, -E0, 0], B }),
    }).at(-1)!.x[1];
    expect(Math.abs(run(vPass))).toBeLessThan(1e-12);
    expect(run(vPass * 1.5)).toBeGreaterThan(1e-4);
    expect(run(vPass * 0.5)).toBeLessThan(-1e-4);
  });
});

/* Lesson 2 — "The coil that keeps turning" */

describe('the force on a wire', () => {
  it('is I L × B: current to the right in a field into the page is pushed up', () => {
    const F = wireForce(3, [0.2, 0, 0], intoPage(0.25));
    expect(F[1]).toBeCloseTo(3 * 0.2 * 0.25, 12);
    expect(F[0]).toBeCloseTo(0, 15);
    expect(wireForce(-3, [0.2, 0, 0], intoPage(0.25))[1]).toBeLessThan(0);
  });

  it('is the sum of q v × B over the drifting charges', () => {
    // n charges of q drifting at v_d in a length L: N q v_d = I L
    const q = E_CHARGE, vd = 2e-5, L = 0.2, I = 4;
    const count = (I * L) / (q * vd);
    const each = lorentzForce(q, [vd, 0, 0], intoPage(0.25));
    const F = wireForce(I, [L, 0, 0], intoPage(0.25));
    expect(each[1] * count).toBeCloseTo(F[1], 12);
  });

  it('floats the scene’s 20 g, 20 cm rod in 0.25 T at 3.9 A', () => {
    const I = floatCurrent(0.02, 0.2, 0.25);
    expect(I).toBeCloseTo(3.92, 2);
    expect(wireForce(I, [0.2, 0, 0], intoPage(0.25))[1]).toBeCloseTo(0.02 * G, 12);
  });
});

describe('the coil in a uniform field', () => {
  // the scene's coil: 20 turns, 2 A, 4 cm wide, 5 cm long, 0.5 T
  const N = 20, I = 2, w = 0.04, len = 0.05, B = 0.5, A = w * len;

  it('feels no net force at any angle', () => {
    for (let th = 0; th < 2 * Math.PI; th += 0.3) {
      expect(norm(loopSides(N, I, w, len, B, th).net)).toBeLessThan(1e-12);
    }
  });

  it('has a torque, summed from its sides, of N I A B sin θ that turns μ toward B', () => {
    for (let th = -3; th <= 3; th += 0.25) {
      const tz = loopSides(N, I, w, len, B, th).torque[2];
      expect(tz).toBeCloseTo(-loopTorque(N, I, A, B, th), 12);
    }
    expect(loopTorque(N, I, A, B, Math.PI / 2)).toBeCloseTo(0.04, 12);
    expect(dipoleMoment(N, I, A)).toBeCloseTo(0.08, 12);
  });

  it('is largest when the coil’s face is edge-on to the field (θ = 90°), zero when it faces it', () => {
    let best = 0, at = 0;
    for (let d = 0; d <= 180; d += 1) {
      const t = Math.abs(loopSides(N, I, w, len, B, (d * Math.PI) / 180).torque[2]);
      if (t > best) { best = t; at = d; }
    }
    expect(at).toBe(90);
    expect(Math.abs(loopSides(N, I, w, len, B, 0).torque[2])).toBeLessThan(1e-15);
  });

  it('pushes each long side with the same 1.0 N whatever the angle; only the lever arm changes', () => {
    for (const th of [0, 0.5, 1.2, 2]) {
      const s = loopSides(N, I, w, len, B, th).sides;
      expect(norm(s[0].F)).toBeCloseTo(1.0, 12);
      expect(norm(s[1].F)).toBeCloseTo(1.0, 12);
      expect(s[0].F[1]).toBeGreaterThan(0); // the side carrying current out of the page is pushed up
    }
  });

  it('rests stably at θ = 0 and balances unstably at θ = 180°', () => {
    const U = (th: number) => loopEnergy(N, I, A, B, th);
    expect(U(0.05)).toBeGreaterThan(U(0));
    expect(U(Math.PI + 0.05)).toBeLessThan(U(Math.PI));
    // nudged off 180°, the torque pushes it further away
    expect(-loopTorque(N, I, A, B, Math.PI + 0.05)).toBeGreaterThan(0);
  });
});

describe('the motor', () => {
  const p: MotorParams = { N: 20, I: 2, A: 0.002, B: 0.5, inertia: 2.4e-3, damping: 4e-3 };
  const dt = 1 / 600;

  it('with a fixed current only rocks about θ = 0, never completing a turn', () => {
    let s = { theta: Math.PI * 0.9, omega: 0, t: 0 };
    let maxAbs = 0;
    for (let i = 0; i < 20 * 600; i++) { s = motorStep(s, p, 1, dt); maxAbs = Math.max(maxAbs, Math.abs(s.theta)); }
    expect(maxAbs).toBeLessThan(Math.PI);
    expect(Math.abs(s.theta)).toBeLessThan(0.05);
  });

  it('keeps turning when the current is reversed at every dead point', () => {
    let s = { theta: -Math.PI / 2, omega: 0, t: 0 };
    for (let i = 0; i < 20 * 600; i++) s = motorStep(s, p, commutatorSign(s.theta), dt);
    expect(s.theta / (2 * Math.PI)).toBeGreaterThan(5);
  });

  it('brakes if the current is reversed a quarter turn early', () => {
    // flip at θ = kπ − π/2 instead of kπ: half of each half-turn is driven backward
    const early = (th: number) => commutatorSign(th + Math.PI / 2);
    let s = { theta: -Math.PI / 2, omega: 0, t: 0 };
    for (let i = 0; i < 20 * 600; i++) s = motorStep(s, p, early(s.theta), dt);
    expect(Math.abs(s.theta) / (2 * Math.PI)).toBeLessThan(1);
  });

  it('commutator sign drives the coil forward in every half turn', () => {
    for (let th = -7; th < 7; th += 0.1) {
      if (Math.abs(Math.sin(th)) < 1e-6) continue;
      const tau = -commutatorSign(th) * loopTorque(p.N, p.I, p.A, p.B, th);
      expect(tau).toBeGreaterThan(0);
    }
  });
});

it('cross is right-handed', () => {
  expect(cross([1, 0, 0], [0, 1, 0])).toEqual([0, 0, 1]);
});
