import { describe, expect, it } from 'vitest';
import { estimate, sketch } from '../../../components/learn/scenarios/up-interaction.ts';
import { mag2, type Vec2 } from '../vectors.ts';
import {
  G_EARTH,
  accelerationOn,
  accelerationsAgree,
  allForces,
  contactForces,
  createWorld,
  inEquilibrium,
  internalForces,
  isThirdLawPair,
  netForceOn,
  netForceOnSystem,
  netTorqueAbout,
  resolve,
  scaleReading,
  solveContact,
  step,
  surfaceComponents,
  thirdLawPartner,
  timeToReachSpeed,
  weight,
  type Body,
  type Force,
} from '../dynamics.ts';

/* Every pedagogical claim in `04-interaction` has an assertion here. The two
   lessons say: nothing is needed to keep a body moving; a forward force on a
   coasting body makes it speed up without settling; the pair never enters one
   diagram; the truck and the car feel equal forces and unequal accelerations;
   N is not always mg and clamps at zero. All of that is measured below. */

const RUN_DT = 1 / 240;

const body = (id: string, mass: number, extra: Partial<Body> = {}): Body => ({
  id,
  label: id,
  mass,
  pos: [0, 0],
  vel: [0, 0],
  size: 0.4,
  ...extra,
});

const force = (id: string, on: string, by: string, vec: Vec2): Force => ({
  id,
  on,
  by,
  vec,
  kind: 'applied',
});

const gravityOn = (b: Body): Force => ({
  id: `${b.id}-w`,
  on: b.id,
  by: 'Earth',
  kind: 'gravity',
  label: 'weight',
  vec: [0, -weight(b.mass)],
});

function run(w: ReturnType<typeof createWorld>, seconds: number) {
  const n = Math.round(seconds / RUN_DT);
  for (let i = 0; i < n; i++) step(w, RUN_DT);
  return w;
}

describe('a force is a relationship, so the sum knows which body it is for', () => {
  it('only sums the forces acting ON the named body', () => {
    const forces = [
      force('a', 'block', 'you', [10, 0]),
      force('b', 'table', 'block', [0, -5]),
      force('c', 'block', 'rope', [0, 4]),
    ];
    expect(netForceOn('block', forces)).toEqual([10, 4]);
    expect(netForceOn('table', forces)).toEqual([0, -5]);
  });

  it('a third-law partner can never enter the diagram it came from', () => {
    const push = force('push', 'crate', 'hand', [30, 0]);
    const partner = thirdLawPartner(push);

    expect(partner.on).toBe('hand');
    expect(partner.by).toBe('crate');
    expect(mag2(partner.vec)).toBeCloseTo(mag2(push.vec), 12);
    // The two arrows cancel as a pair...
    expect(mag2(netForceOn('crate', [push, partner]))).toBeCloseTo(30, 12);
    // ...but not on the crate's own diagram, where only one of them lives.
    expect(netForceOn('crate', [push, partner])).toEqual([30, 0]);
    expect(netForceOn('hand', [push, partner])).toEqual([-30, 0]);
  });

  it('recognises a genuine pair and rejects two forces on one body', () => {
    const bookOnTable = force('1', 'table', 'book', [0, -19.6]);
    const tableOnBook = force('2', 'book', 'table', [0, 19.6]);
    expect(isThirdLawPair(bookOnTable, tableOnBook)).toBe(true);

    // The classic trap: equal, opposite, and NOT a pair — both act on the book.
    const gravityOnBook: Force = { ...force('3', 'book', 'Earth', [0, -19.6]), kind: 'gravity' };
    const normalOnBook: Force = { ...force('4', 'book', 'table', [0, 19.6]), kind: 'normal' };
    expect(mag2([gravityOnBook.vec[0] + normalOnBook.vec[0], gravityOnBook.vec[1] + normalOnBook.vec[1]])).toBeCloseTo(0, 12);
    expect(isThirdLawPair(gravityOnBook, normalOnBook)).toBe(false);
  });

  it('superposes: three arrows that close a triangle give equilibrium, not no forces', () => {
    const fs = [
      force('e', 'crate', 'thruster A', [24, 0]),
      force('n', 'crate', 'thruster B', [0, 18]),
      force('c', 'crate', 'thruster C', [-24, -18]),
    ];
    expect(inEquilibrium('crate', fs, 1e-12)).toBe(true);
    expect(fs.some((f) => mag2(f.vec) === 0)).toBe(false);
  });
});

describe('mass is resistance to a change of velocity', () => {
  it('the same force on twice the mass gives half the acceleration', () => {
    const f = [force('p', 'b', 'you', [12, 0])];
    expect(accelerationOn('b', 3, f)).toEqual([4, 0]);
    expect(accelerationOn('b', 6, f)).toEqual([2, 0]);
  });

  it('one person pushing a car reaches walking pace in seconds, not minutes', () => {
    const t = timeToReachSpeed(1400, 300, 1.4);
    expect(t).toBeCloseTo(6.533, 3);

    // And the integrator agrees with the closed form.
    const car = body('car', 1400);
    const w = createWorld({ bodies: [car], forces: [force('push', 'car', 'you', [300, 0])] });
    run(w, t);
    expect(w.bodies[0].vel[0]).toBeCloseTo(1.4, 6);
  });
});

describe('the first law: nothing is needed to keep it moving', () => {
  it('a coasting body with zero net force keeps its velocity exactly', () => {
    const puck = body('puck', 2, { vel: [4, 0] });
    const w = createWorld({
      bodies: [puck],
      forces: [gravityOn(puck)],
      surface: { angleRad: 0, muS: 0, muK: 0 },
    });
    run(w, 20);

    expect(mag2(netForceOn('puck', allForces(w)))).toBeCloseTo(0, 10);
    expect(w.bodies[0].vel[0]).toBeCloseTo(4, 10);
    expect(w.bodies[0].vel[1]).toBeCloseTo(0, 10);
    expect(w.bodies[0].pos[0]).toBeCloseTo(80, 6);
  });

  it('the table supplies exactly mg on the level, unasked', () => {
    const puck = body('puck', 2, { vel: [4, 0] });
    const w = createWorld({
      bodies: [puck],
      forces: [gravityOn(puck)],
      surface: { angleRad: 0, muS: 0, muK: 0 },
    });
    const normal = w.solved.find((f) => f.kind === 'normal')!;
    expect(normal.vec[1]).toBeCloseTo(weight(2), 10);
    expect(normal.on).toBe('puck');
  });

  it('a steady forward force does NOT settle at a new constant speed', () => {
    // FCI misconception AF4: velocity proportional to applied force. The test
    // is that the speed after 2 s and after 4 s differ by the same amount
    // again — linear growth, no asymptote.
    const puck = body('puck', 2, { vel: [4, 0] });
    const w = createWorld({
      bodies: [puck],
      forces: [gravityOn(puck), force('push', 'puck', 'you', [6, 0])],
      surface: { angleRad: 0, muS: 0, muK: 0 },
    });
    run(w, 2);
    const v2 = w.bodies[0].vel[0];
    run(w, 2);
    const v4 = w.bodies[0].vel[0];
    run(w, 2);
    const v6 = w.bodies[0].vel[0];

    expect(v2).toBeCloseTo(4 + 3 * 2, 6);
    expect(v4 - v2).toBeCloseTo(v6 - v4, 6);
    expect(v6).toBeGreaterThan(15);
  });

  it('removing the force keeps the speed it reached — it does not decay back', () => {
    const puck = body('puck', 2, { vel: [4, 0] });
    const w = createWorld({
      bodies: [puck],
      forces: [gravityOn(puck), force('push', 'puck', 'you', [6, 0])],
      surface: { angleRad: 0, muS: 0, muK: 0 },
    });
    run(w, 3);
    const reached = w.bodies[0].vel[0];
    w.forces = w.forces.filter((f) => f.id !== 'push');
    run(w, 30);
    expect(w.bodies[0].vel[0]).toBeCloseTo(reached, 8);
  });
});

describe('the third law has no exception for a heavier body', () => {
  it('truck and car feel equal forces and grossly unequal accelerations', () => {
    const car = body('car', 1200, { pos: [-6, 0], vel: [20, 0] });
    const truck = body('truck', 14_000, { pos: [6, 0], vel: [-14, 0] });

    const onCar: Force = {
      id: 'truck-on-car',
      on: 'car',
      by: 'truck',
      kind: 'contact',
      label: 'truck on car',
      vec: [-420_000, 0],
    };
    const onTruck = thirdLawPartner(onCar);

    const w = createWorld({ bodies: [car, truck], forces: [onCar, onTruck] });
    resolve(w);

    expect(mag2(onCar.vec)).toBeCloseTo(mag2(onTruck.vec), 9);

    const aCar = mag2(w.accel.car);
    const aTruck = mag2(w.accel.truck);
    expect(aCar / aTruck).toBeCloseTo(14_000 / 1200, 6);
    expect(aCar / aTruck).toBeGreaterThan(11);
  });

  it('pair forces vanish from the system budget but not from either member', () => {
    const a = body('A', 2);
    const b = body('B', 6);
    const push = force('push', 'A', 'you', [16, 0]);
    const contact: Force = {
      id: 'A-on-B',
      on: 'B',
      by: 'A',
      kind: 'contact',
      label: 'A on B',
      vec: [12, 0],
    };
    const back = thirdLawPartner(contact);
    const fs = [push, contact, back];

    expect(netForceOnSystem(['A', 'B'], fs)).toEqual([16, 0]);
    expect(internalForces(['A', 'B'], fs).map((f) => f.id).sort()).toEqual(['A-on-B', 'A-on-B-partner']);

    // 12 N is the one value that makes the two blocks travel together.
    const w = createWorld({ bodies: [a, b], forces: fs });
    resolve(w);
    expect(w.accel.A[0]).toBeCloseTo(2, 9);
    expect(w.accel.B[0]).toBeCloseTo(2, 9);
    expect(accelerationsAgree([w.accel.A, w.accel.B], 1e-6)).toBe(true);
  });

  it('any other contact magnitude tears the pair of blocks apart', () => {
    const fs = [
      force('push', 'A', 'you', [16, 0]),
      { id: 'c', on: 'B', by: 'A', kind: 'contact' as const, vec: [8, 0] as Vec2 },
    ];
    fs.push(thirdLawPartner(fs[1] as Force));
    const w = createWorld({ bodies: [body('A', 2), body('B', 6)], forces: fs as Force[] });
    resolve(w);
    expect(accelerationsAgree([w.accel.A, w.accel.B], 0.05)).toBe(false);
    expect(w.accel.A[0]).toBeGreaterThan(w.accel.B[0]);
  });
});

describe('the normal force is a consequence, not a law', () => {
  const block = () => body('block', 5);
  const level = { angleRad: 0, muS: 0, muK: 0 };

  it('equals mg with nothing else touching the block', () => {
    const b = block();
    const sol = solveContact(b, [gravityOn(b)], level);
    expect(sol.normalMag).toBeCloseTo(weight(5), 10);
    expect(sol.touching).toBe(true);
  });

  it('shrinks when you pull up, and by exactly the amount you pulled', () => {
    const b = block();
    const sol = solveContact(b, [gravityOn(b), force('pull', 'block', 'you', [0, 30])], level);
    expect(sol.normalMag).toBeCloseTo(weight(5) - 30, 10);
    expect(sol.normalMag).toBeCloseTo(19.05, 6);
  });

  it('grows when you press down', () => {
    const b = block();
    const sol = solveContact(b, [gravityOn(b), force('press', 'block', 'you', [0, -30])], level);
    expect(sol.normalMag).toBeCloseTo(weight(5) + 30, 10);
  });

  it('clamps at zero and releases the block — a surface pushes, never pulls', () => {
    const b = block();
    const w = createWorld({
      bodies: [b],
      forces: [gravityOn(b), force('pull', 'block', 'you', [0, 60])],
      surface: level,
    });
    expect(w.touching).toEqual([]);
    expect(w.solved).toEqual([]);
    expect(w.accel.block[1]).toBeCloseTo((60 - weight(5)) / 5, 9);
    run(w, 1);
    expect(w.bodies[0].pos[1]).toBeGreaterThan(1);
  });

  it('is mg cos θ on a ramp — the geometry, not a new rule', () => {
    const theta = (25 * Math.PI) / 180;
    const b = block();
    const sol = solveContact(b, [gravityOn(b)], { angleRad: theta, muS: 0, muK: 0 });
    expect(sol.normalMag).toBeCloseTo(weight(5) * Math.cos(theta), 9);

    const { along, into } = surfaceComponents([0, -weight(5)], { angleRad: theta, muS: 0, muK: 0 });
    expect(along).toBeCloseTo(-weight(5) * Math.sin(theta), 9);
    expect(into).toBeCloseTo(-weight(5) * Math.cos(theta), 9);
  });

  it('static friction takes whatever value holds the block, up to its ceiling', () => {
    const b = block();
    const rough = { angleRad: 0, muS: 0.6, muK: 0.4 };

    const held = solveContact(b, [gravityOn(b), force('push', 'block', 'you', [20, 0])], rough);
    expect(held.stuck).toBe(true);
    expect(held.frictionTangential).toBeCloseTo(-20, 10);

    const broken = solveContact(b, [gravityOn(b), force('push', 'block', 'you', [40, 0])], rough);
    expect(broken.stuck).toBe(false);
    expect(broken.frictionTangential).toBeCloseTo(-0.4 * weight(5), 10);
  });

  it('kinetic friction opposes the velocity and brings a slide to a stop', () => {
    const b = body('block', 5, { vel: [6, 0] });
    const w = createWorld({
      bodies: [b],
      forces: [gravityOn(b)],
      surface: { angleRad: 0, muS: 0.5, muK: 0.3 },
    });
    expect(w.accel.block[0]).toBeCloseTo(-0.3 * G_EARTH, 9);
    run(w, 6 / (0.3 * G_EARTH));
    expect(Math.abs(w.bodies[0].vel[0])).toBeLessThan(0.02);
  });
});

describe('what a scale reads', () => {
  it('reads the weight only when the acceleration is zero', () => {
    expect(scaleReading(70, 0)).toBeCloseTo(70 * G_EARTH, 10);
    expect(scaleReading(70, 2)).toBeCloseTo(70 * (G_EARTH + 2), 10);
    expect(scaleReading(70, -2)).toBeCloseTo(70 * (G_EARTH - 2), 10);
  });

  it('reads zero in free fall, with gravity entirely undiminished', () => {
    expect(scaleReading(70, -G_EARTH)).toBeCloseTo(0, 10);
    expect(weight(70)).toBeCloseTo(70 * G_EARTH, 10);
  });
});

describe('torque, for the chapters that will need it', () => {
  it('a balanced lever has zero net torque about its pivot', () => {
    const beam = body('beam', 1, { pos: [0, 0], size: 2 });
    const fs: Force[] = [
      { id: 'l', on: 'beam', by: 'weight L', kind: 'gravity', vec: [0, -20], at: [-1.5, 0] },
      { id: 'r', on: 'beam', by: 'weight R', kind: 'gravity', vec: [0, -30], at: [1, 0] },
    ];
    expect(netTorqueAbout([0, 0], [beam], fs)).toBeCloseTo(0, 10);
    expect(netTorqueAbout([0.5, 0], [beam], fs)).not.toBeCloseTo(0, 6);
  });
});

describe('the numbers the two Chapter 4 lessons print', () => {
  it('lesson 1 hook: 6 N on the 2 kg puck is 3 m/s², reaching 22 m/s after six seconds', () => {
    const puck = body('puck', 2, { vel: [4, 0] });
    const w = createWorld({
      bodies: [puck],
      forces: [gravityOn(puck), force('push', 'puck', 'you', [6, 0])],
      surface: { angleRad: 0, muS: 0, muK: 0 },
    });
    expect(w.accel.puck[0]).toBeCloseTo(3, 12);
    run(w, 6);
    expect(w.bodies[0].vel[0]).toBeCloseTo(22, 6);
  });

  it('lesson 1 hidden-motion crate: 14 N rope less 6 N friction on 4 kg is 2 m/s², N is mg', () => {
    const crate = body('crate', 4);
    const w = createWorld({
      bodies: [crate],
      forces: [
        gravityOn(crate),
        { ...force('rope', 'crate', 'a rope', [14, 0]), kind: 'tension' },
        { ...force('fr', 'crate', 'the floor', [-6, 0]), kind: 'friction' },
      ],
      surface: { angleRad: 0, muS: 0, muK: 0 },
    });
    expect(netForceOn('crate', allForces(w))[0]).toBeCloseTo(8, 10);
    expect(w.accel.crate[0]).toBeCloseTo(2, 10);
    expect(w.solved.find((f) => f.kind === 'normal')!.vec[1]).toBeCloseTo(weight(4), 10);
    // And the diagram genuinely does not pin the velocity: the same forces are
    // consistent with moving right, moving left, or being at rest.
    for (const v0 of [6, -3, 0]) {
      const alt = createWorld({
        bodies: [body('crate', 4, { vel: [v0, 0] })],
        forces: w.forces,
        surface: { angleRad: 0, muS: 0, muK: 0 },
      });
      expect(alt.accel.crate[0]).toBeCloseTo(2, 10);
    }
  });

  it('lesson 1 thrusters: 20 N east and 20 N north are cancelled by 28.3 N at 225°', () => {
    const deg = 225;
    const m = 28.5; // what the widget's half-newton snap actually offers
    const third: Vec2 = [
      m * Math.cos((deg * Math.PI) / 180),
      m * Math.sin((deg * Math.PI) / 180),
    ];
    const fs = [
      force('a', 'crate', 'thruster A', [20, 0]),
      force('b', 'crate', 'thruster B', [0, 20]),
      force('c', 'crate', 'thruster C', third),
    ];
    expect(Math.hypot(20, 20)).toBeCloseTo(28.284, 3);
    // Inside the widget's 0.12 m/s² tolerance on an 8 kg crate.
    expect(mag2(accelerationOn('crate', 8, fs))).toBeLessThan(0.12);
  });

  it('lesson 2 collision: 600 kN both ways, 500 and 42.86 m/s², ratio 11.67', () => {
    const car = body('car', 1200, { vel: [20, 0] });
    const truck = body('truck', 14_000, { vel: [-14, 0] });
    const onCar: Force = { id: 'hit', on: 'car', by: 'truck', kind: 'contact', vec: [-600_000, 0] };
    const w = createWorld({ bodies: [car, truck], forces: [onCar, thirdLawPartner(onCar)] });

    expect(mag2(netForceOn('car', w.forces))).toBeCloseTo(600_000, 6);
    expect(mag2(netForceOn('truck', w.forces))).toBeCloseTo(600_000, 6);
    expect(mag2(w.accel.car)).toBeCloseTo(500, 6);
    expect(mag2(w.accel.truck)).toBeCloseTo(42.857, 3);
    expect(mag2(w.accel.car) / mag2(w.accel.truck)).toBeCloseTo(11.667, 3);

    // Ten steps — the 42 ms a learner actually sees, since the widget stops on
    // the first frame past its 40 ms duration. The car is brought to rest and
    // barely started back; the truck has lost 1.8 of its 14 m/s.
    for (let i = 0; i < 10; i++) step(w, RUN_DT);
    expect(w.bodies[0].vel[0]).toBeCloseTo(-0.833, 3);
    expect(w.bodies[1].vel[0]).toBeCloseTo(-12.214, 3);
    expect(Math.abs(w.bodies[0].vel[0])).toBeLessThan(1);
  });
});

describe('the scenario pack the graded widgets measure against', () => {
  it('the sketch curve climbs at 3 m/s² to 13 m/s, then stays flat forever', () => {
    const curve = sketch['up-ch4-push-then-release'].truth();
    const at = (t: number) => curve.reduce((best, p) => (Math.abs(p.x - t) < Math.abs(best.x - t) ? p : best)).y;

    expect(at(0)).toBeCloseTo(4, 6);
    expect(at(1.5)).toBeCloseTo(8.5, 2);
    expect(at(3)).toBeCloseTo(13, 2);
    // The whole point: nothing happens after the hand lets go.
    expect(at(4)).toBeCloseTo(at(6), 6);
    expect(at(6)).toBeCloseTo(13, 2);
    // And it is a straight climb, not a curve flattening toward an asymptote.
    expect(at(2) - at(1)).toBeCloseTo(at(3) - at(2), 4);
  });

  it('the estimate is the honest closed form, not a typed-in number', () => {
    expect(estimate['up-ch4-car-to-walking-pace'].truth()).toBeCloseTo(
      timeToReachSpeed(1400, 300, 1.4),
      12,
    );
    expect(estimate['up-ch4-car-to-walking-pace'].truth()).toBeCloseTo(6.533, 3);
  });
});

describe('contactForces reports exactly what the integrator used', () => {
  it('labels the normal and friction arrows onto the right body', () => {
    const b = body('block', 5, { vel: [2, 0] });
    const rough = { angleRad: 0, muS: 0.5, muK: 0.3 };
    const sol = solveContact(b, [gravityOn(b)], rough);
    const fs = contactForces(b, sol, rough);
    expect(fs.map((f) => f.kind)).toEqual(['normal', 'friction']);
    expect(fs.every((f) => f.on === 'block')).toBe(true);
    expect(fs[1].vec[0]).toBeLessThan(0);
  });
});
