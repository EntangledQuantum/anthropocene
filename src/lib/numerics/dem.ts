/* ─────────────────────────────────────────────────────────────────────────
   Soft-sphere DEM. 2D discs, linear spring–dashpot + Coulomb + rolling
   resistance. Cundall & Strack 1979; Silbert et al. 2001.

   The constitutive law of the bulk is not written. Force is zero until
   overlap, then F_n = k_n δ − γ_n v_n. A pile's slope is that law, counted
   out over a contact network. Overlap is a penalty for rigidity: k → ∞
   recovers the hard constraint and kills the explicit step.
   ───────────────────────────────────────────────────────────────────────── */

export interface Wall {
  /** Segment endpoints. `nx, ny` is the unit inward normal (into free space),
   *  so a particle that tunnels is still pushed back, not further out. */
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  nx: number;
  ny: number;
}

/** One-sided wall. `(cx, cy)` is a point known to lie in the interior. */
export function makeWall(x0: number, y0: number, x1: number, y1: number, cx: number, cy: number): Wall {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = Math.hypot(dx, dy) || 1;
  let nx = -dy / len;
  let ny = dx / len;
  const mx = 0.5 * (x0 + x1);
  const my = 0.5 * (y0 + y1);
  if (nx * (cx - mx) + ny * (cy - my) < 0) {
    nx = -nx;
    ny = -ny;
  }
  return { x0, y0, x1, y1, nx, ny };
}

export interface Dem {
  n: number;
  x: Float64Array;
  y: Float64Array;
  vx: Float64Array;
  vy: Float64Array;
  ax: Float64Array;
  ay: Float64Array;
  theta: Float64Array;
  omega: Float64Array;
  alpha: Float64Array;
  r: Float64Array;
  m: Float64Array;
  I: Float64Array;
  kn: number;
  gn: number;
  kt: number;
  gt: number;
  mu: number;
  /** Rolling-resistance coefficient. 0 = perfect discs, they roll away. */
  muR: number;
  g: number;
  dt: number;
  t: number;
  steps: number;
  walls: Wall[];
  width: number;
  height: number;
  /** Tangential and rolling springs, keyed by contact id. */
  hist: Map<number, { xi: number; roll: number }>;
}

export interface DemOpts {
  kn?: number;
  gn?: number;
  /** Coefficient of restitution; used to set γ_n when gn is omitted. */
  e?: number;
  kt?: number;
  gt?: number;
  mu?: number;
  muR?: number;
  g?: number;
  dt?: number;
}

const PAIR_STRIDE = 10_000;

export function reducedMass(m1: number, m2: number): number {
  if (!Number.isFinite(m1) || !Number.isFinite(m2) || m1 <= 0 || m2 <= 0) return 0;
  return (m1 * m2) / (m1 + m2);
}

/** ζ = γ / (2 √(k m*)). Underdamped for ζ < 1. */
export function dampingRatio(gn: number, kn: number, mStar: number): number {
  if (kn <= 0 || mStar <= 0) return Infinity;
  return gn / (2 * Math.sqrt(kn * mStar));
}

/** Linear spring–dashpot restitution, contact held while δ > 0. */
export function restitutionOf(zeta: number): number {
  if (zeta <= 0) return 1;
  if (zeta >= 1) return 0;
  return Math.exp((-zeta * Math.PI) / Math.sqrt(1 - zeta * zeta));
}

export function dampingRatioForRestitution(e: number): number {
  if (e <= 0) return 1;
  if (e >= 1) return 0;
  const k = -Math.log(e) / Math.PI;
  return k / Math.sqrt(1 + k * k);
}

export function dashpotForRestitution(e: number, kn: number, mStar: number): number {
  const z = dampingRatioForRestitution(e);
  return 2 * z * Math.sqrt(kn * mStar);
}

/** Contact duration — half period of the underdamped overlap oscillator. */
export function contactDuration(kn: number, mStar: number, gn = 0): number {
  if (kn <= 0 || mStar <= 0) return Infinity;
  const w2 = kn / mStar - (gn / (2 * mStar)) ** 2;
  if (w2 <= 0) return Infinity;
  return Math.PI / Math.sqrt(w2);
}

export function suggestedDt(kn: number, mStar: number, gn = 0): number {
  const tc = contactDuration(kn, mStar, gn);
  return Number.isFinite(tc) ? 0.07 * tc : 1e-4;
}

/** Static (v_n = 0) normal law. The hockey-stick constitutive curve. */
export function staticNormalForce(delta: number, kn: number): number {
  return delta > 0 ? kn * delta : 0;
}

export function normalForce(delta: number, vn: number, kn: number, gn: number): number {
  if (delta <= 0) return 0;
  return kn * delta - gn * vn;
}

function inertia(m: number, r: number): number {
  return 0.5 * m * r * r;
}

function pairKey(i: number, j: number): number {
  return i * PAIR_STRIDE + j;
}

function wallKey(i: number, w: number): number {
  return -1 - (i * PAIR_STRIDE + w);
}

function alloc(n: number, opts: Required<Pick<DemOpts, 'kn' | 'gn' | 'kt' | 'gt' | 'mu' | 'muR' | 'g' | 'dt'>>, width: number, height: number, walls: Wall[]): Dem {
  return {
    n,
    x: new Float64Array(n),
    y: new Float64Array(n),
    vx: new Float64Array(n),
    vy: new Float64Array(n),
    ax: new Float64Array(n),
    ay: new Float64Array(n),
    theta: new Float64Array(n),
    omega: new Float64Array(n),
    alpha: new Float64Array(n),
    r: new Float64Array(n),
    m: new Float64Array(n),
    I: new Float64Array(n),
    kn: opts.kn,
    gn: opts.gn,
    kt: opts.kt,
    gt: opts.gt,
    mu: opts.mu,
    muR: opts.muR,
    g: opts.g,
    dt: opts.dt,
    t: 0,
    steps: 0,
    walls,
    width,
    height,
    hist: new Map(),
  };
}

function material(kn: number, extra: DemOpts): Required<Pick<DemOpts, 'kn' | 'gn' | 'kt' | 'gt' | 'mu' | 'muR' | 'g' | 'dt'>> {
  const e = extra.e ?? 0.5;
  const mStar = 0.5;
  const gn = extra.gn ?? dashpotForRestitution(e, kn, mStar);
  const kt = extra.kt ?? (2 / 7) * kn;
  const gt = extra.gt ?? 0.5 * gn;
  const dt = extra.dt ?? suggestedDt(kn, mStar, gn);
  return {
    kn,
    gn,
    kt,
    gt,
    mu: extra.mu ?? 0.5,
    muR: extra.muR ?? 0.2,
    g: extra.g ?? 10,
    dt,
  };
}

function hashedUnit(i: number, seed = 1): number {
  const u = ((i * 1103515245 + 12345 * seed) >>> 0) / 4294967296;
  return u;
}

function setDisc(s: Dem, i: number, x: number, y: number, r: number, m: number): void {
  s.x[i] = x;
  s.y[i] = y;
  s.r[i] = r;
  s.m[i] = m;
  s.I[i] = inertia(m, r);
}

/** Apply one contact: n points from body B toward body A (the particle). */
function applyContact(
  s: Dem,
  i: number,
  j: number | null,
  nx: number,
  ny: number,
  delta: number,
  key: number,
  live: Set<number>,
): void {
  if (delta <= 0) return;
  const tx = -ny;
  const ty = nx;
  const ri = s.r[i]!;
  const mi = s.m[i]!;
  const vix = s.vx[i]!;
  const viy = s.vy[i]!;
  const wi = s.omega[i]!;

  let vjx = 0, vjy = 0, wj = 0, rj = 0, mj = Infinity;
  if (j !== null) {
    vjx = s.vx[j]!;
    vjy = s.vy[j]!;
    wj = s.omega[j]!;
    rj = s.r[j]!;
    mj = s.m[j]!;
  }

  const vn = (vix - vjx) * nx + (viy - vjy) * ny;
  // Contact-point relative velocity. Rotation of i about −n (toward the
  // other body) contributes −Rω t, so the signs on ω are minus.
  const vt = (vix - vjx) * tx + (viy - vjy) * ty - ri * wi - rj * wj;

  const Fn = s.kn * delta - s.gn * vn;

  let h = s.hist.get(key);
  if (!h) {
    h = { xi: 0, roll: 0 };
    s.hist.set(key, h);
  }
  live.add(key);

  let Ft = 0;
  let tauR = 0;
  if (Fn > 0) {
    h.xi += vt * s.dt;
    Ft = -(s.kt * h.xi + s.gt * vt);
    const FtMax = s.mu * Fn;
    if (Math.abs(Ft) > FtMax) {
      Ft = FtMax * Math.sign(Ft);
      if (s.kt > 0) h.xi = -(Ft + s.gt * vt) / s.kt;
    }

    const Rmean = j === null ? ri : 0.5 * (ri + rj);
    const kRoll = s.kt * Rmean * Rmean;
    const gRoll = s.gt * Rmean * Rmean;
    const vRoll = wi - (j === null ? 0 : wj);
    h.roll += vRoll * s.dt;
    tauR = -(kRoll * h.roll + gRoll * vRoll);
    const tauMax = s.muR * Rmean * Fn;
    if (Math.abs(tauR) > tauMax) {
      tauR = tauMax * Math.sign(tauR);
      if (kRoll > 0) h.roll = -(tauR + gRoll * vRoll) / kRoll;
    }
  } else {
    h.xi = 0;
    h.roll = 0;
  }

  const Fx = Fn * nx + Ft * tx;
  const Fy = Fn * ny + Ft * ty;
  s.ax[i] += Fx / mi;
  s.ay[i] += Fy / mi;
  s.alpha[i] += (-ri * Ft + tauR) / s.I[i]!;
  if (j !== null) {
    s.ax[j] -= Fx / mj;
    s.ay[j] -= Fy / mj;
    s.alpha[j] += (-rj * Ft - tauR) / s.I[j]!;
  }
}

export function accumulate(s: Dem): void {
  const { n, g } = s;
  s.ax.fill(0);
  s.ay.fill(0);
  s.alpha.fill(0);
  for (let i = 0; i < n; i++) s.ay[i] = -g;

  const live = new Set<number>();

  for (let i = 0; i < n; i++) {
    const ri = s.r[i]!;
    const xi = s.x[i]!;
    const yi = s.y[i]!;
    for (let j = i + 1; j < n; j++) {
      const dx = xi - s.x[j]!;
      const dy = yi - s.y[j]!;
      const dist = Math.hypot(dx, dy);
      const delta = ri + s.r[j]! - dist;
      if (delta <= 0 || dist < 1e-14) continue;
      applyContact(s, i, j, dx / dist, dy / dist, delta, pairKey(i, j), live);
    }
    for (let w = 0; w < s.walls.length; w++) {
      const wall = s.walls[w]!;
      const dx = wall.x1 - wall.x0;
      const dy = wall.y1 - wall.y0;
      const L2 = dx * dx + dy * dy;
      if (L2 < 1e-18) continue;
      let u = ((xi - wall.x0) * dx + (yi - wall.y0) * dy) / L2;
      if (u < -0.02 || u > 1.02) continue;
      const signed = wall.nx * (xi - wall.x0) + wall.ny * (yi - wall.y0);
      const delta = ri - signed;
      if (delta <= 0) continue;
      applyContact(s, i, null, wall.nx, wall.ny, delta, wallKey(i, w), live);
    }
  }

  if (s.hist.size !== live.size) {
    for (const k of s.hist.keys()) if (!live.has(k)) s.hist.delete(k);
  }
}

/** Symplectic Euler. Force from current (x, v); then kick, then drift. */
export function step(s: Dem): void {
  accumulate(s);
  const dt = s.dt;
  for (let i = 0; i < s.n; i++) {
    s.vx[i] += s.ax[i]! * dt;
    s.vy[i] += s.ay[i]! * dt;
    s.omega[i] += s.alpha[i]! * dt;
    s.x[i] += s.vx[i]! * dt;
    s.y[i] += s.vy[i]! * dt;
    s.theta[i] += s.omega[i]! * dt;
  }
  s.t += dt;
  s.steps++;
}

export function run(s: Dem, nSteps: number): void {
  for (let k = 0; k < nSteps; k++) step(s);
}

export function kineticEnergy(s: Dem): number {
  let k = 0;
  for (let i = 0; i < s.n; i++) {
    k += 0.5 * s.m[i]! * (s.vx[i]! * s.vx[i]! + s.vy[i]! * s.vy[i]!);
    k += 0.5 * s.I[i]! * s.omega[i]! * s.omega[i]!;
  }
  return k;
}

export function maxOverlap(s: Dem): number {
  let m = 0;
  for (let i = 0; i < s.n; i++) {
    const ri = s.r[i]!;
    const xi = s.x[i]!;
    const yi = s.y[i]!;
    for (let j = i + 1; j < s.n; j++) {
      const d = ri + s.r[j]! - Math.hypot(xi - s.x[j]!, yi - s.y[j]!);
      if (d > m) m = d;
    }
    for (const wall of s.walls) {
      const dx = wall.x1 - wall.x0;
      const dy = wall.y1 - wall.y0;
      const L2 = dx * dx + dy * dy;
      if (L2 < 1e-18) continue;
      const u = ((xi - wall.x0) * dx + (yi - wall.y0) * dy) / L2;
      if (u < -0.02 || u > 1.02) continue;
      const signed = wall.nx * (xi - wall.x0) + wall.ny * (yi - wall.y0);
      const d = ri - signed;
      if (d > m) m = d;
    }
  }
  return m;
}

export function meanRadius(s: Dem): number {
  if (s.n === 0) return 0;
  let a = 0;
  for (let i = 0; i < s.n; i++) a += s.r[i]!;
  return a / s.n;
}

export function contactCount(s: Dem): number {
  accumulate(s);
  return s.hist.size;
}

/** Bounding-box slope, degrees: atan(height / half-width) of the occupied region. */
export function pileTriangleDegrees(s: Dem): number {
  if (s.n === 0) return 0;
  let xmin = Infinity, xmax = -Infinity, ymax = -Infinity;
  for (let i = 0; i < s.n; i++) {
    const r = s.r[i]!;
    const x = s.x[i]!;
    const y = s.y[i]!;
    if (x - r < xmin) xmin = x - r;
    if (x + r > xmax) xmax = x + r;
    if (y + r > ymax) ymax = y + r;
  }
  const half = 0.5 * Math.max(xmax - xmin, 1e-9);
  return (Math.atan2(Math.max(ymax, 0), half) * 180) / Math.PI;
}

/**
 * Angle of repose from the free surface. Bin in x, take the roof, average
 * the |slope| of the two flanks. Falls back to the bounding-box triangle.
 */
export function angleOfRepose(s: Dem): number {
  if (s.n < 4) return pileTriangleDegrees(s);
  const nBin = 8;
  const rMean = meanRadius(s);
  let xmin = Infinity, xmax = -Infinity;
  for (let i = 0; i < s.n; i++) {
    if (s.x[i]! < xmin) xmin = s.x[i]!;
    if (s.x[i]! > xmax) xmax = s.x[i]!;
  }
  const span = Math.max(xmax - xmin, 4 * rMean);
  const roof = new Float64Array(nBin);
  roof.fill(-Infinity);
  const count = new Int32Array(nBin);
  for (let i = 0; i < s.n; i++) {
    let b = Math.floor(((s.x[i]! - xmin) / span) * nBin);
    if (b < 0) b = 0;
    if (b >= nBin) b = nBin - 1;
    const top = s.y[i]! + s.r[i]!;
    if (top > roof[b]!) roof[b] = top;
    count[b]++;
  }
  const xs: number[] = [];
  const ys: number[] = [];
  for (let b = 0; b < nBin; b++) {
    if (count[b]! < 1 || !Number.isFinite(roof[b]!)) continue;
    xs.push(xmin + ((b + 0.5) / nBin) * span);
    ys.push(roof[b]!);
  }
  if (xs.length < 4) return pileTriangleDegrees(s);
  let peak = 0;
  for (let i = 1; i < ys.length; i++) if (ys[i]! > ys[peak]!) peak = i;
  const flank = (a: number, b: number): number => {
    if (b - a < 1) return NaN;
    const x0 = xs[a]!, y0 = ys[a]!, x1 = xs[b]!, y1 = ys[b]!;
    const dx = x1 - x0;
    if (Math.abs(dx) < 1e-9) return NaN;
    return Math.abs(Math.atan2(y1 - y0, dx)) * (180 / Math.PI);
  };
  const left = flank(0, peak);
  const right = flank(peak, xs.length - 1);
  const angles = [left, right].filter((v) => Number.isFinite(v) && v > 4 && v < 80);
  if (angles.length === 0) return pileTriangleDegrees(s);
  return angles.reduce((a, b) => a + b, 0) / angles.length;
}

export function settle(s: Dem, keThresh: number, maxSteps: number): void {
  for (let k = 0; k < maxSteps; k++) {
    step(s);
    if (k > 80 && k % 20 === 0 && kineticEnergy(s) < keThresh) return;
  }
}

/* ── factories ─────────────────────────────────────────────────────────── */

export const BOUNCE_KN = 8_000;
export const BOUNCE_M = 1;
export const BOUNCE_R = 0.05;
export const BOUNCE_V0 = 1;

/** Two equal discs, head-on, no gravity, no walls. */
export function createBounce(zeta: number, extra: DemOpts = {}): Dem {
  const kn = extra.kn ?? BOUNCE_KN;
  const mStar = reducedMass(BOUNCE_M, BOUNCE_M);
  const gn = extra.gn ?? 2 * zeta * Math.sqrt(kn * mStar);
  const mat = material(kn, { ...extra, gn, g: 0, mu: 0, muR: 0, e: restitutionOf(Math.min(zeta, 0.99)) });
  mat.gn = gn;
  mat.g = 0;
  mat.mu = 0;
  mat.muR = 0;
  mat.dt = extra.dt ?? suggestedDt(kn, mStar, gn);
  const s = alloc(2, mat, 1, 0.4, []);
  const gap = 0.15 * BOUNCE_R;
  setDisc(s, 0, 0, 0.2, BOUNCE_R, BOUNCE_M);
  setDisc(s, 1, 2 * BOUNCE_R + gap, 0.2, BOUNCE_R, BOUNCE_M);
  s.vx[0] = BOUNCE_V0;
  return s;
}

/**
 * Integrate a head-on bounce until the discs separate, return |v_rel_out|/|v_rel_in|.
 * Incoming relative speed is sampled at first overlap; outgoing at first gap after.
 */
export function measuredRestitution(zeta: number): number {
  const s = createBounce(zeta);
  const maxSteps = 8_000;
  let vin = 0;
  let seen = false;
  for (let k = 0; k < maxSteps; k++) {
    const dist = Math.hypot(s.x[1]! - s.x[0]!, s.y[1]! - s.y[0]!);
    const delta = 2 * BOUNCE_R - dist;
    const vrel = s.vx[1]! - s.vx[0]!;
    if (!seen && delta > 0) {
      vin = Math.abs(vrel);
      seen = true;
    } else if (seen && delta <= 0) {
      const vout = Math.abs(vrel);
      return vin > 1e-12 ? vout / vin : 0;
    }
    step(s);
  }
  return 0;
}

export const REST_MASS = 1;
export const REST_G = 10;
export const REST_KN = 50_000;
export const REST_R = 0.05;

function floorWalls(width: number): Wall[] {
  return [makeWall(-0.2, 0, width + 0.2, 0, width / 2, 1)];
}

/** One disc sitting on a floor. Rest overlap is mg / k_n. */
export function createFloorRest(kn = REST_KN, extra: DemOpts = {}): Dem {
  const mat = material(kn, { ...extra, g: extra.g ?? REST_G, mu: extra.mu ?? 0, muR: extra.muR ?? 0, e: 0.2 });
  mat.dt = extra.dt ?? suggestedDt(kn, REST_MASS, mat.gn);
  const s = alloc(1, mat, 0.4, 0.4, floorWalls(0.4));
  setDisc(s, 0, 0.2, REST_R + 0.004, REST_R, REST_MASS);
  return s;
}

/** Two discs stacked on a floor. The k → ∞ claim lives here. */
export function createStack(kn: number, extra: DemOpts = {}): Dem {
  const mat = material(kn, { ...extra, g: extra.g ?? REST_G, mu: extra.mu ?? 0, muR: extra.muR ?? 0, e: 0.15 });
  const mStar = reducedMass(REST_MASS, REST_MASS);
  mat.dt = extra.dt ?? suggestedDt(kn, mStar, mat.gn);
  const s = alloc(2, mat, 0.4, 0.5, floorWalls(0.4));
  const r = REST_R;
  setDisc(s, 0, 0.2, r + 0.003, r, REST_MASS);
  setDisc(s, 1, 0.2, 3 * r + 0.006, r, REST_MASS);
  return s;
}

let cachedRestRatio: number | null = null;

export function restOverlapRatio(): number {
  if (cachedRestRatio !== null) return cachedRestRatio;
  const s = createFloorRest();
  settle(s, 1e-10, 6_000);
  cachedRestRatio = Math.max(0, REST_R - s.y[0]!) / REST_R;
  return cachedRestRatio;
}

export function analyticRestOverlapRatio(): number {
  return (REST_MASS * REST_G) / (REST_KN * REST_R);
}

const PILE_R = 0.042;
const PILE_W = 1.55;
const PILE_H = 1.05;

function boxWalls(w: number, h: number): Wall[] {
  const cx = 0.5 * w, cy = 0.5 * h;
  return [
    makeWall(-0.15, 0, w + 0.15, 0, cx, cy),
    makeWall(0, 0, 0, h, cx, cy),
    makeWall(w, 0, w, h, cx, cy),
  ];
}

export interface PileOpts extends DemOpts {
  cols?: number;
  rows?: number;
  poly?: number;
  kn?: number;
}

export function createPile(extra: PileOpts = {}): Dem {
  const cols = extra.cols ?? 5;
  const rows = extra.rows ?? 6;
  const n = cols * rows;
  const kn = extra.kn ?? 2_500;
  const mat = material(kn, { e: extra.e ?? 0.35, mu: extra.mu ?? 0.55, muR: extra.muR ?? 0.25, g: extra.g ?? 9, ...extra, kn });
  const s = alloc(n, mat, PILE_W, PILE_H, boxWalls(PILE_W, PILE_H));
  const poly = extra.poly ?? 0.12;
  const spacing = 2.18 * PILE_R;
  const x0 = 0.5 * PILE_W - 0.5 * (cols - 1) * spacing;
  const y0 = PILE_R * 1.08;
  let i = 0;
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const u = hashedUnit(i, 17);
      const r = PILE_R * (1 + poly * (2 * u - 1));
      const jitter = 0.15 * PILE_R * (hashedUnit(i, 91) - 0.5);
      const m = (r / PILE_R) * (r / PILE_R);
      setDisc(s, i, x0 + col * spacing + jitter, y0 + row * spacing, r, m);
      i++;
    }
  }
  return s;
}

const HOP_W = 1.5;
const HOP_H = 1.25;

function hopperWalls(orifice = 0.28): Wall[] {
  const mid = 0.5 * HOP_W;
  const half = 0.5 * orifice;
  const throatY = 0.34;
  const topY = 1.18;
  const inset = 0.1;
  const cx = mid, cy = 0.7;
  return [
    makeWall(inset, topY, mid - half, throatY, cx, cy),
    makeWall(HOP_W - inset, topY, mid + half, throatY, cx, cy),
    makeWall(-0.15, 0, HOP_W + 0.15, 0, cx, cy),
    makeWall(0, 0, 0, HOP_H, cx, cy),
    makeWall(HOP_W, 0, HOP_W, HOP_H, cx, cy),
  ];
}

export interface HopperOpts extends DemOpts {
  nFill?: number;
  orifice?: number;
  kn?: number;
}

export function createHopper(extra: HopperOpts = {}): Dem {
  const cols = 6;
  const rows = extra.nFill ? Math.ceil(extra.nFill / cols) : 5;
  const n = extra.nFill ?? cols * rows;
  const kn = extra.kn ?? 2_200;
  const orifice = extra.orifice ?? 0.28;
  const mat = material(kn, { e: extra.e ?? 0.4, mu: extra.mu ?? 0.45, muR: extra.muR ?? 0.18, g: extra.g ?? 9, ...extra, kn });
  const s = alloc(n, mat, HOP_W, HOP_H, hopperWalls(orifice));
  const r0 = 0.038;
  const spacing = 2.15 * r0;
  const x0 = 0.5 * HOP_W - 0.5 * (cols - 1) * spacing;
  const y0 = 0.48;
  for (let i = 0; i < n; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const u = hashedUnit(i, 3);
    const r = r0 * (1 + 0.1 * (2 * u - 1));
    const m = (r / r0) * (r / r0);
    setDisc(s, i, x0 + col * spacing, y0 + row * spacing, r, m);
  }
  return s;
}

/** Two discs on a line. Positive overlap means they interpenetrate. */
export function createContact(overlap: number, kn = 1_200): Dem {
  const r = 0.12;
  const mat = material(kn, { g: 0, mu: 0, muR: 0, e: 1, gn: 0 });
  mat.g = 0;
  mat.gn = 0;
  mat.gt = 0;
  const s = alloc(2, mat, 0.8, 0.5, []);
  const sep = 2 * r - overlap;
  setDisc(s, 0, 0.4 - 0.5 * sep, 0.25, r, 1);
  setDisc(s, 1, 0.4 + 0.5 * sep, 0.25, r, 1);
  accumulate(s);
  return s;
}

export function pairOverlap(s: Dem, i = 0, j = 1): number {
  return s.r[i]! + s.r[j]! - Math.hypot(s.x[j]! - s.x[i]!, s.y[j]! - s.y[i]!);
}

export function pairNormalForce(s: Dem, i = 0, j = 1): number {
  const delta = pairOverlap(s, i, j);
  const dist = Math.hypot(s.x[j]! - s.x[i]!, s.y[j]! - s.y[i]!);
  if (dist < 1e-14) return 0;
  const nx = (s.x[i]! - s.x[j]!) / dist;
  const ny = (s.y[i]! - s.y[j]!) / dist;
  const vn = (s.vx[i]! - s.vx[j]!) * nx + (s.vy[i]! - s.vy[j]!) * ny;
  return normalForce(delta, vn, s.kn, s.gn);
}

export function aboveOrifice(s: Dem, yCut = 0.34): number {
  let n = 0;
  for (let i = 0; i < s.n; i++) if (s.y[i]! > yCut) n++;
  return n;
}

export const SKETCH_KN = 800;
export const TUNE_E = 0.5;
export const TUNE_ZETA = dampingRatioForRestitution(TUNE_E);
