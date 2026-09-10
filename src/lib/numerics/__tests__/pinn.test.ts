import { describe, expect, it } from 'vitest';
import { centralDifference } from '../diff.ts';
import {
  collocation, dataMse, interpolantMaxValueError, interpolantNodes,
  interpolantResidualRms, lagrangeEval, residualGrad, residualRms,
  seedMlp, trainOnData, trainOnResidual,
} from '../pinn.ts';

describe('Lagrange interpolant of e^{−t} is pretty and not a solution', () => {
  const nodes = interpolantNodes(2.5);
  const ts = collocation(80, 2.5);

  it('hits the three nodes it was given', () => {
    for (const n of nodes) {
      expect(lagrangeEval(nodes, n.t).y).toBeCloseTo(n.y, 12);
    }
  });

  it('stays close in value — a picture of ŷ(t) looks like a decay', () => {
    expect(interpolantMaxValueError(nodes, ts)).toBeLessThan(0.12);
  });

  it('has a large residual of y′ + y, because interpolation does not enforce the ODE', () => {
    const r = interpolantResidualRms(nodes, ts);
    expect(r).toBeGreaterThan(0.08);
    // The true solution's residual is identically zero.
    const trueR = Math.sqrt(
      ts.reduce((s, t) => {
        const y = Math.exp(-t);
        const e = -y + y; // y' + y
        return s + e * e;
      }, 0) / ts.length,
    );
    expect(trueR).toBeLessThan(1e-15);
    expect(r).toBeGreaterThan(trueR + 0.08);
  });
});

describe('residual-trained PINN drives the residual down', () => {
  const ts = collocation(40, 2.5);
  const start = seedMlp(3);

  it('the reverse-mode residual gradient matches a finite-difference in one weight', () => {
    const { grad } = residualGrad(start, ts);
    const fd = centralDifference((w) => {
      const q = { ...start, w2: start.w2.map((v, i) => (i === 0 ? w : v)) };
      return residualGrad(q, ts).loss.total;
    }, start.w2[0], 1e-5);
    const rel = Math.abs(grad.w2[0] - fd) / Math.max(Math.abs(fd), 1e-12);
    expect(rel).toBeLessThan(2e-4);
  });

  it('training on the residual decreases it, and beats the interpolant', () => {
    const before = residualRms(start, ts);
    const { params, history } = trainOnResidual(start, { steps: 280, lr: 0.08, ts });
    const after = residualRms(params, ts);
    expect(after).toBeLessThan(before * 0.4);
    expect(history.at(-1)!).toBeLessThan(history[0]);
    expect(after).toBeLessThan(interpolantResidualRms(interpolantNodes(2.5), ts) * 0.5);
  });
});

describe('a data-only fit can look right and still fail the residual', () => {
  const dataT = [0, 0.6, 1.2, 1.8, 2.4];
  const dataY = dataT.map((t) => Math.exp(-t));
  const dense = collocation(80, 2.5);
  const start = seedMlp(5);

  it('overfits the samples while leaving a residual larger than a residual-trained net', () => {
    const dataFit = trainOnData(start, dataT, dataY, { steps: 500, lr: 0.15 });
    const residualFit = trainOnResidual(start, { steps: 280, lr: 0.08, ts: dense });

    expect(dataMse(dataFit.params, dataT, dataY)).toBeLessThan(5e-4);
    const dataResidual = residualRms(dataFit.params, dense);
    const physResidual = residualRms(residualFit.params, dense);
    expect(dataResidual).toBeGreaterThan(physResidual * 2);
    expect(dataResidual).toBeGreaterThan(0.04);
  });
});
