/** Dimensional algebra over the seven SI base dimensions, written to be read.
 *
 *  Chapter 1's first claim is that a physical quantity is not a number with a
 *  label stuck on it: it is a number together with a point in a seven-dimensional
 *  space of exponents. Multiplying quantities ADDS those exponent vectors, and an
 *  equation can only be true if its two sides land on the same point.
 *
 *  So the representation here is literally that vector — a 7-tuple — and every
 *  operation a lesson needs (multiply, divide, raise to a power, compare, name the
 *  mismatch) is a vector operation on it. Nothing in this file parses a unit
 *  string; strings are for display only.
 *
 *  The second claim is that the exponent vector is not the whole story. Two
 *  quantities can sit on the same point and still disagree by a factor — a
 *  pound-force second and a newton second are both impulse — so units carry a
 *  separate numeric `toSI`, and the composite units are COMPUTED from their
 *  primitives rather than typed, which is what lets a test assert the
 *  composition.
 */

/* ── the seven base dimensions ─────────────────────────────────────────────
   Mass, length, time, electric current, thermodynamic temperature, amount of
   substance, luminous intensity. The order is the one people WRITE — M L T⁻²,
   not L M T⁻² — because this array also fixes the print order.
   ──────────────────────────────────────────────────────────────────────── */

export const BASE = [
  { key: 'M', symbol: 'M', quantity: 'mass', unit: 'kg' },
  { key: 'L', symbol: 'L', quantity: 'length', unit: 'm' },
  { key: 'T', symbol: 'T', quantity: 'time', unit: 's' },
  { key: 'I', symbol: 'I', quantity: 'electric current', unit: 'A' },
  { key: 'Th', symbol: 'Θ', quantity: 'temperature', unit: 'K' },
  { key: 'N', symbol: 'N', quantity: 'amount of substance', unit: 'mol' },
  { key: 'J', symbol: 'J', quantity: 'luminous intensity', unit: 'cd' },
] as const;

export type BaseKey = (typeof BASE)[number]['key'];

/** Exponents of the seven base dimensions, in `BASE` order. Half-integers are
 *  allowed and used: a period built out of a length and an acceleration needs
 *  L^(1/2). */
export type Dimension = readonly [number, number, number, number, number, number, number];

export const DIMENSIONLESS: Dimension = [0, 0, 0, 0, 0, 0, 0];

const INDEX: Record<BaseKey, number> = Object.fromEntries(
  BASE.map((b, i) => [b.key, i]),
) as Record<BaseKey, number>;

/** Build a dimension from the exponents that are not zero: `dim({ M: 1, L: 1, T: -2 })`. */
export function dim(parts: Partial<Record<BaseKey, number>> = {}): Dimension {
  const out = [0, 0, 0, 0, 0, 0, 0];
  for (const [k, v] of Object.entries(parts)) out[INDEX[k as BaseKey]] = v ?? 0;
  return out as unknown as Dimension;
}

export const exponentOf = (d: Dimension, key: BaseKey): number => d[INDEX[key]];

export const mulDim = (a: Dimension, b: Dimension): Dimension =>
  a.map((x, i) => x + b[i]) as unknown as Dimension;

export const divDim = (a: Dimension, b: Dimension): Dimension =>
  a.map((x, i) => x - b[i]) as unknown as Dimension;

export const powDim = (a: Dimension, p: number): Dimension =>
  a.map((x) => x * p) as unknown as Dimension;

export const invDim = (a: Dimension): Dimension => powDim(a, -1);

export const dimEqual = (a: Dimension, b: Dimension, tol = 1e-9): boolean =>
  a.every((x, i) => Math.abs(x - b[i]) <= tol);

export const isDimensionless = (a: Dimension, tol = 1e-9): boolean =>
  dimEqual(a, DIMENSIONLESS, tol);

/* ── naming a dimension ────────────────────────────────────────────────── */

const SUP: Record<string, string> = {
  '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴',
  '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹',
  '-': '⁻', '/': '⁄',
};

const supDigits = (s: string) => [...s].map((c) => SUP[c] ?? c).join('');

/** Reduce a decimal exponent to a small fraction so `0.5` prints as `¹⁄²`
 *  rather than as a decimal nobody writes in an exponent. */
function asFraction(n: number): string {
  if (Number.isInteger(n)) return String(n);
  for (const q of [2, 3, 4, 5, 6, 8]) {
    const p = n * q;
    if (Math.abs(p - Math.round(p)) < 1e-9) return `${Math.round(p)}/${q}`;
  }
  return String(Math.round(n * 1000) / 1000);
}

/** A superscript exponent: `-2` → `⁻²`, `0.5` → `¹⁄²`, `1` → `` (omitted). */
export function superscript(n: number): string {
  if (Math.abs(n - 1) < 1e-12) return '';
  return supDigits(asFraction(n));
}

/** `M L T⁻²`, or `1` when every exponent is zero. The space-separated form is
 *  deliberate: it reads as a product of base dimensions, which is what it is. */
export function dimSymbol(d: Dimension): string {
  const parts = BASE.map((b, i) => (Math.abs(d[i]) < 1e-12 ? null : `${b.symbol}${superscript(d[i])}`))
    .filter((s): s is string => s !== null);
  return parts.length === 0 ? '1' : parts.join(' ');
}

/** The same dimension as a product of SI base units: `kg·m·s⁻²`. */
export function siUnitSymbol(d: Dimension): string {
  const parts = BASE.map((b, i) => (Math.abs(d[i]) < 1e-12 ? null : `${b.unit}${superscript(d[i])}`))
    .filter((s): s is string => s !== null);
  return parts.length === 0 ? '(dimensionless)' : parts.join('·');
}

/* ── physical quantities ───────────────────────────────────────────────────
   The palette a lesson hands the learner. Each entry is a name, a symbol, and
   a point in exponent space.
   ──────────────────────────────────────────────────────────────────────── */

export interface Quantity {
  key: string;
  label: string;
  /** Short symbol as it would appear in an equation. */
  symbol: string;
  dim: Dimension;
}

const Q = (key: string, label: string, symbol: string, d: Dimension): Quantity => ({
  key, label, symbol, dim: d,
});

const LENGTH = dim({ L: 1 });
const MASS = dim({ M: 1 });
const TIME = dim({ T: 1 });
const VELOCITY = dim({ L: 1, T: -1 });
const ACCEL = dim({ L: 1, T: -2 });
const FORCE = dim({ M: 1, L: 1, T: -2 });
const ENERGY = dim({ M: 1, L: 2, T: -2 });

export const QUANTITIES: Record<string, Quantity> = Object.fromEntries(
  [
    Q('length', 'length', 'L', LENGTH),
    Q('area', 'area', 'A', dim({ L: 2 })),
    Q('volume', 'volume', 'V', dim({ L: 3 })),
    Q('mass', 'mass', 'm', MASS),
    Q('time', 'time', 't', TIME),
    Q('angle', 'angle', 'θ', DIMENSIONLESS),
    Q('velocity', 'velocity', 'v', VELOCITY),
    Q('acceleration', 'acceleration', 'a', ACCEL),
    Q('gravity', 'gravitational field', 'g', ACCEL),
    Q('force', 'force', 'F', FORCE),
    Q('energy', 'energy', 'E', ENERGY),
    Q('work', 'work', 'W', ENERGY),
    Q('power', 'power', 'P', dim({ M: 1, L: 2, T: -3 })),
    Q('pressure', 'pressure', 'p', dim({ M: 1, L: -1, T: -2 })),
    Q('density', 'density', 'ρ', dim({ M: 1, L: -3 })),
    Q('momentum', 'momentum', 'mv', dim({ M: 1, L: 1, T: -1 })),
    Q('impulse', 'impulse', 'Δp', dim({ M: 1, L: 1, T: -1 })),
    Q('frequency', 'frequency', 'f', dim({ T: -1 })),
    Q('period', 'period', 'T', TIME),
    Q('spring', 'spring constant', 'k', dim({ M: 1, T: -2 })),
    Q('viscosity', 'dynamic viscosity', 'μ', dim({ M: 1, L: -1, T: -1 })),
    Q('charge', 'charge', 'q', dim({ I: 1, T: 1 })),
    Q('current', 'current', 'I', dim({ I: 1 })),
    Q('voltage', 'potential difference', 'U', dim({ M: 1, L: 2, T: -3, I: -1 })),
    Q('temperature', 'temperature', 'Θ', dim({ Th: 1 })),
    Q('boltzmann', 'Boltzmann constant', 'k_B', dim({ M: 1, L: 2, T: -2, Th: -1 })),
    Q('planck', 'Planck constant', 'h', dim({ M: 1, L: 2, T: -1 })),
    Q('lightspeed', 'speed of light', 'c', VELOCITY),
  ].map((q) => [q.key, q]),
);

/* ── units ─────────────────────────────────────────────────────────────────
   A unit is a dimension plus how many SI base units one of it is worth. The
   composites are built from their primitives, because "conversion is
   multiplying by 1" is the lesson and this file should not contradict it.
   ──────────────────────────────────────────────────────────────────────── */

export interface Unit {
  key: string;
  label: string;
  /** As written on a page: `mi`, `lbf·s`. */
  symbol: string;
  dim: Dimension;
  /** One of this unit, expressed in SI base units. */
  toSI: number;
}

const U = (key: string, label: string, symbol: string, d: Dimension, toSI: number): Unit => ({
  key, label, symbol, dim: d, toSI,
});

/** Standard gravity — a defined constant, not a measurement, which is why the
 *  pound-force is exact. */
export const G0 = 9.80665;

const MI = 1609.344;
const FT = 0.3048;
const IN = 0.0254;
const HOUR = 3600;
const LB = 0.45359237;
const LBF = LB * G0;            // 4.4482216152605 N, exactly
const NMI = 1852;

export const UNITS: Record<string, Unit> = Object.fromEntries(
  [
    U('m', 'metre', 'm', LENGTH, 1),
    U('km', 'kilometre', 'km', LENGTH, 1000),
    U('cm', 'centimetre', 'cm', LENGTH, 0.01),
    U('mi', 'mile', 'mi', LENGTH, MI),
    U('ft', 'foot', 'ft', LENGTH, FT),
    U('in', 'inch', 'in', LENGTH, IN),
    U('yd', 'yard', 'yd', LENGTH, 3 * FT),
    U('furlong', 'furlong', 'fur', LENGTH, 660 * FT),
    U('nmi', 'nautical mile', 'nmi', LENGTH, NMI),

    U('s', 'second', 's', TIME, 1),
    U('min', 'minute', 'min', TIME, 60),
    U('h', 'hour', 'h', TIME, HOUR),
    U('day', 'day', 'd', TIME, 24 * HOUR),
    U('week', 'week', 'wk', TIME, 7 * 24 * HOUR),
    U('fortnight', 'fortnight', 'fn', TIME, 14 * 24 * HOUR),

    U('kg', 'kilogram', 'kg', MASS, 1),
    U('g', 'gram', 'g', MASS, 0.001),
    U('lb', 'pound', 'lb', MASS, LB),
    U('oz', 'ounce', 'oz', MASS, LB / 16),
    U('tonne', 'tonne', 't', MASS, 1000),
    U('slug', 'slug', 'slug', MASS, LBF / FT),

    U('N', 'newton', 'N', FORCE, 1),
    U('lbf', 'pound-force', 'lbf', FORCE, LBF),

    U('Ns', 'newton second', 'N·s', dim({ M: 1, L: 1, T: -1 }), 1),
    U('lbfs', 'pound-force second', 'lbf·s', dim({ M: 1, L: 1, T: -1 }), LBF),

    U('J', 'joule', 'J', ENERGY, 1),
    U('kWh', 'kilowatt hour', 'kW·h', ENERGY, 1000 * HOUR),
    U('cal', 'thermochemical calorie', 'cal', ENERGY, 4.184),
    U('eV', 'electronvolt', 'eV', ENERGY, 1.602176634e-19),

    U('W', 'watt', 'W', dim({ M: 1, L: 2, T: -3 }), 1),
    U('hp', 'mechanical horsepower', 'hp', dim({ M: 1, L: 2, T: -3 }), 550 * FT * LBF),

    U('Pa', 'pascal', 'Pa', dim({ M: 1, L: -1, T: -2 }), 1),
    U('psi', 'pound per square inch', 'psi', dim({ M: 1, L: -1, T: -2 }), LBF / (IN * IN)),
    U('atm', 'standard atmosphere', 'atm', dim({ M: 1, L: -1, T: -2 }), 101325),
    U('bar', 'bar', 'bar', dim({ M: 1, L: -1, T: -2 }), 1e5),

    U('L', 'litre', 'L', dim({ L: 3 }), 1e-3),
    U('galUS', 'US gallon', 'gal', dim({ L: 3 }), 231 * IN * IN * IN),

    U('mps', 'metre per second', 'm/s', VELOCITY, 1),
    U('kmh', 'kilometre per hour', 'km/h', VELOCITY, 1000 / HOUR),
    U('mph', 'mile per hour', 'mi/h', VELOCITY, MI / HOUR),
    U('knot', 'knot', 'kn', VELOCITY, NMI / HOUR),
    U('furlongsPerFortnight', 'furlong per fortnight', 'fur/fn', VELOCITY, (660 * FT) / (14 * 24 * HOUR)),
  ].map((u) => [u.key, u]),
);

/** How many `to` there are in one `from`. Throws when the two are not the same
 *  kind of thing, because that is not a conversion — it is a category error,
 *  and silently returning a number would hide exactly the mistake this chapter
 *  is about. */
export function conversionFactor(from: string, to: string): number {
  const a = UNITS[from];
  const b = UNITS[to];
  if (!a) throw new Error(`unknown unit "${from}"`);
  if (!b) throw new Error(`unknown unit "${to}"`);
  if (!dimEqual(a.dim, b.dim)) {
    throw new Error(
      `cannot convert ${a.symbol} (${dimSymbol(a.dim)}) to ${b.symbol} (${dimSymbol(b.dim)}) — different dimensions`,
    );
  }
  return a.toSI / b.toSI;
}

/* ── monomials: the thing a learner assembles ──────────────────────────────
   A product of palette entries, each raised to a power. One shape serves all
   three questions the widget asks: does this side match that side, can you
   build this dimension, does this conversion chain collapse.
   ──────────────────────────────────────────────────────────────────────── */

export interface Term {
  key: string;
  exponent: number;
}

export interface Factor {
  dim: Dimension;
  /** The numeric product of the `toSI` values. 1 for quantity palettes, where
   *  every entry is already in SI base units. */
  toSI: number;
}

type Table = Record<string, { dim: Dimension; toSI?: number; symbol: string }>;

export const QUANTITY_TABLE: Table = QUANTITIES;
export const UNIT_TABLE: Table = UNITS;

/** Evaluate a monomial: exponents add in dimension space, factors multiply. */
export function evaluateMonomial(terms: readonly Term[], table: Table): Factor {
  let d = DIMENSIONLESS;
  let toSI = 1;
  for (const t of terms) {
    const entry = table[t.key];
    if (!entry) throw new Error(`unknown palette entry "${t.key}"`);
    if (t.exponent === 0) continue;
    d = mulDim(d, powDim(entry.dim, t.exponent));
    toSI *= (entry.toSI ?? 1) ** t.exponent;
  }
  return { dim: d, toSI };
}

/** `L¹⁄² g⁻¹⁄²` — the expression as the learner built it, zero-exponent terms
 *  dropped. */
export function monomialLabel(terms: readonly Term[], table: Table): string {
  const parts = terms
    .filter((t) => Math.abs(t.exponent) > 1e-12)
    .map((t) => `${table[t.key]?.symbol ?? t.key}${superscript(t.exponent)}`);
  return parts.length === 0 ? '1' : parts.join(' ');
}

export interface BalanceResult {
  balanced: boolean;
  left: Dimension;
  right: Dimension;
  /** left ÷ right: what the left side has too much of. `1` when balanced. */
  mismatch: Dimension;
}

export function balance(
  left: readonly Term[],
  right: readonly Term[],
  table: Table,
): BalanceResult {
  const l = evaluateMonomial(left, table).dim;
  const r = evaluateMonomial(right, table).dim;
  return { balanced: dimEqual(l, r), left: l, right: r, mismatch: divDim(l, r) };
}

/** Every exponent combination of `keys` that lands on `target`, searched by
 *  brute force over a grid of exponents.
 *
 *  This is how the pendulum solvable is graded and how the lesson's strongest
 *  claim is checked: given only a length, a gravitational field and a mass,
 *  there is exactly ONE combination with the dimension of time, and the mass
 *  exponent in it is zero. Not asserted in prose — searched. */
export function searchMonomials(
  keys: readonly string[],
  target: Dimension,
  table: Table,
  range = 2,
  step = 0.5,
): Term[][] {
  const grid: number[] = [];
  for (let e = -range; e <= range + 1e-12; e += step) grid.push(Math.round(e / step) * step);

  const found: Term[][] = [];
  const walk = (i: number, acc: Term[]) => {
    if (i === keys.length) {
      if (dimEqual(evaluateMonomial(acc, table).dim, target)) found.push(acc.slice());
      return;
    }
    for (const e of grid) walk(i + 1, [...acc, { key: keys[i], exponent: e }]);
  };
  walk(0, []);
  return found;
}

/* ── the 2019 SI ───────────────────────────────────────────────────────────
   Seven defining constants with exact values; every base unit follows from
   them. Kept as data so a lesson can print the table and a test can check that
   the dimensions are the ones that make the definitions work.
   ──────────────────────────────────────────────────────────────────────── */

export interface DefiningConstant {
  key: string;
  symbol: string;
  name: string;
  /** Exact by definition since 20 May 2019. */
  value: number;
  unitSymbol: string;
  dim: Dimension;
  defines: string;
}

export const SI_CONSTANTS: DefiningConstant[] = [
  {
    key: 'dnuCs', symbol: 'Δν(¹³³Cs)', name: 'caesium hyperfine transition frequency',
    value: 9192631770, unitSymbol: 'Hz', dim: dim({ T: -1 }), defines: 'the second',
  },
  {
    key: 'c', symbol: 'c', name: 'speed of light in vacuum',
    value: 299792458, unitSymbol: 'm/s', dim: VELOCITY, defines: 'the metre',
  },
  {
    key: 'h', symbol: 'h', name: 'Planck constant',
    value: 6.62607015e-34, unitSymbol: 'J·s', dim: dim({ M: 1, L: 2, T: -1 }), defines: 'the kilogram',
  },
  {
    key: 'e', symbol: 'e', name: 'elementary charge',
    value: 1.602176634e-19, unitSymbol: 'C', dim: dim({ I: 1, T: 1 }), defines: 'the ampere',
  },
  {
    key: 'k', symbol: 'k', name: 'Boltzmann constant',
    value: 1.380649e-23, unitSymbol: 'J/K', dim: dim({ M: 1, L: 2, T: -2, Th: -1 }), defines: 'the kelvin',
  },
  {
    key: 'NA', symbol: 'N_A', name: 'Avogadro constant',
    value: 6.02214076e23, unitSymbol: 'mol⁻¹', dim: dim({ N: -1 }), defines: 'the mole',
  },
  {
    key: 'Kcd', symbol: 'K_cd', name: 'luminous efficacy of 540 THz radiation',
    value: 683, unitSymbol: 'lm/W', dim: dim({ J: 1, M: -1, L: -2, T: 3 }), defines: 'the candela',
  },
];

export const constant = (key: string): DefiningConstant => {
  const c = SI_CONSTANTS.find((x) => x.key === key);
  if (!c) throw new Error(`unknown defining constant "${key}"`);
  return c;
};
