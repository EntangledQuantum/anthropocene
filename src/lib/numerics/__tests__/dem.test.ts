import { describe, expect, it } from 'vitest';
import {
  angleOfRepose,
  contactDuration,
  createContact,
  createPile,
  createStack,
  dampingRatio,
  dampingRatioForRestitution,
  dashpotForRestitution,
  kineticEnergy,
  maxOverlap,
  measuredRestitution,
  normalForce,
  pairNormalForce,
  pairOverlap,
  reducedMass,
  REST_G,
  REST_KN,
  REST_MASS,
  REST_R,
  restOverlapRatio,
  restitutionOf,
  run,
  settle,
  staticNormalForce,
  TUNE_E,
  TUNE_ZETA,
} from '../dem.ts';

describe('linear spring-dashpot contact law', () => {
  it('is identically zero for separated discs', () => {
    expect(staticNormalForce(-0.01, 1000)).toBe(0);
    expect(staticNormalForce(0, 1000)).toBe(0);
    expect(normalForce(-0.02, -1, 1000, 5)).toBe(0);
    const s = createContact(-0.04);
    expect(pairOverlap(s)).toBeLessThan(0);
    expect(pairNormalForce(s)).toBe(0);
  });

  it('is k δ at rest once they overlap — the hockey stick', () => {
    expect(staticNormalForce(0.02, 800)).toBeCloseTo(16, 12);
    const s = createContact(0.03, 1200);
    expect(pairOverlap(s)).toBeCloseTo(0.03, 12);
    expect(pairNormalForce(s)).toBeCloseTo(1200 * 0.03, 8);
  });
});

describe('two-particle bounce with restitution', () => {
  it('the analytic e(ζ) inverts: ζ(e(ζ)) = ζ', () => {
    for (const z of [0.05, 0.15, 0.215, 0.4]) {
      expect(dampingRatioForRestitution(restitutionOf(z))).toBeCloseTo(z, 10);
    }
    expect(restitutionOf(0)).toBe(1);
    expect(restitutionOf(1)).toBe(0);
  });

  it('measured head-on bounce matches exp(−ζπ / √(1−ζ²))', () => {
    const z = TUNE_ZETA;
    const e = measuredRestitution(z);
    expect(e).toBeGreaterThan(0.42);
    expect(e).toBeLessThan(0.58);
    expect(e).toBeCloseTo(TUNE_E, 1);
    expect(e).toBeCloseTo(restitutionOf(z), 1);
  });

  it('heavier damping dumps more of the incoming speed', () => {
    const soft = measuredRestitution(0.08);
    const hard = measuredRestitution(0.45);
    expect(soft).toBeGreaterThan(hard + 0.15);
    expect(soft).toBeGreaterThan(0.7);
    expect(hard).toBeLessThan(0.35);
  });

  it('contact duration is the half-period of the overlap oscillator', () => {
    const kn = 8000;
    const mStar = reducedMass(1, 1);
    const gn = dashpotForRestitution(0.5, kn, mStar);
    const tc = contactDuration(kn, mStar, gn);
    expect(tc).toBeGreaterThan(0);
    expect(tc).toBeCloseTo(Math.PI / Math.sqrt(kn / mStar - (gn / (2 * mStar)) ** 2), 12);
    expect(dampingRatio(gn, kn, mStar)).toBeCloseTo(dampingRatioForRestitution(0.5), 10);
  });
});

describe('rest overlap vanishes as k → ∞', () => {
  it('a grain on a floor settles at δ ≈ mg / k_n', () => {
    const ratio = restOverlapRatio();
    const analytic = (REST_MASS * REST_G) / (REST_KN * REST_R);
    expect(ratio).toBeGreaterThan(0);
    expect(ratio).toBeCloseTo(analytic, 2);
    expect(ratio).toBeLessThan(0.02);
  });

  it('a two-particle stack: 100× stiffer is ~100× less overlap', () => {
    const soft = createStack(2_000);
    const stiff = createStack(200_000);
    settle(soft, 1e-8, 8_000);
    settle(stiff, 1e-8, 12_000);
    const dSoft = maxOverlap(soft);
    const dStiff = maxOverlap(stiff);
    expect(dSoft).toBeGreaterThan(0);
    expect(dStiff).toBeGreaterThan(0);
    expect(dStiff).toBeLessThan(dSoft / 20);
    expect(dStiff / REST_R).toBeLessThan(0.01);
    expect(kineticEnergy(stiff)).toBeLessThan(1e-4);
  });
});

describe('a small pile has a finite angle of repose', () => {
  it('frictionless discs slump; frictional discs hold a slope', () => {
    const bare = createPile({ mu: 0, muR: 0, cols: 4, rows: 5, kn: 1800, e: 0.3 });
    const held = createPile({ mu: 0.6, muR: 0.3, cols: 4, rows: 5, kn: 1800, e: 0.3 });
    settle(bare, 2e-4, 4_500);
    settle(held, 2e-4, 4_500);
    const a0 = angleOfRepose(bare);
    const a1 = angleOfRepose(held);
    expect(a1).toBeGreaterThan(12);
    expect(a1).toBeGreaterThan(a0 + 4);
    expect(a0).toBeLessThan(28);
  });
});

describe('a step actually moves the grains', () => {
  it('a pile under gravity picks up kinetic energy then can be marched', () => {
    const s = createPile({ cols: 3, rows: 3, kn: 2000 });
    expect(s.n).toBe(9);
    run(s, 40);
    expect(s.steps).toBe(40);
    expect(s.t).toBeGreaterThan(0);
    expect(kineticEnergy(s)).toBeGreaterThan(0);
  });
});
