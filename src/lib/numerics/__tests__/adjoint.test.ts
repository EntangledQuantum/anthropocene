import { describe, expect, it } from 'vitest';
import {
  DECAY_INV, decayAdjoint, decayEndpointComplexStep, decayForward,
  decayGradComplexStep, decayGradFiniteDifference, decayLoss,
  oscillatorAdjoint, oscillatorForward, oscillatorGradFiniteDifference,
  recoverDecayLambda, recoverOscillatorOmega,
} from '../adjoint.ts';
import { centralDifference } from '../diff.ts';

const REL = (a: number, b: number) => Math.abs(a - b) / Math.max(Math.abs(b), 1e-15);

describe('discrete adjoint on y′ = −λ y matches independent derivatives', () => {
  const lambda = 1.7;
  const yObs = decayForward(2.2).y;

  for (const method of ['euler', 'rk4'] as const) {
    it(`${method}: adjoint vs central difference`, () => {
      const adj = decayAdjoint(lambda, yObs, undefined, method);
      const fd = decayGradFiniteDifference(lambda, yObs, undefined, method);
      expect(REL(adj.dLambda, fd)).toBeLessThan(1e-5);
    });

    it(`${method}: adjoint vs complex-step of the trajectory`, () => {
      const adj = decayAdjoint(lambda, yObs, undefined, method);
      const cs = decayGradComplexStep(lambda, yObs, undefined, method);
      expect(REL(adj.dLambda, cs)).toBeLessThan(1e-8);
    });

    it(`${method}: ∂L/∂y0 matches a finite-difference in the initial value`, () => {
      const adj = decayAdjoint(lambda, yObs, undefined, method);
      const fd = centralDifference((y0) => {
        const y = decayForward(lambda, { ...DECAY_INV, y0 }, method).y;
        return decayLoss(y, yObs);
      }, DECAY_INV.y0, 1e-6);
      expect(REL(adj.dY0, fd)).toBeLessThan(1e-5);
    });
  }

  it('complex-step of the endpoint tracks −T e^{−λ T}', () => {
    const lambda0 = 1.3;
    const a = decayEndpointComplexStep(lambda0);
    const T = DECAY_INV.span;
    const exact = -T * Math.exp(-lambda0 * T);
    expect(REL(a, exact)).toBeLessThan(1e-4);
  });
});

describe('gradient descent recovers a known decay rate', () => {
  it('RK4 adjoint walk from λ = 0.45 recovers λ = 2', () => {
    const r = recoverDecayLambda(2, 0.45, { steps: 80, method: 'rk4' });
    expect(Math.abs(r.lambda - 2)).toBeLessThan(5e-3);
    expect(r.history.at(-1)!.loss).toBeLessThan(1e-6);
  });

  it('Euler adjoint recovers too, from the other side of the bowl', () => {
    const r = recoverDecayLambda(1.5, 3.2, { steps: 80, method: 'euler' });
    expect(Math.abs(r.lambda - 1.5)).toBeLessThan(1e-2);
  });

  it('loss falls on the way', () => {
    const r = recoverDecayLambda(2, 0.5, { steps: 40, method: 'rk4' });
    expect(r.history.at(-1)!.loss).toBeLessThan(r.history[0].loss * 0.05);
  });
});

describe('oscillator adjoint recovers ω', () => {
  it('matches a central difference', () => {
    const omega = 1.3;
    const qObs = oscillatorForward(1.8).q;
    const adj = oscillatorAdjoint(omega, qObs);
    const fd = oscillatorGradFiniteDifference(omega, qObs);
    expect(REL(adj.dOmega, fd)).toBeLessThan(1e-4);
  });

  it('GD from ω = 0.7 recovers ω = 1.6', () => {
    const r = recoverOscillatorOmega(1.6, 0.7, { steps: 80 });
    expect(Math.abs(r.omega - 1.6)).toBeLessThan(2e-2);
  });
});
