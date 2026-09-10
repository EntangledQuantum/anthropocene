import { describe, expect, it } from 'vitest';
import { rk4 } from '../ode.ts';
import type { State } from '../types.ts';
import {
  DEFAULT_OMEGA,
  det3,
  expSO3,
  gramSchmidtSO3,
  hat,
  hWhereRadiusFallsBelow,
  I3,
  indexReducedPendulumF,
  matMul,
  matT,
  orthoResidual,
  pendulumG,
  pendulumGDot,
  pendulumQ,
  pendulumRadius,
  pendulumState,
  pendulumV,
  projectToCircle,
  rattlePendulumStep,
  rk4OrthoResidualAt,
  runPendulum,
  runRotation,
  shakeAlpha,
  shakePendulumStep,
  stepPendulum,
  stepRotation,
} from '../constraints.ts';

const y0 = pendulumState();

function maxAbs(xs: number[]): number {
  return Math.max(...xs.map(Math.abs));
}

describe('the index-reduced pendulum ODE leaves the circle under RK4', () => {
  it('starts on the tangent bundle', () => {
    const q = pendulumQ(y0);
    const v = pendulumV(y0);
    expect(Math.abs(pendulumG(q))).toBeLessThan(1e-15);
    expect(Math.abs(pendulumGDot(q, v))).toBeLessThan(1e-15);
  });

  it('RK4 on the twice-differentiated constraint drifts off the manifold', () => {
    const run = runPendulum('index-rk4', 0.12, 40);
    const late = run[run.length - 1]!;
    expect(Math.abs(late.g)).toBeGreaterThan(1e-4);
    expect(Math.abs(late.radius - 1)).toBeGreaterThan(5e-4);
  });

  it('forward Euler on the same ODE leaves faster than RK4', () => {
    const euler = runPendulum('index-euler', 0.08, 20);
    const rk = runPendulum('index-rk4', 0.08, 20);
    expect(Math.abs(euler[euler.length - 1]!.g)).toBeGreaterThan(Math.abs(rk[rk.length - 1]!.g));
  });

  it('the index-reduced vector field is consistent with g̈ = 0 on the circle', () => {
    const q = pendulumQ(y0);
    const v = pendulumV(y0);
    const f = indexReducedPendulumF(0, y0);
    const a: [number, number] = [f[2], f[3]];
    const gddot = v[0] * v[0] + v[1] * v[1] + q[0] * a[0] + q[1] * a[1];
    expect(Math.abs(gddot)).toBeLessThan(1e-14);
  });
});

describe('SHAKE lands on the circle; RATTLE lands on the tangent bundle', () => {
  it('SHAKE keeps g at roundoff and leaves q · v at O(h), not zero', () => {
    const peak = (h: number) => {
      const run = runPendulum('shake', h, 20);
      return Math.max(...run.slice(1).map((s) => Math.abs(s.gdot)));
    };
    const h = 0.05;
    const run = runPendulum('shake', h, 30);
    expect(maxAbs(run.map((s) => s.g))).toBeLessThan(1e-12);
    expect(peak(h)).toBeGreaterThan(0.5 * h);
    expect(peak(h)).toBeLessThan(3 * h);
    // First order in h: doubling h doubles the hidden residual.
    expect(peak(0.1) / peak(0.05)).toBeGreaterThan(1.7);
    expect(peak(0.1) / peak(0.05)).toBeLessThan(2.4);
  });

  it('RATTLE keeps both g and q · v at roundoff', () => {
    const run = runPendulum('rattle', 0.05, 40);
    expect(maxAbs(run.map((s) => s.g))).toBeLessThan(1e-12);
    expect(maxAbs(run.map((s) => s.gdot))).toBeLessThan(1e-12);
  });

  it('SHAKE’s α is the Newton root of g(qUnc − α q) = 0', () => {
    const q = pendulumQ(y0);
    const v = pendulumV(y0);
    const h = 0.1;
    const qUnc: [number, number] = [
      q[0] + h * v[0],
      q[1] + h * v[1] + 0.5 * h * h * -1,
    ];
    const alpha = shakeAlpha(q, qUnc);
    const qNext: [number, number] = [qUnc[0] - alpha * q[0], qUnc[1] - alpha * q[1]];
    expect(Math.abs(pendulumG(qNext))).toBeLessThan(1e-14);
  });

  it('one RATTLE step from the tangent bundle stays there', () => {
    const n = rattlePendulumStep(pendulumQ(y0), pendulumV(y0), 0.07);
    expect(Math.abs(pendulumG(n.q))).toBeLessThan(1e-14);
    expect(Math.abs(pendulumGDot(n.q, n.v))).toBeLessThan(1e-14);
  });

  it('one SHAKE step hits g = 0 and misses q · v = 0', () => {
    const n = shakePendulumStep(pendulumQ(y0), pendulumV(y0), 0.07);
    expect(Math.abs(pendulumG(n.q))).toBeLessThan(1e-14);
    expect(Math.abs(pendulumGDot(n.q, n.v))).toBeGreaterThan(1e-8);
  });
});

describe('renormalising after RK4 is a different map from RATTLE', () => {
  it('the projected RK4 state sits on the tangent bundle', () => {
    const run = runPendulum('project', 0.08, 30);
    expect(maxAbs(run.map((s) => s.g))).toBeLessThan(1e-12);
    expect(maxAbs(run.map((s) => s.gdot))).toBeLessThan(1e-12);
  });

  it('after a few steps the projected state has left the RATTLE trajectory', () => {
    let yR = y0.slice();
    let yP = y0.slice();
    const h = 0.08;
    for (let k = 0; k < 40; k++) {
      yR = stepPendulum('rattle', yR, h);
      yP = stepPendulum('project', yP, h);
    }
    const dist = Math.hypot(yR[0] - yP[0], yR[1] - yP[1], yR[2] - yP[2], yR[3] - yP[3]);
    expect(dist).toBeGreaterThan(1e-4);
  });

  it('projectToCircle is a genuine projection: g and ġ vanish', () => {
    const n = projectToCircle([1.3, -0.4], [0.5, 0.2]);
    expect(Math.abs(pendulumRadius(n.q) - 1)).toBeLessThan(1e-15);
    expect(Math.abs(pendulumGDot(n.q, n.v))).toBeLessThan(1e-15);
  });
});

describe('RATTLE energy is bounded; order is two', () => {
  it('energy envelope does not grow from the first quarter to the last', () => {
    const run = runPendulum('rattle', 0.05, 200);
    const E0 = run[0]!.energy;
    const rel = run.map((s) => Math.abs(s.energy - E0));
    const q = Math.floor(rel.length / 4);
    const peak = (xs: number[]) => Math.max(...xs);
    const early = peak(rel.slice(0, q));
    const late = peak(rel.slice(-q));
    expect(late).toBeLessThan(early * 1.4);
    expect(late).toBeLessThan(0.05);
  });

  it('halving h cuts the angle error by about four (order 2)', () => {
    const span = 4;
    const refH = 5e-4;
    let yRef = y0.slice();
    const nRef = Math.round(span / refH);
    for (let i = 0; i < nRef; i++) yRef = stepPendulum('rattle', yRef, refH);

    const angle = (y: State) => Math.atan2(y[0], -y[1]);
    const err = (h: number) => {
      let y = y0.slice();
      const n = Math.round(span / h);
      for (let i = 0; i < n; i++) y = stepPendulum('rattle', y, h);
      return Math.abs(angle(y) - angle(yRef));
    };

    const eCoarse = err(0.04);
    const eFine = err(0.02);
    const ratio = eCoarse / eFine;
    expect(ratio).toBeGreaterThan(3.2);
    expect(ratio).toBeLessThan(5.2);
  });
});

describe('a rotation that left SO(3) is measured, not assumed', () => {
  it('Rodrigues exp(ω̂) sits in SO(3): RᵀR = I and det = +1', () => {
    const R = expSO3([0.4, -0.7, 1.2]);
    expect(orthoResidual(R)).toBeLessThan(1e-14);
    expect(det3(R)).toBeCloseTo(1, 12);
  });

  it('exp(θ ẑ) is a rotation by θ about z', () => {
    const th = Math.PI / 2;
    const R = expSO3([0, 0, th]);
    // first column → (0, 1, 0): x-axis to y-axis
    expect(R[0]).toBeCloseTo(0, 12);
    expect(R[3]).toBeCloseTo(1, 12);
    expect(R[6]).toBeCloseTo(0, 12);
    expect(R[8]).toBeCloseTo(1, 12);
  });

  it('hat(ω) is skew and exp(h ω̂) matches the Lie-group step from I', () => {
    const w = DEFAULT_OMEGA;
    const K = hat(w);
    const Kt = matT(K);
    for (let i = 0; i < 9; i++) expect(K[i] + Kt[i]).toBeCloseTo(0, 15);
    const R = stepRotation('lie', I3, w, 0.3);
    expect(orthoResidual(R)).toBeLessThan(1e-14);
  });

  it('RK4 on the nine entries leaves SO(3); the Lie-group step does not', () => {
    const span = 20;
    const h = 0.15;
    const ambient = runRotation('rk4', h, span);
    const lie = runRotation('lie', h, span);
    expect(ambient[ambient.length - 1]!.residual).toBeGreaterThan(1e-4);
    expect(lie[lie.length - 1]!.residual).toBeLessThan(1e-13);
    expect(Math.abs(lie[lie.length - 1]!.det - 1)).toBeLessThan(1e-12);
  });

  it('Gram–Schmidt after RK4 sits on SO(3) but is not the Lie-group trajectory', () => {
    const h = 0.2;
    let Rproj = I3.slice();
    let Rlie = I3.slice();
    for (let i = 0; i < 80; i++) {
      Rproj = stepRotation('project', Rproj, DEFAULT_OMEGA, h);
      Rlie = stepRotation('lie', Rlie, DEFAULT_OMEGA, h);
    }
    expect(orthoResidual(Rproj)).toBeLessThan(1e-14);
    let dist = 0;
    for (let i = 0; i < 9; i++) dist += (Rproj[i]! - Rlie[i]!) ** 2;
    expect(Math.sqrt(dist)).toBeGreaterThan(5e-4);
  });

  it('gramSchmidtSO3 recovers a rotation from a sheared matrix', () => {
    const dirty = [1.1, 0.2, 0, 0.1, 0.9, 0.05, 0, 0, 1.05];
    const U = gramSchmidtSO3(dirty);
    expect(orthoResidual(U)).toBeLessThan(1e-14);
    expect(det3(U)).toBeCloseTo(1, 12);
  });
});

describe('the estimate and tune claims are computed, not typed', () => {
  it('RK4 orthogonality residual at the lesson’s (h, span) is a visible number', () => {
    const residual = rk4OrthoResidualAt(0.2, 24);
    expect(residual).toBeGreaterThan(1e-4);
    expect(residual).toBeLessThan(1);
  });

  it('there is an h where index-reduced RK4’s radius at t = 30 has fallen to 0.95', () => {
    const h = hWhereRadiusFallsBelow(0.95, 30);
    expect(h).toBeGreaterThan(0.18);
    expect(h).toBeLessThan(0.34);
    const r = runPendulum('index-rk4', h, 30);
    expect(r[r.length - 1]!.radius).toBeGreaterThan(0.93);
    expect(r[r.length - 1]!.radius).toBeLessThan(0.97);
  });
});

describe('rk4 used on vec(R) is the library rk4, not a private copy', () => {
  it('one ambient rotation step matches ode.rk4.step on the kinematics field', () => {
    const omega = DEFAULT_OMEGA;
    const f = (t: number, y: State) => {
      const W = hat(omega);
      return matMul(y, W);
    };
    const a = stepRotation('rk4', I3, omega, 0.1);
    const b = rk4.step(f, 0, I3, 0.1);
    for (let i = 0; i < 9; i++) expect(a[i]).toBeCloseTo(b[i]!, 15);
  });
});
