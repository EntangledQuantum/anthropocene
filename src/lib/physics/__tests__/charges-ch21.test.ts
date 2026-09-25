import { describe, expect, it } from 'vitest';
import {
  K, MICRO, NANO, axialForce, balanceBetween, balanceOutside, cancelFraction, coulombForce,
  coulombMagnitude, dipole, eField, falloffExponent, fieldMagnitude, forceOn, nullsOnAxis,
  mN, sci, shareOnContact, si, type Charge,
} from '../charges-ch21.ts';

const CM = 0.01;

/* Lesson 1 — "Where the pushes cancel" */

describe('Coulomb force', () => {
  it('is k q1 q2 / r² and repels like charges', () => {
    const a: Charge = { x: 0, y: 0, q: 1 * MICRO };
    const b: Charge = { x: 0.1, y: 0, q: 0.1 * MICRO };
    const f = coulombForce(a, b);
    expect(f[0]).toBeCloseTo(K * 1e-6 * 1e-7 / 0.01, 8); // 89.9 mN
    expect(f[0]).toBeGreaterThan(0);
    expect(f[1]).toBeCloseTo(0, 12);
  });

  it('attracts unlike charges', () => {
    const a: Charge = { x: 0, y: 0, q: 1 * MICRO };
    const b: Charge = { x: 0.1, y: 0, q: -1 * MICRO };
    expect(coulombForce(a, b)[0]).toBeLessThan(0);
  });

  it('falls as an inverse square: twice as far, a quarter the push', () => {
    expect(coulombMagnitude(1e-6, 1e-6, 0.2) / coulombMagnitude(1e-6, 1e-6, 0.1)).toBeCloseTo(0.25, 10);
  });

  it('is equal and opposite on the two charges, however unequal they are', () => {
    const a: Charge = { x: 0, y: 0, q: 1 * MICRO };
    const b: Charge = { x: 0.3, y: 0.1, q: 4 * MICRO };
    const ab = coulombForce(a, b);
    const ba = coulombForce(b, a);
    expect(ab[0]).toBeCloseTo(-ba[0], 10);
    expect(ab[1]).toBeCloseTo(-ba[1], 10);
  });
});

describe('the balance point between like charges', () => {
  const pair: Charge[] = [{ x: 0, y: 0, q: 1 * MICRO }, { x: 30 * CM, y: 0, q: 4 * MICRO }];

  it('is a third of the way from +1 to +4, not a fifth and not half', () => {
    expect(balanceBetween(1, 4, 30)).toBeCloseTo(10, 12);
    const found = nullsOnAxis(pair, -0.5, 0.8);
    expect(found).toHaveLength(1);
    expect(found[0] / CM).toBeCloseTo(10, 4);
  });

  it('matches d / (1 + √(q2/q1)) for other ratios', () => {
    for (const [q1, q2] of [[1, 9], [2, 3], [5, 1]]) {
      const s: Charge[] = [{ x: 0, y: 0, q: q1 * MICRO }, { x: 0.4, y: 0, q: q2 * MICRO }];
      const [x] = nullsOnAxis(s, 0.001, 0.399);
      expect(x).toBeCloseTo(balanceBetween(q1, q2, 0.4), 6);
    }
  });

  it('at 15 cm (midway) the +4 still pushes four times harder', () => {
    const f1 = forceOn([pair[0]], 1, 15 * CM, 0)[0];
    const f2 = forceOn([pair[1]], 1, 15 * CM, 0)[0];
    expect(-f2 / f1).toBeCloseTo(4, 8);
  });
});

describe('the balance point for unlike charges', () => {
  const pair: Charge[] = [{ x: 0, y: 0, q: 1 * MICRO }, { x: 30 * CM, y: 0, q: -4 * MICRO }];

  it('does not exist between them: both pushes point the same way', () => {
    for (let x = 1 * CM; x < 29 * CM; x += 1 * CM) {
      const f1 = forceOn([pair[0]], 1, x, 0)[0];
      const f2 = forceOn([pair[1]], 1, x, 0)[0];
      expect(Math.sign(f1)).toBe(Math.sign(f2));
    }
  });

  it('sits outside, beyond the smaller charge, as far out as the charges are apart', () => {
    const found = nullsOnAxis(pair, -1, 1.5);
    expect(found).toHaveLength(1);
    expect(found[0] / CM).toBeCloseTo(-30, 4);
    expect(balanceOutside(1, -4, 30)).toBeCloseTo(30, 12);
  });
});

describe('Earnshaw: the balance holds only along the wire', () => {
  const pair: Charge[] = [{ x: 0, y: 0, q: 1 * MICRO }, { x: 30 * CM, y: 0, q: 4 * MICRO }];
  const x0 = 10 * CM;

  it('along the wire the net force pushes the bead back', () => {
    expect(axialForce(pair, x0 + 0.5 * CM)).toBeLessThan(0);
    expect(axialForce(pair, x0 - 0.5 * CM)).toBeGreaterThan(0);
  });

  it('off the wire the net force pushes it further away, above and below', () => {
    expect(eField(pair, x0, 0.2 * CM)[1]).toBeGreaterThan(0);
    expect(eField(pair, x0, -0.2 * CM)[1]).toBeLessThan(0);
  });

  it('no direction of nudge is restoring in both components (the field has zero divergence there)', () => {
    const h = 1e-5;
    const dExdx = (eField(pair, x0 + h, 0)[0] - eField(pair, x0 - h, 0)[0]) / (2 * h);
    const dEydy = (eField(pair, x0, h)[1] - eField(pair, x0, -h)[1]) / (2 * h);
    // in 3D the z direction matches y, so ∂x + 2∂y = 0
    expect(dExdx + 2 * dEydy).toBeCloseTo(0, -2);
    expect(dExdx).toBeLessThan(0);
    expect(dEydy).toBeGreaterThan(0);
  });
});

describe('touching identical spheres', () => {
  it('shares the total charge equally and conserves it', () => {
    const [a, b] = shareOnContact(6 * MICRO, -2 * MICRO);
    expect(a).toBeCloseTo(2 * MICRO, 15);
    expect(b).toBeCloseTo(2 * MICRO, 15);
    expect(a + b).toBeCloseTo(4 * MICRO, 15);
  });

  it('turns a 1.2 N pull at 30 cm into an equal push at 30/√3 = 17.3 cm', () => {
    const before = coulombMagnitude(6 * MICRO, -2 * MICRO, 0.3);
    expect(before).toBeCloseTo(1.198, 3);
    const [a, b] = shareOnContact(6 * MICRO, -2 * MICRO);
    const r = Math.sqrt((K * a * b) / before);
    expect(r / CM).toBeCloseTo(30 / Math.sqrt(3), 6);
    expect(coulombMagnitude(a, b, 0.3)).toBeCloseTo(before / 3, 8);
  });
});

/* Lesson 2 — "The field belongs to the place" */

describe('the field is F/q, whatever the probe', () => {
  const sphere: Charge[] = [{ x: 0, y: 0, q: 2 * MICRO }];
  const P = [12 * CM, 9 * CM] as const;

  it('reads 8.0 × 10⁵ N/C at 15 cm from +2 µC', () => {
    expect(fieldMagnitude(sphere, P[0], P[1])).toBeCloseTo(K * 2e-6 / 0.0225, 0);
  });

  it('gives the same F/q for every probe charge, sign included', () => {
    const e = eField(sphere, P[0], P[1]);
    for (const q of [-3, -2, -1, 1, 2, 3].map((n) => n * NANO)) {
      const f = forceOn(sphere, q, P[0], P[1]);
      expect(f[0] / q).toBeCloseTo(e[0], 6);
      expect(f[1] / q).toBeCloseTo(e[1], 6);
    }
  });

  it('pulls a −3 nC bead 2.4 mN toward the sphere', () => {
    const f = forceOn(sphere, -3 * NANO, P[0], P[1]);
    expect(Math.hypot(f[0], f[1])).toBeCloseTo(2.397e-3, 5);
    expect(f[0] * P[0] + f[1] * P[1]).toBeLessThan(0);
  });
});

describe('fields superpose', () => {
  it('the field of two charges is the sum of each alone, at every point tried', () => {
    const a: Charge = { x: -0.1, y: -0.04, q: 9 * NANO };
    const b: Charge = { x: 0.05, y: 0.02, q: -1 * NANO };
    for (const [x, y] of [[0, 0.1], [0.2, -0.05], [-0.3, 0.2]]) {
      const both = eField([a, b], x, y);
      const ea = eField([a], x, y);
      const eb = eField([b], x, y);
      expect(both[0]).toBeCloseTo(ea[0] + eb[0], 6);
      expect(both[1]).toBeCloseTo(ea[1] + eb[1], 6);
    }
  });

  it('a −1 nC charge two thirds of the way from +9 nC to the grain makes the field there vanish', () => {
    const A = [-10 * CM, -4 * CM];
    const P = [8 * CM, 5 * CM];
    const f = cancelFraction(9, -1);
    expect(f).toBeCloseTo(2 / 3, 12);
    const s: Charge[] = [
      { x: A[0], y: A[1], q: 9 * NANO },
      { x: A[0] + f * (P[0] - A[0]), y: A[1] + f * (P[1] - A[1]), q: -1 * NANO },
    ];
    const alone = fieldMagnitude([s[0]], P[0], P[1]);
    expect(fieldMagnitude(s, P[0], P[1]) / alone).toBeLessThan(1e-9);
  });

  it('putting the −1 nC right on the grain does not cancel anything there', () => {
    // It adds an enormous field of its own; the dead spot is elsewhere.
    const s: Charge[] = [{ x: -0.1, y: -0.04, q: 9 * NANO }, { x: 0.08, y: 0.05, q: -1 * NANO }];
    expect(fieldMagnitude(s, 0.08 + 0.002, 0.05)).toBeGreaterThan(fieldMagnitude([s[0]], 0.08, 0.05));
  });
});

describe('the dipole', () => {
  const d = dipole(1 * NANO, 2 * CM);

  it('is neutral overall', () => {
    expect(d.reduce((t, c) => t + c.q, 0)).toBe(0);
  });

  it('its field drops to about an eighth from 10 cm to 20 cm along its axis', () => {
    const r = fieldMagnitude(d, 10 * CM, 0) / fieldMagnitude(d, 20 * CM, 0);
    expect(r).toBeGreaterThan(7.8);
    expect(r).toBeLessThan(8.4);
  });

  it('falls as 1/r³ far away, on the axis and off it', () => {
    expect(falloffExponent(d, [1, 0], 1, 2)).toBeCloseTo(3, 3);
    expect(falloffExponent(d, [0, 1], 1, 2)).toBeCloseTo(3, 3);
    expect(falloffExponent(d, [1, 1], 1, 2)).toBeCloseTo(3, 3);
  });

  it('whereas one of its charges alone falls as 1/r²', () => {
    expect(falloffExponent([d[0]], [1, 0], 1, 2, [d[0].x, 0])).toBeCloseTo(2, 6);
  });

  it('with the − charge removed, 10 cm → 20 cm is about a quarter', () => {
    const r = fieldMagnitude([d[0]], 10 * CM, 0) / fieldMagnitude([d[0]], 20 * CM, 0);
    expect(r).toBeCloseTo(4, 0);
  });
});

describe('formatting', () => {
  it('uses SI prefixes', () => {
    expect(si(0.0899, 'N')).toBe('90 mN');
    expect(si(1.198, 'N')).toBe('1.2 N');
    expect(si(7.99e5, 'N/C')).toBe('799 kN/C');
    expect(si(2.4e-3, 'N')).toBe('2.4 mN');
    expect(sci(7.99e5, 'N/C')).toBe('8.0 × 10⁵ N/C');
    expect(sci(9.99e-5, 'N')).toBe('1.0 × 10⁻⁴ N');
    expect(mN(7.99e-4)).toBe('0.80 mN');
  });
});
