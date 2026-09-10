import { describe, expect, it } from 'vitest';
import { SKETCH_SCENARIOS } from '../../../components/learn/sketch-scenarios.ts';
import { TUNE_SCENARIOS } from '../../../components/learn/tune-scenarios.ts';
import { mulberry32 } from '../monte-carlo.ts';
import {
  UQ_A0,
  UQ_A0_MEAN,
  UQ_DELTA,
  UQ_JENSEN_RATIO,
  UQ_LAMBDA,
  UQ_LAMBDA_MAX,
  UQ_LAMBDA_MEAN,
  UQ_LAMBDA_MIN,
  UQ_SKETCH_T,
  UQ_T_DEFAULT,
  defaultLambdaSample,
  envelopes,
  exactExpMean,
  exactPointEstimate,
  expPushforwardDensity,
  gaussian,
  histogram,
  jensenRatio,
  jensenTForRatio,
  jointSquare,
  linearMap,
  mean,
  oatCross,
  pairPush,
  push,
  pushRemaining,
  pushforwardSupport,
  remaining,
  sampleGaussian,
  sampleUniform,
  skewness,
  tailRatio,
  variance,
} from '../uq.ts';

const N = 8000;

describe('linear map: mean and variance scale', () => {
  it('Y = aX + b sends μ → aμ + b and σ² → a²σ² (Gaussian X)', () => {
    const a = 3;
    const b = -1;
    const mu = 0.4;
    const std = 0.25;
    const x = sampleGaussian(N, mu, std, mulberry32(11));
    const y = push(x, (v) => linearMap(v, a, b));
    expect(mean(y)).toBeCloseTo(a * mu + b, 1);
    expect(variance(y)).toBeCloseTo(a * a * std * std, 1);
    // Shape is preserved: skew stays ~0, tail ratio stays ~1.
    expect(Math.abs(skewness(y))).toBeLessThan(0.2);
    expect(tailRatio(y)).toBeGreaterThan(0.7);
    expect(tailRatio(y)).toBeLessThan(1.4);
  });

  it('the same scaling holds for Uniform X', () => {
    const a = 2;
    const b = 5;
    const lo = 0;
    const hi = 1;
    const x = sampleUniform(N, lo, hi, mulberry32(3));
    const y = push(x, (v) => linearMap(v, a, b));
    const mu = (lo + hi) / 2;
    const vX = ((hi - lo) ** 2) / 12;
    expect(mean(y)).toBeCloseTo(a * mu + b, 2);
    expect(variance(y)).toBeCloseTo(a * a * vX, 2);
  });
});

describe('nonlinear map fattens the tail', () => {
  it('exp(X) for X ~ N(0,1) is lognormal: mean e^{1/2}, fat right tail', () => {
    const x = sampleGaussian(N, 0, 1, mulberry32(19));
    const y = push(x, Math.exp);
    expect(mean(y)).toBeCloseTo(Math.exp(0.5), 1);
    expect(variance(y)).toBeCloseTo(Math.E * (Math.E - 1), 0);
    expect(Math.abs(skewness(x))).toBeLessThan(0.2);
    expect(skewness(y)).toBeGreaterThan(2);
    expect(tailRatio(x)).toBeGreaterThan(0.7);
    expect(tailRatio(x)).toBeLessThan(1.4);
    expect(tailRatio(y)).toBeGreaterThan(2.5);
  });

  it('remaining amplitude at T = 3 turns a symmetric λ-cloud into a right-skewed smear', () => {
    const lam = defaultLambdaSample(N, 5);
    const q = pushRemaining(lam, UQ_T_DEFAULT);
    expect(Math.abs(skewness(lam))).toBeLessThan(0.15);
    expect(skewness(q)).toBeGreaterThan(0.8);
    expect(tailRatio(q)).toBeGreaterThan(tailRatio(lam) * 1.4);
    const qMean = exactExpMean(UQ_LAMBDA_MIN, UQ_LAMBDA_MAX, UQ_T_DEFAULT);
    expect(mean(q)).toBeCloseTo(qMean, 2);
    expect(qMean).toBeGreaterThan(exactPointEstimate(UQ_LAMBDA_MEAN, UQ_T_DEFAULT));
  });
});

describe('Jensen gap of the exponential map', () => {
  it('E[e^{−λ T}] matches the closed form, and exceeds the point estimate', () => {
    const T = 3;
    const exact = exactExpMean(UQ_LAMBDA_MIN, UQ_LAMBDA_MAX, T);
    const point = exactPointEstimate(UQ_LAMBDA_MEAN, T);
    const ratio = Math.sinh(UQ_DELTA * T) / (UQ_DELTA * T);
    expect(exact / point).toBeCloseTo(ratio, 12);
    expect(jensenRatio(T)).toBeCloseTo(ratio, 12);
    expect(exact).toBeGreaterThan(point);
  });

  it('the gap is 1 at T = 0 and grows with T', () => {
    expect(jensenRatio(0)).toBeCloseTo(1, 12);
    expect(jensenRatio(1)).toBeGreaterThan(1.01);
    expect(jensenRatio(3)).toBeGreaterThan(jensenRatio(1));
    expect(jensenRatio(5)).toBeGreaterThan(jensenRatio(3));
  });

  it('jensenTForRatio inverts the gap: sinh(δ T)/(δ T) hits the target', () => {
    const T = jensenTForRatio(UQ_JENSEN_RATIO);
    expect(jensenRatio(T)).toBeCloseTo(UQ_JENSEN_RATIO, 8);
    expect(T).toBeGreaterThan(2);
    expect(T).toBeLessThan(4.5);
  });
});

describe('pushforward density of Uniform λ through exp(−λ T)', () => {
  it('is 1/((b−a) T y) on the image and integrates to 1', () => {
    const T = UQ_SKETCH_T;
    const [ymin, ymax] = pushforwardSupport(UQ_LAMBDA_MIN, UQ_LAMBDA_MAX, T);
    expect(expPushforwardDensity(ymin / 2, UQ_LAMBDA_MIN, UQ_LAMBDA_MAX, T)).toBe(0);
    expect(expPushforwardDensity((ymin + ymax) / 2, UQ_LAMBDA_MIN, UQ_LAMBDA_MAX, T)).toBeGreaterThan(0);
    // Midpoint quadrature of the exact density.
    const n = 400;
    let acc = 0;
    for (let i = 0; i < n; i++) {
      const y = ymin + ((i + 0.5) / n) * (ymax - ymin);
      acc += expPushforwardDensity(y, UQ_LAMBDA_MIN, UQ_LAMBDA_MAX, T);
    }
    acc *= (ymax - ymin) / n;
    expect(acc).toBeCloseTo(1, 2);
    // Mass piles at small y: density is larger at the left endpoint.
    const left = expPushforwardDensity(ymin + 1e-6, UQ_LAMBDA_MIN, UQ_LAMBDA_MAX, T);
    const right = expPushforwardDensity(ymax - 1e-6, UQ_LAMBDA_MIN, UQ_LAMBDA_MAX, T);
    expect(left).toBeGreaterThan(right * 1.5);
  });

  it('a Monte Carlo histogram of the push sits on the exact 1/y density', () => {
    const T = UQ_SKETCH_T;
    const lam = defaultLambdaSample(12_000, 2);
    const q = pushRemaining(lam, T);
    const [ymin, ymax] = pushforwardSupport(UQ_LAMBDA_MIN, UQ_LAMBDA_MAX, T);
    const pad = 1e-6;
    const hist = histogram(q, ymin + pad, ymax - pad, 16);
    let maxRel = 0;
    for (let i = 0; i < hist.centers.length; i++) {
      const exact = expPushforwardDensity(hist.centers[i]!, UQ_LAMBDA_MIN, UQ_LAMBDA_MAX, T);
      if (exact < 0.4) continue;
      maxRel = Math.max(maxRel, Math.abs(hist.density[i]! - exact) / exact);
    }
    expect(maxRel).toBeLessThan(0.25);
  });
});

describe('one-at-a-time misses the joint corners', () => {
  it('the joint range strictly contains the OAT envelope', () => {
    const env = envelopes(UQ_T_DEFAULT);
    expect(env.jointMin).toBeLessThan(env.oatMin);
    expect(env.jointMax).toBeGreaterThan(env.oatMax);
    // Floor is the small-A₀, large-λ corner; OAT λ-arm only reaches mean A₀.
    expect(env.jointMin).toBeCloseTo(remaining(UQ_A0.min, UQ_LAMBDA.max, UQ_T_DEFAULT), 12);
    expect(env.oatMin).toBeCloseTo(remaining(UQ_A0_MEAN, UQ_LAMBDA.max, UQ_T_DEFAULT), 12);
  });

  it('sampled OAT / joint ranges sit on the exact envelopes', () => {
    const T = UQ_T_DEFAULT;
    const env = envelopes(T);
    const oat = pairPush(oatCross(40), T);
    expect(Math.min(...oat)).toBeCloseTo(env.oatMin, 8);
    expect(Math.max(...oat)).toBeCloseTo(env.oatMax, 8);

    const qs = pairPush(jointSquare(6000, mulberry32(99)), T);
    const lo = Math.min(...qs);
    const hi = Math.max(...qs);
    // A finite sample will not hit the exact corners, but must breach OAT.
    expect(lo).toBeLessThan(env.oatMin);
    expect(hi).toBeGreaterThan(env.oatMax);
    expect(lo).toBeGreaterThan(env.jointMin * 0.5);
    expect(hi).toBeLessThan(env.jointMax * 1.5);
  });
});

describe('the model and the RNG', () => {
  it('remaining(1, 1, 0) is 1 and remaining is linear in A₀', () => {
    expect(remaining(1, 1, 0)).toBe(1);
    expect(remaining(2, 1, 3)).toBeCloseTo(2 * remaining(1, 1, 3), 12);
  });

  it('Box–Muller with a fixed seed is deterministic', () => {
    const a = mulberry32(4);
    const b = mulberry32(4);
    for (let i = 0; i < 8; i++) expect(gaussian(a)).toBe(gaussian(b));
  });
});

describe('lesson scenarios are the same code', () => {
  it('the sketch truth is the exact 1/q density, piled at small q', () => {
    const sc = SKETCH_SCENARIOS['uq-output-density'];
    expect(sc).toBeDefined();
    const pts = sc!.truth();
    expect(pts.length).toBeGreaterThan(20);
    expect(pts[0]!.y).toBeGreaterThan(pts[pts.length - 1]!.y * 1.5);
    for (const p of pts) {
      expect(p.y).toBeCloseTo(
        expPushforwardDensity(p.x, UQ_LAMBDA_MIN, UQ_LAMBDA_MAX, UQ_SKETCH_T),
        10,
      );
    }
  });

  it('the Tune target is the T where the Jensen ratio is 1.5', () => {
    const sc = TUNE_SCENARIOS['uq-jensen-t'];
    expect(sc).toBeDefined();
    expect(jensenRatio(sc!.target)).toBeCloseTo(UQ_JENSEN_RATIO, 6);
    const atTarget = sc!.compute(sc!.target);
    const ratio = Number(atTarget.readouts?.find((r) => r.label.includes('E[q] / q'))?.value);
    expect(ratio).toBeCloseTo(UQ_JENSEN_RATIO, 1);
  });
});
