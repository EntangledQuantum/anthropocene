import { describe, expect, it } from 'vitest';
import { periodicGrid, wrap } from '../pde1d.ts';
import {
  ADVECTION_C,
  JUMP_LEFT,
  JUMP_RIGHT,
  physicalFlux,
  rankineHugoniot,
} from '../fvm1d.ts';
import {
  GAMMA,
  SOD_LEFT,
  SOD_RIGHT,
  eulerStar,
  godunovFlux,
  laxWendroffFlux,
  meanFlux,
  measuredShockSpeed,
  osherFlux,
  overshoot,
  riemannState,
  runRiemann,
  sampleSod,
  scalarRiemann,
  sodExact,
  sodWaves,
  stepRiemann,
  totalMass,
  totalVariation,
  waveKind,
} from '../riemann.ts';

/* Pedagogical claims of the Riemann / Godunov lesson. If the lesson says
   Burgers shocks move at Rankine–Hugoniot speed, that Godunov is conservative,
   that a centred flux rings at a jump, or that the transonic rarefaction
   sends flux 0, this file pins it. */

describe('Rankine–Hugoniot for Burgers', () => {
  it('gives s = (uL + uR)/2, so a 1|0 jump has s = 1/2', () => {
    expect(rankineHugoniot('burgers', 1, 0)).toBeCloseTo(0.5, 12);
    expect(rankineHugoniot('burgers', 2, -1)).toBeCloseTo(0.5, 12);
    expect(rankineHugoniot('advection', 1, 0)).toBeCloseTo(ADVECTION_C, 12);
  });

  it('Godunov moves a Burgers 1|0 jump at that speed', () => {
    const s = measuredShockSpeed({ scheme: 'godunov', n: 96, tEnd: 0.35 });
    expect(s).toBeCloseTo(rankineHugoniot('burgers', JUMP_LEFT, JUMP_RIGHT), 1);
    expect(s).toBeGreaterThan(0.35);
    expect(s).toBeLessThan(0.65);
  });
});

describe('Godunov flux is f(û(0))', () => {
  it('is consistent: F(u, u) = f(u)', () => {
    for (const u of [-1.5, 0, 0.3, 1, 2]) {
      expect(godunovFlux('advection', u, u)).toBeCloseTo(physicalFlux('advection', u), 12);
      expect(godunovFlux('burgers', u, u)).toBeCloseTo(physicalFlux('burgers', u), 12);
    }
  });

  it('reduces to upwind for linear advection', () => {
    expect(godunovFlux('advection', 0.8, 0.2, 1)).toBeCloseTo(0.8, 12);
    expect(godunovFlux('advection', 0.2, 0.8, 1)).toBeCloseTo(0.2, 12);
    expect(godunovFlux('advection', 0.8, 0.2, -1)).toBeCloseTo(-0.2, 12);
  });

  it('for a right-going Burgers shock 1|0, the face sees the left state: F = 1/2', () => {
    expect(waveKind('burgers', 1, 0)).toBe('shock');
    expect(scalarRiemann('burgers', 1, 0).star).toBeCloseTo(1, 12);
    expect(godunovFlux('burgers', 1, 0)).toBeCloseTo(0.5, 12);
    expect(riemannState('burgers', 1, 0, 0)).toBeCloseTo(1, 12);
  });

  it('for a right-going rarefaction 0|1, the face sees 0: F = 0', () => {
    expect(waveKind('burgers', 0, 1)).toBe('rarefaction');
    expect(godunovFlux('burgers', 0, 1)).toBeCloseTo(0, 12);
    expect(riemannState('burgers', 0, 1, 0)).toBeCloseTo(0, 12);
  });

  it('matches the Osher min/max formula on a grid of states', () => {
    const vals = [-2, -1, -0.3, 0, 0.5, 1, 2];
    for (const uL of vals) {
      for (const uR of vals) {
        expect(godunovFlux('burgers', uL, uR)).toBeCloseTo(osherFlux('burgers', uL, uR), 12);
        expect(godunovFlux('advection', uL, uR)).toBeCloseTo(osherFlux('advection', uL, uR), 12);
      }
    }
  });
});

describe('entropy: transonic rarefaction is not a stationary shock', () => {
  it('Burgers −1|1: Godunov flux is 0, not the entropy-violating 1/2', () => {
    expect(waveKind('burgers', -1, 1)).toBe('rarefaction');
    expect(godunovFlux('burgers', -1, 1)).toBeCloseTo(0, 12);
    expect(riemannState('burgers', -1, 1, 0)).toBeCloseTo(0, 12);
    // Averaging the fluxes (or connecting with a shock) would send 1/2.
    expect(meanFlux('burgers', -1, 1)).toBeCloseTo(0.5, 12);
    expect(rankineHugoniot('burgers', -1, 1)).toBeCloseTo(0, 12);
  });

  it('the rarefaction fan is u = ξ between the two states', () => {
    expect(riemannState('burgers', -1, 1, -1.5)).toBeCloseTo(-1, 12);
    expect(riemannState('burgers', -1, 1, -0.4)).toBeCloseTo(-0.4, 12);
    expect(riemannState('burgers', -1, 1, 0.7)).toBeCloseTo(0.7, 12);
    expect(riemannState('burgers', -1, 1, 1.5)).toBeCloseTo(1, 12);
  });
});

describe('Godunov is conservative', () => {
  it('a Godunov step conserves mass to roundoff, two cells, Burgers jump', () => {
    const q0 = [1, 0];
    const dx = 0.5;
    const mass0 = totalMass(q0, dx);
    let q = q0.slice();
    for (let k = 0; k < 400; k++) {
      q = stepRiemann(q, 'burgers', 'godunov', 0.4).next;
    }
    expect(totalMass(q, dx)).toBeCloseTo(mass0, 12);
  });

  it('periodic Godunov conserves Burgers and advection to roundoff', () => {
    for (const eq of ['advection', 'burgers'] as const) {
      for (const initial of ['pulse', 'jump'] as const) {
        const run = runRiemann({
          equation: eq, scheme: 'godunov', initial, n: 64, cfl: 0.4, tEnd: 0.6,
        });
        expect(run.diverged).toBe(false);
        const rel = Math.abs(run.mass - run.mass0) / (Math.abs(run.mass0) + 1e-15);
        expect(rel).toBeLessThan(1e-12);
      }
    }
  });

  it('interior fluxes telescope: the periodic sum of flux differences is 0', () => {
    const q = [1, 0.2, 0.8, 0, -0.4, 1.1];
    const { fluxes } = stepRiemann(q, 'burgers', 'godunov', 0.3);
    const n = q.length;
    let s = 0;
    for (let i = 0; i < n; i++) s += fluxes[i]! - fluxes[wrap(i - 1, n)]!;
    expect(Math.abs(s)).toBeLessThan(1e-14);
  });
});

describe('Godunov stays monotone; a centred flux oscillates at a jump', () => {
  it('Godunov on a linear-advection jump does not overshoot', () => {
    const run = runRiemann({
      equation: 'advection', scheme: 'godunov', initial: 'jump',
      n: 64, cfl: 0.4, tEnd: 0.35,
    });
    expect(run.diverged).toBe(false);
    expect(run.overshoot).toBeLessThan(1e-12);
    expect(run.tv).toBeLessThanOrEqual(run.tv0 + 1e-12);
  });

  it('Lax–Wendroff on the same jump rings: overshoot and TV both grow', () => {
    const run = runRiemann({
      equation: 'advection', scheme: 'centered', initial: 'jump',
      n: 64, cfl: 0.4, tEnd: 0.35,
    });
    expect(run.diverged).toBe(false);
    expect(run.overshoot).toBeGreaterThan(0.04);
    expect(run.tv).toBeGreaterThan(run.tv0 + 0.05);
  });

  it('Godunov on a Burgers 1|0 jump stays inside [0, 1]', () => {
    const run = runRiemann({
      equation: 'burgers', scheme: 'godunov', initial: 'jump',
      n: 80, cfl: 0.4, tEnd: 0.3,
    });
    expect(run.diverged).toBe(false);
    expect(run.overshoot).toBeLessThan(1e-12);
    const lo = Math.min(...run.q);
    const hi = Math.max(...run.q);
    expect(lo).toBeGreaterThan(-1e-12);
    expect(hi).toBeLessThan(1 + 1e-12);
  });

  it('the centred (Richtmyer) flux of a jump is not the Godunov flux', () => {
    // Right-going Burgers shock: Godunov sends 1/2; the arithmetic mean sends 1/4.
    expect(godunovFlux('burgers', 1, 0)).toBeCloseTo(0.5, 12);
    expect(meanFlux('burgers', 1, 0)).toBeCloseTo(0.25, 12);
    const lw = laxWendroffFlux('burgers', 1, 0, 0.4);
    expect(Math.abs(lw - 0.5)).toBeGreaterThan(0.05);
  });
});

describe('Sod shock tube — the Euler costume', () => {
  it('star pressure sits strictly between the two chamber pressures', () => {
    const star = eulerStar(SOD_LEFT, SOD_RIGHT);
    expect(star.p).toBeGreaterThan(SOD_RIGHT.p);
    expect(star.p).toBeLessThan(SOD_LEFT.p);
    expect(star.p).toBeGreaterThan(0.28);
    expect(star.p).toBeLessThan(0.32);
    expect(star.u).toBeGreaterThan(0.9);
    expect(star.u).toBeLessThan(0.95);
  });

  it('three waves: left rarefaction, contact, right shock, in that order', () => {
    const w = sodWaves();
    expect(w.rarefactionHead).toBeLessThan(0);
    expect(w.rarefactionTail).toBeGreaterThan(w.rarefactionHead);
    expect(w.contact).toBeGreaterThan(w.rarefactionTail);
    expect(w.shock).toBeGreaterThan(w.contact);
    expect(w.shock).toBeGreaterThan(1.5);
  });

  it('density jumps three times; pressure is flat across the contact', () => {
    const t = 0.2;
    const w = sodWaves();
    const x0 = 0.5;
    const left = sodExact(0.1, t);
    const fan = sodExact(x0 + 0.5 * (w.rarefactionHead + w.rarefactionTail) * t, t);
    const starL = sodExact(x0 + 0.5 * (w.rarefactionTail + w.contact) * t, t);
    const starR = sodExact(x0 + 0.5 * (w.contact + w.shock) * t, t);
    const right = sodExact(0.95, t);

    expect(left.rho).toBeCloseTo(SOD_LEFT.rho, 8);
    expect(right.rho).toBeCloseTo(SOD_RIGHT.rho, 8);
    expect(starL.p).toBeCloseTo(starR.p, 8);
    expect(starL.u).toBeCloseTo(starR.u, 8);
    expect(Math.abs(starL.rho - starR.rho)).toBeGreaterThan(0.1);
    expect(fan.rho).toBeGreaterThan(starL.rho);
    expect(fan.rho).toBeLessThan(left.rho);
  });

  it('samples a monotone-in-x rarefaction and a jump at the shock', () => {
    const profile = sampleSod(0.2, 400);
    const w = sodWaves();
    const xShock = 0.5 + w.shock * 0.2;
    const before = profile.find((p) => p.x > xShock - 0.04 && p.x < xShock - 0.01)!;
    const after = profile.find((p) => p.x > xShock + 0.01 && p.x < xShock + 0.04)!;
    expect(before.rho).toBeGreaterThan(after.rho + 0.1);
    expect(before.p).toBeGreaterThan(after.p + 0.1);
  });

  it('γ-law sound speed on the left chamber is √γ', () => {
    const a = Math.sqrt(GAMMA * SOD_LEFT.p / SOD_LEFT.rho);
    expect(sodWaves().rarefactionHead).toBeCloseTo(-a, 12);
  });
});

describe('periodic helpers stay honest', () => {
  it('a two-cell Godunov ring has matching opposite fluxes', () => {
    const q = [1, 0];
    const { fluxes } = stepRiemann(q, 'burgers', 'godunov', 0.4);
    // Face 0: 1|0, Godunov F = 1/2. Face 1: 0|1, rarefaction F = 0.
    expect(fluxes[0]).toBeCloseTo(0.5, 12);
    expect(fluxes[1]).toBeCloseTo(0, 12);
    const { x } = periodicGrid(2);
    expect(x).toHaveLength(2);
  });

  it('overshoot of a field already inside [lo, hi] is zero', () => {
    expect(overshoot([0, 0.4, 1, 0.2], 0, 1)).toBe(0);
    expect(overshoot([0, 1.2], 0, 1)).toBeCloseTo(0.2, 12);
    expect(totalVariation([1, 0, 1, 0])).toBeCloseTo(4, 12);
  });
});
