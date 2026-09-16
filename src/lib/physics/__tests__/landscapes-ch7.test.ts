import { describe, expect, it } from 'vitest';
import {
  LANDSCAPES,
  allowedRegions,
  equilibriaOf,
  rollMarble,
  turningPointsOf,
} from '../landscape.ts';
import {
  ALL_LANDSCAPES,
  CH7_LANDSCAPES,
  allowedWidth,
  barrierEnergy,
  fateOf,
  forceAt,
  shiftLandscape,
  slopeProfile,
  steepestPoint,
  swingCentre,
} from '../landscapes-ch7.ts';

/** A sign slip or a mis-differentiated tanh would push the marble uphill and
 *  still conserve energy perfectly — of the wrong system. Check the derivative
 *  the same way `landscape.test.ts` checks the shared five. */
describe('chapter-7 landscape derivatives', () => {
  for (const [key, land] of Object.entries(CH7_LANDSCAPES)) {
    it(`${key}: dU matches a finite difference of U`, () => {
      const [a, b] = land.domain;
      const h = 1e-6;
      for (const f of [0.1, 0.3, 0.5, 0.7, 0.9]) {
        const x = a + (b - a) * f;
        const fd = (land.U(x + h) - land.U(x - h)) / (2 * h);
        expect(land.dU(x)).toBeCloseTo(fd, 4);
      }
    });
  }

  it('exposes the shared five alongside the new ones without mutating them', () => {
    for (const key of Object.keys(LANDSCAPES)) expect(ALL_LANDSCAPES[key]).toBe(LANDSCAPES[key]);
    expect(ALL_LANDSCAPES.staircase).toBe(CH7_LANDSCAPES.staircase);
    expect(LANDSCAPES.staircase).toBeUndefined();
  });
});

/* ── the claim the "floor is your choice" lesson rests on ──────────────── */

describe('shifting the zero of U changes nothing measurable', () => {
  const base = LANDSCAPES.doubleWell;
  const C = 37.5;
  const lifted = shiftLandscape(base, C);

  it('moves U by exactly the constant and leaves dU untouched', () => {
    for (const x of [-2, -1.2, -0.1, 0.5, 1.3, 2]) {
      expect(lifted.U(x)).toBeCloseTo(base.U(x) + C, 12);
      expect(lifted.dU(x)).toBe(base.dU(x));
      expect(forceAt(lifted, x)).toBe(forceAt(base, x));
    }
  });

  it('keeps every turning point where it was, once E is shifted too', () => {
    const E = 1.2;
    const before = turningPointsOf(base, E);
    const after = turningPointsOf(lifted, E + C);
    expect(after).toHaveLength(before.length);
    before.forEach((t, i) => expect(after[i]).toBeCloseTo(t, 9));
  });

  it('keeps the equilibria and their stability', () => {
    const before = equilibriaOf(base);
    const after = equilibriaOf(lifted);
    expect(after).toHaveLength(before.length);
    before.forEach((e, i) => {
      expect(after[i].x).toBeCloseTo(e.x, 9);
      expect(after[i].stability).toBe(e.stability);
      expect(after[i].U).toBeCloseTo(e.U + C, 9);
    });
  });

  it('produces an identical trajectory', () => {
    const a = rollMarble(base, -1.6, 0, { dt: 0.002, steps: 8000 });
    const b = rollMarble(lifted, -1.6, 0, { dt: 0.002, steps: 8000 });
    for (let i = 0; i < a.length; i += 500) {
      expect(b[i].x).toBeCloseTo(a[i].x, 12);
      expect(b[i].v).toBeCloseTo(a[i].v, 12);
      expect(b[i].K).toBeCloseTo(a[i].K, 12);
      // Only the ledger's origin moved: E and U both up by C, K identical.
      expect(b[i].E).toBeCloseTo(a[i].E + C, 9);
    }
  });

  it('gives the same trapped/bound/runaway verdict', () => {
    for (const E of [0.8, 1.2, 1.5, 1.7, 3, 6]) {
      expect(fateOf(lifted, E + C)).toBe(fateOf(base, E));
    }
  });
});

/* ── high is not the same as steep ─────────────────────────────────────── */

describe('the staircase separates height from force', () => {
  const stair = CH7_LANDSCAPES.staircase;

  it('has its largest force at a middling height, not at the top', () => {
    const peak = steepestPoint(stair);
    const top = { x: 2.6, U: stair.U(2.6), F: forceAt(stair, 2.6) };

    // The top plateau is the highest ground in the picture...
    expect(top.U).toBeGreaterThan(peak.U);
    // ...and yet the force there is negligible next to the riser.
    expect(Math.abs(peak.F)).toBeGreaterThan(20 * Math.abs(top.F));
  });

  it('has near-zero force on both plateaus even though their U differs by ~6 J', () => {
    const low = { U: stair.U(-3.4), F: forceAt(stair, -3.4) };
    const high = { U: stair.U(2.6), F: forceAt(stair, 2.6) };
    expect(high.U - low.U).toBeGreaterThan(5.5);
    expect(Math.abs(low.F)).toBeLessThan(0.1);
    expect(Math.abs(high.F)).toBeLessThan(0.1);
  });

  it('pushes downhill everywhere — F and the slope have opposite signs', () => {
    for (const s of slopeProfile(stair, 61)) {
      expect(Math.sign(s.F)).toBe(-Math.sign(stair.dU(s.x)));
    }
  });
});

/* ── the barrier, and what the energy line decides ─────────────────────── */

describe('barrier energy and fate', () => {
  const dw = LANDSCAPES.doubleWell;

  it('puts the escape threshold at the top of the hill between the wells', () => {
    const top = equilibriaOf(dw).find((e) => e.stability === 'unstable')!;
    expect(barrierEnergy(dw)).toBeCloseTo(top.U, 9);
  });

  it('is null where there is no interior maximum', () => {
    expect(barrierEnergy(LANDSCAPES.spring)).toBeNull();
    expect(barrierEnergy(LANDSCAPES.gravityRamp)).toBeNull();
  });

  it('merges two allowed valleys into one exactly at the barrier', () => {
    const Eb = barrierEnergy(dw)!;
    expect(allowedRegions(dw, Eb - 0.02)).toHaveLength(2);
    expect(allowedRegions(dw, Eb + 0.02)).toHaveLength(1);
    expect(fateOf(dw, Eb - 0.02)).toBe('trapped');
    expect(fateOf(dw, Eb + 0.02)).toBe('bound');
    // Total allowed width barely changes — the forbidden sliver near the top
    // of the hill is thin. What jumps is the track available to a marble that
    // happens to be in the LEFT well: it more than doubles.
    const leftWell = -1.21;
    const reach = (E: number) => {
      const r = allowedRegions(dw, E).find(([lo, hi]) => lo <= leftWell && hi >= leftWell)!;
      return r[1] - r[0];
    };
    expect(reach(Eb + 0.02) / reach(Eb - 0.02)).toBeGreaterThan(2);
    expect(allowedWidth(dw, Eb + 0.02)).toBeGreaterThan(allowedWidth(dw, Eb - 0.02));
  });

  it('classifies every case the lesson asks the learner to sort', () => {
    expect(fateOf(LANDSCAPES.spring, 3)).toBe('bound');
    expect(fateOf(LANDSCAPES.pendulum, 3)).toBe('bound');
    expect(fateOf(LANDSCAPES.pendulum, 8.5)).toBe('runaway');
    expect(fateOf(LANDSCAPES.gravityRamp, 6)).toBe('runaway');
    expect(fateOf(LANDSCAPES.doubleWell, 1.2)).toBe('trapped');
    expect(fateOf(LANDSCAPES.doubleWell, 2.0)).toBe('bound');
    expect(fateOf(LANDSCAPES.lennardJones, -0.6)).toBe('bound');
    expect(fateOf(LANDSCAPES.lennardJones, 0.2)).toBe('runaway');
    expect(fateOf(LANDSCAPES.spring, -1)).toBe('impossible');
  });
});

/* ── the asymmetric well expands ───────────────────────────────────────── */

describe('swing centre', () => {
  it('never moves on a symmetric spring', () => {
    const a = swingCentre(LANDSCAPES.spring, 1, 0)!;
    const b = swingCentre(LANDSCAPES.spring, 8, 0)!;
    expect(a).toBeCloseTo(0, 6);
    expect(b).toBeCloseTo(0, 6);
  });

  it('creeps outward on a molecular bond as the energy rises — thermal expansion', () => {
    const cold = swingCentre(LANDSCAPES.lennardJones, -0.9, 1.12)!;
    const warm = swingCentre(LANDSCAPES.lennardJones, -0.6, 1.12)!;
    const hot = swingCentre(LANDSCAPES.lennardJones, -0.2, 1.12)!;
    expect(warm).toBeGreaterThan(cold);
    expect(hot).toBeGreaterThan(warm);
    expect(hot - cold).toBeGreaterThan(0.1);
  });
});
