import { describe, expect, it } from 'vitest';
import {
  PARTICLES, PBAR_COLLIDER_K, PBAR_FIXED_K, PBAR_STATE, allowed, betaOf, broken, burstMomentum,
  colliderEnergy, collisionOutcome, fixedTargetEnergy, ledger, totals, type ParticleKey,
} from '../particles.ts';

const R = (s: string) => s.split(' ') as ParticleKey[];

describe('the particle table', () => {
  it('antiparticles carry the same mass and every count negated', () => {
    for (const [a, b] of [['p', 'pbar'], ['n', 'nbar'], ['e-', 'e+'], ['nu_e', 'nubar_e'], ['pi+', 'pi-'], ['mu-', 'mu+']] as const) {
      expect(PARTICLES[b].mass).toBe(PARTICLES[a].mass);
      expect(PARTICLES[b].Q).toBe(-PARTICLES[a].Q);
      expect(PARTICLES[b].B).toBe(-PARTICLES[a].B);
      expect(PARTICLES[b].Le).toBe(-PARTICLES[a].Le);
      expect(PARTICLES[b].Lmu).toBe(-PARTICLES[a].Lmu);
    }
  });
  it('the neutron is heavier than proton + electron by about 0.78 MeV', () => {
    expect(PARTICLES.n.mass - PARTICLES.p.mass - PARTICLES['e-'].mass).toBeCloseTo(0.782, 2);
  });
});

describe('lesson 1, the hook: p → e⁺ + γ', () => {
  const l = ledger(['p'], R('e+ gamma'));
  it('keeps charge and has energy to spare', () => {
    expect(l.charge.ok).toBe(true);
    expect(l.energy.ok).toBe(true);
    expect(l.energy.before - l.energy.after).toBeGreaterThan(900);
  });
  it('breaks baryon number (1 → 0) and lepton number (0 → −1)', () => {
    expect(l.baryon).toEqual({ before: 1, after: 0, ok: false });
    expect(l.lepton).toEqual({ before: 0, after: -1, ok: false });
    expect(allowed(['p'], R('e+ gamma'))).toBe(false);
  });
});

describe('lesson 1, the ledger: n → p + e⁻ + ?', () => {
  it('only the electron antineutrino balances every count', () => {
    const fits = (['gamma', 'nu_e', 'nubar_e', 'e+', 'pi0'] as ParticleKey[]).filter((x) => allowed(['n'], ['p', 'e-', x]));
    expect(fits).toEqual(['nubar_e']);
  });
  it('each wrong choice breaks a specific count', () => {
    expect(broken(['n'], R('p e- gamma'))).toEqual(['lepton']);
    expect(broken(['n'], R('p e- nu_e'))).toEqual(['lepton']);
    expect(ledger(['n'], R('p e- nu_e')).lepton.after).toBe(2);
    expect(broken(['n'], R('p e- e+'))).toEqual(['charge']);
    expect(broken(['n'], R('p e- pi0'))).toEqual(['lepton', 'energy']);
  });
  it('without the third particle, lepton number goes 0 → 1', () => {
    expect(broken(['n'], R('p e-'))).toEqual(['lepton']);
  });
});

describe('lesson 1, the sort: which count breaks', () => {
  it('the electron cannot decay: e⁻ → νₑ + γ breaks charge only', () => {
    expect(broken(['e-'], R('nu_e gamma'))).toEqual(['charge']);
  });
  it('p → π⁺ + π⁰ breaks baryon number only', () => {
    expect(broken(['p'], R('pi+ pi0'))).toEqual(['baryon']);
  });
  it('π⁻ → μ⁻ + ν_μ breaks lepton number (0 → 2)', () => {
    expect(broken(['pi-'], R('mu- nu_mu'))).toEqual(['lepton']);
    expect(ledger(['pi-'], R('mu- nu_mu')).lepton.after).toBe(2);
  });
  it('π⁻ → e⁻ + νₑ breaks lepton number (0 → 2); with ν̄ₑ it is a real, rare decay', () => {
    expect(broken(['pi-'], R('e- nu_e'))).toEqual(['lepton']);
    expect(allowed(['pi-'], R('e- nubar_e'))).toBe(true);
  });
  it('the real ones keep every count', () => {
    expect(allowed(['pi+'], R('mu+ nu_mu'))).toBe(true);
    expect(allowed(['pi-'], R('mu- nubar_mu'))).toBe(true);
    expect(allowed(R('e+ e-'), R('gamma gamma'))).toBe(true);
    expect(allowed(R('p pbar'), R('pi+ pi- pi0'))).toBe(true);
    expect(allowed(['mu-'], R('e- nubar_e nu_mu'))).toBe(true);
  });
  it('a free proton cannot β⁺-decay: the counts balance but the neutron is heavier', () => {
    expect(broken(['p'], R('n e+ nu_e'))).toEqual(['energy']);
  });
});

describe('lesson 1, the collider: antimatter comes in pairs', () => {
  it('the lightest antiproton state from p + p is p p p p̄', () => {
    expect(PBAR_STATE.keys).toEqual(R('p p p pbar'));
    expect(PBAR_STATE.mass).toBeCloseTo(4 * PARTICLES.p.mass, 6);
  });
  it('each beam needs one proton rest energy, 938 MeV', () => {
    expect(PBAR_COLLIDER_K).toBeCloseTo(PARTICLES.p.mass, 6);
  });
  it('the naive half-a-proton per beam is exactly enough for p p p̄, which breaks charge and baryon number', () => {
    const naive = PARTICLES.p.mass / 2;
    expect(colliderEnergy(naive)).toBeCloseTo(3 * PARTICLES.p.mass, 6);
    expect(broken(R('p p'), R('p p pbar'))).toEqual(['charge', 'baryon']);
    expect(collisionOutcome(naive)).not.toContain('pbar');
  });
  it('against a proton at rest the same state costs 6 m_p c², 5.6 GeV', () => {
    expect(PBAR_FIXED_K / PARTICLES.p.mass).toBeCloseTo(6, 6);
    expect(PBAR_FIXED_K).toBeCloseTo(5630, -1);
    expect(fixedTargetEnergy(PBAR_FIXED_K)).toBeCloseTo(PBAR_STATE.mass, 6);
  });
  it('every outcome the scene shows keeps every count and fits the energy', () => {
    for (let K = 0; K <= 2000; K += 7) {
      const out = collisionOutcome(K);
      expect(allowed(R('p p'), out)).toBe(true);
      expect(totals(out).mass).toBeLessThanOrEqual(colliderEnergy(K) + 1e-9);
      expect(out.includes('pbar')).toBe(K >= PBAR_COLLIDER_K);
    }
  });
});

describe('burst kinematics', () => {
  it('shares the energy exactly and stays below light speed', () => {
    const m = [PARTICLES.p.mass, PARTICLES['e-'].mass, 0];
    const M = PARTICLES.n.mass;
    const p = burstMomentum(m, M);
    expect(m.reduce((s, mi) => s + Math.sqrt(p * p + mi * mi), 0)).toBeCloseTo(M, 6);
    expect(betaOf(p, PARTICLES.p.mass)).toBeLessThan(0.01);
    expect(betaOf(p, 0)).toBe(1);
  });
  it('is zero when there is no energy to spare', () => {
    expect(burstMomentum([PARTICLES.p.mass, PARTICLES.p.mass], 2 * PARTICLES.p.mass)).toBe(0);
  });
});
