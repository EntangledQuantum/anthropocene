/**
 * Claims made by "Two bodies, two forces, one interaction" (chapter 4,
 * lesson 2), checked against the same code the CrashPair, PushThroughPair,
 * DrawTheSystem and ElevatorScale scenes run.
 */
import { describe, expect, it } from 'vitest';
import { accelerationOn, isThirdLawPair, netForceOnSystem, G_EARTH } from '../dynamics.ts';
import {
  crashHistory, crashPeaks, externalForces, liftState, pushedRow, systemAcceleration, tensionForReading,
} from '../pairs-ch04.ts';

describe('truck meets car', () => {
  const run = (mTruck: number) => crashHistory({ mCar: 1200, mTruck, vCar: 15, vTruck: -10 });

  it('at every instant the truck pushes the car exactly as hard as the car pushes the truck', () => {
    for (const s of run(14000)) expect(s.fOnCar + s.fOnTruck).toBe(0);
  });

  it('the bumpers really do meet, with a force in the hundreds of kilonewtons', () => {
    const p = crashPeaks(run(14000));
    expect(p.fCar).toBeGreaterThan(2e5);
    expect(p.fCar).toBeLessThan(2e6);
  });

  it('the peak forces are equal whatever the truck weighs', () => {
    for (const m of [1200, 5000, 14000, 40000]) {
      const p = crashPeaks(run(m));
      expect(p.fCar).toBe(p.fTruck);
    }
  });

  it('the accelerations differ by exactly the mass ratio, 14000 / 1200 ≈ 11.7', () => {
    const p = crashPeaks(run(14000));
    expect(p.aCar / p.aTruck).toBeCloseTo(14000 / 1200, 6);
  });

  it('afterwards the car has reversed and the truck has barely slowed', () => {
    const h = run(14000);
    const end = h[h.length - 1];
    expect(end.vCar).toBeLessThan(0);
    expect(end.vTruck).toBeGreaterThan(-10);
    expect(end.vTruck).toBeLessThan(-7);
  });
});

describe('push through a pair of blocks', () => {
  it('16 N on the 2 kg block puts 12 N on the 6 kg block, and 12 N back on the 2 kg', () => {
    const r = pushedRow([2, 6], 0, 16);
    expect(r.a).toBeCloseTo(2, 12);
    expect(r.links[0]).toBeCloseTo(12, 12);
    const [onB, onA] = r.forces.filter((f) => f.id.startsWith('link0'));
    expect(isThirdLawPair(onB, onA)).toBe(true);
    expect(onA.vec[0]).toBeCloseTo(-12, 12);
  });

  it('a 12 N push does not pass 12 N through: B gets 9 N', () => {
    expect(pushedRow([2, 6], 0, 12).links[0]).toBeCloseTo(9, 12);
  });

  it('both blocks get the same acceleration from their own forces', () => {
    const r = pushedRow([2, 6], 0, 16);
    expect(accelerationOn('b0', 2, r.forces)[0]).toBeCloseTo(2, 12);
    expect(accelerationOn('b1', 6, r.forces)[0]).toBeCloseTo(2, 12);
  });
});

describe('draw the system', () => {
  const r = pushedRow([2, 3, 3], 0, 16);

  it('the links carry 12 N and 6 N: each accelerates everything beyond it', () => {
    expect(r.links[0]).toBeCloseTo(12, 12);
    expect(r.links[1]).toBeCloseTo(6, 12);
  });

  it('every boundary gives the same 2 m/s², from its external forces alone', () => {
    const systems = [['b0'], ['b1'], ['b2'], ['b0', 'b1'], ['b1', 'b2'], ['b0', 'b1', 'b2']];
    for (const s of systems) expect(systemAcceleration(s, r)).toBeCloseTo(2, 12);
  });

  it('around all three, the only external force is the 16 N push; the links cancel', () => {
    const ext = externalForces(['b0', 'b1', 'b2'], r.forces);
    expect(ext.map((f) => f.id)).toEqual(['outside']);
    expect(netForceOnSystem(['b0', 'b1', 'b2'], r.forces)[0]).toBeCloseTo(16, 12);
  });

  it('blocks 2 and 3 together feel only the first link: 12 N, and nothing else', () => {
    const ext = externalForces(['b1', 'b2'], r.forces);
    expect(ext).toHaveLength(1);
    expect(ext[0].vec[0]).toBeCloseTo(12, 12);
  });

  it('block 2 alone feels both links, 12 N forward and 6 N back', () => {
    const ext = externalForces(['b1'], r.forces);
    expect(ext.map((f) => f.vec[0]).sort((x, y) => x - y)).toEqual([-6, 12].map((v) => expect.closeTo(v, 12)));
  });

  it('horse and cart: the harness pulls are internal, and the ground alone moves the pair', () => {
    const hc = pushedRow([300, 600], 1, 1800, 'the ground');
    expect(hc.links[0]).toBeCloseTo(-600, 12); // a pull, not a push
    const ext = externalForces(['b0', 'b1'], hc.forces);
    expect(ext.map((f) => f.by)).toEqual(['the ground']);
    expect(systemAcceleration(['b0', 'b1'], hc)).toBeCloseTo(2, 12);
    // The cart pulls back on the horse exactly as hard as the horse pulls the cart.
    const [onHorse, onCart] = hc.forces.filter((f) => f.id.startsWith('link0'));
    expect(isThirdLawPair(onHorse, onCart)).toBe(true);
  });
});

describe('a scale in a lift', () => {
  const mLift = 500, mRider = 70;
  const W = mRider * G_EARTH;

  it('balanced cable: no acceleration, the scale reads the full weight, 687 N', () => {
    const s = liftState((mLift + mRider) * G_EARTH, mLift, mRider);
    expect(s.a).toBeCloseTo(0, 12);
    expect(s.scale).toBeCloseTo(W, 9);
    expect(W).toBeCloseTo(686.7, 1);
  });

  it('a reading of 600 N needs the lift accelerating downward at about 1.24 m/s²', () => {
    const T = tensionForReading(600, mLift, mRider);
    const s = liftState(T, mLift, mRider);
    expect(s.scale).toBeCloseTo(600, 9);
    expect(s.a).toBeCloseTo(-1.239, 3);
    expect(T).toBeCloseTo(4886, 0);
  });

  it('the rider gets the lift\'s acceleration from its own two forces', () => {
    const s = liftState(6500, mLift, mRider);
    expect(accelerationOn('rider', mRider, s.forces)[1]).toBeCloseTo(s.a, 12);
    expect(accelerationOn('lift', mLift, s.forces)[1]).toBeCloseTo(s.a, 12);
  });

  it('the scale and the rider are a pair; the scale and the weight are not', () => {
    const s = liftState(6500, mLift, mRider);
    const onRider = s.forces.find((f) => f.id === 'scale')!;
    const partner = s.forces.find((f) => f.id === 'scale-partner')!;
    const w = s.forces.find((f) => f.id === 'w-rider')!;
    expect(isThirdLawPair(onRider, partner)).toBe(true);
    expect(isThirdLawPair(onRider, w)).toBe(false);
    expect(onRider.vec[1] + w.vec[1]).not.toBeCloseTo(0, 3);
  });

  it('cable cut: free fall, the scale reads zero, and the weight has not changed', () => {
    const s = liftState(0, mLift, mRider);
    expect(s.a).toBeCloseTo(-G_EARTH, 12);
    expect(s.scale).toBe(0);
    expect(s.riderWeight).toBeCloseTo(W, 12);
  });
});
