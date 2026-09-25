/** Chapter 25: current, resistance and electromotive force.
 *
 *  SI throughout (amperes, metres, ohms, volts, watts). Two small models:
 *
 *    a wire      — a metal with a free-electron density n and a resistivity ρ,
 *                  shaped by a length L and a cross-section A. Current is
 *                  I = n q A v_d, so the drift speed v_d = I / (n q A); the
 *                  wire's resistance is R = ρL/A.
 *    a real cell — an ideal pump of emf ε in series with an internal
 *                  resistance r. Driving an external load R it sends
 *                  I = ε / (R + r) round the loop, its terminals read
 *                  V = ε − I r, and the load takes P = I²R.
 *
 *  current.test.ts pins every claim the chapter's lessons make:
 *    - copper at 1 A in house wiring drifts at about 0.02 mm/s;
 *    - an electron takes hours to cross a 2 m lamp cord, the switch-on push
 *      nanoseconds;
 *    - a 1 mm² copper wire needs about 14 A for its electrons to keep pace
 *      with a 1 mm/s snail;
 *    - R = ρL/A: double the length, double R; double the diameter, a quarter;
 *      draw a wire out to twice its length, four times;
 *    - the terminal voltage sags on a straight line in I, reaching zero at
 *      the short-circuit current ε/r;
 *    - the load takes the most power when R = r, and then only half of what
 *      the pump delivers;
 *    - P = I²R = VI = V²/R, and the pump's εI is exactly the load's plus the
 *      cell's own heating.
 */

/** Elementary charge, C. */
export const E_CHARGE = 1.602176634e-19;

/** Signal speed along a lamp cord, m/s: roughly two-thirds of light speed. */
export const SIGNAL_SPEED = 2e8;

/** Speed of an electron's random motion in copper (the Fermi speed), m/s. */
export const FERMI_SPEED_COPPER = 1.57e6;

export interface Metal {
  name: string;
  /** Resistivity at 20 °C, Ω·m. */
  rho: number;
  /** Free-electron density, m⁻³ (only where the lessons use it). */
  n?: number;
}

export const METALS = {
  copper: { name: 'copper', rho: 1.68e-8, n: 8.49e28 },
  aluminium: { name: 'aluminium', rho: 2.65e-8, n: 1.81e29 },
  tungsten: { name: 'tungsten', rho: 5.6e-8 },
  nichrome: { name: 'nichrome', rho: 1.1e-6 },
} as const satisfies Record<string, Metal>;

/* ── a wire ─────────────────────────────────────────────────────────────── */

/** Cross-section of a round wire of diameter d, m². */
export const wireArea = (d: number) => (Math.PI * d * d) / 4;

/** Square millimetres to square metres. */
export const mm2 = (a: number) => a * 1e-6;

/** Drift speed, m/s, from I = n q A v_d. */
export function driftSpeed(I: number, A: number, n: number = METALS.copper.n, q = E_CHARGE): number {
  return I / (n * q * A);
}

/** The current that makes the carriers drift at v_d, A. */
export function currentForDrift(vd: number, A: number, n: number = METALS.copper.n, q = E_CHARGE): number {
  return n * q * A * vd;
}

/** Time for one electron to drift a distance L, s. */
export const driftTime = (L: number, vd: number) => L / vd;

/** Time for the switch-on push to travel a distance L, s. */
export const signalTime = (L: number) => L / SIGNAL_SPEED;

/** Resistance of a uniform wire, Ω: R = ρL/A. */
export function resistance(rho: number, L: number, A: number): number {
  return (rho * L) / A;
}

/** Length of wire of cross-section A that has resistance R, m. */
export function lengthFor(R: number, rho: number, A: number): number {
  return (R * A) / rho;
}

/** Resistance after drawing a wire out to `stretch` times its length at fixed volume. */
export function drawnOut(rho: number, L: number, A: number, stretch: number): number {
  return resistance(rho, L * stretch, A / stretch);
}

/* ── a real cell ────────────────────────────────────────────────────────── */

export interface Cell {
  /** Electromotive force: work the pump does per coulomb, V. */
  emf: number;
  /** Internal resistance, Ω. */
  r: number;
}

/** n identical resistors in parallel, Ω. n = 0 is an open circuit. */
export const parallel = (R: number, n: number) => (n > 0 ? R / n : Infinity);

/** Current round the loop with an external load R, A. */
export function loopCurrent(cell: Cell, R: number): number {
  return Number.isFinite(R) ? cell.emf / (R + cell.r) : 0;
}

/** Terminal voltage while the cell delivers current I, V. */
export function terminalVoltage(cell: Cell, I: number): number {
  return cell.emf - I * cell.r;
}

/** Current with the terminals joined by a wire of no resistance, A. */
export const shortCircuitCurrent = (cell: Cell) => cell.emf / cell.r;

/** Everything a loop of one cell and one load does, in one call. */
export function loadState(cell: Cell, R: number) {
  const I = loopCurrent(cell, R);
  const V = terminalVoltage(cell, I);
  return {
    I,
    /** Terminal voltage, which is also the voltage across the load. */
    V,
    /** Voltage lost inside the cell, I r. */
    lost: I * cell.r,
    /** Power the pump delivers, εI. */
    Ppump: cell.emf * I,
    /** Power into the load, I²R. */
    Pload: Number.isFinite(R) ? I * I * R : 0,
    /** Power heating the cell itself, I²r. */
    Pcell: I * I * cell.r,
    /** Fraction of the pump's power that reaches the load. */
    efficiency: Number.isFinite(R) ? R / (R + cell.r) : 1,
  };
}

/** Power into the load, W: P = ε²R / (R + r)². */
export const loadPower = (cell: Cell, R: number) => loadState(cell, R).Pload;

/** The load resistance that takes the most power, found by golden-section search. */
export function bestLoad(cell: Cell, lo = 1e-6, hi = 1e3): number {
  // Search in log R: the peak is broad and the range spans decades.
  let a = Math.log(lo), b = Math.log(hi);
  const g = (Math.sqrt(5) - 1) / 2;
  const f = (x: number) => loadPower(cell, Math.exp(x));
  let c = b - g * (b - a), d = a + g * (b - a);
  for (let i = 0; i < 200; i++) {
    if (f(c) > f(d)) b = d; else a = c;
    c = b - g * (b - a);
    d = a + g * (b - a);
  }
  return Math.exp((a + b) / 2);
}
