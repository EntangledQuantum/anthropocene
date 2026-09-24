/**
 * Claims made by chapter 6, "Only the shared piece counts" and "The area keeps
 * the score", checked against the same functions the RopeSled, BrakeToStop,
 * StretchSpring and CartThroughFans scenes run.
 */
import { describe, expect, it } from 'vitest';
import {
  BOW, CAR, FANS, SLED, SPRING,
  bowArrowSpeed, brakeRun, cartRun, fastestAngle, halfWorkStretch, leastLaunchSpeed,
  sledForces, sledRun, springWork,
} from '../work-scenes-ch06.ts';
import { kineticEnergy } from '../work.ts';
import { signedArea } from '../work-area.ts';

const base = { mass: SLED.mass, pull: SLED.pull, v0: SLED.v0, distance: SLED.distance };
const ice = (angleDeg: number) => sledRun({ ...base, mu: 0, angleDeg });
const snow = (angleDeg: number) => sledRun({ ...base, mu: SLED.muSnow, angleDeg });

describe('the rope on ice: only the along-the-ice piece counts', () => {
  it('a flat rope brings the sled to the flag fastest, and any tilt up is slower', () => {
    expect(fastestAngle({ ...base, mu: 0 }).angleDeg).toBe(0);
    expect(ice(30).vEnd).toBeLessThan(ice(0).vEnd);
    expect(ice(0).vEnd).toBeCloseTo(10.25, 2);
    expect(ice(30).vEnd).toBeCloseTo(9.6, 2);
  });

  it('the rope straight up pulls the full 60 N and leaves the speed at exactly 3 m/s', () => {
    const r = ice(90);
    expect(Math.hypot(...sledForces({ ...base, mu: 0, angleDeg: 90 }).rope)).toBeCloseTo(60, 9);
    expect(r.ropeWork).toBeCloseTo(0, 9);
    expect(r.vEnd).toBeCloseTo(3, 6);
  });

  it('on the 5° grid, 90° is the only angle that arrives within 0.2 m/s of 3 m/s', () => {
    const ok = Array.from({ length: 37 }, (_, i) => i * 5).filter((a) => ice(a).reached && Math.abs(ice(a).vEnd - 3) <= 0.2);
    expect(ok).toEqual([90]);
  });

  it('the rope work is F cos θ times the distance, and it equals the measured ΔK', () => {
    for (const a of [0, 30, 60, 85, 95]) {
      const r = ice(a);
      expect(r.ropeWork).toBeCloseTo(60 * Math.cos((a * Math.PI) / 180) * 8, 6);
      expect(r.deltaK).toBeCloseTo(r.ropeWork, 3);
    }
  });

  it('tilted back past 90° the rope does negative work, and far enough back it stops the sled and drags it back', () => {
    expect(ice(95).ropeWork).toBeLessThan(0);
    expect(ice(95).reached).toBe(true);
    const r = ice(120);
    expect(r.reached).toBe(false);
    expect(r.turnsBack).toBe(true);
    expect(r.ropeWork).toBeCloseTo(-kineticEnergy(SLED.mass, SLED.v0), 3);
  });
});

describe('the rope on snow: net work is the sum, and lifting helps', () => {
  it('snow is fastest with the rope tilted up about 25°, near tan θ = μ, not flat', () => {
    const best = fastestAngle({ ...base, mu: SLED.muSnow });
    expect(best.angleDeg).toBe(25);
    expect((Math.atan(SLED.muSnow) * 180) / Math.PI).toBeCloseTo(26.6, 1);
    expect(snow(0).vEnd).toBeCloseTo(5.15, 2);
  });

  it('beating 6 m/s takes a tilt between 20° and 35°', () => {
    const ok = Array.from({ length: 19 }, (_, i) => i * 5).filter((a) => snow(a).reached && snow(a).vEnd > 6);
    expect(ok).toEqual([20, 25, 30, 35]);
  });

  it('tilting from 0° to 25° costs the rope 45 J but saves 101 J of snow work', () => {
    expect(snow(0).ropeWork - snow(25).ropeWork).toBeCloseTo(45, 0);
    expect(snow(25).surfaceWork - snow(0).surfaceWork).toBeCloseTo(101.4, 0);
  });

  it('rope work plus snow work equals the measured change in ½mv², for every angle that arrives', () => {
    for (const a of [0, 15, 25, 45, 70]) {
      const r = snow(a);
      expect(r.ropeWork + r.surfaceWork).toBeCloseTo(r.deltaK, 3);
    }
  });

  it('with the rope straight up on snow, the sled stops and stays stopped', () => {
    const r = snow(90);
    expect(r.reached).toBe(false);
    expect(r.turnsBack).toBe(false);
  });
});

describe('brakes: stopping distance goes as v²', () => {
  it('from 10 m/s the car stops in 10 m', () => {
    expect(brakeRun(CAR.refSpeed).distance).toBeCloseTo(10, 6);
  });

  it('twice the speed takes four times the distance: 20 m/s stops in 40 m, at the cone', () => {
    expect(brakeRun(20).distance).toBeCloseTo(40, 6);
    expect(brakeRun(20).distance / brakeRun(10).distance).toBeCloseTo(4, 6);
  });

  it('only 19 and 20 m/s stop within 4 m short of the cone; 21 m/s overshoots', () => {
    const ok = Array.from({ length: 31 }, (_, v) => v).filter((v) => {
      const d = brakeRun(v).distance;
      return d <= CAR.cone + 1e-6 && d >= CAR.cone - 4;
    });
    expect(ok).toEqual([19, 20]);
    expect(brakeRun(21).distance).toBeGreaterThan(CAR.cone);
  });

  it('the brakes do negative work equal to the kinetic energy they remove', () => {
    for (const v of [10, 20, 28]) {
      const r = brakeRun(v);
      expect(r.brakeWork).toBeCloseTo(-r.K0, 0);
      expect(r.states[r.states.length - 1].v).toBe(0);
    }
  });
});

describe('the spring: the second centimetre costs more than the first', () => {
  it('the first 5 cm cost 1 J and the next 5 cm cost 3 J', () => {
    expect(springWork(SPRING.k, 0, 0.05)).toBeCloseTo(1, 9);
    expect(springWork(SPRING.k, 0.05, 0.1)).toBeCloseTo(3, 9);
  });

  it('the area is ½kx²', () => {
    for (const x of [0.02, 0.07, 0.12]) expect(springWork(SPRING.k, 0, x)).toBeCloseTo(0.5 * SPRING.k * x * x, 9);
  });

  it('half the work of a 10 cm stretch is done at 7.07 cm, not 5 cm', () => {
    expect(halfWorkStretch(SPRING.k, SPRING.full)).toBeCloseTo(SPRING.full / Math.SQRT2, 6);
    expect(springWork(SPRING.k, 0, 0.05)).toBeLessThan(springWork(SPRING.k, 0.05, 0.1));
  });
});

describe('the fans: the running area decides whether the cart gets through', () => {
  it('the two lobes cancel: total work over the track is zero', () => {
    expect(signedArea(FANS).work).toBeCloseTo(0, 9);
    expect(signedArea(FANS).negative).toBeCloseTo(-40, 9);
  });

  it('the least launch speed is √8 ≈ 2.83 m/s: enough for the 40 J dip, not for the zero total', () => {
    expect(leastLaunchSpeed(FANS)).toBeCloseTo(Math.sqrt(8), 6);
  });

  it('2.8 m/s turns back inside the first fan; 2.9 m/s gets through', () => {
    expect(cartRun(FANS, 2.8).reached).toBe(false);
    expect(cartRun(FANS, 2.8).turnedAt!).toBeLessThan(2);
    expect(cartRun(FANS, 2.9).reached).toBe(true);
  });

  it('a cart that gets through leaves at its launch speed: zero net area, zero ΔK', () => {
    for (const v of [2.9, 4]) {
      const r = cartRun(FANS, v);
      expect(r.deltaK).toBeCloseTo(0, 3);
      expect(r.workDone).toBeCloseTo(0, 3);
    }
  });

  it('turning back happens where the running area first equals −K₀', () => {
    const r = cartRun(FANS, 2);
    expect(signedArea(FANS, r.turnedAt!).work).toBeCloseTo(-r.K0, 3);
  });
});

describe('the bow', () => {
  it('a bow drawn 0.5 m to 300 N stores 75 J and sends a 25 g arrow off at about 77 m/s', () => {
    expect(springWork(BOW.peak / BOW.draw, 0, BOW.draw)).toBeCloseTo(75, 9);
    expect(bowArrowSpeed()).toBeCloseTo(77.46, 2);
  });

  it('the rectangle mistake (peak force times draw) overshoots by √2, outside a factor of 1.3', () => {
    const wrong = Math.sqrt((2 * BOW.peak * BOW.draw) / BOW.arrow);
    expect(wrong / bowArrowSpeed()).toBeCloseTo(Math.SQRT2, 6);
    expect(wrong / bowArrowSpeed()).toBeGreaterThan(1.3);
  });
});

describe('the cone', () => {
  it('from 28 m/s the car reaches the 40 m cone still doing about 19.6 m/s', async () => {
    const { speedPassing } = await import('../work-scenes-ch06.ts');
    expect(speedPassing(brakeRun(28).states, CAR.cone)).toBeCloseTo(Math.sqrt(28 * 28 - 2 * 5 * 40), 2);
    expect(speedPassing(brakeRun(15).states, CAR.cone)).toBe(0);
  });
});
