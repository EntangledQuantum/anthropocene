/**
 * Filling the slots, Chapter 41: exclusion, the filling order and the
 * periodic table it builds.
 *
 * Each hydrogen-like state (n, l, m) is a slot with two places, one per spin.
 * Pauli exclusion says no two electrons share all four labels, so a subshell
 * holds 2(2l + 1) and a shell holds 2n². In atoms with more than one electron
 * the inner electrons screen the nucleus, which splits 3s, 3p and 3d apart;
 * the order they fill in is the Madelung rule: lowest n + l first, ties to the
 * lower n. Pinned in __tests__/aufbau.test.ts against the known ground
 * configurations of hydrogen to calcium.
 *
 * Ionisation energies are measured data (NIST Atomic Spectra Database), not a
 * model; the tests check the sawtooth the lesson asks about is in them. The
 * screening story behind the sawtooth is Slater's rules, a model, and is
 * labelled as one wherever it is printed.
 */
import { L_LETTERS } from './hydrogen.ts';

export interface Subshell {
  n: number;
  l: number;
  /** '3p' */
  label: string;
  /** 2(2l + 1): two spins for each of the 2l + 1 values of m. */
  capacity: number;
}

export const subshellCapacity = (l: number) => 2 * (2 * l + 1);
/** Sum of the subshell capacities in shell n: 2n². */
export function shellCapacity(n: number): number {
  let s = 0;
  for (let l = 0; l < n; l++) s += subshellCapacity(l);
  return s;
}

/** Subshells in the order they fill: by n + l, then by n. */
export function fillingOrder(maxN = 7): Subshell[] {
  const all: Subshell[] = [];
  for (let n = 1; n <= maxN; n++) {
    for (let l = 0; l < n && l < 4; l++) all.push({ n, l, label: `${n}${L_LETTERS[l]}`, capacity: subshellCapacity(l) });
  }
  return all.sort((a, b) => (a.n + a.l) - (b.n + b.l) || a.n - b.n);
}

export interface Occupancy extends Subshell { count: number }

/** The ground configuration of a neutral atom with Z electrons (Madelung). */
export function aufbau(Z: number): Occupancy[] {
  let left = Z;
  const out: Occupancy[] = [];
  for (const s of fillingOrder()) {
    if (left <= 0) break;
    const count = Math.min(left, s.capacity);
    out.push({ ...s, count });
    left -= count;
  }
  return out;
}

const SUP = '⁰¹²³⁴⁵⁶⁷⁸⁹';
const sup = (k: number) => String(k).split('').map((d) => SUP[+d]).join('');

/** '1s² 2s² 2p⁶ 3s¹' */
export const configString = (occ: readonly { label: string; count: number }[]) =>
  occ.filter((o) => o.count > 0).map((o) => `${o.label}${sup(o.count)}`).join(' ');

/** '1s2 2s2 2p6 3s1', for comparing with a table. */
export const configPlain = (occ: readonly { label: string; count: number }[]) =>
  occ.filter((o) => o.count > 0).map((o) => `${o.label}${o.count}`).join(' ');

export const ELEMENTS: readonly { z: number; symbol: string; name: string }[] = [
  'H Hydrogen', 'He Helium', 'Li Lithium', 'Be Beryllium', 'B Boron', 'C Carbon', 'N Nitrogen', 'O Oxygen',
  'F Fluorine', 'Ne Neon', 'Na Sodium', 'Mg Magnesium', 'Al Aluminium', 'Si Silicon', 'P Phosphorus',
  'S Sulfur', 'Cl Chlorine', 'Ar Argon', 'K Potassium', 'Ca Calcium',
].map((s, i) => { const [symbol, name] = s.split(' '); return { z: i + 1, symbol, name }; });

/** First ionisation energies, eV, Z = 1…20. Measured: NIST ASD. */
export const IONIZATION_EV: readonly number[] = [
  13.598, 24.587, 5.392, 9.323, 8.298, 11.260, 14.534, 13.618, 17.423, 21.565,
  5.139, 7.646, 5.986, 8.152, 10.487, 10.360, 12.968, 15.760, 4.341, 6.113,
];

export const ionizationEV = (Z: number) => IONIZATION_EV[Z - 1];

/** Slater's screening groups, in order: (1s)(2s,2p)(3s,3p)(3d)(4s,4p)(4d)(4f)… */
const group = (n: number, l: number) => (l <= 1 ? `${n}sp` : `${n}${L_LETTERS[l]}`);
const GROUP_ORDER = ['1sp', '2sp', '3sp', '3d', '4sp', '4d', '4f', '5sp', '5d', '5f', '6sp', '6d', '7sp'];

/**
 * Slater's rules (a model): the nuclear charge an electron in subshell (n, l)
 * of the ground-state atom Z effectively feels, after the other electrons
 * screen it. For s and p: 0.35 per other electron in its own group (0.30 in
 * 1s), 0.85 per electron one shell down, 1.00 per electron deeper. For d and
 * f: 0.35 in its own group and 1.00 for everything inside.
 */
export function slaterZeff(Z: number, n: number, l: number): number {
  const occ = aufbau(Z);
  const g = group(n, l);
  const gi = GROUP_ORDER.indexOf(g);
  let S = 0;
  for (const o of occ) {
    const og = group(o.n, o.l);
    const oi = GROUP_ORDER.indexOf(og);
    if (oi > gi) continue;
    if (og === g) {
      const others = o.count - (o.n === n && o.l === l ? 1 : 0);
      S += others * (n === 1 ? 0.3 : 0.35);
    } else if (l <= 1) {
      S += o.count * (o.n === n - 1 ? 0.85 : 1.0);
    } else {
      S += o.count * 1.0;
    }
  }
  return Z - S;
}

/** The outermost occupied subshell of atom Z: where the easiest electron lives. */
export function outerSubshell(Z: number): Occupancy {
  const occ = aufbau(Z);
  return occ.reduce((a, b) => (b.n > a.n || (b.n === a.n && b.l > a.l) ? b : a));
}
