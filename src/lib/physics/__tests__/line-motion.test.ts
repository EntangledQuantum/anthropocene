/**
 * Claims made by chapter 2, Motion Along a Straight Line, checked against the
 * same code its scenes run (`line-motion.ts`, on top of `kinematics.ts`).
 */
import { describe, expect, it } from 'vitest';
import { accumulate, constantAccel, turningPoints } from '../kinematics.ts';
import {
  FLOOR_M, G, LEVER_VMAX, SHAFT_TOP, apexHeight, brakeOutcome, brakeRun, ceilingOutcome, dragFallAccel,
  floorHeight, launchSpeedFor, leverVelocity, liftTrip, piecewiseTrip, recentVelocity, recordedTrip,
  speedAfter, stepHeight, stoppingDistance, throwState, timeToApex, tripExtremes, worldlineGap,
} from '../line-motion.ts';

const grid = (t1: number, n = 2001) => Array.from({ length: n }, (_, i) => (i * t1) / (n - 1));

describe('lesson 1: the lever holds velocity, the height piles up', () => {
  it('full lever up then eased back through the middle: highest exactly where v crosses zero, not where it is largest', () => {
    // Full up for 3 s, then a steady ease from +3 to -3 m/s over the next 6 s.
    const t = grid(9);
    const v = t.map((s) => (s < 3 ? LEVER_VMAX : LEVER_VMAX * (1 - (s - 3) / 3)));
    const { y } = liftTrip(t, v);
    const iHigh = y.indexOf(Math.max(...y));
    expect(t[iHigh]).toBeCloseTo(6, 1); // lever passes the middle at t = 6 s
    expect(turningPoints(t, v)[0]).toBeCloseTo(6, 2);
    // At t = 3 s (fastest) it is still well below its highest point.
    expect(y[t.findIndex((s) => s >= 3)]).toBeLessThan(y[iHigh] - 4);
  });

  it('frame-by-frame accumulation in the scene matches the whole-trip integral', () => {
    const t = grid(10, 601);
    const v = t.map((s) => leverVelocity(Math.sin(s)));
    let y = 0;
    for (let i = 1; i < t.length; i++) y = stepHeight(y, v[i - 1], v[i], t[i] - t[i - 1], 1e9);
    expect(y).toBeCloseTo(accumulate(t, v, 0)[t.length - 1], 9);
  });

  it('the lever has a detent: small deflections are a stop, full is one floor per second', () => {
    expect(leverVelocity(0.03)).toBe(0);
    expect(leverVelocity(1)).toBe(FLOOR_M);
    expect(leverVelocity(-2)).toBe(-LEVER_VMAX);
  });

  it('the shaft has a floor and a roof', () => {
    expect(stepHeight(0.1, -3, -3, 1)).toBe(0);
    expect(stepHeight(SHAFT_TOP - 0.1, 3, 3, 1)).toBe(SHAFT_TOP);
  });

  it('up to floor 6 then parked at floor 2: 30 m of cable, 6 m of displacement', () => {
    // 6 s up at full lever, 4 s down at full lever.
    const t = grid(10);
    const v = t.map((s) => (s < 6 ? 3 : -3));
    const trip = liftTrip(t, v);
    expect(trip.climb).toBeCloseTo(floorHeight(2), 1);
    expect(trip.cable).toBeCloseTo(30, 1);
  });
});

describe('lesson 1: two answers to "how far"', () => {
  // Each motion as a signed velocity history; ranked by distance, then by displacement.
  const trip = (legs: number[]) => {
    const t: number[] = [], v: number[] = [];
    let clock = 0;
    for (const d of legs) {
      for (let i = 0; i <= 200; i++) { t.push(clock + (Math.abs(d) * i) / 200); v.push(Math.sign(d)); }
      clock += Math.abs(d);
    }
    const { climb, cable } = liftTrip(t, v);
    return { distance: cable, displacement: climb };
  };
  const all = {
    lift: trip([21, -15]), sprint: trip([60]), dog: trip([50, -30]), swim: trip([25, -25, 25, -25]),
  };
  it('ranked by ground covered: lift 36, sprint 60, dog 80, swim 100', () => {
    const order = Object.entries(all).sort((p, q) => p[1].distance - q[1].distance).map(([k]) => k);
    expect(order).toEqual(['lift', 'sprint', 'dog', 'swim']);
    expect(all.lift.distance).toBeCloseTo(36, 6);
    expect(all.swim.distance).toBeCloseTo(100, 6);
  });
  it('ranked by displacement the order nearly reverses: swim 0, lift 6, dog 20, sprint 60', () => {
    const order = Object.entries(all).sort((p, q) => p[1].displacement - q[1].displacement).map(([k]) => k);
    expect(order).toEqual(['swim', 'lift', 'dog', 'sprint']);
    expect(all.swim.displacement).toBeCloseTo(0, 6);
  });
});

describe('lesson 1: holding the car writes the worldline', () => {
  const target = piecewiseTrip([[0, 1], [2, 1], [5, 6], [7, 6], [10, 3]]);

  it('the target trip parks, climbs at 5 m/s, parks, and descends at 3 m/s', () => {
    expect(target(1)).toBe(3);
    expect((target(4) - target(3)) / 1).toBeCloseTo(5, 9);
    expect(target(6)).toBe(18);
    expect((target(9) - target(8)) / 1).toBeCloseTo(-3, 9);
    expect(target(10)).toBe(9);
  });

  it('acting it out exactly scores zero; lagging one second behind is caught', () => {
    const exact = grid(10, 301).map((t) => ({ t, y: target(t) }));
    expect(worldlineGap(exact, target).rms).toBeLessThan(1e-12);
    const late = grid(10, 301).map((t) => ({ t, y: target(t - 1) }));
    const gap = worldlineGap(late, target);
    expect(gap.rms).toBeGreaterThan(1.5);
    expect(gap.worst.gap).toBeCloseTo(5, 1); // one second behind a 5 m/s climb
  });

  it('the speed read off the recent trace is its slope', () => {
    const run = grid(2, 121).map((t) => ({ t, y: 3 + 2.5 * t }));
    expect(recentVelocity(run)).toBeCloseTo(2.5, 9);
  });
});

describe('lesson 1: fastest is not highest', () => {
  const trip = recordedTrip();
  const { fast, high, vAtHigh } = tripExtremes(trip);

  it('the recorded trip is fastest early in the climb and highest at t = 9 s', () => {
    expect(fast.t).toBeGreaterThan(1);
    expect(fast.t).toBeLessThan(3.5);
    expect(fast.v).toBeGreaterThan(4);
    expect(high.t).toBeCloseTo(9, 1);
    expect(high.y).toBeCloseTo(19.5, 1);
  });

  it('at its highest point the tangent is flat', () => {
    expect(Math.abs(vAtHigh)).toBeLessThan(1e-9);
  });

  it('coming down is slower than the fastest climb', () => {
    for (let t = 9; t <= 14; t += 0.1) expect(Math.abs(trip.slopeAt(t))).toBeLessThan(fast.v * 0.5);
  });
});

describe('lesson 2: braking distance grows with the square of speed', () => {
  const a = 7.5;

  it('15 m/s stops in 15 m; 30 m/s needs 60 m, four times as far', () => {
    expect(stoppingDistance(15, a)).toBeCloseTo(15, 12);
    expect(stoppingDistance(30, a)).toBeCloseTo(60, 12);
  });

  it('braking where the slow car could stop, the fast car crosses the line at 26 m/s', () => {
    const out = brakeOutcome(30, a, 75, 90); // 15 m before a line at 90 m
    expect(out.gap).toBeLessThan(0);
    expect(out.crossSpeed).toBeCloseTo(Math.sqrt(675), 9);
    expect(out.crossSpeed).toBeGreaterThan(25.9);
  });

  it('the first half of the stopping distance removes less than a third of the speed', () => {
    expect(speedAfter(30, a, 30)).toBeCloseTo(21.21, 2);
  });

  it('at 25 m/s the car needs 41.7 m, which is (25/15)^2 of the 15 m stop', () => {
    expect(stoppingDistance(25, a)).toBeCloseTo(15 * (25 / 15) ** 2, 12);
    expect(stoppingDistance(25, a)).toBeCloseTo(41.67, 2);
  });

  it('in the graded scene, a post 42 m before the line stops the car 0.3 m short; 41.5 m crosses it', () => {
    expect(brakeOutcome(25, a, 90 - 42, 90).gap).toBeCloseTo(0.33, 2);
    expect(brakeOutcome(25, a, 90 - 41.5, 90).gap).toBeLessThan(0);
    // the linear guess, 25 m, blows through the line
    expect(brakeOutcome(25, a, 90 - 25, 90).crossSpeed).toBeGreaterThan(15);
  });

  it('the stepped car in the scene agrees with the formula', () => {
    const run = brakeRun(25, a, 20);
    expect(run.at(run.tStop + 1).x).toBeCloseTo(20 + 41.667, 2);
    expect(run.at(run.tStop + 1).v).toBeCloseTo(0, 12);
    // v(t) is a straight line while braking: constant slope -a.
    const v1 = run.at(run.tBrake + 1).v, v2 = run.at(run.tBrake + 2).v;
    expect(v1 - v2).toBeCloseTo(a, 12);
  });

  it('the stop is the triangle under v(t)', () => {
    const t = grid(25 / a, 4001);
    const v = t.map((s) => 25 - a * s);
    expect(accumulate(t, v, 0)[t.length - 1]).toBeCloseTo(stoppingDistance(25, a), 6);
  });
});

describe('lesson 2: a ball thrown up', () => {
  it('at the top the velocity is zero and the acceleration is still g downward', () => {
    const v0 = 12;
    const top = throwState(v0, timeToApex(v0));
    expect(top.v).toBeCloseTo(0, 12);
    expect(top.a).toBe(-G);
    // Measured, not declared: the slope of v(t) either side of the top.
    const h = 1e-3;
    const slope = (throwState(v0, timeToApex(v0) + h).v - throwState(v0, timeToApex(v0) - h).v) / (2 * h);
    expect(slope).toBeCloseTo(-G, 9);
  });

  it('matches the constant-acceleration position of kinematics.ts', () => {
    const x = constantAccel(0, 12, -G);
    expect(throwState(12, 0.8).y).toBeCloseTo(x(0.8), 12);
  });

  it('7 m/s peaks at 2.5 m; four times the height needs twice the speed, 14 m/s', () => {
    expect(apexHeight(7)).toBeCloseTo(2.5, 2);
    expect(launchSpeedFor(10)).toBeCloseTo(14.0, 1);
    expect(apexHeight(14)).toBeCloseTo(4 * apexHeight(7), 9);
  });

  it('the linear guess, 28 m/s, hits a 10 m ceiling still rising at 24 m/s', () => {
    const out = ceilingOutcome(28, 10);
    expect(out.reaches).toBe(true);
    expect(out.hitSpeed).toBeCloseTo(24.2, 1);
  });

  it('the turn does not break constant acceleration: up and down take equal times', () => {
    const v0 = 10;
    const tLand = (2 * v0) / G;
    expect(throwState(v0, tLand).y).toBeCloseTo(0, 12);
    expect(throwState(v0, tLand).v).toBeCloseTo(-v0, 12);
  });
});

describe('lesson 2: where constant acceleration fails', () => {
  it('a falling body with air drag: acceleration starts at g and dies toward zero', () => {
    const hist = dragFallAccel(0.004, 30);
    expect(hist[0].a).toBeCloseTo(G, 12);
    expect(hist[hist.length - 1].a).toBeLessThan(0.05);
    expect(hist[hist.length - 1].v).toBeCloseTo(Math.sqrt(G / 0.004), 0);
  });
});
