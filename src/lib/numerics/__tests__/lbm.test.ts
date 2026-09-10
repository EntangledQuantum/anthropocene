import { describe, expect, it } from 'vitest';
import {
  CS2,
  D1Q3_E,
  D1Q3_OPP,
  D1Q3_W,
  D2Q9_EX,
  D2Q9_EY,
  D2Q9_OPP,
  D2Q9_W,
  channelHeight,
  channelProfile,
  channelUmax,
  channelUmaxAtTau,
  collideD1Q3,
  collideD2Q9,
  createChannel,
  createPulseD1Q3,
  createSiteBumpD1Q3,
  demoPoiseuille,
  equilibriumD1Q3,
  idx1,
  kinematicViscosity,
  massD1Q3,
  massD2Q9,
  momentsD1Q3,
  momentumD1Q3,
  poiseuilleAnalytic,
  poiseuilleSketchProfile,
  poiseuilleUmax,
  runChannel,
  stepD1Q3,
  stepD2Q9,
  streamD1Q3,
} from '../lbm.ts';

describe('lattice moments', () => {
  it('D1Q3 weights sum to 1, odd moment vanishes, Σ w e² = c_s² = 1/3', () => {
    const sw = D1Q3_W[0]! + D1Q3_W[1]! + D1Q3_W[2]!;
    expect(sw).toBeCloseTo(1, 12);
    const se = D1Q3_W[0]! * D1Q3_E[0]! + D1Q3_W[1]! * D1Q3_E[1]! + D1Q3_W[2]! * D1Q3_E[2]!;
    expect(se).toBeCloseTo(0, 12);
    let se2 = 0;
    for (let q = 0; q < 3; q++) se2 += D1Q3_W[q]! * D1Q3_E[q]! * D1Q3_E[q]!;
    expect(se2).toBeCloseTo(CS2, 12);
    expect(CS2).toBeCloseTo(1 / 3, 12);
  });

  it('D2Q9 weights sum to 1, first moment vanishes, Σ w e_α e_β = c_s² δ_αβ', () => {
    let sw = 0, sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0;
    for (let q = 0; q < 9; q++) {
      const w = D2Q9_W[q]!, ex = D2Q9_EX[q]!, ey = D2Q9_EY[q]!;
      sw += w;
      sx += w * ex;
      sy += w * ey;
      sxx += w * ex * ex;
      syy += w * ey * ey;
      sxy += w * ex * ey;
    }
    expect(sw).toBeCloseTo(1, 12);
    expect(sx).toBeCloseTo(0, 12);
    expect(sy).toBeCloseTo(0, 12);
    expect(sxx).toBeCloseTo(CS2, 12);
    expect(syy).toBeCloseTo(CS2, 12);
    expect(sxy).toBeCloseTo(0, 12);
  });

  it('opposite velocities reverse e and are involutions', () => {
    for (let q = 0; q < 9; q++) {
      const p = D2Q9_OPP[q]!;
      expect(D2Q9_OPP[p]).toBe(q);
      expect(D2Q9_EX[p]!).toBeCloseTo(-D2Q9_EX[q]!, 12);
      expect(D2Q9_EY[p]!).toBeCloseTo(-D2Q9_EY[q]!, 12);
    }
    expect(D1Q3_OPP[0]).toBe(2);
    expect(D1Q3_OPP[2]).toBe(0);
  });
});

describe('D1Q3 collide and stream', () => {
  it('BGK collide conserves density and momentum at a site', () => {
    const s = createPulseD1Q3({ n: 8, amp: 0.4, tau: 0.8 });
    // Knock the populations off equilibrium so collide actually does work.
    s.f[idx1(3, 0)] *= 1.4;
    s.f[idx1(3, 2)] *= 0.5;
    const before = momentsD1Q3(s.f, 3);
    collideD1Q3(s);
    const after = momentsD1Q3(s.f, 3);
    expect(after.rho).toBeCloseTo(before.rho, 12);
    expect(after.u).toBeCloseTo(before.u, 12);
  });

  it('stream on a ring conserves total mass and total momentum', () => {
    const s = createPulseD1Q3({ n: 16, amp: 0.7, tau: 1 });
    const m0 = massD1Q3(s);
    const p0 = momentumD1Q3(s);
    for (let k = 0; k < 20; k++) streamD1Q3(s);
    expect(massD1Q3(s)).toBeCloseTo(m0, 12);
    expect(momentumD1Q3(s)).toBeCloseTo(p0, 12);
  });

  it('a rest bump streamed without colliding splits at −1, 0, +1', () => {
    const n = 16;
    const site = 5;
    const amp = 0.9;
    const s = createSiteBumpD1Q3(n, site, amp);
    const fR0 = s.f[idx1(site, 2)]!;
    const f00 = s.f[idx1(site, 1)]!;
    const fL0 = s.f[idx1(site, 0)]!;
    expect(fR0).toBeCloseTo(D1Q3_W[2]! * (1 + amp), 12);
    expect(f00).toBeCloseTo(D1Q3_W[1]! * (1 + amp), 12);

    const shift = 6;
    for (let k = 0; k < shift; k++) streamD1Q3(s);

    expect(s.f[idx1((site + shift) % n, 2)]).toBeCloseTo(fR0, 12);
    expect(s.f[idx1(site, 1)]).toBeCloseTo(f00, 12);
    expect(s.f[idx1((site - shift + n) % n, 0)]).toBeCloseTo(fL0, 12);

    // Original site keeps only the rest piece of the bump, plus background flying through.
    const { rho } = momentsD1Q3(s.f, site);
    const expected = D1Q3_W[1]! * (1 + amp) + (D1Q3_W[0]! + D1Q3_W[2]!) * 1;
    expect(rho).toBeCloseTo(expected, 12);
  });

  it('collide then stream still conserves mass', () => {
    const s = createPulseD1Q3({ n: 12, amp: 0.5, tau: 0.9 });
    const m0 = massD1Q3(s);
    for (let k = 0; k < 40; k++) stepD1Q3(s);
    expect(massD1Q3(s)).toBeCloseTo(m0, 10);
  });

  it('equilibrium at rest is w ρ, so net velocity vanishes', () => {
    expect(equilibriumD1Q3(2, 0, 0)).toBeCloseTo(D1Q3_W[0]! * 2, 12);
    expect(equilibriumD1Q3(2, 0, 1)).toBeCloseTo(D1Q3_W[1]! * 2, 12);
    expect(equilibriumD1Q3(2, 0, 2)).toBeCloseTo(D1Q3_W[2]! * 2, 12);
  });
});

describe('viscosity and Poiseuille', () => {
  it('ν = c_s² (τ − 1/2): τ = 1 gives 1/6, τ = 1.5 gives 1/3', () => {
    expect(kinematicViscosity(1)).toBeCloseTo(1 / 6, 12);
    expect(kinematicViscosity(1.5)).toBeCloseTo(1 / 3, 12);
    expect(kinematicViscosity(0.5)).toBeCloseTo(0, 12);
  });

  it('analytic Poiseuille peak is g H² / (8ν)', () => {
    const H = 16, g = 1e-4, nu = 1 / 6;
    expect(poiseuilleUmax(H, g, nu)).toBeCloseTo((g * H * H) / (8 * nu), 12);
    expect(poiseuilleAnalytic(H / 2, H, g, nu)).toBeCloseTo(poiseuilleUmax(H, g, nu), 12);
    expect(poiseuilleAnalytic(0, H, g, nu)).toBeCloseTo(0, 12);
    expect(poiseuilleAnalytic(H, H, g, nu)).toBeCloseTo(0, 12);
  });

  it('D2Q9 channel conserves mass under bounce-back and a body force', () => {
    const s = createChannel({ nx: 4, ny: 13, tau: 1, gx: 1e-4 });
    const m0 = massD2Q9(s);
    for (let k = 0; k < 200; k++) stepD2Q9(s);
    expect(massD2Q9(s)).toBeCloseTo(m0, 8);
    expect(channelHeight(s.ny)).toBe(11);
  });

  it('BGK collide on D2Q9 conserves ρ (force adds no mass)', () => {
    const s = createChannel({ nx: 2, ny: 9, tau: 0.9, gx: 2e-4 });
    // Off-equilibrium kick at a fluid node.
    s.f[1 * 9 + 1] *= 1.2;
    const m0 = massD2Q9(s);
    collideD2Q9(s);
    expect(massD2Q9(s)).toBeCloseTo(m0, 10);
  });

  it('steady channel is a parabola: closer to y(H−y) than to a linear Couette', () => {
    const r = runChannel({ nx: 1, ny: 17, tau: 1, gx: 1e-4, steps: 4000 });
    expect(r.finite).toBe(true);
    expect(r.mass).toBeCloseTo(r.mass0, 6);
    const H = r.H;
    const umax = r.umax;
    expect(umax).toBeGreaterThan(0.005);
    expect(umax).toBeLessThan(0.05);

    let errPara = 0, errLine = 0, n = 0;
    for (const p of r.profile) {
      const para = umax * (4 * (p.y / H) * (1 - p.y / H));
      const line = umax * (1 - Math.abs(2 * p.y / H - 1));
      errPara += (p.ux - para) ** 2;
      errLine += (p.ux - line) ** 2;
      n += 1;
    }
    errPara = Math.sqrt(errPara / n);
    errLine = Math.sqrt(errLine / n);
    expect(errPara).toBeLessThan(0.15 * umax);
    expect(errPara).toBeLessThan(0.5 * errLine);

    // Analytic NS peak, same ν. Halfway bounce-back is second-order; a
    // coarse channel is allowed a few percent, not a factor of two.
    const rel = Math.abs(umax - r.analyticUmax) / r.analyticUmax;
    expect(rel).toBeLessThan(0.12);
  });

  it('doubling (τ − 1/2) halves the mid-channel speed', () => {
    const u1 = channelUmaxAtTau(1);
    const u15 = channelUmaxAtTau(1.5);
    expect(u1).toBeGreaterThan(0);
    expect(u15 / u1).toBeGreaterThan(0.42);
    expect(u15 / u1).toBeLessThan(0.58);
  });

  it('τ → 1/2 is inviscid (ν → 0), not a CFL number', () => {
    expect(kinematicViscosity(0.51)).toBeLessThan(kinematicViscosity(1));
    expect(kinematicViscosity(0.51)).toBeGreaterThan(0);
    // Streaming is always one link; τ does not appear in the shift.
    expect(D2Q9_EX[1]).toBe(1);
    expect(D1Q3_E[2]).toBe(1);
  });

  it('demo Poiseuille used by the widgets is the same parabola', () => {
    const r = demoPoiseuille();
    expect(r.finite).toBe(true);
    expect(r.umax).toBeGreaterThan(0.008);
    expect(r.umax).toBeLessThan(0.04);
    const sketch = poiseuilleSketchProfile();
    expect(sketch[0]!.y).toBeCloseTo(0, 12);
    expect(sketch[sketch.length - 1]!.y).toBeCloseTo(0, 12);
    const peak = Math.max(...sketch.map((p) => p.y));
    expect(peak).toBeGreaterThan(0.85);
    expect(peak).toBeLessThan(1.05);
  });

  it('halfway walls sit at y = 0 and y = H, first fluid node at y = 0.5', () => {
    const s = createChannel({ nx: 1, ny: 11, tau: 1, gx: 0 });
    const profile = channelProfile(s);
    expect(profile[0]!.y).toBeCloseTo(0.5, 12);
    expect(profile[profile.length - 1]!.y).toBeCloseTo(channelHeight(11) - 0.5, 12);
    expect(channelUmax(s)).toBeCloseTo(0, 12);
  });
});
