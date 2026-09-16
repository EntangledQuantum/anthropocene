import { describe, expect, it } from 'vitest';
import {
  LANDSCAPES,
  equilibriaOf,
  measuredPeriod,
} from '../landscape.ts';
import {
  amplitudeForPeriodExcess,
  averagePower,
  betaForPeakGain,
  circlePoint,
  dampingRegime,
  ellipticK,
  halfPowerWidth,
  measuredResponse,
  peakGain,
  pendulumPeriod,
  pendulumPeriodRatio,
  pendulumSeriesRatio,
  qualityFactor,
  resonantFrequency,
  ringingFrequency,
  runDriven,
  shmA,
  shmSamples,
  shmV,
  shmX,
  smallAnglePeriod,
  staticResponse,
  steadyAmplitude,
  steadyPhaseLag,
  type Driven,
} from '../oscillator.ts';

const deg = (rad: number) => (rad * 180) / Math.PI;
const rad = (d: number) => (d * Math.PI) / 180;

/* ── the projection claim ─────────────────────────────────────────────────
   The chapter's reusable picture is that SHM *is* the shadow of uniform
   circular motion. If that is true then the shadow's velocity is the
   x-component of the tangent vector and its acceleration is the x-component
   of the centripetal vector — and the acceleration is −ω² times the position.
   All three are claims a lesson makes, so all three get a test.
   ──────────────────────────────────────────────────────────────────────── */

describe('SHM is a shadow of uniform circular motion', () => {
  const s = { A: 1.7, omega: 2.3, phase: 0.4 };

  it('the shadow of the tangent vector is the velocity', () => {
    for (const t of [0, 0.31, 0.77, 1.4, 2.9]) {
      expect(circlePoint(s, t).vx).toBeCloseTo(shmV(s, t), 12);
    }
  });

  it('the shadow of the centripetal vector is the acceleration', () => {
    for (const t of [0, 0.31, 0.77, 1.4, 2.9]) {
      expect(circlePoint(s, t).ax).toBeCloseTo(shmA(s, t), 12);
    }
  });

  it('and that acceleration obeys the defining equation a = −ω²x', () => {
    for (const t of [0, 0.31, 0.77, 1.4, 2.9]) {
      expect(shmA(s, t)).toBeCloseTo(-(s.omega ** 2) * shmX(s, t), 12);
    }
  });

  it('the same thing measured by differencing the position twice', () => {
    // Not a restatement of the formula: this differentiates x(t) numerically
    // and asks whether the result really is −ω²x.
    const h = 1e-4;
    for (const t of [0.2, 1.1, 2.5]) {
      const second = (shmX(s, t + h) - 2 * shmX(s, t) + shmX(s, t - h)) / (h * h);
      expect(second).toBeCloseTo(-(s.omega ** 2) * shmX(s, t), 5);
    }
  });

  it('speed is largest at the middle and zero at the ends', () => {
    const path = shmSamples({ A: 1, omega: 1, phase: 0 }, 0, 2 * Math.PI, 2001);
    const atEnd = path.reduce((best, p) => (Math.abs(p.x) > Math.abs(best.x) ? p : best));
    const fastest = path.reduce((best, p) => (Math.abs(p.v) > Math.abs(best.v) ? p : best));
    expect(Math.abs(atEnd.v)).toBeLessThan(0.01);
    expect(Math.abs(fastest.x)).toBeLessThan(0.01);
  });
});

/* ── the real pendulum ───────────────────────────────────────────────────── */

describe('elliptic integral', () => {
  it('K(0) = π/2', () => {
    expect(ellipticK(0)).toBeCloseTo(Math.PI / 2, 14);
  });

  it('K(1/2) matches the tabulated value', () => {
    expect(ellipticK(0.5)).toBeCloseTo(1.8540746773013719, 12);
  });

  it('diverges as the modulus approaches one', () => {
    expect(ellipticK(1 - 1e-10)).toBeGreaterThan(12);
    expect(ellipticK(1)).toBe(Number.POSITIVE_INFINITY);
  });
});

describe('the period of a real pendulum', () => {
  it('reduces to 2π√(L/g) for a tiny swing', () => {
    // Not exactly equal, and it should not be: even at 10⁻⁴ rad the swing is
    // longer by the θ₀²/16 term, which is a relative 6.25×10⁻¹⁰ — about
    // 1.3×10⁻⁹ in absolute time. Asserting equality to 5×10⁻¹⁰ would be
    // asserting against real physics.
    expect(pendulumPeriod(1e-4)).toBeCloseTo(smallAnglePeriod(), 8);
    expect(pendulumPeriodRatio(1e-4) - 1).toBeCloseTo(1e-8 / 16, 12);
  });

  it('is longer for a bigger swing, never shorter', () => {
    let prev = pendulumPeriod(0.01);
    for (const d of [10, 30, 60, 90, 120, 150, 170]) {
      const T = pendulumPeriod(rad(d));
      expect(T).toBeGreaterThan(prev);
      prev = T;
    }
  });

  it('the textbook numbers: 1.18× at 90°, 2.44× at 170°', () => {
    // T/T₀ = (2/π)·K(sin(θ₀/2)). At 90°, K(½) = 1.85407 → 1.1803.
    // At 170°, K(sin 85°) = 3.83174 → 2.4394. The 3× figure belongs much
    // closer to 180° — the divergence is logarithmic and very late.
    expect(pendulumPeriodRatio(rad(90))).toBeCloseTo(1.1803, 3);
    expect(pendulumPeriodRatio(rad(170))).toBeCloseTo(2.4394, 3);
  });

  it('the two-term series is good to 1e-4 out to 45° and visibly wrong at 150°', () => {
    // 5.8×10⁻⁵ at 45° — inside the 1e-4 the name claims, which is what this
    // asserts. `toBeCloseTo(…, 4)` would demand 5×10⁻⁵ and fail on physics.
    const err45 = Math.abs(pendulumSeriesRatio(rad(45)) - pendulumPeriodRatio(rad(45)));
    expect(err45).toBeLessThan(1e-4);
    expect(Math.abs(pendulumSeriesRatio(rad(150)) - pendulumPeriodRatio(rad(150)))).toBeGreaterThan(0.1);
  });

  it('the 1% threshold sits near 23° — smaller than anyone guesses', () => {
    const th = amplitudeForPeriodExcess(0.01);
    expect(deg(th)).toBeGreaterThan(22);
    expect(deg(th)).toBeLessThan(24);
    expect(pendulumPeriodRatio(th)).toBeCloseTo(1.01, 6);
  });

  it('a clock that keeps 5° swings is right to 5 parts in 10,000', () => {
    expect(pendulumPeriodRatio(rad(5)) - 1).toBeCloseTo(4.76e-4, 5);
  });
});

/* ── the two engines have to agree ────────────────────────────────────────
   `measuredPeriod` times a velocity-Verlet run on the potential landscape.
   `pendulumPeriod` evaluates an elliptic integral by the AGM. They share no
   code whatsoever, so agreeing to a fraction of a percent is real evidence
   that the widget's clock and the lesson's formula describe one world.
   ──────────────────────────────────────────────────────────────────────── */

describe('the simulated pendulum and the exact period agree', () => {
  // U = 4(1 − cos θ) at unit mass, so g/L = 4 and T = 2·K(sin²(θ₀/2)).
  const exact = (theta0: number) => pendulumPeriod(theta0, 1, 4);

  it('small-angle period is π for this landscape', () => {
    expect(exact(1e-6)).toBeCloseTo(Math.PI, 6);
    // The pendulum's domain runs past ±π, so the scan finds the two unstable
    // maxima as well — and index 0 is the one at −π, which has no small
    // oscillation and therefore no omega. Ask for the stable one.
    const bottom = equilibriaOf(LANDSCAPES.pendulum, 1).find((e) => e.stability === 'stable')!;
    expect(bottom.x).toBeCloseTo(0, 6);
    expect(bottom.omega).toBeCloseTo(2, 5);
  });

  for (const d of [10, 45, 90, 120, 150]) {
    it(`released from ${d}°, simulated and exact match within 0.2%`, () => {
      const measured = measuredPeriod(LANDSCAPES.pendulum, rad(d), { dt: 5e-4, steps: 60_000 })!;
      expect(measured).toBeDefined();
      expect(Math.abs(measured / exact(rad(d)) - 1)).toBeLessThan(2e-3);
    });
  }

  it('the spring stays flat while the pendulum climbs', () => {
    const springOmega = equilibriaOf(LANDSCAPES.spring, 1)[0].omega!;
    const springT = (2 * Math.PI) / springOmega;
    for (const a of [0.2, 0.8, 1.6, 2.2]) {
      const measured = measuredPeriod(LANDSCAPES.spring, a, { dt: 5e-4, steps: 60_000 })!;
      expect(Math.abs(measured / springT - 1)).toBeLessThan(2e-3);
    }
    // Same fractional range of the domain, wildly different answer. At 2.2 rad
    // (126°) the exact ratio against a 0.2 rad swing is 1.425, so the swing is
    // more than 40% slower — the spring's is flat to 0.2% across the same span.
    const p1 = measuredPeriod(LANDSCAPES.pendulum, 0.2, { dt: 5e-4, steps: 60_000 })!;
    const p2 = measuredPeriod(LANDSCAPES.pendulum, 2.2, { dt: 5e-4, steps: 60_000 })!;
    expect(p2 / p1).toBeCloseTo(exact(2.2) / exact(0.2), 2);
    expect(p2 / p1).toBeGreaterThan(1.4);
  });
});

/* ── driving and resonance ───────────────────────────────────────────────── */

const P: Driven = { omega0: 1, beta: 0.12, drive: 1, mass: 1 };

describe('three frequencies that are not the same frequency', () => {
  it('the amplitude peaks below ω₀, at √(ω₀² − 2β²)', () => {
    const wr = resonantFrequency(P);
    expect(wr).toBeCloseTo(Math.sqrt(1 - 2 * 0.12 ** 2), 12);
    expect(wr).toBeLessThan(P.omega0);
    // and it really is the peak of the computed curve
    const scan = Array.from({ length: 4001 }, (_, i) => 0.5 + (i * 1) / 4000);
    const best = scan.reduce((b, w) => (steadyAmplitude(P, w) > steadyAmplitude(P, b) ? w : b));
    expect(best).toBeCloseTo(wr, 3);
  });

  it('the free ringing sits at √(ω₀² − β²), between the two', () => {
    expect(ringingFrequency(P)).toBeCloseTo(Math.sqrt(1 - 0.12 ** 2), 12);
    expect(ringingFrequency(P)).toBeGreaterThan(resonantFrequency(P));
    expect(ringingFrequency(P)).toBeLessThan(P.omega0);
  });

  it('with no peak at all once β ≥ ω₀/√2', () => {
    const heavy: Driven = { ...P, beta: 0.9 };
    expect(resonantFrequency(heavy)).toBe(0);
    expect(peakGain(heavy)).toBeCloseTo(1, 12);
  });
});

describe('phase is the part people miss', () => {
  it('the lag is exactly 90° at ω₀, whatever the damping', () => {
    for (const beta of [0.02, 0.12, 0.4, 0.9, 2]) {
      expect(steadyPhaseLag({ ...P, beta }, 1)).toBeCloseTo(Math.PI / 2, 12);
    }
  });

  it('runs from in-step to fully opposed as the drive speeds up', () => {
    expect(deg(steadyPhaseLag(P, 0.02))).toBeLessThan(1);
    expect(deg(steadyPhaseLag(P, 1))).toBeCloseTo(90, 9);
    expect(deg(steadyPhaseLag(P, 40))).toBeGreaterThan(179);
  });

  it('and never folds back — the lag increases monotonically', () => {
    let prev = -1;
    for (let i = 1; i <= 400; i++) {
      const lag = steadyPhaseLag(P, (i * 4) / 400);
      expect(lag).toBeGreaterThan(prev);
      prev = lag;
    }
  });

  it('lighter damping makes the swing from 0° to 180° sharper', () => {
    const width = (beta: number) => {
      const p = { ...P, beta };
      // frequency span over which the lag crosses from 45° to 135°
      const at = (targetDeg: number) => {
        let lo = 0.01;
        let hi = 4;
        for (let i = 0; i < 80; i++) {
          const mid = (lo + hi) / 2;
          if (deg(steadyPhaseLag(p, mid)) < targetDeg) lo = mid;
          else hi = mid;
        }
        return (lo + hi) / 2;
      };
      return at(135) - at(45);
    };
    expect(width(0.04)).toBeLessThan(width(0.3));
  });
});

describe('power, width and Q', () => {
  it('the power peaks exactly at ω₀, not at the amplitude peak', () => {
    const scan = Array.from({ length: 4001 }, (_, i) => 0.5 + i / 4000);
    const best = scan.reduce((b, w) => (averagePower(P, w) > averagePower(P, b) ? w : b));
    expect(best).toBeCloseTo(1, 3);
    expect(averagePower(P, 1)).toBeGreaterThan(averagePower(P, resonantFrequency(P)));
  });

  it('the half-power width found by bisection is exactly 2β', () => {
    for (const beta of [0.03, 0.12, 0.4]) {
      const p = { ...P, beta };
      const { lo, hi, width } = halfPowerWidth(p);
      expect(width).toBeCloseTo(2 * beta, 9);
      // the closed form for each shoulder, too
      expect(lo).toBeCloseTo(-beta + Math.sqrt(p.omega0 ** 2 + beta ** 2), 9);
      expect(hi).toBeCloseTo(beta + Math.sqrt(p.omega0 ** 2 + beta ** 2), 9);
      expect(p.omega0 / width).toBeCloseTo(qualityFactor(p), 9);
    }
  });
});

describe('resonance is not infinite', () => {
  it('the peak is finite for every real damping, and grows like 1/β', () => {
    for (const beta of [0.2, 0.05, 0.01, 0.002]) {
      const gain = peakGain({ ...P, beta });
      expect(Number.isFinite(gain)).toBe(true);
      // ratio to the light-damping estimate Q = ω₀/2β approaches 1 from above
      expect(gain / qualityFactor({ ...P, beta })).toBeGreaterThan(0.999);
      expect(gain / qualityFactor({ ...P, beta })).toBeLessThan(1.03);
    }
    expect(peakGain({ ...P, beta: 0.005 }) / peakGain({ ...P, beta: 0.01 })).toBeCloseTo(2, 1);
  });

  it('and it takes longer to arrive as the damping falls', () => {
    // Time for the response to first reach 90% of its steady amplitude,
    // measured on the real transient.
    const riseTime = (beta: number) => {
      const p = { ...P, beta };
      const target = 0.9 * steadyAmplitude(p, p.omega0);
      const run = runDriven(p, p.omega0, { periods: Math.ceil(40 / beta / (2 * Math.PI)) });
      const hit = run.find((s) => Math.abs(s.x) >= target);
      return hit ? hit.t : Number.POSITIVE_INFINITY;
    };
    expect(riseTime(0.05)).toBeGreaterThan(riseTime(0.2) * 2);
  });

  it('betaForPeakGain inverts the peak height', () => {
    for (const gain of [2, 5, 20]) {
      const beta = betaForPeakGain(gain, 1);
      expect(peakGain({ omega0: 1, beta, drive: 1, mass: 1 })).toBeCloseTo(gain, 6);
    }
    // The Tune target: gain 5 is NOT beta = 0.1 exactly.
    expect(betaForPeakGain(5, 1)).toBeCloseTo(0.100504, 5);
  });
});

describe('the integration agrees with the closed form', () => {
  it('measured amplitude and phase match the steady-state formulas', () => {
    for (const omega of [0.4, 0.85, 1.0, 1.25, 2.2]) {
      const m = measuredResponse(P, omega);
      expect(Math.abs(m.amplitude / steadyAmplitude(P, omega) - 1)).toBeLessThan(5e-3);
      expect(Math.abs(m.phaseLag - steadyPhaseLag(P, omega))).toBeLessThan(0.02);
    }
  });

  it('at resonance the measured lag is a quarter cycle', () => {
    const m = measuredResponse({ ...P, beta: 0.2 }, 1);
    expect(deg(m.phaseLag)).toBeCloseTo(90, 0);
  });

  it('the transient really is a transient — it starts from rest at zero', () => {
    const run = runDriven(P, 1, { periods: 30 });
    expect(run[0].x).toBe(0);
    expect(run[0].v).toBe(0);
    const early = Math.max(...run.slice(0, 60).map((s) => Math.abs(s.x)));
    const late = Math.max(...run.slice(-200).map((s) => Math.abs(s.x)));
    expect(late).toBeGreaterThan(early * 5);
    expect(late).toBeCloseTo(steadyAmplitude(P, 1), 1);
  });

  it('driven far below ω₀ the mass just follows the drive', () => {
    const slow = 0.02;
    const m = measuredResponse(P, slow);
    expect(m.amplitude).toBeCloseTo(staticResponse(P), 2);
    expect(deg(m.phaseLag)).toBeLessThan(3);
  });
});

describe('damping regimes', () => {
  it('names the three stories', () => {
    expect(dampingRegime({ ...P, beta: 0 })).toBe('undamped');
    expect(dampingRegime({ ...P, beta: 0.3 })).toBe('under');
    expect(dampingRegime({ ...P, beta: 1 })).toBe('critical');
    expect(dampingRegime({ ...P, beta: 3 })).toBe('over');
  });
});
