import { describe, expect, it } from 'vitest';
import {
  E_CHARGE, M_ELECTRON, M_PROTON, along, angleBetween, equipotentialThrough, field, fieldStrength,
  inGap, integrateAcrossGap, kineticGain, minusGradV, potential, scanTrack, sceneToSI, speedAfter,
  toEV, transitTime, voltageForSpeed, workAlong,
} from '../potential-ch23.ts';
import type { Vec2 } from '../vectors.ts';

/* The layouts the chapter's scenes use, in cm and nC. */
const CARRY = sceneToSI([{ x: -8, y: -1, q: 8 }, { x: 9, y: 2, q: -5 }]);
const AIM = sceneToSI([{ x: -11, y: 3, q: 6 }, { x: 10, y: 5, q: 4 }, { x: 2, y: -6, q: -7 }]);
const TRACK = sceneToSI([{ x: -10, y: -4, q: 8 }, { x: 8, y: 0.5, q: -3 }]);
const cm = (x: number, y: number): Vec2 => [x / 100, y / 100];
const Q = 1e-9; // the 1 nC test charge

const arc = (a: Vec2, b: Vec2, bulge: number, n = 200): Vec2[] => {
  const pts: Vec2[] = [];
  const nx = -(b[1] - a[1]), ny = b[0] - a[0];
  for (let i = 0; i <= n; i++) {
    const t = i / n, s = Math.sin(Math.PI * t) * bulge;
    pts.push([a[0] + t * (b[0] - a[0]) + s * nx, a[1] + t * (b[1] - a[1]) + s * ny]);
  }
  return pts;
};

describe('the work from A to B does not depend on the path', () => {
  const A = cm(-4, 6), B = cm(4, -8);
  const expected = Q * (potential(CARRY, ...A) - potential(CARRY, ...B));

  it('is q(V_A − V_B) along a straight line, a wide arc, and a zigzag', () => {
    const straight: Vec2[] = [A, B];
    const wide = arc(A, B, 0.8);
    const other = arc(A, B, -0.35);
    const zig: Vec2[] = [A, cm(-18, 10), cm(-16, -12), cm(0, 12), cm(15, -11), B];
    for (const p of [straight, wide, other, zig]) {
      expect(workAlong(CARRY, Q, p)).toBeCloseTo(expected, 12);
      expect(Math.abs(workAlong(CARRY, Q, p) / expected - 1)).toBeLessThan(1e-4);
    }
    // and it is not a small number: about half a microjoule
    expect(Math.abs(expected)).toBeGreaterThan(3e-7);
  });

  it('is zero around closed loops, including one that circles a charge', () => {
    const loops: Vec2[][] = [
      [...arc(A, B, 0.8), ...arc(B, A, 0.4).slice(1)],
      Array.from({ length: 401 }, (_, i) => {
        const th = (2 * Math.PI * i) / 400;
        return cm(-8 + 5 * Math.cos(th), -1 + 5 * Math.sin(th)); // round the +8 nC
      }),
      [A, cm(-18, 10), cm(-16, -12), cm(15, -11), cm(18, 10), A],
    ];
    for (const loop of loops) {
      const w = workAlong(CARRY, Q, loop);
      expect(Math.abs(w)).toBeLessThan(1e-4 * Math.abs(expected));
    }
  });

  it('is zero along the contour through A, which is a closed loop round the + charge', () => {
    const c = equipotentialThrough(CARRY, A, { ds: 2e-3, steps: 3000 });
    expect(c.closed).toBe(true);
    const V0 = potential(CARRY, ...A);
    for (const p of c.points) expect(Math.abs(potential(CARRY, ...p) - V0)).toBeLessThan(0.05);
    expect(Math.abs(workAlong(CARRY, Q, c.points.slice(0, 120)))).toBeLessThan(1e-10);
    // it fits in the scene's view, x ∈ [−22, 20] cm, y ∈ [−13, 13] cm
    for (const [x, y] of c.points) {
      expect(x * 100).toBeGreaterThan(-22);
      expect(Math.abs(y * 100)).toBeLessThan(13);
    }
  });
});

describe('the field is the downhill slope of V', () => {
  it('E = −∇V everywhere, checked by differencing the potential', () => {
    for (const set of [CARRY, AIM, TRACK]) {
      for (const p of [cm(-2, 5), cm(4, 2), cm(-15, -8), cm(12, -3), cm(0, 10)]) {
        const e = field(set, ...p);
        const g = minusGradV(set, ...p);
        expect(Math.hypot(e[0] - g[0], e[1] - g[1]) / Math.hypot(...e)).toBeLessThan(1e-5);
      }
    }
  });

  it('crosses the contours at right angles and points toward lower V', () => {
    const P = cm(-2, 5);
    const c = equipotentialThrough(AIM, P, { ds: 5e-4, steps: 40 });
    const i = c.points.findIndex((q) => q === P);
    const a = c.points[i - 1], b = c.points[i + 1];
    const tangent: Vec2 = [b[0] - a[0], b[1] - a[1]];
    const e = field(AIM, ...P);
    expect(Math.abs(Math.abs(angleBetween(tangent, e)) - 90)).toBeLessThan(0.5);
    const step = 1e-4 / Math.hypot(...e);
    expect(potential(AIM, P[0] + e[0] * step, P[1] + e[1] * step)).toBeLessThan(potential(AIM, ...P));
  });

  it('at the aim probe the field is not "away from the nearest +" nor "toward the −"', () => {
    // So aiming by the rule of thumb fails; reading the contours works.
    const e = field(AIM, -0.02, 0.05);
    expect(Math.abs(angleBetween([-2 - -11, 5 - 3], e))).toBeGreaterThan(35);
    expect(Math.abs(angleBetween([2 - -2, -6 - 5], e))).toBeGreaterThan(35);
  });

  it('a negative charge is pushed uphill: the field does positive work carrying it toward higher V', () => {
    const lo = cm(4, -8), hi = cm(-4, 6);
    expect(potential(CARRY, ...hi)).toBeGreaterThan(potential(CARRY, ...lo));
    expect(workAlong(CARRY, -Q, [lo, hi])).toBeGreaterThan(0);
    expect(workAlong(CARRY, +Q, [lo, hi])).toBeLessThan(0);
  });
});

describe('falling through a voltage', () => {
  it('an electron through 100 V arrives at 5.93 × 10⁶ m/s with 100 eV', () => {
    const v = speedAfter(-E_CHARGE, M_ELECTRON, 100);
    expect(v).toBeCloseTo(5.93e6, -4);
    expect(toEV(kineticGain(-E_CHARGE, 100))).toBeCloseTo(100, 9);
  });

  it('integrating F = qE step by step gives the same speed as ΔK = −qΔV', () => {
    for (const V of [25, 100, 284, 500]) {
      expect(integrateAcrossGap(E_CHARGE, M_ELECTRON, V, 0.01) / speedAfter(-E_CHARGE, M_ELECTRON, V) - 1).toBeLessThan(1e-6);
    }
  });

  it('the width of the gap changes the time, not the arrival speed', () => {
    const v1 = integrateAcrossGap(E_CHARGE, M_ELECTRON, 100, 0.01);
    const v2 = integrateAcrossGap(E_CHARGE, M_ELECTRON, 100, 0.02);
    expect(Math.abs(v2 / v1 - 1)).toBeLessThan(1e-6);
    expect(transitTime(E_CHARGE, M_ELECTRON, 100, 0.02) / transitTime(E_CHARGE, M_ELECTRON, 100, 0.01)).toBeCloseTo(2, 9);
  });

  it('to reach 1.0 × 10⁷ m/s an electron needs about 284 V', () => {
    const V = voltageForSpeed(M_ELECTRON, E_CHARGE, 1e7);
    expect(V).toBeGreaterThan(283);
    expect(V).toBeLessThan(285);
    expect(speedAfter(-E_CHARGE, M_ELECTRON, V)).toBeCloseTo(1e7, -1);
  });

  it('twice the speed needs four times the voltage', () => {
    expect(voltageForSpeed(M_ELECTRON, E_CHARGE, 2e7) / voltageForSpeed(M_ELECTRON, E_CHARGE, 1e7)).toBeCloseTo(4, 9);
  });

  it('an electron and a proton through the same 100 V gain the same energy; the electron is 43 times faster', () => {
    const ke = kineticGain(-E_CHARGE, +100); // electron climbs 0 → +100 V
    const kp = kineticGain(+E_CHARGE, -100); // proton falls +100 → 0 V
    expect(ke).toBeCloseTo(kp, 30);
    expect(toEV(kp)).toBeCloseTo(100, 9);
    const ratio = speedAfter(-E_CHARGE, M_ELECTRON, 100) / speedAfter(E_CHARGE, M_PROTON, -100);
    expect(ratio).toBeCloseTo(Math.sqrt(M_PROTON / M_ELECTRON), 6);
    expect(Math.round(ratio)).toBe(43);
    // and the same field accelerates it for 43 times longer
    expect(transitTime(E_CHARGE, M_PROTON, 100, 0.01) / transitTime(E_CHARGE, M_ELECTRON, 100, 0.01)).toBeCloseTo(ratio, 6);
  });

  it('a positive charge cannot fall uphill', () => {
    expect(speedAfter(E_CHARGE, M_PROTON, +50)).toBeNaN();
  });

  it('inGap agrees with the closed forms at the far plate', () => {
    const d = 0.01, V = 100;
    const T = transitTime(E_CHARGE, M_ELECTRON, V, d);
    const s = inGap(E_CHARGE, M_ELECTRON, V, d, T * 1.0001);
    expect(s.arrived).toBe(true);
    expect(s.v / speedAfter(-E_CHARGE, M_ELECTRON, V)).toBeCloseTo(1, 9);
    expect(inGap(E_CHARGE, M_ELECTRON, V, d, T / 2).x).toBeCloseTo(d / 4, 12);
  });
});

describe('the strongest field is where the contours crowd, not where V is high', () => {
  const a = cm(-18, 3), b = cm(16, 3);
  const scan = scanTrack(TRACK, a, b);

  it('on the track, V peaks near the +8 nC and |E| peaks near the −3 nC', () => {
    expect(along(a, b, scan.tV)[0] * 100).toBeLessThan(-6);
    expect(along(a, b, scan.tE)[0] * 100).toBeGreaterThan(5);
    const [xe, ye] = along(a, b, scan.tE);
    expect(potential(TRACK, xe, ye)).toBeLessThan(0);
    // the field at the high point is well under half the strongest
    const [xv, yv] = along(a, b, scan.tV);
    expect(fieldStrength(TRACK, xv, yv)).toBeLessThan(0.5 * scan.eMax);
  });

  it('contour spacing there matches 100 V / |E|', () => {
    const [x, y] = along(a, b, scan.tE);
    const e = field(TRACK, x, y);
    const u: Vec2 = [e[0] / Math.hypot(...e), e[1] / Math.hypot(...e)];
    const gap = 100 / scan.eMax;
    const dv = potential(TRACK, x - (u[0] * gap) / 2, y - (u[1] * gap) / 2) - potential(TRACK, x + (u[0] * gap) / 2, y + (u[1] * gap) / 2);
    expect(dv).toBeGreaterThan(95);
    expect(dv).toBeLessThan(110);
  });

  it('in a uniform gap E = ΔV/d', () => {
    // two large sheets, modelled as the gap the tube scene draws: the force the
    // integrator uses is |q|ΔV/d, and the energy it delivers is |q|ΔV
    const v = integrateAcrossGap(E_CHARGE, M_ELECTRON, 300, 0.015);
    expect(0.5 * M_ELECTRON * v * v).toBeCloseTo(300 * E_CHARGE, 25);
  });
});

describe('V and E are different questions', () => {
  const dip = sceneToSI([{ x: -3, y: 0, q: 5 }, { x: 3, y: 0, q: -5 }]);
  const twin = sceneToSI([{ x: -3, y: 0, q: 5 }, { x: 3, y: 0, q: 5 }]);

  it('on a dipole’s bisector V = 0 but E is not', () => {
    for (const y of [0, 2, 5]) {
      expect(Math.abs(potential(dip, 0, y / 100))).toBeLessThan(1e-9);
      expect(fieldStrength(dip, 0, y / 100)).toBeGreaterThan(1000);
    }
  });

  it('midway between two equal like charges E = 0 but V is not', () => {
    expect(fieldStrength(twin, 0, 0)).toBeLessThan(1e-6);
    expect(potential(twin, 0, 0)).toBeGreaterThan(2000);
  });
});
