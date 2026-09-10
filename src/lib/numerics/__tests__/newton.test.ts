import { describe, expect, it } from 'vitest';
import { conjugateGradient } from '../iterative.ts';
import { solveDense } from '../linalg.ts';
import { add, norm2, sub } from '../types.ts';
import {
  ATAN_ROOT,
  CATCH_X0,
  DIVERGE_X0,
  SKETCH_X0,
  applyMat,
  atanShift,
  atanShiftQuadraticConstant,
  basinLeftEdge,
  basinRightEdge,
  expCouple,
  fateOf,
  jacobianAt,
  linearSolveResidual,
  measuredQuadraticRatio,
  newtonCorrection,
  newtonFate,
  newtonRun,
  newtonStep,
  stepsUntil,
} from '../newton.ts';

const closeVec = (a: number[], b: number[], digits = 10) => {
  expect(a.length).toBe(b.length);
  for (let i = 0; i < a.length; i++) expect(a[i]).toBeCloseTo(b[i]!, digits);
};

describe('one Newton step is the linear solve J δ = −F', () => {
  it('1D atan-shift: δ = −F/F′ and J δ + F = 0', () => {
    const x = [1.1];
    const Fx = atanShift.F(x);
    const J = atanShift.J(x);
    const step = newtonStep(atanShift, x);
    expect(step.delta).not.toBeNull();
    const delta = step.delta!;
    const analytic = -Fx[0]! / J[0]![0]!;
    expect(delta[0]).toBeCloseTo(analytic, 12);
    expect(linearSolveResidual(J, delta, Fx)).toBeLessThan(1e-14);
    closeVec(step.x, add(x, delta), 12);
  });

  it('2D exp-couple: dense δ satisfies J δ = −F, and CG agrees', () => {
    const x = [0.25, -0.15];
    const Fx = expCouple.F(x);
    const J = expCouple.J(x);
    const dense = newtonStep(expCouple, x, { solver: 'dense' });
    const cg = newtonStep(expCouple, x, { solver: 'cg' });
    expect(dense.delta).not.toBeNull();
    expect(cg.delta).not.toBeNull();
    expect(linearSolveResidual(J, dense.delta!, Fx)).toBeLessThan(1e-14);
    expect(linearSolveResidual(J, cg.delta!, Fx)).toBeLessThan(1e-12);
    closeVec(dense.delta!, cg.delta!, 10);

    const lu = solveDense(J, Fx.map((v) => -v));
    closeVec(dense.delta!, lu!, 12);

    const hist = conjugateGradient((v) => applyMat(J, v), Fx.map((v) => -v), {
      maxIter: 2,
      tol: 1e-14,
    });
    closeVec(cg.delta!, hist.at(-1)!.x, 10);
  });

  it('newtonCorrection is exactly solveDense on J δ = −F', () => {
    const x = [0.4, 0.2];
    const Fx = expCouple.F(x);
    const J = expCouple.J(x);
    const delta = newtonCorrection(J, Fx, 'dense');
    const lu = solveDense(J, [-Fx[0]!, -Fx[1]!]);
    closeVec(delta!, lu!, 12);
    const Jdelta = applyMat(J, delta!);
    closeVec(Jdelta, Fx.map((v) => -v), 12);
  });
});

describe('quadratic residual drop near the root', () => {
  it('atan-shift ratios |r_{k+1}|/|r_k|² approach tan(1/2)', () => {
    const expected = atanShiftQuadraticConstant();
    expect(expected).toBeCloseTo(Math.tan(0.5), 12);
    const ratios = measuredQuadraticRatio(atanShift, [CATCH_X0]);
    expect(ratios.length).toBeGreaterThan(0);
    for (const q of ratios) {
      expect(q).toBeCloseTo(expected, 1);
      expect(Math.abs(q - expected) / expected).toBeLessThan(0.05);
    }
  });

  it('from x0 = 0.2, four steps land at roundoff, and the drop accelerates', () => {
    const run = newtonRun(atanShift, [CATCH_X0], { maxIter: 8, tol: 1e-16 });
    expect(stepsUntil(atanShift, [CATCH_X0], 1e-12)).toBe(4);
    const r = run.map((s) => s.residualNorm).filter((v) => v > 0);
    expect(r[0]!).toBeGreaterThan(0.2);
    expect(r[1]!).toBeLessThan(r[0]!);
    expect(r[2]! / r[1]!).toBeLessThan(r[1]! / r[0]!);
    expect(r[3]! / r[2]!).toBeLessThan(r[2]! / r[1]!);
    const last = run.at(-1)!;
    expect(last.residualNorm).toBeLessThan(1e-12);
    expect(Math.abs(last.x[0]! - ATAN_ROOT)).toBeLessThan(1e-10);
  });

  it('exp-couple near the origin: residual drops superlinearly to roundoff', () => {
    const run = newtonRun(expCouple, [0.08, -0.05], { maxIter: 8, tol: 1e-16 });
    const r = run.map((s) => s.residualNorm);
    expect(r[0]!).toBeGreaterThan(1e-3);
    expect(r[1]!).toBeLessThan(r[0]!);
    expect(r[2]! / r[1]!).toBeLessThan(r[1]! / r[0]!);
    expect(run.at(-1)!.residualNorm).toBeLessThan(1e-12);
    expect(norm2(sub(run.at(-1)!.x, expCouple.root))).toBeLessThan(1e-10);
  });

  it('the sketch start is the same quadratic cliff', () => {
    const ratios = measuredQuadraticRatio(atanShift, [SKETCH_X0]);
    expect(ratios.length).toBeGreaterThan(0);
    const expected = atanShiftQuadraticConstant();
    for (const q of ratios) {
      expect(Math.abs(q - expected) / expected).toBeLessThan(0.05);
    }
  });
});

describe('a start outside the basin diverges', () => {
  it('x0 = 3 flies; |x| grows past 1000 in four steps', () => {
    expect(newtonFate(atanShift, [DIVERGE_X0])).toBe('diverge');
    const run = newtonRun(atanShift, [DIVERGE_X0], { maxIter: 8 });
    expect(fateOf(run, atanShift)).toBe('diverge');
    expect(Math.abs(run[0]!.x[0]!)).toBe(3);
    const last = run.at(-1)!;
    expect(last.finite).toBe(false);
    expect(Math.abs(last.x[0]!)).toBeGreaterThan(1000);
    expect(run.length).toBeLessThanOrEqual(6);
  });

  it('x0 = 2 still catches — the cliff is just past 2', () => {
    expect(newtonFate(atanShift, [2])).toBe('catch');
    const right = basinRightEdge();
    const left = basinLeftEdge();
    expect(right).toBeGreaterThan(2.0);
    expect(right).toBeLessThan(2.2);
    expect(left).toBeGreaterThan(-1.4);
    expect(left).toBeLessThan(-1.0);
    expect(newtonFate(atanShift, [2.2])).toBe('diverge');
    expect(newtonFate(atanShift, [0])).toBe('catch');
    expect(newtonFate(atanShift, [-1])).toBe('catch');
    expect(newtonFate(atanShift, [-2])).toBe('diverge');
  });

  it('Picard (J = I) from x0 = 3 catches — a different operator, not a bad F', () => {
    expect(newtonFate(atanShift, [DIVERGE_X0], { jacobian: 'identity' })).toBe('catch');
    const n = stepsUntil(atanShift, [DIVERGE_X0], 1e-12, { jacobian: 'identity' });
    expect(n).toBeGreaterThan(8);
    expect(n).toBeLessThan(40);
    expect(jacobianAt(atanShift, [DIVERGE_X0], 'identity')).toEqual([[1]]);
  });
});
