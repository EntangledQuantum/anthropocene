/**
 * Claims made by "Friction answers back" (chapter 5, lesson 1), checked
 * against the same stepping the PullUntilSlip and TiltUntilSlip scenes run.
 */
import { describe, expect, it } from 'vitest';
import { crateInTruck, glideAngle, level, ramp, readBlock, slideStep, slipAngle, type SlideState } from '../friction.ts';
import { G_EARTH } from '../dynamics.ts';

const DT = 1 / 240;
const deg = (r: number) => (r * 180) / Math.PI;

describe('static friction matches the pull, up to a ceiling', () => {
  const floor = level(0.5, 0.35);

  it('a 5 N pull on a resting 4 kg crate meets exactly 5 N of friction, not μ_s N', () => {
    const r = readBlock(4, floor, 5, 0);
    expect(r.stuck).toBe(true);
    expect(r.friction).toBeCloseTo(-5, 12);
    expect(r.ceiling).toBeCloseTo(0.5 * 4 * G_EARTH, 12);
  });

  it('with no pull there is no friction at all', () => {
    expect(readBlock(4, floor, 0, 0).friction).toBeCloseTo(0, 12);
  });

  it('friction tracks the pull all the way to μ_s N', () => {
    for (const pull of [2, 8, 15, 19.5]) {
      const r = readBlock(4, floor, pull, 0);
      expect(r.stuck).toBe(true);
      expect(r.friction).toBeCloseTo(-pull, 12);
    }
  });

  it('a slowly rising pull breaks the 6 kg crate free at μ_s m g ≈ 23.5 N, and friction drops to μ_k N', () => {
    const surf = level(0.4, 0.3);
    const st: SlideState = { s: 0, v: 0 };
    let pull = 0, broke = -1, afterFriction = 0;
    for (let i = 0; i < 240 * 60; i++) {
      pull += 0.5 * DT;
      const r = slideStep(st, 6, surf, pull, DT);
      if (broke < 0 && st.v > 0) { broke = pull; afterFriction = r.friction; break; }
    }
    expect(broke).toBeCloseTo(0.4 * 6 * G_EARTH, 1);
    expect(afterFriction).toBeCloseTo(-0.3 * 6 * G_EARTH, 9);
  });

  it('a sliding crate whose pull falls below μ_k N stops dead and then holds, with no chatter', () => {
    const surf = level(0.4, 0.3);
    const st: SlideState = { s: 0, v: 2 };
    for (let i = 0; i < 240 * 5; i++) slideStep(st, 6, surf, 10, DT);
    expect(st.v).toBe(0);
    const s = st.s;
    for (let i = 0; i < 240; i++) slideStep(st, 6, surf, 20, DT);
    expect(st.v).toBe(0);
    expect(st.s).toBe(s);
  });
});

describe('the ramp: slip angle', () => {
  const sweep = (mass: number, muS: number, muK: number) => {
    const st: SlideState = { s: 0, v: 0 };
    for (let d = 10; d < 60; d += 0.01) {
      slideStep(st, mass, ramp(d, muS, muK), 0, DT);
      if (st.v !== 0) return d;
    }
    return NaN;
  };

  it('a 2 kg block with μ_s = 0.6 slips at tan⁻¹ 0.6 ≈ 31.0°', () => {
    expect(deg(slipAngle(0.6))).toBeCloseTo(30.96, 2);
    expect(sweep(2, 0.6, 0.4)).toBeCloseTo(30.96, 1);
  });

  it('an 8 kg block on the same ramp slips at the same angle: the mass cancels', () => {
    expect(Math.abs(sweep(8, 0.6, 0.4) - sweep(2, 0.6, 0.4))).toBeLessThan(0.02);
  });

  it('on a ramp the normal force is mg cos θ and gravity pulls down the slope with mg sin θ', () => {
    const th = (25 * Math.PI) / 180;
    const r = readBlock(2, ramp(25, 0.6, 0.4), 0, 0);
    expect(r.normal).toBeCloseTo(2 * G_EARTH * Math.cos(th), 9);
    expect(r.drive).toBeCloseTo(-2 * G_EARTH * Math.sin(th), 9);
    expect(r.friction).toBeCloseTo(2 * G_EARTH * Math.sin(th), 9); // up the slope, matching
  });

  it('as the ramp rises friction grows while its ceiling shrinks', () => {
    const a = readBlock(2, ramp(10, 0.6, 0.4), 0, 0), b = readBlock(2, ramp(28, 0.6, 0.4), 0, 0);
    expect(b.friction).toBeGreaterThan(a.friction);
    expect(b.ceiling).toBeLessThan(a.ceiling);
  });
});

describe('once it moves, a different model', () => {
  const slidingAt = (d: number, seconds: number) => {
    const st: SlideState = { s: 0, v: -1 }; // already sliding downhill at 1 m/s
    let a = 0;
    for (let i = 0; i < 240 * seconds; i++) a = slideStep(st, 2, ramp(d, 0.6, 0.4), 0, DT).accel;
    return { v: st.v, a };
  };

  it('glide angle is tan⁻¹ μ_k ≈ 21.8°, well below the 31° slip angle', () => {
    expect(deg(glideAngle(0.4))).toBeCloseTo(21.8, 1);
    expect(glideAngle(0.4)).toBeLessThan(slipAngle(0.6));
  });

  it('at 25° — too shallow to start it — a sliding block keeps speeding up', () => {
    const r = slidingAt(25, 2);
    expect(r.v).toBeLessThan(-1.5);
    expect(r.a).toBeLessThan(0);
  });

  it('at the glide angle a sliding block keeps a steady speed', () => {
    const r = slidingAt(deg(glideAngle(0.4)), 3);
    expect(r.v).toBeCloseTo(-1, 9);
    expect(Math.abs(r.a)).toBeLessThan(1e-9);
  });

  it('below the glide angle it slows, stops, and then holds even at 30°', () => {
    expect(slidingAt(19, 3).v).toBe(0);
    const st: SlideState = { s: 0, v: 0 };
    slideStep(st, 2, ramp(30, 0.6, 0.4), 0, DT);
    expect(st.v).toBe(0);
  });
});

describe('friction can point along the motion', () => {
  it('a crate carried by an accelerating truck is pushed FORWARD by friction, and holds up to μ_s g', () => {
    const r = crateInTruck(50, 2, 0.4);
    expect(r.friction).toBeGreaterThan(0);
    expect(r.holds).toBe(true);
    expect(crateInTruck(50, 0.4 * G_EARTH + 0.01, 0.4).holds).toBe(false);
  });
});
