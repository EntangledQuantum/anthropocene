import { describe, expect, it } from 'vitest';
import { periodicGrid, wrap } from '../pde1d.ts';
import {
  ADVECTION_C,
  JUMP_AT,
  JUMP_LEFT,
  JUMP_RIGHT,
  fallingCrossing,
  lambdaFromCfl,
  maxFaceMismatch,
  measuredShockSpeed,
  physicalFlux,
  rankineHugoniot,
  runFvm,
  rusanovFlux,
  sineWave,
  squareWave,
  stepFvm,
  totalMass,
  waveSpeed,
} from '../fvm1d.ts';

/* Pedagogical claims of the finite-volume lesson. If the lesson says a
   conservative update conserves to roundoff, that a chain-rule Burgers
   scheme leaks at a jump, or that Rankine–Hugoniot is [f]/[u], this file
   pins it. */

describe('Rusanov flux', () => {
  it('is consistent: F(u, u) = f(u)', () => {
    for (const u of [-1.5, 0, 0.3, 1, 2]) {
      expect(rusanovFlux('advection', u, u)).toBeCloseTo(physicalFlux('advection', u), 12);
      expect(rusanovFlux('burgers', u, u)).toBeCloseTo(physicalFlux('burgers', u), 12);
    }
  });

  it('reduces to upwind for linear advection with c > 0', () => {
    // F = ½ c (uL + uR) − ½ |c| (uR − uL) = c uL when c > 0.
    expect(rusanovFlux('advection', 0.8, 0.2, 1)).toBeCloseTo(0.8, 12);
    expect(rusanovFlux('advection', 0.2, 0.8, 1)).toBeCloseTo(0.2, 12);
  });
});

describe('Rankine–Hugoniot', () => {
  it('gives s = (uL + uR)/2 for Burgers and s = c for advection', () => {
    expect(rankineHugoniot('burgers', 1, 0)).toBeCloseTo(0.5, 12);
    expect(rankineHugoniot('burgers', 2, -1)).toBeCloseTo(0.5, 12);
    expect(rankineHugoniot('advection', 1, 0)).toBeCloseTo(ADVECTION_C, 12);
    // Smooth limit: s → f'(u).
    expect(rankineHugoniot('burgers', 0.7, 0.7)).toBeCloseTo(waveSpeed('burgers', 0.7), 12);
  });
});

describe('discrete conservation is an identity', () => {
  it('a conservative step conserves mass to roundoff, any flux, two cells', () => {
    const q0 = [1, 0];
    const dx = 0.5;
    const mass0 = totalMass(q0, dx);
    let q = q0.slice();
    const lambda = 0.4;
    for (let k = 0; k < 400; k++) {
      q = stepFvm(q, 'burgers', 'conservative', lambda).next;
    }
    expect(totalMass(q, dx)).toBeCloseTo(mass0, 12);
  });

  it('periodic conservative Rusanov conserves Burgers and advection to roundoff', () => {
    for (const eq of ['advection', 'burgers'] as const) {
      for (const initial of ['pulse', 'jump'] as const) {
        const run = runFvm({ equation: eq, scheme: 'conservative', initial, n: 64, cfl: 0.4, tEnd: 0.6 });
        expect(run.diverged).toBe(false);
        const rel = Math.abs(run.mass - run.mass0) / (Math.abs(run.mass0) + 1e-15);
        expect(rel).toBeLessThan(1e-12);
      }
    }
  });

  it('shared-face fluxes match, so the pair-sum contribution of each face is zero', () => {
    const q = [1, 0.2, 0.8, 0];
    const { faces } = stepFvm(q, 'burgers', 'conservative', 0.3);
    expect(maxFaceMismatch(faces)).toBe(0);
    // Cell i loses F_i, cell i+1 gains the same F_i.
    for (let i = 0; i < q.length; i++) {
      expect(faces.fromLeft[i]).toBe(faces.fromRight[i]);
    }
  });

  it('the telescoping sum of flux differences is identically zero (periodic)', () => {
    const q = squareWave(periodicGrid(32).x);
    const { faces } = stepFvm(q, 'burgers', 'conservative', 0.4);
    const n = q.length;
    let s = 0;
    for (let i = 0; i < n; i++) {
      s += faces.fromLeft[i]! - faces.fromLeft[wrap(i - 1, n)]!;
    }
    expect(Math.abs(s)).toBeLessThan(1e-14);
  });
});

describe('non-conservative chain-rule leaks at a jump', () => {
  it('Burgers jump: global mass drifts by a visible amount', () => {
    const run = runFvm({
      equation: 'burgers', scheme: 'nonconservative', initial: 'jump',
      n: 64, cfl: 0.4, tEnd: 0.5,
    });
    expect(run.diverged).toBe(false);
    const rel = Math.abs(run.mass - run.mass0) / Math.abs(run.mass0);
    expect(rel).toBeGreaterThan(0.02);
  });

  it('faces disagree at a jump — that disagreement is the leak', () => {
    const q = squareWave(periodicGrid(16).x);
    const { faces } = stepFvm(q, 'burgers', 'nonconservative', 0.4);
    expect(maxFaceMismatch(faces)).toBeGreaterThan(0.5);
  });

  it('linear advection does not leak: chain-rule upwind IS conservative upwind', () => {
    const run = runFvm({
      equation: 'advection', scheme: 'nonconservative', initial: 'jump',
      n: 64, cfl: 0.4, tEnd: 0.6,
    });
    const rel = Math.abs(run.mass - run.mass0) / (Math.abs(run.mass0) + 1e-15);
    expect(rel).toBeLessThan(1e-12);
    const q = [1, 0.4, 0, 0.7];
    const { faces } = stepFvm(q, 'advection', 'nonconservative', 0.3);
    expect(maxFaceMismatch(faces)).toBeCloseTo(0, 12);
  });

  it('a still-smooth Burgers sine leaks much less than a jump — chain rule is a smoothness theorem', () => {
    const jump = runFvm({
      equation: 'burgers', scheme: 'nonconservative', initial: 'jump',
      n: 64, cfl: 0.4, tEnd: 0.4,
    });
    const { x, dx } = periodicGrid(64);
    const q0 = sineWave(x);
    const lambda = lambdaFromCfl(q0, 'burgers', 0.4);
    const dt = lambda * dx;
    const nSteps = Math.round(0.4 / dt);
    const m0 = totalMass(q0, dx);
    let q = q0.slice();
    for (let k = 0; k < nSteps; k++) q = stepFvm(q, 'burgers', 'nonconservative', lambda).next;
    const leakSine = Math.abs(totalMass(q, dx) - m0) / m0;
    const leakJump = Math.abs(jump.mass - jump.mass0) / Math.abs(jump.mass0);
    expect(leakJump).toBeGreaterThan(20 * leakSine);
    expect(leakSine).toBeGreaterThan(0);
    expect(leakSine).toBeLessThan(0.01);
  });
});

describe('conservation is not stability', () => {
  it('conservative Burgers past CFL 1 still conserves while the field stays finite', () => {
    const { x, dx } = periodicGrid(32);
    const q0 = squareWave(x);
    const nu = 1.3;
    const lambda = lambdaFromCfl(q0, 'burgers', nu);
    const mass0 = totalMass(q0, dx);
    let q = q0.slice();
    let finite = true;
    for (let k = 0; k < 8; k++) {
      q = stepFvm(q, 'burgers', 'conservative', lambda).next;
      if (!q.every(Number.isFinite)) { finite = false; break; }
    }
    if (finite) {
      // Growing modes inflate the roundoff floor; still ~10⁻¹⁰, not a 2% leak.
      const rel = Math.abs(totalMass(q, dx) - mass0) / mass0;
      expect(rel).toBeLessThan(1e-9);
    }
  });
});

describe('shock speed is Rankine–Hugoniot, only in conservation form', () => {
  it('conservative Rusanov moves a Burgers 1|0 jump at s = 1/2', () => {
    const s = measuredShockSpeed({ scheme: 'conservative', n: 96, tEnd: 0.35 });
    expect(s).toBeCloseTo(rankineHugoniot('burgers', JUMP_LEFT, JUMP_RIGHT), 1);
    expect(s).toBeGreaterThan(0.35);
    expect(s).toBeLessThan(0.65);
  });

  it('chain-rule upwind does not', () => {
    const sCons = measuredShockSpeed({ scheme: 'conservative', n: 96, tEnd: 0.35 });
    const sNc = measuredShockSpeed({ scheme: 'nonconservative', n: 96, tEnd: 0.35 });
    expect(Math.abs(sNc - sCons)).toBeGreaterThan(0.12);
  });

  it('falling crossing of the initial jump sits on the discontinuity', () => {
    const { x } = periodicGrid(64);
    const q = squareWave(x);
    const loc = fallingCrossing(x, q, 0.5);
    expect(loc).toBeCloseTo(JUMP_AT, 8);
  });
});
