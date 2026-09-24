import { describe, expect, it } from 'vitest';
import {
  applyCards, beamTilts, cardWorth, gapAfter, gridReading, inSI, measurePeriods,
  railShare, sameUnits, swingPendulum, unitLabel, type Card, type Swing,
} from '../language-ch1.ts';
import {
  conversionFactor, dim, dimEqual, evaluateMonomial, QUANTITY_TABLE, searchMonomials, UNITS,
} from '../dimensions.ts';
import { dot2, componentsIn, mag2 } from '../vectors.ts';

/* Every sentence the two chapter 1 lessons say out loud, pinned. */

const DEG = Math.PI / 180;

describe('lesson 1 — the pendulum does not care about the bob', () => {
  it('a 0.05 kg bob and a 5 kg bob trace the same swing, step for step', () => {
    let a: Swing = { theta: 20 * DEG, omega: 0, t: 0 };
    let b: Swing = { ...a };
    for (let i = 0; i < 20000; i++) {
      a = swingPendulum(a, { L: 1, g: 9.81, m: 0.05 }, 1e-3);
      b = swingPendulum(b, { L: 1, g: 9.81, m: 5 }, 1e-3);
    }
    expect(Math.abs(a.theta - b.theta)).toBeLessThan(1e-12);
  });

  it('the measured period is close to 2π√(L/g) at 20°, and does not move with mass', () => {
    const light = measurePeriods(20 * DEG, { L: 1, g: 9.81, m: 0.05 }, 12);
    const heavy = measurePeriods(20 * DEG, { L: 1, g: 9.81, m: 5 }, 12);
    const small = 2 * Math.PI * Math.sqrt(1 / 9.81);
    expect(light.length).toBeGreaterThan(3);
    expect(Math.abs(light[0] - small) / small).toBeLessThan(0.01);
    expect(Math.abs(light[0] - heavy[0])).toBeLessThan(1e-9);
  });

  it('from a length, g and a mass, exactly one time can be built, and it has no mass in it', () => {
    const found = searchMonomials(['length', 'gravity', 'mass'], dim({ T: 1 }), QUANTITY_TABLE);
    expect(found).toHaveLength(1);
    const [L, g, m] = found[0].map((t) => t.exponent);
    expect(L).toBe(0.5);
    expect(g).toBe(-0.5);
    expect(m).toBe(0);
  });

  it('the scale: L^½ g^−½ levels every beam against a period; L g does not', () => {
    const ok = beamTilts([{ key: 'period', exponent: 1 }], [{ key: 'length', exponent: 0.5 }, { key: 'gravity', exponent: -0.5 }]);
    expect(ok.balanced).toBe(true);
    const off = beamTilts([{ key: 'period', exponent: 1 }], [{ key: 'length', exponent: 1 }, { key: 'gravity', exponent: 1 }]);
    expect(off.balanced).toBe(false);
    expect(off.beams.map((b) => b.tilt)).toEqual([0, -2, 3]);
  });

  it('any power of the mass tips the M beam and nothing else', () => {
    const r = beamTilts([{ key: 'period', exponent: 1 }], [
      { key: 'length', exponent: 0.5 }, { key: 'gravity', exponent: -0.5 }, { key: 'mass', exponent: 1 },
    ]);
    expect(r.beams.map((b) => b.level)).toEqual([false, true, true]);
  });
});

describe('lesson 1 — what the scale catches and what it misses', () => {
  const T = dim({ T: 1 });
  it('√(g/L) is a frequency, not a time: caught', () => {
    const d = evaluateMonomial([{ key: 'gravity', exponent: 0.5 }, { key: 'length', exponent: -0.5 }], QUANTITY_TABLE).dim;
    expect(dimEqual(d, dim({ T: -1 }))).toBe(true);
    expect(dimEqual(d, T)).toBe(false);
  });
  it('½ρAv is short of a force by exactly one velocity: caught', () => {
    const r = beamTilts([{ key: 'force', exponent: 1 }], [
      { key: 'density', exponent: 1 }, { key: 'area', exponent: 1 }, { key: 'velocity', exponent: 1 },
    ]);
    expect(r.balanced).toBe(false);
    expect(r.beams.map((b) => b.tilt)).toEqual([0, 1, -1]);
    const fixed = beamTilts([{ key: 'force', exponent: 1 }], [
      { key: 'density', exponent: 1 }, { key: 'area', exponent: 1 }, { key: 'velocity', exponent: 2 },
    ]);
    expect(fixed.balanced).toBe(true);
  });
  it('a lost 2π or ½ changes no exponent: missed', () => {
    // a pure number contributes nothing to the exponent vector
    expect(evaluateMonomial([], QUANTITY_TABLE).dim).toEqual([0, 0, 0, 0, 0, 0, 0]);
  });
  it('feet and metres, lbf·s and N·s: same dimension, different size: missed', () => {
    expect(dimEqual(UNITS.ft.dim, UNITS.m.dim)).toBe(true);
    expect(dimEqual(UNITS.lbfs.dim, UNITS.Ns.dim)).toBe(true);
    expect(conversionFactor('lbfs', 'Ns')).toBeCloseTo(4.4482216152605, 10);
  });
});

describe('lesson 1 — conversion is multiplying by one', () => {
  it('90 km/h keeps pace with exactly 25 m/s', () => {
    expect(conversionFactor('kmh', 'mps') * 90).toBeCloseTo(25, 12);
    expect(gapAfter(10, { value: 90, unit: 'kmh' }, { value: 25, unit: 'mps' })).toBeCloseTo(0, 10);
    expect(gapAfter(1, { value: 90, unit: 'kmh' }, { value: 90, unit: 'mps' })).toBeCloseTo(65, 10);
  });

  const cards: Card[] = [
    { top: { n: 1000, unit: 'm' }, bottom: { n: 1, unit: 'km' } },
    { top: { n: 1, unit: 'h' }, bottom: { n: 3600, unit: 's' } },
  ];
  const start = { value: 90, units: { km: 1, h: -1 } };

  it('every card is worth exactly 1', () => {
    for (const c of cards) expect(cardWorth(c)).toBeCloseTo(1, 12);
  });

  it('whichever way the cards are turned, the speed in SI is 25 m/s', () => {
    for (const f of [[false, false], [true, false], [false, true], [true, true]]) {
      expect(inSI(applyCards(start, cards, f))).toBeCloseTo(25, 10);
    }
  });

  it('only one orientation leaves m/s; the wrong one doubles the symbol', () => {
    const right = applyCards(start, cards, [false, false]);
    expect(right.value).toBeCloseTo(25, 12);
    expect(sameUnits(right.units, { m: 1, s: -1 })).toBe(true);
    expect(unitLabel(right.units)).toBe('m/s');
    const wrong = applyCards(start, cards, [true, false]);
    expect(wrong.units.km).toBe(2);
    expect(unitLabel(wrong.units)).toBe('km²/(m·s)');
  });
});

describe('lesson 2 — the arrow survives the turn, the components do not', () => {
  const A = [4, 3] as const;

  it('length is the same on every grid; the components are not', () => {
    for (let d = 0; d < 360; d += 7) {
      const r = gridReading(A, d * DEG);
      expect(Math.hypot(r.a1, r.a2)).toBeCloseTo(5, 12);
      expect(r.rebuilt[0]).toBeCloseTo(4, 12);
      expect(r.rebuilt[1]).toBeCloseTo(3, 12);
    }
    expect(gridReading(A, 30 * DEG).a1).not.toBeCloseTo(4, 3);
  });

  it('the first component can grow past its starting 4, up to the full length and no further', () => {
    let best = -Infinity, at = 0;
    for (let d = 0; d < 360; d += 0.1) {
      const a1 = gridReading(A, d * DEG).a1;
      if (a1 > best) { best = a1; at = d; }
    }
    expect(best).toBeCloseTo(5, 5);
    expect(at).toBeCloseTo(Math.atan2(3, 4) / DEG, 0);
    expect(Math.abs(gridReading(A, at * DEG).a2)).toBeLessThan(0.01);
  });

  it('the sum of the components is not the length: 7 on the square grid, 5 when aligned', () => {
    const sq = gridReading(A, 0);
    expect(sq.a1 + sq.a2).toBeCloseTo(7, 12);
    const al = gridReading(A, Math.atan2(3, 4));
    expect(al.a1 + al.a2).toBeCloseTo(5, 12);
  });

  it('turning the grid half a turn flips every sign and moves nothing', () => {
    const r = gridReading(A, Math.PI);
    expect(r.a1).toBeCloseTo(-4, 12);
    expect(r.a2).toBeCloseTo(-3, 12);
  });
});

describe('lesson 2 — the rail keeps only the part along it', () => {
  const rail = 20 * DEG;
  const push = (deg: number) => [10 * Math.cos(rail + deg * DEG), 10 * Math.sin(rail + deg * DEG)] as const;

  it('aimed along the rail, all 10 N; at 45°, 7.07 N, not half; at 60°, exactly half', () => {
    expect(railShare(push(0), rail, 2).along).toBeCloseTo(10, 12);
    expect(railShare(push(45), rail, 2).along).toBeCloseTo(10 / Math.SQRT2, 12);
    expect(railShare(push(60), rail, 2).along).toBeCloseTo(5, 12);
    expect(railShare(push(-60), rail, 2).along).toBeCloseTo(5, 12);
  });

  it('square to the rail, a full 10 N push drives nothing', () => {
    const r = railShare(push(90), rail, 2);
    expect(r.along).toBeCloseTo(0, 12);
    expect(mag2(r.sideways)).toBeCloseTo(10, 12);
    expect(r.accel).toBeCloseTo(0, 12);
  });

  it('pushed backwards past 90°, the share is negative', () => {
    expect(railShare(push(120), rail, 2).along).toBeCloseTo(-5, 12);
  });

  it('along-part and sideways-part rebuild the push', () => {
    const p = push(37);
    const r = railShare(p, rail, 2);
    expect(r.alongVec[0] + r.sideways[0]).toBeCloseTo(p[0], 12);
    expect(r.alongVec[1] + r.sideways[1]).toBeCloseTo(p[1], 12);
  });

  it('A·B is the same number on every grid, although every term in the sum changes', () => {
    const A = [4, 3] as const, B = [1, 4] as const;
    for (let d = 0; d < 360; d += 11) {
      const a = componentsIn(A, d * DEG), b = componentsIn(B, d * DEG);
      expect(a[0] * b[0] + a[1] * b[1]).toBeCloseTo(dot2(A, B), 12);
    }
  });
});
