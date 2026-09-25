import { describe, expect, it } from 'vitest';
import {
  G, RHO_WATER, RHO_SEAWATER, bernoulliPressure, blockFaceForces, blockPolygon, clipBelow, columnHeight,
  displacedMass, displacedWeight, floatDraft, flowSpeed, heaveStep, hullBuoyancy, hydrostaticPressure,
  jetPath, jetRange, pipeArea, pointInPolygon, polygonArea, pressureAlongPath, pressureForceOnPolygon,
  pressureForceOnSphere, sphericalCap, submergedArea, torricelliSpeed, venturiAt, waistDiameter,
  type Barge, type Vec2,
} from '../fluids.ts';
import { launchProjectile } from '../kinematics.ts';

/* Lesson 1 — "Depth, not amount" */

describe('pressure depends on depth only', () => {
  it('is ρgh: 0.8 m of water is 7.85 kPa above the air', () => {
    expect(hydrostaticPressure(0.8)).toBeCloseTo(7848, 0);
    expect(hydrostaticPressure(-0.2)).toBe(0);
  });

  it('is the same whatever path you walk down to the point: the shape of the vessel never enters', () => {
    // Straight down a thin tube…
    const straight: Vec2[] = [[1.15, 0.8], [1.15, 0.2]];
    // …or down a wide tank, along the connecting pipe, and up under a ceiling.
    const winding: Vec2[] = [[0.4, 0.8], [0.4, 0.05], [2.1, 0.05], [2.1, 0.2], [1.9, 0.2]];
    expect(pressureAlongPath(winding)).toBeCloseTo(pressureAlongPath(straight), 9);
    expect(pressureAlongPath(straight)).toBeCloseTo(hydrostaticPressure(0.6), 9);
  });

  it('under a ceiling, reads the full depth below the free surface, not the thin layer above', () => {
    // Cellar ceiling at 0.35 m, point at 0.2 m, free surface in the chimney at 0.8 m.
    const underCeiling = hydrostaticPressure(0.8 - 0.2);
    const layerAbove = hydrostaticPressure(0.35 - 0.2);
    expect(underCeiling / layerAbove).toBeCloseTo(4, 9);
  });

  it('Pascal’s barrel: a litre in a 10 m tube pushes a 0.3 m² lid with about three tonnes-force', () => {
    const tubeWater = RHO_WATER * G * pipeArea(0.01) * 10;
    const lid = hydrostaticPressure(10) * 0.3;
    expect(tubeWater).toBeLessThan(10);
    expect(lid).toBeGreaterThan(29_000);
    expect(lid / tubeWater).toBeGreaterThan(3000);
  });
});

describe('geometry helpers', () => {
  it('shoelace and point-in-polygon agree with a unit square', () => {
    const sq: Vec2[] = [[0, 0], [1, 0], [1, 1], [0, 1]];
    expect(polygonArea(sq)).toBeCloseTo(1, 12);
    expect(pointInPolygon([0.5, 0.5], sq)).toBe(true);
    expect(pointInPolygon([1.5, 0.5], sq)).toBe(false);
    expect(Math.abs(polygonArea(clipBelow(sq, 0.25)))).toBeCloseTo(0.25, 12);
  });
});

describe('buoyancy is the pressure integrated over the surface (Archimedes falls out)', () => {
  const shapes: Record<string, Vec2[]> = {
    block: blockPolygon(0, -1, 0.4, 0.4),
    triangle: [[0, -2], [0.6, -1.5], [-0.3, -1.2]],
    tiltedSquare: [[0, -1.5], [0.3, -1.2], [0, -0.9], [-0.3, -1.2]],
    circle: Array.from({ length: 256 }, (_, i) => {
      const a = (2 * Math.PI * i) / 256;
      return [0.25 * Math.cos(a), -1 + 0.25 * Math.sin(a)] as Vec2;
    }),
  };

  for (const [name, poly] of Object.entries(shapes)) {
    it(`${name}: net push is ρ g × area, straight up, with no sideways part`, () => {
      const [fx, fy] = pressureForceOnPolygon(poly, 0);
      const A = Math.abs(polygonArea(poly));
      expect(fy / displacedWeight(A)).toBeCloseTo(1, 9);
      expect(Math.abs(fx)).toBeLessThan(1e-9 * fy);
    });
  }

  it('the same integral with the vertices in the other order gives the same force', () => {
    const cw = [...shapes.triangle].reverse();
    const a = pressureForceOnPolygon(shapes.triangle, 0);
    const b = pressureForceOnPolygon(cw, 0);
    expect(b[1]).toBeCloseTo(a[1], 9);
  });

  it('a partly submerged shape is pushed up by the weight of only the part under water', () => {
    const poly = shapes.tiltedSquare.map(([x, y]) => [x, y + 1.3] as Vec2); // spans y 0.1 … −0.2 … 0.4
    const [, fy] = pressureForceOnPolygon(poly, 0);
    expect(fy / displacedWeight(submergedArea(poly, 0))).toBeCloseTo(1, 9);
    expect(submergedArea(poly, 0)).toBeLessThan(Math.abs(polygonArea(poly)));
  });

  it('a real 3D sphere, integrated over θ and φ: ρ g (4/3)πr³ when under, a cap when half out', () => {
    const r = 0.2;
    const full = pressureForceOnSphere(r, -1, 0);
    expect(full / displacedWeight((4 / 3) * Math.PI * r ** 3)).toBeCloseTo(1, 4);
    const partial = pressureForceOnSphere(r, 0.05, 0); // centre 5 cm above the surface
    expect(partial / displacedWeight(sphericalCap(r, r - 0.05))).toBeCloseTo(1, 3);
  });

  it('once under, the net push stops growing even though every face is pushed harder', () => {
    const w = 0.4, h = 0.4, L = 0.4;
    const shallow = blockFaceForces(0.0, w, h, L);
    const deep = blockFaceForces(1.5, w, h, L);
    expect(deep.up).toBeGreaterThan(shallow.up * 4);
    expect(deep.down).toBeGreaterThan(shallow.down + 2000);
    expect(deep.net).toBeCloseTo(shallow.net, 9);
    expect(deep.net).toBeCloseTo(deep.up - deep.down, 9);
    expect(deep.net).toBeCloseTo(displacedWeight(w * h * L), 9);
  });

  it('while still breaking the surface, sinking it deeper does increase the push', () => {
    const a = blockFaceForces(-0.3, 0.4, 0.4, 0.4).net;
    const b = blockFaceForces(-0.1, 0.4, 0.4, 0.4).net;
    const c = blockFaceForces(0, 0.4, 0.4, 0.4).net;
    expect(a).toBeLessThan(b);
    expect(b).toBeLessThan(c);
  });

  it('the push does not depend on what the body is made of — only on the water it replaces', () => {
    // pressureForceOnPolygon never takes a density for the body at all; this
    // test pins that a body of water itself is exactly held up by it.
    const poly = shapes.triangle;
    const [, fy] = pressureForceOnPolygon(poly, 0);
    const weightOfThatWater = RHO_WATER * G * Math.abs(polygonArea(poly));
    expect(fy - weightOfThatWater).toBeCloseTo(0, 6);
  });
});

describe('a loaded barge floats where the water it pushes aside weighs as much as it does', () => {
  const barge: Barge = { length: 10, beam: 4, height: 1.6, mass: 20_000 };

  it('floats empty at 0.5 m, and needs 24 t of cargo to reach a 1.1 m mark', () => {
    expect(floatDraft(barge, barge.mass)).toBeCloseTo(0.5, 12);
    expect(floatDraft(barge, barge.mass + 24_000)).toBeCloseTo(1.1, 12);
  });

  it('the pressure integral on the hull equals the weight it carries at the float draft', () => {
    const total = 44_000;
    const d = floatDraft(barge, total);
    expect(hullBuoyancy(barge, d) / (total * G)).toBeCloseTo(1, 9);
    expect(displacedMass(barge, d)).toBeCloseTo(total, 6);
  });

  it('released from its empty draft, the bobbing hull settles at the float draft', () => {
    const total = 44_000;
    let s = { draft: 0.5, v: 0 };
    for (let i = 0; i < 20 * 240; i++) s = heaveStep(barge, total, s, 1 / 240);
    expect(s.draft).toBeCloseTo(floatDraft(barge, total), 3);
  });

  it('rides higher in seawater with the same load', () => {
    expect(floatDraft(barge, 44_000, RHO_SEAWATER)).toBeLessThan(floatDraft(barge, 44_000));
  });
});

/* Lesson 2 — "The fast part pushes less" */

describe('continuity: the same volume per second through every section', () => {
  it('halving a round pipe’s diameter makes the water four times as fast, not twice', () => {
    const Q = flowSpeed(1, 1) * pipeArea(1);
    expect(flowSpeed(Q, 0.5) / flowSpeed(Q, 1)).toBeCloseTo(4, 12);
    expect(flowSpeed(Q, 1 / Math.SQRT2) / flowSpeed(Q, 1)).toBeCloseTo(2, 12);
  });

  it('the flux v·A is the same all along a venturi', () => {
    const vt = { D: 0.12, d: 0.07, xc: 0.8, hw: 0.28, v1: 1, p1: 3924 };
    for (const x of [0, 0.6, 0.7, 0.8, 0.95, 1.5]) {
      const { v } = venturiAt(vt, x);
      expect(v * pipeArea(waistDiameter(x, vt.D, vt.d, vt.xc, vt.hw))).toBeCloseTo(pipeArea(vt.D), 12);
    }
  });
});

describe('Bernoulli: the fast part is at lower pressure', () => {
  const vt = { D: 0.12, d: 0.12 / Math.SQRT2, xc: 0.8, hw: 0.28, v1: 1, p1: 3924 };

  it('the waist column stands lowest, and the columns before and after match', () => {
    const before = columnHeight(venturiAt(vt, 0.25).p);
    const waist = columnHeight(venturiAt(vt, 0.8).p);
    const after = columnHeight(venturiAt(vt, 1.35).p);
    expect(before).toBeCloseTo(0.4, 3);
    expect(after).toBeCloseTo(before, 12);
    expect(waist).toBeLessThan(before);
    // twice as fast: ½ρ(2² − 1²) = 1500 Pa lower, 15.3 cm of column
    expect(before - waist).toBeCloseTo(1500 / (RHO_WATER * G), 9);
  });

  it('pinch hard enough and the waist falls below the air’s pressure: the tube sucks air in', () => {
    const tight = { ...vt, d: vt.D / 2 };
    expect(venturiAt(tight, 0.8).p).toBeLessThan(0);
  });

  it('p + ½ρv² is the same at every point along the pipe', () => {
    const tot = (x: number) => { const { v, p } = venturiAt(vt, x); return p + 0.5 * RHO_WATER * v * v; };
    for (const x of [0.1, 0.6, 0.8, 1.0]) expect(tot(x)).toBeCloseTo(tot(0), 6);
  });

  it('a parcel speeding into the waist has more pressure behind it than in front', () => {
    const behind = venturiAt(vt, 0.6).p, ahead = venturiAt(vt, 0.7).p;
    expect(behind).toBeGreaterThan(ahead);
  });

  it('includes height: water rising 1 m at constant speed loses ρ g · 1 m of pressure', () => {
    expect(bernoulliPressure(20_000, 2, 0, 2, 1)).toBeCloseTo(20_000 - RHO_WATER * G, 9);
  });
});

describe('Torricelli: the hole’s depth sets the speed; its height sets the fall', () => {
  it('leaves at √(2gh), the speed of a stone dropped from the surface', () => {
    expect(torricelliSpeed(0.8)).toBeCloseTo(Math.sqrt(2 * G * 0.8), 12);
  });

  it('a deeper hole is faster but does not reach farther: the range is 2√(y(H−y))', () => {
    const H = 1;
    for (const y of [0.1, 0.2, 0.35, 0.5, 0.8]) expect(jetRange(y, H)).toBeCloseTo(2 * Math.sqrt(y * (H - y)), 12);
    expect(torricelliSpeed(H - 0.1)).toBeGreaterThan(torricelliSpeed(H - 0.5));
    expect(jetRange(0.1, H)).toBeLessThan(jetRange(0.5, H));
  });

  it('reaches farthest from halfway down, exactly as far as the water is deep', () => {
    let best = 0, bestY = 0;
    for (let y = 0.01; y < 1; y += 0.001) if (jetRange(y, 1) > best) { best = jetRange(y, 1); bestY = y; }
    expect(bestY).toBeCloseTo(0.5, 2);
    expect(best).toBeCloseTo(1, 5);
  });

  it('two holes mirrored about halfway land in the same bucket: 0.2 m and 0.8 m both reach 0.8 m', () => {
    expect(jetRange(0.2, 1)).toBeCloseTo(0.8, 12);
    expect(jetRange(0.8, 1)).toBeCloseTo(0.8, 12);
  });

  it('agrees with a projectile integrated step by step', () => {
    const y = 0.3, H = 1;
    const flight = launchProjectile(torricelliSpeed(H - y), 0, { groundY: -y, dt: 1e-4 });
    const last = flight[flight.length - 1];
    expect(last.x).toBeCloseTo(jetRange(y, H), 3);
    const path = jetPath(y, H);
    expect(path[path.length - 1][1]).toBeCloseTo(0, 9);
  });
});
