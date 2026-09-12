import { describe, expect, it } from 'vitest';
import {
  BASE,
  DIMENSIONLESS,
  G0,
  QUANTITIES,
  QUANTITY_TABLE,
  SI_CONSTANTS,
  UNITS,
  UNIT_TABLE,
  balance,
  constant,
  conversionFactor,
  dim,
  dimEqual,
  dimSymbol,
  divDim,
  evaluateMonomial,
  isDimensionless,
  monomialLabel,
  mulDim,
  powDim,
  searchMonomials,
  siUnitSymbol,
  superscript,
} from '../dimensions.ts';

/* ── the algebra ──────────────────────────────────────────────────────────
   Chapter 1's claim is that multiplying quantities adds exponent vectors. If
   that is true then these are vector-space identities, and they are.
   ──────────────────────────────────────────────────────────────────────── */

describe('dimensional algebra', () => {
  it('has seven base dimensions', () => {
    expect(BASE).toHaveLength(7);
    expect(DIMENSIONLESS).toHaveLength(7);
  });

  it('multiplying quantities adds exponents', () => {
    const force = mulDim(QUANTITIES.mass.dim, QUANTITIES.acceleration.dim);
    expect(dimEqual(force, QUANTITIES.force.dim)).toBe(true);
    expect(dimSymbol(force)).toBe('M L T⁻²');
  });

  it('a quantity divided by itself is dimensionless', () => {
    for (const q of Object.values(QUANTITIES)) {
      expect(isDimensionless(divDim(q.dim, q.dim))).toBe(true);
    }
  });

  it('raising to a power scales the exponents, and roots come back', () => {
    const area = powDim(QUANTITIES.length.dim, 2);
    expect(dimEqual(area, QUANTITIES.area.dim)).toBe(true);
    expect(dimEqual(powDim(area, 0.5), QUANTITIES.length.dim)).toBe(true);
  });

  it('names the standard derived quantities correctly', () => {
    expect(dimSymbol(QUANTITIES.force.dim)).toBe('M L T⁻²');
    expect(dimSymbol(QUANTITIES.energy.dim)).toBe('M L² T⁻²');
    expect(dimSymbol(QUANTITIES.pressure.dim)).toBe('M L⁻¹ T⁻²');
    expect(dimSymbol(QUANTITIES.power.dim)).toBe('M L² T⁻³');
    expect(dimSymbol(QUANTITIES.angle.dim)).toBe('1');
    expect(siUnitSymbol(QUANTITIES.force.dim)).toBe('kg·m·s⁻²');
  });

  it('work and energy, momentum and impulse, are the same point in exponent space', () => {
    // Two quantities the learner meets under different names in different
    // chapters. The equality is the reason they can appear in one equation.
    expect(dimEqual(QUANTITIES.work.dim, QUANTITIES.energy.dim)).toBe(true);
    expect(dimEqual(QUANTITIES.impulse.dim, QUANTITIES.momentum.dim)).toBe(true);
  });

  it('formats fractional exponents as fractions', () => {
    expect(superscript(2)).toBe('²');
    expect(superscript(-2)).toBe('⁻²');
    expect(superscript(1)).toBe('');
    expect(superscript(0.5)).toBe('¹⁄²');
    expect(superscript(-1.5)).toBe('⁻³⁄²');
  });
});

/* ── the pendulum, which is the lesson ───────────────────────────────────── */

describe('dimensional analysis is predictive', () => {
  const palette = ['length', 'gravity', 'mass'];

  it('finds exactly one way to build a time out of a length, a field and a mass', () => {
    const hits = searchMonomials(palette, QUANTITIES.period.dim, QUANTITY_TABLE, 2, 0.5);
    expect(hits).toHaveLength(1);

    const exponents = Object.fromEntries(hits[0].map((t) => [t.key, t.exponent]));
    expect(exponents.length).toBeCloseTo(0.5, 12);
    expect(exponents.gravity).toBeCloseTo(-0.5, 12);
    // The claim the lesson makes out loud: the period CANNOT depend on mass.
    expect(exponents.mass).toBe(0);
    expect(monomialLabel(hits[0], QUANTITY_TABLE)).toBe('L¹⁄² g⁻¹⁄²');
  });

  it('rejects the upside-down pendulum formula, and says by how much', () => {
    // T =? sqrt(g/L) — the wrong way up. The mismatch is T², i.e. the right
    // side is short of the left by two powers of time.
    const good = balance(
      [{ key: 'period', exponent: 1 }],
      [{ key: 'length', exponent: 0.5 }, { key: 'gravity', exponent: -0.5 }],
      QUANTITY_TABLE,
    );
    expect(good.balanced).toBe(true);
    expect(dimSymbol(good.mismatch)).toBe('1');

    const bad = balance(
      [{ key: 'period', exponent: 1 }],
      [{ key: 'gravity', exponent: 0.5 }, { key: 'length', exponent: -0.5 }],
      QUANTITY_TABLE,
    );
    expect(bad.balanced).toBe(false);
    expect(dimSymbol(bad.mismatch)).toBe('T²');
  });

  it('cannot see a dimensionless factor', () => {
    // sqrt(L/g) and 2*pi*sqrt(L/g) are the SAME point in exponent space, which
    // is the honest limit of the whole method: it settles the period up to 2π
    // and no further.
    const terms = [{ key: 'length', exponent: 0.5 }, { key: 'gravity', exponent: -0.5 }];
    const bare = evaluateMonomial(terms, QUANTITY_TABLE);
    const withTwoPi = evaluateMonomial([...terms, { key: 'angle', exponent: 1 }], QUANTITY_TABLE);
    expect(dimEqual(bare.dim, withTwoPi.dim)).toBe(true);
  });

  it('catches a missing square in the drag force', () => {
    // F = ½ρAv is wrong; F = ½ρAv² is right. Only the exponent on v differs,
    // and the mismatch is L T⁻¹ — the diagnostic literally hands you the
    // missing factor, and it is a velocity.
    const lhs = [{ key: 'force', exponent: 1 }];
    const linear = balance(
      lhs,
      [{ key: 'density', exponent: 1 }, { key: 'area', exponent: 1 }, { key: 'velocity', exponent: 1 }],
      QUANTITY_TABLE,
    );
    expect(linear.balanced).toBe(false);
    expect(dimSymbol(linear.mismatch)).toBe('L T⁻¹');
    expect(dimEqual(linear.mismatch, QUANTITIES.velocity.dim)).toBe(true);

    const quadratic = balance(
      lhs,
      [{ key: 'density', exponent: 1 }, { key: 'area', exponent: 1 }, { key: 'velocity', exponent: 2 }],
      QUANTITY_TABLE,
    );
    expect(quadratic.balanced).toBe(true);
  });

  it('the spring period and the pendulum period are different searches', () => {
    const hits = searchMonomials(['mass', 'spring'], QUANTITIES.period.dim, QUANTITY_TABLE, 2, 0.5);
    expect(hits).toHaveLength(1);
    const e = Object.fromEntries(hits[0].map((t) => [t.key, t.exponent]));
    expect(e.mass).toBeCloseTo(0.5, 12);
    expect(e.spring).toBeCloseTo(-0.5, 12);
  });

  it('trig arguments have to be dimensionless', () => {
    // sin(kx - ωt) only parses because both terms are pure numbers.
    const phase = evaluateMonomial(
      [{ key: 'frequency', exponent: 1 }, { key: 'time', exponent: 1 }],
      QUANTITY_TABLE,
    );
    expect(isDimensionless(phase.dim)).toBe(true);
    const nonsense = evaluateMonomial([{ key: 'length', exponent: 1 }], QUANTITY_TABLE);
    expect(isDimensionless(nonsense.dim)).toBe(false);
  });
});

/* ── units: the half a dimension check cannot do ─────────────────────────── */

describe('units and conversion', () => {
  it('the composite units really are their primitives multiplied', () => {
    expect(UNITS.mph.toSI).toBeCloseTo(UNITS.mi.toSI / UNITS.h.toSI, 15);
    expect(UNITS.knot.toSI).toBeCloseTo(UNITS.nmi.toSI / UNITS.h.toSI, 15);
    expect(UNITS.psi.toSI).toBeCloseTo(UNITS.lbf.toSI / UNITS.in.toSI ** 2, 9);
    expect(UNITS.hp.toSI).toBeCloseTo(550 * UNITS.ft.toSI * UNITS.lbf.toSI, 9);
    expect(UNITS.slug.toSI).toBeCloseTo(UNITS.lbf.toSI / UNITS.ft.toSI, 12);
  });

  it('reproduces the exact defined conversions', () => {
    expect(conversionFactor('mi', 'm')).toBe(1609.344);
    expect(conversionFactor('in', 'cm')).toBeCloseTo(2.54, 12);
    expect(conversionFactor('mph', 'mps')).toBeCloseTo(0.44704, 12);
    expect(conversionFactor('fortnight', 's')).toBe(1209600);
    expect(conversionFactor('galUS', 'L')).toBeCloseTo(3.785411784, 9);
    expect(conversionFactor('lb', 'kg')).toBe(0.45359237);
  });

  it('the pound-force is exact because standard gravity is a definition', () => {
    expect(UNITS.lbf.toSI).toBeCloseTo(0.45359237 * G0, 15);
    expect(UNITS.lbf.toSI).toBeCloseTo(4.4482216152605, 13);
  });

  it('Mars Climate Orbiter: same dimension, wrong unit', () => {
    // The failure a dimensional check would have waved through. Both units are
    // impulse; they differ by 4.448.
    expect(dimEqual(UNITS.lbfs.dim, UNITS.Ns.dim)).toBe(true);
    expect(dimEqual(UNITS.lbfs.dim, QUANTITIES.impulse.dim)).toBe(true);
    expect(conversionFactor('lbfs', 'Ns')).toBeCloseTo(4.4482216152605, 12);
  });

  it('refuses to convert between different kinds of thing', () => {
    expect(() => conversionFactor('kg', 'm')).toThrow(/different dimensions/);
    expect(() => conversionFactor('mph', 'mi')).toThrow(/different dimensions/);
  });

  it('a conversion chain is a product of ones, and it collapses', () => {
    // 55 mi/h → m/s as the learner assembles it: multiply by (mi → m), divide
    // by (h → s). The dimension of the chain itself is 1: it is a pure number.
    const chain = [
      { key: 'mi', exponent: 1 },
      { key: 'm', exponent: -1 },
      { key: 'h', exponent: -1 },
      { key: 's', exponent: 1 },
    ];
    const { dim: d, toSI } = evaluateMonomial(chain, UNIT_TABLE);
    expect(isDimensionless(d)).toBe(true);
    expect(55 * toSI).toBeCloseTo(24.5872, 4);
  });

  it('a furlong per fortnight is a speed, and a slow one', () => {
    expect(dimEqual(UNITS.furlongsPerFortnight.dim, QUANTITIES.velocity.dim)).toBe(true);
    expect(UNITS.furlongsPerFortnight.toSI).toBeCloseTo(1.6631e-4, 8);
  });

  it('the electronvolt is exact now that the elementary charge is', () => {
    expect(UNITS.eV.toSI).toBe(constant('e').value);
  });
});

/* ── the 2019 SI ─────────────────────────────────────────────────────────── */

describe('the defining constants', () => {
  it('there are seven of them and each defines a base unit', () => {
    expect(SI_CONSTANTS).toHaveLength(7);
    expect(new Set(SI_CONSTANTS.map((c) => c.defines)).size).toBe(7);
  });

  it('the kilogram is reachable because h carries a mass', () => {
    // h has dimension M L² T⁻¹. Fix h, fix c (L T⁻¹) and fix a frequency
    // (T⁻¹), and the mass is determined: M = h / (L² T⁻¹) = h c⁻² · (T⁻¹).
    const h = constant('h').dim;
    const c = constant('c').dim;
    const nu = constant('dnuCs').dim;
    const mass = mulDim(mulDim(h, powDim(c, -2)), nu);
    expect(dimEqual(mass, dim({ M: 1 }))).toBe(true);
  });

  it('the defining constants have the dimensions their definitions need', () => {
    expect(dimSymbol(constant('h').dim)).toBe('M L² T⁻¹');
    expect(dimSymbol(constant('k').dim)).toBe('M L² T⁻² Θ⁻¹');
    expect(dimSymbol(constant('e').dim)).toBe('T I');
    expect(dimSymbol(constant('NA').dim)).toBe('N⁻¹');
    // Luminous efficacy is lumens per watt: luminous intensity over power.
    expect(dimEqual(constant('Kcd').dim, divDim(dim({ J: 1 }), QUANTITIES.power.dim))).toBe(true);
  });

  it('the metre is a time measurement in disguise', () => {
    // 1 m is how far light goes in 1/299792458 s, by definition.
    expect(constant('c').value * (1 / 299792458)).toBe(1);
  });
});
