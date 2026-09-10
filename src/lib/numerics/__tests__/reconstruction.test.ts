import { describe, expect, it } from 'vitest';
import { wrap } from '../pde1d.ts';
import { JUMP_LEFT, JUMP_RIGHT, totalMass } from '../fvm1d.ts';
import {
  REC_CFL,
  TUNE_QC,
  TUNE_QL,
  TUNE_QR,
  deltasOf,
  extrema,
  faceFromDelta,
  limitedDelta,
  minmod2,
  observedOrder,
  reconstructionPolyline,
  runMuscl,
  sineAverages,
  sineL1Error,
  stepMuscl,
  totalVariation,
  tvdDeltaBound,
} from '../reconstruction.ts';

/* Pedagogical claims of the reconstruction lesson. If the lesson says
   unlimited MUSCL rings on a jump, that minmod TV is nonincreasing, or
   that a smooth sine is recovered at order > 1, this file pins it. */

describe('minmod and the three-cell bound', () => {
  it('returns 0 when slopes disagree, else the smaller-magnitude one', () => {
    expect(minmod2(1, 2)).toBe(1);
    expect(minmod2(-3, -1)).toBe(-1);
    expect(minmod2(-1, 2)).toBe(0);
    expect(minmod2(0, 4)).toBe(0);
  });

  it('Fromm on (0, 0.8, 1) overshoots the right neighbour; the TVD bound does not', () => {
    const fromm = limitedDelta(TUNE_QL, TUNE_QC, TUNE_QR, 'unlimited');
    expect(fromm).toBeCloseTo(0.5, 12);
    expect(faceFromDelta(TUNE_QC, fromm).right).toBeGreaterThan(TUNE_QR);

    const bound = tvdDeltaBound(TUNE_QL, TUNE_QC, TUNE_QR);
    expect(bound).toBeCloseTo(0.4, 12);
    expect(faceFromDelta(TUNE_QC, bound).right).toBeCloseTo(TUNE_QR, 12);
    expect(faceFromDelta(TUNE_QC, bound).left).toBeGreaterThanOrEqual(TUNE_QL);

    const mm = limitedDelta(TUNE_QL, TUNE_QC, TUNE_QR, 'minmod');
    expect(mm).toBeLessThanOrEqual(bound);
    expect(faceFromDelta(TUNE_QC, mm).right).toBeLessThanOrEqual(TUNE_QR + 1e-12);
  });

  it('the reconstruction polyline uses the supplied slope, not a hidden limiter', () => {
    const pts = reconstructionPolyline(0, 0.8, 1, 0.5);
    expect(pts[2]).toEqual({ x: 1, y: 0.55 });
    expect(pts[3]).toEqual({ x: 2, y: 1.05 });
  });

  it('an extremum forces every TVD limiter to a flat cell', () => {
    expect(limitedDelta(0, 1, 1, 'minmod')).toBe(0);
    expect(limitedDelta(0, 1, 1, 'superbee')).toBe(0);
    expect(limitedDelta(0, 1, 1, 'unlimited')).toBeCloseTo(0.5, 12);
  });
});

describe('unlimited MUSCL rings on a jump', () => {
  it('creates new extrema past the initial 0–1 range', () => {
    const run = runMuscl({ limiter: 'unlimited', initial: 'jump', n: 64, cfl: REC_CFL, tEnd: 0.4 });
    expect(run.diverged).toBe(false);
    expect(run.qMax).toBeGreaterThan(JUMP_LEFT + 0.02);
    expect(run.qMin).toBeLessThan(JUMP_RIGHT - 0.02);
  });

  it('grows total variation', () => {
    const run = runMuscl({ limiter: 'unlimited', initial: 'jump', n: 64, cfl: REC_CFL, tEnd: 0.4 });
    expect(run.tv).toBeGreaterThan(run.tv0 * 1.05);
    const peak = Math.max(...run.history.map((s) => s.ratio).filter(Number.isFinite));
    expect(peak).toBeGreaterThan(1.05);
  });
});

describe('minmod TV is nonincreasing', () => {
  it('never grows TV on a jump, any step', () => {
    const n = 64;
    const q0 = runMuscl({ limiter: 'minmod', initial: 'jump', n, tEnd: 0 }).q0;
    let q = q0.slice();
    let tv = totalVariation(q);
    const nu = REC_CFL;
    for (let k = 0; k < 200; k++) {
      q = stepMuscl(q, 'minmod', nu).next;
      const nextTv = totalVariation(q);
      expect(nextTv).toBeLessThanOrEqual(tv + 1e-12);
      tv = nextTv;
    }
  });

  it('keeps a 0–1 jump inside [0, 1]', () => {
    const run = runMuscl({ limiter: 'minmod', initial: 'jump', n: 64, cfl: REC_CFL, tEnd: 0.5 });
    expect(run.diverged).toBe(false);
    expect(run.qMax).toBeLessThanOrEqual(JUMP_LEFT + 1e-12);
    expect(run.qMin).toBeGreaterThanOrEqual(JUMP_RIGHT - 1e-12);
  });

  it('superbee is TVD on the same jump', () => {
    const n = 48;
    const q0 = runMuscl({ limiter: 'superbee', initial: 'jump', n, tEnd: 0 }).q0;
    let q = q0.slice();
    let tv = totalVariation(q);
    for (let k = 0; k < 160; k++) {
      q = stepMuscl(q, 'superbee', REC_CFL).next;
      const nextTv = totalVariation(q);
      expect(nextTv).toBeLessThanOrEqual(tv + 1e-12);
      tv = nextTv;
    }
    const ext = extrema(q);
    expect(ext.max).toBeLessThanOrEqual(JUMP_LEFT + 1e-12);
    expect(ext.min).toBeGreaterThanOrEqual(JUMP_RIGHT - 1e-12);
  });
});

describe('smooth-sine order is greater than 1', () => {
  it('unlimited MUSCL is second-order in L¹ on a sine', () => {
    const e32 = sineL1Error({ limiter: 'unlimited', n: 32, periods: 1 });
    const e64 = sineL1Error({ limiter: 'unlimited', n: 64, periods: 1 });
    const p = observedOrder(e32, e64);
    expect(p).toBeGreaterThan(1.5);
    expect(p).toBeLessThan(2.4);
    expect(e64).toBeLessThan(e32);
  });

  it('minmod on a sine is still order > 1 in L¹ — the limiter is a switch, not a downgrade', () => {
    const e32 = sineL1Error({ limiter: 'minmod', n: 32, periods: 1 });
    const e64 = sineL1Error({ limiter: 'minmod', n: 64, periods: 1 });
    expect(observedOrder(e32, e64)).toBeGreaterThan(1);
    expect(e64).toBeLessThan(e32);
  });

  it('piecewise constant is first-order, and worse than minmod at the same N', () => {
    const eConst = sineL1Error({ limiter: 'constant', n: 64, periods: 1 });
    const eMinmod = sineL1Error({ limiter: 'minmod', n: 64, periods: 1 });
    const eUnlim = sineL1Error({ limiter: 'unlimited', n: 64, periods: 1 });
    const e32 = sineL1Error({ limiter: 'constant', n: 32, periods: 1 });
    expect(observedOrder(e32, eConst)).toBeGreaterThan(0.7);
    expect(observedOrder(e32, eConst)).toBeLessThan(1.4);
    expect(eConst).toBeGreaterThan(eMinmod);
    expect(eMinmod).toBeGreaterThan(eUnlim);
  });
});

describe('the rest of the contract', () => {
  it('piecewise constant is first-order upwind: δ = 0 and face = Q', () => {
    const q = [0.2, 0.5, 0.9, 0.1];
    const { delta, face } = stepMuscl(q, 'constant', 0.4);
    for (let i = 0; i < q.length; i++) {
      expect(delta[i]).toBe(0);
      expect(face[i]).toBeCloseTo(q[i]!, 12);
    }
    const { next } = stepMuscl(q, 'constant', 0.4);
    for (let i = 0; i < q.length; i++) {
      const upwind = q[i]! - 0.4 * (q[i]! - q[wrap(i - 1, q.length)]!);
      expect(next[i]).toBeCloseTo(upwind, 12);
    }
  });

  it('a conservative MUSCL step conserves mass to roundoff', () => {
    for (const limiter of ['constant', 'unlimited', 'minmod', 'superbee'] as const) {
      const run = runMuscl({ limiter, initial: 'jump', n: 48, cfl: REC_CFL, tEnd: 0.5 });
      expect(run.diverged).toBe(false);
      const rel = Math.abs(run.mass - run.mass0) / (Math.abs(run.mass0) + 1e-15);
      expect(rel).toBeLessThan(1e-12);
    }
  });

  it('sine cell averages of a full period match the sinc-scaled sample at centres', () => {
    const n = 32;
    const q = sineAverages(n);
    const dx = 1 / n;
    // ∫ sin / dx = sinc(π dx) sin(2π x_c) with sinc = sin(πdx)/(πdx).
    const sinc = Math.sin(Math.PI * dx) / (Math.PI * dx);
    for (let i = 0; i < n; i++) {
      const xc = (i + 0.5) * dx;
      expect(q[i]).toBeCloseTo(sinc * Math.sin(2 * Math.PI * xc), 12);
    }
    expect(totalVariation(q)).toBeGreaterThan(3.5);
    expect(totalVariation(q)).toBeLessThan(4.5);
  });

  it('deltasOf matches limitedDelta cellwise, periodic', () => {
    const q = [0, 0.4, 1, 0.7, 0.1];
    const d = deltasOf(q, 'minmod');
    for (let i = 0; i < q.length; i++) {
      expect(d[i]).toBeCloseTo(
        limitedDelta(q[wrap(i - 1, q.length)]!, q[i]!, q[wrap(i + 1, q.length)]!, 'minmod'),
        12,
      );
    }
  });

  it('totalMass is used consistently with the finite-volume lesson', () => {
    const run = runMuscl({ limiter: 'minmod', initial: 'jump', n: 16, tEnd: 0 });
    expect(totalMass(run.q0, run.dx)).toBeCloseTo(run.mass0, 12);
  });
});
