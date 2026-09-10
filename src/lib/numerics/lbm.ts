/* ─────────────────────────────────────────────────────────────────────────
   Lattice Boltzmann, BGK, lattice units Δx = Δt = 1.

   The state is discrete-velocity populations f_i. Density and velocity are
   moments. Navier–Stokes is recovered (Chapman–Enskog), not stored.

   D1Q3 is the hand-computable gas: three populations, stream or collide.
   D2Q9 is the channel: bounce-back walls, Guo body force, a Poiseuille
   parabola whose height is 1/(τ − 1/2).

   Collision:  f* = f + ω (f^eq − f) [+ Guo force]
   Streaming:  f_i(x) ← f_i*(x − e_i), with bounce-back at solids.
   ───────────────────────────────────────────────────────────────────────── */

export const CS2 = 1 / 3;
export const CS = Math.sqrt(CS2);

export function kinematicViscosity(tau: number): number {
  return CS2 * (tau - 0.5);
}

/* ── D1Q3 ──────────────────────────────────────────────────────────────── */

export const D1Q3_Q = 3;
/** e = −1, 0, +1 */
export const D1Q3_E = [-1, 0, 1] as const;
export const D1Q3_W = [1 / 6, 2 / 3, 1 / 6] as const;
export const D1Q3_OPP = [2, 1, 0] as const;

export interface D1Q3State {
  n: number;
  f: Float64Array;
  scratch: Float64Array;
  tau: number;
  t: number;
  steps: number;
}

export function idx1(k: number, q: number): number {
  return k * D1Q3_Q + q;
}

export function equilibriumD1Q3(rho: number, u: number, q: number): number {
  const e = D1Q3_E[q]!;
  const eu = e * u;
  return D1Q3_W[q]! * rho * (1 + 3 * eu + 4.5 * eu * eu - 1.5 * u * u);
}

export function momentsD1Q3(f: Float64Array, k: number): { rho: number; u: number } {
  const base = k * D1Q3_Q;
  const fL = f[base]!;
  const f0 = f[base + 1]!;
  const fR = f[base + 2]!;
  const rho = fL + f0 + fR;
  const u = rho > 1e-14 ? (fR - fL) / rho : 0;
  return { rho, u };
}

export function massD1Q3(s: D1Q3State): number {
  let m = 0;
  for (let i = 0; i < s.f.length; i++) m += s.f[i]!;
  return m;
}

export function momentumD1Q3(s: D1Q3State): number {
  let p = 0;
  for (let k = 0; k < s.n; k++) {
    const { rho, u } = momentsD1Q3(s.f, k);
    p += rho * u;
  }
  return p;
}

export function collideD1Q3(s: D1Q3State): void {
  const omega = 1 / s.tau;
  const f = s.f;
  for (let k = 0; k < s.n; k++) {
    const { rho, u } = momentsD1Q3(f, k);
    const base = k * D1Q3_Q;
    for (let q = 0; q < D1Q3_Q; q++) {
      const feq = equilibriumD1Q3(rho, u, q);
      f[base + q] += omega * (feq - f[base + q]!);
    }
  }
}

/** Pull: f_i(k) ← f_i(k − e_i), periodic. */
export function streamD1Q3(s: D1Q3State): void {
  const { n, f, scratch } = s;
  for (let k = 0; k < n; k++) {
    const km = k === 0 ? n - 1 : k - 1;
    const kp = k === n - 1 ? 0 : k + 1;
    scratch[idx1(k, 0)] = f[idx1(kp, 0)]!; // left-going comes from the right
    scratch[idx1(k, 1)] = f[idx1(k, 1)]!;  // rest stays
    scratch[idx1(k, 2)] = f[idx1(km, 2)]!; // right-going comes from the left
  }
  f.set(scratch);
}

export function stepD1Q3(s: D1Q3State): void {
  collideD1Q3(s);
  streamD1Q3(s);
  s.t += 1;
  s.steps += 1;
}

export function createPulseD1Q3(opts?: {
  n?: number;
  tau?: number;
  amp?: number;
  width?: number;
  center?: number;
  background?: number;
}): D1Q3State {
  const n = opts?.n ?? 16;
  const tau = opts?.tau ?? 1;
  const amp = opts?.amp ?? 0.8;
  const width = opts?.width ?? 0.7;
  const center = opts?.center ?? n / 2;
  const background = opts?.background ?? 1;
  const f = new Float64Array(n * D1Q3_Q);
  for (let k = 0; k < n; k++) {
    const rho = background + amp * Math.exp(-0.5 * ((k - center) / width) ** 2);
    for (let q = 0; q < D1Q3_Q; q++) f[idx1(k, q)] = equilibriumD1Q3(rho, 0, q);
  }
  return { n, f, scratch: new Float64Array(n * D1Q3_Q), tau, t: 0, steps: 0 };
}

/** Single-site rest bump on a uniform background — the hand calculation. */
export function createSiteBumpD1Q3(n: number, site: number, amp: number, tau = 1): D1Q3State {
  const f = new Float64Array(n * D1Q3_Q);
  for (let k = 0; k < n; k++) {
    const rho = k === site ? 1 + amp : 1;
    for (let q = 0; q < D1Q3_Q; q++) f[idx1(k, q)] = equilibriumD1Q3(rho, 0, q);
  }
  return { n, f, scratch: new Float64Array(n * D1Q3_Q), tau, t: 0, steps: 0 };
}

/* ── D2Q9 ──────────────────────────────────────────────────────────────── */

export const D2Q9_Q = 9;
export const D2Q9_EX = [0, 1, 0, -1, 0, 1, -1, -1, 1] as const;
export const D2Q9_EY = [0, 0, 1, 0, -1, 1, 1, -1, -1] as const;
export const D2Q9_W = [4 / 9, 1 / 9, 1 / 9, 1 / 9, 1 / 9, 1 / 36, 1 / 36, 1 / 36, 1 / 36] as const;
/** Opposite of 0..8: 0, 3, 4, 1, 2, 7, 8, 5, 6 */
export const D2Q9_OPP = [0, 3, 4, 1, 2, 7, 8, 5, 6] as const;

export interface D2Q9State {
  nx: number;
  ny: number;
  f: Float64Array;
  scratch: Float64Array;
  solid: Uint8Array;
  tau: number;
  gx: number;
  gy: number;
  t: number;
  steps: number;
}

export function idx2(i: number, j: number, q: number, nx: number): number {
  return (i + j * nx) * D2Q9_Q + q;
}

export function cell2(i: number, j: number, nx: number): number {
  return i + j * nx;
}

export function equilibriumD2Q9(rho: number, ux: number, uy: number, q: number): number {
  const eu = D2Q9_EX[q]! * ux + D2Q9_EY[q]! * uy;
  const uu = ux * ux + uy * uy;
  return D2Q9_W[q]! * rho * (1 + 3 * eu + 4.5 * eu * eu - 1.5 * uu);
}

export function momentsD2Q9(s: D2Q9State, i: number, j: number): { rho: number; ux: number; uy: number } {
  const base = (i + j * s.nx) * D2Q9_Q;
  const f = s.f;
  let rho = 0, mx = 0, my = 0;
  for (let q = 0; q < D2Q9_Q; q++) {
    const fq = f[base + q]!;
    rho += fq;
    mx += D2Q9_EX[q]! * fq;
    my += D2Q9_EY[q]! * fq;
  }
  const inv = 1 / Math.max(rho, 1e-14);
  return { rho, ux: mx * inv + 0.5 * s.gx, uy: my * inv + 0.5 * s.gy };
}

export function massD2Q9(s: D2Q9State): number {
  let m = 0;
  const nCell = s.nx * s.ny;
  for (let c = 0; c < nCell; c++) {
    if (s.solid[c]) continue;
    const base = c * D2Q9_Q;
    for (let q = 0; q < D2Q9_Q; q++) m += s.f[base + q]!;
  }
  return m;
}

export function collideD2Q9(s: D2Q9State): void {
  const { nx, ny, f, solid, gx, gy } = s;
  const omega = 1 / s.tau;
  const coeff = 1 - 0.5 * omega;
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const c = i + j * nx;
      if (solid[c]) continue;
      const base = c * D2Q9_Q;
      let rho = 0, mx = 0, my = 0;
      for (let q = 0; q < D2Q9_Q; q++) {
        const fq = f[base + q]!;
        rho += fq;
        mx += D2Q9_EX[q]! * fq;
        my += D2Q9_EY[q]! * fq;
      }
      const inv = 1 / Math.max(rho, 1e-14);
      const ux = mx * inv + 0.5 * gx;
      const uy = my * inv + 0.5 * gy;
      const uu = ux * ux + uy * uy;
      const ug = ux * gx + uy * gy;
      for (let q = 0; q < D2Q9_Q; q++) {
        const ex = D2Q9_EX[q]!, ey = D2Q9_EY[q]!, w = D2Q9_W[q]!;
        const eu = ex * ux + ey * uy;
        const eg = ex * gx + ey * gy;
        const feq = w * rho * (1 + 3 * eu + 4.5 * eu * eu - 1.5 * uu);
        const Fi = w * rho * coeff * (3 * eg + 9 * eu * eg - 3 * ug);
        f[base + q] += omega * (feq - f[base + q]!) + Fi;
      }
    }
  }
}

/** Pull with halfway bounce-back. x is periodic; solids bounce the opposite. */
export function streamD2Q9(s: D2Q9State): void {
  const { nx, ny, f, scratch, solid } = s;
  scratch.fill(0);
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const c = i + j * nx;
      if (solid[c]) continue;
      const base = c * D2Q9_Q;
      for (let q = 0; q < D2Q9_Q; q++) {
        const iSrc = ((i - D2Q9_EX[q]!) % nx + nx) % nx;
        const jSrc = j - D2Q9_EY[q]!;
        const srcSolid = jSrc < 0 || jSrc >= ny || solid[iSrc + jSrc * nx];
        if (srcSolid) {
          scratch[base + q] = f[base + D2Q9_OPP[q]!]!;
        } else {
          scratch[base + q] = f[idx2(iSrc, jSrc, q, nx)]!;
        }
      }
    }
  }
  f.set(scratch);
}

export function stepD2Q9(s: D2Q9State): void {
  collideD2Q9(s);
  streamD2Q9(s);
  s.t += 1;
  s.steps += 1;
}

export function isFiniteD2Q9(s: D2Q9State): boolean {
  for (let i = 0; i < s.f.length; i++) {
    if (!Number.isFinite(s.f[i]!)) return false;
  }
  return true;
}

/** Channel height between halfway walls. Solid rows at j = 0 and j = ny−1. */
export function channelHeight(ny: number): number {
  return ny - 2;
}

/** Wall-distance of fluid node j. Bottom wall sits at y = 0. */
export function nodeY(j: number): number {
  return j - 0.5;
}

export function poiseuilleAnalytic(y: number, H: number, g: number, nu: number): number {
  return (g / (2 * nu)) * y * (H - y);
}

export function poiseuilleUmax(H: number, g: number, nu: number): number {
  return (g * H * H) / (8 * nu);
}

export function createChannel(opts?: {
  nx?: number;
  ny?: number;
  tau?: number;
  gx?: number;
  gy?: number;
}): D2Q9State {
  const nx = opts?.nx ?? 8;
  const ny = opts?.ny ?? 17;
  const tau = opts?.tau ?? 1;
  const gx = opts?.gx ?? 1e-4;
  const gy = opts?.gy ?? 0;
  const nCell = nx * ny;
  const f = new Float64Array(nCell * D2Q9_Q);
  const solid = new Uint8Array(nCell);
  for (let j = 0; j < ny; j++) {
    const isSolid = j === 0 || j === ny - 1;
    for (let i = 0; i < nx; i++) {
      const c = i + j * nx;
      solid[c] = isSolid ? 1 : 0;
      if (isSolid) continue;
      const base = c * D2Q9_Q;
      for (let q = 0; q < D2Q9_Q; q++) f[base + q] = equilibriumD2Q9(1, 0, 0, q);
    }
  }
  return {
    nx, ny, f, scratch: new Float64Array(nCell * D2Q9_Q), solid,
    tau, gx, gy, t: 0, steps: 0,
  };
}

export interface ChannelProfile {
  y: number;
  ux: number;
}

export function channelProfile(s: D2Q9State): ChannelProfile[] {
  const out: ChannelProfile[] = [];
  for (let j = 1; j < s.ny - 1; j++) {
    let ux = 0, n = 0;
    for (let i = 0; i < s.nx; i++) {
      if (s.solid[cell2(i, j, s.nx)]) continue;
      ux += momentsD2Q9(s, i, j).ux;
      n += 1;
    }
    out.push({ y: nodeY(j), ux: n ? ux / n : 0 });
  }
  return out;
}

export function channelUmax(s: D2Q9State): number {
  const jMid = Math.floor(s.ny / 2);
  let ux = 0, n = 0;
  for (let i = 0; i < s.nx; i++) {
    if (s.solid[cell2(i, jMid, s.nx)]) continue;
    ux += momentsD2Q9(s, i, jMid).ux;
    n += 1;
  }
  return n ? ux / n : 0;
}

export interface ChannelRun {
  umax: number;
  profile: ChannelProfile[];
  mass: number;
  mass0: number;
  H: number;
  nu: number;
  analyticUmax: number;
  steps: number;
  finite: boolean;
}

export function runChannel(opts: {
  nx?: number;
  ny?: number;
  tau: number;
  gx?: number;
  steps: number;
}): ChannelRun {
  const s = createChannel({ nx: opts.nx ?? 1, ny: opts.ny ?? DEMO_NY, tau: opts.tau, gx: opts.gx ?? DEMO_GX });
  const mass0 = massD2Q9(s);
  const H = channelHeight(s.ny);
  const nu = kinematicViscosity(s.tau);
  for (let k = 0; k < opts.steps; k++) {
    stepD2Q9(s);
    if (!isFiniteD2Q9(s)) {
      return {
        umax: NaN, profile: channelProfile(s), mass: massD2Q9(s), mass0,
        H, nu, analyticUmax: poiseuilleUmax(H, s.gx, nu), steps: s.steps, finite: false,
      };
    }
  }
  return {
    umax: channelUmax(s),
    profile: channelProfile(s),
    mass: massD2Q9(s),
    mass0,
    H,
    nu,
    analyticUmax: poiseuilleUmax(H, s.gx, nu),
    steps: s.steps,
    finite: true,
  };
}

/* Demo / widget constants. Low Mach: u / c_s ~ 0.03 at τ = 1. */
export const DEMO_NY = 17;
export const DEMO_TAU = 1;
export const DEMO_GX = 1e-4;
export const DEMO_STEPS = 5000;

let demoCache: ChannelRun | null = null;

export function demoPoiseuille(): ChannelRun {
  if (demoCache) return demoCache;
  demoCache = runChannel({ nx: 1, ny: DEMO_NY, tau: DEMO_TAU, gx: DEMO_GX, steps: DEMO_STEPS });
  return demoCache;
}

const umaxMemo = new Map<number, number>();

export function channelUmaxAtTau(tau: number): number {
  const key = Math.round(tau * 40) / 40;
  const hit = umaxMemo.get(key);
  if (hit !== undefined) return hit;
  const r = runChannel({ nx: 1, ny: 15, tau: key, gx: DEMO_GX, steps: 3500 });
  const u = r.finite ? r.umax : 0;
  umaxMemo.set(key, u);
  return u;
}

export function poiseuilleUmaxSweep(tMin: number, tMax: number, n: number): { tau: number; umax: number }[] {
  const out: { tau: number; umax: number }[] = [];
  for (let i = 0; i < n; i++) {
    const tau = tMin + ((tMax - tMin) * i) / (n - 1);
    out.push({ tau, umax: channelUmaxAtTau(tau) });
  }
  return out;
}

/** Sketch: u / u_max against y / H, walls included. */
export function poiseuilleSketchProfile(): { x: number; y: number }[] {
  const r = demoPoiseuille();
  const H = r.H;
  const umax = Math.max(r.umax, 1e-18);
  const pts = [{ x: 0, y: 0 }];
  for (const p of r.profile) pts.push({ x: p.y / H, y: p.ux / umax });
  pts.push({ x: 1, y: 0 });
  return pts;
}
