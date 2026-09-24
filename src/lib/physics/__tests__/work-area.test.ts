import { describe, expect, it } from 'vitest';
import { AREA_INITIAL_K, AREA_PROFILES, areaBreaks, areaForce, areaProfile, areaSketch, firstAreaBoundary, inspectWorkArea, signedArea, workAreaTrial } from '../work-area.ts';

describe('variable-force work: geometry is independent of endpoint force', () => {
  it('integrates triangles and trapezoids rather than ranking peaks', () => {
    const narrow = areaProfile('narrow'), broad = areaProfile('broad');
    expect(signedArea(narrow).work).toBe(2 * 40 / 2);
    expect(signedArea(broad).work).toBe(20 / 2 + 2 * 20 + 20 / 2);
    expect(areaForce(narrow, 4)).toBe(0);
    expect(areaForce(broad, 4)).toBe(0);
  });
  it('splits negative regions at exact zero crossings', () => {
    const p = [{ x: 0, force: 30 }, { x: 4, force: -10 }];
    expect(areaBreaks(p).map(p => p.x)).toEqual([0, 3, 4]);
    expect(signedArea(p)).toEqual({ work: 40, positive: 45, negative: -5 });
    expect(signedArea(p, 2).work).toBe(40);
  });
  it('cancels two lobes without erasing either', () => {
    expect(signedArea(areaProfile('cancel'))).toEqual({ positive: 40, negative: -40, work: 0 });
    expect(signedArea(areaProfile('reverse'))).toEqual({ positive: 40, negative: -40, work: 0 });
    expect(signedArea(areaProfile('cancel'), 2).work).toBe(40);
  });
  it('rejects nonmonotone or unbounded authored profiles', () => {
    expect(() => workAreaTrial([{ x: 0, force: 0 }, { x: 4, force: 100 }])).toThrow();
    expect(() => workAreaTrial([{ x: 0, force: 0 }, { x: 0, force: 2 }, { x: 4, force: 0 }])).toThrow();
    expect(() => workAreaTrial(areaProfile('cancel'), 0)).toThrow();
  });
});

describe('independent Newtonian kinetic-energy measurement', () => {
  it.each(Object.keys(AREA_PROFILES) as (keyof typeof AREA_PROFILES)[])('%s agrees with area throughout a reachable passage', name => {
    const trial = workAreaTrial(areaProfile(name));
    expect(trial.outcome).toBe('reached');
    expect(trial.limit).toBe(4);
    for (let x = 0; x <= 4; x += 0.1) {
      const s = inspectWorkArea(trial, x);
      expect(s.K).toBeGreaterThanOrEqual(0);
      expect(Math.abs(s.deltaK - s.work)).toBeLessThan(0.01);
    }
  });
  it('the cumulative energy bends upward then downward, not like the force graph', () => {
    const trial = workAreaTrial(areaProfile('cancel'));
    // Integrals: 20x² on [0,1], then 40−20(2−x)² on [1,2].
    for (const [x, expected] of [[0, 80], [0.5, 85], [1, 100], [1.5, 115], [2, 120], [3, 100], [4, 80]]) {
      expect(inspectWorkArea(trial, x).K).toBeCloseTo(expected, 2);
    }
    expect(areaSketch()[0].y).toBe(80);
    expect(areaSketch().at(-1)!.y).toBeCloseTo(80, 2);
  });
  it('same signed total does not imply the same reachable path', () => {
    const safe = workAreaTrial(areaProfile('cancel'), AREA_INITIAL_K.low);
    const blocked = workAreaTrial(areaProfile('reverse'), AREA_INITIAL_K.low);
    expect(safe.limit).toBe(4);
    expect(safe.planned.work).toBe(blocked.planned.work);
    // K=20−20x² first reaches zero at x=1, well before the later push.
    expect(blocked.boundary).toBeCloseTo(1, 10);
    expect(blocked.limit).toBeCloseTo(1, 10);
    expect(blocked.stopped).toBe(true);
    expect(blocked.numericalStop).toBeCloseTo(1, 5);
    const stop = inspectWorkArea(blocked, 4);
    expect(stop.x).toBeCloseTo(1, 10);
    expect(stop.work).toBeCloseTo(-20, 10);
    expect(stop.K).toBe(0);
    expect(blocked.samples.every(s => s.x <= 1 + 1e-9 && s.K >= 0)).toBe(true);
  });
  it('finds a forbidden interval even when endpoint energy is positive', () => {
    expect(firstAreaBoundary(areaProfile('reverse'), 20)).toBeCloseTo(1, 10);
    expect(firstAreaBoundary(areaProfile('reverse'), 50)).toBe(null);
    expect(firstAreaBoundary(areaProfile('reverse'), 40)).toBeCloseTo(2, 6);
  });
  it('remains bounded for a strong opposing field', () => {
    const trial = workAreaTrial([{ x: 0, force: -60 }, { x: 4, force: -60 }], 20);
    expect(trial.limit).toBeCloseTo(1 / 3, 9);
    expect(inspectWorkArea(trial, -1).x).toBe(0);
    expect(inspectWorkArea(trial, 100).K).toBe(0);
  });
});
