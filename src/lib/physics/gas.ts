/** A gas as particles (University Physics, ch. 18, "matter as particles").
 *
 *  Three pieces:
 *
 *    1. A hard-disc gas in a flat box. Every particle is a disc that moves
 *       in a straight line until it meets a wall or another disc. Walls
 *       reflect it (the normal velocity flips), and the wall's tally records
 *       the momentum it received, 2m|v⊥|, and one hit. Two discs that touch
 *       while closing trade momentum along the line joining their centres,
 *       exactly as in a 1D elastic collision (ch. 8), so every collision
 *       conserves momentum and kinetic energy to rounding. Nothing else
 *       happens: no forces at a distance, no friction. Pressure is only the
 *       wall's tally divided by time and length.
 *    2. The kinetic-theory relations the lessons name: the ideal gas law,
 *       temperature as mean kinetic energy, and the 2D Maxwell–Boltzmann
 *       speed distribution with its three characteristic speeds. The box on
 *       screen is flat, so the flat-box forms are used for anything a scene
 *       measures; the 3D forms are here for the room you sit in.
 *    3. The hard-disc equation of state (Henderson 1975), for where the
 *       ideal gas stops being true: the discs' own area crowds them.
 *
 *  Units are the molecular-dynamics set, chosen so every number is near 1:
 *  length nm, time ps, mass u (daltons), temperature K. A speed of 1 nm/ps
 *  is 1000 m/s, and Boltzmann's constant is 0.0083145 u·nm²/(ps²·K), which
 *  is R in kJ/(mol·K) — the same number, because u·nm²/ps² per particle is
 *  kJ/mol per mole.
 *
 *  Randomness (initial positions and directions) comes from a seeded
 *  generator, so every run and every test is reproducible.
 */

/* ── units and constants ───────────────────────────────────────────────── */

/** Boltzmann's constant in u·nm²/(ps²·K). */
export const KB = 0.00831446;
/** 1 nm/ps in m/s. */
export const MS_PER_NMPS = 1000;
/** 0 °C in kelvin. */
export const ZERO_C = 273.15;
/** Avogadro's number, for R = N_A k. */
export const AVOGADRO = 6.02214076e23;
/** Boltzmann's constant in J/K. */
export const KB_SI = 1.380649e-23;
/** One dalton in kg. */
export const DALTON = 1.66053907e-27;

/** Molar masses (u) of the gases the lessons use. */
export const MASS = { helium: 4.0026, nitrogen: 28.014, argon: 39.948 } as const;

/** The flat box is treated as a slab this deep (nm), so its pressure — force
 *  per length of wall — can be read in kPa as force per area. At this depth
 *  the chapter's standard box (300 molecules, 24 × 16 nm, 20 °C) holds air at
 *  about one atmosphere. It is a unit conversion and changes no physics. */
export const SLAB_DEPTH_NM = 33;
/** 1 u/(ps²·nm) in kPa. */
const KPA_PER_UNIT = (DALTON / (1e-24 * 1e-9)) / 1000;

export const kelvin = (celsius: number): number => celsius + ZERO_C;
export const celsius = (K: number): number => K - ZERO_C;

/** A 2D pressure (force per nm of wall, u/ps²) in kPa. */
export const toKPa = (p2d: number): number => (p2d / SLAB_DEPTH_NM) * KPA_PER_UNIT;

/* ── seeded randomness ─────────────────────────────────────────────────── */

/** mulberry32: a tiny, well-mixed 32-bit generator. Returns [0, 1). */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A standard normal deviate (Box–Muller). */
export function gaussian(rand: () => number): number {
  const u = 1 - rand(), v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/* ── the gas ───────────────────────────────────────────────────────────── */

/** Walls, in the order the tallies use. The right wall is the piston. */
export const WALL = { left: 0, right: 1, bottom: 2, top: 3 } as const;

export interface Gas {
  n: number;
  x: Float64Array; y: Float64Array;
  vx: Float64Array; vy: Float64Array;
  m: Float64Array; r: Float64Array;
  /** Which species each particle belongs to (index into the create spec). */
  kind: Uint8Array;
  /** The box is [0, w] × [0, h]. The right wall, x = w, is the piston. */
  w: number; h: number;
  t: number;
  /** Momentum delivered to each wall since the last `resetTally` (u·nm/ps). */
  impulse: Float64Array;
  /** Hits on each wall since the last `resetTally`. */
  hits: Float64Array;
  /** Time covered by the tallies (ps). */
  tallyTime: number;
  /** y of each hit on the piston since the consumer last emptied it. */
  pistonHitsY: number[];
  /** Particle–particle collisions so far. */
  collisions: number;
  // cell-list scratch
  head: Int32Array; next: Int32Array; cell: number;
}

export interface Species {
  count: number;
  /** u */
  mass: number;
  /** nm */
  radius: number;
  /** Start every particle at this speed (nm/ps) in a random direction. */
  speed?: number;
  /** Or start with random Gaussian velocity components at this temperature (K),
   *  rescaled so the species' mean kinetic energy is exactly kT. */
  T?: number;
}

export interface GasSpec {
  w: number;
  h: number;
  species: Species[];
  seed?: number;
}

export function createGas({ w, h, species, seed = 1 }: GasSpec): Gas {
  const rand = rng(seed);
  const n = species.reduce((s, sp) => s + sp.count, 0);
  const rMax = Math.max(...species.map((s) => s.radius));
  const g: Gas = {
    n, w, h, t: 0,
    x: new Float64Array(n), y: new Float64Array(n), vx: new Float64Array(n), vy: new Float64Array(n),
    m: new Float64Array(n), r: new Float64Array(n), kind: new Uint8Array(n),
    impulse: new Float64Array(4), hits: new Float64Array(4), tallyTime: 0, pistonHitsY: [], collisions: 0,
    // Cells at least as wide as a collision distance; not so small that
    // clearing the grid costs more than the particles do.
    head: new Int32Array(0), next: new Int32Array(n), cell: Math.max(2 * rMax * 1.05, 0.6),
  };

  // Positions: a shuffled lattice with a little jitter, so nothing overlaps.
  const cols = Math.ceil(Math.sqrt((n * w) / h)), rows = Math.ceil(n / cols);
  const slots = Array.from({ length: cols * rows }, (_, i) => i);
  for (let i = slots.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [slots[i], slots[j]] = [slots[j], slots[i]]; }
  const dx = (w - 2 * rMax) / cols, dy = (h - 2 * rMax) / rows;
  const jit = Math.max(0, Math.min(dx, dy) / 2 - rMax * 1.05);

  let i = 0;
  species.forEach((sp, k) => {
    const first = i;
    for (let c = 0; c < sp.count; c++, i++) {
      const s = slots[i];
      g.x[i] = rMax + ((s % cols) + 0.5) * dx + (rand() * 2 - 1) * jit;
      g.y[i] = rMax + (Math.floor(s / cols) + 0.5) * dy + (rand() * 2 - 1) * jit;
      g.m[i] = sp.mass; g.r[i] = sp.radius; g.kind[i] = k;
      if (sp.speed !== undefined) {
        const a = rand() * 2 * Math.PI;
        g.vx[i] = sp.speed * Math.cos(a); g.vy[i] = sp.speed * Math.sin(a);
      } else {
        const s0 = Math.sqrt((KB * (sp.T ?? 293.15)) / sp.mass);
        g.vx[i] = s0 * gaussian(rand); g.vy[i] = s0 * gaussian(rand);
      }
    }
    if (sp.speed === undefined && sp.count > 0) {
      // Rescale so the species starts at exactly its temperature.
      const T = sp.T ?? 293.15;
      let ke = 0;
      for (let j = first; j < i; j++) ke += 0.5 * g.m[j] * (g.vx[j] ** 2 + g.vy[j] ** 2);
      const f = Math.sqrt((sp.count * KB * T) / ke);
      for (let j = first; j < i; j++) { g.vx[j] *= f; g.vy[j] *= f; }
    }
  });
  return g;
}

/** Start a fresh tally of wall hits (for a pressure reading). */
export function resetTally(g: Gas): void {
  g.impulse.fill(0); g.hits.fill(0); g.tallyTime = 0;
}

/** Move the piston (the right wall) to x = w. Particles it passes are set
 *  just inside it with their velocities untouched: a slow squeeze in a box
 *  held at constant temperature, not a hammer blow. */
export function setPiston(g: Gas, w: number): void {
  g.w = w;
  for (let i = 0; i < g.n; i++) if (g.x[i] > w - g.r[i]) g.x[i] = w - g.r[i];
}

/** Two touching discs closing on each other: an elastic collision along the
 *  line of centres. Returns false if they are not closing (already parting). */
export function collidePair(g: Gas, i: number, j: number): boolean {
  const dx = g.x[j] - g.x[i], dy = g.y[j] - g.y[i];
  const d = Math.hypot(dx, dy);
  if (d === 0) return false;
  const nx = dx / d, ny = dy / d;
  // closing speed along the line of centres
  const u = (g.vx[i] - g.vx[j]) * nx + (g.vy[i] - g.vy[j]) * ny;
  if (u <= 0) return false;
  // impulse J = 2μu: momentum ±J along n, kinetic energy unchanged
  const J = (2 * g.m[i] * g.m[j] * u) / (g.m[i] + g.m[j]);
  g.vx[i] -= (J / g.m[i]) * nx; g.vy[i] -= (J / g.m[i]) * ny;
  g.vx[j] += (J / g.m[j]) * nx; g.vy[j] += (J / g.m[j]) * ny;
  g.collisions++;
  return true;
}

function wallHit(g: Gas, wall: number, i: number, vPerp: number): void {
  g.impulse[wall] += 2 * g.m[i] * Math.abs(vPerp);
  g.hits[wall] += 1;
  if (wall === WALL.right) g.pistonHitsY.push(g.y[i]);
}

/** Advance the gas by dt (ps): drift, bounce off walls, collide. */
export function stepGas(g: Gas, dt: number): void {
  const { n, x, y, vx, vy, r } = g;
  for (let i = 0; i < n; i++) {
    x[i] += vx[i] * dt;
    y[i] += vy[i] * dt;
    // Specular walls: mirror the position back inside and flip the velocity.
    if (x[i] < r[i] && vx[i] < 0) { wallHit(g, WALL.left, i, vx[i]); x[i] = 2 * r[i] - x[i]; vx[i] = -vx[i]; }
    else if (x[i] > g.w - r[i] && vx[i] > 0) { wallHit(g, WALL.right, i, vx[i]); x[i] = 2 * (g.w - r[i]) - x[i]; vx[i] = -vx[i]; }
    if (y[i] < r[i] && vy[i] < 0) { wallHit(g, WALL.bottom, i, vy[i]); y[i] = 2 * r[i] - y[i]; vy[i] = -vy[i]; }
    else if (y[i] > g.h - r[i] && vy[i] > 0) { wallHit(g, WALL.top, i, vy[i]); y[i] = 2 * (g.h - r[i]) - y[i]; vy[i] = -vy[i]; }
  }
  collideAll(g);
  g.t += dt;
  g.tallyTime += dt;
}

/** Find touching pairs with a cell list: each disc is compared only with
 *  discs in its own cell and the neighbouring ones. */
const NB_X = [1, -1, 0, 1], NB_Y = [0, 1, 1, 1]; // half the neighbourhood: each pair of cells once

function collideAll(g: Gas): void {
  const cs = g.cell;
  const nx = Math.max(1, Math.ceil(g.w / cs)), ny = Math.max(1, Math.ceil(g.h / cs));
  if (g.head.length < nx * ny) g.head = new Int32Array(nx * ny);
  const { head, next, x, y, r } = g;
  head.fill(-1, 0, nx * ny);
  for (let i = 0; i < g.n; i++) {
    const cx = Math.min(nx - 1, Math.max(0, Math.floor(x[i] / cs)));
    const cy = Math.min(ny - 1, Math.max(0, Math.floor(y[i] / cs)));
    const c = cy * nx + cx;
    next[i] = head[c]; head[c] = i;
  }
  for (let cy = 0; cy < ny; cy++) for (let cx = 0; cx < nx; cx++) {
    for (let i = head[cy * nx + cx]; i !== -1; i = next[i]) {
      const xi = x[i], yi = y[i], ri = r[i];
      // the rest of this cell
      for (let j = next[i]; j !== -1; j = next[j]) {
        const dx = x[j] - xi, dy = y[j] - yi, d = ri + r[j];
        if (dx * dx + dy * dy < d * d) collidePair(g, i, j);
      }
      // four of the eight neighbouring cells
      for (let k = 0; k < 4; k++) {
        const qx = cx + NB_X[k], qy = cy + NB_Y[k];
        if (qx < 0 || qx >= nx || qy >= ny) continue;
        for (let j = head[qy * nx + qx]; j !== -1; j = next[j]) {
          const dx = x[j] - xi, dy = y[j] - yi, d = ri + r[j];
          if (dx * dx + dy * dy < d * d) collidePair(g, i, j);
        }
      }
    }
  }
}

/** Run for a span of time in steps of dt. */
export function runGas(g: Gas, time: number, dt = 0.02): void {
  const steps = Math.round(time / dt);
  for (let s = 0; s < steps; s++) stepGas(g, dt);
}

/* ── what a scene measures ─────────────────────────────────────────────── */

const select = (g: Gas, kind?: number) => (i: number) => kind === undefined || g.kind[i] === kind;

export function kineticEnergy(g: Gas, kind?: number): number {
  const keep = select(g, kind);
  let ke = 0;
  for (let i = 0; i < g.n; i++) if (keep(i)) ke += 0.5 * g.m[i] * (g.vx[i] ** 2 + g.vy[i] ** 2);
  return ke;
}

export function count(g: Gas, kind?: number): number {
  const keep = select(g, kind);
  let c = 0;
  for (let i = 0; i < g.n; i++) if (keep(i)) c++;
  return c;
}

/** Mean kinetic energy per particle (u·nm²/ps²). */
export const meanKE = (g: Gas, kind?: number): number => kineticEnergy(g, kind) / count(g, kind);

/** Temperature of the flat gas: two directions of motion, ½kT each, so the
 *  mean kinetic energy per particle is kT. */
export const temperature = (g: Gas, kind?: number): number => meanKE(g, kind) / KB;

export function speeds(g: Gas, kind?: number): number[] {
  const keep = select(g, kind);
  const out: number[] = [];
  for (let i = 0; i < g.n; i++) if (keep(i)) out.push(Math.hypot(g.vx[i], g.vy[i]));
  return out;
}

export const meanSpeed = (g: Gas, kind?: number): number => {
  const s = speeds(g, kind);
  return s.reduce((a, b) => a + b, 0) / s.length;
};

/** Scale every velocity so the gas sits at temperature T. With `frac` < 1 it
 *  moves only that fraction of the way (in energy), which is a heater with a
 *  response time (a Berendsen thermostat). Scaling all speeds by one factor
 *  leaves the shape of the speed distribution alone. */
export function thermostat(g: Gas, T: number, frac = 1): void {
  const now = temperature(g);
  if (!(now > 0)) return;
  const f = Math.sqrt(1 + frac * (T / now - 1));
  for (let i = 0; i < g.n; i++) { g.vx[i] *= f; g.vy[i] *= f; }
}

/** Pressure on one wall over the tally so far: momentum delivered per time per
 *  length of wall (u/ps² — force per nm). */
export function wallPressure(g: Gas, wall: number): number {
  const len = wall === WALL.left || wall === WALL.right ? g.h : g.w;
  return g.impulse[wall] / (g.tallyTime * len);
}

/** Pressure averaged over all four walls, as a gauge would read it. */
export function boxPressure(g: Gas): number {
  const total = g.impulse[0] + g.impulse[1] + g.impulse[2] + g.impulse[3];
  return total / (g.tallyTime * 2 * (g.w + g.h));
}

/** Hits on the piston per ps, and the mean momentum each one delivered. */
export function pistonLedger(g: Gas): { rate: number; perHit: number } {
  const hits = g.hits[WALL.right];
  return { rate: hits / g.tallyTime, perHit: hits > 0 ? g.impulse[WALL.right] / hits : 0 };
}

/** Counts of speeds in bins [k·width, (k+1)·width). */
export function histogram(values: number[], width: number, bins: number): number[] {
  const out = new Array(bins).fill(0);
  for (const v of values) { const k = Math.floor(v / width); if (k >= 0 && k < bins) out[k]++; }
  return out;
}

/* ── the ideal gas ─────────────────────────────────────────────────────── */

/** The flat box's ideal gas law, PA = NkT, as a force per nm of wall. */
export const idealPressure2D = (N: number, T: number, area: number): number => (N * KB * T) / area;

/** The room's ideal gas law, PV = NkT, in SI: pascals. */
export const idealPressure3D = (N: number, T: number, volumeM3: number): number => (N * KB_SI * T) / volumeM3;

/** R = N_A k, in J/(mol·K). */
export const gasConstant = (): number => AVOGADRO * KB_SI;

/** Heating a sealed rigid box: P₂/P₁ = T₂/T₁, in kelvin. */
export const heatingPressureRatio = (fromC: number, toC: number): number => kelvin(toC) / kelvin(fromC);

/** The Celsius temperature that multiplies a sealed box's pressure by `ratio`. */
export const celsiusForPressureRatio = (fromC: number, ratio: number): number => celsius(kelvin(fromC) * ratio);

/** Boyle, at fixed temperature: V₂/V₁ = P₁/P₂. */
export const boyleVolumeFraction = (pressureRatio: number): number => 1 / pressureRatio;

/** Hard discs, beyond the ideal limit (Henderson): PA/NkT as a function of the
 *  area fraction η the discs cover. At η → 0 it is 1, the ideal gas. */
export const hardDiscZ = (eta: number): number => (1 + (eta * eta) / 8) / (1 - eta) ** 2;

/** Area fraction covered by N discs of radius r in area A. */
export const areaFraction = (N: number, r: number, area: number): number => (N * Math.PI * r * r) / area;

/* ── temperature as motion ─────────────────────────────────────────────── */

/** The temperature a flat gas settles at if every particle starts at speed v:
 *  its mean kinetic energy, ½mv², is kT. */
export const temperatureOfSpeed = (m: number, v: number): number => (0.5 * m * v * v) / KB;

/** The start speed a heavy particle needs to carry the same kinetic energy as
 *  a light one at `vLight`: ½m_L v_L² = ½m_H v_H². */
export const equalKESpeed = (vLight: number, mLight: number, mHeavy: number): number => vLight * Math.sqrt(mLight / mHeavy);

/** 2D Maxwell–Boltzmann speed density: f(v) = (mv/kT)·exp(−mv²/2kT). */
export const mbDensity2D = (v: number, m: number, T: number): number => {
  const a = m / (KB * T);
  return a * v * Math.exp(-0.5 * a * v * v);
};

/** Fraction of particles slower than v in the 2D Maxwell–Boltzmann gas. */
export const mbCdf2D = (v: number, m: number, T: number): number => 1 - Math.exp(-(m * v * v) / (2 * KB * T));

/** The peak of the 2D distribution. */
export const mostProbableSpeed2D = (m: number, T: number): number => Math.sqrt((KB * T) / m);
export const meanSpeed2D = (m: number, T: number): number => Math.sqrt((Math.PI * KB * T) / (2 * m));
export const rmsSpeed2D = (m: number, T: number): number => Math.sqrt((2 * KB * T) / m);

/** In three dimensions there are three directions of motion: ⟨½mv²⟩ = (3/2)kT. */
export const rmsSpeed3D = (m: number, T: number): number => Math.sqrt((3 * KB * T) / m);

/** Largest gap between a sample's empirical CDF and a model CDF (the
 *  Kolmogorov–Smirnov statistic). */
export function ksDistance(values: number[], cdf: (v: number) => number): number {
  const s = [...values].sort((a, b) => a - b);
  let d = 0;
  s.forEach((v, i) => {
    const F = cdf(v);
    d = Math.max(d, Math.abs((i + 1) / s.length - F), Math.abs(i / s.length - F));
  });
  return d;
}

/* ── the chapter's standard boxes ──────────────────────────────────────── */

/** Lesson 1: air (nitrogen) at 20 °C. */
export const AIR_BOX = { w: 24, h: 16, count: 300, radius: 0.1, mass: MASS.nitrogen, T: kelvin(20) } as const;

/** Lesson 2: every nitrogen molecule starts at 400 m/s. */
export const SPREAD_BOX = { w: 24, h: 16, count: 300, radius: 0.1, mass: MASS.nitrogen, speed: 0.4 } as const;

/** Lesson 2: helium and argon mixed, every atom starting at 400 m/s. */
export const MIX_BOX = {
  w: 24, h: 16, radius: 0.1,
  light: { count: 150, mass: MASS.helium, speed: 0.4 },
  heavy: { count: 150, mass: MASS.argon, speed: 0.4 },
} as const;
