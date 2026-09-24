/**
 * Claims made by chapter 3's two lessons, checked against the same functions
 * the scenes run: SteerTheBend, LetGoOfTheString, OffTheTableEdge and
 * AimAtTheFallingCan.
 */
import { describe, expect, it } from 'vitest';
import {
  aimStraightAt,
  afterRelease,
  driveBend,
  holdingAccel,
  offCentreline,
  offTheTable,
  releaseAngleFor,
  releaseMiss,
  shootAtCan,
  whirl,
  type Bend,
} from '../motion-ch03.ts';
import { BALLS, ballDrag, terminalSpeed } from '../motion2d.ts';

const BEND: Bend = { radius: 25, laneHalf: 2, exit: 12 };
const DEG = Math.PI / 180;

describe('lesson 1: steering is sideways acceleration', () => {
  it('a sideways 4 m/s² holds the 25 m bend at 10 m/s, and the speed never moves', () => {
    expect(holdingAccel(10, 25)).toBeCloseTo(4, 12);
    const run = driveBend({ speed: 10, along: 0, across: 4, bend: BEND });
    expect(run.outcome).toBe('held');
    let worst = 0;
    for (const p of run.path) {
      expect(Math.hypot(p.vx, p.vy)).toBeCloseTo(10, 6);
      worst = Math.max(worst, Math.abs(offCentreline(BEND, p.x, p.y)));
    }
    expect(worst).toBeLessThan(0.05);
  });

  it('at twice the speed the arrow must be four times as long, not twice', () => {
    expect(driveBend({ speed: 20, along: 0, across: 4, bend: BEND }).outcome).toBe('outside');
    const doubled = driveBend({ speed: 20, along: 0, across: 8, bend: BEND });
    expect(doubled.outcome).toBe('outside');
    expect(doubled.circleRadius).toBeCloseTo(50, 9);
    expect(driveBend({ speed: 20, along: 0, across: 16, bend: BEND }).outcome).toBe('held');
    // Too much steering cuts inside.
    expect(driveBend({ speed: 20, along: 0, across: 24, bend: BEND }).outcome).toBe('inside');
  });

  it('the window that holds the bend at 20 m/s is narrow and brackets v²/R', () => {
    const held = [];
    for (let a = 12; a <= 20; a += 0.1) {
      if (driveBend({ speed: 20, along: 0, across: a, bend: BEND }).outcome === 'held') held.push(a);
    }
    expect(Math.min(...held)).toBeGreaterThan(14.5);
    expect(Math.max(...held)).toBeLessThan(17.5);
    expect(Math.min(...held)).toBeLessThan(16);
    expect(Math.max(...held)).toBeGreaterThan(16);
  });

  it('an arrow pointing out of the bend turns the car the wrong way', () => {
    const run = driveBend({ speed: 10, along: 0, across: -4, bend: BEND });
    expect(run.outcome).toBe('outside');
    expect(run.path[run.path.length - 1].x).toBeGreaterThan(0);
  });

  it('leaning the same 4 m/s² arrow 30° forward speeds the car up and runs it wide', () => {
    const along = 4 * Math.sin(30 * DEG), across = 4 * Math.cos(30 * DEG);
    const run = driveBend({ speed: 10, along, across, bend: BEND });
    expect(run.outcome).toBe('outside');
    expect(run.endSpeed).toBeGreaterThan(12.5);
    // Leaning it back instead slows the car and pulls it inside.
    const back = driveBend({ speed: 10, along: -along, across, bend: BEND });
    expect(back.outcome).toBe('inside');
    expect(back.endSpeed).toBeLessThan(7);
  });

  it('only the part along the velocity changes the speed: dv/dt equals a_t', () => {
    const run = driveBend({ speed: 10, along: 1.5, across: 3, bend: BEND });
    const i = 200, p = run.path[i], q = run.path[i + 1];
    const dvdt = (Math.hypot(q.vx, q.vy) - Math.hypot(p.vx, p.vy)) / (q.t - p.t);
    expect(dvdt).toBeCloseTo(1.5, 3);
  });
});

describe('lesson 1: letting go of the string', () => {
  const r = 1.2, v = 2, target: [number, number] = [3.2, 1.4];

  it('while whirling, the acceleration is v²/r and points at the centre', () => {
    const w = whirl(r, v, 0.7);
    expect(Math.hypot(w.ax, w.ay)).toBeCloseTo((v * v) / r, 12);
    expect(w.ax * w.x + w.ay * w.y).toBeCloseTo(-Math.hypot(w.ax, w.ay) * r, 12);
    expect(w.vx * w.x + w.vy * w.y).toBeCloseTo(0, 12);
  });

  it('released, the puck leaves along the tangent, never out along the string', () => {
    const th = 0.4;
    for (const t of [0.2, 0.8, 1.6]) {
      const [x, y] = afterRelease(r, v, th, t);
      expect(Math.hypot(x, y)).toBeCloseTo(Math.hypot(r, v * t), 12);
    }
  });

  it('letting go when the string points at the target misses by D − r', () => {
    const D = Math.hypot(...target);
    const { miss } = releaseMiss(r, v, Math.atan2(target[1], target[0]), target);
    expect(miss).toBeCloseTo(D - r, 9);
    expect(miss).toBeGreaterThan(2);
  });

  it('letting go at the tangent point hits dead centre, about 70° earlier', () => {
    const best = releaseAngleFor(r, target);
    expect(releaseMiss(r, v, best, target).miss).toBeLessThan(1e-9);
    const early = (Math.atan2(target[1], target[0]) - best) / DEG;
    expect(early).toBeGreaterThan(65);
    expect(early).toBeLessThan(75);
  });

  it('the hit window is wide enough to time by hand: more than 12° of circle', () => {
    const best = releaseAngleFor(r, target);
    let lo = 0, hi = 0;
    while (releaseMiss(r, v, best - (lo + 0.1) * DEG, target).miss <= 0.45) lo += 0.1;
    while (releaseMiss(r, v, best + (hi + 0.1) * DEG, target).miss <= 0.45) hi += 0.1;
    expect(lo + hi).toBeGreaterThan(12);
    // At 2 m/s on 1.2 m that is more than 120 ms of the lap.
    expect(((lo + hi) * DEG) / (v / r)).toBeGreaterThan(0.12);
  });
});

describe('lesson 2: two motions, one clock', () => {
  it('pushed or dropped, a ball leaves a 1.25 m table and lands in the same time', () => {
    const T = Math.sqrt((2 * 1.25) / 9.81);
    for (const v0 of [0, 1.5, 3.96, 6]) {
      const f = offTheTable(v0, 1.25);
      expect(f.landTime).toBeCloseTo(T, 4);
      expect(f.landX).toBeCloseTo(v0 * T, 3);
    }
  });

  it('a 2.0 m bucket needs a 3.96 m/s push, and doubling the push doubles the distance', () => {
    const T = offTheTable(0, 1.25).landTime;
    const push = 2 / T;
    expect(push).toBeCloseTo(3.96, 2);
    expect(Math.abs(offTheTable(push, 1.25).landX - 2)).toBeLessThan(0.01);
    expect(offTheTable(2 * push, 1.25).landX).toBeCloseTo(4, 2);
  });

  it('aimed straight at the can, the ball meets it at any speed that gets there', () => {
    const can: [number, number] = [12, 6];
    for (const speed of [13, 15, 20, 30]) {
      const shot = shootAtCan({ speed, aimDeg: aimStraightAt(can), can });
      expect(shot.closest).toBeLessThan(0.05);
      expect(shot.ballFell!).toBeCloseTo(shot.canFell!, 2);
    }
  });

  it('aiming above the can passes above it; the ball and the can still fell the same', () => {
    const can: [number, number] = [12, 6];
    const shot = shootAtCan({ speed: 15, aimDeg: aimStraightAt(can) + 4, can });
    expect(shot.gap!).toBeGreaterThan(0.7);
    expect(shot.closest).toBeGreaterThan(0.4);
    expect(shot.ballFell!).toBeCloseTo(shot.canFell!, 2);
  });

  it('with air, a pushed ping-pong ball lands later than a dropped one', () => {
    const k = ballDrag(BALLS.pingpong);
    expect(terminalSpeed(k)).toBeGreaterThan(8.5);
    expect(terminalSpeed(k)).toBeLessThan(9);
    const pushed = offTheTable(12, 3, { drag: k }), dropped = offTheTable(0, 3, { drag: k });
    expect(pushed.landTime - dropped.landTime).toBeGreaterThan(0.05);
    // Without air the same two land together.
    expect(offTheTable(12, 3).landTime).toBeCloseTo(offTheTable(0, 3).landTime, 4);
    // It also falls more than a quarter short of the vacuum distance.
    expect(pushed.landX).toBeLessThan(0.75 * offTheTable(12, 3).landX);
    expect(terminalSpeed(k).toFixed(1)).toBe('8.7');
    // And the pushed ball's sideways speed is far from constant.
    const last = pushed.path[pushed.path.length - 1];
    expect(last.vx).toBeLessThan(6);
  });
});
