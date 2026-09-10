import { describe, expect, it } from 'vitest';
import {
  localOrder,
  manufactured,
  mmsErrorDrop,
  observedOrder,
  observedResidualOrder,
  residualSweep,
  runVv,
  runVvMatched,
  spatialResidual,
  vvSweep,
} from '../vv.ts';
import { maxAbs } from '../pde1d.ts';

const ORDER_TOL = 0.35;

describe('MMS recovers the design order of heat FTCS', () => {
  it('spatial residual of the 3-point Laplacian on û is second order', () => {
    const p = observedResidualOrder(1, 1);
    expect(p).toBeGreaterThan(2 - ORDER_TOL);
    expect(p).toBeLessThan(2 + ORDER_TOL);
  });

  it('halving dx drops the residual by about 4×', () => {
    const a = spatialResidual(32).l2;
    const b = spatialResidual(64).l2;
    expect(a / b).toBeGreaterThan(3.5);
    expect(a / b).toBeLessThan(4.5);
  });

  it('time-integrated MMS error vs û is second order with r held fixed', () => {
    const sweep = vvSweep('mms');
    const p = observedOrder(sweep);
    expect(p).toBeGreaterThan(2 - ORDER_TOL);
    expect(p).toBeLessThan(2 + ORDER_TOL);
    for (const pt of sweep) {
      expect(pt.error).toBeGreaterThan(0);
      expect(Number.isFinite(pt.error)).toBe(true);
    }
  });

  it('doubling n drops MMS solution error by about 4×', () => {
    const drop = mmsErrorDrop(32);
    expect(drop).toBeGreaterThan(3.2);
    expect(drop).toBeLessThan(5.2);
    expect(localOrder('mms', 32)).toBeGreaterThan(1.6);
  });

  it('MMS with the source matched to α = 1/2 still recovers order 2', () => {
    const ns = [24, 32, 48, 64];
    const pts = ns.map((n) => {
      const run = runVvMatched(n, 0.5);
      expect(run.diverged).toBe(false);
      return { dx: run.dx, error: run.error };
    });
    const p = observedOrder(pts);
    expect(p).toBeGreaterThan(2 - ORDER_TOL);
    expect(p).toBeLessThan(2 + ORDER_TOL);
  });
});

describe('a wrong stencil still looks smooth and fails the order test', () => {
  it('the extra-/2 Laplacian stays bounded and sine-shaped', () => {
    const run = runVv({ kind: 'half-stencil', n: 48 });
    expect(run.diverged).toBe(false);
    expect(run.maxAbs).toBeLessThan(2);
    expect(run.maxAbs).toBeGreaterThan(0.05);
    // Still a single smooth hump of the manufactured mode, not noise.
    const mode = run.x.map((x) => manufactured(x, 0));
    let dot = 0;
    let nrm = 0;
    for (let i = 0; i < run.u.length; i++) {
      dot += run.u[i]! * mode[i]!;
      nrm += mode[i]! * mode[i]!;
    }
    const corr = dot / Math.sqrt(nrm * nrm);
    // corr is (u·sin) / ||sin||² — a sine of any amplitude is O(1).
    expect(Math.abs(dot) / nrm).toBeGreaterThan(0.2);
    expect(maxAbs(run.u)).toBeLessThan(2);
    expect(corr).toBeDefined();
  });

  it('half-stencil error vs the intended manufactured solution does not fall as order 2', () => {
    const p = observedOrder(vvSweep('half-stencil'));
    // Inconsistent with α = 1: the α-mismatch is O(1), so the slope is near 0.
    expect(Math.abs(p)).toBeLessThan(0.6);
    const coarse = runVv({ kind: 'half-stencil', n: 24 });
    const fine = runVv({ kind: 'half-stencil', n: 96 });
    expect(fine.error).toBeGreaterThan(0.15);
    expect(coarse.error).toBeGreaterThan(0.15);
    expect(fine.error / coarse.error).toBeGreaterThan(0.5);
    expect(fine.error / coarse.error).toBeLessThan(2);
  });

  it('half-stencil spatial residual vs intended α is O(1), not O(dx²)', () => {
    const pts = residualSweep(0.5, 1);
    const p = observedOrder(pts.map((q) => ({ dx: q.dx, error: q.residual })));
    expect(Math.abs(p)).toBeLessThan(0.4);
    expect(pts[0]!.residual).toBeGreaterThan(1);
    expect(pts[pts.length - 1]!.residual).toBeGreaterThan(1);
  });
});

describe('advection converges to the wrong PDE and still looks smooth', () => {
  it('the travelling bump stays bounded', () => {
    const run = runVv({ kind: 'advection', n: 64, tEnd: 0.25 });
    expect(run.diverged).toBe(false);
    expect(run.maxAbs).toBeLessThan(2);
    expect(run.maxAbs).toBeGreaterThan(0.2);
  });

  it('error vs heat does not vanish under refinement; error vs exact advection does', () => {
    const a = runVv({ kind: 'advection', n: 32, tEnd: 0.25 });
    const b = runVv({ kind: 'advection', n: 64, tEnd: 0.25 });
    expect(a.error).toBeGreaterThan(0.15);
    expect(b.error).toBeGreaterThan(0.15);
    // Wrong physics: distance to heat stays O(1).
    expect(b.error / a.error).toBeGreaterThan(0.5);
    expect(b.error / a.error).toBeLessThan(1.4);
    // Right discrete problem: upwind is first order vs exact advection.
    expect(a.implementedError / b.implementedError).toBeGreaterThan(1.5);
  });
});
