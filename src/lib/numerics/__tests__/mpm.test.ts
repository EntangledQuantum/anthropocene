import { describe, expect, it } from 'vitest';
import {
  OPPOSING_PAIR,
  addParticle,
  createDrop,
  emptyMpm,
  flipWhereKeFraction,
  g2p,
  gridMass,
  gridMomentum,
  hat1d,
  isFiniteState,
  kineticEnergy1d,
  opposingKeRemaining,
  p2g,
  p2g1d,
  particleMass,
  particleMass1d,
  particleMomentum,
  pk1,
  shiftColumn,
  stepMpm,
  transferRoundTrip1d,
  gridHealth,
} from '../mpm.ts';

describe('1D linear hats', () => {
  it('partition of unity inside a cell', () => {
    const h = 1;
    for (const x of [0, 0.25, 0.5, 0.75, 0.999]) {
      expect(hat1d(x, 0, h) + hat1d(x, h, h)).toBeCloseTo(1, 12);
    }
  });

  it('is 1 on its node and 0 on the neighbour', () => {
    expect(hat1d(0, 0, 1)).toBeCloseTo(1, 12);
    expect(hat1d(0, 1, 1)).toBeCloseTo(0, 12);
    expect(hat1d(0.5, 0, 1)).toBeCloseTo(0.5, 12);
  });
});

describe('two-particle P2G / G2P in one cell', () => {
  const { particles, nNodes, h } = OPPOSING_PAIR;

  it('P2G conserves mass and momentum', () => {
    const grid = p2g1d(particles, nNodes, h);
    expect(grid.mass[0] + grid.mass[1]).toBeCloseTo(particleMass1d(particles), 12);
    expect(grid.momentum[0] + grid.momentum[1]).toBeCloseTo(
      particles[0]!.m * particles[0]!.v + particles[1]!.m * particles[1]!.v,
      12,
    );
    // The hand calculation: m_i = 1, v = ±1/2.
    expect(grid.mass[0]).toBeCloseTo(1, 12);
    expect(grid.mass[1]).toBeCloseTo(1, 12);
    expect(grid.velocity[0]).toBeCloseTo(0.5, 12);
    expect(grid.velocity[1]).toBeCloseTo(-0.5, 12);
  });

  it('PIC scatter-gather leaves KE = 1/16 of the opposing pair', () => {
    expect(kineticEnergy1d(particles)).toBeCloseTo(1, 12);
    expect(opposingKeRemaining(0)).toBeCloseTo(0.0625, 12);
    const pic = transferRoundTrip1d(particles, nNodes, h, 0);
    expect(pic.particles[0]!.v).toBeCloseTo(0.25, 12);
    expect(pic.particles[1]!.v).toBeCloseTo(-0.25, 12);
  });

  it('FLIP with no grid forces keeps the particle velocities, so KE is unchanged', () => {
    expect(opposingKeRemaining(1)).toBeCloseTo(1, 12);
  });

  it('particle mass is untouched by the round trip', () => {
    const next = transferRoundTrip1d(particles, nNodes, h, 0.4);
    expect(particleMass1d(next.particles)).toBeCloseTo(2, 12);
  });

  it('the FLIP fraction that keeps half the KE sits near 0.61', () => {
    const a = flipWhereKeFraction(0.5);
    expect(opposingKeRemaining(a)).toBeCloseTo(0.5, 8);
    expect(a).toBeGreaterThan(0.5);
    expect(a).toBeLessThan(0.7);
  });
});

describe('neo-Hookean PK1', () => {
  it('vanishes at F = I', () => {
    const P = pk1(1, 0, 0, 1, 15, 15);
    expect(P.P00).toBeCloseTo(0, 12);
    expect(P.P01).toBeCloseTo(0, 12);
    expect(P.P10).toBeCloseTo(0, 12);
    expect(P.P11).toBeCloseTo(0, 12);
    expect(P.J).toBeCloseTo(1, 12);
  });
});

describe('2D two-particle transfer', () => {
  it('a particle on a node sends all mass there and PIC recovers v', () => {
    const s = emptyMpm({ n: 4, length: 1, gravity: 0, dt: 0.001, flip: 0, resetGrid: true }, 1);
    const h = s.h;
    addParticle(s, { x: 2 * h, y: 2 * h, vx: 1.2, vy: -0.4, m: 3, vol0: h * h });
    p2g(s);
    expect(gridMass(s)).toBeCloseTo(3, 10);
    expect(particleMass(s)).toBeCloseTo(3, 12);
    const gm = gridMomentum(s);
    const pm = particleMomentum(s);
    expect(gm.px).toBeCloseTo(pm.px, 10);
    expect(gm.py).toBeCloseTo(pm.py, 10);
    // Exactly on node (2,2).
    const k = 2 + 2 * s.nNode;
    expect(s.mass[k]).toBeCloseTo(3, 10);
    expect(s.vx[k]).toBeCloseTo(1.2, 10);
    expect(s.vy[k]).toBeCloseTo(-0.4, 10);
    // Grid update with no gravity, then PIC G2P.
    s.params.gravity = 0;
    for (let i = 0; i < s.fx.length; i++) { s.fx[i] = 0; s.fy[i] = 0; }
    // skip gridUpdate forces: velocities already set
    s.phase = 'g2p';
    g2p(s);
    expect(s.pvx[0]).toBeCloseTo(1.2, 8);
    expect(s.pvy[0]).toBeCloseTo(-0.4, 8);
    expect(particleMass(s)).toBeCloseTo(3, 12);
  });

  it('two particles in one cell: P2G mass equals particle mass', () => {
    const s = emptyMpm({ n: 4, length: 1, gravity: 0, flip: 0, resetGrid: true }, 2);
    const h = s.h;
    addParticle(s, { x: 1.25 * h, y: 1.25 * h, vx: 0.8, vy: 0.1, m: 1.5, vol0: (h * h) / 4 });
    addParticle(s, { x: 1.75 * h, y: 1.65 * h, vx: -0.4, vy: 0.3, m: 2.5, vol0: (h * h) / 4 });
    p2g(s);
    expect(gridMass(s)).toBeCloseTo(particleMass(s), 10);
    const gm = gridMomentum(s);
    const pm = particleMomentum(s);
    expect(gm.px).toBeCloseTo(pm.px, 10);
    expect(gm.py).toBeCloseTo(pm.py, 10);
  });
});

describe('reset grid vs keep-the-mesh', () => {
  it('a Cartesian cell has positive Jacobian; a sheared-through cell does not', () => {
    const s = emptyMpm({ n: 4, length: 1, resetGrid: false }, 0);
    const rest = gridHealth(s);
    expect(rest.tangled).toBe(0);
    expect(rest.minDet).toBeGreaterThan(0.9);
    // Pull one interior column past its neighbour — a classic inverted quad.
    shiftColumn(s, 2, 3 * s.h);
    const hurt = gridHealth(s);
    expect(hurt.minDet).toBeLessThanOrEqual(0);
    expect(hurt.tangled).toBeGreaterThan(0);
  });

  it('a reset-grid drop stays finite and conserves particle mass', () => {
    const s = createDrop({
      n: 8, length: 1, gravity: -6, dt: 0.002, flip: 0.85, resetGrid: true,
      ppc: 2, x0: 0.3, x1: 0.7, y0: 0.45, y1: 0.8,
    });
    const m0 = particleMass(s);
    for (let k = 0; k < 80; k++) stepMpm(s);
    expect(isFiniteState(s)).toBe(true);
    expect(particleMass(s)).toBeCloseTo(m0, 10);
    p2g(s);
    expect(gridMass(s)).toBeCloseTo(m0, 8);
    expect(s.tangled).toBe(0);
    expect(s.minDet).toBeGreaterThan(0.5);
  });

  it('keeping the mesh inverts cells; resetting it does not', () => {
    const keep = createDrop({
      n: 12, resetGrid: false, flip: 0.88, gravity: -6, dt: 0.0008, ppc: 2,
      x0: 0.3, x1: 0.7, y0: 0.5, y1: 0.85,
    });
    const reset = createDrop({
      n: 12, resetGrid: true, flip: 0.88, gravity: -6, dt: 0.0008, ppc: 2,
      x0: 0.3, x1: 0.7, y0: 0.5, y1: 0.85,
    });
    for (let k = 0; k < 280; k++) {
      stepMpm(keep);
      stepMpm(reset);
    }
    expect(isFiniteState(keep)).toBe(true);
    expect(isFiniteState(reset)).toBe(true);
    expect(keep.tangled).toBeGreaterThan(0);
    expect(keep.minDet).toBeLessThanOrEqual(0);
    expect(reset.tangled).toBe(0);
    expect(reset.minDet).toBeGreaterThan(0.5);
  });
});
