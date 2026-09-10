import { describe, expect, it } from 'vitest';
import { forwardEuler, heun, rk4, symplecticEuler, velocityVerlet } from '../ode.ts';
import type { Integrator } from '../types.ts';

/* Phase-space area transport — the claim the <PhaseFlow> widget makes.
   Hamiltonian flow preserves area (Liouville). Symplectic integrators preserve
   it exactly; everything else does not. The widget measures this with a
   shoelace area over a ring of boundary particles, so the test does too. */

const RING = 160;

function shoelace(q: Float64Array, p: Float64Array): number {
  let a = 0;
  for (let i = 0, j = RING - 1; i < RING; j = i++) a += (q[j] + q[i]) * (p[j] - p[i]);
  return Math.abs(a) / 2;
}

/** Transports a ring of initial conditions and reports fractional area change. */
function areaDrift(method: Integrator, steps: number, h = 0.16): number {
  const q = new Float64Array(RING);
  const p = new Float64Array(RING);
  const [cq, cp, r] = [1.7, 0, 0.42];
  for (let i = 0; i < RING; i++) {
    const t = (i / RING) * Math.PI * 2;
    q[i] = cq + r * Math.cos(t);
    p[i] = cp + r * Math.sin(t);
  }
  const area0 = shoelace(q, p);

  const f = (_t: number, [qq, pp]: number[]) => [pp, -qq];   // harmonic oscillator
  for (let s = 0; s < steps; s++) {
    for (let i = 0; i < RING; i++) {
      const next = method.step(f, 0, [q[i], p[i]], h);
      q[i] = next[0];
      p[i] = next[1];
    }
  }
  return (shoelace(q, p) - area0) / area0;
}

describe('symplectic methods preserve phase-space area; others do not', () => {
  const STEPS = 4000;

  for (const m of [symplecticEuler, velocityVerlet]) {
    it(`${m.label} holds area over ${STEPS} steps`, () => {
      // The ring is a polygon approximating a circle, so a little of the
      // measured change is discretisation of the boundary rather than the
      // method. 0.1% is far below anything visible and far above that noise.
      expect(Math.abs(areaDrift(m, STEPS))).toBeLessThan(0.001);
    });
  }

  it('forward Euler inflates the blob substantially', () => {
    expect(areaDrift(forwardEuler, STEPS)).toBeGreaterThan(0.5);
  });

  it('non-symplectic methods drift monotonically, and more with more steps', () => {
    for (const m of [forwardEuler, heun, rk4]) {
      const short = Math.abs(areaDrift(m, 500));
      const long = Math.abs(areaDrift(m, 4000));
      expect(long).toBeGreaterThan(short);
    }
  });

  it('area preservation does not depend on step size for a symplectic method', () => {
    // This is the surprising part, and the widget invites you to test it with
    // the h slider: accuracy degrades with larger h, area preservation does not.
    for (const h of [0.05, 0.16, 0.4]) {
      expect(Math.abs(areaDrift(velocityVerlet, 2000, h))).toBeLessThan(0.001);
    }
  });
});
