/**
 * Claims made by chapter 11, "Equilibrium and Elasticity", checked against
 * the same code the LevelTheSeesaw, TorquesAnywhere, WalkThePlank,
 * MatchTheStretch and WireSpringBack scenes run.
 */
import { describe, expect, it } from 'vitest';
import { G_EARTH, netForceOn } from '../dynamics.ts';
import {
  COPPER, STEEL, balancingPosition, bicepsPull, farthestReach, hookeExtension, inStaticEquilibrium,
  loadForce, newWire, pivotPush, plankForces, pullWire, seesawStep, seesawTorque, strain, stress,
  supportForce, supportReactions, tipStep, torqueAbout, torqueLedger, wireArea, yieldLoad,
  type PointLoad, type TiltState,
} from '../statics.ts';

/* ── lesson 1: two sums, both zero ─────────────────────────────────────── */

describe('the seesaw (LevelTheSeesaw)', () => {
  const child: PointLoad = { label: 'child', mass: 25, x: 0.4 };
  const plank = { mass: 20, length: 4 };

  it('a 40 kg sack balances a 25 kg child 1.6 m out when it sits 1.0 m out', () => {
    expect(balancingPosition([child], 40, 2)).toBeCloseTo(3.0, 12);
  });

  it('balanced, the two turning effects are each 392 N·m', () => {
    expect(25 * G_EARTH * 1.6).toBeCloseTo(392.4, 6);
    expect(seesawTorque([child, { label: 'sack', mass: 40, x: 3.0 }], 2)).toBeCloseTo(0, 9);
  });

  it('the pivot still pushes: it carries every weight, 833 N with the plank', () => {
    const loads = [child, { label: 'sack', mass: 40, x: 3.0 }, { label: 'plank', mass: 20, x: 2 }];
    expect(pivotPush(loads)).toBeCloseTo(85 * G_EARTH, 9);
    expect(pivotPush(loads)).toBeCloseTo(833.85, 2);
  });

  it('let go balanced, it stays level; 5 cm off, it tips toward the heavier turn', () => {
    const run = (x: number) => {
      const s: TiltState = { theta: 0, omega: 0 };
      for (let i = 0; i < 240 * 3; i++) seesawStep(s, [child, { label: 'sack', mass: 40, x }, { label: 'plank', mass: 20, x: 2 }], plank, 0.2, 1 / 240);
      return s.theta;
    };
    expect(run(3.0)).toBe(0);
    expect(run(2.95)).toBeGreaterThan(0.1); // left end down
    expect(run(3.05)).toBeLessThan(-0.1); // right end down
  });
});

describe('two conditions, not one', () => {
  it('a couple adds to zero force and still turns the plank, by the same amount about any point', () => {
    const couple = [supportForce('up', 0, 20), { ...supportForce('down', 2, -20), id: 'down' }];
    expect(netForceOn('beam', couple)).toEqual([0, 0]);
    const t0 = torqueAbout([0, 0], couple);
    expect(Math.abs(t0)).toBeCloseTo(40, 9);
    for (const p of [[1, 0], [-3, 2], [7, -5]] as const) expect(torqueAbout(p, couple)).toBeCloseTo(t0, 9);
    expect(inStaticEquilibrium(couple)).toBe(false);
  });

  it('the plank with the painter satisfies both sums', () => {
    const f = plankForces({ mass: 30, length: 4 }, { label: 'painter', mass: 60, x: 2.8 }, 0.5, 3.0);
    expect(inStaticEquilibrium(f, 1e-9, 1e-9)).toBe(true);
  });
});

describe('take torques anywhere (TorquesAnywhere)', () => {
  const f = plankForces({ mass: 30, length: 4 }, { label: 'painter', mass: 60, x: 2.8 }, 0.5, 3.0);

  it('in equilibrium the ledger adds to zero about every point, on the plank or off it', () => {
    for (const p of [[0.5, 0], [3, 0], [2, 1.3], [-4, -2], [10, 5]] as const) {
      const sum = torqueLedger(p, f).reduce((a, l) => a + l.torque, 0);
      expect(sum).toBeCloseTo(0, 9);
    }
  });

  it('about the left trestle its push has no arm, so the right push follows from one line', () => {
    const L = torqueLedger([0.5, 1.2], f);
    expect(L.find((l) => l.label === 'left trestle')!.torque).toBeCloseTo(0, 12);
    expect(supportReactions([{ label: 'plank', mass: 30, x: 2 }, { label: 'painter', mass: 60, x: 2.8 }], 0.5, 3.0).right).toBeCloseTo(718.1, 1);
  });

  it('moving the point up or down changes no arm: the arm is to the line of action, not the point', () => {
    const a = torqueLedger([1.7, 0], f), b = torqueLedger([1.7, 2.5], f);
    a.forEach((l, i) => expect(b[i].torque).toBeCloseTo(l.torque, 9));
  });
});

describe('the painter on the overhang (WalkThePlank)', () => {
  it('hook: plank half her weight, 1 m overhang, she gets exactly halfway along it', () => {
    expect(farthestReach({ mass: 30, length: 4 }, 60, 3.0) - 3.0).toBeCloseTo(0.5, 12);
  });

  it('at the reach the left trestle pushes nothing; a step further it would have to pull', () => {
    const plank = { mass: 40, length: 4.5 };
    const x = farthestReach(plank, 70, 3.2);
    expect(x - 3.2).toBeCloseTo(0.543, 3);
    const at = (px: number) => supportReactions([{ label: 'plank', mass: 40, x: 2.25 }, { label: 'painter', mass: 70, x: px }], 0.5, 3.2);
    expect(at(x).left).toBeCloseTo(0, 9);
    expect(at(x - 0.1).left).toBeGreaterThan(0);
    expect(at(x + 0.1).left).toBeLessThan(0);
  });

  it('past the reach the plank turns about the right trestle; short of it, it does not', () => {
    const plank = { mass: 40, length: 4.5 };
    const x = farthestReach(plank, 70, 3.2);
    const run = (px: number) => {
      const s: TiltState = { theta: 0, omega: 0 };
      for (let i = 0; i < 480; i++) tipStep(s, plank, { label: 'painter', mass: 70, x: px }, 3.2, 0.5, 1 / 240);
      return s.theta;
    };
    expect(run(x - 0.05)).toBe(0);
    expect(run(x + 0.1)).toBeGreaterThan(0.05);
  });
});

describe('the forearm (estimate)', () => {
  it('a 5 kg dumbbell 35 cm out needs about 480 N from a biceps 4 cm out: ten times its weight', () => {
    const F = bicepsPull({ loadMass: 5, loadArm: 0.35, armMass: 1.5, armCg: 0.15, muscleArm: 0.04 });
    expect(F).toBeCloseTo(484.2, 0);
    expect(F / (5 * G_EARTH)).toBeGreaterThan(9);
  });

  it('the answer does not depend on how you find it: torques about the biceps give the elbow push', () => {
    const F = bicepsPull({ loadMass: 5, loadArm: 0.35, armMass: 1.5, armCg: 0.15, muscleArm: 0.04 });
    const w = [loadForce({ label: 'load', mass: 5, x: 0.35 }), loadForce({ label: 'forearm', mass: 1.5, x: 0.15 })];
    const elbow = -(F - 6.5 * G_EARTH); // pushes down on the forearm
    const all = [...w, supportForce('biceps', 0.04, F), supportForce('elbow', 0, elbow)];
    expect(inStaticEquilibrium(all, 1e-9, 1e-9)).toBe(true);
  });
});

/* ── lesson 2: what springs back ───────────────────────────────────────── */

const thin = { length: 2, diameter: 1e-3, material: COPPER };
const thick = { length: 2, diameter: 2e-3, material: COPPER };

describe('thick and thin (MatchTheStretch)', () => {
  it('30 N stretches 2 m of 1 mm copper by 0.65 mm', () => {
    expect(pullWire(newWire(), thin, 30).extension * 1000).toBeCloseTo(0.653, 3);
  });

  it('twice the diameter stretches a quarter as far, not half', () => {
    const a = pullWire(newWire(), thin, 30).extension, b = pullWire(newWire(), thick, 30).extension;
    expect(b / a).toBeCloseTo(0.25, 12);
  });

  it('four times the force on the thick wire matches the stretch, because the stress matches', () => {
    const a = pullWire(newWire(), thin, 30), b = pullWire(newWire(), thick, 120);
    expect(b.extension).toBeCloseTo(a.extension, 12);
    expect(b.stress).toBeCloseTo(a.stress, 6);
    expect(a.stress / 1e6).toBeCloseTo(38.2, 1);
  });

  it('a longer wire at the same stress stretches more millimetres but the same fraction', () => {
    const a = pullWire(newWire(), thin, 30), b = pullWire(newWire(), { ...thin, length: 4 }, 30);
    expect(b.extension / a.extension).toBeCloseTo(2, 12);
    expect(b.strain).toBeCloseTo(a.strain, 15);
  });

  it('stress and strain are the definitions the scene prints', () => {
    expect(stress(30, wireArea(1e-3))).toBeCloseTo(3.82e7, -5);
    expect(strain(0.653e-3, 2)).toBeCloseTo(3.27e-4, 6);
  });
});

describe('the crane cable (estimate)', () => {
  it('100 m of 2 cm steel under two tonnes stretches about 3 cm', () => {
    const d = hookeExtension(2000 * G_EARTH, 100, wireArea(0.02), STEEL.E);
    expect(d).toBeCloseTo(0.0312, 3);
    // and it is well inside the elastic range
    expect(stress(2000 * G_EARTH, wireArea(0.02))).toBeLessThan(STEEL.yieldStress / 3);
  });
});

describe('the elastic limit (WireSpringBack)', () => {
  it('1 mm copper reaches its limit at 55 N', () => {
    expect(yieldLoad(COPPER, 1e-3)).toBeCloseTo(54.98, 2);
  });

  it('below the limit, extension is proportional to load, and it springs all the way back', () => {
    const s = newWire();
    const e20 = pullWire(s, thin, 20).extension, e40 = pullWire(s, thin, 40).extension;
    expect(e40 / e20).toBeCloseTo(2, 12);
    pullWire(s, thin, 54);
    expect(pullWire(s, thin, 0).extension).toBe(0);
  });

  it('about 1.2 mm of stretch at the limit, then a couple of newtons more buys millimetres', () => {
    const atLimit = pullWire(newWire(), thin, yieldLoad(COPPER, 1e-3)).extension;
    expect(atLimit * 1000).toBeCloseTo(1.197, 3);
    const past = pullWire(newWire(), thin, 58).extension;
    expect(past * 1000).toBeGreaterThan(4 * atLimit * 1000);
  });

  it('past the limit it keeps a permanent stretch, and comes back down a line parallel to the one it went up', () => {
    const s = newWire();
    const up = pullWire(s, thin, 58);
    const off = pullWire(s, thin, 0);
    expect(off.extension * 1000).toBeGreaterThan(3);
    expect(off.extension).toBeCloseTo(up.permanent, 15);
    // unloading slope = loading slope below the limit (E A / L)
    const k = (COPPER.E * wireArea(1e-3)) / 2;
    expect(58 / (up.extension - off.extension)).toBeCloseTo(k, 3);
    // reloading to the old peak retraces that line: no new flow
    expect(pullWire(s, thin, 58).extension).toBeCloseTo(up.extension, 15);
  });
});

describe('stiff is not strong', () => {
  it('steel is stiffer than copper (stretches less) and also has a higher limit, but the two are separate numbers', () => {
    const cu = hookeExtension(30, 2, wireArea(1e-3), COPPER.E), st = hookeExtension(30, 2, wireArea(1e-3), STEEL.E);
    expect(st).toBeLessThan(cu);
    // a thicker copper wire is harder to stretch, yet its material limit is unchanged
    expect(yieldLoad(COPPER, 2e-3) / yieldLoad(COPPER, 1e-3)).toBeCloseTo(4, 12);
    expect(COPPER.yieldStress).toBe(70e6);
  });
});
