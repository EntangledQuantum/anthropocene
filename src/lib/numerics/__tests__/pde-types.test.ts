import { describe, expect, it } from 'vitest';
import { solveDense } from '../linalg.ts';
import {
  advect, affineSequence, applyMatrix, bump, bumpD2, continuumEigenvalue,
  dalembert, dependenceInterval, dependenceWidth, dirichletEigenvalue,
  dirichletLaplacian, heatKernel, heatKernelRatio, laplacianError,
  observedLaplacianOrder, periodicLaplacian, poissonGreen, poissonSolve,
  sampleField, secondDiff,
} from '../pde-types.ts';

const ORDER_TOL = 0.25;

describe('interior second difference has a two-dimensional kernel', () => {
  it('kills constants and linear ramps on five samples', () => {
    const h = 1;
    const n = 5;
    const constant = secondDiff(affineSequence(n, 3, 0), h);
    const ramp = secondDiff(affineSequence(n, -1, 2), h);
    for (const v of [...constant, ...ramp]) expect(Math.abs(v)).toBeLessThan(1e-12);
  });

  it('does not kill a quadratic — second differences recover 2', () => {
    const h = 0.25;
    const u = affineSequence(6, 0, 0).map((_, i) => (i * h) ** 2);
    const d2 = secondDiff(u, h);
    for (const v of d2) expect(v).toBeCloseTo(2, 12);
  });
});

describe('Poisson needs a boundary', () => {
  it('Dirichlet Laplacian is invertible — unique field for any interior load', () => {
    const n = 5;
    const f = [1, -2, 0.5, 3, -1];
    const u = poissonSolve(f, 0, 0);
    expect(u).not.toBeNull();
    const residual = applyMatrix(dirichletLaplacian(n), u!);
    for (let i = 0; i < n; i++) expect(residual[i]).toBeCloseTo(f[i], 10);
  });

  it('changing either endpoint moves the interior, even when f = 0', () => {
    const n = 7;
    const fromLeft = poissonSolve(new Array(n).fill(0), 1, 0)!;
    const fromRight = poissonSolve(new Array(n).fill(0), 0, 1)!;
    expect(fromLeft[0]).toBeGreaterThan(fromRight[0] + 0.4);
    expect(fromRight[n - 1]).toBeGreaterThan(fromLeft[n - 1] + 0.4);
  });

  it('the homogeneous line u(x) = x is recovered from f = 0, α = 0, β = 1', () => {
    const n = 8;
    const u = poissonSolve(new Array(n).fill(0), 0, 1)!;
    const h = 1 / (n + 1);
    for (let i = 0; i < n; i++) expect(u[i]).toBeCloseTo((i + 1) * h, 12);
  });

  it('periodic Laplacian annihilates constants and is singular', () => {
    const n = 6;
    const A = periodicLaplacian(n);
    const ones = new Array(n).fill(1);
    for (const v of applyMatrix(A, ones)) expect(Math.abs(v)).toBeLessThan(1e-12);
    expect(solveDense(A, ones)).toBeNull();
  });

  it('periodic Poisson is inconsistent unless the load sums to zero', () => {
    const n = 5;
    const A = periodicLaplacian(n);
    expect(solveDense(A, [1, 0, 0, 0, 0])).toBeNull();
  });

  it("Green's function is positive in (0,1) and zero at both ends", () => {
    const xi = 0.4;
    expect(poissonGreen(0, xi)).toBeCloseTo(0, 12);
    expect(poissonGreen(1, xi)).toBeCloseTo(0, 12);
    expect(poissonGreen(xi, xi)).toBeCloseTo(xi * (1 - xi), 12);
    expect(poissonGreen(0.2, xi)).toBeGreaterThan(0);
    expect(poissonGreen(0.8, xi)).toBeGreaterThan(0);
  });
});

describe('continuum limit: discrete D² → u″ at order 2', () => {
  const f = (x: number) => Math.sin(Math.PI * x);
  const d2f = (x: number) => -Math.PI * Math.PI * Math.sin(Math.PI * x);

  it('measured order on sin(πx) is 2', () => {
    const p = observedLaplacianOrder(9, f, d2f);
    expect(p).toBeGreaterThan(2 - ORDER_TOL);
    expect(p).toBeLessThan(2 + ORDER_TOL);
  });

  it('the same bump in two costumes is the same list of numbers', () => {
    const n = 8;
    const particles = sampleField(n, bump);
    const samples = sampleField(n, bump);
    expect(particles.u).toEqual(samples.u);
    expect(particles.x).toEqual(samples.x);
  });

  it('refining the bump samples drives D² toward the exact second derivative', () => {
    const coarse = laplacianError(9, bump, bumpD2);
    const fine = laplacianError(33, bump, bumpD2);
    expect(fine).toBeLessThan(coarse / 10);
  });

  it('Dirichlet fundamental eigenvalue approaches π² as n grows', () => {
    const target = continuumEigenvalue(1);
    const e4 = Math.abs(dirichletEigenvalue(4, 1) - target) / target;
    const e32 = Math.abs(dirichletEigenvalue(32, 1) - target) / target;
    expect(e4).toBeGreaterThan(0.02);
    expect(e32).toBeLessThan(0.001);
    expect(e32).toBeLessThan(e4 / 20);
  });
});

describe('domains of dependence — three personalities', () => {
  it('hyperbolic: a triangle of width 2ct, clipped to the interval', () => {
    const d = dependenceInterval('hyperbolic', 0.5, 0.2, { c: 1 });
    expect(d.lo).toBeCloseTo(0.3, 12);
    expect(d.hi).toBeCloseTo(0.7, 12);
    expect(d.whole).toBe(false);
    expect(d.leftBoundary).toBe(false);
    expect(d.rightBoundary).toBe(false);
    expect(dependenceWidth('hyperbolic', 0.5, 0.2)).toBeCloseTo(0.4, 12);
  });

  it('hyperbolic: past t = 1/(2c) the midpoint triangle hits both walls', () => {
    const d = dependenceInterval('hyperbolic', 0.5, 0.6, { c: 1 });
    expect(d.lo).toBe(0);
    expect(d.hi).toBe(1);
    expect(d.whole).toBe(true);
    expect(d.leftBoundary).toBe(true);
    expect(d.rightBoundary).toBe(true);
  });

  it("d'Alembert ignores data outside [x−ct, x+ct]", () => {
    const gInside = (x: number) => bump(x);
    const gPerturbed = (x: number) => bump(x) + (Math.abs(x - 0.5) > 0.25 ? 10 : 0);
    const x = 0.5;
    const t = 0.2;
    expect(dalembert(gInside, x, t)).toBeCloseTo(dalembert(gPerturbed, x, t), 12);
    expect(dalembert(gInside, x, 0.4)).not.toBeCloseTo(dalembert(gPerturbed, x, 0.4), 5);
  });

  it('parabolic: the whole interval the instant t > 0', () => {
    const atRest = dependenceInterval('parabolic', 0.5, 0);
    const later = dependenceInterval('parabolic', 0.5, 1e-9);
    expect(atRest.whole).toBe(false);
    expect(later.whole).toBe(true);
    expect(later.leftBoundary).toBe(true);
    expect(later.rightBoundary).toBe(true);
    expect(dependenceWidth('parabolic', 0.5, 0.01)).toBe(1);
  });

  it('heat kernel is strictly positive everywhere for t > 0', () => {
    const t = 0.05;
    expect(heatKernel(0, t)).toBeGreaterThan(0);
    expect(heatKernel(1, t)).toBeGreaterThan(0);
    expect(heatKernel(10, t)).toBeGreaterThan(0);
    expect(heatKernel(1, 0)).toBe(0);
  });

  it('heat tail at distance 1, t = 0.05, κ = 1 is exp(5) times smaller than the peak', () => {
    const ratio = heatKernelRatio(1, 0.05);
    expect(ratio).toBeCloseTo(Math.exp(5), 10);
    expect(heatKernel(0, 0.05) / heatKernel(1, 0.05)).toBeCloseTo(ratio, 10);
  });

  it('elliptic: the whole interval, always, both ends, no time', () => {
    const d = dependenceInterval('elliptic', 0.2, 0);
    expect(d.lo).toBe(0);
    expect(d.hi).toBe(1);
    expect(d.whole).toBe(true);
    expect(d.leftBoundary).toBe(true);
    expect(d.rightBoundary).toBe(true);
    expect(dependenceWidth('elliptic', 0.9, 99)).toBe(1);
  });

  it('right-going advection at (0.2, 0.5) has already left the interval — needs the left wall', () => {
    const foot = 0.2 - 1 * 0.5;
    expect(foot).toBeLessThan(0);
    const g = (x: number) => (x < 0 ? 7 : bump(x));
    expect(advect(g, 0.2, 0.5)).toBe(7);
    expect(advect(bump, 0.8, 0.2)).toBeCloseTo(bump(0.6), 12);
  });
});
