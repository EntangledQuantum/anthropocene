import { describe, expect, it } from 'vitest';
import {
  C, CH37_PAIRS, CH37_TILT_MAX, CH37_TRAIN, MUON, addVelocity, arrivalGapOnWatchUs, atmosphereForMuon, betaForGamma,
  boost, contracted, ctToUs, dctIn, delayForTrainNow, dilated, flashArrivals, gamma, groundTimeFor, interval,
  lightClockHalfTick, lightClockPhoton, lightClockTick, muonClockAfter, muonJustReaches, muonRange,
  muonRangeUndilated, muonReachBeta, muonSurvival, muonSurvivalUndilated, separation, simultaneousBeta,
  tickRatio, trainStrikes, zigzagLeg,
} from '../relativity.ts';

const betas = [-0.9, -0.6, -0.3, -0.05, 0, 0.1, 0.5, 0.6, 0.8, 0.866, 0.9];

describe('the light clock', () => {
  it('ticks slower by exactly γ, computed from the zig-zag and not from γ', () => {
    for (const beta of [0, 0.3, 0.6, 0.8, 0.866, 0.99]) {
      expect(tickRatio(1, beta * C)).toBeCloseTo(gamma(beta), 10);
    }
  });

  it('draws each leg as a right triangle whose slant is light going at c', () => {
    for (const beta of [0.2, 0.6, 0.9]) {
      const leg = zigzagLeg(1, beta * C);
      expect(leg.slant).toBeCloseTo(C * leg.t, 6);
      expect(leg.slant ** 2).toBeCloseTo(leg.up ** 2 + leg.along ** 2, 12);
    }
  });

  it('halves its rate at v = √3/2 c, where the slant is twice the gap', () => {
    const b = betaForGamma(2);
    expect(b).toBeCloseTo(Math.sqrt(3) / 2, 12);
    expect(tickRatio(1, b * C)).toBeCloseTo(2, 10);
    expect(zigzagLeg(1, b * C).slant).toBeCloseTo(2, 10);
  });

  it('puts the photon back on the floor mirror after every tick, and at the top half way', () => {
    const c = 1.6, gap = 1, v = 0.8 * c;
    const T = lightClockTick(gap, v, c);
    expect(lightClockPhoton(T, gap, v, c)[1]).toBeCloseTo(0, 9);
    expect(lightClockPhoton(T / 2, gap, v, c)[1]).toBeCloseTo(gap, 9);
    expect(lightClockPhoton(T, gap, v, c)[0]).toBeCloseTo(v * T, 9);
    expect(lightClockHalfTick(gap, 0, c)).toBeCloseTo(gap / c, 12);
  });
});

describe('cosmic-ray muons', () => {
  const h = MUON.height, tau = MUON.lifetime;

  it('would cover only about 660 m in one lifetime if its clock kept ground time', () => {
    expect(C * tau).toBeGreaterThan(650);
    expect(C * tau).toBeLessThan(670);
    expect(muonRangeUndilated(0.998)).toBeLessThan(h / 20);
  });

  it('at 0.998c goes about 10 km: far more than 660 m, but not 15 km', () => {
    // The lesson brief proposed 0.998c from 15 km; the numbers say that is short.
    expect(muonRange(0.998)).toBeGreaterThan(10_000);
    expect(muonRange(0.998)).toBeLessThan(h);
  });

  it('at the payoff speed 0.9995c reaches the ground with its clock short of 2.2 µs', () => {
    const b = MUON.betaShown;
    expect(muonRange(b)).toBeGreaterThan(h);
    expect(muonClockAfter(h, b)).toBeLessThan(tau);
    expect(muonClockAfter(h, b) * 1e6).toBeCloseTo(1.58, 2);
    expect(groundTimeFor(h, b) * 1e6).toBeCloseTo(50.1, 1);
  });

  it('needs at least 0.99904c, γ ≈ 23, to reach the ground in one lifetime', () => {
    const b = muonReachBeta();
    expect(muonRange(b)).toBeCloseTo(h, 6);
    expect(b).toBeGreaterThan(0.99903);
    expect(b).toBeLessThan(0.99905);
    expect(gamma(b)).toBeCloseTo(22.8, 1);
    expect(muonJustReaches(b + 1e-7)).toBe(true);
    expect(muonJustReaches(b - 1e-5)).toBe(false);
    expect(muonJustReaches(MUON.betaShown)).toBe(false); // it overshoots by far
  });

  it('the "just reaches" band sits inside the speed control window', () => {
    const b = muonReachBeta();
    expect(b).toBeGreaterThan(MUON.betaWindow[0]);
    expect(b).toBeLessThan(MUON.betaWindow[1]);
  });

  it('lets about half through at 0.9995c, where ground-time clocks would let through one in ten billion', () => {
    expect(muonSurvival(h, MUON.betaShown)).toBeCloseTo(0.49, 2);
    expect(muonSurvivalUndilated(h, MUON.betaShown)).toBeLessThan(1e-9);
  });

  it('in its own frame sees the air contracted to exactly the distance it covers in 2.2 µs', () => {
    const b = muonReachBeta();
    expect(atmosphereForMuon(h, b)).toBeCloseTo(b * C * tau, 6);
    expect(atmosphereForMuon(h, b)).toBeGreaterThan(640);
    expect(atmosphereForMuon(h, b)).toBeLessThan(670);
    // both frames agree whether it reaches the ground, at every speed
    for (const beta of [0.99, 0.999, 0.9995, 0.9999]) {
      expect(muonRange(beta) >= h).toBe(beta * C * tau >= atmosphereForMuon(h, beta));
    }
  });

  it('dilation and contraction are the same γ', () => {
    expect(dilated(1, 0.6)).toBeCloseTo(1.25, 12);
    expect(contracted(1, 0.6)).toBeCloseTo(0.8, 12);
  });
});

describe('simultaneity and the Lorentz transformation', () => {
  it('turns strikes simultaneous on the platform into Δt′ = −γvΔx/c² on the train', () => {
    const { rear, front, L } = trainStrikes(0);
    for (const beta of [0.2, 0.6, 0.9]) {
      expect(dctIn(rear, front, beta)).toBeCloseTo(-gamma(beta) * beta * (front.x - rear.x), 9);
    }
    // the lesson's number: the front strike is 0.80 µs early on the train
    expect(L).toBeCloseTo(320, 9);
    expect(ctToUs(dctIn(rear, front, CH37_TRAIN.beta))).toBeCloseTo(-0.8, 2);
  });

  it('brings the front flash to the passenger first when the strikes are platform-simultaneous', () => {
    const a = flashArrivals(0);
    expect(a.front.ct).toBeLessThan(a.rear.ct);
    expect(arrivalGapOnWatchUs(0)).toBeCloseTo(0.8, 2);
  });

  it('makes both flashes arrive together exactly when the strikes are simultaneous on the train', () => {
    const d = delayForTrainNow();
    expect(ctToUs(d)).toBeCloseTo(1.0, 2);
    const a = flashArrivals(d);
    expect(a.front.ct).toBeCloseTo(a.rear.ct, 9);
    expect(arrivalGapOnWatchUs(d)).toBeCloseTo(0, 9);
    const { rear, front } = trainStrikes(d);
    expect(dctIn(rear, front, CH37_TRAIN.beta)).toBeCloseTo(0, 9);
    // and every other delay leaves them unequal on the train
    expect(Math.abs(dctIn(rear, front, CH37_TRAIN.beta))).toBeLessThan(1e-9);
    expect(Math.abs(dctIn(trainStrikes(d - 30).rear, trainStrikes(d - 30).front, CH37_TRAIN.beta))).toBeGreaterThan(1);
  });

  it('puts the timed strikes on one line of now for a 0.6c train, and only that train', () => {
    const { a, b } = CH37_PAIRS.strikes;
    expect(simultaneousBeta(a, b)).toBeCloseTo(CH37_TRAIN.beta, 12);
    expect(separation(a, b)).toBe('spacelike');
    expect(b.x).toBeCloseTo(500, 9);
    expect(b.ct).toBeCloseTo(300, 9);
  });

  it('keeps the train still in its own frame and moves the platform at −v', () => {
    expect(addVelocity(CH37_TRAIN.beta, -CH37_TRAIN.beta)).toBe(0);
    expect(addVelocity(0, -CH37_TRAIN.beta)).toBe(-CH37_TRAIN.beta);
    expect(addVelocity(0.9, 0.9)).toBeLessThan(1);
  });

  it('keeps the interval invariant under every boost the diagram can make', () => {
    for (const pair of Object.values(CH37_PAIRS)) {
      const s = interval(pair.a, pair.b);
      for (let beta = -CH37_TILT_MAX; beta <= CH37_TILT_MAX + 1e-9; beta += 0.05) {
        expect(interval(boost(pair.a, beta), boost(pair.b, beta))).toBeCloseTo(s, 6);
      }
    }
    for (const beta of betas) {
      const s = interval(trainStrikes(0).rear, trainStrikes(0).front);
      expect(interval(boost(trainStrikes(0).rear, beta), boost(trainStrikes(0).front, beta))).toBeCloseTo(s, 6);
    }
  });

  it('never reverses a timelike pair: the flare follows the strike on every train', () => {
    const { a, b } = CH37_PAIRS.cause;
    expect(separation(a, b)).toBe('timelike');
    expect(simultaneousBeta(a, b)).toBeNull();
    for (let beta = -0.999; beta < 1; beta += 0.001) expect(dctIn(a, b, beta)).toBeGreaterThan(0);
    // the flare is inside the strike's light cone: the guard saw the flash before firing
    expect(b.x).toBeLessThan(b.ct);
  });

  it('can reverse a spacelike pair: a fast enough train sees the front strike first', () => {
    const { a, b } = CH37_PAIRS.strikes;
    expect(dctIn(a, b, 0)).toBeGreaterThan(0);
    expect(dctIn(a, b, 0.8)).toBeLessThan(0);
  });
});
