import { describe, expect, it } from 'vitest';
import {
  EXP, errorSweep, ghostFromBc, interiorTruncation, maxAbsError, neumannGhostTarget,
  neumannWallResidualOnExact, nodeGrid, observedOrder, residualWithTrialGhost,
  solveError, solvePoisson, wallTruncation,
} from '../stencil-bc.ts';

const ORDER_TOL = 0.35;

describe('ghost Neumann restores order 2; naive one-sided is order 1', () => {
  it('ghost Neumann on exp is second order', () => {
    const p = observedOrder(16, 'neumann', 'ghost');
    expect(p).toBeGreaterThan(2 - ORDER_TOL);
    expect(p).toBeLessThan(2 + ORDER_TOL);
  });

  it('naive one-sided Neumann on exp is first order', () => {
    const p = observedOrder(16, 'neumann', 'naive');
    expect(p).toBeGreaterThan(1 - ORDER_TOL);
    expect(p).toBeLessThan(1 + ORDER_TOL);
  });

  it('at the same mesh, the ghost solve is much more accurate than naive', () => {
    const naive = solveError(32, 'neumann', 'naive');
    const ghost = solveError(32, 'neumann', 'ghost');
    expect(naive).toBeGreaterThan(ghost * 8);
  });

  it('halving h drops ghost error ~4× and naive error ~2×', () => {
    const g16 = solveError(16, 'neumann', 'ghost');
    const g32 = solveError(32, 'neumann', 'ghost');
    const n16 = solveError(16, 'neumann', 'naive');
    const n32 = solveError(32, 'neumann', 'naive');
    expect(g16 / g32).toBeGreaterThan(3);
    expect(n16 / n32).toBeGreaterThan(1.6);
    expect(n16 / n32).toBeLessThan(2.6);
  });
});

describe('Dirichlet: the wall value is the missing neighbour', () => {
  it('ghost (standard) Dirichlet is second order', () => {
    const p = observedOrder(16, 'dirichlet', 'ghost');
    expect(p).toBeGreaterThan(2 - ORDER_TOL);
    expect(p).toBeLessThan(2 + ORDER_TOL);
  });

  it('skipping the wall value solves the wrong BVP — error does not vanish with h', () => {
    const coarse = solveError(8, 'dirichlet', 'naive');
    const fine = solveError(32, 'dirichlet', 'naive');
    // Homogeneous wall on a field with u(0) = 1. Refining cannot fix the data.
    expect(coarse).toBeGreaterThan(0.3);
    expect(fine).toBeGreaterThan(0.3);
    expect(fine).toBeGreaterThan(solveError(32, 'dirichlet', 'ghost') * 50);
  });

  it('using the wall value is much more accurate than skipping it, at the same n', () => {
    const naive = solveError(24, 'dirichlet', 'naive');
    const ghost = solveError(24, 'dirichlet', 'ghost');
    expect(naive).toBeGreaterThan(ghost * 8);
  });
});

describe('the ghost encodes the boundary condition', () => {
  it('Neumann ghost is u_1 − 2 h σ', () => {
    const h = 0.1;
    const u1 = Math.exp(h);
    const sigma = 1;
    expect(ghostFromBc('neumann', u1, h, sigma)).toBeCloseTo(u1 - 2 * h * sigma, 12);
  });

  it('Dirichlet ghost is the odd reflection 2α − u_1', () => {
    expect(ghostFromBc('dirichlet', 3, 0.25, 1)).toBeCloseTo(-1, 12);
  });

  it('the discrete Neumann ghost sits close to the analytic extension', () => {
    const n = 20;
    const h = 1 / n;
    const ghost = neumannGhostTarget(n);
    expect(Math.abs(ghost - Math.exp(-h))).toBeLessThan(0.01);
  });

  it('a wrong Neumann ghost leaves a huge wall residual; the encoding ghost does not', () => {
    const n = 12;
    const target = neumannGhostTarget(n);
    const right = Math.abs(neumannWallResidualOnExact(n, target));
    const wrong = Math.abs(neumannWallResidualOnExact(n, 0));
    expect(wrong).toBeGreaterThan(right * 10);
  });

  it('naive Neumann wall truncation on the exact field is O(h)', () => {
    const n8 = wallTruncation(8, 'neumann', 'naive');
    const n16 = wallTruncation(16, 'neumann', 'naive');
    expect(n8 / n16).toBeGreaterThan(1.6);
    expect(n8 / n16).toBeLessThan(2.6);
  });

  it('interior truncation of the centred stencil is second order', () => {
    const e8 = interiorTruncation(8);
    const e16 = interiorTruncation(16);
    expect(Math.log2(e8 / e16)).toBeGreaterThan(1.7);
  });
});

describe('solve recovers a manufactured field', () => {
  it('Dirichlet ghost on a coarse mesh is already close', () => {
    const run = solvePoisson({
      n: 32, left: 'dirichlet', method: 'ghost',
      leftValue: EXP.u(0), rightValue: EXP.u(1), f: EXP.d2,
    });
    expect(maxAbsError(run.u, run.x, EXP.u)).toBeLessThan(1e-3);
    expect(run.u[0]).toBeCloseTo(1, 12);
    expect(run.u[run.n]).toBeCloseTo(Math.E, 12);
    expect(run.ghost).toBeNull();
  });

  it('Neumann ghost matches u(0) of exp, not some other intercept', () => {
    const run = solvePoisson({
      n: 40, left: 'neumann', method: 'ghost',
      leftValue: EXP.du(0), rightValue: EXP.u(1), f: EXP.d2,
    });
    expect(run.u[0]).toBeCloseTo(1, 2);
    expect(maxAbsError(run.u, run.x, EXP.u)).toBeLessThan(2e-3);
  });

  it('the stored ghost equals the formula on the computed neighbour', () => {
    const run = solvePoisson({
      n: 12, left: 'neumann', method: 'ghost',
      leftValue: 1, rightValue: Math.E, f: Math.exp,
    });
    expect(run.ghost).not.toBeNull();
    expect(run.ghost!).toBeCloseTo(ghostFromBc('neumann', run.u[1]!, run.h, 1), 12);
  });

  it('naive Neumann has no ghost', () => {
    const run = solvePoisson({
      n: 8, left: 'neumann', method: 'naive',
      leftValue: 1, rightValue: Math.E, f: Math.exp,
    });
    expect(run.ghost).toBeNull();
  });
});

describe('error sweep is monotone in h for both wall treatments', () => {
  it('both methods improve as n grows, and ghost stays ahead', () => {
    const ns = [8, 16, 32];
    const g = errorSweep(ns, 'neumann', 'ghost');
    const n = errorSweep(ns, 'neumann', 'naive');
    for (let i = 1; i < ns.length; i++) {
      expect(g[i]!.error).toBeLessThan(g[i - 1]!.error);
      expect(n[i]!.error).toBeLessThan(n[i - 1]!.error);
      expect(g[i]!.error).toBeLessThan(n[i]!.error);
    }
  });
});

describe('hunting the ghost: residual on the exact field', () => {
  it('the Neumann target zeros the leading wall residual compared to a wrong guess', () => {
    const n = 10;
    const target = neumannGhostTarget(n);
    const at = Math.abs(neumannWallResidualOnExact(n, target));
    const off = Math.abs(neumannWallResidualOnExact(n, target + 0.4));
    expect(off).toBeGreaterThan(at * 8);
  });

  it('residualWithTrialGhost is linear in the ghost and smallest at the encoding value', () => {
    const n = 8;
    const target = neumannGhostTarget(n);
    const a = residualWithTrialGhost(n, target);
    const b = residualWithTrialGhost(n, target + 0.1);
    const c = residualWithTrialGhost(n, target - 0.1);
    expect(Math.abs(a.wall)).toBeLessThan(Math.abs(b.wall));
    expect(Math.abs(a.wall)).toBeLessThan(Math.abs(c.wall));
    const h = 1 / n;
    expect(b.wall - a.wall).toBeCloseTo(0.1 / (h * h), 8);
    for (let i = 1; i < n; i++) {
      expect(a.residual[i]).toBeCloseTo(b.residual[i]!, 12);
    }
  });

  it('nodeGrid has n+1 nodes and ends at 0 and 1', () => {
    const { x, h } = nodeGrid(8);
    expect(x).toHaveLength(9);
    expect(x[0]).toBe(0);
    expect(x[8]).toBeCloseTo(1, 12);
    expect(h).toBeCloseTo(0.125, 12);
  });
});
