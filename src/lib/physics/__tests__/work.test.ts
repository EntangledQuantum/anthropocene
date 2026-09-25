import { describe, expect, it } from 'vitest';
import {
  RIDE,
  averagePower,
  beadForce,
  beadPosition,
  beadTrackForce,
  beadVelocity,
  cumulativeWork,
  constantForceTrial,
  instantaneousPower,
  kineticEnergy,
  pushThroughField,
  ridePowerNeeded,
  runBead,
  speedFromKinetic,
  splitForWork,
  stoppingDistance,
  topSpeedAtPower,
  totalWork,
  workAlongPath,
  workOfConstantForce,
} from '../work.ts';
import { add2, dot2, mag2, rotate2, scale2, type Vec2 } from '../vectors.ts';

/* Every claim Chapter 6 makes out loud, pinned as an assertion. A wrong
   simulation is a wrong lesson, which is worse than no lesson. */

const grid = (a: number, b: number, n: number) =>
  Array.from({ length: n }, (_, i) => a + ((b - a) * i) / (n - 1));

describe('work as the shared piece of two arrows', () => {
  it('is F d cos θ, whichever way you compute it', () => {
    const F: Vec2 = [12, 5];
    const d: Vec2 = [3, 0];
    const split = splitForWork(F, d);
    expect(split.work).toBeCloseTo(mag2(F) * mag2(d) * Math.cos(split.angle), 12);
    expect(split.work).toBeCloseTo(workOfConstantForce(F, d), 12);
    expect(split.work).toBeCloseTo(36, 12);
  });

  it('gives exactly zero for a perpendicular force, however enormous', () => {
    const d: Vec2 = [4, 0];
    for (const magnitude of [1, 1e3, 1e9]) {
      const F: Vec2 = [0, magnitude];
      const split = splitForWork(F, d);
      expect(split.work).toBe(0);
      expect(split.sign).toBe('zero');
      expect(mag2(split.perpendicular)).toBeCloseTo(magnitude, 6);
      expect(mag2(split.parallel)).toBeCloseTo(0, 9);
    }
  });

  it('splits the force into two halves that add back up to it', () => {
    const F: Vec2 = [-7, 11];
    const d: Vec2 = [2, 5];
    const { parallel, perpendicular } = splitForWork(F, d);
    const back = add2(parallel, perpendicular);
    expect(back[0]).toBeCloseTo(F[0], 12);
    expect(back[1]).toBeCloseTo(F[1], 12);
    // The perpendicular half is genuinely perpendicular, so it pays nothing.
    expect(dot2(perpendicular, d)).toBeCloseTo(0, 12);
  });

  it('turns negative once the force leans backwards past a right angle', () => {
    const d: Vec2 = [5, 0];
    const F: Vec2 = [10, 0];
    const angles = [0, 60, 89, 90, 91, 150, 180];
    const works = angles.map((deg) => splitForWork(rotate2(F, (deg * Math.PI) / 180), d).work);
    // Monotonically falling through zero at exactly 90°, and most negative
    // when the force is straight back along the path.
    for (let i = 1; i < works.length; i++) expect(works[i]).toBeLessThan(works[i - 1]);
    expect(works[angles.indexOf(90)]).toBeCloseTo(0, 12);
    expect(works[angles.indexOf(180)]).toBeCloseTo(-50, 12);
    expect(splitForWork(rotate2(F, (150 * Math.PI) / 180), d).sign).toBe('negative');
  });

  it('collects nothing from a central force dragged once round a circle', () => {
    const n = 721;
    const points: Vec2[] = grid(0, 2 * Math.PI, n).map((th) => [3 * Math.cos(th), 3 * Math.sin(th)]);
    // Always pointing at the centre, always 250 N. Never in the direction of travel.
    const forces: Vec2[] = points.map((p) => scale2(p, -250 / mag2(p)));
    const w = workAlongPath(points, forces);
    expect(Math.abs(w[w.length - 1])).toBeLessThan(1e-9);
  });
});

describe('kinetic energy', () => {
  it('is quadratic in speed, so stopping distance quadruples when speed doubles', () => {
    const m = 1400;
    const F = 9000;
    const d30 = stoppingDistance(m, 30, F);
    const d60 = stoppingDistance(m, 60, F);
    expect(d30).toBeCloseTo(kineticEnergy(m, 30) / F, 9);
    expect(d60 / d30).toBeCloseTo(4, 9);
  });

  it('does not care which way the body is going', () => {
    expect(kineticEnergy(3, 7)).toBeCloseTo(kineticEnergy(3, -7), 12);
  });

  it('round-trips through the speed that would carry it', () => {
    expect(speedFromKinetic(2.5, kineticEnergy(2.5, 4.2))).toBeCloseTo(4.2, 12);
  });
});

describe('a varying force: the area under F(x)', () => {
  it('accumulates the signed area, with the part below the axis subtracting', () => {
    const x = grid(0, 3, 2001);
    const F = x.map((xi) => 20 - 12 * xi);
    const c = cumulativeWork(x, F);
    // ∫(20 − 12x)dx = 20x − 6x²: rises to a peak at x = 5/3 then falls back.
    expect(c[c.length - 1]).toBeCloseTo(6, 6);
    const peak = Math.max(...c);
    const peakAt = x[c.indexOf(peak)];
    expect(peakAt).toBeCloseTo(5 / 3, 2);
    expect(peak).toBeCloseTo(20 * (5 / 3) - 6 * (5 / 3) ** 2, 5);
  });

  it('gives back exactly F·d when the force does not vary', () => {
    const x = grid(0, 4, 101);
    expect(totalWork(x, x.map(() => 7.5))).toBeCloseTo(30, 9);
  });
});

describe('the work-energy theorem, measured rather than asserted', () => {
  const force = (xi: number) => 20 - 12 * xi;

  it('hands the body exactly the area under the force curve', () => {
    const run = pushThroughField({ mass: 2, v0: 3, xEnd: 3, force, dt: 5e-4 });
    expect(run.outcome).toBe('reached');

    // The area, computed independently on a fine grid — this is not the number
    // the integrator accumulated, which is the point of the comparison.
    const x = grid(0, 3, 20001);
    const area = totalWork(x, x.map(force));

    expect(area).toBeCloseTo(6, 6);
    expect(run.deltaK).toBeCloseTo(area, 3);
    expect(run.workDone).toBeCloseTo(area, 3);

    const last = run.states[run.states.length - 1];
    expect(last.K).toBeCloseTo(kineticEnergy(2, 3) + area, 3);
  });

  it('returns the body at its original speed when the areas cancel', () => {
    // ∫₀³ (20 − 40x/3) dx = 0 exactly: pushed forward, then held back just as hard.
    const zeroNet = (xi: number) => 20 - (40 / 3) * xi;
    const run = pushThroughField({ mass: 2, v0: 3, xEnd: 3, force: zeroNet, dt: 5e-4 });
    expect(run.outcome).toBe('reached');
    const last = run.states[run.states.length - 1];
    expect(last.v).toBeCloseTo(3, 3);
    expect(run.deltaK).toBeCloseTo(0, 3);
  });

  it('turns the body back where the negative work has eaten all of K', () => {
    // 1 J of kinetic energy against a steady 4 N brake: gone after 25 cm.
    const run = pushThroughField({ mass: 2, v0: 1, xEnd: 3, force: () => -4, dt: 2e-4 });
    expect(run.outcome).toBe('turned-back');
    expect(run.turnedAt).toBeCloseTo(0.25, 2);
    expect(run.deltaK).toBeCloseTo(-kineticEnergy(2, 1), 2);
  });
});

describe('a bead on a circular wire', () => {
  const o = { radius: 2, mass: 1.5, speed0: 3, forceMag: 40 };

  it('holds its speed forever when the force points at the centre', () => {
    const states = runBead({ ...o, tiltDeg: 0 }, 1e-3, 4000);
    const last = states[states.length - 1];
    expect(last.speed).toBeCloseTo(3, 12);
    expect(last.work).toBe(0);
    // And it has genuinely gone somewhere — this is not a stationary bead.
    expect(Math.abs(last.theta)).toBeGreaterThan(1);
  });

  it('lets the wire hold it on the circle without doing any work either', () => {
    const states = runBead({ ...o, tiltDeg: 35 }, 1e-3, 3000);
    for (const s of [states[0], states[1500], states[3000]]) {
      const track = beadTrackForce(s, { ...o, tiltDeg: 35 });
      expect(Math.abs(instantaneousPower(track, beadVelocity(s)))).toBeLessThan(1e-9);
      // The wire is pulling hard — it is doing nothing because of its
      // direction, not because it is weak.
      expect(mag2(track)).toBeGreaterThan(1);
      // ...and the bead really is on the circle.
      expect(mag2(beadPosition(s, o))).toBeCloseTo(2, 12);
    }
  });

  it('changes the speed by exactly the work the tilted force does', () => {
    for (const tiltDeg of [20, -20, 90]) {
      const opts = { ...o, tiltDeg };
      const states = runBead(opts, 5e-4, 3000);
      const first = states[0];
      const last = states[states.length - 1];
      const dK = kineticEnergy(o.mass, last.speed) - kineticEnergy(o.mass, first.speed);
      expect(last.work).toBeCloseTo(dK, 9);

      // Leaning the force forward feeds the bead; leaning it back drains it.
      // Checked early, before a hard brake can turn the bead round and start
      // doing positive work on it in the other direction.
      const early = states[200];
      expect(Math.sign(early.work)).toBe(Math.sign(tiltDeg));
    }
  });

  it('draws the force perpendicular to the velocity exactly when the tilt is zero', () => {
    const s = runBead({ ...o, tiltDeg: 0 }, 1e-3, 500)[500];
    expect(Math.abs(dot2(beadForce(s, { ...o, tiltDeg: 0 }), beadVelocity(s)))).toBeLessThan(1e-12);
    const tilted = beadForce(s, { ...o, tiltDeg: 30 });
    expect(Math.abs(dot2(tilted, beadVelocity(s)))).toBeGreaterThan(1);
  });
});

describe('only the shared piece counts: lesson claims', () => {
  it('gives +240, zero, and −240 J without weakening the 60 N force', () => {
    for (const [deg, expected] of [[0, 240], [90, 0], [180, -240]]) {
      const F = rotate2([60, 0], deg * Math.PI / 180);
      expect(mag2(F)).toBeCloseTo(60, 12);
      expect(workOfConstantForce(F, [4, 0])).toBeCloseTo(expected, 10);
      expect(workOfConstantForce(F, [2, 0])).toBeCloseTo(expected / 2, 10);
    }
    expect(splitForWork([0, 120], [4, 0]).sign).toBe('zero');
  });

  it('distinguishes the upward hand force during lift, lower, hold, and carry', () => {
    const hand: Vec2 = [0, 100];
    const gravity: Vec2 = [0, -100];
    for (const [displacement, expected] of [
      [[0, 2], 200], [[0, -2], -200], [[0, 0], 0], [[2, 0], 0],
    ] as [Vec2, number][]) {
      expect(workOfConstantForce(hand, displacement)).toBe(expected);
      expect(workOfConstantForce(gravity, displacement)).toBeCloseTo(-expected, 12);
      expect(workOfConstantForce(add2(hand, gravity), displacement)).toBe(0);
    }
  });

  it('keeps positive individual work while net work may be positive, zero, or negative', () => {
    for (const brake of [30, 60, 80]) {
      const trial = constantForceTrial({ applied: [60, 0], brake, mass: 10, speed0: 6, distance: 4 });
      const last = trial.samples.at(-1)!;
      expect(trial.run.outcome).toBe('reached');
      expect(last.appliedWork).toBeCloseTo(240, 9);
      expect(last.brakeWork).toBeCloseTo(-4 * brake, 9);
      expect(last.netWork).toBeCloseTo(240 - 4 * brake, 9);
      // K is measured from the independently integrated velocity, not assigned from work.
      expect(last.deltaK).toBeCloseTo(last.netWork, 4);
      expect(last.K).toBeCloseTo(kineticEnergy(10, last.v), 10);
      if (brake === 60) {
        for (const state of trial.samples) expect(state.v).toBeCloseTo(6, 10);
        expect(last.K).toBeCloseTo(180, 10);
      }
    }
  });

  it('does not let a huge perpendicular force alter work or kinetic energy on the fixed track', () => {
    const run = (vertical: number) => constantForceTrial({
      applied: [20, vertical], brake: 40, mass: 10, speed0: 6, distance: 4,
    });
    const a = run(0).samples.at(-1)!;
    const b = run(1e6).samples.at(-1)!;
    expect(b.netWork).toBeCloseTo(a.netWork, 9);
    expect(b.K).toBeCloseTo(a.K, 9);
  });

  it('ends the trial at its first stop instead of inventing a negative kinetic energy', () => {
    const trial = constantForceTrial({ applied: [60, 0], brake: 120, mass: 10, speed0: 6, distance: 4 });
    const last = trial.samples.at(-1)!;
    expect(trial.run.outcome).toBe('turned-back');
    expect(last.x).toBeCloseTo(3, 4);
    expect(last.K).toBe(0);
    expect(last.v).toBe(0);
    expect(last.netWork).toBeCloseTo(-180, 4);
    expect(trial.samples.every(s => s.K >= 0 && s.x <= last.x)).toBe(true);
  });
});

describe('power', () => {
  it('is zero for a force at right angles to the velocity', () => {
    expect(instantaneousPower([0, 900], [4, 0])).toBe(0);
  });

  it('is the work divided by the time it took', () => {
    const F: Vec2 = [30, 0];
    const v: Vec2 = [2.5, 0];
    const seconds = 8;
    const work = dot2(F, scale2(v, seconds));
    expect(averagePower(work, seconds)).toBeCloseTo(instantaneousPower(F, v), 12);
  });

  it("finds the speed at which a rider's output is exactly used up", () => {
    for (const watts of [100, 250, 400]) {
      const v = topSpeedAtPower(watts);
      expect(ridePowerNeeded(v)).toBeCloseTo(watts, 6);
    }
    // Tripling the power does nowhere near triple the speed: the drag term is
    // cubic in v, so the return on effort collapses.
    const slow = topSpeedAtPower(100);
    const fast = topSpeedAtPower(300);
    expect(fast / slow).toBeLessThan(1.6);
  });

  it("spends most of a fast rider's power on the air", () => {
    const v = topSpeedAtPower(250);
    const airShare = (RIDE.k * v * v * v) / ridePowerNeeded(v);
    expect(airShare).toBeGreaterThan(0.85);
  });
});
