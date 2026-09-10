/* ─────────────────────────────────────────────────────────────────────────
   Smoothed particle hydrodynamics.

   Density is a kernel sum. There is no mesh. The force is pairwise from ∇W,
   so linear momentum is conserved. The cubic spline that estimates density
   also makes tension a negative modulus — particles clump.

   Weakly compressible linear EOS, P = c₀² (ρ − ρ₀), so pressure can go
   negative. 1D is the hand-computable case (completeness, hydrostatic,
   tensile). 2D is a small dam-break so the missing mesh is visible.

   Cubic spline: Monaghan & Lattanzio 1985. Support 2h.
   ───────────────────────────────────────────────────────────────────────── */

/** 1D cubic-spline shape w(q). W(r,h) = w(|r|/h) / h. ∫ W dr = 1. */
export function cubicShape(q: number): number {
  const aq = Math.abs(q);
  if (aq >= 2) return 0;
  if (aq < 1) return 2 / 3 - aq * aq + 0.5 * aq * aq * aq;
  const u = 2 - aq;
  return (1 / 6) * u * u * u;
}

/** dw/dq for q ≥ 0. */
export function cubicShapePrime(q: number): number {
  if (q <= 0 || q >= 2) return 0;
  if (q < 1) return -2 * q + 1.5 * q * q;
  const u = 2 - q;
  return -0.5 * u * u;
}

export function cubicW1d(r: number, h: number): number {
  if (h <= 0) return 0;
  return cubicShape(Math.abs(r) / h) / h;
}

/** dW/dx with x = x_i − x_j signed. Odd: ∇W(−x) = −∇W(x). */
export function cubicGradW1d(x: number, h: number): number {
  if (x === 0 || h <= 0) return 0;
  const r = Math.abs(x);
  if (r >= 2 * h) return 0;
  return (cubicShapePrime(r / h) / (h * h)) * Math.sign(x);
}

/** 2D cubic-spline normalisation: W = (α₂ / h²) σ(q), σ = (3/2) w. */
export const ALPHA2 = 10 / (7 * Math.PI);

export function cubicW2d(r: number, h: number): number {
  if (h <= 0) return 0;
  const q = r / h;
  if (q >= 2) return 0;
  const a = ALPHA2 / (h * h);
  if (q < 1) return a * (1 - 1.5 * q * q + 0.75 * q * q * q);
  const u = 2 - q;
  return a * 0.25 * u * u * u;
}

/** ∇_i W(|x_i − x_j|). Points from i toward j (kernel falls with r). */
export function cubicGradW2d(dx: number, dy: number, h: number): { gx: number; gy: number } {
  const r = Math.hypot(dx, dy);
  if (r === 0 || r >= 2 * h || h <= 0) return { gx: 0, gy: 0 };
  const q = r / h;
  const a = ALPHA2 / (h * h * h);
  const sp = q < 1 ? -3 * q + 2.25 * q * q : -0.75 * (2 - q) * (2 - q);
  const s = (a * sp) / r;
  return { gx: s * dx, gy: s * dy };
}

export function wrapDelta(d: number, length: number): number {
  let x = d % length;
  if (x > length / 2) x -= length;
  if (x < -length / 2) x += length;
  return x;
}

export function wrapPos(x: number, length: number): number {
  let y = x % length;
  if (y < 0) y += length;
  return y;
}

export function pressure(rho: number, rho0: number, c0: number, pMin = -Infinity): number {
  const p = c0 * c0 * (rho - rho0);
  return p < pMin ? pMin : p;
}

/**
 * ρ/ρ₀ on an infinite 1D lattice, spacing Δx, h = η Δx, m = ρ₀ Δx.
 * At η = 1 the cubic spline recovers 1 exactly: self plus the two
 * neighbours at q = 1.
 */
export function latticeDensityRatio(eta: number): number {
  if (eta <= 0) return Infinity;
  const kMax = Math.ceil(2 * eta) + 2;
  let s = 0;
  for (let k = -kMax; k <= kMax; k++) s += cubicShape(Math.abs(k) / eta) / eta;
  return s;
}

/**
 * ρ/ρ₀ at a 1D free surface (last particle, neighbours on one side only).
 * At η = 1 this is 5/6: self (2/3) plus one neighbour at q = 1 (1/6).
 */
export function surfaceDensityRatio(eta: number): number {
  if (eta <= 0) return Infinity;
  const kMax = Math.ceil(2 * eta) + 2;
  let s = 0;
  for (let k = 0; k <= kMax; k++) s += cubicShape(k / eta) / eta;
  return s;
}

/** Neighbours including self inside the cubic-spline support 2h. */
export function neighborCount1d(eta: number): number {
  if (eta <= 0) return 1;
  return 1 + 2 * Math.floor(2 * eta - 1e-12);
}

export const SURFACE_ETA = 1;
export const SURFACE_RHO_RATIO = surfaceDensityRatio(SURFACE_ETA);

/* ── 1D SPH ────────────────────────────────────────────────────────────── */

export interface Sph1d {
  n: number;
  nFluid: number;
  x: Float64Array;
  v: Float64Array;
  a: Float64Array;
  rho: Float64Array;
  p: Float64Array;
  m: Float64Array;
  dummy: Uint8Array;
  h: number;
  dt: number;
  rho0: number;
  c0: number;
  g: number;
  alpha: number;
  /** Floor on P. 0 kills tensile attraction at a free surface; −∞ leaves it. */
  pMin: number;
  length: number;
  periodic: boolean;
  t: number;
  steps: number;
}

export interface Sph1dOpts {
  nFluid?: number;
  dx?: number;
  eta?: number;
  rho0?: number;
  c0?: number;
  g?: number;
  dt?: number;
  alpha?: number;
  nDummy?: number;
  periodic?: boolean;
  /** Multiply rest spacing (1 = lattice, >1 = stretched / in tension). */
  stretch?: number;
  /** Seed a pairing mode. 0 = exact lattice. */
  perturb?: number;
  pMin?: number;
}

const DEFAULT_1D: Required<Sph1dOpts> = {
  nFluid: 24,
  dx: 0.05,
  eta: 1.2,
  rho0: 1,
  c0: 10,
  g: 0,
  dt: 0,
  alpha: 0.1,
  nDummy: 0,
  periodic: false,
  stretch: 1,
  perturb: 0,
  pMin: -Infinity,
};

function alloc1d(n: number, opts: Required<Sph1dOpts>, length: number, periodic: boolean): Sph1d {
  const h = opts.eta * opts.dx;
  const dt = opts.dt > 0 ? opts.dt : 0.25 * h / Math.max(opts.c0, 1e-9);
  return {
    n,
    nFluid: opts.nFluid,
    x: new Float64Array(n),
    v: new Float64Array(n),
    a: new Float64Array(n),
    rho: new Float64Array(n),
    p: new Float64Array(n),
    m: new Float64Array(n),
    dummy: new Uint8Array(n),
    h,
    dt,
    rho0: opts.rho0,
    c0: opts.c0,
    g: opts.g,
    alpha: opts.alpha,
    pMin: opts.pMin,
    length,
    periodic,
    t: 0,
    steps: 0,
  };
}

function displacement1d(s: Sph1d, i: number, j: number): number {
  const d = s.x[i]! - s.x[j]!;
  return s.periodic ? wrapDelta(d, s.length) : d;
}

export function densities1d(s: Sph1d): void {
  const { n, h, rho0, c0, m, pMin } = s;
  for (let i = 0; i < n; i++) {
    let rho = 0;
    for (let j = 0; j < n; j++) rho += m[j]! * cubicW1d(displacement1d(s, i, j), h);
    s.rho[i] = rho;
    s.p[i] = pressure(rho, rho0, c0, pMin);
  }
}

export function accelerations1d(s: Sph1d): void {
  const { n, h, alpha, c0, m, g } = s;
  const eps = 0.01 * h * h;
  for (let i = 0; i < n; i++) s.a[i] = s.dummy[i] ? 0 : g;
  for (let i = 0; i < n; i++) {
    if (s.dummy[i]) continue;
    const rhoi = Math.max(s.rho[i]!, 1e-12);
    const Pi = s.p[i]!;
    for (let j = 0; j < n; j++) {
      if (j === i) continue;
      const dx = displacement1d(s, i, j);
      const grad = cubicGradW1d(dx, h);
      if (grad === 0) continue;
      const rhoj = Math.max(s.rho[j]!, 1e-12);
      let Piij = Pi / (rhoi * rhoi) + s.p[j]! / (rhoj * rhoj);
      if (alpha > 0) {
        const dv = s.v[i]! - s.v[j]!;
        if (dv * dx < 0) {
          const mu = h * dv * dx / (dx * dx + eps);
          const rhoBar = 0.5 * (rhoi + rhoj);
          Piij += (-alpha * c0 * mu) / rhoBar;
        }
      }
      s.a[i]! -= m[j]! * Piij * grad;
    }
  }
}

function bounce1d(s: Sph1d): void {
  if (s.periodic) {
    for (let i = 0; i < s.n; i++) {
      if (s.dummy[i]) continue;
      s.x[i] = wrapPos(s.x[i]!, s.length);
    }
    return;
  }
  const lo = 0;
  const hi = s.length;
  for (let i = 0; i < s.n; i++) {
    if (s.dummy[i]) continue;
    if (s.x[i]! < lo) {
      s.x[i] = lo + (lo - s.x[i]!);
      s.v[i] = Math.abs(s.v[i]!);
    } else if (s.x[i]! > hi) {
      s.x[i] = hi - (s.x[i]! - hi);
      s.v[i] = -Math.abs(s.v[i]!);
    }
  }
}

export function step1d(s: Sph1d): void {
  const { n, dt } = s;
  for (let i = 0; i < n; i++) {
    if (s.dummy[i]) continue;
    s.v[i]! += 0.5 * dt * s.a[i]!;
    s.x[i]! += dt * s.v[i]!;
  }
  bounce1d(s);
  densities1d(s);
  accelerations1d(s);
  for (let i = 0; i < n; i++) {
    if (s.dummy[i]) continue;
    s.v[i]! += 0.5 * dt * s.a[i]!;
  }
  s.t += dt;
  s.steps += 1;
}

export function run1d(s: Sph1d, steps: number): Sph1d {
  for (let k = 0; k < steps; k++) step1d(s);
  return s;
}

/** Uniform lattice. Periodic ⇒ complete kernel, forces cancel at rest. */
export function createLattice1d(opts: Sph1dOpts = {}): Sph1d {
  const o = { ...DEFAULT_1D, periodic: true, nDummy: 0, g: 0, ...opts, periodic: opts.periodic ?? true };
  const n = o.nFluid;
  const spacing = o.dx * o.stretch;
  const length = n * spacing;
  const s = alloc1d(n, { ...o, periodic: true }, length, true);
  /* Geometric density 1: mass = Δx. EOS ρ₀ is independent, so tension is
     ρ₀ above the kernel sum and compression is the opposite. */
  const m = o.dx;
  for (let i = 0; i < n; i++) {
    s.x[i] = (i + 0.5) * spacing;
    if (o.perturb !== 0) s.x[i]! += o.perturb * o.dx * Math.sin((2 * Math.PI * 3 * i) / n);
    s.m[i] = m;
  }
  densities1d(s);
  accelerations1d(s);
  return s;
}

/** Hydrostatic column. Floor dummies complete the wall kernel; the top is a free surface. */
export function createColumn1d(opts: Sph1dOpts = {}): Sph1d {
  const o = { ...DEFAULT_1D, g: -1, nDummy: 4, alpha: 0.3, pMin: 0, ...opts, periodic: false };
  const nDummy = Math.max(0, o.nDummy);
  const n = o.nFluid + nDummy;
  const H = o.nFluid * o.dx;
  const s = alloc1d(n, { ...o, periodic: false }, H + 4 * o.dx, false);
  const m = o.dx;
  for (let k = 0; k < nDummy; k++) {
    const i = k;
    s.x[i] = -(k + 0.5) * o.dx;
    s.m[i] = m;
    s.dummy[i] = 1;
  }
  for (let k = 0; k < o.nFluid; k++) {
    const i = nDummy + k;
    s.x[i] = (k + 0.5) * o.dx;
    s.m[i] = m;
  }
  s.nFluid = o.nFluid;
  densities1d(s);
  accelerations1d(s);
  return s;
}

/**
 * Lattice put in tension: rest density above the kernel sum, so P < 0.
 * A pairing-mode seed breaks the symmetry the cubic spline would otherwise
 * preserve. Artificial viscosity is off — the instability is unchecked.
 */
export function createTensile1d(opts: Sph1dOpts = {}): Sph1d {
  const o = {
    ...DEFAULT_1D,
    nFluid: 20,
    dx: 1,
    eta: 1.2,
    rho0: 1.35,
    c0: 8,
    g: 0,
    alpha: 0,
    perturb: 0.04,
    stretch: 1,
    ...opts,
    periodic: true,
    nDummy: 0,
  };
  return createLattice1d(o);
}

/** 1D dam-break: a block of fluid on the left of a tank. */
export function createDam1d(opts: Sph1dOpts = {}): Sph1d {
  const o = { ...DEFAULT_1D, nFluid: 16, g: 0, alpha: 0.4, nDummy: 3, pMin: 0, ...opts, periodic: false };
  const nDummy = o.nDummy;
  const n = o.nFluid + nDummy;
  const length = 4 * o.nFluid * o.dx;
  const s = alloc1d(n, { ...o, periodic: false }, length, false);
  const m = o.dx;
  for (let k = 0; k < nDummy; k++) {
    s.x[k] = -(k + 0.5) * o.dx;
    s.m[k] = m;
    s.dummy[k] = 1;
  }
  for (let k = 0; k < o.nFluid; k++) {
    const i = nDummy + k;
    s.x[i] = (k + 0.5) * o.dx;
    s.m[i] = m;
  }
  s.nFluid = o.nFluid;
  densities1d(s);
  accelerations1d(s);
  return s;
}

export function reconstructDensity1d(s: Sph1d, x: number): number {
  let rho = 0;
  for (let j = 0; j < s.n; j++) {
    const d = s.periodic ? wrapDelta(x - s.x[j]!, s.length) : x - s.x[j]!;
    rho += s.m[j]! * cubicW1d(d, s.h);
  }
  return rho;
}

export function totalMass1d(s: Sph1d): number {
  let m = 0;
  for (let i = 0; i < s.n; i++) if (!s.dummy[i]) m += s.m[i]!;
  return m;
}

export function totalMomentum1d(s: Sph1d): number {
  let p = 0;
  for (let i = 0; i < s.n; i++) if (!s.dummy[i]) p += s.m[i]! * s.v[i]!;
  return p;
}

export function totalForce1d(s: Sph1d): number {
  let f = 0;
  for (let i = 0; i < s.n; i++) if (!s.dummy[i]) f += s.m[i]! * s.a[i]!;
  return f;
}

export function maxAbsVel1d(s: Sph1d): number {
  let m = 0;
  for (let i = 0; i < s.n; i++) if (!s.dummy[i]) m = Math.max(m, Math.abs(s.v[i]!));
  return m;
}

export function minSpacing1d(s: Sph1d): number {
  let min = Infinity;
  for (let i = 0; i < s.n; i++) {
    if (s.dummy[i]) continue;
    for (let j = i + 1; j < s.n; j++) {
      if (s.dummy[j]) continue;
      const d = Math.abs(displacement1d(s, i, j));
      if (d < min) min = d;
    }
  }
  return min;
}

export function meanFluidX(s: Sph1d): number {
  let sx = 0, w = 0;
  for (let i = 0; i < s.n; i++) {
    if (s.dummy[i]) continue;
    sx += s.x[i]!;
    w += 1;
  }
  return w === 0 ? 0 : sx / w;
}

export function maxFluidX(s: Sph1d): number {
  let m = -Infinity;
  for (let i = 0; i < s.n; i++) if (!s.dummy[i]) m = Math.max(m, s.x[i]!);
  return m;
}

export function meanDensityFluid(s: Sph1d): number {
  let srho = 0, w = 0;
  for (let i = 0; i < s.n; i++) {
    if (s.dummy[i]) continue;
    srho += s.rho[i]!;
    w += 1;
  }
  return w === 0 ? 0 : srho / w;
}

/** Interior fluid particle — midpoint of the live range. */
export function interiorIndex(s: Sph1d): number {
  let first = -1, last = -1;
  for (let i = 0; i < s.n; i++) {
    if (s.dummy[i]) continue;
    if (first < 0) first = i;
    last = i;
  }
  if (first < 0) return 0;
  return first + Math.floor((last - first) / 2);
}

export function surfaceIndex(s: Sph1d): number {
  let iMax = 0, xMax = -Infinity;
  for (let i = 0; i < s.n; i++) {
    if (s.dummy[i]) continue;
    if (s.x[i]! >= xMax) {
      xMax = s.x[i]!;
      iMax = i;
    }
  }
  return iMax;
}

/* ── 2D dam-break ──────────────────────────────────────────────────────── */

export interface Sph2d {
  n: number;
  nFluid: number;
  x: Float64Array;
  y: Float64Array;
  vx: Float64Array;
  vy: Float64Array;
  ax: Float64Array;
  ay: Float64Array;
  rho: Float64Array;
  p: Float64Array;
  m: Float64Array;
  dummy: Uint8Array;
  h: number;
  dt: number;
  rho0: number;
  c0: number;
  g: number;
  alpha: number;
  pMin: number;
  Lx: number;
  Ly: number;
  t: number;
  steps: number;
}

export interface Sph2dOpts {
  nx?: number;
  ny?: number;
  dx?: number;
  eta?: number;
  rho0?: number;
  c0?: number;
  g?: number;
  dt?: number;
  alpha?: number;
  Lx?: number;
  Ly?: number;
  layers?: number;
  pMin?: number;
}

const DEFAULT_2D: Required<Sph2dOpts> = {
  nx: 12,
  ny: 10,
  dx: 0.05,
  eta: 1.3,
  rho0: 1,
  c0: 8,
  g: -2.2,
  dt: 0,
  alpha: 0.35,
  Lx: 1.35,
  Ly: 0.72,
  layers: 2,
  pMin: 0,
};

function pushParticle(
  list: { x: number; y: number; dummy: number }[],
  x: number, y: number, dummy: number,
): void {
  list.push({ x, y, dummy });
}

export function createDam2d(opts: Sph2dOpts = {}): Sph2d {
  const o = { ...DEFAULT_2D, ...opts };
  const { dx, nx, ny, layers } = o;
  const particles: { x: number; y: number; dummy: number }[] = [];

  /* Fluid block sits in the left-bottom corner, one spacing off the dummy
     wall so the kernel sees the wall and the right face is a free surface. */
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      pushParticle(particles, (i + 0.5) * dx, (j + 0.5) * dx, 0);
    }
  }
  const nFluid = particles.length;

  const iLo = -layers;
  const iHi = Math.ceil(o.Lx / dx) + layers;
  const jLo = -layers;
  const jHi = Math.ceil(o.Ly / dx) + layers;
  for (let j = jLo; j < jHi; j++) {
    for (let i = iLo; i < iHi; i++) {
      const inside = i >= 0 && j >= 0 && (i + 0.5) * dx < o.Lx && (j + 0.5) * dx < o.Ly;
      if (inside) continue;
      pushParticle(particles, (i + 0.5) * dx, (j + 0.5) * dx, 1);
    }
  }

  const n = particles.length;
  const h = o.eta * dx;
  const dt = o.dt > 0 ? o.dt : 0.22 * h / Math.max(o.c0, 1e-9);
  const s: Sph2d = {
    n, nFluid,
    x: new Float64Array(n),
    y: new Float64Array(n),
    vx: new Float64Array(n),
    vy: new Float64Array(n),
    ax: new Float64Array(n),
    ay: new Float64Array(n),
    rho: new Float64Array(n),
    p: new Float64Array(n),
    m: new Float64Array(n),
    dummy: new Uint8Array(n),
    h, dt,
    rho0: o.rho0,
    c0: o.c0,
    g: o.g,
    alpha: o.alpha,
    pMin: o.pMin,
    Lx: o.Lx,
    Ly: o.Ly,
    t: 0,
    steps: 0,
  };
  /* Slightly overdense so the block has P > 0 and expands into the tank.
     Walls on the left and floor turn that expansion into a dam-break. */
  const mass = 1.08 * o.rho0 * dx * dx;
  for (let i = 0; i < n; i++) {
    const p = particles[i]!;
    s.x[i] = p.x;
    s.y[i] = p.y;
    s.dummy[i] = p.dummy;
    s.m[i] = mass;
  }
  densities2d(s);
  accelerations2d(s);
  return s;
}

export function densities2d(s: Sph2d): void {
  const { n, h, m, rho0, c0, pMin } = s;
  for (let i = 0; i < n; i++) {
    let rho = 0;
    for (let j = 0; j < n; j++) {
      rho += m[j]! * cubicW2d(Math.hypot(s.x[i]! - s.x[j]!, s.y[i]! - s.y[j]!), h);
    }
    s.rho[i] = rho;
    s.p[i] = pressure(rho, rho0, c0, pMin);
  }
}

export function accelerations2d(s: Sph2d): void {
  const { n, h, alpha, c0, m, g } = s;
  const eps = 0.01 * h * h;
  for (let i = 0; i < n; i++) {
    s.ax[i] = 0;
    s.ay[i] = s.dummy[i] ? 0 : g;
  }
  for (let i = 0; i < n; i++) {
    if (s.dummy[i]) continue;
    const rhoi = Math.max(s.rho[i]!, 1e-12);
    const Pi = s.p[i]!;
    for (let j = 0; j < n; j++) {
      if (j === i) continue;
      const dx = s.x[i]! - s.x[j]!;
      const dy = s.y[i]! - s.y[j]!;
      const { gx, gy } = cubicGradW2d(dx, dy, h);
      if (gx === 0 && gy === 0) continue;
      const rhoj = Math.max(s.rho[j]!, 1e-12);
      let Piij = Pi / (rhoi * rhoi) + s.p[j]! / (rhoj * rhoj);
      if (alpha > 0) {
        const dvx = s.vx[i]! - s.vx[j]!;
        const dvy = s.vy[i]! - s.vy[j]!;
        const vr = dvx * dx + dvy * dy;
        if (vr < 0) {
          const mu = h * vr / (dx * dx + dy * dy + eps);
          const rhoBar = 0.5 * (rhoi + rhoj);
          Piij += (-alpha * c0 * mu) / rhoBar;
        }
      }
      const mj = m[j]!;
      s.ax[i]! -= mj * Piij * gx;
      s.ay[i]! -= mj * Piij * gy;
    }
  }
}

export function step2d(s: Sph2d): void {
  const { n, dt, Lx, Ly } = s;
  for (let i = 0; i < n; i++) {
    if (s.dummy[i]) continue;
    s.vx[i]! += 0.5 * dt * s.ax[i]!;
    s.vy[i]! += 0.5 * dt * s.ay[i]!;
    s.x[i]! += dt * s.vx[i]!;
    s.y[i]! += dt * s.vy[i]!;
    if (s.x[i]! < 0) { s.x[i] = -s.x[i]!; s.vx[i] = Math.abs(s.vx[i]!); }
    if (s.x[i]! > Lx) { s.x[i] = 2 * Lx - s.x[i]!; s.vx[i] = -Math.abs(s.vx[i]!); }
    if (s.y[i]! < 0) { s.y[i] = -s.y[i]!; s.vy[i] = Math.abs(s.vy[i]!); }
    if (s.y[i]! > Ly) { s.y[i] = 2 * Ly - s.y[i]!; s.vy[i] = -Math.abs(s.vy[i]!); }
  }
  densities2d(s);
  accelerations2d(s);
  for (let i = 0; i < n; i++) {
    if (s.dummy[i]) continue;
    s.vx[i]! += 0.5 * dt * s.ax[i]!;
    s.vy[i]! += 0.5 * dt * s.ay[i]!;
  }
  s.t += dt;
  s.steps += 1;
}

export function run2d(s: Sph2d, steps: number): Sph2d {
  for (let k = 0; k < steps; k++) step2d(s);
  return s;
}

export function totalMass2d(s: Sph2d): number {
  let m = 0;
  for (let i = 0; i < s.n; i++) if (!s.dummy[i]) m += s.m[i]!;
  return m;
}

export function meanFluidX2d(s: Sph2d): number {
  let sx = 0, w = 0;
  for (let i = 0; i < s.n; i++) {
    if (s.dummy[i]) continue;
    sx += s.x[i]!;
    w += 1;
  }
  return w === 0 ? 0 : sx / w;
}

export function maxAbsVel2d(s: Sph2d): number {
  let m = 0;
  for (let i = 0; i < s.n; i++) {
    if (s.dummy[i]) continue;
    m = Math.max(m, Math.hypot(s.vx[i]!, s.vy[i]!));
  }
  return m;
}

/** Measured clumping: min fluid–fluid spacing after `steps` of unchecked tension. */
export function tensileMinSpacing(steps = 280): number {
  const s = createTensile1d();
  const dx = s.length / s.nFluid;
  run1d(s, steps);
  return minSpacing1d(s) / dx;
}

/** Compression control: P > 0, same seed. Spacing should not collapse. */
export function compressiveMinSpacing(steps = 280): number {
  const s = createTensile1d({ rho0: 0.75 });
  const dx = s.length / s.nFluid;
  run1d(s, steps);
  return minSpacing1d(s) / dx;
}

export function hydrostaticTopDrop(steps = 400): { before: number; after: number; vmax: number } {
  const s = createColumn1d({ nFluid: 16, nDummy: 4, alpha: 0.6, pMin: 0 });
  const before = maxFluidX(s);
  run1d(s, steps);
  return { before, after: maxFluidX(s), vmax: maxAbsVel1d(s) };
}

export function periodicRestDrift(steps = 200): number {
  const s = createLattice1d({ nFluid: 16, dx: 0.05, eta: 1.2, g: 0, alpha: 0 });
  run1d(s, steps);
  return maxAbsVel1d(s);
}
