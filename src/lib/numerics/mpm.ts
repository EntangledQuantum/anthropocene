/* ─────────────────────────────────────────────────────────────────────────
   Material point method, explicit, 2D.

   Particles carry history (mass, velocity, deformation gradient). A
   background grid computes derivatives and takes the momentum step. The
   grid is then thrown away. That is the whole method.

   Transfers use bilinear hats (original MPM / PIC). The constitutive
   model is compressible neo-Hookean — one model, no plasticity.

   1D linear hats live here too: the two-particle, one-cell case the
   lesson asks you to compute by hand, and the PIC/FLIP energy numbers
   the estimate and tune widgets measure.
   ───────────────────────────────────────────────────────────────────────── */

const MASS_EPS = 1e-12;
const J_MIN = 0.15;

export type MpmPhase = 'p2g' | 'grid' | 'g2p';

export interface MpmParams {
  /** Cells per side. Nodes are n+1. */
  n: number;
  length: number;
  mu: number;
  lambda: number;
  gravity: number;
  dt: number;
  /** 0 = PIC, 1 = FLIP. */
  flip: number;
  /** If true, node positions snap back to the Cartesian lattice after G2P. */
  resetGrid: boolean;
  density: number;
}

export const DEFAULT_PARAMS: MpmParams = {
  n: 24,
  length: 1,
  mu: 8,
  lambda: 10,
  gravity: -6,
  dt: 0.0008,
  flip: 0.88,
  resetGrid: true,
  density: 1,
};

export interface MpmState {
  params: MpmParams;
  h: number;
  nNode: number;
  /** Current node positions — rest lattice if the grid is reset. */
  nodeX: Float64Array;
  nodeY: Float64Array;
  restX: Float64Array;
  restY: Float64Array;
  mass: Float64Array;
  vx: Float64Array;
  vy: Float64Array;
  vxOld: Float64Array;
  vyOld: Float64Array;
  fx: Float64Array;
  fy: Float64Array;

  np: number;
  px: Float64Array;
  py: Float64Array;
  pvx: Float64Array;
  pvy: Float64Array;
  pm: Float64Array;
  vol0: Float64Array;
  F00: Float64Array;
  F01: Float64Array;
  F10: Float64Array;
  F11: Float64Array;
  cellI: Int16Array;
  cellJ: Int16Array;

  t: number;
  steps: number;
  phase: MpmPhase;
  tangled: number;
  minDet: number;
}

export interface Particle1D {
  x: number;
  m: number;
  v: number;
}

/* ── 1D hats and the two-particle cell ─────────────────────────────────── */

/** Linear hat. Support is one cell on each side of the node. */
export function hat1d(x: number, nodeX: number, h: number): number {
  const d = Math.abs(x - nodeX) / h;
  return d < 1 ? 1 - d : 0;
}

/** The lesson's simplest useful case: one cell, two particles, opposite flight. */
export const OPPOSING_PAIR: { particles: Particle1D[]; nNodes: number; h: number } = {
  particles: [
    { x: 0.25, m: 1, v: 1 },
    { x: 0.75, m: 1, v: -1 },
  ],
  nNodes: 2,
  h: 1,
};

export function p2g1d(
  particles: Particle1D[],
  nNodes: number,
  h: number,
): { mass: Float64Array; momentum: Float64Array; velocity: Float64Array } {
  const mass = new Float64Array(nNodes);
  const momentum = new Float64Array(nNodes);
  for (const p of particles) {
    const i0 = Math.floor(p.x / h);
    for (const i of [i0, i0 + 1]) {
      if (i < 0 || i >= nNodes) continue;
      const w = hat1d(p.x, i * h, h);
      mass[i] += w * p.m;
      momentum[i] += w * p.m * p.v;
    }
  }
  const velocity = new Float64Array(nNodes);
  for (let i = 0; i < nNodes; i++) velocity[i] = mass[i] > MASS_EPS ? momentum[i] / mass[i] : 0;
  return { mass, momentum, velocity };
}

/** G2P. `velocity` is v^{n+1}; `velocityOld` is v^n on the grid (after P2G, before forces).
 *  With no grid forces they coincide, so FLIP (flip = 1) keeps the particle velocity. */
export function g2p1d(
  particles: Particle1D[],
  velocity: ArrayLike<number>,
  velocityOld: ArrayLike<number>,
  h: number,
  flip: number,
): Particle1D[] {
  return particles.map((p) => {
    const i0 = Math.floor(p.x / h);
    let vPic = 0;
    let dv = 0;
    for (const i of [i0, i0 + 1]) {
      if (i < 0 || i >= velocity.length) continue;
      const w = hat1d(p.x, i * h, h);
      vPic += w * velocity[i]!;
      dv += w * (velocity[i]! - velocityOld[i]!);
    }
    const vFlip = p.v + dv;
    return { ...p, v: (1 - flip) * vPic + flip * vFlip };
  });
}

export function kineticEnergy1d(particles: Particle1D[]): number {
  let k = 0;
  for (const p of particles) k += 0.5 * p.m * p.v * p.v;
  return k;
}

export function particleMass1d(particles: Particle1D[]): number {
  let m = 0;
  for (const p of particles) m += p.m;
  return m;
}

export function gridMass1d(mass: ArrayLike<number>): number {
  let m = 0;
  for (let i = 0; i < mass.length; i++) m += mass[i]!;
  return m;
}

/** P2G then G2P with no grid forces. The PIC/FLIP blend is the only degree of freedom. */
export function transferRoundTrip1d(
  particles: Particle1D[],
  nNodes: number,
  h: number,
  flip: number,
): { particles: Particle1D[]; mass: Float64Array; momentum: Float64Array; velocity: Float64Array } {
  const grid = p2g1d(particles, nNodes, h);
  const next = g2p1d(particles, grid.velocity, grid.velocity, h, flip);
  return { particles: next, ...grid };
}

export function opposingKeRemaining(flip: number): number {
  const { particles } = OPPOSING_PAIR;
  const k0 = kineticEnergy1d(particles);
  const next = transferRoundTrip1d(particles, OPPOSING_PAIR.nNodes, OPPOSING_PAIR.h, flip);
  return kineticEnergy1d(next.particles) / k0;
}

/** FLIP fraction at which the opposing pair keeps a given fraction of KE. */
export function flipWhereKeFraction(frac: number): number {
  let lo = 0;
  let hi = 1;
  for (let k = 0; k < 50; k++) {
    const mid = 0.5 * (lo + hi);
    if (opposingKeRemaining(mid) < frac) lo = mid;
    else hi = mid;
  }
  return 0.5 * (lo + hi);
}

/* ── neo-Hookean ───────────────────────────────────────────────────────── */

/** First Piola–Kirchhoff. P = μ (F − F^{−T}) + λ log(J) F^{−T}.
 *  J is clamped so a tangled cell cannot NaN the drop. */
export function pk1(
  F00: number, F01: number, F10: number, F11: number,
  mu: number, lambda: number,
): { P00: number; P01: number; P10: number; P11: number; J: number } {
  const Jraw = F00 * F11 - F01 * F10;
  const J = Jraw < J_MIN ? J_MIN : Jraw;
  const invT00 = F11 / J;
  const invT01 = -F10 / J;
  const invT10 = -F01 / J;
  const invT11 = F00 / J;
  const logJ = Math.log(J);
  return {
    P00: mu * (F00 - invT00) + lambda * logJ * invT00,
    P01: mu * (F01 - invT01) + lambda * logJ * invT01,
    P10: mu * (F10 - invT10) + lambda * logJ * invT10,
    P11: mu * (F11 - invT11) + lambda * logJ * invT11,
    J: Jraw,
  };
}

/** Ψ = (μ/2)(F:F − 2) − μ log J + (λ/2)(log J)², 2D. Zero at F = I. */
export function neoHookeanEnergy(
  F00: number, F01: number, F10: number, F11: number,
  mu: number, lambda: number,
): number {
  const Jraw = F00 * F11 - F01 * F10;
  const J = Jraw < J_MIN ? J_MIN : Jraw;
  const FF = F00 * F00 + F01 * F01 + F10 * F10 + F11 * F11;
  const logJ = Math.log(J);
  return 0.5 * mu * (FF - 2) - mu * logJ + 0.5 * lambda * logJ * logJ;
}

/* ── grid geometry ─────────────────────────────────────────────────────── */

export const nodeIndex = (i: number, j: number, nNode: number): number => i + j * nNode;

export function cellDet(
  nodeX: ArrayLike<number>, nodeY: ArrayLike<number>,
  i: number, j: number, nNode: number,
): number {
  const a = nodeIndex(i, j, nNode);
  const b = nodeIndex(i + 1, j, nNode);
  const c = nodeIndex(i, j + 1, nNode);
  const d = nodeIndex(i + 1, j + 1, nNode);
  // Two-triangle split of the quad. Negative means at least one triangle inverted.
  const t1 = (nodeX[b]! - nodeX[a]!) * (nodeY[c]! - nodeY[a]!)
           - (nodeY[b]! - nodeY[a]!) * (nodeX[c]! - nodeX[a]!);
  const t2 = (nodeX[d]! - nodeX[b]!) * (nodeY[c]! - nodeY[b]!)
           - (nodeY[d]! - nodeY[b]!) * (nodeX[c]! - nodeX[b]!);
  return Math.min(t1, t2);
}

export function gridHealth(s: MpmState): { minDet: number; tangled: number } {
  const { n } = s.params;
  const rest = s.h * s.h;
  let minDet = Infinity;
  let tangled = 0;
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const det = cellDet(s.nodeX, s.nodeY, i, j, s.nNode);
      if (det < minDet) minDet = det;
      if (det <= 0) tangled += 1;
    }
  }
  return { minDet: minDet / rest, tangled };
}

/* Inverse bilinear: world (px,py) → parent (ξ,η) of a possibly deformed quad. */
function inverseBilinear(
  px: number, py: number,
  x00: number, y00: number,
  x10: number, y10: number,
  x01: number, y01: number,
  x11: number, y11: number,
): { xi: number; eta: number; det: number } | null {
  let xi = 0.5;
  let eta = 0.5;
  let det = 0;
  for (let k = 0; k < 10; k++) {
    const a00 = (1 - xi) * (1 - eta);
    const a10 = xi * (1 - eta);
    const a01 = (1 - xi) * eta;
    const a11 = xi * eta;
    const x = a00 * x00 + a10 * x10 + a01 * x01 + a11 * x11;
    const y = a00 * y00 + a10 * y10 + a01 * y01 + a11 * y11;
    const dxdxi = (1 - eta) * (x10 - x00) + eta * (x11 - x01);
    const dxdeta = (1 - xi) * (x01 - x00) + xi * (x11 - x10);
    const dydxi = (1 - eta) * (y10 - y00) + eta * (y11 - y01);
    const dydeta = (1 - xi) * (y01 - y00) + xi * (y11 - y10);
    det = dxdxi * dydeta - dxdeta * dydxi;
    if (Math.abs(det) < 1e-18) return null;
    const rx = px - x;
    const ry = py - y;
    const dxi = (dydeta * rx - dxdeta * ry) / det;
    const deta = (-dydxi * rx + dxdxi * ry) / det;
    xi += dxi;
    eta += deta;
    if (dxi * dxi + deta * deta < 1e-16) break;
  }
  return { xi, eta, det };
}

interface NodeWeight {
  index: number;
  w: number;
  gx: number;
  gy: number;
}

function nodeWeights(s: MpmState, p: number): NodeWeight[] {
  const { n, resetGrid } = s.params;
  const h = s.h;
  const nNode = s.nNode;
  let i = s.cellI[p]!;
  let j = s.cellJ[p]!;
  let xi: number;
  let eta: number;

  if (resetGrid) {
    i = Math.floor(s.px[p]! / h);
    j = Math.floor(s.py[p]! / h);
    if (i < 0) i = 0;
    if (j < 0) j = 0;
    if (i > n - 1) i = n - 1;
    if (j > n - 1) j = n - 1;
    xi = s.px[p]! / h - i;
    eta = s.py[p]! / h - j;
    if (xi < 0) xi = 0;
    if (eta < 0) eta = 0;
    if (xi > 1) xi = 1;
    if (eta > 1) eta = 1;
  } else {
    const found = findDeformedCell(s, p);
    i = found.i;
    j = found.j;
    xi = found.xi;
    eta = found.eta;
  }

  s.cellI[p] = i;
  s.cellJ[p] = j;

  const i00 = nodeIndex(i, j, nNode);
  const i10 = nodeIndex(i + 1, j, nNode);
  const i01 = nodeIndex(i, j + 1, nNode);
  const i11 = nodeIndex(i + 1, j + 1, nNode);

  const w00 = (1 - xi) * (1 - eta);
  const w10 = xi * (1 - eta);
  const w01 = (1 - xi) * eta;
  const w11 = xi * eta;

  // Parent-space gradients, then push to world with J^{−T}.
  const gx00p = -(1 - eta);
  const gy00p = -(1 - xi);
  const gx10p = (1 - eta);
  const gy10p = -xi;
  const gx01p = -eta;
  const gy01p = (1 - xi);
  const gx11p = eta;
  const gy11p = xi;

  const x00 = s.nodeX[i00]!, y00 = s.nodeY[i00]!;
  const x10 = s.nodeX[i10]!, y10 = s.nodeY[i10]!;
  const x01 = s.nodeX[i01]!, y01 = s.nodeY[i01]!;
  const x11 = s.nodeX[i11]!, y11 = s.nodeY[i11]!;
  const dxdxi = (1 - eta) * (x10 - x00) + eta * (x11 - x01);
  const dxdeta = (1 - xi) * (x01 - x00) + xi * (x11 - x10);
  const dydxi = (1 - eta) * (y10 - y00) + eta * (y11 - y01);
  const dydeta = (1 - xi) * (y01 - y00) + xi * (y11 - y10);
  const det = dxdxi * dydeta - dxdeta * dydxi;
  const inv = Math.abs(det) < 1e-18 ? 0 : 1 / det;
  // J^{−T} = (1/det) [ dydeta, −dydxi; −dxdeta, dxdxi ]
  const a00 = dydeta * inv;
  const a01 = -dydxi * inv;
  const a10 = -dxdeta * inv;
  const a11 = dxdxi * inv;

  const push = (gxp: number, gyp: number): [number, number] => [
    a00 * gxp + a01 * gyp,
    a10 * gxp + a11 * gyp,
  ];

  const g00 = push(gx00p, gy00p);
  const g10 = push(gx10p, gy10p);
  const g01 = push(gx01p, gy01p);
  const g11 = push(gx11p, gy11p);

  return [
    { index: i00, w: w00, gx: g00[0], gy: g00[1] },
    { index: i10, w: w10, gx: g10[0], gy: g10[1] },
    { index: i01, w: w01, gx: g01[0], gy: g01[1] },
    { index: i11, w: w11, gx: g11[0], gy: g11[1] },
  ];
}

function findDeformedCell(s: MpmState, p: number): { i: number; j: number; xi: number; eta: number } {
  const { n } = s.params;
  const nNode = s.nNode;
  const px = s.px[p]!;
  const py = s.py[p]!;
  const guesses: [number, number][] = [];
  const gi = Math.max(0, Math.min(n - 1, s.cellI[p]!));
  const gj = Math.max(0, Math.min(n - 1, s.cellJ[p]!));
  const ci = Math.max(0, Math.min(n - 1, Math.floor(px / s.h)));
  const cj = Math.max(0, Math.min(n - 1, Math.floor(py / s.h)));
  guesses.push([gi, gj], [ci, cj]);
  for (let dj = -2; dj <= 2; dj++) {
    for (let di = -2; di <= 2; di++) {
      const i = gi + di;
      const j = gj + dj;
      if (i < 0 || j < 0 || i >= n || j >= n) continue;
      guesses.push([i, j]);
    }
  }

  let best = { i: gi, j: gj, xi: 0.5, eta: 0.5, score: Infinity };
  const seen = new Set<number>();
  for (const [i, j] of guesses) {
    const key = i + j * n;
    if (seen.has(key)) continue;
    seen.add(key);
    const a = nodeIndex(i, j, nNode);
    const b = nodeIndex(i + 1, j, nNode);
    const c = nodeIndex(i, j + 1, nNode);
    const d = nodeIndex(i + 1, j + 1, nNode);
    const inv = inverseBilinear(
      px, py,
      s.nodeX[a]!, s.nodeY[a]!,
      s.nodeX[b]!, s.nodeY[b]!,
      s.nodeX[c]!, s.nodeY[c]!,
      s.nodeX[d]!, s.nodeY[d]!,
    );
    if (!inv) continue;
    const score = Math.max(
      inv.xi < 0 ? -inv.xi : inv.xi - 1,
      inv.eta < 0 ? -inv.eta : inv.eta - 1,
      0,
    );
    if (score < best.score) best = { i, j, xi: inv.xi, eta: inv.eta, score };
    if (score === 0) break;
  }
  return {
    i: best.i,
    j: best.j,
    xi: Math.min(1, Math.max(0, best.xi)),
    eta: Math.min(1, Math.max(0, best.eta)),
  };
}

/* ── state construction ────────────────────────────────────────────────── */

function allocParticles(capacity: number) {
  const F00 = new Float64Array(capacity);
  const F11 = new Float64Array(capacity);
  F00.fill(1);
  F11.fill(1);
  return {
    np: 0,
    px: new Float64Array(capacity),
    py: new Float64Array(capacity),
    pvx: new Float64Array(capacity),
    pvy: new Float64Array(capacity),
    pm: new Float64Array(capacity),
    vol0: new Float64Array(capacity),
    F00,
    F01: new Float64Array(capacity),
    F10: new Float64Array(capacity),
    F11,
    cellI: new Int16Array(capacity),
    cellJ: new Int16Array(capacity),
  };
}

function allocGrid(n: number, length: number) {
  const nNode = n + 1;
  const h = length / n;
  const nodeX = new Float64Array(nNode * nNode);
  const nodeY = new Float64Array(nNode * nNode);
  const restX = new Float64Array(nNode * nNode);
  const restY = new Float64Array(nNode * nNode);
  for (let j = 0; j < nNode; j++) {
    for (let i = 0; i < nNode; i++) {
      const k = nodeIndex(i, j, nNode);
      restX[k] = nodeX[k] = i * h;
      restY[k] = nodeY[k] = j * h;
    }
  }
  const N = nNode * nNode;
  return {
    h, nNode, nodeX, nodeY, restX, restY,
    mass: new Float64Array(N),
    vx: new Float64Array(N),
    vy: new Float64Array(N),
    vxOld: new Float64Array(N),
    vyOld: new Float64Array(N),
    fx: new Float64Array(N),
    fy: new Float64Array(N),
  };
}

export function emptyMpm(partial: Partial<MpmParams> = {}, np = 0): MpmState {
  const params: MpmParams = { ...DEFAULT_PARAMS, ...partial };
  const grid = allocGrid(params.n, params.length);
  const parts = allocParticles(np);
  return {
    params,
    ...grid,
    ...parts,
    t: 0,
    steps: 0,
    phase: 'p2g',
    tangled: 0,
    minDet: 1,
  };
}

export function addParticle(
  s: MpmState,
  p: { x: number; y: number; vx?: number; vy?: number; m: number; vol0: number },
): void {
  const i = s.np;
  if (i >= s.px.length) throw new Error('addParticle: no free slot');
  s.px[i] = p.x;
  s.py[i] = p.y;
  s.pvx[i] = p.vx ?? 0;
  s.pvy[i] = p.vy ?? 0;
  s.pm[i] = p.m;
  s.vol0[i] = p.vol0;
  s.F00[i] = 1;
  s.F01[i] = 0;
  s.F10[i] = 0;
  s.F11[i] = 1;
  s.cellI[i] = Math.max(0, Math.min(s.params.n - 1, Math.floor(p.x / s.h)));
  s.cellJ[i] = Math.max(0, Math.min(s.params.n - 1, Math.floor(p.y / s.h)));
  s.np = i + 1;
}

/** A rectangle of material, `ppc`×`ppc` particles per cell, at rest. */
export function createDrop(partial: Partial<MpmParams> & {
  x0?: number; x1?: number; y0?: number; y1?: number; ppc?: number;
} = {}): MpmState {
  const params: MpmParams = { ...DEFAULT_PARAMS, ...partial };
  const x0 = partial.x0 ?? 0.32;
  const x1 = partial.x1 ?? 0.68;
  const y0 = partial.y0 ?? 0.52;
  const y1 = partial.y1 ?? 0.88;
  const ppc = partial.ppc ?? 2;
  const h = params.length / params.n;
  const nx = Math.max(1, Math.round((x1 - x0) / h * ppc));
  const ny = Math.max(1, Math.round((y1 - y0) / h * ppc));
  const np = nx * ny;
  const s = emptyMpm(params, np);
  const dx = (x1 - x0) / nx;
  const dy = (y1 - y0) / ny;
  const vol0 = dx * dy;
  const m = params.density * vol0;
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      addParticle(s, {
        x: x0 + (i + 0.5) * dx,
        y: y0 + (j + 0.5) * dy,
        m,
        vol0,
      });
    }
  }
  return s;
}

/* ── the three beats of a step ─────────────────────────────────────────── */

export function p2g(s: MpmState): void {
  s.mass.fill(0);
  s.vx.fill(0);
  s.vy.fill(0);
  s.fx.fill(0);
  s.fy.fill(0);

  const { mu, lambda } = s.params;

  for (let p = 0; p < s.np; p++) {
    const nodes = nodeWeights(s, p);
    const P = pk1(s.F00[p]!, s.F01[p]!, s.F10[p]!, s.F11[p]!, mu, lambda);
    const m = s.pm[p]!;
    const vol0 = s.vol0[p]!;
    const vx = s.pvx[p]!;
    const vy = s.pvy[p]!;
    for (const n of nodes) {
      s.mass[n.index] += n.w * m;
      s.vx[n.index] += n.w * m * vx;
      s.vy[n.index] += n.w * m * vy;
      // f_i = − Σ_p V0 P ∇N_i
      s.fx[n.index] -= vol0 * (P.P00 * n.gx + P.P01 * n.gy);
      s.fy[n.index] -= vol0 * (P.P10 * n.gx + P.P11 * n.gy);
    }
  }

  const N = s.nNode * s.nNode;
  for (let i = 0; i < N; i++) {
    if (s.mass[i]! > MASS_EPS) {
      s.vx[i] /= s.mass[i]!;
      s.vy[i] /= s.mass[i]!;
      s.fy[i] += s.mass[i]! * s.params.gravity;
    } else {
      s.vx[i] = 0;
      s.vy[i] = 0;
    }
    s.vxOld[i] = s.vx[i]!;
    s.vyOld[i] = s.vy[i]!;
  }
  s.phase = 'grid';
}

export function gridUpdate(s: MpmState): void {
  const { dt, n } = s.params;
  const nNode = s.nNode;
  const N = nNode * nNode;
  for (let i = 0; i < N; i++) {
    if (s.mass[i]! > MASS_EPS) {
      s.vx[i] += dt * s.fx[i]! / s.mass[i]!;
      s.vy[i] += dt * s.fy[i]! / s.mass[i]!;
    } else {
      s.vx[i] = 0;
      s.vy[i] = 0;
    }
  }
  // Sticky walls: every boundary node.
  for (let j = 0; j < nNode; j++) {
    for (let i = 0; i < nNode; i++) {
      if (i === 0 || j === 0 || i === n || j === n) {
        const k = nodeIndex(i, j, nNode);
        s.vx[k] = 0;
        s.vy[k] = 0;
      }
    }
  }
  s.phase = 'g2p';
}

export function g2p(s: MpmState): void {
  const { dt, flip, resetGrid, length } = s.params;
  const pad = 0.002 * length;

  for (let p = 0; p < s.np; p++) {
    const nodes = nodeWeights(s, p);
    let vPicX = 0, vPicY = 0;
    let dvx = 0, dvy = 0;
    let gxx = 0, gxy = 0, gyx = 0, gyy = 0;
    for (const n of nodes) {
      const vx = s.vx[n.index]!;
      const vy = s.vy[n.index]!;
      vPicX += n.w * vx;
      vPicY += n.w * vy;
      dvx += n.w * (vx - s.vxOld[n.index]!);
      dvy += n.w * (vy - s.vyOld[n.index]!);
      gxx += vx * n.gx;
      gxy += vx * n.gy;
      gyx += vy * n.gx;
      gyy += vy * n.gy;
    }
    const vFlipX = s.pvx[p]! + dvx;
    const vFlipY = s.pvy[p]! + dvy;
    s.pvx[p] = (1 - flip) * vPicX + flip * vFlipX;
    s.pvy[p] = (1 - flip) * vPicY + flip * vFlipY;

    // Positions follow the grid velocity so they stay consistent with the mesh.
    s.px[p] += dt * vPicX;
    s.py[p] += dt * vPicY;
    if (s.px[p]! < pad) { s.px[p] = pad; s.pvx[p] = 0; }
    if (s.py[p]! < pad) { s.py[p] = pad; s.pvy[p] = 0; }
    if (s.px[p]! > length - pad) { s.px[p] = length - pad; s.pvx[p] = 0; }
    if (s.py[p]! > length - pad) { s.py[p] = length - pad; s.pvy[p] = 0; }

    // F ← (I + dt ∇v) F
    const a00 = 1 + dt * gxx, a01 = dt * gxy;
    const a10 = dt * gyx,     a11 = 1 + dt * gyy;
    const F00 = s.F00[p]!, F01 = s.F01[p]!, F10 = s.F10[p]!, F11 = s.F11[p]!;
    s.F00[p] = a00 * F00 + a01 * F10;
    s.F01[p] = a00 * F01 + a01 * F11;
    s.F10[p] = a10 * F00 + a11 * F10;
    s.F11[p] = a10 * F01 + a11 * F11;
    const J = s.F00[p]! * s.F11[p]! - s.F01[p]! * s.F10[p]!;
    if (!Number.isFinite(J) || J < 0.25 || J > 5) {
      s.F00[p] = 1; s.F01[p] = 0; s.F10[p] = 0; s.F11[p] = 1;
      s.pvx[p] *= 0.5;
      s.pvy[p] *= 0.5;
    }
    const sp = Math.hypot(s.pvx[p]!, s.pvy[p]!);
    if (sp > 12) {
      s.pvx[p] *= 12 / sp;
      s.pvy[p] *= 12 / sp;
    }
  }

  if (resetGrid) {
    s.nodeX.set(s.restX);
    s.nodeY.set(s.restY);
  } else {
    const N = s.nNode * s.nNode;
    for (let i = 0; i < N; i++) {
      if (s.mass[i]! > MASS_EPS) {
        s.nodeX[i] += dt * s.vx[i]!;
        s.nodeY[i] += dt * s.vy[i]!;
      }
    }
  }

  const health = gridHealth(s);
  s.minDet = health.minDet;
  s.tangled = health.tangled;
  s.t += dt;
  s.steps += 1;
  s.phase = 'p2g';
}

export function stepMpm(s: MpmState): void {
  p2g(s);
  gridUpdate(s);
  g2p(s);
}

export function stepPhase(s: MpmState): MpmPhase {
  if (s.phase === 'p2g') p2g(s);
  else if (s.phase === 'grid') gridUpdate(s);
  else g2p(s);
  return s.phase;
}

/* ── observables ───────────────────────────────────────────────────────── */

export function particleMass(s: MpmState): number {
  let m = 0;
  for (let p = 0; p < s.np; p++) m += s.pm[p]!;
  return m;
}

export function gridMass(s: MpmState): number {
  let m = 0;
  for (let i = 0; i < s.mass.length; i++) m += s.mass[i]!;
  return m;
}

export function particleMomentum(s: MpmState): { px: number; py: number } {
  let px = 0, py = 0;
  for (let p = 0; p < s.np; p++) {
    px += s.pm[p]! * s.pvx[p]!;
    py += s.pm[p]! * s.pvy[p]!;
  }
  return { px, py };
}

export function gridMomentum(s: MpmState): { px: number; py: number } {
  let px = 0, py = 0;
  for (let i = 0; i < s.mass.length; i++) {
    px += s.mass[i]! * s.vx[i]!;
    py += s.mass[i]! * s.vy[i]!;
  }
  return { px, py };
}

export function kineticEnergy(s: MpmState): number {
  let k = 0;
  for (let p = 0; p < s.np; p++) {
    k += 0.5 * s.pm[p]! * (s.pvx[p]! * s.pvx[p]! + s.pvy[p]! * s.pvy[p]!);
  }
  return k;
}

export function elasticEnergy(s: MpmState): number {
  const { mu, lambda } = s.params;
  let e = 0;
  for (let p = 0; p < s.np; p++) {
    e += s.vol0[p]! * neoHookeanEnergy(s.F00[p]!, s.F01[p]!, s.F10[p]!, s.F11[p]!, mu, lambda);
  }
  return e;
}

export function gravityEnergy(s: MpmState): number {
  const g = s.params.gravity;
  let e = 0;
  for (let p = 0; p < s.np; p++) e += -s.pm[p]! * g * s.py[p]!;
  return e;
}

export function strainFrobenius(s: MpmState, p: number): number {
  const d00 = s.F00[p]! - 1, d01 = s.F01[p]!;
  const d10 = s.F10[p]!,     d11 = s.F11[p]! - 1;
  return Math.hypot(d00, d01, d10, d11);
}

export function isFiniteState(s: MpmState): boolean {
  for (let p = 0; p < s.np; p++) {
    if (!Number.isFinite(s.px[p]!) || !Number.isFinite(s.py[p]!)) return false;
    if (!Number.isFinite(s.pvx[p]!) || !Number.isFinite(s.pvy[p]!)) return false;
    if (!Number.isFinite(s.F00[p]!) || !Number.isFinite(s.F11[p]!)) return false;
  }
  return true;
}

/** Four hat weights of particle `p`, for the transfer close-up. */
export function transferOf(s: MpmState, p: number): NodeWeight[] {
  return nodeWeights(s, p);
}

/** Shift a column of nodes. Crossing a neighbour inverts the quads — the keep-mesh failure. */
export function shiftColumn(s: MpmState, i: number, dx: number, dy = 0): void {
  for (let j = 0; j < s.nNode; j++) {
    const k = nodeIndex(i, j, s.nNode);
    s.nodeX[k] += dx;
    s.nodeY[k] += dy;
  }
}
