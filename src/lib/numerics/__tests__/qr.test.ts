import { describe, expect, it } from 'vitest';
import { relError } from '../conditioning.ts';
import { remainingDigits } from '../conditioning.ts';
import {
  QR_EPS,
  cond2,
  cond2Gram,
  frobenius,
  gram,
  gramCond2Exact,
  gramExcess,
  house,
  householderQR,
  identity,
  kappaSweep,
  lostColumnEps,
  lsResidual,
  lstsqNormal,
  lstsqQR,
  matMul,
  matVec,
  nearParallelPair,
  pairCond2Exact,
  r22Abs,
  r22Exact,
  reflect,
  subMat,
  transpose,
} from '../qr.ts';

const closeMat = (A: number[][], B: number[][], digits = 12) => {
  expect(A.length).toBe(B.length);
  for (let i = 0; i < A.length; i++) {
    expect(A[i]!.length).toBe(B[i]!.length);
    for (let j = 0; j < A[i]!.length; j++) {
      expect(A[i]![j]).toBeCloseTo(B[i]![j]!, digits);
    }
  }
};

describe('Householder maps a vector onto the axis', () => {
  it('F x = −sign(x₁) ‖x‖ e₁, and zeros the tail', () => {
    const x = [3, 4, 12];
    const nrm = Math.hypot(...x);
    const Fx = reflect(house(x), x);
    expect(Fx[0]).toBeCloseTo(-nrm, 12);
    expect(Fx[1]).toBeCloseTo(0, 12);
    expect(Fx[2]).toBeCloseTo(0, 12);
  });

  it('chooses the sign that enlarges x₁ (no cancellation in v)', () => {
    const x = [1, 1e-8, 0];
    const v = house(x);
    expect(Math.abs(v[0]!)).toBeGreaterThan(1.5);
    expect(Math.abs(v[0]!)).toBeGreaterThan(Math.abs(x[0]!));
  });

  it('a reflector is orthogonal and involutive', () => {
    const x = [0.4, -1.2, 0.7];
    const v = house(x);
    const Fx = reflect(v, x);
    expect(Math.hypot(...Fx)).toBeCloseTo(Math.hypot(...x), 12);
    const FFx = reflect(v, Fx);
    expect(FFx[0]).toBeCloseTo(x[0]!, 12);
    expect(FFx[1]).toBeCloseTo(x[1]!, 12);
    expect(FFx[2]).toBeCloseTo(x[2]!, 12);
  });
});

describe('Householder QR: Q is orthogonal and A = QR', () => {
  const A = [
    [1, 2, 0.5],
    [0.3, -1, 4],
    [2, 0.1, 1],
    [-0.4, 3, 0.2],
  ];

  it('thin Q has orthonormal columns', () => {
    const { Q } = householderQR(A);
    const QtQ = matMul(transpose(Q), Q);
    closeMat(QtQ, identity(3), 12);
  });

  it('A equals QR to a few ulps', () => {
    const { Q, R } = householderQR(A);
    const rec = matMul(Q, R);
    expect(frobenius(subMat(A, rec)) / frobenius(A)).toBeLessThan(1e-14);
  });

  it('R is upper triangular', () => {
    const { R } = householderQR(A);
    expect(R[1]![0]).toBe(0);
    expect(R[2]![0]).toBe(0);
    expect(R[2]![1]).toBe(0);
  });

  it('still reconstructs the κ ~ 1e8 pair', () => {
    const P = nearParallelPair(QR_EPS);
    const { Q, R } = householderQR(P);
    closeMat(matMul(transpose(Q), Q), identity(2), 10);
    expect(frobenius(subMat(P, matMul(Q, R))) / frobenius(P)).toBeLessThan(1e-14);
  });
});

describe('the lesson pair: forming AᵀA loses a column, QR does not', () => {
  const A = nearParallelPair(QR_EPS);

  it('κ₂(A) ≈ √2 / ε ≈ 1.4×10⁸', () => {
    const exact = pairCond2Exact(QR_EPS);
    expect(exact).toBeGreaterThan(1e8);
    expect(exact).toBeLessThan(2e8);
    expect(exact).toBeCloseTo(Math.sqrt(2) / QR_EPS, 5);
  });

  it('κ₂(AᵀA) = κ₂(A)² in real arithmetic', () => {
    const kA = pairCond2Exact(QR_EPS);
    const kG = gramCond2Exact(QR_EPS);
    expect(kG / (kA * kA)).toBeCloseTo(1, 12);
    expect(kG).toBeGreaterThan(1e16);
    expect(kG).toBeLessThan(3e16);
  });

  it('measured κ tracks the exact formula while 1+ε² is representable', () => {
    const eps = 1e-3;
    const Amod = nearParallelPair(eps);
    expect(Math.abs(cond2(Amod) / pairCond2Exact(eps) - 1)).toBeLessThan(1e-8);
    expect(Math.abs(cond2Gram(gram(Amod)) / gramCond2Exact(eps) - 1)).toBeLessThan(1e-8);
  });

  it('at ε = 10⁻⁸, 1+ε² rounds to 1 so the computed Gram is singular', () => {
    expect(1 + QR_EPS * QR_EPS).toBe(1);
    const G = gram(A);
    expect(G[0]![0]).toBe(1);
    expect(G[1]![1]).toBe(1);
    expect(G[0]![1]).toBe(1);
    expect(G[1]![0]).toBe(1);
    expect(cond2Gram(G)).toBe(Number.POSITIVE_INFINITY);
  });

  it('Householder R₂₂ still tracks ε, the information AᵀA lost', () => {
    const r = r22Abs(QR_EPS);
    expect(r).toBeCloseTo(r22Exact(QR_EPS), 10);
    expect(r).toBeGreaterThan(QR_EPS);
    expect(r).toBeLessThan(2 * QR_EPS);
    expect(gramExcess(QR_EPS)).toBe(0);
  });

  it('the lost-column threshold is √(ε_mach / 2)', () => {
    const eps = lostColumnEps();
    expect(1 + eps * eps).toBe(1);
    const justAbove = eps * 1.2;
    expect(1 + justAbove * justAbove).not.toBe(1);
  });
});

describe('normal-equations residual is worse on a κ ~ 1e8 pair', () => {
  const A = nearParallelPair(QR_EPS);
  const xTrue = [1, 1];
  const b = matVec(A, xTrue);

  it('QR recovers x and leaves a tiny residual', () => {
    const x = lstsqQR(A, b);
    expect(x).not.toBeNull();
    expect(relError(x!, xTrue)).toBeLessThan(1e-6);
    expect(lsResidual(A, x!, b)).toBeLessThan(1e-14);
  });

  it('the normal equations cannot: AᵀA is singular, or x is far worse', () => {
    const xQR = lstsqQR(A, b)!;
    const xNE = lstsqNormal(A, b);
    const errQR = relError(xQR, xTrue);
    if (xNE === null) {
      expect(errQR).toBeLessThan(1e-6);
      return;
    }
    expect(relError(xNE, xTrue)).toBeGreaterThan(errQR * 1e6);
    expect(lsResidual(A, xNE, b)).toBeGreaterThan(lsResidual(A, xQR, b) * 1e3);
  });

  it('on a κ ~ 1e7 pair the NE solution is a worse x than QR', () => {
    const eps = 1e-7;
    const A7 = nearParallelPair(eps);
    const b7 = [1, 1, 0];
    const e2 = eps * eps;
    const rhs0 = b7[0]! + eps * b7[1]!;
    const rhs1 = b7[0]! + eps * b7[2]!;
    const det = e2 * (2 + e2);
    const xExact = [
      (rhs0 - rhs1 + e2 * rhs0) / det,
      (rhs1 - rhs0 + e2 * rhs1) / det,
    ];
    const xQR = lstsqQR(A7, b7);
    const xNE = lstsqNormal(A7, b7);
    expect(xQR).not.toBeNull();
    expect(xNE).not.toBeNull();
    expect(relError(xNE!, xExact)).toBeGreaterThan(relError(xQR!, xExact) * 10);
    expect(lsResidual(A7, xNE!, b7)).toBeGreaterThanOrEqual(lsResidual(A7, xQR!, b7));
  });
});

describe('a backward-stable QR does not spend the extra κ', () => {
  it('Householder on the lesson pair still has a digit budget; NE does not', () => {
    const digitsQR = remainingDigits(pairCond2Exact(QR_EPS));
    const digitsNE = remainingDigits(gramCond2Exact(QR_EPS));
    expect(digitsQR).toBeGreaterThan(6);
    expect(digitsQR).toBeLessThan(9);
    expect(digitsNE).toBeLessThan(1);
  });
});

describe('κ sweep for the sketch: log κ(AᵀA) is 2 log κ(A)', () => {
  it('each sample satisfies κ(AᵀA) ≈ κ(A)²', () => {
    const sweep = kappaSweep();
    expect(sweep.length).toBeGreaterThan(8);
    for (const p of sweep) {
      expect(p.kappaAtA / (p.kappaA * p.kappaA)).toBeCloseTo(1, 8);
    }
  });
});
