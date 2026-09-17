import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ForceFromSlope from '../../../components/viz/ForceFromSlope.tsx';
import { LANDSCAPES, rollMarble } from '../landscape.ts';
import { CH7_LANDSCAPES, forceAt, shiftLandscape } from '../landscapes-ch7.ts';
import { sketch, tune } from '../../../components/learn/scenarios/up-ch7-landscapes.ts';

describe('chapter-7 probe server render', () => {
  it('renders prediction mode without disclosing force values', () => {
    const html = renderToStaticMarkup(createElement(ForceFromSlope, { hideForce: true, probeX: 2.6 }));
    expect(html).toContain('reveal force');
    expect(html).not.toContain('force −dU/dx');
    expect(html).toContain('position (m)');
  });
  it('shows tiny nonzero forces and never reports negative K as zero', () => {
    const html = renderToStaticMarkup(createElement(ForceFromSlope, { probeX: 2.6, showEnergy: true, energy: 0 }));
    expect(html).toContain('forbidden: E &lt; U');
    expect(html).toContain('-8.3e-4');
  });
});

describe('height-is-not-force lesson claims', () => {
  const steps = CH7_LANDSCAPES.staircase;
  it('compares the two authored probe positions honestly', () => {
    expect(steps.U(2.6)).toBeGreaterThan(steps.U(0.4));
    expect(forceAt(steps, 0.4)).toBeCloseTo(-3.30, 2);
    expect(forceAt(steps, 2.6)).toBeLessThan(0); // never claim perfectly flat
    expect(Math.abs(forceAt(steps, 2.6))).toBeLessThan(0.001);
    expect(forceAt(steps, -1.6)).toBeCloseTo(forceAt(steps, 0.4), 12);
  });
  it('crosses zero energy without changing the force at either probe', () => {
    const lower = shiftLandscape(steps, -4), upper = shiftLandscape(steps, 4);
    for (const x of [0.4, 2.6]) {
      expect(lower.U(x)).toBeLessThan(0);
      expect(upper.U(x)).toBeGreaterThan(0);
      expect(forceAt(lower, x)).toBe(forceAt(upper, x));
    }
    expect(lower.U(2.6) - lower.U(0.4)).toBeCloseTo(upper.U(2.6) - upper.U(0.4), 12);
  });
  it('force is not velocity: a particle can move uphill while accelerating downhill', () => {
    const states = rollMarble(steps, 0.4, 1, { dt: 0.001, steps: 20 });
    expect(states.at(-1)!.x).toBeGreaterThan(states[0].x);
    expect(states.at(-1)!.v).toBeLessThan(states[0].v);
    expect(states.at(-1)!.v).toBeGreaterThan(0);
  });
  it('the hunt has one strongest riser and accepts the authored target', () => {
    const s = tune['up-ch7-strongest-right-step'];
    expect(s.target).toBeCloseTo(0.4, 2);
    expect(Math.abs(0.4 - s.target) / Math.abs(s.target)).toBeLessThan(s.tolerance);
    expect(Math.abs(2.6 - s.target) / Math.abs(s.target)).toBeGreaterThan(s.tolerance);
    const data = s.compute(s.target);
    expect(data.series[0].points).toHaveLength(200);
    expect(data.readouts![0].value).toMatch(/^3\.30/);
    for (const [x, y] of data.series[0].points) expect(y).toBe(steps.U(x));
  });
  it('spring sketch is the descending force line of the displayed k=4 spring', () => {
    const truth = sketch['up-ch7-spring-force'].truth();
    expect(truth[0]).toEqual({ x: -2, y: 8 });
    expect(truth.at(-1)).toEqual({ x: 2, y: -8 });
    for (const p of truth) expect(p.y).toBe(forceAt(LANDSCAPES.spring, p.x));
    expect(LANDSCAPES.spring.U(-1)).toBe(LANDSCAPES.spring.U(1));
    expect(forceAt(LANDSCAPES.spring, -1)).toBe(4);
    expect(forceAt(LANDSCAPES.spring, 1)).toBe(-4);
  });
  it('uniform gravity has different heights and identical downward forces', () => {
    const g = LANDSCAPES.gravityRamp;
    expect(g.U(0)).toBe(0);
    expect(g.U(4)).toBe(8);
    for (const x of [-1, 0, 2, 4, 5]) expect(forceAt(g, x)).toBe(-2);
  });
});
