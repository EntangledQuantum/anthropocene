/** Chapter 26: direct-current circuits.
 *
 *  Two things live here, and every number a chapter-26 scene prints comes from
 *  them:
 *
 *  1. A small circuit solver: modified nodal analysis (MNA). Unknowns are the
 *     node potentials plus the current through every voltage source. Kirchhoff's
 *     junction rule is one equation per node; the loop rule is built in, because
 *     every node carries one potential. Ideal wires are 0 V sources, so the
 *     current in every drawn wire segment comes out of the solve directly, which
 *     is what the scenes need to move their dots.
 *
 *  2. RC charging and discharging, in closed form, plus the energy ledger.
 *
 *  Bulbs are modelled as ohmic resistors (the textbook "identical bulbs"), and
 *  brightness is the power a bulb dissipates, I²R.
 *
 *  circuits.test.ts pins every claim the lessons make:
 *    - A in series with B∥C: A glows 4× brighter than B, B = C;
 *    - current in = current out at every node, for every wiring the scenes offer;
 *    - the bulbs' powers add to the battery's output;
 *    - a fourth bulb beside B and C brightens A; anywhere else it dims A or
 *      leaves it alone; across the ideal battery it leaves A alone;
 *    - the junction potential that balances the flows is the one the solver finds;
 *    - V reaches 63.2 % of the EMF at t = RC, 95 % at about 3RC;
 *    - charging through any R heats the resistor by ½CE², the same as it stores;
 *    - on discharge, half the energy has gone when V has fallen to V₀/√2.
 */

/* ── the solver ──────────────────────────────────────────────────────────── */

/** An element between nodes `a` and `b`. Node 0 is ground. */
export type Element =
  | { id: string; kind: 'R'; a: number; b: number; ohms: number }
  /** Ideal source: V(a) − V(b) = volts. `a` is the + terminal. */
  | { id: string; kind: 'V'; a: number; b: number; volts: number }
  /** Ideal wire: a 0 V source, so its current is an unknown of the solve. */
  | { id: string; kind: 'wire'; a: number; b: number };

export interface Circuit {
  /** Number of nodes, including ground (node 0). */
  nodes: number;
  elements: Element[];
}

export interface Solution {
  /** Potential of each node, V. v[0] = 0. */
  v: number[];
  /** Current through each element from a to b, A. A battery delivering current
   *  carries it from − to + inside, so its entry is negative; see `sourceOut`. */
  i: Record<string, number>;
  /** Power absorbed by each element, W (negative for a source that delivers). */
  p: Record<string, number>;
}

/** Tiny conductance from every node to ground, as SPICE does, so a node left
 *  floating by an open slot still has a defined potential. */
const GMIN = 1e-15;

/** Gaussian elimination with partial pivoting. Solves A x = b in place. */
export function solveLinear(A: number[][], b: number[]): number[] {
  const n = b.length;
  const M = A.map((row, r) => [...row, b[r]]);
  for (let c = 0; c < n; c++) {
    let piv = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r;
    if (Math.abs(M[piv][c]) < 1e-300) throw new Error('singular circuit');
    [M[c], M[piv]] = [M[piv], M[c]];
    for (let r = c + 1; r < n; r++) {
      const f = M[r][c] / M[c][c];
      if (f === 0) continue;
      for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
    }
  }
  const x = new Array<number>(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    let s = M[r][n];
    for (let k = r + 1; k < n; k++) s -= M[r][k] * x[k];
    x[r] = s / M[r][r];
  }
  return x;
}

/** Modified nodal analysis. One junction-rule row per node, one row per source. */
export function solveCircuit(c: Circuit): Solution {
  const nv = c.nodes - 1; // unknown potentials (ground fixed at 0)
  const sources = c.elements.filter((e) => e.kind !== 'R');
  const n = nv + sources.length;
  const A = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  const rhs = new Array<number>(n).fill(0);
  const row = (node: number) => node - 1; // -1 for ground: skipped

  for (let k = 1; k < c.nodes; k++) A[row(k)][row(k)] += GMIN;
  for (const e of c.elements) {
    if (e.kind !== 'R') continue;
    const g = 1 / e.ohms;
    const ra = row(e.a), rb = row(e.b);
    if (ra >= 0) A[ra][ra] += g;
    if (rb >= 0) A[rb][rb] += g;
    if (ra >= 0 && rb >= 0) { A[ra][rb] -= g; A[rb][ra] -= g; }
  }
  sources.forEach((e, s) => {
    const col = nv + s;
    const ra = row(e.a), rb = row(e.b);
    // the source current j flows a → b through the element: it leaves node a
    if (ra >= 0) { A[ra][col] += 1; A[col][ra] += 1; }
    if (rb >= 0) { A[rb][col] -= 1; A[col][rb] -= 1; }
    rhs[col] = e.kind === 'V' ? e.volts : 0;
  });

  const x = solveLinear(A, rhs);
  const v = [0, ...x.slice(0, nv)];
  const i: Record<string, number> = {};
  const p: Record<string, number> = {};
  for (const e of c.elements) {
    if (e.kind === 'R') i[e.id] = (v[e.a] - v[e.b]) / e.ohms;
    p[e.id] = 0;
  }
  sources.forEach((e, s) => { i[e.id] = x[nv + s]; });
  for (const e of c.elements) p[e.id] = (v[e.a] - v[e.b]) * i[e.id];
  return { v, i, p };
}

/** Net current leaving each node through the circuit's elements, A. Zero at every
 *  node is Kirchhoff's junction rule; the test checks it. */
export function nodeImbalance(c: Circuit, s: Solution): number[] {
  const out = new Array<number>(c.nodes).fill(0);
  for (const e of c.elements) { out[e.a] += s.i[e.id]; out[e.b] -= s.i[e.id]; }
  return out;
}

/** Current a source delivers out of its + terminal into the circuit, A. */
export function sourceOut(s: Solution, id: string): number {
  return -s.i[id];
}

/** Resistors in series and in parallel, Ω. */
export const series = (...r: number[]) => r.reduce((a, b) => a + b, 0);
export const parallel = (...r: number[]) => 1 / r.reduce((a, b) => a + 1 / b, 0);

/* ── chapter 26, lesson 1: three bulbs and a spare ──────────────────────── */

/** The battery and the bulbs of lesson 1. */
export const CH26_EMF = 6;
export const CH26_BULB = 12;

/** Where the spare bulb D can go. */
export type TrioSlot = 'none' | 'series' | 'alongA' | 'branch' | 'battery';

/** Node numbers of the drawn circuit (see ThreeBulbs.tsx for the picture).
 *  Top rail: T0 battery +, T1 battery-slot tap, T2 left of A, T3 right of A,
 *  T5 the junction (top of B), T6 top of C, T7 top of the branch slot.
 *  P2, P3 the corners of the slot above A. Bottom rail: B0 (ground, battery −),
 *  B1, B5, B6, B7. */
export const TRIO_NODE = {
  B0: 0, T0: 1, T1: 2, T2: 3, T3: 4, T5: 5, T6: 6, T7: 7, P2: 8, P3: 9, B1: 10, B5: 11, B6: 12, B7: 13,
} as const;

/** The three-bulb circuit, with the spare bulb D in `slot`. Every drawn wire
 *  segment is its own element, so each has a current. */
export function trioCircuit(slot: TrioSlot = 'none', emf = CH26_EMF, R = CH26_BULB): Circuit {
  const N = TRIO_NODE;
  const w = (id: string, a: number, b: number): Element => ({ id, kind: 'wire', a, b });
  const bulb = (id: string, a: number, b: number): Element => ({ id, kind: 'R', a, b, ohms: R });
  const el: Element[] = [
    { id: 'bat', kind: 'V', a: N.T0, b: N.B0, volts: emf },
    w('t01', N.T0, N.T1), w('t12', N.T1, N.T2),
    bulb('A', N.T2, N.T3),
    slot === 'series' ? bulb('D', N.T3, N.T5) : w('t35', N.T3, N.T5),
    bulb('B', N.T5, N.B5),
    w('t56', N.T5, N.T6),
    bulb('C', N.T6, N.B6),
    w('b65', N.B6, N.B5), w('b51', N.B5, N.B1), w('b10', N.B1, N.B0),
  ];
  if (slot === 'branch') el.push(w('t67', N.T6, N.T7), bulb('D', N.T7, N.B7), w('b76', N.B7, N.B6));
  if (slot === 'battery') el.push(bulb('D', N.T1, N.B1));
  if (slot === 'alongA') el.push(w('p2', N.T2, N.P2), bulb('D', N.P2, N.P3), w('p3', N.P3, N.T3));
  return { nodes: 14, elements: el };
}

export interface TrioReading {
  circuit: Circuit;
  sol: Solution;
  /** Power in each bulb present, W. */
  power: Record<string, number>;
  /** Current through each bulb present, A. */
  current: Record<string, number>;
  /** Current the battery delivers, A, and its power output, W. */
  batteryI: number;
  batteryP: number;
}

export function readTrio(slot: TrioSlot = 'none', emf = CH26_EMF, R = CH26_BULB): TrioReading {
  const circuit = trioCircuit(slot, emf, R);
  const sol = solveCircuit(circuit);
  const power: Record<string, number> = {};
  const current: Record<string, number> = {};
  for (const e of circuit.elements) if (e.kind === 'R') { power[e.id] = sol.p[e.id]; current[e.id] = sol.i[e.id]; }
  const batteryI = sourceOut(sol, 'bat');
  return { circuit, sol, power, current, batteryI, batteryP: batteryI * emf };
}

/** The flows at the junction of A with B∥C when the junction sits at `vm` volts:
 *  what arrives through A and what leaves through B and C. They balance only at
 *  the potential the solver finds. */
export function junctionFlows(vm: number, emf = CH26_EMF, R = CH26_BULB) {
  const inA = (emf - vm) / R;
  const outB = vm / R, outC = vm / R;
  return {
    inA, outB, outC, out: outB + outC,
    /** Net current into the junction, A: positive means charge would pile up. */
    net: inA - outB - outC,
    pA: (emf - vm) ** 2 / R, pB: vm ** 2 / R, pC: vm ** 2 / R,
  };
}

/** The four wirings the lesson-1 rank asks about, as equivalent resistances. */
export function batteryCurrent(net: 'one' | 'two-series' | 'two-parallel' | 'trio' | 'three-parallel', emf = CH26_EMF, R = CH26_BULB): number {
  const req = { one: R, 'two-series': series(R, R), 'two-parallel': parallel(R, R), trio: series(R, parallel(R, R)), 'three-parallel': parallel(R, R, R) }[net];
  return emf / req;
}

/* ── chapter 26, lesson 2: charging and emptying a flash capacitor ──────── */

/** The flash of lesson 2: a 300 V supply and a 200 µF capacitor. */
export const CH26_FLASH: Readonly<{ emf: number; C: number; ready: number }> = { emf: 300, C: 200e-6, ready: 0.95 };
/** The lamp the charged capacitor empties through in lesson 2. */
export const CH26_LAMP_R = 20e3;

/** The time constant, s. */
export const tau = (R: number, C: number) => R * C;

/** Capacitor voltage t seconds into charging from v0 towards emf through R. */
export function chargeV(t: number, emf: number, R: number, C: number, v0 = 0): number {
  return emf + (v0 - emf) * Math.exp(-t / (R * C));
}

/** Capacitor voltage t seconds into discharging from v0 through R. */
export function dischargeV(t: number, v0: number, R: number, C: number): number {
  return v0 * Math.exp(-t / (R * C));
}

/** Time to charge from empty to fraction f of the EMF, s: −RC ln(1 − f). */
export function timeToFraction(f: number, R: number, C: number): number {
  return -R * C * Math.log(1 - f);
}

/** The resistor that charges C to fraction f in time t, Ω. */
export function resistorForTime(t: number, f: number, C: number): number {
  return t / (-C * Math.log(1 - f));
}

/** Charging from empty for time t: energy the source gave, the capacitor holds,
 *  and the resistor turned into heat, J. The heat does not depend on R at the
 *  end of a full charge: it is ½CE², exactly what the capacitor stores. */
export function chargeLedger(t: number, emf: number, R: number, C: number) {
  const x = Math.exp(-t / (R * C));
  const full = 0.5 * C * emf * emf;
  return { source: 2 * full * (1 - x), stored: full * (1 - x) ** 2, heat: full * (1 - x * x) };
}

/** Energy stored in C at voltage v, J. */
export const capEnergy = (C: number, v: number) => 0.5 * C * v * v;

/** Fraction of the stored energy that has left when the voltage is at v of v0. */
export const energyGoneAt = (v: number, v0: number) => 1 - (v / v0) ** 2;

/** One exact step of charging (or, with emf = 0, discharging) through R:
 *  the new voltage, the charge that moved, the energy the source gave and the
 *  heat the resistor made during the step. Summed over any number of steps, even
 *  with R changed between them, the heat is exact. */
export function chargeStep(v: number, dt: number, emf: number, R: number, C: number) {
  const v1 = chargeV(dt, emf, R, C, v);
  const dQ = C * (v1 - v);
  return { v: v1, dQ, source: emf * dQ, heat: 0.5 * C * ((emf - v) ** 2 - (emf - v1) ** 2) };
}
