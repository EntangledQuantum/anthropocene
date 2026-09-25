/**
 * Claims made by chapter 9, "Rotation of Rigid Bodies", checked against the
 * code the TurntableBugs, SizeThePulley, PebbleInTheTyre, BeadsOnTheBar and
 * RollingRace scenes run.
 */
import { describe, expect, it } from 'vitest';
import { G_EARTH } from '../dynamics.ts';
import {
  BEAD_RIG, SHAPE_K, arcLength, beadBarI, beadBarMass, beadRadiusForTime, beltSpeed, discFromRings,
  distanceFromContact, drivenOmega, momentOfInertia, openBelt, piecewiseKE, pointMassesI, pulleyRadiusFor,
  ridingPoint, rigidVelocity, rollState, rollingAccel, rollingEnergySplit, rollingPointSpeed,
  rollingPointVelocity, rollingSpeedAfterDrop, rollingTime, rollingWheel, rotationalKE, rpmToRadPerSec,
  simulateRoll, spoolAccel, spoolDropTime, spoolState, tangentialSpeed, tieAngle, type Shape,
} from '../rotation.ts';

const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

/* ── lesson 1: one angle, every radius ────────────────────────────────── */

describe('every point on a rigid body shares one angle', () => {
  it('points at different radii sweep the same angle in the same time, but arcs in proportion to r', () => {
    const omega = rpmToRadPerSec(45);
    const t = 0.37;
    for (const [r1, r2] of [[0.05, 0.125], [0.02, 0.16]]) {
      const a = ridingPoint(r1, 0.3, omega, t), b = ridingPoint(r2, 0.3, omega, t);
      expect(Math.atan2(a[1], a[0])).toBeCloseTo(Math.atan2(b[1], b[0]), 12);
      expect(arcLength(r2, omega * t) / arcLength(r1, omega * t)).toBeCloseTo(r2 / r1, 12);
    }
  });

  it('the measured speed of a riding point is ωr, and its velocity is perpendicular to the radius', () => {
    const omega = rpmToRadPerSec(45), h = 1e-6;
    for (const r of [0.03, 0.05, 0.125, 0.16]) {
      const p0 = ridingPoint(r, 1.1, omega, 0), p1 = ridingPoint(r, 1.1, omega, h);
      const v = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) / h;
      expect(v).toBeCloseTo(tangentialSpeed(omega, r), 5);
      const w = rigidVelocity(p0, omega);
      expect(w[0] * p0[0] + w[1] * p0[1]).toBeCloseTo(0, 12);
    }
  });

  it('the turntable numbers in the lesson: 45 rpm, bug A at 5 cm moves at 0.24 m/s, and 0.59 m/s needs 12.5 cm', () => {
    const omega = rpmToRadPerSec(45);
    expect(omega).toBeCloseTo(4.712, 3);
    expect(tangentialSpeed(omega, 0.05)).toBeCloseTo(0.236, 3);
    expect(0.59 / omega).toBeCloseTo(0.125, 3);
    // 2.5 times as fast means 2.5 times as far out: the same ω
    expect(tangentialSpeed(omega, 0.125) / tangentialSpeed(omega, 0.05)).toBeCloseTo(2.5, 12);
  });
});

describe('a belt forces two rims to share one speed', () => {
  it('both rims move at the belt speed, so ω₁r₁ = ω₂r₂', () => {
    for (const [w1, r1, r2] of [[9.42, 0.04, 0.09], [3, 0.1, 0.02], [20, 0.05, 0.05]]) {
      const w2 = drivenOmega(w1, r1, r2);
      expect(tangentialSpeed(w2, r2)).toBeCloseTo(beltSpeed(w1, r1), 12);
    }
  });

  it('the lesson\'s drum: a 4 cm pulley at 90 rpm drives a 40 rpm drum only with a 9 cm pulley', () => {
    const r = pulleyRadiusFor(rpmToRadPerSec(90), 0.04, rpmToRadPerSec(40));
    expect(r).toBeCloseTo(0.09, 12);
    // a bigger pulley turns slower
    expect(drivenOmega(1, 0.04, 0.12)).toBeLessThan(drivenOmega(1, 0.04, 0.06));
  });

  it('the belt runs are tangent to both pulleys', () => {
    const b = openBelt(0.04, 0.09, 0.34);
    const dir: [number, number] = [b.top2[0] - b.top1[0], b.top2[1] - b.top1[1]];
    expect(dir[0] * b.top1[0] + dir[1] * b.top1[1]).toBeCloseTo(0, 12);
    expect(dir[0] * (b.top2[0] - 0.34) + dir[1] * b.top2[1]).toBeCloseTo(0, 12);
    expect(Math.hypot(b.top1[0], b.top1[1])).toBeCloseTo(0.04, 12);
    expect(Math.hypot(b.top2[0] - 0.34, b.top2[1])).toBeCloseTo(0.09, 12);
  });
});

describe('the rolling wheel: the road is a belt that does not move', () => {
  const v = 5, R = 0.33;

  it('the contact point is at rest and the top moves at twice the bike\'s speed, whatever the wheel size', () => {
    for (const r of [0.2, 0.33, 0.7]) {
      const bottom = rollingPointVelocity(v, r, -Math.PI / 2);
      expect(Math.hypot(bottom[0], bottom[1])).toBeCloseTo(0, 12);
      expect(rollingPointSpeed(v, r, Math.PI / 2)).toBeCloseTo(2 * v, 12);
    }
  });

  it('level with the axle the pebble moves at √2 × the bike, about 7.1 m/s', () => {
    expect(rollingPointSpeed(v, R, 0)).toBeCloseTo(7.071, 3);
    expect(rollingPointSpeed(v, R, Math.PI)).toBeCloseTo(7.071, 3);
  });

  it('the pebble moves at exactly the bike\'s speed at half the axle height, one radius from the contact point', () => {
    for (const a of [rad(-30), rad(-150)]) {
      expect(rollingPointSpeed(v, R, a)).toBeCloseTo(v, 12);
      expect(distanceFromContact(R, a)).toBeCloseTo(R, 12);
      expect(R + R * Math.sin(a)).toBeCloseTo(R / 2, 12);
    }
  });

  it('every rim point moves as if the wheel pivoted about the contact point: speed = ω × distance', () => {
    for (let a = -Math.PI; a < Math.PI; a += 0.1) {
      expect(rollingPointSpeed(v, R, a)).toBeCloseTo((v / R) * distanceFromContact(R, a), 10);
    }
  });

  it('the formula matches the animated pebble, differentiated numerically', () => {
    const h = 1e-6;
    for (const t of [0.01, 0.1, 0.23]) {
      const p0 = rollingWheel(0, -Math.PI / 2, v, R, t), p1 = rollingWheel(0, -Math.PI / 2, v, R, t + h);
      const measured = Math.hypot(p1.point[0] - p0.point[0], p1.point[1] - p0.point[1]) / h;
      expect(measured).toBeCloseTo(rollingPointSpeed(v, R, p0.a), 4);
    }
    // after one turn the axle has moved one circumference: the rim unrolled onto the road
    const turn = (2 * Math.PI * R) / v;
    expect(rollingWheel(0, 0, v, R, turn).axle[0]).toBeCloseTo(2 * Math.PI * R, 12);
  });
});

/* ── lesson 2: where the mass sits ────────────────────────────────────── */

describe('moment of inertia is where the mass sits', () => {
  it('a hoop is ring upon ring at radius R, and a disc built from rings converges to ½ m R²', () => {
    expect(pointMassesI(Array.from({ length: 360 }, () => ({ m: 2 / 360, r: 0.3 })))).toBeCloseTo(momentOfInertia('hoop', 2, 0.3), 12);
    const exact = momentOfInertia('disc', 2, 0.3);
    const e10 = Math.abs(discFromRings(2, 0.3, 10) - exact), e100 = Math.abs(discFromRings(2, 0.3, 100) - exact);
    expect(e100).toBeLessThan(e10 / 50);
    expect(discFromRings(2, 0.3, 2000)).toBeCloseTo(exact, 6);
  });

  it('the same beads farther out: doubling the distance quadruples their share of I', () => {
    const beads = (r: number) => pointMassesI([{ m: 0.25, r }, { m: 0.25, r }]);
    expect(beads(0.2) / beads(0.1)).toBeCloseTo(4, 12);
  });

  it('a light hoop can out-stubborn a heavier disc of the same size', () => {
    expect(momentOfInertia('hoop', 1, 0.1)).toBeGreaterThan(momentOfInertia('disc', 1.8, 0.1));
  });

  it('½Iω² is the sum of ½mv² over the pieces, each at its own v = ωr', () => {
    const pts = [{ m: 0.25, r: 0.12 }, { m: 0.25, r: 0.12 }, { m: 0.4, r: 0.03 }];
    expect(rotationalKE(pointMassesI(pts), 13)).toBeCloseTo(piecewiseKE(pts, 13), 12);
  });
});

describe('the bead bar', () => {
  const rig = BEAD_RIG;

  it('moving the beads never changes the mass on the bar, only I', () => {
    expect(beadBarMass(rig)).toBeCloseTo(0.6, 12);
    expect(beadBarI(rig, 0.2)).toBeGreaterThan(beadBarI(rig, 0.05));
  });

  it('the lesson\'s numbers: beads at the hub land in about 1.55 s; 3.0 s needs them near 12.4 cm out', () => {
    expect(spoolDropTime(rig, 0.03)).toBeCloseTo(1.55, 2);
    const r = beadRadiusForTime(rig, 3);
    expect(r).toBeGreaterThan(0.12);
    expect(r).toBeLessThan(0.13);
    expect(spoolDropTime(rig, r)).toBeCloseTo(3, 9);
    // doubling the bead distance from 6 cm does not double the time: I grows as r², t as roughly r
    expect(spoolDropTime(rig, 0.12) / spoolDropTime(rig, 0.06)).toBeLessThan(2);
  });

  it('the farther out the beads, the longer the fall: monotone over the whole bar', () => {
    let last = 0;
    for (let r = 0.03; r <= 0.25; r += 0.01) {
      const t = spoolDropTime(rig, r);
      expect(t).toBeGreaterThan(last);
      last = t;
    }
  });

  it('energy is shared: at landing m g h = ½ m v² + ½ I ω² with ω = v / r_s', () => {
    for (const r of [0.03, 0.124, 0.24]) {
      const a = spoolAccel(rig, r), tL = spoolDropTime(rig, r);
      const v = a * tL, omega = v / rig.spoolR;
      expect(0.5 * rig.weight * v * v + rotationalKE(beadBarI(rig, r), omega)).toBeCloseTo(rig.weight * G_EARTH * rig.drop, 10);
      const after = spoolState(rig, r, tL + 1);
      expect(after.landed).toBe(true);
      expect(after.omega).toBeCloseTo(omega, 10);
    }
  });
});

describe('the rolling race', () => {
  const shapes: Shape[] = ['sliding-block', 'solid-sphere', 'disc', 'hollow-sphere', 'hoop'];

  it('a hoop always loses to a disc, whatever their masses and radii', () => {
    for (const [mh, Rh, md, Rd] of [[1, 0.1, 1, 0.1], [10, 0.5, 0.1, 0.02], [0.05, 0.01, 30, 1.2]]) {
      const th = rad(12);
      const hoop = simulateRoll(SHAPE_K.hoop, mh, Rh, th, 2);
      const disc = simulateRoll(SHAPE_K.disc, md, Rd, th, 2);
      expect(hoop.t).toBeGreaterThan(disc.t);
    }
  });

  it('mass and radius cancel: the simulated roll matches g sinθ / (1 + k) for every size', () => {
    const th = rad(12);
    for (const s of shapes) for (const [m, R] of [[1, 0.1], [7, 0.4], [0.2, 0.03]]) {
      expect(simulateRoll(SHAPE_K[s], m, R, th, 2).t).toBeCloseTo(rollingTime(SHAPE_K[s], th, 2), 3);
    }
    // the lesson's race: disc 1.71 s, hoop 1.98 s on a 2 m, 12° ramp
    expect(rollingTime(SHAPE_K.disc, th, 2)).toBeCloseTo(1.715, 3);
    expect(rollingTime(SHAPE_K.hoop, th, 2)).toBeCloseTo(1.980, 3);
  });

  it('arrival order: block, solid ball, disc, hollow ball, hoop', () => {
    const times = shapes.map((s) => rollingTime(SHAPE_K[s], rad(12), 2));
    for (let i = 1; i < times.length; i++) expect(times[i]).toBeGreaterThan(times[i - 1]);
  });

  it('static friction does no work on a rolling body: all of m g h is still there at the bottom', () => {
    for (const s of ['hoop', 'disc', 'solid-sphere'] as Shape[]) {
      const run = simulateRoll(SHAPE_K[s], 1, 0.1, rad(12), 2);
      expect(run.friction).toBeGreaterThan(0);          // friction is really pushing…
      expect(Math.abs(run.frictionWork)).toBeLessThan(1e-9); // …on a point that is not moving
      expect(run.energy / run.supplied).toBeCloseTo(1, 3);
    }
  });

  it('the hoop keeps half its energy in the spin, the disc a third', () => {
    expect(rollingEnergySplit(SHAPE_K.hoop).spinning).toBeCloseTo(1 / 2, 12);
    expect(rollingEnergySplit(SHAPE_K.disc).spinning).toBeCloseTo(1 / 3, 12);
    const st = rollState(SHAPE_K.hoop, rad(12), 2, 1, 1, 0.1);
    expect(st.spinning / (st.moving + st.spinning)).toBeCloseTo(0.5, 12);
    expect(st.moving + st.spinning).toBeCloseTo(st.supplied, 10);
    // same drop, same energy, less speed
    expect(rollingSpeedAfterDrop(1, 0.4)).toBeLessThan(rollingSpeedAfterDrop(0.5, 0.4));
  });

  it('the hoop ties the disc when its 2 m ramp is tilted to about 16.1° against the disc\'s 12°', () => {
    const th = tieAngle(SHAPE_K.hoop, SHAPE_K.disc, rad(12));
    expect(deg(th)).toBeCloseTo(16.09, 2);
    expect(rollingTime(SHAPE_K.hoop, th, 2)).toBeCloseTo(rollingTime(SHAPE_K.disc, rad(12), 2), 12);
    expect(rollingAccel(SHAPE_K.hoop, th)).toBeCloseTo(rollingAccel(SHAPE_K.disc, rad(12)), 12);
  });
});
