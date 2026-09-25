/** Temperature and heat (University Physics, ch. 17).
 *
 *  Four small pieces, each readable in one sitting:
 *
 *    1. Sensible heat and mixing. Q = m·c·ΔT, and two lumps that touch end at
 *       the heat-capacity-weighted mean temperature. Every joule one lump
 *       loses the other gains; `heatLedger` returns the books so a test can
 *       check they balance.
 *    2. Two lumps coupled through a conductance G (W/K). The exchange is
 *       solved exactly: the temperature gap decays as e^(−t/τ) with
 *       τ = C₁C₂ / (G(C₁ + C₂)), and the heat that has flowed is one number
 *       both lumps agree on, so energy is conserved at every instant.
 *    3. Water with its phase. Enthalpy is measured from ice at 0 °C, so a
 *       piece of water is one monotone function H(T) with a flat step of
 *       height m·L at 0 °C. Everything about melting falls out of inverting
 *       that function: the thermometer sits still while H climbs the step.
 *    4. Conduction. Fourier's law for a slab, P = kAΔT/L, and the contact
 *       temperature of two touching bodies, which is set by their thermal
 *       effusivities √(kρc). That is why steel and wood at the same
 *       temperature feel different.
 *
 *  SI units throughout, temperatures in °C (only differences matter here).
 */

/* ── materials ─────────────────────────────────────────────────────────── */

export interface Material {
  name: string;
  /** Specific heat, J/(kg·K). */
  c: number;
  /** Thermal conductivity, W/(m·K). */
  k: number;
  /** Density, kg/m³. */
  rho: number;
}

/** Room-temperature handbook values (Young & Freedman tables, rounded). */
export const MATERIALS = {
  water: { name: 'water', c: 4186, k: 0.6, rho: 1000 },
  ice: { name: 'ice', c: 2090, k: 2.2, rho: 917 },
  iron: { name: 'iron', c: 449, k: 80, rho: 7870 },
  steel: { name: 'steel', c: 490, k: 50, rho: 7850 },
  aluminium: { name: 'aluminium', c: 900, k: 205, rho: 2700 },
  copper: { name: 'copper', c: 385, k: 385, rho: 8960 },
  wood: { name: 'pine', c: 1700, k: 0.12, rho: 500 },
  polystyrene: { name: 'polystyrene foam', c: 1300, k: 0.033, rho: 30 },
  /** Living skin and the flesh just under it. */
  skin: { name: 'skin', c: 3500, k: 0.37, rho: 1100 },
} as const satisfies Record<string, Material>;

export type MaterialId = keyof typeof MATERIALS;

export const C_WATER = MATERIALS.water.c;
export const C_ICE = MATERIALS.ice.c;
/** Latent heat of fusion of water, J/kg. */
export const L_FUSION = 334_000;
/** Surface temperature of a hand, °C. */
export const SKIN_T = 33;

/* ── 1. sensible heat and mixing ───────────────────────────────────────── */

/** A lump at one uniform temperature that does not change phase. */
export interface Lump { m: number; c: number; T: number }

export const heatCapacity = (b: Pick<Lump, 'm' | 'c'>): number => b.m * b.c;

/** Heat needed to change a lump's temperature by dT. Negative means heat out. */
export const heatFor = (m: number, c: number, dT: number): number => m * c * dT;

/** Where lumps that touch end up: the mean temperature weighted by m·c. */
export function mixTemperature(bodies: readonly Lump[]): number {
  let C = 0, CT = 0;
  for (const b of bodies) { C += b.m * b.c; CT += b.m * b.c * b.T; }
  return CT / C;
}

/** Heat each lump gains in going to Tf. At the true Tf they sum to zero. */
export function heatLedger(bodies: readonly Lump[], Tf = mixTemperature(bodies)): number[] {
  return bodies.map((b) => heatFor(b.m, b.c, Tf - b.T));
}

/**
 * The mass of a partner (specific heat c, starting at T) that brings `lump`
 * to Tf when they touch. From m₁c₁(T₁ − Tf) = m₂c₂(Tf − T₂).
 */
export function partnerMassFor(lump: Lump, c: number, T: number, Tf: number): number {
  return (lump.m * lump.c * (lump.T - Tf)) / (c * (Tf - T));
}

/** Lumps that stay in equilibrium with each other, all warmed by Q together. */
export function warmTogether(lumps: readonly Lump[], Q: number): { T: number; shares: number[] } {
  const C = lumps.reduce((s, b) => s + b.m * b.c, 0);
  const T0 = mixTemperature(lumps);
  const dT = Q / C;
  return { T: T0 + dT, shares: lumps.map((b) => b.m * b.c * dT) };
}

/* ── 2. two lumps through a conductance ────────────────────────────────── */

export interface Exchange {
  /** Time constant of the approach, s. */
  tau: number;
  /** The shared final temperature. */
  Tf: number;
  /** Heat that will have crossed from a to b when it is all over, J. */
  Qtotal: number;
  /** The state at time t: both temperatures, heat moved a→b so far, and its rate. */
  at: (t: number) => { Ta: number; Tb: number; Q: number; P: number };
}

/**
 * Lumps a and b touch through a conductance G (W/K): the heat current is
 * G·(Ta − Tb). Solved exactly, so a and b always agree on how much moved.
 */
export function exchange(a: Lump, b: Lump, G: number): Exchange {
  const Ca = heatCapacity(a), Cb = heatCapacity(b);
  const Tf = mixTemperature([a, b]);
  const tau = (Ca * Cb) / (G * (Ca + Cb));
  const Qtotal = Ca * (a.T - Tf);
  return {
    tau, Tf, Qtotal,
    at: (t) => {
      const f = Math.exp(-Math.max(0, t) / tau);
      const Q = Qtotal * (1 - f);
      const Ta = a.T - Q / Ca, Tb = b.T + Q / Cb;
      return { Ta, Tb, Q, P: G * (Ta - Tb) };
    },
  };
}

/* ── 3. water that can melt ────────────────────────────────────────────── */

/** Some water: total mass m (kg), of which `ice` kg is frozen, at temperature T. */
export interface Water { m: number; ice: number; T: number }

/**
 * Enthalpy of water measured from all-ice at 0 °C, J. Below zero it is all
 * ice; at zero it is partly melted; above zero it is all liquid.
 */
export function waterEnthalpy(w: Water): number {
  if (w.ice >= w.m) return w.m * C_ICE * Math.min(0, w.T);
  if (w.ice > 0) return (w.m - w.ice) * L_FUSION;
  return w.m * L_FUSION + w.m * C_WATER * Math.max(0, w.T);
}

/** The inverse: what state has this much enthalpy? */
export function waterFromEnthalpy(m: number, H: number): Water {
  if (H <= 0) return { m, ice: m, T: H / (m * C_ICE) };
  if (H < m * L_FUSION) return { m, ice: m - H / L_FUSION, T: 0 };
  return { m, ice: 0, T: (H - m * L_FUSION) / (m * C_WATER) };
}

/** Add heat Q to some water and read off where it lands. */
export const heatWater = (w: Water, Q: number): Water => waterFromEnthalpy(w.m, waterEnthalpy(w) + Q);

/** Enthalpy of a lump on the same zero (0 °C). */
const lumpEnthalpy = (b: Lump) => b.m * b.c * b.T;

export interface Equilibrium { T: number; ice: number; water: number; H: number }

/**
 * Everything touches until it shares one temperature. Solids never change
 * phase; all the water pools into one body. Found by inverting the total
 * enthalpy, which is piecewise linear in T with a flat step at 0 °C.
 */
export function equilibrate(solids: readonly Lump[], waters: readonly Water[]): Equilibrium {
  const H = solids.reduce((s, b) => s + lumpEnthalpy(b), 0) + waters.reduce((s, w) => s + waterEnthalpy(w), 0);
  const Cs = solids.reduce((s, b) => s + b.m * b.c, 0);
  const M = waters.reduce((s, w) => s + w.m, 0);
  if (H <= 0) return { T: H / (Cs + M * C_ICE), ice: M, water: 0, H };
  if (H < M * L_FUSION) return { T: 0, ice: M - H / L_FUSION, water: H / L_FUSION, H };
  return { T: (H - M * L_FUSION) / (Cs + M * C_WATER), ice: 0, water: M, H };
}

/** Total enthalpy of a set of solids and waters, for checking conservation. */
export const totalEnthalpy = (solids: readonly Lump[], waters: readonly Water[]): number =>
  solids.reduce((s, b) => s + lumpEnthalpy(b), 0) + waters.reduce((s, w) => s + waterEnthalpy(w), 0);

/**
 * How many times longer melting takes than warming the same ice up to 0 °C
 * from −dT, under a steady heater: L / (c_ice · dT).
 */
export const plateauRatio = (dTbelow: number): number => L_FUSION / (C_ICE * dTbelow);

/** A drink (liquid) with ice cubes at 0 °C floating in it. */
export interface Drink { liquid: number; T: number; ice: number }

/**
 * One step of ice melting in a drink. Heat flows from the drink into the ice
 * at G·(T − 0), with G scaled by the ice's surface (∝ mass^⅔) relative to
 * `ice0`. The heat that leaves the liquid is exactly the heat that melts ice,
 * and the meltwater joins the drink at 0 °C, so enthalpy is conserved at
 * every step, not just at the end.
 */
export function stepDrink(d: Drink, G: number, ice0: number, dt: number): Drink {
  if (d.ice <= 0 || d.T <= 0) return d;
  const surface = Math.cbrt((d.ice / ice0) ** 2);
  let Q = G * surface * d.T * dt;
  // Never pull the drink below 0 °C, never melt more ice than there is.
  Q = Math.min(Q, d.liquid * C_WATER * d.T, d.ice * L_FUSION);
  const melt = Q / L_FUSION;
  const liquid = d.liquid + melt;
  return { liquid, ice: d.ice - melt, T: (d.liquid * C_WATER * d.T - Q) / (liquid * C_WATER) };
}

export const drinkEnthalpy = (d: Drink): number =>
  waterEnthalpy({ m: d.liquid, ice: 0, T: d.T }) + waterEnthalpy({ m: d.ice, ice: d.ice, T: 0 });

/** Where a drink with ice ends up, straight from the enthalpy budget. */
export const drinkSettles = (liquidKg: number, T: number, iceKg: number): Equilibrium =>
  equilibrate([], [{ m: liquidKg, ice: 0, T }, { m: iceKg, ice: iceKg, T: 0 }]);

/* ── 4. conduction ─────────────────────────────────────────────────────── */

/** Fourier's law through a slab: heat current, W. */
export const conductionPower = (k: number, A: number, dT: number, L: number): number => (k * A * dT) / L;

/** The slab thickness that lets exactly P through. */
export const thicknessFor = (k: number, A: number, dT: number, P: number): number => (k * A * dT) / P;

export interface CoolBox {
  /** Ice at the start, kg. */
  ice: number;
  /** Wall conductivity, W/(m·K). */
  k: number;
  /** Wall area, m². */
  A: number;
  /** Wall thickness, m. */
  L: number;
  /** Outside air, °C. */
  Tout: number;
}

/**
 * A cool box through a day. While ice remains the inside is pinned at 0 °C,
 * so the leak is steady and the ice falls in a straight line. Once it has all
 * melted, the meltwater warms toward the outside exponentially.
 */
export function coolBoxAt(box: CoolBox, t: number): { ice: number; T: number; P: number } {
  const G = (box.k * box.A) / box.L;
  const P0 = G * box.Tout;
  const tMelt = (box.ice * L_FUSION) / P0;
  if (t <= tMelt) return { ice: box.ice - (P0 * t) / L_FUSION, T: 0, P: P0 };
  const tau = (box.ice * C_WATER) / G;
  const T = box.Tout * (1 - Math.exp(-(t - tMelt) / tau));
  return { ice: 0, T, P: G * (box.Tout - T) };
}

/** The thinnest wall that still leaves `keep` kg of ice after `seconds`. */
export function thinnestWall(box: Omit<CoolBox, 'L'>, keep: number, seconds: number): number {
  const P = ((box.ice - keep) * L_FUSION) / seconds;
  return thicknessFor(box.k, box.A, box.Tout, P);
}

/** Thermal effusivity √(kρc): how hard a material pulls heat from a surface it touches. */
export const effusivity = (m: Material): number => Math.sqrt(m.k * m.rho * m.c);

/**
 * Two thick bodies pressed together settle, at the interface, on the
 * effusivity-weighted mean of their temperatures, and stay there. This is
 * the temperature your skin actually meets.
 */
export function contactTemperature(e1: number, T1: number, e2: number, T2: number): number {
  return (e1 * T1 + e2 * T2) / (e1 + e2);
}

/** Heat flux out of body 1 into body 2 a time t after they touch, W/m². */
export function contactFlux(e1: number, T1: number, e2: number, T2: number, t: number): number {
  return ((T1 - T2) * (e1 * e2) / (e1 + e2)) / Math.sqrt(Math.PI * t);
}

/** What your skin meets when a hand rests on `material` at temperature T. */
export const feltTemperature = (material: Material, T: number, skinT = SKIN_T): number =>
  contactTemperature(effusivity(MATERIALS.skin), skinT, effusivity(material), T);

/* ── heat is energy ────────────────────────────────────────────────────── */

/** The height the energy that warms water by dT would lift the same water: c·ΔT/g. */
export const liftForWarming = (c: number, dT: number, g: number): number => (c * dT) / g;
