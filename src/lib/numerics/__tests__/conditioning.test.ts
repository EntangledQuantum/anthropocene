import { describe, expect, it } from 'vitest';
import { solveDense } from '../linalg.ts';
import {
  ILL_EPS,
  condInf,
  ill2x2,
  infNormMat,
  inverseDense,
  naiveNearRoot,
  naiveQuadraticCliff,
  polyEval,
  quadraticNaive,
  quadraticStable,
  relError,
  relResidual,
  relRootError,
  remainingDigits,
  solveIllPerturbed,
} from '../conditioning.ts';

/* Every pedagogical claim the conditioning lesson makes is asserted here.
   The widget, the displayed LU, and these tests share `solveDense`. */

describe('the lesson 2×2 is ill-conditioned, and κ is a property of A', () => {
  const { A, b, xExact } = ill2x2();

  it('κ_∞ equals (2+ε)²/ε ≈ 4×10⁸', () => {
    const closed = ((2 + ILL_EPS) ** 2) / ILL_EPS;
    const measured = condInf(A);
    expect(Math.abs(measured - closed) / closed).toBeLessThan(1e-8);
    expect(measured).toBeGreaterThan(3e8);
    expect(measured).toBeLessThan(5e8);
  });

  it('unperturbed solve recovers x = (2, 0)', () => {
    const x = solveDense(A, b);
    expect(x).not.toBeNull();
    expect(relError(x!, xExact)).toBeLessThan(1e-8);
  });

  it('perturbing b₂ by ε swings x from (2, 0) to (1, 1) — algorithm fixed', () => {
    const x = solveIllPerturbed(ILL_EPS);
    expect(x).not.toBeNull();
    expect(x![0]).toBeCloseTo(1, 6);
    expect(x![1]).toBeCloseTo(1, 6);
  });

  it('measured amplification tracks κ', () => {
    const delta = ILL_EPS;
    const x = solveIllPerturbed(delta)!;
    const relB = Math.abs(delta) / Math.hypot(b[0], b[1]);
    const relX = relError(x, xExact);
    const amp = relX / relB;
    const k = condInf(A);
    // Amplification along this particular perturbation is within a small
    // factor of κ_∞; it is not κ to all digits, and it is not 1.
    expect(amp).toBeGreaterThan(k / 20);
    expect(amp).toBeLessThan(k * 2);
    expect(amp).toBeGreaterThan(1e6);
  });

  it('identity is well-conditioned', () => {
    expect(condInf([[1, 0], [0, 1]])).toBeCloseTo(1, 12);
  });
});

describe('backward-stable solve: tiny residual, κ ε digits of x', () => {
  const { A, b, xExact } = ill2x2();
  const x = solveDense(A, b)!;

  it('relative residual is O(ε) even though κ is 4×10⁸', () => {
    expect(relResidual(A, x, b)).toBeLessThan(1e-12);
  });

  it('forward error is O(κ ε), not O(ε) — about 7 digits remain', () => {
    const k = condInf(A);
    const forward = relError(x, xExact);
    expect(forward).toBeLessThan(k * Number.EPSILON * 100);
    expect(remainingDigits(k)).toBeGreaterThan(6);
    expect(remainingDigits(k)).toBeLessThan(8.5);
  });

  it('inverseDense composed with A recovers I', () => {
    const inv = inverseDense(A)!;
    const prod = A.map((row, i) => row.map((_, j) => row.reduce((s, a, k) => s + a * inv[k][j], 0)));
    expect(infNormMat(prod.map((row, i) => row.map((v, j) => v - (i === j ? 1 : 0))))).toBeLessThan(1e-6);
  });
});

describe('naive vs rearranged quadratic — well-conditioned roots, unstable algorithm', () => {
  it('for modest b the two algorithms agree', () => {
    const b = 10;
    const naive = naiveNearRoot(1, b, 1);
    const stable = quadraticStable(1, b, 1).near;
    expect(relRootError(naive, stable)).toBeLessThan(1e-12);
  });

  it('at b = 10⁸ the stable small root obeys Vieta to machine precision', () => {
    const b = 1e8;
    const { far, near } = quadraticStable(1, b, 1);
    expect(Math.abs(far * near - 1)).toBeLessThan(1e-12);
    expect(Math.abs(polyEval(1, b, 1, near))).toBeLessThan(1e-8);
    expect(Math.abs(polyEval(1, b, 1, far))).toBeLessThan(1e-6 * Math.abs(far) * b);
  });

  it('at b = 10⁸ the naive "+" root is the number the lesson quotes', () => {
    const b = 1e8;
    const truth = quadraticStable(1, b, 1).near;
    const naive = naiveNearRoot(1, b, 1);
    expect(Math.abs(naive + 7.45e-9) / 7.45e-9).toBeLessThan(0.01);
    expect(Math.abs(truth + 1e-8) / 1e-8).toBeLessThan(1e-10);
    expect(relRootError(naive, truth)).toBeGreaterThan(0.2);
    expect(relRootError(naive, truth)).toBeLessThan(0.3);
    // Polynomial residual at the naive root is not small — the algorithm
    // did not even land on a nearby problem.
    expect(Math.abs(polyEval(1, b, 1, naive))).toBeGreaterThan(Math.abs(polyEval(1, b, 1, truth)) * 1e3);
  });

  it('the naive far root (no cancellation) stays accurate', () => {
    const b = 1e8;
    const { minus } = quadraticNaive(1, b, 1);
    const { far } = quadraticStable(1, b, 1);
    expect(relRootError(minus, far)).toBeLessThan(1e-10);
  });

  it('the cliff where naive relative error crosses 1/2 sits near 10⁸, not 10²', () => {
    const cliff = naiveQuadraticCliff(0.5);
    expect(cliff).toBeGreaterThan(1e6);
    expect(cliff).toBeLessThan(1e10);
    const truth = quadraticStable(1, cliff, 1).near;
    expect(relRootError(naiveNearRoot(1, cliff, 1), truth)).toBeGreaterThanOrEqual(0.5);
  });
});
