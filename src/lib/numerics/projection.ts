/* ─────────────────────────────────────────────────────────────────────────
   MAC Helmholtz projection on the periodic unit square.

   Staggered Harlow–Welch: pressure at cell centres, u on vertical faces,
   v on horizontal faces. Discrete div of a discrete curl is identically
   zero; discrete curl of a discrete gradient is identically zero. That is
   why the Helmholtz split is exact on this grid, not approximate.

   Chorin 1968, spatial half:  u* unconstrained,  Δφ = ∇·u*,  u = u* − ∇φ.
   Pressure is the Lagrange multiplier of ∇·u = 0.

   Indexing, n × n cells, h = 1/n:

     u[i + j n]  at  ((i + 1) h,  (j + 0.5) h)     right face of cell (i, j)
     v[i + j n]  at  ((i + 0.5) h, (j + 1) h)     top face of cell (i, j)
     p[i + j n]  at  ((i + 0.5) h, (j + 0.5) h)   cell centre
   ───────────────────────────────────────────────────────────────────────── */

import { wrap, wrapDelta } from './pde1d.ts';

export const PROJ_N = 24;
export const PROJ_SIGMA = 0.14;
export const SINK_AMP = 0.014;
export const VORTEX_AMP = 0.055;
export const BLOB_R = 0.11;
export const BLOB_N = 96;
export const BLOB_CX = 0.5;
export const BLOB_CY = 0.5;
export const BLOB_T_END = 1;
export const BLOB_DT = 0.012;

export type MacField = 'sink' | 'vortex' | 'mixed' | 'uniform';

export interface MacState {
  n: number;
  h: number;
  u: Float64Array;
  v: Float64Array;
}

export function macGrid(n: number): MacState {
  return { n, h: 1 / n, u: new Float64Array(n * n), v: new Float64Array(n * n) };
}

export function cloneMac(g: MacState): MacState {
  return { n: g.n, h: g.h, u: g.u.slice(), v: g.v.slice() };
}

export function addMac(a: MacState, b: MacState, scale = 1): void {
  for (let i = 0; i < a.u.length; i++) {
    a.u[i]! += scale * b.u[i]!;
    a.v[i]! += scale * b.v[i]!;
  }
}

export const idx = (i: number, j: number, n: number): number => wrap(i, n) + wrap(j, n) * n;

export function maxAbs(a: ArrayLike<number>): number {
  let m = 0;
  for (let i = 0; i < a.length; i++) {
    const v = Math.abs(a[i]!);
    if (v > m) m = v;
  }
  return m;
}

export function meanOf(a: ArrayLike<number>): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i]!;
  return s / a.length;
}

const TWO_PI = 2 * Math.PI;

function gaussian(x: number, y: number, x0: number, y0: number, sigma: number): number {
  const dx = wrapDelta(x - x0, 1);
  const dy = wrapDelta(y - y0, 1);
  return Math.exp(-(dx * dx + dy * dy) / (2 * sigma * sigma));
}

/** Stream-function vortex: u = ∂ψ/∂y, v = −∂ψ/∂x, ψ sampled at vertices. */
export function fillVortex(
  g: MacState,
  amp = VORTEX_AMP,
  x0 = BLOB_CX,
  y0 = BLOB_CY,
  sigma = PROJ_SIGMA,
): void {
  const { n, h, u, v } = g;
  const psi = (i: number, j: number) => amp * gaussian(wrap(i, n) * h, wrap(j, n) * h, x0, y0, sigma);
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      u[i + j * n] = (psi(i + 1, j + 1) - psi(i + 1, j)) / h;
      v[i + j * n] = -(psi(i + 1, j + 1) - psi(i, j + 1)) / h;
    }
  }
}

/** Pure sink: u = ∇φ for a cell-centred Gaussian bump. Inflow toward the peak. */
export function fillSink(
  g: MacState,
  amp = SINK_AMP,
  x0 = BLOB_CX,
  y0 = BLOB_CY,
  sigma = PROJ_SIGMA,
): void {
  const { n, h, u, v } = g;
  const phi = new Float64Array(n * n);
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      phi[i + j * n] = amp * gaussian((i + 0.5) * h, (j + 0.5) * h, x0, y0, sigma);
    }
  }
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      u[i + j * n] = (phi[idx(i + 1, j, n)]! - phi[i + j * n]!) / h;
      v[i + j * n] = (phi[idx(i, j + 1, n)]! - phi[i + j * n]!) / h;
    }
  }
}

export function fillUniform(g: MacState, ux = 0.2, uy = 0.1): void {
  g.u.fill(ux);
  g.v.fill(uy);
}

export function fillMixed(g: MacState, sinkAmp = SINK_AMP, vortexAmp = VORTEX_AMP): void {
  fillVortex(g, vortexAmp);
  const sink = macGrid(g.n);
  fillSink(sink, sinkAmp);
  addMac(g, sink);
}

export function makeField(kind: MacField, n = PROJ_N): MacState {
  const g = macGrid(n);
  if (kind === 'sink') fillSink(g);
  else if (kind === 'vortex') fillVortex(g);
  else if (kind === 'uniform') fillUniform(g);
  else fillMixed(g);
  return g;
}

/** Cell-centred discrete divergence. Length n². */
export function divergence(g: MacState): Float64Array {
  const { n, h, u, v } = g;
  const d = new Float64Array(n * n);
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const du = (u[i + j * n]! - u[idx(i - 1, j, n)]!) / h;
      const dv = (v[i + j * n]! - v[idx(i, j - 1, n)]!) / h;
      d[i + j * n] = du + dv;
    }
  }
  return d;
}

export const maxAbsDiv = (g: MacState): number => maxAbs(divergence(g));
export const meanDiv = (g: MacState): number => meanOf(divergence(g));

/** Vertex-centred discrete curl (∂v/∂x − ∂u/∂y). Length n², at (i h, j h).
 *  This is the staggering that makes curl(grad φ) identically zero. */
export function curlZ(g: MacState): Float64Array {
  const { n, h, u, v } = g;
  const c = new Float64Array(n * n);
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const dvdx = (v[idx(i, j - 1, n)]! - v[idx(i - 1, j - 1, n)]!) / h;
      const dudy = (u[idx(i - 1, j, n)]! - u[idx(i - 1, j - 1, n)]!) / h;
      c[i + j * n] = dvdx - dudy;
    }
  }
  return c;
}

export const maxAbsCurl = (g: MacState): number => maxAbs(curlZ(g));

/* ── 2-D DFT of a real cell-centred field (separable, unnormalised) ──── */

function dft2(x: Float64Array, n: number): { re: Float64Array; im: Float64Array } {
  const re = new Float64Array(n * n);
  const im = new Float64Array(n * n);
  for (let j = 0; j < n; j++) {
    for (let k = 0; k < n; k++) {
      let rk = 0;
      let ik = 0;
      for (let i = 0; i < n; i++) {
        const theta = (TWO_PI * k * i) / n;
        const v = x[i + j * n]!;
        rk += v * Math.cos(theta);
        ik -= v * Math.sin(theta);
      }
      re[k + j * n] = rk;
      im[k + j * n] = ik;
    }
  }
  const colRe = new Float64Array(n);
  const colIm = new Float64Array(n);
  for (let k = 0; k < n; k++) {
    for (let l = 0; l < n; l++) {
      let rk = 0;
      let ik = 0;
      for (let j = 0; j < n; j++) {
        const theta = (TWO_PI * l * j) / n;
        const c = Math.cos(theta);
        const s = Math.sin(theta);
        const xr = re[k + j * n]!;
        const xi = im[k + j * n]!;
        rk += xr * c + xi * s;
        ik += xi * c - xr * s;
      }
      colRe[l] = rk;
      colIm[l] = ik;
    }
    for (let l = 0; l < n; l++) {
      re[k + l * n] = colRe[l]!;
      im[k + l * n] = colIm[l]!;
    }
  }
  return { re, im };
}

function idft2(re0: Float64Array, im0: Float64Array, n: number): Float64Array {
  const re = re0.slice();
  const im = im0.slice();
  const colRe = new Float64Array(n);
  const colIm = new Float64Array(n);
  for (let k = 0; k < n; k++) {
    for (let j = 0; j < n; j++) {
      let rk = 0;
      let ik = 0;
      for (let l = 0; l < n; l++) {
        const theta = (TWO_PI * l * j) / n;
        const c = Math.cos(theta);
        const s = Math.sin(theta);
        const xr = re[k + l * n]!;
        const xi = im[k + l * n]!;
        rk += xr * c - xi * s;
        ik += xr * s + xi * c;
      }
      colRe[j] = rk / n;
      colIm[j] = ik / n;
    }
    for (let j = 0; j < n; j++) {
      re[k + j * n] = colRe[j]!;
      im[k + j * n] = colIm[j]!;
    }
  }
  const x = new Float64Array(n * n);
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      let rk = 0;
      for (let k = 0; k < n; k++) {
        const theta = (TWO_PI * k * i) / n;
        const xr = re[k + j * n]!;
        const xi = im[k + j * n]!;
        rk += xr * Math.cos(theta) - xi * Math.sin(theta);
      }
      x[i + j * n] = rk / n;
    }
  }
  return x;
}

/** 5-point eigenvalue of Δ on a periodic n × n grid. Zero only at (0, 0). */
export function laplacianEigenvalue(k: number, l: number, n: number, h: number): number {
  return (2 * Math.cos((TWO_PI * k) / n) + 2 * Math.cos((TWO_PI * l) / n) - 4) / (h * h);
}

/** Periodic Poisson Δφ = rhs, mean-zero. Spectral, so the residual is roundoff. */
export function solvePoissonSpectral(rhs: Float64Array, n: number, h: number): Float64Array {
  const { re, im } = dft2(rhs, n);
  for (let l = 0; l < n; l++) {
    for (let k = 0; k < n; k++) {
      const p = k + l * n;
      if (k === 0 && l === 0) {
        re[p] = 0;
        im[p] = 0;
        continue;
      }
      const lam = laplacianEigenvalue(k, l, n, h);
      re[p] = re[p]! / lam;
      im[p] = im[p]! / lam;
    }
  }
  return idft2(re, im, n);
}

export function subtractGradient(g: MacState, phi: Float64Array): void {
  const { n, h, u, v } = g;
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      u[i + j * n]! -= (phi[idx(i + 1, j, n)]! - phi[i + j * n]!) / h;
      v[i + j * n]! -= (phi[idx(i, j + 1, n)]! - phi[i + j * n]!) / h;
    }
  }
}

export interface Projected {
  grid: MacState;
  phi: Float64Array;
  maxDivBefore: number;
  maxDivAfter: number;
}

export function projectSpectral(g: MacState): Projected {
  const grid = cloneMac(g);
  const div = divergence(grid);
  const maxDivBefore = maxAbs(div);
  const phi = solvePoissonSpectral(div, grid.n, grid.h);
  subtractGradient(grid, phi);
  return { grid, phi, maxDivBefore, maxDivAfter: maxAbsDiv(grid) };
}

/** One Jacobi sweep on Δφ = rhs. Pins the mean so the kernel stays quiet. */
export function jacobiSweep(phi: Float64Array, rhs: Float64Array, n: number, h: number): Float64Array {
  const out = new Float64Array(n * n);
  const h2 = h * h;
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const e = phi[idx(i + 1, j, n)]!;
      const w = phi[idx(i - 1, j, n)]!;
      const nn = phi[idx(i, j + 1, n)]!;
      const s = phi[idx(i, j - 1, n)]!;
      out[i + j * n] = 0.25 * (e + w + nn + s - h2 * rhs[i + j * n]!);
    }
  }
  const m = meanOf(out);
  for (let i = 0; i < out.length; i++) out[i]! -= m;
  return out;
}

export function projectJacobi(g: MacState, iters: number): Projected {
  const grid = cloneMac(g);
  const div = divergence(grid);
  const maxDivBefore = maxAbs(div);
  let phi: Float64Array = new Float64Array(grid.n * grid.n);
  for (let k = 0; k < iters; k++) phi = jacobiSweep(phi, div, grid.n, grid.h);
  subtractGradient(grid, phi);
  return { grid, phi, maxDivBefore, maxDivAfter: maxAbsDiv(grid) };
}

/** Tempting cleanup: subtract ⟨u⟩. Divergence is unchanged. */
export function subtractMeanVelocity(g: MacState): MacState {
  const out = cloneMac(g);
  const um = meanOf(out.u);
  const vm = meanOf(out.v);
  for (let i = 0; i < out.u.length; i++) {
    out.u[i]! -= um;
    out.v[i]! -= vm;
  }
  return out;
}

export function kineticEnergy(g: MacState): number {
  let s = 0;
  for (let i = 0; i < g.u.length; i++) s += g.u[i]! * g.u[i]! + g.v[i]! * g.v[i]!;
  return 0.5 * s * g.h * g.h;
}

/** Face inner product ⟨a, b⟩ = h² Σ (a_u b_u + a_v b_v). */
export function macInner(a: MacState, b: MacState): number {
  let s = 0;
  for (let i = 0; i < a.u.length; i++) s += a.u[i]! * b.u[i]! + a.v[i]! * b.v[i]!;
  return s * a.h * a.h;
}

/* ── MAC interpolation and dye-ring advection ─────────────────────────── */

export function interpolateMac(g: MacState, x: number, y: number): [number, number] {
  const { n, h, u, v } = g;
  const wx = ((x % 1) + 1) % 1;
  const wy = ((y % 1) + 1) % 1;

  const bilinear = (field: Float64Array, fx: number, fy: number): number => {
    const i0 = Math.floor(fx);
    const j0 = Math.floor(fy);
    const sx = fx - i0;
    const sy = fy - j0;
    const a = field[idx(i0, j0, n)]!;
    const b = field[idx(i0 + 1, j0, n)]!;
    const c = field[idx(i0, j0 + 1, n)]!;
    const d = field[idx(i0 + 1, j0 + 1, n)]!;
    return (1 - sx) * (1 - sy) * a + sx * (1 - sy) * b + (1 - sx) * sy * c + sx * sy * d;
  };

  // u lives at ((i + 1) h, (j + 0.5) h) → index space (x/h − 1, y/h − 0.5)
  const uu = bilinear(u, wx / h - 1, wy / h - 0.5);
  const vv = bilinear(v, wx / h - 0.5, wy / h - 1);
  return [uu, vv];
}

export function makeRing(
  n = BLOB_N,
  cx = BLOB_CX,
  cy = BLOB_CY,
  r = BLOB_R,
): { x: Float64Array; y: Float64Array } {
  const x = new Float64Array(n);
  const y = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const t = (TWO_PI * i) / n;
    x[i] = cx + r * Math.cos(t);
    y[i] = cy + r * Math.sin(t);
  }
  return { x, y };
}

export function shoelace(x: ArrayLike<number>, y: ArrayLike<number>): number {
  const n = x.length;
  let a = 0;
  for (let i = 0, j = n - 1; i < n; j = i++) a += (x[j]! + x[i]!) * (y[j]! - y[i]!);
  return Math.abs(a) / 2;
}

/** RK2 (Heun) advection of a ring. Periodic in the velocity sample, not the
 *  polygon: the blob is kept small and centred so the shoelace stays honest. */
export function advectRing(
  g: MacState,
  x: Float64Array,
  y: Float64Array,
  dt: number,
): void {
  const n = x.length;
  for (let i = 0; i < n; i++) {
    const [u1, v1] = interpolateMac(g, x[i]!, y[i]!);
    const [u2, v2] = interpolateMac(g, x[i]! + dt * u1, y[i]! + dt * v1);
    x[i]! += 0.5 * dt * (u1 + u2);
    y[i]! += 0.5 * dt * (v1 + v2);
  }
}

export interface BlobSample {
  t: number;
  area: number;
  area0: number;
  maxDiv: number;
}

export function runBlob(opts: {
  field: MacField;
  project: boolean;
  tEnd?: number;
  dt?: number;
  n?: number;
}): BlobSample[] {
  const n = opts.n ?? PROJ_N;
  const tEnd = opts.tEnd ?? BLOB_T_END;
  const dt = opts.dt ?? BLOB_DT;
  let g = makeField(opts.field, n);
  if (opts.project) g = projectSpectral(g).grid;
  const ring = makeRing();
  const area0 = shoelace(ring.x, ring.y);
  const out: BlobSample[] = [{ t: 0, area: area0, area0, maxDiv: maxAbsDiv(g) }];
  let t = 0;
  while (t < tEnd - 1e-15) {
    const step = Math.min(dt, tEnd - t);
    advectRing(g, ring.x, ring.y, step);
    t += step;
    out.push({ t, area: shoelace(ring.x, ring.y), area0, maxDiv: maxAbsDiv(g) });
  }
  return out;
}

export function leftoverMaxDiv(kind: MacField, treatment: 'raw' | 'mean' | 'jacobi-8' | 'spectral', n = PROJ_N): number {
  const g = makeField(kind, n);
  if (treatment === 'raw') return maxAbsDiv(g);
  if (treatment === 'mean') return maxAbsDiv(subtractMeanVelocity(g));
  if (treatment === 'jacobi-8') return projectJacobi(g, 8).maxDivAfter;
  return projectSpectral(g).maxDivAfter;
}

export function jacobiItersUntil(ratio = 0.01, n = 16, kind: MacField = 'mixed'): number {
  const g = makeField(kind, n);
  const div0 = maxAbsDiv(g);
  const target = div0 * ratio;
  const div = divergence(g);
  let phi: Float64Array = new Float64Array(n * n);
  const cap = 400;
  for (let k = 1; k <= cap; k++) {
    phi = jacobiSweep(phi, div, n, 1 / n);
    const trial = cloneMac(g);
    subtractGradient(trial, phi);
    if (maxAbsDiv(trial) <= target) return k;
  }
  return cap;
}
