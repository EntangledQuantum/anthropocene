import { describe, expect, it } from 'vitest';
import {
  BALLS,
  accelVector,
  ballDrag,
  circleFromSteering,
  flightMetrics,
  freeFall,
  sampleFlight,
  steerReadout,
  steerRun,
  terminalSpeed,
} from '../motion2d.ts';
import {
  centripetal,
  idealApex,
  idealRange,
  launchProjectile,
  tangentNormalSplit,
} from '../kinematics.ts';

const DEG = Math.PI / 180;

/* ── lesson 1: acceleration does not point where you are going ─────────────
   Every claim the steering lesson makes out loud, pinned as an assertion.
   ──────────────────────────────────────────────────────────────────────── */

describe('the tangential / normal split', () => {
  it('splits an acceleration into cos and sin of the angle it makes with v', () => {
    const speed = 7;
    const a = 3;
    for (const deg of [0, 25, 60, 90, 130, 180]) {
      // Velocity along +x, acceleration at `deg` counter-clockwise from it.
      const { tangential, normal } = tangentNormalSplit(
        speed,
        0,
        a * Math.cos(deg * DEG),
        a * Math.sin(deg * DEG),
      );
      expect(tangential).toBeCloseTo(a * Math.cos(deg * DEG), 12);
      expect(normal).toBeCloseTo(a * Math.sin(deg * DEG), 12);
    }
  });

  it('is invariant to where the velocity happens to be pointing', () => {
    // The same arrow-to-arrow angle must give the same split whatever the
    // compass heading is — that is the whole reason the split is the useful
    // description and the x/y components are not.
    const a = 2.5;
    const deg = 35;
    for (const heading of [0, 40, 115, 200, 310]) {
      const h = heading * DEG;
      const av = accelVector(
        { t: 0, x: 0, y: 0, vx: 6 * Math.cos(h), vy: 6 * Math.sin(h) },
        a,
        deg * DEG,
        'velocity',
      );
      const r = steerReadout(6 * Math.cos(h), 6 * Math.sin(h), av[0], av[1]);
      expect(r.tangential).toBeCloseTo(a * Math.cos(deg * DEG), 10);
      expect(r.normal).toBeCloseTo(a * Math.sin(deg * DEG), 10);
    }
  });

  it('speed changes at exactly the tangential component, and ignores the normal one', () => {
    // d|v|/dt = a_t. Measured from the trajectory, not asserted.
    for (const deg of [0, 45, 90, 135]) {
      const run = steerRun({
        speed0: 8,
        magnitude: 3,
        angle: deg * DEG,
        mode: 'velocity',
        duration: 0.4,
        dt: 0.0005,
      });
      const measured = (run.speed[run.speed.length - 1] - run.speed[0]) / 0.4;
      expect(measured).toBeCloseTo(3 * Math.cos(deg * DEG), 3);
    }
  });
});

describe('the chapter question: speeding up with the acceleration pointing left', () => {
  it('an object can speed up while its acceleration points in the −x direction', () => {
    // Moving up and to the left; acceleration due west. The arrow points left,
    // the speed rises. Both true at once, and the split says why: a has a
    // positive component along v.
    const heading = 135 * DEG;
    const run = steerRun({
      speed0: 5,
      heading0: heading,
      magnitude: 4,
      angle: 180 * DEG, // due −x, held fixed in the world
      mode: 'world',
      duration: 0.5,
      dt: 0.0005,
    });
    expect(run.readout[0].tangential).toBeGreaterThan(0);
    expect(run.speed[run.speed.length - 1]).toBeGreaterThan(run.speed[0]);
    // And the acceleration really does point left the whole time.
    const a = accelVector(run.path[0], 4, 180 * DEG, 'world');
    expect(a[0]).toBeLessThan(0);
    expect(Math.abs(a[1])).toBeLessThan(1e-12);
  });

  it('the same leftward acceleration slows the object down when it travels right-and-up', () => {
    // Surface change, opposite verdict, same arrow. "Acceleration points left"
    // is not a fact about speed at all.
    const run = steerRun({
      speed0: 5,
      heading0: 45 * DEG,
      magnitude: 4,
      angle: 180 * DEG,
      mode: 'world',
      duration: 0.5,
      dt: 0.0005,
    });
    expect(run.readout[0].tangential).toBeLessThan(0);
    expect(run.speed[run.speed.length - 1]).toBeLessThan(run.speed[0]);
  });
});

describe('uniform circular motion as pure steering', () => {
  it('holds a circle of radius v²/a when the arrow stays perpendicular', () => {
    const speed = 6;
    const a = 4;
    const { radius, period, check } = circleFromSteering(speed, a);
    expect(radius).toBeCloseTo((speed * speed) / a, 12);
    // circleFromSteering is the inverse of `centripetal`, so the round trip
    // must return the acceleration we started from.
    expect(check).toBeCloseTo(a, 12);
    expect(check).toBeCloseTo(centripetal(speed, radius), 12);

    const run = steerRun({
      speed0: speed,
      magnitude: a,
      angle: 90 * DEG,
      mode: 'velocity',
      duration: period,
      // An exact divisor of the period, so the closure test measures the
      // integrator rather than the leftover of a rounded step count.
      dt: period / 20_000,
    });

    // Speed constant — that is what "uniform" means, and it is not what
    // "constant velocity" means.
    for (const s of run.speed) expect(s).toBeCloseTo(speed, 4);

    // Every point sits on one circle: the centre is a fixed distance away.
    const c = run.path.map((p, i) => {
      const r = run.readout[i];
      const s = Math.hypot(p.vx, p.vy);
      // The centre lies one radius along the (leftward) normal direction.
      return [p.x + (radius * -p.vy) / s, p.y + (radius * p.vx) / s, r.turnRadius];
    });
    for (const [cx, cy, turnRadius] of c) {
      expect(cx).toBeCloseTo(c[0][0], 3);
      expect(cy).toBeCloseTo(c[0][1], 3);
      expect(turnRadius).toBeCloseTo(radius, 6);
    }

    // And it closes: after exactly one period it is back where it started.
    const end = run.path[run.path.length - 1];
    expect(end.x).toBeCloseTo(run.path[0].x, 3);
    expect(end.y).toBeCloseTo(run.path[0].y, 3);
  });

  it('ranks the four bends the lesson asks about, and the faster vehicle is not the answer', () => {
    // The numbers quoted in the <RankOrder> explanations, computed rather than
    // typed. The instructive pair is the town bend against the motorway curve:
    // the motorway car is twice as fast and demands LESS, because R is five
    // times larger and only v is squared.
    const track = centripetal(5, 20);
    const motorway = centripetal(30, 200);
    const townBend = centripetal(15, 40);
    const fairground = centripetal(8, 5);
    expect(track).toBeCloseTo(1.25, 10);
    expect(motorway).toBeCloseTo(4.5, 10);
    expect(townBend).toBeCloseTo(5.625, 10);
    expect(fairground).toBeCloseTo(12.8, 10);
    expect([track, motorway, townBend, fairground]).toEqual(
      [...[track, motorway, townBend, fairground]].sort((a, b) => a - b),
    );
    expect(motorway).toBeLessThan(townBend);
  });

  it('period and angular speed are two spellings of the same clock', () => {
    const { omega, period, frequency } = circleFromSteering(12, 3);
    expect(omega * period).toBeCloseTo(2 * Math.PI, 12);
    expect(frequency * period).toBeCloseTo(1, 12);
  });

  it('an outward-pointing arrow does not hold a circle — it opens the path out', () => {
    // The "circular motion needs an outward force" misconception, falsified
    // numerically: with the arrow at −90° the distance from the would-be centre
    // grows instead of staying put.
    const speed = 6;
    const a = 4;
    const radius = (speed * speed) / a;
    const run = steerRun({
      speed0: speed,
      magnitude: a,
      angle: -90 * DEG,
      mode: 'velocity',
      duration: 1.5,
      dt: 0.0005,
    });
    const centre = [0, radius]; // the centre a leftward turn would have had
    const d0 = Math.hypot(run.path[0].x - centre[0], run.path[0].y - centre[1]);
    const end = run.path[run.path.length - 1];
    const d1 = Math.hypot(end.x - centre[0], end.y - centre[1]);
    expect(d1).toBeGreaterThan(d0 * 1.5);
  });
});

/* ── lesson 2: two 1D motions sharing one clock ──────────────────────────── */

describe('projectile independence', () => {
  const g = 9.81;

  it('the vertical story of a 45° launch is the vertical story of a straight-up launch', () => {
    const speed = 20;
    const angled = launchProjectile(speed, 45, { g, dt: 0.001, maxSteps: 20_000 });
    const vy0 = speed * Math.sin(45 * DEG);
    // Same vy0, launched vertically. groundY well below so it keeps going.
    const vertical = launchProjectile(vy0, 90, { g, dt: 0.001, maxSteps: 20_000 });

    for (let i = 0; i < Math.min(angled.length, vertical.length); i += 100) {
      expect(angled[i].y).toBeCloseTo(vertical[i].y, 6);
      expect(angled[i].vy).toBeCloseTo(vertical[i].vy, 6);
    }
  });

  it('the horizontal velocity does not die off, and x(t) is a straight line', () => {
    const path = launchProjectile(24, 55, { g, dt: 0.001 });
    const vx0 = path[0].vx;
    for (const s of path) expect(s.vx).toBeCloseTo(vx0, 10);
    // x(t) = vx0 t exactly, sample by sample.
    for (let i = 0; i < path.length; i += 50) {
      expect(path[i].x).toBeCloseTo(vx0 * path[i].t, 6);
    }
  });

  it('the launched ball drops below its no-gravity line exactly as far as a dropped ball falls', () => {
    // The strobe picture the lesson draws: the gap between "where it would have
    // gone" and "where it is" is the free-fall curve, and nothing about the
    // horizontal launch changes it.
    const path = launchProjectile(18, 35, { g, dt: 0.001 });
    for (let i = 0; i < path.length; i += 40) {
      const s = path[i];
      const straightLine = path[0].vy * s.t;
      expect(s.y - straightLine).toBeCloseTo(freeFall(s.t, g), 5);
    }
  });

  it('measured range and apex reproduce the closed forms when there is no drag', () => {
    for (const [speed, angle] of [[20, 30], [20, 45], [35, 62], [12, 75]] as const) {
      const m = flightMetrics(launchProjectile(speed, angle, { g, dt: 0.002 }), g);
      expect(m.range).toBeCloseTo(idealRange(speed, angle, g), 2);
      expect(m.apex).toBeCloseTo(idealApex(speed, angle, g), 2);
      // Symmetry: climb equals descent, impact mirrors launch.
      expect(m.riseTime).toBeCloseTo(m.fallTime, 2);
      expect(m.impactSpeed).toBeCloseTo(m.launchSpeed, 2);
      expect(m.impactAngleDeg).toBeCloseTo(angle, 1);
      expect(m.horizontalRetained).toBeCloseTo(1, 10);
    }
  });

  it('45° really is the drag-free optimum, and complements tie', () => {
    const speed = 25;
    const best = flightMetrics(launchProjectile(speed, 45, { g, dt: 0.002 })).range;
    for (const angle of [20, 35, 55, 70]) {
      expect(flightMetrics(launchProjectile(speed, angle, { g, dt: 0.002 })).range)
        .toBeLessThan(best);
    }
    const lo = flightMetrics(launchProjectile(speed, 30, { g, dt: 0.002 })).range;
    const hi = flightMetrics(launchProjectile(speed, 60, { g, dt: 0.002 })).range;
    expect(lo).toBeCloseTo(hi, 2);
  });

  it('samples a flight between its stored steps', () => {
    const path = launchProjectile(20, 45, { g, dt: 0.004 });
    const mid = sampleFlight(path, 0.5 * path[path.length - 1].t);
    expect(mid.t).toBeCloseTo(0.5 * path[path.length - 1].t, 12);
    expect(mid.x).toBeCloseTo(path[0].vx * mid.t, 3);
    // Clamps rather than extrapolating.
    expect(sampleFlight(path, -5).t).toBe(path[0].t);
    expect(sampleFlight(path, 1e6).t).toBe(path[path.length - 1].t);
  });
});

describe('drag breaks every symmetry of the parabola', () => {
  const g = 9.81;
  const k = ballDrag(BALLS.baseball);

  it('puts a thrown baseball in the quadratic-drag regime, not the Stokes one', () => {
    // ½ρC_dA/m for a baseball, and the terminal speed it implies. The
    // literature check the lesson quotes: drag exceeds weight above about
    // 95 mph, i.e. terminal speed is a little under that.
    expect(k).toBeGreaterThan(5e-3);
    expect(k).toBeLessThan(7e-3);
    const vt = terminalSpeed(k, g);
    expect(vt).toBeGreaterThan(35);
    expect(vt).toBeLessThan(45);
    // 40 m/s baseball, radius 3.66 cm, ν ≈ 1.5e-5 m²/s → Re ≈ 2 × 10⁵.
    const Re = (40 * 2 * BALLS.baseball.radius) / 1.5e-5;
    expect(Re).toBeGreaterThan(1e5);
  });

  it('falls short of the closed-form range, and by a lot at speed', () => {
    const speed = 40;
    const angle = 45;
    const dragged = flightMetrics(launchProjectile(speed, angle, { g, drag: k, dt: 0.002 }), g);
    const ideal = idealRange(speed, angle, g);
    expect(dragged.range).toBeLessThan(ideal);
    // Order of the effect at terminal-ish speed: the parabola is not a small
    // correction away, it is roughly half again too long.
    expect(dragged.range / ideal).toBeLessThan(0.75);
    expect(dragged.range / ideal).toBeGreaterThan(0.3);
  });

  it('descends more slowly than it climbed, and lands slower and steeper than it left', () => {
    const m = flightMetrics(launchProjectile(40, 45, { g, drag: k, dt: 0.002 }), g);
    expect(m.fallTime).toBeGreaterThan(m.riseTime);
    expect(m.impactSpeed).toBeLessThan(m.launchSpeed);
    expect(m.impactAngleDeg).toBeGreaterThan(45);
    // The horizontal velocity really does decay — the one time the naive
    // "horizontal velocity dies off" belief describes something real, and the
    // reason it must be earned rather than assumed.
    expect(m.horizontalRetained).toBeLessThan(1);
    expect(m.horizontalRetained).toBeGreaterThan(0);
  });

  it('leaves the parabola essentially intact for a shot put, and destroys it for a ping-pong ball', () => {
    // Same launch, three balls: the model's validity is a property of the
    // object, not of the equation.
    const speed = 14;
    const angle = 42;
    const ideal = idealRange(speed, angle, g);
    const ratio = (key: string) =>
      flightMetrics(
        launchProjectile(speed, angle, { g, drag: ballDrag(BALLS[key]), dt: 0.002 }),
        g,
      ).range / ideal;

    expect(ratio('shotput')).toBeGreaterThan(0.97);
    expect(ratio('baseball')).toBeLessThan(ratio('shotput'));
    expect(ratio('pingpong')).toBeLessThan(0.45);
  });

  it('approaches the terminal speed on a long drop and does not pass it', () => {
    const vt = terminalSpeed(k, g);
    // Dropped from rest: launch straight down with a whisker of speed and a
    // ground far below.
    const path = launchProjectile(0.001, -90, { g, drag: k, dt: 0.002, groundY: -4000, maxSteps: 400_000 });
    const speeds = path.map((s) => Math.hypot(s.vx, s.vy));
    const last = speeds[speeds.length - 1];
    expect(last).toBeLessThan(vt * 1.001);
    expect(last).toBeGreaterThan(vt * 0.99);
    // Monotone approach — no overshoot, which is what makes it a *terminal*
    // speed rather than an oscillation.
    for (let i = 1; i < speeds.length; i++) {
      expect(speeds[i]).toBeGreaterThanOrEqual(speeds[i - 1] - 1e-9);
    }
  });

  it('drag-free flight is unchanged by the drag code path', () => {
    // A learner toggling drag off must be comparing against the true parabola,
    // not against a slightly different integration of it.
    const a = launchProjectile(22, 50, { g, dt: 0.002 });
    const b = launchProjectile(22, 50, { g, drag: 0, dt: 0.002 });
    expect(flightMetrics(a).range).toBeCloseTo(flightMetrics(b).range, 12);
  });
});
