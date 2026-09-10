import { describe, expect, it } from 'vitest';
import { frobenius, identity, matMul, subMat, transpose } from '../qr.ts';
import {
  PHI,
  PICTURE_SIGMAS,
  SHEAR,
  columns2,
  demoPicture,
  droppedSigma,
  flattenSigma2ForKappa,
  frobeniusOfSigma,
  frobeniusResidual,
  jacobiEig,
  kappa2,
  lessonEllipse,
  mapCircle,
  opnorm2,
  pictureResidual2,
  radiusRange,
  rankK,
  reconstruct,
  shearEigenvalues,
  singularAxes,
  spectralResidual,
  svd,
  svd2x2,
  svdDense,
} from '../svd.ts';

const closeMat = (A: number[][], B: number[][], digits = 12) => {
  expect(A.length).toBe(B.length);
  for (let i = 0; i < A.length; i++) {
    expect(A[i]!.length).toBe(B[i]!.length);
    for (let j = 0; j < A[i]!.length; j++) {
      expect(A[i]![j]).toBeCloseTo(B[i]![j]!, digits);
    }
  }
};

const closeOnb = (Q: number[][], digits = 12) => {
  const QtQ = matMul(transpose(Q), Q);
  closeMat(QtQ, identity(Q[0]!.length), digits);
};

describe('2×2 SVD reconstruction', () => {
  it('rebuilds the lesson shear and recovers σ = (φ, 1/φ)', () => {
    const { U, S, V } = svd2x2(SHEAR);
    expect(S[0]).toBeCloseTo(PHI, 12);
    expect(S[1]).toBeCloseTo(1 / PHI, 12);
    closeMat(reconstruct(U, S, V), SHEAR, 12);
    closeOnb(U, 12);
    closeOnb(V, 12);
  });

  it('rebuilds a generic 2×2, including a reflection', () => {
    const A = [
      [2, -0.7],
      [1.1, 0.4],
    ];
    const { U, S, V } = svd2x2(A);
    closeMat(reconstruct(U, S, V), A, 12);
    closeOnb(U, 12);
    closeOnb(V, 12);
    expect(S[0]!).toBeGreaterThan(S[1]!);
    expect(S[1]!).toBeGreaterThanOrEqual(0);
  });

  it('a diagonal of mixed sign has σ = |diag| sorted', () => {
    const { S } = svd2x2([
      [-3, 0],
      [0, 0.5],
    ]);
    expect(S[0]).toBeCloseTo(3, 12);
    expect(S[1]).toBeCloseTo(0.5, 12);
  });

  it('a rank-1 matrix has σ₂ = 0 and A₁ = A', () => {
    const A = [
      [1, 2],
      [2, 4],
    ];
    const { S } = svd2x2(A);
    expect(S[1]).toBeCloseTo(0, 12);
    closeMat(rankK(A, 1), A, 12);
    closeMat(rankK(A, 0), [[0, 0], [0, 0]], 12);
  });
});

describe('the lesson shear: eigenvalues hide the stretch', () => {
  it('both eigenvalues are 1, so |λ_max|/|λ_min| = 1', () => {
    const [l1, l2] = shearEigenvalues();
    expect(l1).toBe(1);
    expect(l2).toBe(1);
  });

  it('κ₂ = φ² ≈ 2.618, the axis ratio of the ellipse', () => {
    const k = kappa2(SHEAR);
    expect(k).toBeCloseTo(PHI * PHI, 12);
    expect(k).toBeCloseTo(PHI / (1 / PHI), 12);
    expect(k).toBeGreaterThan(2.6);
    expect(k).toBeLessThan(2.63);
  });

  it('the image of the unit circle has radii σ₁ and σ₂', () => {
    const { rMin, rMax } = radiusRange(SHEAR, 720);
    expect(rMax).toBeCloseTo(PHI, 3);
    expect(rMin).toBeCloseTo(1 / PHI, 3);
  });

  it('the ellipse axes are not the columns', () => {
    const axes = singularAxes(SHEAR);
    const { a1, a2 } = columns2(SHEAR);
    const same = (p: [number, number], q: [number, number]) =>
      Math.hypot(p[0] - q[0], p[1] - q[1]);
    // Columns are A e_i. Axes are σ_i u_i. For this shear they sit nearby
    // but they are not the same arrows — e_i are not the right singular vectors.
    expect(same(axes.axis1, a1)).toBeGreaterThan(0.4);
    expect(same(axes.axis1, a2)).toBeGreaterThan(0.2);
    expect(same(axes.axis2, a1)).toBeGreaterThan(0.2);
    expect(Math.abs(axes.u1[0])).toBeLessThan(0.95);
    expect(Math.hypot(...a1)).toBe(1);
    expect(Math.hypot(...a2)).toBeCloseTo(Math.sqrt(2), 12);
  });
});

describe('Eckart–Young: residual equals the dropped σ', () => {
  it('2×2: ‖A − A₁‖₂ = σ₂, and the Frobenius leftover matches', () => {
    const { S } = svd2x2(SHEAR);
    expect(spectralResidual(SHEAR, 1)).toBeCloseTo(S[1]!, 12);
    expect(droppedSigma(SHEAR, 1)).toBeCloseTo(S[1]!, 12);
    expect(frobeniusResidual(SHEAR, 1)).toBeCloseTo(S[1]!, 12);
    expect(spectralResidual(SHEAR, 0)).toBeCloseTo(S[0]!, 12);
    expect(spectralResidual(SHEAR, 2)).toBeCloseTo(0, 12);
  });

  it('thinning σ₂ collapses the ellipse to a line of length 2σ₁', () => {
    const A = lessonEllipse(0);
    const { S } = svd2x2(A);
    expect(S[1]).toBeCloseTo(0, 12);
    expect(S[0]).toBeCloseTo(PHI, 12);
    const axes = singularAxes(A);
    const pts = mapCircle(A, 180);
    for (const p of pts) {
      expect(Math.hypot(p.x, p.y)).toBeLessThanOrEqual(PHI + 1e-10);
      const cross = p.x * axes.u1[1] - p.y * axes.u1[0];
      expect(Math.abs(cross)).toBeCloseTo(0, 10);
    }
    const { rMax } = radiusRange(A, 720);
    expect(rMax).toBeGreaterThan(PHI * 0.999);
    expect(rMax).toBeLessThanOrEqual(PHI + 1e-10);
  });

  it('the κ = 10 flattening uses σ₂ = φ/10', () => {
    const s2 = flattenSigma2ForKappa(10);
    expect(s2).toBeCloseTo(PHI / 10, 12);
    expect(kappa2(lessonEllipse(s2))).toBeCloseTo(10, 10);
  });
});

describe('Jacobi eig and the dense picture SVD', () => {
  it('recovers the known eigendecomposition of a 2×2 SPD', () => {
    const S = [
      [2, 1],
      [1, 2],
    ];
    const { values, vectors } = jacobiEig(S);
    const sorted = [...values].sort((a, b) => b - a);
    expect(sorted[0]).toBeCloseTo(3, 12);
    expect(sorted[1]).toBeCloseTo(1, 12);
    closeOnb(vectors, 12);
    const AV = matMul(S, vectors);
    const VL = vectors.map((row, i) => row.map((v, j) => v * values[j]!));
    closeMat(AV, VL, 10);
  });

  it('rebuilds the 8×8 picture and recovers the prescribed σ', () => {
    const A = demoPicture();
    const fact = svdDense(A);
    closeMat(reconstruct(fact.U, fact.S, fact.V), A, 10);
    closeOnb(fact.U, 8);
    closeOnb(fact.V, 8);
    for (let i = 0; i < PICTURE_SIGMAS.length; i++) {
      expect(fact.S[i]! / PICTURE_SIGMAS[i]!).toBeCloseTo(1, 8);
    }
  });

  it('Eckart–Young residual equals the dropped σ on the picture', () => {
    const A = demoPicture();
    const { S } = svd(A);
    for (const k of [0, 1, 2, 3, 5, 7]) {
      expect(spectralResidual(A, k)).toBeCloseTo(S[k] ?? 0, 8);
      expect(droppedSigma(A, k)).toBeCloseTo(S[k] ?? 0, 10);
      expect(frobeniusResidual(A, k)).toBeCloseTo(frobeniusOfSigma(S, k), 8);
    }
    expect(pictureResidual2(2)).toBeCloseTo(PICTURE_SIGMAS[2]!, 8);
    expect(pictureResidual2(2)).toBeCloseTo(0.4, 8);
  });

  it('‖A‖₂ of the picture is σ₁ = 5', () => {
    expect(opnorm2(demoPicture())).toBeCloseTo(5, 8);
  });
});

describe('dispatcher uses the 2×2 path on 2×2 input', () => {
  it('svd(SHEAR) matches svd2x2', () => {
    const a = svd(SHEAR);
    const b = svd2x2(SHEAR);
    expect(a.S[0]).toBeCloseTo(b.S[0]!, 12);
    expect(a.S[1]).toBeCloseTo(b.S[1]!, 12);
    closeMat(reconstruct(a.U, a.S, a.V), SHEAR, 12);
  });
});
