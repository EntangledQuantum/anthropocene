/** The first law for an ideal gas (University Physics, ch. 19).
 *
 *  One gas, one ledger. A state is a pressure and a volume; the temperature
 *  and the internal energy follow from them. Energy crosses the boundary two
 *  ways, and the book-keeping is
 *
 *      ΔU = Q − W        Q: heat into the gas,  W: work done BY the gas
 *
 *  Four small pieces, each readable in one sitting:
 *
 *    1. State. T = pV/(nR) and U = n·Cv·T. U is a function of the state
 *       alone, so ΔU between two states needs only the two states.
 *    2. Paths. A path is a list of states joined by straight segments in the
 *       p–V plane. W = ∫p dV is summed segment by segment (the trapezoid rule
 *       is exact on a straight segment), and Q = ΔU + W. A closed loop's net
 *       work is the signed area it encloses, positive when it runs clockwise.
 *    3. The four named paths — isochoric, isobaric, isothermal, adiabatic —
 *       as sampled paths, with their closed forms for the tests.
 *    4. A piston you can move and a flame you can light, integrated as a
 *       first-law ledger: heat goes in at fixed volume, then the volume moves
 *       with no heat (exactly along the adiabat). Splitting the two keeps
 *       every step exact, so the ledger balances to rounding. A leaky variant
 *       lets heat flow through the walls with conductance G, which is how a
 *       fast bicycle-pump stroke comes out adiabatic and a slow one does not.
 *
 *  SI units: Pa, m³, K, J. Scenes convert to kPa and litres for display
 *  (1 kPa · 1 L = 1 J, which is why those units are pleasant here).
 */

/** Molar gas constant, J/(mol·K). */
export const R = 8.314462618;

export interface Gas {
  /** Amount, mol. */
  n: number;
  /** Molar heat capacity at constant volume, J/(mol·K). */
  cv: number;
}

export const CV_MONATOMIC = 1.5 * R;
/** Air near room temperature: two rotations join the three translations. */
export const CV_AIR = 2.5 * R;

export const air = (n: number): Gas => ({ n, cv: CV_AIR });

/** Molar heat capacity at constant pressure. */
export const cpOf = (g: Gas): number => g.cv + R;
export const gammaOf = (g: Gas): number => cpOf(g) / g.cv;

export interface State {
  /** Pressure, Pa. */
  p: number;
  /** Volume, m³. */
  V: number;
}

/* ── 1. state ──────────────────────────────────────────────────────────── */

export const temperatureOf = (g: Gas, s: State): number => (s.p * s.V) / (g.n * R);
export const pressureAt = (g: Gas, T: number, V: number): number => (g.n * R * T) / V;
export const volumeAt = (g: Gas, T: number, p: number): number => (g.n * R * T) / p;
export const stateAt = (g: Gas, T: number, V: number): State => ({ p: pressureAt(g, T, V), V });

/** Internal energy, measured from absolute zero. A function of the state only. */
export const internalEnergy = (g: Gas, s: State): number => g.n * g.cv * temperatureOf(g, s);
export const deltaU = (g: Gas, a: State, b: State): number => internalEnergy(g, b) - internalEnergy(g, a);

/* ── 2. paths ──────────────────────────────────────────────────────────── */

/** Work done by the gas along a path of straight p–V segments: ∫p dV. */
export function workAlong(path: readonly State[]): number {
  let W = 0;
  for (let i = 1; i < path.length; i++) W += 0.5 * (path[i - 1].p + path[i].p) * (path[i].V - path[i - 1].V);
  return W;
}

export interface Ledger {
  /** Heat into the gas, J. */
  Q: number;
  /** Work done by the gas, J. */
  W: number;
  /** Change in internal energy, J. Q − W. */
  dU: number;
}

/** The first-law ledger for a path: W from the area, ΔU from the endpoints, Q from both. */
export function ledgerAlong(g: Gas, path: readonly State[]): Ledger {
  const W = workAlong(path);
  const dU = path.length ? deltaU(g, path[0], path[path.length - 1]) : 0;
  return { Q: dU + W, W, dU };
}

/** Heat into the gas across one straight segment (positive: a flame; negative: ice). */
export const segmentHeat = (g: Gas, a: State, b: State): number => deltaU(g, a, b) + workAlong([a, b]);

/** Signed area of a polygon in the p–V plane (shoelace), positive when the
 *  vertices run clockwise with V to the right and p up. */
export function enclosedArea(loop: readonly State[]): number {
  let A = 0;
  for (let i = 0; i < loop.length; i++) {
    const a = loop[i], b = loop[(i + 1) % loop.length];
    A += a.V * b.p - b.V * a.p;
  }
  return -A / 2;
}

/* ── 3. the four named paths ───────────────────────────────────────────── */

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Fixed volume, to temperature T2. No work. */
export function isochoric(g: Gas, s: State, T2: number, N = 64): State[] {
  const p2 = pressureAt(g, T2, s.V);
  return Array.from({ length: N + 1 }, (_, i) => ({ p: lerp(s.p, p2, i / N), V: s.V }));
}

/** Fixed pressure, to temperature T2. */
export function isobaric(g: Gas, s: State, T2: number, N = 64): State[] {
  const V2 = volumeAt(g, T2, s.p);
  return Array.from({ length: N + 1 }, (_, i) => ({ p: s.p, V: lerp(s.V, V2, i / N) }));
}

/** Fixed temperature, to volume V2: pV = const. Samples are geometric in V. */
export function isothermal(g: Gas, s: State, V2: number, N = 400): State[] {
  const T = temperatureOf(g, s);
  return Array.from({ length: N + 1 }, (_, i) => {
    const V = s.V * (V2 / s.V) ** (i / N);
    return { p: pressureAt(g, T, V), V };
  });
}

/** Pressure on the adiabat through s: pV^γ = const. */
export const adiabatPressure = (g: Gas, s: State, V: number): number => s.p * (s.V / V) ** gammaOf(g);

/** No heat, to volume V2. */
export function adiabatic(g: Gas, s: State, V2: number, N = 400): State[] {
  return Array.from({ length: N + 1 }, (_, i) => {
    const V = s.V * (V2 / s.V) ** (i / N);
    return { p: adiabatPressure(g, s, V), V };
  });
}

/** Closed forms, for checking the sampled paths. */
export const isothermalWork = (g: Gas, T: number, V1: number, V2: number): number => g.n * R * T * Math.log(V2 / V1);
export const adiabaticWork = (g: Gas, s: State, V2: number): number =>
  (s.p * s.V - adiabatPressure(g, s, V2) * V2) / (gammaOf(g) - 1);

/** Heat needed to warm the gas by dT, holding the volume or the pressure. */
export const heatToWarm = (g: Gas, dT: number, hold: 'volume' | 'pressure'): number =>
  g.n * (hold === 'volume' ? g.cv : cpOf(g)) * dT;

/* ── 4. a piston and a flame, as a running ledger ──────────────────────── */

export interface Cylinder {
  T: number;
  V: number;
  /** Heat in so far, J. */
  Q: number;
  /** Work done by the gas so far, J. */
  W: number;
}

export const cylinderAt = (T: number, V: number): Cylinder => ({ T, V, Q: 0, W: 0 });
export const cylinderPressure = (g: Gas, c: Cylinder): number => pressureAt(g, c.T, c.V);

/** Heat dQ at fixed volume: all of it stays as internal energy. */
export const heatAtFixedVolume = (g: Gas, c: Cylinder, dQ: number): Cylinder =>
  ({ ...c, T: c.T + dQ / (g.n * g.cv), Q: c.Q + dQ });

/** Heat dQ under a free piston at pressure p: the gas expands as it warms and
 *  the work it does lifting the piston is p·ΔV. */
export function heatAtFixedPressure(g: Gas, c: Cylinder, dQ: number, p: number): Cylinder {
  const T = c.T + dQ / (g.n * cpOf(g));
  const V = volumeAt(g, T, p);
  return { T, V, Q: c.Q + dQ, W: c.W + p * (V - c.V) };
}

/** Move the piston to V2 with no heat crossing: exactly along the adiabat.
 *  The work done by the gas is what its internal energy loses. */
export function movePiston(g: Gas, c: Cylinder, V2: number): Cylinder {
  const T = c.T * (c.V / V2) ** (gammaOf(g) - 1);
  return { ...c, T, V: V2, W: c.W + g.n * g.cv * (c.T - T) };
}

/** One step of a cylinder whose walls leak heat to a room at Troom through a
 *  conductance G (W/K), while its piston moves to V2. Heat first, then the move. */
export function leakyStep(g: Gas, c: Cylinder, V2: number, G: number, Troom: number, dt: number): Cylinder {
  // exact exponential relaxation at fixed volume over dt
  const tau = (g.n * g.cv) / G;
  const T = Troom + (c.T - Troom) * Math.exp(-dt / tau);
  const warmed = { ...c, T, Q: c.Q + g.n * g.cv * (T - c.T) };
  return movePiston(g, warmed, V2);
}

/** Run a steady stroke from V0 to V1 taking `seconds`, in a leaky cylinder that
 *  starts at the room temperature. Returns the hottest the gas got and the
 *  ledger at the end of the stroke. */
export function stroke(g: Gas, V0: number, V1: number, seconds: number, G: number, Troom: number, steps = 4000) {
  let c = cylinderAt(Troom, V0);
  let peak = c.T;
  const dt = seconds / steps;
  for (let i = 1; i <= steps; i++) {
    c = leakyStep(g, c, lerp(V0, V1, i / steps), G, Troom, dt);
    peak = Math.max(peak, c.T);
  }
  return { peak, end: c };
}

/* ── the chapter's apparatus, in one place so scenes and tests agree ───── */

/** kPa · L = J. */
export const L = 1e-3;
export const KPA = 1e3;

/** Lesson 1: one mole of air at 300 K; the free piston holds 100 kPa. */
export const CH19_ROOM = 300;
export const CH19_P = 100 * KPA;
export const CH19_GAS = air(1);
export const CH19_V0 = volumeAt(CH19_GAS, CH19_ROOM, CH19_P);

/** Lesson 2's plane: A and B, one mole of air. */
export const CH19_A: State = { p: 200 * KPA, V: 10 * L };
export const CH19_B: State = { p: 100 * KPA, V: 30 * L };

/** The two textbook routes from A to B: over the top (expand, then cool) and
 *  underneath (cool, then expand). */
export const routeOver = (a: State, b: State): State[] => [a, { p: a.p, V: b.V }, b];
export const routeUnder = (a: State, b: State): State[] => [a, { p: b.p, V: a.V }, b];

/** The bicycle pump: 0.3 L of room air, squeezed to a third, finger on the valve. */
export const PUMP_V0 = 0.3 * L;
export const PUMP_V1 = 0.1 * L;
export const PUMP_GAS = air((CH19_P * PUMP_V0) / (R * CH19_ROOM));
/** Wall conductance: the pump's air relaxes to room temperature with τ = 1.5 s. */
export const PUMP_G = (PUMP_GAS.n * PUMP_GAS.cv) / 1.5;
