import { describe, expect, it } from 'vitest';
import { fluxThroughCircle } from '../fields.ts';
import {
  EPS0,
  K,
  NANO,
  chargesAsRods,
  chargesInside,
  clusterAt,
  contains,
  dropOutline,
  ellipseLoop,
  enclosedLambda,
  fluxThroughLoop,
  gaussFlux,
  nearestOnLoop,
  normalFieldAlong,
  offsetOutline,
  perimeter,
  pointField,
  rodField,
  rodsFromNano,
  settle,
  sphereShellField,
  tubeRods,
  type Loop,
} from '../gauss.ts';
import type { Vec2 } from '../vectors.ts';

const mag = (v: Vec2) => Math.hypot(v[0], v[1]);

/** A star-shaped, non-convex loop: nothing like a circle. */
function starLoop(cx: number, cy: number, r: number, n = 400): Vec2[] {
  const out: Vec2[] = [];
  for (let i = 0; i < n; i++) {
    const t = (2 * Math.PI * i) / n;
    const rr = r * (1 + 0.45 * Math.sin(5 * t));
    out.push([cx + rr * Math.cos(t), cy + rr * Math.sin(t)]);
  }
  return out;
}

describe('units', () => {
  it('1 nC per metre of rod sends 113 N·m²/C through 1 m of sleeve', () => {
    expect(gaussFlux(1 * NANO)).toBeCloseTo(112.94, 1);
    expect(EPS0).toBeCloseTo(8.8541878e-12, 18);
  });

  it('a rod field is λ / 2πε₀r: 36 N/C half a metre from 1 nC/m', () => {
    const rods = rodsFromNano([{ x: 0, y: 0, q: 1 }]);
    expect(mag(rodField(rods, 0.5, 0))).toBeCloseTo(NANO / (2 * Math.PI * EPS0 * 0.5), 6);
    expect(mag(rodField(rods, 0.5, 0))).toBeCloseTo(35.95, 1);
  });
});

describe('flux counts what is inside (the hook and the covered meter)', () => {
  const one = rodsFromNano([{ x: 0, y: 0, q: 1 }]);

  it('stretching the sleeve to twice its size leaves the flux unchanged', () => {
    const small = fluxThroughLoop(one, ellipseLoop(0, 0, 0.5, 0.5));
    const big = fluxThroughLoop(one, ellipseLoop(0, 0, 1, 1));
    expect(small).toBeCloseTo(gaussFlux(NANO), 3);
    expect(big).toBeCloseTo(small, 3);
  });

  it('from 45 N/C on a sleeve of radius 0.4 m to 22 N/C at 0.8 m', () => {
    expect(normalFieldAlong(one, ellipseLoop(0, 0, 0.4, 0.4))[0].en).toBeCloseTo(44.9, 1);
    expect(normalFieldAlong(one, ellipseLoop(0, 0, 0.8, 0.8))[0].en).toBeCloseTo(22.5, 1);
  });

  it('while the field on the sleeve halves', () => {
    const near = normalFieldAlong(one, ellipseLoop(0, 0, 0.5, 0.5))[0].en;
    const far = normalFieldAlong(one, ellipseLoop(0, 0, 1, 1))[0].en;
    expect(near / far).toBeCloseTo(2, 3);
  });

  it('squashing, shifting and crumpling the sleeve leave the flux unchanged', () => {
    const target = gaussFlux(NANO);
    const shapes: Loop[] = [
      ellipseLoop(0, 0, 1.8, 0.15),
      ellipseLoop(0.3, -0.2, 0.5, 1.1),
      starLoop(0.1, 0.05, 0.6),
      // a sleeve that passes within 3 cm of the rod
      ellipseLoop(0.47, 0, 0.5, 0.4),
    ];
    for (const loop of shapes) {
      expect(contains(loop, 0, 0)).toBe(true);
      expect(fluxThroughLoop(one, loop) / target).toBeCloseTo(1, 4);
    }
  });

  it('the flux changes only when a rod crosses the sleeve', () => {
    const rods = rodsFromNano([{ x: 0, y: 0, q: 1 }]);
    const values: number[] = [];
    // Slide a sleeve of radius 0.6 from far left to far right past the rod.
    for (let cx = -1.5; cx <= 1.5001; cx += 0.05) {
      if (Math.abs(Math.abs(cx) - 0.6) < 0.03) continue; // rod on the sleeve itself
      values.push(fluxThroughLoop(rods, ellipseLoop(cx, 0, 0.6, 0.6)));
    }
    const levels = values.map((v) => Math.round(v / gaussFlux(NANO)));
    expect(new Set(levels)).toEqual(new Set([0, 1]));
    for (const v of values) expect(Math.abs(v - Math.round(v / gaussFlux(NANO)) * gaussFlux(NANO))).toBeLessThan(0.05);
  });

  it('the covered-meter puzzle: only wrapping +3 and −2 gives 113', () => {
    const rods = rodsFromNano([{ x: -1.3, y: 0.35, q: 3 }, { x: -0.1, y: -0.35, q: -2 }, { x: 1.2, y: 0.45, q: 2 }]);
    const both = ellipseLoop(-0.7, 0, 1.0, 0.7);
    expect(enclosedLambda(rods, both) / NANO).toBeCloseTo(1, 9);
    expect(fluxThroughLoop(rods, both)).toBeCloseTo(gaussFlux(NANO), 2);
    const alone = ellipseLoop(-1.3, 0.35, 0.4, 0.4);
    expect(fluxThroughLoop(rods, alone)).toBeCloseTo(gaussFlux(3 * NANO), 2);
    const all = ellipseLoop(0, 0, 2.0, 1.0);
    expect(fluxThroughLoop(rods, all)).toBeCloseTo(gaussFlux(3 * NANO), 2);
  });

  it('matches the enclosed charge for a mixed set and any sleeve', () => {
    const rods = rodsFromNano([{ x: -0.4, y: 0.1, q: 2 }, { x: 0.3, y: -0.2, q: -1.5 }, { x: 2, y: 1, q: 5 }]);
    const loop = starLoop(0, 0, 0.9);
    expect(fluxThroughLoop(rods, loop)).toBeCloseTo(gaussFlux(0.5 * NANO), 2);
  });
});

describe('a charge outside moves the field, not the flux', () => {
  const R = 1;
  const markAngle = (30 * Math.PI) / 180;
  const mark: Vec2 = [R * Math.cos(markAngle), R * Math.sin(markAngle)];
  const sleeve = ellipseLoop(0, 0, R, R);

  it('a second +1 rod twice as far out along the mark cancels the field there', () => {
    const alone = rodsFromNano([{ x: 0, y: 0, q: 1 }]);
    const both = rodsFromNano([{ x: 0, y: 0, q: 1 }, { x: 2 * mark[0], y: 2 * mark[1], q: 1 }]);
    expect(mag(rodField(alone, mark[0], mark[1]))).toBeCloseTo(17.98, 1);
    expect(mag(rodField(both, mark[0], mark[1]))).toBeLessThan(1e-6);
    // …and the flux never noticed.
    expect(fluxThroughLoop(both, sleeve)).toBeCloseTo(fluxThroughLoop(alone, sleeve), 2);
  });

  it('while the field around the sleeve is rearranged, from nothing at the mark to over 20 N/C across from it', () => {
    const both = rodsFromNano([{ x: 0, y: 0, q: 1 }, { x: 2 * mark[0], y: 2 * mark[1], q: 1 }]);
    const en = normalFieldAlong(both, sleeve).map((t) => t.en);
    expect(Math.min(...en)).toBeLessThan(0.5);
    expect(Math.max(...en)).toBeGreaterThan(20);
  });

  it('no +1 rod inside the sleeve can cancel the field at the mark', () => {
    let best = Infinity;
    for (let x = -0.95; x <= 0.95; x += 0.05) {
      for (let y = -0.95; y <= 0.95; y += 0.05) {
        if (Math.hypot(x, y) > 0.97) continue;
        const rods = rodsFromNano([{ x: 0, y: 0, q: 1 }, { x, y, q: 1 }]);
        best = Math.min(best, mag(rodField(rods, mark[0], mark[1])));
      }
    }
    expect(best).toBeGreaterThan(8);
  });
});

describe('the trap: this only works because the field falls as 1/r in the plane', () => {
  it('a circle round a 1/r² point charge loses half its "flux" when it doubles', () => {
    const s = [{ x: 0, y: 0, q: 1 }];
    const o = { kind: 'point' as const, soften: 1e-6 };
    expect(fluxThroughCircle(s, 0, 0, 2, o) / fluxThroughCircle(s, 0, 0, 1, o)).toBeCloseTo(0.5, 4);
  });
});

describe('symmetry: the charged tube and the charged shell', () => {
  const lambda = 3 * NANO;
  const R = 0.7;
  const tube = tubeRods(0, 0, R, lambda);
  const axis = [{ x: 0, y: 0, q: lambda }];

  it('the field inside a uniform tube is zero, everywhere inside', () => {
    const outside = mag(rodField(tube, 1.2, 0));
    for (const [x, y] of [[0, 0], [0.3, 0.1], [-0.5, 0.2], [0.1, -0.55]] as Vec2[]) {
      expect(mag(rodField(tube, x, y)) / outside).toBeLessThan(1e-6);
    }
  });

  it('even just inside the wall, next to the charge', () => {
    expect(mag(rodField(tube, R - 0.05, 0.02))).toBeLessThan(0.01);
  });

  it('outside, the tube acts as if all its charge were on the axis', () => {
    for (const [x, y] of [[0.9, 0], [1.1, 0.6], [-0.2, -1.6]] as Vec2[]) {
      const a = rodField(tube, x, y);
      const b = rodField(axis, x, y);
      expect(a[0]).toBeCloseTo(b[0], 6);
      expect(a[1]).toBeCloseTo(b[1], 6);
    }
  });

  it('a uniform spherical shell: zero inside, a point charge at its centre outside', () => {
    const Q = 1e-6, Rs = 2;
    for (const d of [0, 0.5, 1.2, 1.8]) expect(Math.abs(sphereShellField(Q, Rs, d))).toBeLessThan(1e-4 * pointField(Q, Rs));
    for (const d of [2.3, 3, 6]) expect(sphereShellField(Q, Rs, d) / pointField(Q, d)).toBeCloseTo(1, 5);
  });
});

describe('choosing the Gaussian sleeve', () => {
  const lambda = 3 * NANO;
  const R = 0.6;
  const tube = tubeRods(0, 0, R, lambda);
  const probe: Vec2 = [1.0, 0.6];
  const rp = Math.hypot(...probe);

  it('the concentric sleeve through the probe has one field value all round, and E = Φ / 2πr', () => {
    const loop = ellipseLoop(0, 0, rp, rp);
    const en = normalFieldAlong(tube, loop).map((t) => t.en);
    expect(Math.max(...en) / Math.min(...en)).toBeLessThan(1.0001);
    const phi = fluxThroughLoop(tube, loop);
    expect(phi).toBeCloseTo(gaussFlux(lambda), 2);
    expect(phi / perimeter(loop)).toBeCloseTo(mag(rodField(tube, probe[0], probe[1])), 1);
    expect(mag(rodField(tube, probe[0], probe[1]))).toBeCloseTo(46.2, 1);
  });

  it('the numbers the lesson quotes: 339 N·m²/C, a sleeve of radius 1.17 m, 46.2 N/C', () => {
    expect(gaussFlux(lambda)).toBeCloseTo(338.8, 1);
    expect(rp).toBeCloseTo(1.17, 2);
    expect(gaussFlux(lambda) / (2 * Math.PI * rp)).toBeCloseTo(46.2, 1);
  });

  it('an off-centre sleeve has the same flux but no single field to read off', () => {
    const loop = ellipseLoop(0.3, 0.1, rp, rp);
    const en = normalFieldAlong(tube, loop).map((t) => t.en);
    expect(fluxThroughLoop(tube, loop)).toBeCloseTo(gaussFlux(lambda), 2);
    expect(Math.max(...en) / Math.min(...en)).toBeGreaterThan(1.3);
  });
});

describe('a conductor: charge put inside ends on the surface', () => {
  const metal = dropOutline(-0.35, 0, 0.6);
  const N = 48;
  const lambda = 6 * NANO;
  const settled = settle(clusterAt(-0.3, 0.05, N, 0.08), metal, 1500);
  const rods = chargesAsRods(settled, lambda);

  it('the outline is a closed teardrop with its sharp edge at +x', () => {
    expect(contains(metal, -0.35, 0)).toBe(true);
    expect(contains(metal, 0.8, 0)).toBe(true);
    expect(contains(metal, 0.9, 0)).toBe(false);
    expect(contains(metal, -0.97, 0)).toBe(false);
  });

  it('every charge ends on the surface, wherever it was put in', () => {
    expect(chargesInside(settled, metal)).toBe(0);
    for (const p of settled) expect(nearestOnLoop(metal, p).d).toBeLessThan(1e-9);
    const elsewhere = settle(clusterAt(0.4, -0.05, N, 0.05), metal, 1500);
    expect(chargesInside(elsewhere, metal)).toBe(0);
  });

  it('and leaves the inside of the metal all but free of field', () => {
    const skin = offsetOutline(metal, 0.1);
    const outside = skin.map((p) => mag(rodField(rods, p[0], p[1])));
    const mean = outside.reduce((a, b) => a + b, 0) / outside.length;
    for (const [x, y] of [[-0.35, 0], [-0.6, 0.2], [0, 0], [-0.3, -0.3]] as Vec2[]) {
      expect(mag(rodField(rods, x, y)) / mean).toBeLessThan(0.02);
    }
  });

  it('the charge crowds toward the sharp edge, and the field just outside is strongest there', () => {
    const skin = offsetOutline(metal, 0.06);
    const field = skin.map((p) => mag(rodField(rods, p[0], p[1])));
    const iMax = field.indexOf(Math.max(...field));
    // the strongest spot is at the sharp edge…
    expect(skin[iMax][0]).toBeGreaterThan(0.8);
    // …well over the round end's field and about twice the flanks'
    const at = (x: number, y: number) => field[skin.reduce((bi, p, i) =>
      (Math.hypot(p[0] - x, p[1] - y) < Math.hypot(skin[bi][0] - x, skin[bi][1] - y) ? i : bi), 0)];
    expect(Math.max(...field) / at(-1.01, 0)).toBeGreaterThan(1.3);
    expect(Math.max(...field) / at(0.35, 0.33)).toBeGreaterThan(1.8);
    // and more charges sit near the sharp edge than near the round end
    const near = (x: number, y: number) => settled.filter((p) => Math.hypot(p[0] - x, p[1] - y) < 0.3).length;
    expect(near(0.85, 0)).toBeGreaterThan(near(-0.95, 0));
  });

  it('the numbers the lesson quotes: 226 N/C off the edge, 151 off the round end, 111 on a flank', () => {
    const skin = offsetOutline(metal, 0.06);
    for (const p of skin) expect(nearestOnLoop(metal, p).d).toBeCloseTo(0.06, 6);
    const field = skin.map((p) => mag(rodField(rods, p[0], p[1])));
    const at = (x: number, y: number) => field[skin.reduce((bi, p, i) =>
      (Math.hypot(p[0] - x, p[1] - y) < Math.hypot(skin[bi][0] - x, skin[bi][1] - y) ? i : bi), 0)];
    expect(Math.max(...field)).toBeGreaterThan(220);
    expect(Math.max(...field)).toBeLessThan(232);
    expect(Math.round(at(-1.01, 0) / 5) * 5).toBe(150);
    expect(Math.round(at(0.35, 0.33) / 5) * 5).toBe(110);
  });

  it('the field just outside is σ/ε₀: the local charge per area of surface', () => {
    // σ over the top of the round end: charges within ±35° of straight up,
    // counted about the round end's centre, per metre of arc.
    const win = (35 * Math.PI) / 180;
    const count = settled.filter((q) => Math.abs(Math.atan2(q[1], q[0] + 0.35) - Math.PI / 2) < win).length;
    const sigma = (count * (lambda / N)) / (2 * win * 0.6);
    const e = mag(rodField(rods, -0.35, 0.68));
    expect(e / (sigma / EPS0)).toBeGreaterThan(0.85);
    expect(e / (sigma / EPS0)).toBeLessThan(1.15);
  });

  it('K and ε₀ agree', () => {
    expect(1 / (4 * Math.PI * EPS0)).toBeCloseTo(K, 0);
  });
});
