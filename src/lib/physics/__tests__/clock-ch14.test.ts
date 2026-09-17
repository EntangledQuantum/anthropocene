import { describe, expect, it } from 'vitest';
import { clockFrame, leftReleaseVelocity, pendulumClock, springClock } from '../clock-ch14.ts';
import { LANDSCAPES, measuredPeriod } from '../landscape.ts';

describe('chapter 14: a bigger swing, the same clock', () => {
  it('twice the amplitude doubles displacement, speed and acceleration, not period', () => {
    const small = springClock(0.5), large = springClock(1);
    expect(large.period).toBeCloseTo(small.period, 12);
    for (const t of [0, 0.2, 0.9, 1.7, 2.9]) {
      const a = clockFrame(0.5, 1, t), b = clockFrame(1, 1, t);
      for (const key of ['px', 'vx', 'ax'] as const) expect(b[key]).toBeCloseTo(2 * a[key], 12);
    }
    // Independent numerical clock, not merely re-evaluating the period formula.
    for (const release of [0.5, 1]) {
      const measured = measuredPeriod(LANDSCAPES.spring, release, { dt: 0.001, steps: 15000 });
      expect(measured).not.toBeNull();
      expect(measured!).toBeCloseTo(small.period, 4);
    }
  });
  it('quarter-cycle is fastest with zero acceleration; turning points reverse this', () => {
    const { period } = springClock(1);
    const end = clockFrame(1, 1, 0), middle = clockFrame(1, 1, period / 4);
    expect(end.vx).toBeCloseTo(0, 12);
    expect(end.ax).toBeCloseTo(-4, 12);
    expect(middle.px).toBeCloseTo(0, 12);
    expect(middle.ax).toBeCloseTo(0, 12);
    expect(middle.vx).toBeCloseTo(-2, 12);
  });
  it('four times the mass doubles the period with unchanged spring', () => {
    expect(springClock(1, 4).period / springClock(1, 1).period).toBeCloseTo(2, 12);
  });
  it('doubling spring stiffness in the transfer shortens period by sqrt(2)', () => {
    expect(springClock(0.3, 2, 18).period / springClock(0.3, 2, 9).period).toBeCloseTo(1 / Math.sqrt(2), 12);
  });
  it('the left-release velocity sketch has positive then negative lobes, not a cosine', () => {
    const truth = leftReleaseVelocity();
    expect(truth[0].y).toBeCloseTo(0, 12);
    expect(truth[40].y).toBeCloseTo(1.2, 12);
    expect(truth[80].y).toBeCloseTo(0, 12);
    expect(truth[120].y).toBeCloseTo(-1.2, 12);
    expect(truth[160].y).toBeCloseTo(0, 12);
  });
  it('the pendulum exceeds the small-angle period by 0.19% at 10° and 18.03% at 90°', () => {
    expect(pendulumClock(10).excessPercent).toBeCloseTo(0.1907, 3);
    expect(pendulumClock(90).excessPercent).toBeCloseTo(18.034, 2);
  });
  it('the actual sine-force trace returns at its own period, not the small-angle period', () => {
    const p = pendulumClock(90);
    const at = (t: number) => p.samples[Math.round(t / 0.002)];
    expect(at(p.period).x).toBeCloseTo(p.angle, 4);
    expect(Math.abs(at(p.referencePeriod).x - p.angle)).toBeGreaterThan(0.5);
    expect(at(p.referencePeriod).v).toBeGreaterThan(0);
    const E0 = p.samples[0].E;
    expect(Math.max(...p.samples.map(s => Math.abs(s.E - E0))) / E0).toBeLessThan(1e-5);
  });
});
