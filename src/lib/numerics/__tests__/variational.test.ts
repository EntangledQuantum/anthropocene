import { describe, expect, it } from 'vitest';
import { forwardEuler, rk4, velocityVerlet, integrate } from '../ode.ts';
import { oscillator, kepler } from '../problems.ts';
import { invariantDrift } from '../convergence.ts';
import type { Integrator, State } from '../types.ts';
import {
  angularMomentum2d,
  delResidual,
  discreteLagrangian,
  discreteLagrangianStep,
  discreteLagrangianStepper,
  discreteMomenta,
  reverseMomenta,
  type Force,
} from '../variational.ts';

/* Pedagogical claims of the variational-integrators lesson. A wrong sim is a
   wrong lesson. The discrete-Lagrangian map is derived from L_d; the widget
   still steps with velocityVerlet from ode.ts. These tests prove they are
   the same map, and pin discrete Noether / reversibility / bounded energy. */

const harmonicGrad: Force = (q) => q.map((qi) => qi);           // V = ½|q|²
const pendulumGrad: Force = (q) => [Math.sin(q[0])];            // V = 1 − cos q
const keplerGrad: Force = ([x, y]) => {                         // V = −1/r
  const r3 = Math.hypot(x, y) ** 3;
  return [x / r3, y / r3];
};

const harmonicV = (q: State) => 0.5 * q.reduce((s, qi) => s + qi * qi, 0);
const pendulumV = (q: State) => 1 - Math.cos(q[0]);

const variationalHarmonic: Integrator = {
  key: 'discrete-lagrangian',
  label: 'Discrete Lagrangian (symmetric)',
  order: 2,
  symplectic: true,
  cost: 2,
  step: (_f, t, y, h) => discreteLagrangianStepper(harmonicGrad)(t, y, h),
};

function maxAbs(a: State, b: State): number {
  let m = 0;
  for (let i = 0; i < a.length; i++) m = Math.max(m, Math.abs(a[i] - b[i]));
  return m;
}

describe('the symmetric discrete Lagrangian recovers velocity Verlet', () => {
  const cases: { name: string; grad: Force; f: (t: number, y: State) => State; y0: State }[] = [
    {
      name: 'harmonic oscillator',
      grad: harmonicGrad,
      f: oscillator(1).f,
      y0: [0.7, 0.4],
    },
    {
      name: 'pendulum',
      grad: pendulumGrad,
      f: (_t, [q, v]) => [v, -Math.sin(q)],
      y0: [1.1, 0.6],
    },
    {
      name: 'Kepler',
      grad: keplerGrad,
      f: kepler(0.6).f,
      y0: kepler(0.6).y0,
    },
  ];

  for (const { name, grad, f, y0 } of cases) {
    it(`matches velocityVerlet on ${name} for one step and a short run`, () => {
      const stepLd = discreteLagrangianStepper(grad);
      const h = 0.05;

      const oneLd = stepLd(0, y0, h);
      const oneVV = velocityVerlet.step(f, 0, y0, h);
      expect(maxAbs(oneLd, oneVV)).toBeLessThan(1e-14);

      let yLd = y0.slice();
      let yVV = y0.slice();
      for (let k = 0; k < 200; k++) {
        yLd = stepLd(0, yLd, h);
        yVV = velocityVerlet.step(f, 0, yVV, h);
      }
      expect(maxAbs(yLd, yVV)).toBeLessThan(1e-12);
    });
  }

  it('the discrete Euler–Lagrange residual vanishes along the trajectory', () => {
    const h = 0.08;
    const q = [0.5];
    const p = [0.3];
    const a = discreteLagrangianStep(q, p, h, harmonicGrad);
    const b = discreteLagrangianStep(a.q, a.p, h, harmonicGrad);
    const resid = delResidual(q, a.q, b.q, h, harmonicGrad);
    expect(Math.hypot(...resid)).toBeLessThan(1e-14);
  });

  it('discrete momenta from the Legendre transform match the (q, p) state', () => {
    const h = 0.1;
    const q = [0.4, -0.2];
    const p = [0.15, 0.7];
    const next = discreteLagrangianStep(q, p, h, harmonicGrad);
    const { p0, p1 } = discreteMomenta(q, next.q, h, harmonicGrad);
    expect(maxAbs(p0, p)).toBeLessThan(1e-14);
    expect(maxAbs(p1, next.p)).toBeLessThan(1e-14);
  });
});

describe('discrete Noether: spatial momenta are exact; energy is not', () => {
  it('Kepler angular momentum is conserved to tight tolerance under L_d', () => {
    const problem = kepler(0.6);
    const h = 0.04;
    const steps = 4000;
    const stepLd = discreteLagrangianStepper(keplerGrad);

    const L0 = angularMomentum2d(problem.y0.slice(0, 2), problem.y0.slice(2));
    let y = problem.y0.slice();
    let worst = 0;
    for (let k = 0; k < steps; k++) {
      y = stepLd(0, y, h);
      const L = angularMomentum2d(y.slice(0, 2), y.slice(2));
      worst = Math.max(worst, Math.abs(L - L0));
    }
    // Discrete rotational Noether: exact, up to roundoff accumulation.
    expect(worst).toBeLessThan(1e-12);
    // Sanity: the true angular momentum of this orbit is √(1 − e²) = 0.8.
    expect(L0).toBeCloseTo(0.8, 12);
  });

  it('RK4 lets Kepler angular momentum drift — it is not a discrete Noether map', () => {
    const problem = kepler(0.6);
    const h = 0.04;
    const L0 = angularMomentum2d(problem.y0.slice(0, 2), problem.y0.slice(2));
    const { y } = integrate(rk4, problem.f, problem.y0, 0, 80, h);
    const end = y.at(-1)!;
    const L = angularMomentum2d(end.slice(0, 2), end.slice(2));
    expect(Math.abs(L - L0)).toBeGreaterThan(1e-8);
  });

  it('two particles with a pairwise spring keep total linear momentum to roundoff', () => {
    // V = ½ (q₁ − q₂)², translation invariant. Discrete Noether ⇒ p₁ + p₂ exact.
    const grad: Force = ([q1, q2]) => [q1 - q2, q2 - q1];
    const stepLd = discreteLagrangianStepper(grad);
    const y0 = [0.2, 1.1, 0.4, -0.15];
    const P0 = y0[2] + y0[3];
    let y = y0.slice();
    let worst = 0;
    for (let k = 0; k < 3000; k++) {
      y = stepLd(0, y, 0.05);
      worst = Math.max(worst, Math.abs(y[2] + y[3] - P0));
    }
    expect(worst).toBeLessThan(1e-12);
  });

  it('energy is NOT a discrete Noether quantity — it sits at O(h²), not roundoff', () => {
    const problem = { ...kepler(0.6), span: 40 };
    const h = 0.05;
    const stepLd = discreteLagrangianStepper(keplerGrad);
    const E0 = problem.invariant!(problem.y0);
    let y = problem.y0.slice();
    let worst = 0;
    const steps = Math.round(problem.span / h);
    for (let k = 0; k < steps; k++) {
      y = stepLd(0, y, h);
      worst = Math.max(worst, Math.abs(problem.invariant!(y) - E0));
    }
    // Far above roundoff: time-translation did not survive the discrete action.
    expect(worst).toBeGreaterThan(1e-6);
    // But consistent with a second-order shadow: O(h²) ~ 10⁻³, not secular.
    expect(worst).toBeLessThan(0.05);
  });

  it('energy error of the discrete-Lagrangian map stays bounded as the run lengthens', () => {
    // Pin the variational claim, not a duplicate of the sibling's Verlet-vs-RK4
    // secular-drift test: same oscillator, but the stepper is L_d, and we only
    // claim the envelope does not grow.
    const problem = { ...oscillator(1), span: 4000 };
    const h = 0.1;
    const { relative } = invariantDrift(variationalHarmonic, problem, h);
    const q = Math.floor(relative.length / 4);
    const peak = (xs: number[]) => Math.max(...xs.map(Math.abs));
    const early = peak(relative.slice(0, q));
    const late = peak(relative.slice(-q));
    expect(late).toBeLessThan(early * 1.2);
    expect(late).toBeLessThan(0.01);
  });
});

describe('time-reversibility of the discrete-Lagrangian map', () => {
  const fPend = (_t: number, [q, v]: State) => [v, -Math.sin(q)];
  const y0 = [0.8, 0.5];
  const h = 0.13;
  const stepLd = discreteLagrangianStepper(pendulumGrad);

  it('Φ_{-h} ∘ Φ_h returns to the start (pendulum, nonlinear)', () => {
    const y1 = stepLd(0, y0, h);
    const yBack = stepLd(0, y1, -h);
    expect(maxAbs(yBack, y0)).toBeLessThan(1e-14);
  });

  it('R ∘ Φ_h ∘ R ∘ Φ_h is the identity — play the movie backwards', () => {
    const y1 = stepLd(0, y0, h);
    const y2 = stepLd(0, reverseMomenta(y1), h);
    const back = reverseMomenta(y2);
    expect(maxAbs(back, y0)).toBeLessThan(1e-14);
  });

  it('velocity Verlet is the same reversible map; RK4 is not', () => {
    const vv1 = velocityVerlet.step(fPend, 0, y0, h);
    const vvBack = velocityVerlet.step(fPend, h, vv1, -h);
    expect(maxAbs(vvBack, y0)).toBeLessThan(1e-14);

    const rk1 = rk4.step(fPend, 0, y0, h);
    const rkBack = rk4.step(fPend, h, rk1, -h);
    expect(maxAbs(rkBack, y0)).toBeGreaterThan(1e-8);

    const fe1 = forwardEuler.step(fPend, 0, y0, h);
    const feBack = forwardEuler.step(fPend, h, fe1, -h);
    expect(maxAbs(feBack, y0)).toBeGreaterThan(1e-4);
  });

  it('the discrete action of a path equals the action of its reverse', () => {
    const q0 = [0.4];
    const q1 = [0.55];
    const fwd = discreteLagrangian(q0, q1, h, pendulumV);
    const rev = discreteLagrangian(q1, q0, h, pendulumV);
    expect(fwd).toBeCloseTo(rev, 15);
  });
});

describe('the discrete Lagrangian is a genuine quadrature of L, not a fitted curve', () => {
  it('as h → 0, L_d / h → L at the left endpoint, for a linear path', () => {
    // L_d is constructed to approximate ∫ L dt over one step. For a path
    // with q(t) = q0 + t v and small h, L_d / h must approach L(q0, v).
    const q0 = [0.3];
    const v = [0.8];
    const Lcont = 0.5 * v[0] * v[0] - harmonicV(q0);
    const h = 1e-6;
    const q1 = [q0[0] + h * v[0]];
    const Ld = discreteLagrangian(q0, q1, h, harmonicV);
    expect(Math.abs(Ld / h - Lcont)).toBeLessThan(1e-6);
  });
});
