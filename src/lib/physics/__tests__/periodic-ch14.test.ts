import { describe, expect, it } from 'vitest';
import {
  DRIFT, FLUTTER, RACE, SHAKE, SWING, bestShakeHz, bouncePeriod, driftGL, driftTargetAngle, driftTick,
  floatingBlockPeriod, flutterOnset, flutterPeriod, flutterStep, growthPerCycle, lagAfterTicks, middleSpeed,
  peakAngle, pendulumStep, periodExcessPercent, rad, deg, racePeriod, settledSwing, shakeOsc, shakenStep,
  shove, shoveGain, springCart, swingEnergy, swingGL, vTroughPeriod,
} from '../periodic-ch14.ts';
import { G, measuredResponse, pendulumPeriodRatio, peakGain, steadyAmplitude } from '../oscillator.ts';

/** Time of the n-th upward zero crossing of x(t), integrated with `step`. */
function crossings(step: (x: number, v: number, dt: number) => [number, number], x0: number, v0: number, tEnd: number, dt: number) {
  let x = x0, v = v0, t = 0;
  const out: number[] = [];
  while (t < tEnd) {
    const [nx, nv] = step(x, v, dt);
    if (x < 0 && nx >= 0) out.push(t + dt * (-x / (nx - x)));
    x = nx; v = nv; t += dt;
  }
  return out;
}

describe('lesson 1: twice the pull, the same clock', () => {
  it('a cart pulled twice as far returns at the same moment (independent integration)', () => {
    const k = RACE.k, m = RACE.m;
    const step = (x: number, v: number, dt: number): [number, number] => {
      // plain RK4 of x'' = -(k/m)x, not the closed form the scene uses
      const a = (xx: number) => -(k / m) * xx;
      const k1x = v, k1v = a(x), k2x = v + dt / 2 * k1v, k2v = a(x + dt / 2 * k1x);
      const k3x = v + dt / 2 * k2v, k3v = a(x + dt / 2 * k2x), k4x = v + dt * k3v, k4v = a(x + dt * k3x);
      return [x + dt / 6 * (k1x + 2 * k2x + 2 * k3x + k4x), v + dt / 6 * (k1v + 2 * k2v + 2 * k3v + k4v)];
    };
    const small = crossings(step, 0.3, 0, 12, 1e-4), big = crossings(step, 0.6, 0, 12, 1e-4);
    expect(small.length).toBe(big.length);
    small.forEach((t, i) => expect(big[i]).toBeCloseTo(t, 6));
    expect(small[1] - small[0]).toBeCloseTo(racePeriod(), 5);
    expect(racePeriod()).toBeCloseTo(Math.PI, 12);
  });
  it('twice the pull gives twice the speed through the middle', () => {
    expect(middleSpeed(0.6) / middleSpeed(0.3)).toBeCloseTo(2, 12);
    expect(middleSpeed(0.3)).toBeCloseTo(0.6, 12);
    // and the closed-form cart really passes the middle at that speed
    const quarter = springCart(0.6, racePeriod() / 4);
    expect(quarter.x).toBeCloseTo(0, 12);
    expect(Math.abs(quarter.v)).toBeCloseTo(1.2, 12);
  });
  it('four times the mass doubles the period whatever the pull', () => {
    expect(racePeriod(4, 4) / racePeriod(4, 1)).toBeCloseTo(2, 12);
  });
});

describe('lesson 1: the pendulum falls off the clock', () => {
  it('the real period grows with release angle: 0.19% at 10°, 18% at 90°, 2.4394× at 170°', () => {
    expect(periodExcessPercent(rad(10))).toBeCloseTo(0.19, 2);
    expect(periodExcessPercent(rad(90))).toBeCloseTo(18.0, 1);
    expect(periodExcessPercent(rad(60))).toBeCloseTo(7.3, 1);
    expect(pendulumPeriodRatio(rad(170))).toBeCloseTo(2.4394, 3);
  });
  it('the target angle for half a cycle lost in ten ticks is about 51°', () => {
    const th = driftTargetAngle();
    expect(deg(th)).toBeGreaterThan(49);
    expect(deg(th)).toBeLessThan(53);
    expect(lagAfterTicks(th)).toBeCloseTo(0.5, 9);
    expect(periodExcessPercent(th)).toBeCloseTo(5.26, 1);
  });
  it('released there, the integrated sine pendulum is at the far side after ten ideal ticks', () => {
    const th0 = driftTargetAngle();
    const dt = 1e-4, n = Math.round((DRIFT.ticks * driftTick) / dt);
    let th = th0, w = 0;
    for (let i = 0; i < n; i++) [th, w] = pendulumStep(th, w, driftGL, 0, dt);
    // ideal bob is back at +θ0; the real one within a couple of degrees of −θ0
    expect(Math.abs(deg(th) + deg(th0))).toBeLessThan(2);
  });
  it('at 10° the drift over ten ticks is under two hundredths of a cycle', () => {
    expect(lagAfterTicks(rad(10))).toBeLessThan(0.02);
    expect(lagAfterTicks(rad(30))).toBeGreaterThan(0.1);
  });
  it('the integrated pendulum period matches the exact elliptic value', () => {
    const t = crossings((x, v, dt) => pendulumStep(x, v, driftGL, 0, dt), rad(-120), 0, 6 * driftTick, 1e-4);
    expect((t[1] - t[0]) / driftTick).toBeCloseTo(pendulumPeriodRatio(rad(120)), 4);
  });
});

describe('lesson 1 transfer: which clocks care about size', () => {
  it('a puck in a V-trough takes √2 longer when released twice as far (integrated)', () => {
    const a = 2;
    const step = (x: number, v: number, dt: number): [number, number] => {
      const nv = v - a * Math.sign(x) * dt;
      return [x + nv * dt, nv];
    };
    for (const A of [0.2, 0.4]) {
      const c = crossings(step, -A, 0, 8, 1e-5);
      expect(c[1] - c[0]).toBeCloseTo(vTroughPeriod(A, a), 3);
    }
    expect(vTroughPeriod(0.4, a) / vTroughPeriod(0.2, a)).toBeCloseTo(Math.SQRT2, 12);
  });
  it('a bouncing ball dropped from twice the height takes √2 longer', () => {
    expect(bouncePeriod(2) / bouncePeriod(1)).toBeCloseTo(Math.SQRT2, 12);
  });
  it('a straight-sided floating block bobs with the same period at any size (integrated)', () => {
    const d = 0.05; // submerged depth at rest, m
    // buoyancy per unit mass: g (d + y)/d minus gravity g, with y the extra depth pushed down
    const step = (y: number, v: number, dt: number): [number, number] => {
      const acc = (yy: number) => G - G * (d + yy) / d;
      const nv = v + acc(y) * dt;
      return [y + nv * dt, nv];
    };
    const periods = [0.005, 0.02].map((A) => { const c = crossings(step, -A, 0, 3, 1e-6); return c[1] - c[0]; });
    expect(periods[0]).toBeCloseTo(floatingBlockPeriod(d), 4);
    expect(periods[1]).toBeCloseTo(floatingBlockPeriod(d), 4);
  });
});

describe('lesson 2: when to shove a swing', () => {
  it('a shove adds most energy where the seat moves away fastest, almost none at a turning point, and removes energy against the motion', () => {
    const fast = Math.sqrt(2 * swingGL * (1 - Math.cos(rad(20))));
    expect(shoveGain(fast)).toBeGreaterThan(8 * shoveGain(0));
    expect(shoveGain(0)).toBeCloseTo(0.5 * SWING.kick ** 2, 12);
    expect(shoveGain(-fast)).toBeLessThan(0);
    // shoveGain is exactly the energy change of the shove
    expect(swingEnergy(0, shove(fast)) - swingEnergy(0, fast)).toBeCloseTo(shoveGain(fast), 12);
  });

  /** Run the swing for 60 s, shoving whenever `when` says so, at most SWING.shoves times. */
  function pump(when: (th: number, w: number, prevTh: number, prevW: number) => boolean) {
    let th = rad(SWING.start), w = 0, left = SWING.shoves, best = 0;
    const dt = 1e-3;
    for (let i = 0; i < 60000; i++) {
      const [nth, nw] = pendulumStep(th, w, swingGL, SWING.beta, dt);
      if (left > 0 && when(nth, nw, th, w)) { left--; th = nth; w = shove(nw); }
      else { th = nth; w = nw; }
      best = Math.max(best, peakAngle(th, w));
    }
    return deg(best);
  }
  it('ten shoves timed at the bottom, moving away, reach the 30° mark', () => {
    expect(pump((th, w, pth) => pth < 0 && th >= 0 && w > 0)).toBeGreaterThan(SWING.target + 2);
  });
  it('ten shoves at the far turning point, or on the way back toward you, do not', () => {
    expect(pump((_th, w, _p, pw) => pw < 0 && w >= 0)).toBeLessThan(15);
    expect(pump((th, w, pth) => pth > 0 && th <= 0 && w < 0)).toBeLessThan(SWING.start + 0.01);
  });
});

describe('lesson 2: shaking the end of the spring', () => {
  /** Settled amplitude from an actual run with a phase-continuous drive. */
  function settle(hz: number) {
    const om = 2 * Math.PI * hz, dt = 1 / 2000;
    let x = 0, v = 0, ph = 0, peak = 0;
    for (let i = 0; i < 40 * 2000; i++) {
      [x, v] = shakenStep(shakeOsc, x, v, ph, om, dt);
      ph += om * dt;
      if (i > 35 * 2000) peak = Math.max(peak, Math.abs(x));
    }
    return peak;
  }
  it('the integrated swing settles to the steady-state amplitude', () => {
    for (const hz of [0.8, bestShakeHz(), 1.5]) expect(settle(hz) / settledSwing(hz)).toBeCloseTo(1, 2);
  });
  it('the widest swing is a little below 1.2 Hz, and finite: about Q times the hand', () => {
    expect(bestShakeHz()).toBeLessThan(SHAKE.f0);
    expect(bestShakeHz()).toBeGreaterThan(0.99 * SHAKE.f0);
    const peak = settledSwing(bestShakeHz());
    expect(peak / SHAKE.hand).toBeCloseTo(peakGain(shakeOsc), 9);
    expect(peak / SHAKE.hand).toBeGreaterThan(7.9);
    expect(peak / SHAKE.hand).toBeLessThan(8.1);
    // halving the damping roughly doubles the peak
    const light = { ...shakeOsc, beta: shakeOsc.beta / 2 };
    expect(steadyAmplitude(light, 2 * Math.PI * SHAKE.f0) / steadyAmplitude(shakeOsc, 2 * Math.PI * SHAKE.f0)).toBeCloseTo(2, 9);
  });
  it('at the widest swing the cart runs a quarter-cycle behind the hand (measured)', () => {
    const lag = measuredResponse(shakeOsc, 2 * Math.PI * bestShakeHz()).phaseLag;
    expect(Math.abs(lag * 180 / Math.PI - 90)).toBeLessThan(5);
  });
  it('4% off the best rate still keeps most of the peak; 25% off loses most of it', () => {
    const best = settledSwing(bestShakeHz());
    expect(settledSwing(bestShakeHz() * 1.04) / best).toBeGreaterThan(0.75);
    expect(settledSwing(bestShakeHz() * 1.25) / best).toBeLessThan(0.3);
  });
});

describe('lesson 2: flutter is damping with the wrong sign', () => {
  function measuredGrowth(U: number) {
    const dt = 1e-3;
    let th = 0, w = 0.1, prevTh = 0, prevW = w;
    const peaks: number[] = [];
    for (let i = 0; i < 20000; i++) {
      prevTh = th; prevW = w;
      [th, w] = flutterStep(th, w, U, dt);
      if (prevW > 0 && w <= 0) peaks.push(Math.max(prevTh, th));
    }
    return peaks[4] / peaks[3];
  }
  it('below the onset wind a twist dies; above it, it grows; the ratio matches the closed form', () => {
    for (const U of [0, 12, 16.5, 19.5, 25]) expect(measuredGrowth(U)).toBeCloseTo(growthPerCycle(U), 3);
    expect(growthPerCycle(16.5)).toBeLessThan(1);
    expect(growthPerCycle(19.5)).toBeGreaterThan(1);
    expect(growthPerCycle(flutterOnset())).toBeCloseTo(1, 12);
    expect(flutterOnset()).toBeCloseTo(FLUTTER.onset, 12);
  });
  it('the wind sets no rhythm: the twisting period is the deck’s own at every wind speed', () => {
    const p0 = flutterPeriod(0);
    for (const U of [10, 20, 30]) expect(Math.abs(flutterPeriod(U) / p0 - 1)).toBeLessThan(0.002);
    expect(p0).toBeCloseTo(1 / FLUTTER.f0, 2);
  });
});
