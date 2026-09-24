/**
 * Claims made by "Nothing is called centripetal" (chapter 5, lesson 2),
 * checked against the functions the SwingTheBucket and BankTheCurve scenes use.
 */
import { describe, expect, it } from 'vitest';
import { G_EARTH } from '../dynamics.ts';
import { bankedRoad, bucketForce, bucketPush, idealBank, minTopSpeed, releaseBeforeTop, swingOnce } from '../circular.ts';

const deg = (r: number) => (r * 180) / Math.PI;
const rad = (d: number) => (d * Math.PI) / 180;

describe('the bucket at the top', () => {
  it('at the top the bottom pushes DOWN with m(v²/R − g): both forces point at the centre', () => {
    expect(bucketPush(1, 4, 1, 0)).toBeCloseTo(16 - G_EARTH, 12);
    expect(bucketPush(1, 4, 1, 0)).toBeGreaterThan(0);
  });

  it('the slowest speed on a 1 m circle is √(gR) ≈ 3.13 m/s, whatever the mass of water', () => {
    expect(minTopSpeed(1)).toBeCloseTo(3.132, 3);
    for (const m of [0.2, 1, 5]) expect(bucketPush(m, minTopSpeed(1), 1, 0)).toBeCloseTo(0, 9);
  });

  it('at √(gR) and above, the water stays in for three full turns', () => {
    expect(swingOnce(minTopSpeed(1), 1, 3).releasePsi).toBeNull();
    expect(swingOnce(4, 1, 3).releasePsi).toBeNull();
  });

  it('a little slower and the water leaves just BEFORE the top, where cos φ = v²/(gR)', () => {
    const v = 0.97 * minTopSpeed(1);
    const run = swingOnce(v, 1, 1);
    expect(run.releasePsi).not.toBeNull();
    const before = Math.PI / 2 - run.releasePsi!;
    expect(before).toBeGreaterThan(0);
    expect(before).toBeCloseTo(releaseBeforeTop(v, 1)!, 2);
  });

  it('once released the water falls INSIDE the circle, away from the bucket bottom', () => {
    const run = swingOnce(2.5, 1, 1);
    expect(run.waterRadius.length).toBeGreaterThan(0);
    for (const r of run.waterRadius) expect(r).toBeLessThan(1);
  });

  it('weight plus the bucket\'s whole push is m·a, and its inward part is bucketPush, all the way round', () => {
    for (const psi of [-1.4, -0.3, 0.6, 1.57, 2.8]) {
      const f = bucketForce(1, 4, 1, psi);
      const net = [f[0], f[1] - G_EARTH];
      expect(net[0]).toBeCloseTo(-16 * Math.cos(psi), 9);
      expect(net[1]).toBeCloseTo(-16 * Math.sin(psi), 9);
      const inward = -(f[0] * Math.cos(psi) + f[1] * Math.sin(psi));
      expect(inward).toBeCloseTo(bucketPush(1, 4, 1, psi - Math.PI / 2), 9);
    }
  });

  it('at the bottom the same bucket pushes up with m(v²/R + g): twice the weight at the slowest speed', () => {
    expect(bucketPush(1, minTopSpeed(1), 1, Math.PI)).toBeCloseTo(2 * G_EARTH, 9);
  });
});

describe('the banked bend', () => {
  const m = 1200, v = 15, R = 50;

  it('at 15 m/s on a 50 m bend the ideal bank is tan⁻¹(v²/gR) ≈ 24.6°, and needs no friction', () => {
    const th = idealBank(v, R);
    expect(deg(th)).toBeCloseTo(24.64, 1);
    expect(bankedRoad(m, v, R, th).friction).toBeCloseTo(0, 6);
  });

  it('on the ideal bank the normal force alone turns the car, and it exceeds the weight', () => {
    const th = idealBank(v, R);
    const r = bankedRoad(m, v, R, th);
    expect(r.normal).toBeCloseTo((m * G_EARTH) / Math.cos(th), 6);
    expect(r.normal * Math.sin(th)).toBeCloseTo(m * r.accel, 6); // its inward component is m v²/R
  });

  it('on a flat road friction does all of it: m v²/R, toward the centre', () => {
    const r = bankedRoad(m, v, R, 0);
    expect(r.friction).toBeCloseTo(-m * (v * v) / R, 6);
  });

  it('under-banked, friction points down the slope; the same bank at 5 m/s needs it UP the slope', () => {
    expect(bankedRoad(m, v, R, rad(15)).friction).toBeLessThan(0);
    const slow = bankedRoad(m, 5, R, idealBank(v, R));
    expect(slow.friction).toBeGreaterThan(0);
  });

  it('the ideal bank does not depend on the mass of the car', () => {
    const th = idealBank(v, R);
    expect(bankedRoad(300, v, R, th).friction).toBeCloseTo(0, 6);
    expect(bankedRoad(40000, v, R, th).friction).toBeCloseTo(0, 5);
  });
});
