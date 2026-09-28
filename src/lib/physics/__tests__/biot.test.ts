import { describe, expect, it } from 'vitest';
import { wireForce, type V3 } from '../magnetism.ts';
import {
  C_LIGHT, EPS0, MU0,
  beamForces, biotSavart, circleLoop, circulation, circulation3, coilRings, ellipseLoop, enclosedCurrent,
  forcePerLength, helixPath, idealSolenoidField, parallelForcePerLength, ringFieldExact, ringPath,
  starLoop, straightPath, turnsPerMetreFor, windingNumber, wireField, wireFieldMagnitude, type Loop2, type Wire,
} from '../biot.ts';

const rel = (a: number, b: number) => Math.abs(a - b) / Math.abs(b);

describe('the field of a long straight wire', () => {
  it('is μ₀I/2πr: 20 A at 4 cm is 100 µT', () => {
    expect(wireFieldMagnitude(20, 0.04)).toBeCloseTo(1e-4, 10);
    const [bx, by] = wireField([{ x: 0, y: 0, I: 20 }], 0.04, 0);
    expect(Math.hypot(bx, by)).toBeCloseTo(1e-4, 10);
  });

  it('circles the wire (right-hand grip) and never points at it', () => {
    // current out of the page: counterclockwise, so at +x the field points +y
    const [bx, by] = wireField([{ x: 0, y: 0, I: 5 }], 0.03, 0);
    expect(bx).toBeCloseTo(0, 15);
    expect(by).toBeGreaterThan(0);
    // current into the page: clockwise. At (4, 2) cm it points down-right, across the radius
    const p = [0.04, 0.02];
    const b = wireField([{ x: 0, y: 0, I: -20 }], p[0], p[1]);
    expect(b[0] * p[0] + b[1] * p[1]).toBeCloseTo(0, 12); // perpendicular to the radius
    expect(b[0]).toBeGreaterThan(0);
    expect(b[1]).toBeLessThan(0);
  });

  it('falls as 1/r, not 1/r²: twice as far, half the field', () => {
    expect(wireFieldMagnitude(3, 0.2) / wireFieldMagnitude(3, 0.1)).toBeCloseTo(0.5, 12);
  });

  it('comes out of Biot–Savart: a numerically integrated 4 m wire matches at 2 cm', () => {
    const wire = straightPath([0, 0, -2], [0, 0, 2], 10, 40000);
    const B = biotSavart([wire], [0.02, 0, 0]);
    expect(rel(Math.hypot(...B), wireFieldMagnitude(10, 0.02))).toBeLessThan(1e-3);
    // and in the same direction as the 2D model (current +z, point on +x: field +y)
    expect(B[1]).toBeGreaterThan(0);
    expect(Math.abs(B[0]) + Math.abs(B[2])).toBeLessThan(1e-3 * Math.abs(B[1]));
  });

  it('inside a wire of radius a grows linearly, meeting μ₀I/2πa at the surface', () => {
    const w: Wire = { x: 0, y: 0, I: 4, a: 0.002 };
    const at = (r: number) => Math.hypot(...wireField([w], r, 0));
    expect(at(0.001)).toBeCloseTo(at(0.002) / 2, 12);
    expect(at(0.002)).toBeCloseTo(wireFieldMagnitude(4, 0.002), 12);
  });
});

describe('the force between parallel wires', () => {
  it('currents the same way attract, with F/L = μ₀I₁I₂/2πd', () => {
    const wires: Wire[] = [{ x: 0, y: 0, I: 10 }, { x: 0.04, y: 0, I: 10 }];
    const f = forcePerLength(wires, 1);
    expect(f[0]).toBeLessThan(0); // wire 1 is pulled back toward wire 0
    expect(Math.abs(f[1])).toBeLessThan(1e-15);
    expect(Math.abs(f[0])).toBeCloseTo(parallelForcePerLength(10, 10, 0.04), 12);
    expect(parallelForcePerLength(10, 10, 0.04)).toBeCloseTo(5e-4, 12); // 0.5 mN per metre
  });

  it('opposite currents repel', () => {
    const f = forcePerLength([{ x: 0, y: 0, I: 10 }, { x: 0.04, y: 0, I: -10 }], 1);
    expect(f[0]).toBeGreaterThan(0);
  });

  it('the pair is a third-law pair', () => {
    const wires: Wire[] = [{ x: 0, y: 0, I: 3 }, { x: 0.1, y: 0.05, I: -7 }];
    const a = forcePerLength(wires, 0), b = forcePerLength(wires, 1);
    expect(a[0] + b[0]).toBeCloseTo(0, 15);
    expect(a[1] + b[1]).toBeCloseTo(0, 15);
  });

  it('1 A in each of two wires 1 m apart: 2×10⁻⁷ N per metre (the old ampere)', () => {
    expect(parallelForcePerLength(1, 1, 1)).toBeCloseTo(2e-7, 18);
  });

  it('agrees with I L × B on a metre of wire in a numerically integrated field', () => {
    const src = straightPath([0, 0, -5], [0, 0, 5], 10, 40000);
    const B = biotSavart([src], [0.04, 0, 0]);
    const F = wireForce(10, [0, 0, 1], B);
    expect(F[0]).toBeLessThan(0);
    expect(rel(-F[0], parallelForcePerLength(10, 10, 0.04))).toBeLessThan(1e-3);
  });

  it('lesson 1: C between A (3 A, 10 cm away) and B (6 A) feels nothing with B 20 cm beyond, same way', () => {
    const at = (xB: number, IB: number) => forcePerLength([{ x: 0, y: 0, I: 3 }, { x: 0.1, y: 0, I: 1 }, { x: xB, y: 0, I: IB }], 1)[0];
    expect(Math.abs(at(0.3, 6))).toBeLessThan(1e-15);
    // or 20 cm the other side of C, running the other way
    expect(Math.abs(at(-0.1, -6))).toBeLessThan(1e-15);
    // the inverse-square guess, 14.1 cm beyond C, overshoots: B wins
    expect(at(0.1 + 0.1 * Math.SQRT2, 6)).toBeGreaterThan(1e-7);
    // opposite current beyond C pushes the same way A pulls: nowhere works
    for (const x of [0.15, 0.2, 0.3, 0.45]) expect(at(x, -6)).toBeLessThan(-5e-6);
  });
});

describe('Ampère: circulation counts the current threading the loop', () => {
  const I = 2;
  const one: Wire[] = [{ x: 0, y: 0, I }];
  const loops: [string, Loop2][] = [
    ['small circle', circleLoop(0, 0, 0.01)],
    ['big circle', circleLoop(0, 0, 0.08)],
    ['off-centre circle', circleLoop(0.03, -0.02, 0.05)],
    ['square', [[-0.05, -0.05], [0.05, -0.05], [0.05, 0.05], [-0.05, 0.05]]],
    ['thin ellipse', ellipseLoop(0.01, 0, 0.09, 0.015)],
    ['star', starLoop(0, 0.005, 0.07, 0.02)],
  ];
  for (const [name, loop] of loops) {
    it(`${name}: ∮B·dl = μ₀I`, () => {
      expect(rel(circulation(one, loop), MU0 * I)).toBeLessThan(2e-4);
    });
  }

  it('the field on the loop is not what is constant: it differs by 8× round the small and big circles', () => {
    const near = Math.hypot(...wireField(one, 0.01, 0));
    const far = Math.hypot(...wireField(one, 0.08, 0));
    expect(near / far).toBeCloseTo(8, 10);
  });

  it('a wire outside adds nothing, though it changes the field on the loop', () => {
    const loop = circleLoop(0, 0, 0.05);
    const withOut: Wire[] = [...one, { x: 0.09, y: 0, I: 7 }];
    expect(Math.abs(circulation(withOut, loop) - MU0 * I)).toBeLessThan(2e-4 * MU0 * I);
    expect(Math.abs(circulation([{ x: 0.09, y: 0, I: 7 }], loop))).toBeLessThan(1e-4 * MU0);
    const b1 = Math.hypot(...wireField(one, 0.05, 0)), b2 = Math.hypot(...wireField(withOut, 0.05, 0));
    expect(b2 / b1).toBeGreaterThan(3);
  });

  it('walked clockwise, it counts the current as negative', () => {
    const cw = [...circleLoop(0, 0, 0.03)].reverse();
    expect(rel(circulation(one, cw), -MU0 * I)).toBeLessThan(2e-4);
  });

  it('adds up signed currents: lesson 2 has two ways to wrap exactly 2 A', () => {
    const wires: Wire[] = [
      { x: -0.07, y: 0.02, I: 3 }, { x: -0.03, y: -0.03, I: -1 },
      { x: 0.03, y: 0.03, I: 4 }, { x: 0.07, y: -0.02, I: -2 },
    ];
    const left = ellipseLoop(-0.05, -0.005, 0.045, 0.045);
    const right: Loop2 = [[0.0, 0.06], [0.0, 0.0], [0.1, -0.06], [0.1, 0.06]];
    expect(enclosedCurrent(wires, left)).toBe(2);
    expect(enclosedCurrent(wires, right)).toBe(2);
    expect(rel(circulation(wires, left), MU0 * 2)).toBeLessThan(5e-4);
    expect(rel(circulation(wires, right), MU0 * 2)).toBeLessThan(5e-4);
  });

  it('a loop that winds twice counts the current twice', () => {
    const twice = [...circleLoop(0, 0, 0.03, 128), ...circleLoop(0, 0, 0.05, 128)];
    // two laps, stitched: winding number 2
    expect(windingNumber(twice, 0, 0)).toBe(2);
    expect(rel(circulation(one, twice), 2 * MU0 * I)).toBeLessThan(5e-3);
  });

  it('holds in 3D: a rectangle threading a ring of current (numerical Biot–Savart) gives μ₀I', () => {
    // a ring of radius 5 cm in the y–z plane; the rectangle lies in the x–y
    // plane, from the ring's centre out past its rim, so the wire pierces it once
    const R = 0.05;
    const ring = ringPath(0, R, 3, 720);
    const rect: V3[] = [[-0.05, 0, 0], [0.05, 0, 0], [0.05, 0.1, 0], [-0.05, 0.1, 0]];
    const c = circulation3([ring], rect, 400);
    expect(rel(Math.abs(c), MU0 * 3)).toBeLessThan(5e-3);
    // a rectangle that misses the wire gets nothing
    const miss: V3[] = [[-0.05, 0.08, 0], [0.05, 0.08, 0], [0.05, 0.12, 0], [-0.05, 0.12, 0]];
    expect(Math.abs(circulation3([ring], miss, 200))).toBeLessThan(5e-3 * MU0 * 3);
  });
});

describe('rings and solenoids, by numerical Biot–Savart', () => {
  it('a numerically integrated ring matches the exact elliptic-integral field', () => {
    const R = 0.02, I = 5;
    const ring = ringPath(0, R, I, 720);
    for (const [z, rho] of [[0, 0], [0.01, 0.005], [-0.015, 0.012], [0.03, 0.03]]) {
      const B = biotSavart([ring], [z, rho, 0]);
      const [Bz, Br] = ringFieldExact(R, I, rho, z);
      expect(Math.abs(B[0] - Bz)).toBeLessThan(1e-3 * Math.abs(Bz) + 1e-12);
      expect(Math.abs(B[1] - Br)).toBeLessThan(1e-3 * Math.abs(Bz) + 1e-12);
    }
    // centre: μ₀I/2R
    expect(rel(ringFieldExact(R, I, 0, 0)[0], (MU0 * I) / (2 * R))).toBeLessThan(1e-12);
  });

  const n = 1000, I = 1, L = 0.5;
  const helix = (R: number) => helixPath(R, L, n * L, I, 36);

  it('a long solenoid holds μ₀nI inside, to within 1%', () => {
    const B = biotSavart([helix(0.01)], [0, 0, 0]);
    expect(rel(B[0], idealSolenoidField(n, I))).toBeLessThan(0.01);
  });

  it('the field inside does not depend on the radius: 1 cm and 3 cm agree to 2%', () => {
    const b1 = biotSavart([helix(0.01)], [0, 0, 0])[0];
    const b3 = biotSavart([helix(0.03)], [0, 0, 0])[0];
    expect(rel(b3, b1)).toBeLessThan(0.02);
  });

  it('it is uniform across the middle: off-axis and a quarter-length along agree to 3%', () => {
    const R = 0.02, h = [helix(R)];
    const b0 = biotSavart(h, [0, 0, 0])[0];
    expect(rel(biotSavart(h, [0, 0.6 * R, 0])[0], b0)).toBeLessThan(0.03);
    expect(rel(biotSavart(h, [0, -0.6 * R, 0])[0], b0)).toBeLessThan(0.03);
    expect(rel(biotSavart(h, [L / 4, 0, 0])[0], b0)).toBeLessThan(0.03);
    expect(rel(biotSavart(h, [-L / 4, 0.5 * R, 0])[0], b0)).toBeLessThan(0.03);
  });

  it('outside, beside the middle, it is nearly zero: under 3% of the inside', () => {
    const R = 0.02, h = [helix(R)];
    const b0 = biotSavart(h, [0, 0, 0])[0];
    const out = biotSavart(h, [0, 2 * R, 0]);
    expect(Math.hypot(...out) / b0).toBeLessThan(0.03);
  });

  it('at the mouth, on the axis, it is half the middle value', () => {
    const R = 0.01, h = [helix(R)];
    const b0 = biotSavart(h, [0, 0, 0])[0];
    expect(rel(biotSavart(h, [L / 2, 0, 0])[0], b0 / 2)).toBeLessThan(0.03);
  });

  it('a stack of rings behaves the same as the helix', () => {
    const rings = coilRings(100, 0.3, 0.01, 1, 0, 48);
    const B = biotSavart(rings, [0, 0, 0])[0];
    expect(rel(B, idealSolenoidField(100 / 0.3, 1))).toBeLessThan(0.01);
  });
});

describe('lesson 2: coils in coils', () => {
  // inner: 30 turns, 2 A, radius 1 cm; outer: counter-wound, 3 A, radius 2.5 cm; both 30 cm long
  const inner = coilRings(30, 0.3, 0.01, 2, 0, 48);
  const outer = (N: number) => coilRings(N, 0.3, 0.025, -3, 0, 48);
  const core = (N: number) => biotSavart([...inner, ...outer(N)], [0, 0, 0])[0];
  const alone = biotSavart(inner, [0, 0, 0])[0];

  it('20 outer turns (n₁I₁ = n₂I₂) cancel the core to within 2% of the inner coil alone', () => {
    expect(Math.abs(core(20)) / alone).toBeLessThan(0.02);
  });

  it('19 and 21 turns do not, and the tempting 30 (same turns) leaves half the core field reversed', () => {
    expect(Math.abs(core(19)) / alone).toBeGreaterThan(0.02);
    expect(Math.abs(core(21)) / alone).toBeGreaterThan(0.02);
    expect(core(30) / alone).toBeLessThan(-0.4);
    // and the radius ratio (2.5×) guess, 50 turns, is far off too
    expect(Math.abs(core(50)) / alone).toBeGreaterThan(1);
  });

  it('with the core cancelled, the gap between the coils still holds about μ₀n₂I₂, the outer coil\'s way', () => {
    // turns 1.5 cm apart seen from 0.75 cm away ripple the field by several
    // percent, so "about" is the honest word: within 10%
    const gap = biotSavart([...inner, ...outer(20)], [0, 0.0175, 0])[0];
    expect(gap).toBeLessThan(0);
    expect(rel(Math.abs(gap), idealSolenoidField(20 / 0.3, 3))).toBeLessThan(0.1);
  });
});

describe('beams are not wires', () => {
  it('two bare charge beams repel: the electric push beats the magnetic pull by c²/v²', () => {
    for (const v of [1e5, 3e7, 0.9 * C_LIGHT]) {
      const f = beamForces(1e-3, v, 0.01);
      expect(f.electric).toBeGreaterThan(f.magnetic);
      expect(f.magnetic / f.electric).toBeCloseTo((v * v) / (C_LIGHT * C_LIGHT), 9);
    }
    expect(MU0 * EPS0 * C_LIGHT * C_LIGHT).toBeCloseTo(1, 12);
  });
});

describe('the MRI estimate', () => {
  it('3 T at 500 A needs about 48 turns per centimetre', () => {
    expect(turnsPerMetreFor(3, 500) / 100).toBeCloseTo(47.7, 1);
  });
});

describe('readouts', () => {
  it('siUnit never falls into exponent notation', async () => {
    const { siUnit } = await import('../biot.ts');
    expect(siUnit(1.9e-4, 'T', 2)).toBe('190 µT');
    expect(siUnit(2.513e-6, 'T·m')).toBe('2.51 µT·m');
    expect(siUnit(-6e-6, 'N', 2)).toBe('-6.0 µN');
  });
});
