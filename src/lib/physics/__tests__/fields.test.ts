import { describe, expect, it } from 'vitest';
import {
  enclosedCharge,
  fieldAt,
  fluxThroughCircle,
  fluxThroughSphere,
  nullPoints,
  potentialAt,
  seedFieldLines,
  traceFieldLine,
  type Source,
} from '../fields.ts';

const TINY = { soften: 1e-6 };

describe('field superposition', () => {
  it('adds contributions rather than picking the nearest source', () => {
    const a: Source = { x: -1, y: 0, q: 1 };
    const b: Source = { x: 1, y: 0, q: 1 };
    const both = fieldAt([a, b], 0, 0.5, TINY);
    const one = fieldAt([a], 0, 0.5, TINY);
    const two = fieldAt([b], 0, 0.5, TINY);
    expect(both[0]).toBeCloseTo(one[0] + two[0], 10);
    expect(both[1]).toBeCloseTo(one[1] + two[1], 10);
  });

  it('two equal charges cancel exactly on the midline', () => {
    const s: Source[] = [{ x: -1, y: 0, q: 1 }, { x: 1, y: 0, q: 1 }];
    const [ex, ey] = fieldAt(s, 0, 0, TINY);
    expect(ex).toBeCloseTo(0, 12);
    expect(ey).toBeCloseTo(0, 12);
  });

  it('gravity points toward the source and electrostatics away from a positive one', () => {
    const s: Source[] = [{ x: 0, y: 0, q: 1 }];
    const repulsive = fieldAt(s, 2, 0, TINY);
    const attractive = fieldAt(s, 2, 0, { ...TINY, attractive: true });
    expect(repulsive[0]).toBeGreaterThan(0);
    expect(attractive[0]).toBeLessThan(0);
  });

  it('the point model falls as an inverse square', () => {
    const s: Source[] = [{ x: 0, y: 0, q: 1 }];
    const near = Math.hypot(...fieldAt(s, 1, 0, TINY));
    const far = Math.hypot(...fieldAt(s, 2, 0, TINY));
    expect(near / far).toBeCloseTo(4, 4);
  });

  it('the line model falls as an inverse distance', () => {
    const s: Source[] = [{ x: 0, y: 0, q: 1 }];
    const near = Math.hypot(...fieldAt(s, 1, 0, { ...TINY, kind: 'line' }));
    const far = Math.hypot(...fieldAt(s, 2, 0, { ...TINY, kind: 'line' }));
    expect(near / far).toBeCloseTo(2, 4);
  });
});

describe('potential', () => {
  it('the field is minus the gradient of the potential', () => {
    const s: Source[] = [{ x: -0.7, y: 0.2, q: 2 }, { x: 0.9, y: -0.4, q: -1 }];
    const h = 1e-5;
    for (const [x, y] of [[0.2, 0.3], [-0.3, -0.6], [1.4, 0.8]]) {
      const gx = (potentialAt(s, x + h, y) - potentialAt(s, x - h, y)) / (2 * h);
      const gy = (potentialAt(s, x, y + h) - potentialAt(s, x, y - h)) / (2 * h);
      const [ex, ey] = fieldAt(s, x, y);
      expect(ex).toBeCloseTo(-gx, 4);
      expect(ey).toBeCloseTo(-gy, 4);
    }
  });

  it('field lines cross equipotentials at right angles', () => {
    const s: Source[] = [{ x: -1, y: 0, q: 1 }, { x: 1, y: 0, q: -1 }];
    const h = 1e-5;
    for (const [x, y] of [[0.3, 0.7], [-0.5, 0.9], [0.1, -1.2]]) {
      const [ex, ey] = fieldAt(s, x, y);
      // Tangent to the equipotential is perpendicular to ∇V.
      const gx = (potentialAt(s, x + h, y) - potentialAt(s, x - h, y)) / (2 * h);
      const gy = (potentialAt(s, x, y + h) - potentialAt(s, x, y - h)) / (2 * h);
      const tx = -gy;
      const ty = gx;
      const cos = (ex * tx + ey * ty) / (Math.hypot(ex, ey) * Math.hypot(tx, ty));
      expect(Math.abs(cos)).toBeLessThan(1e-4);
    }
  });

  it('a dipole has zero potential on its perpendicular bisector, where the field is not zero', () => {
    const s: Source[] = [{ x: -1, y: 0, q: 1 }, { x: 1, y: 0, q: -1 }];
    expect(potentialAt(s, 0, 0.8)).toBeCloseTo(0, 12);
    expect(Math.hypot(...fieldAt(s, 0, 0.8))).toBeGreaterThan(0.1);
  });
});

/* ── Gauss, and the trap ──────────────────────────────────────────────────
   These two tests are the reason `fields.ts` makes the model explicit. If a
   lesson draws 1/r² charges and then integrates flux around a circle, it is
   teaching the opposite of Gauss's law.
   ──────────────────────────────────────────────────────────────────────── */

describe("Gauss's law", () => {
  it('the line model gives a flux that does not care about the radius', () => {
    const s: Source[] = [{ x: 0.1, y: -0.05, q: 1.5 }];
    const o = { kind: 'line' as const, soften: 1e-6 };
    const small = fluxThroughCircle(s, 0, 0, 1, o);
    const big = fluxThroughCircle(s, 0, 0, 4, o);
    expect(big).toBeCloseTo(small, 6);
    expect(small).toBeCloseTo(2 * Math.PI * 1.5, 4);
  });

  it('the line model ignores charge outside the loop entirely', () => {
    const o = { kind: 'line' as const, soften: 1e-6 };
    const inside: Source[] = [{ x: 0, y: 0, q: 1 }];
    const plusOutside: Source[] = [...inside, { x: 6, y: 0, q: 9 }];
    expect(fluxThroughCircle(plusOutside, 0, 0, 1, o, 8192)).toBeCloseTo(
      fluxThroughCircle(inside, 0, 0, 1, o, 8192),
      4,
    );
  });

  it('an off-centre loop enclosing the same charge gives the same flux', () => {
    const o = { kind: 'line' as const, soften: 1e-6 };
    const s: Source[] = [{ x: 0, y: 0, q: 1 }];
    const centred = fluxThroughCircle(s, 0, 0, 2, o, 8192);
    const offset = fluxThroughCircle(s, 0.9, 0.4, 2, o, 8192);
    expect(offset).toBeCloseTo(centred, 4);
  });

  it('a CIRCLE around a 1/r² charge does NOT conserve flux — the trap, pinned', () => {
    const s: Source[] = [{ x: 0, y: 0, q: 1 }];
    const o = { kind: 'point' as const, soften: 1e-6 };
    const r1 = fluxThroughCircle(s, 0, 0, 1, o);
    const r2 = fluxThroughCircle(s, 0, 0, 2, o);
    // Halves each time the radius doubles. Any lesson relying on invariance
    // here would be wrong, which is why the model is a required choice.
    expect(r2 / r1).toBeCloseTo(0.5, 3);
  });

  it('a SPHERE around a 1/r² charge does conserve flux, at 4πkq', () => {
    const s: Source[] = [{ x: 0, y: 0, q: 2 }];
    const o = { kind: 'point' as const, soften: 1e-9 };
    const r1 = fluxThroughSphere(s, 0, 0, 1, o, 16384);
    const r3 = fluxThroughSphere(s, 0, 0, 3, o, 16384);
    expect(r1).toBeCloseTo(4 * Math.PI * 2, 2);
    expect(r3).toBeCloseTo(r1, 2);
  });

  it('a sphere ignores an outside charge', () => {
    const o = { kind: 'point' as const, soften: 1e-9 };
    const inside: Source[] = [{ x: 0, y: 0, q: 1 }];
    const plusOutside: Source[] = [...inside, { x: 8, y: 0, q: 5 }];
    expect(fluxThroughSphere(plusOutside, 0, 0, 1, o, 16384)).toBeCloseTo(
      fluxThroughSphere(inside, 0, 0, 1, o, 16384),
      2,
    );
  });

  it('enclosedCharge counts only what is inside', () => {
    const s: Source[] = [
      { x: 0, y: 0, q: 3 },
      { x: 0.5, y: 0.5, q: -1 },
      { x: 5, y: 0, q: 100 },
    ];
    expect(enclosedCharge(s, 0, 0, 1)).toBe(2);
    expect(enclosedCharge(s, 0, 0, 10)).toBe(102);
  });
});

describe('field lines', () => {
  it('a line leaving a positive charge lands on the negative one in a dipole', () => {
    const s: Source[] = [{ x: -1, y: 0, q: 1 }, { x: 1, y: 0, q: -1 }];
    const path = traceFieldLine(s, [-0.88, 0], { ds: 0.01, steps: 2000, hitRadius: 0.06 });
    const end = path[path.length - 1];
    expect(Math.hypot(end[0] - 1, end[1])).toBeLessThan(0.1);
  });

  it('a line from a lone positive charge runs radially outward', () => {
    const s: Source[] = [{ x: 0, y: 0, q: 1 }];
    const path = traceFieldLine(s, [0.2, 0.2], {
      ds: 0.02,
      steps: 400,
      bounds: { x0: -5, y0: -5, x1: 5, y1: 5 },
    });
    const end = path[path.length - 1];
    // Same 45° ray it started on.
    expect(end[0]).toBeCloseTo(end[1], 3);
    expect(Math.hypot(...end)).toBeGreaterThan(1);
  });

  it('line density follows charge magnitude', () => {
    const seeds = seedFieldLines([{ x: 0, y: 0, q: 1 }, { x: 3, y: 0, q: 2 }], 8);
    const near = seeds.filter((s) => s.start[0] < 1.5).length;
    const far = seeds.filter((s) => s.start[0] >= 1.5).length;
    expect(far).toBe(2 * near);
  });

  it('lines leave positive sources and enter negative ones', () => {
    const seeds = seedFieldLines([{ x: 0, y: 0, q: -1 }]);
    expect(seeds.every((s) => s.backward)).toBe(true);
  });
});

describe('null points', () => {
  it('two equal positive charges have exactly one null, at the midpoint', () => {
    const s: Source[] = [{ x: -1, y: 0, q: 1 }, { x: 1, y: 0, q: 1 }];
    const nulls = nullPoints(s, { x0: -2.5, y0: -2.5, x1: 2.5, y1: 2.5 });
    expect(nulls).toHaveLength(1);
    expect(nulls[0][0]).toBeCloseTo(0, 1);
    expect(nulls[0][1]).toBeCloseTo(0, 1);
  });

  it('a dipole has no null point between the charges', () => {
    const s: Source[] = [{ x: -1, y: 0, q: 1 }, { x: 1, y: 0, q: -1 }];
    const nulls = nullPoints(s, { x0: -0.8, y0: -0.8, x1: 0.8, y1: 0.8 });
    expect(nulls).toHaveLength(0);
  });

  it('unequal charges put the null nearer the weaker one', () => {
    const s: Source[] = [{ x: -1, y: 0, q: 4 }, { x: 1, y: 0, q: 1 }];
    const nulls = nullPoints(s, { x0: -2.5, y0: -2.5, x1: 2.5, y1: 2.5 });
    expect(nulls).toHaveLength(1);
    expect(nulls[0][0]).toBeGreaterThan(0);
  });
});
