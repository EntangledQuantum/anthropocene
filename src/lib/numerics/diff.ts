/** Finite-difference derivative estimators, plus the exact-derivative
 *  reference used to measure how badly each one does. */

export type Fn = (x: number) => number;

export const forwardDifference = (f: Fn, x: number, h: number) => (f(x + h) - f(x)) / h;

export const backwardDifference = (f: Fn, x: number, h: number) => (f(x) - f(x - h)) / h;

export const centralDifference = (f: Fn, x: number, h: number) => (f(x + h) - f(x - h)) / (2 * h);

/** Five-point stencil: fourth-order accurate. */
export const fivePoint = (f: Fn, x: number, h: number) =>
  (-f(x + 2 * h) + 8 * f(x + h) - 8 * f(x - h) + f(x - 2 * h)) / (12 * h);

/**
 * Complex-step derivative.
 *
 * The trick that dodges the entire truncation/roundoff tradeoff: because there
 * is no subtraction of nearby values, there is no cancellation, so h can be
 * made absurdly small (1e-200) and the estimate is accurate to machine
 * precision. It requires f to be analytic and implemented in complex
 * arithmetic, which is the real cost.
 */
export function complexStep(fComplex: (re: number, im: number) => [number, number], x: number, h: number): number {
  return fComplex(x, h)[1] / h;
}

export interface DiffScheme {
  key: string;
  label: string;
  order: number;
  /** f-evaluations per estimate. */
  cost: number;
  apply: (f: Fn, x: number, h: number) => number;
}

export const SCHEMES: DiffScheme[] = [
  { key: 'forward', label: 'Forward', order: 1, cost: 2, apply: forwardDifference },
  { key: 'central', label: 'Central', order: 2, cost: 2, apply: centralDifference },
  { key: 'five-point', label: 'Five-point', order: 4, cost: 4, apply: fivePoint },
];

/** A test function with an exact derivative, for measuring true error. */
export interface DiffTarget {
  key: string;
  label: string;
  latex: string;
  f: Fn;
  df: Fn;
  /** Complex-arithmetic version, when available. */
  fComplex?: (re: number, im: number) => [number, number];
  x0: number;
}

export const TARGETS: Record<string, DiffTarget> = {
  sin: {
    key: 'sin',
    label: 'sin(x) at x = 1',
    latex: String.raw`f(x) = \sin x`,
    f: Math.sin,
    df: Math.cos,
    // sin(a + bi) = sin a cosh b + i cos a sinh b
    fComplex: (re, im) => [Math.sin(re) * Math.cosh(im), Math.cos(re) * Math.sinh(im)],
    x0: 1,
  },
  exp: {
    key: 'exp',
    label: 'exp(x) at x = 0.5',
    latex: String.raw`f(x) = e^{x}`,
    f: Math.exp,
    df: Math.exp,
    fComplex: (re, im) => [Math.exp(re) * Math.cos(im), Math.exp(re) * Math.sin(im)],
    x0: 0.5,
  },
  poly: {
    key: 'poly',
    label: 'x³ − 2x at x = 1.5',
    latex: String.raw`f(x) = x^3 - 2x`,
    f: (x) => x ** 3 - 2 * x,
    df: (x) => 3 * x ** 2 - 2,
    x0: 1.5,
  },
};

/** Error of one scheme across a geometric sweep of step sizes. */
export function diffSweep(
  scheme: DiffScheme,
  target: DiffTarget,
  hs: number[],
): { h: number; error: number }[] {
  const truth = target.df(target.x0);
  return hs.map((h) => ({
    h,
    // Floor at ~1e-18 so a lucky exact hit still plots on log axes.
    error: Math.max(Math.abs(scheme.apply(target.f, target.x0, h) - truth), 1e-18),
  }));
}

/** Geometric sweep spanning many decades — the U-curve needs the full range. */
export const hSweep = (from = 1e-1, to = 1e-16, perDecade = 4): number[] => {
  const decades = Math.log10(from / to);
  const n = Math.round(decades * perDecade);
  return Array.from({ length: n + 1 }, (_, i) => from * 10 ** (-(i / perDecade)));
};

/**
 * Theoretical optimal step for a p-th order scheme, balancing truncation
 * (~h^p) against roundoff (~eps/h). This is what the bottom of the U-curve
 * should line up with — and checking that it does is the point.
 */
export const optimalStep = (order: number, eps = Number.EPSILON): number =>
  eps ** (1 / (order + 1));
