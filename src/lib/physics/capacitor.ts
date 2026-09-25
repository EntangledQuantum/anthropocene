/** Chapter 24: the parallel-plate capacitor, with and without a dielectric.
 *
 *  Real SI units throughout: metres, square metres, coulombs, volts, joules.
 *  The plates are ideal (no fringing), so the field between them is uniform
 *  and C = κ ε₀ A / d exactly.
 *
 *  A dielectric slab here always fills the full thickness of the gap and
 *  covers a fraction `fill` of the plate area, the way a sheet of glass slid
 *  in from one edge does. The capacitor is then two capacitors side by side
 *  at the same voltage: the glass-covered part and the bare part. Both parts
 *  see the same field V/d; the glass part carries κ times the free charge,
 *  and most of that extra charge is cancelled by bound charge on the glass.
 *
 *  Every number a chapter-24 scene prints comes from here, and
 *  capacitor.test.ts pins every claim the lessons make:
 *    - Q = CV, C = ε₀A/d: halve the gap, double the capacitance;
 *    - disconnected, Q stays put: pulling the plates apart raises V and U,
 *      and the work you do pulling equals the rise in U;
 *    - connected, V stays put: charge flows back into the battery, and the
 *      battery's work is 2 ΔU, half from the field and half from your pull;
 *    - closing a switch onto a mismatched voltage turns ½ C ΔV² into heat;
 *    - a full slab divides V, E and U by κ when disconnected and multiplies
 *      Q and U by κ when connected; the free charge never changes when
 *      disconnected (the glass makes no charge);
 *    - a partial slab: the covered part takes κ f / (1 − f + κ f) of the charge;
 *    - energy lives in the gap: ½ κ ε₀ E² times the volume is ½ C V²;
 *    - breakdown caps the field, so a glass-filled gap can hold far more energy.
 */

/** Permittivity of free space, F/m. */
export const EPS0 = 8.8541878128e-12;

/** Dielectric strength of dry air, V/m: the field at which it sparks. */
export const AIR_BREAKDOWN = 3e6;
/** A soda-lime glass sheet: dielectric constant and dielectric strength. */
export const GLASS = { kappa: 5, breakdown: 10e6 } as const;

export interface Cap {
  /** Plate area, m². */
  area: number;
  /** Gap between the plates, m. */
  gap: number;
  /** Dielectric constant of the slab (1 for none). */
  kappa: number;
  /** Fraction of the plate area the slab covers, 0..1. */
  fill: number;
  /** Charge on the positive plate, C. The negative plate holds −q. */
  q: number;
}

export function cap(area: number, gap: number, q = 0, kappa = 1, fill = 0): Cap {
  return { area, gap, kappa, fill: kappa === 1 ? 0 : fill, q };
}

/** Parallel-plate capacitance, F: κ ε₀ A / d. */
export function parallelPlateC(area: number, gap: number, kappa = 1): number {
  return (kappa * EPS0 * area) / gap;
}

/** Capacitance with the slab covering `fill` of the area: two capacitors in parallel. */
export function capacitance(c: Cap): number {
  return parallelPlateC(c.area * (1 - c.fill), c.gap) + parallelPlateC(c.area * c.fill, c.gap, c.kappa);
}

/** Voltage across the plates, V. */
export function voltage(c: Cap): number {
  return c.q / capacitance(c);
}

/** The field in the gap, V/m. The same in the glass and in the air beside it. */
export function field(c: Cap): number {
  return voltage(c) / c.gap;
}

/** Stored energy, J: Q² / 2C = ½ Q V = ½ C V². */
export function energy(c: Cap): number {
  return (c.q * c.q) / (2 * capacitance(c));
}

/** Where the free charge on the positive plate sits, C: beside the glass and beside the air. */
export function chargeSplit(c: Cap): { glass: number; air: number } {
  const V = voltage(c);
  return {
    glass: parallelPlateC(c.area * c.fill, c.gap, c.kappa) * V,
    air: parallelPlateC(c.area * (1 - c.fill), c.gap) * V,
  };
}

/** Bound charge on the glass face beside the positive plate, C (it is negative there).
 *  σ_b = (κ − 1) ε₀ E: it cancels all but 1/κ of the free charge beside it. */
export function boundCharge(c: Cap): number {
  return (c.kappa - 1) * EPS0 * field(c) * c.area * c.fill;
}

/** Energy per cubic metre in a field E inside a material κ, J/m³: ½ κ ε₀ E². */
export function energyDensity(E: number, kappa = 1): number {
  return 0.5 * kappa * EPS0 * E * E;
}

/** Energy in the field, J: the energy density integrated over the gap, region by region. */
export function fieldEnergy(c: Cap): number {
  const E = field(c);
  return energyDensity(E, c.kappa) * c.area * c.fill * c.gap
    + energyDensity(E, 1) * c.area * (1 - c.fill) * c.gap;
}

/** The attraction between the plates, N: ½ Q E. It is −∂U/∂d at fixed charge,
 *  and it does not depend on the gap when the charge is fixed. */
export function plateForce(c: Cap): number {
  return 0.5 * c.q * field(c);
}

/** Charge a capacitor to V, as a battery connected to it does. */
export function atVoltage(c: Cap, V: number): Cap {
  return { ...c, q: capacitance(c) * V };
}

export interface Move {
  /** The capacitor afterwards. */
  after: Cap;
  /** Work your hand did on the plate or slab, J. Positive when you pull against the attraction. */
  you: number;
  /** Work the battery did, J: V ΔQ. Negative when charge is pushed back into it. */
  battery: number;
  /** Change in stored energy, J. */
  dU: number;
  /** Energy turned to heat in the wires, J. */
  heat: number;
}

/** Move the plate to a new gap with the battery disconnected. Q stays put.
 *  The attraction ½QE is the same at every gap, so your work is simply F Δd. */
export function pullIsolated(c: Cap, gap: number): Move {
  const after = { ...c, gap };
  const you = plateForce(c) * (gap - c.gap);
  return { after, you, battery: 0, dU: energy(after) - energy(c), heat: 0 };
}

/** Move the plate to a new gap with the battery connected at V. V stays put.
 *  The attraction ½ C V²/d falls as 1/d², so your work is ½ ε₀ A_eff V² (1/d₁ − 1/d₂). */
export function pullConnected(c: Cap, V: number, gap: number): Move {
  const before = atVoltage(c, V);
  const after = atVoltage({ ...c, gap }, V);
  const aEff = c.area * (1 - c.fill) + c.kappa * c.area * c.fill;
  const you = 0.5 * EPS0 * aEff * V * V * (1 / c.gap - 1 / gap);
  const battery = V * (after.q - before.q);
  return { after, you, battery, dU: energy(after) - energy(before), heat: 0 };
}

/** Slide the slab to a new fill with the battery disconnected. Q stays put. */
export function slideIsolated(c: Cap, fill: number): Move {
  const after = { ...c, fill };
  const dU = energy(after) - energy(c);
  // The field pulls the slab in; holding it back, your hand absorbs −dU.
  return { after, you: dU, battery: 0, dU, heat: 0 };
}

/** Slide the slab to a new fill with the battery connected at V. V stays put. */
export function slideConnected(c: Cap, V: number, fill: number): Move {
  const before = atVoltage(c, V);
  const after = atVoltage({ ...c, fill }, V);
  const dU = energy(after) - energy(before);
  const battery = V * (after.q - before.q);
  return { after, you: dU - battery, battery, dU, heat: 0 };
}

/** Close a switch onto a battery at V. The charge jumps to C V; any mismatch
 *  in voltage is paid for as heat in the wires: ½ C (V − V₀)². */
export function connect(c: Cap, V: number): Move {
  const after = atVoltage(c, V);
  const battery = V * (after.q - c.q);
  const dU = energy(after) - energy(c);
  return { after, you: 0, battery, dU, heat: battery - dU };
}

/** Does the gap spark? The field has passed the breakdown strength of what fills it.
 *  With a partial slab the bare part (air) goes first, since the field is the same in both. */
export function sparks(c: Cap): boolean {
  const limit = c.fill >= 1 ? GLASS.breakdown : AIR_BREAKDOWN;
  return field(c) > limit;
}

/** The most energy a gap can hold before it sparks, J: ½ κ ε₀ E_max² × volume. */
export function maxEnergy(area: number, gap: number, kappa: number, breakdown: number): number {
  return energyDensity(breakdown, kappa) * area * gap;
}

/** Energy stored in a capacitor C at voltage V, J. */
export function storedEnergy(C: number, V: number): number {
  return 0.5 * C * V * V;
}

/* ── formatting for readouts ────────────────────────────────────────────── */

const PREFIX: [number, string][] = [[1e-12, 'p'], [1e-9, 'n'], [1e-6, 'µ'], [1e-3, 'm'], [1, ''], [1e3, 'k'], [1e6, 'M']];

/** Format a value with an SI prefix and three significant figures: 531 pC, 3.19 nJ. */
export function si(v: number, unit: string): string {
  if (v === 0) return `0 ${unit}`;
  const a = Math.abs(v);
  let [f, p] = PREFIX[0];
  for (const [ff, pp] of PREFIX) if (a >= ff * 0.9995) { f = ff; p = pp; }
  const x = v / f;
  const s = Math.abs(x) >= 100 ? x.toFixed(0) : Math.abs(x) >= 10 ? x.toFixed(1) : x.toFixed(2);
  return `${s} ${p}${unit}`;
}
