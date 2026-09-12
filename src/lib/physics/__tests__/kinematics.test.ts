import { describe, expect, it } from 'vitest';
import {
  accumulate,
  centripetal,
  constantAccel,
  differentiate,
  distanceTravelled,
  idealApex,
  idealRange,
  launchProjectile,
  netDisplacement,
  speedingUp,
  tangentNormalSplit,
  turningPoints,
  worldlineFrom,
  worldlineFromAcceleration,
} from '../kinematics.ts';
import { monotoneSpline, monotoneTangents } from '../interp.ts';
import {
  along,
  angleBetween2,
  closesLoop,
  componentsIn,
  cross2,
  cross3,
  decompose,
  dot2,
  mag2,
  rotate2,
} from '../vectors.ts';

/* ── vectors ──────────────────────────────────────────────────────────────
   The claims Chapter 1 makes out loud, pinned as assertions.
   ──────────────────────────────────────────────────────────────────────── */

describe('vectors', () => {
  it('rotating the grid leaves the arrow length alone', () => {
    const a = [3, 4] as const;
    for (const th of [0.1, 0.7, 1.9, -2.4]) {
      expect(mag2(componentsIn(a, th))).toBeCloseTo(5, 12);
    }
  });

  it('rotating the arrow and rotating the grid are opposite operations', () => {
    const a = [2, -5] as const;
    const th = 0.63;
    const there = rotate2(a, th);
    const back = componentsIn(there, th);
    expect(back[0]).toBeCloseTo(a[0], 12);
    expect(back[1]).toBeCloseTo(a[1], 12);
  });

  it('the dot product is invariant under a shared rotation', () => {
    const a = [1, 2] as const;
    const b = [-3, 0.5] as const;
    const th = 1.1;
    expect(dot2(rotate2(a, th), rotate2(b, th))).toBeCloseTo(dot2(a, b), 12);
  });

  it('a perpendicular force contributes nothing along the motion', () => {
    // Why uniform circular motion does no work, in one assertion.
    expect(along([0, 5], [3, 0])).toBeCloseTo(0, 12);
    expect(angleBetween2([0, 5], [3, 0])).toBeCloseTo(Math.PI / 2, 12);
  });

  it('the 2D cross product is a signed area that flips with order', () => {
    expect(cross2([2, 0], [0, 3])).toBeCloseTo(6, 12);
    expect(cross2([0, 3], [2, 0])).toBeCloseTo(-6, 12);
  });

  it('the 3D cross product is perpendicular to both inputs', () => {
    const a = [1, 2, 3] as const;
    const b = [-2, 0.5, 4] as const;
    const c = cross3(a, b);
    expect(c[0] * a[0] + c[1] * a[1] + c[2] * a[2]).toBeCloseTo(0, 12);
    expect(c[0] * b[0] + c[1] * b[1] + c[2] * b[2]).toBeCloseTo(0, 12);
  });

  it('decompose splits a vector into pieces that add back up', () => {
    const a = [4, -1] as const;
    const b = [1, 1] as const;
    const { parallel, perpendicular } = decompose(a, b);
    expect(parallel[0] + perpendicular[0]).toBeCloseTo(a[0], 12);
    expect(parallel[1] + perpendicular[1]).toBeCloseTo(a[1], 12);
    expect(dot2(perpendicular, b)).toBeCloseTo(0, 12);
  });

  it('three displacements that return you home close the loop', () => {
    expect(closesLoop([[3, 0], [0, 4], [-3, -4]])).toBe(true);
    expect(closesLoop([[3, 0], [0, 4], [-3, -3]])).toBe(false);
  });
});

/* ── interpolation ───────────────────────────────────────────────────────── */

describe('monotone interpolation', () => {
  it('passes through every handle', () => {
    const knots = [
      { t: 0, y: 0 },
      { t: 1, y: 3 },
      { t: 2, y: 3 },
      { t: 4, y: -2 },
    ];
    const s = monotoneSpline(knots);
    for (const k of knots) expect(s.at(k.t)).toBeCloseTo(k.y, 10);
  });

  it('never overshoots between handles — the property the a(t) panel depends on', () => {
    // A hard step: a plain Catmull-Rom spline rings badly here, which would
    // show up as acceleration the learner never asked for.
    const knots = [
      { t: 0, y: 0 },
      { t: 1, y: 0 },
      { t: 2, y: 5 },
      { t: 3, y: 5 },
    ];
    const s = monotoneSpline(knots);
    for (let t = 0; t <= 3; t += 0.01) {
      expect(s.at(t)).toBeGreaterThanOrEqual(-1e-9);
      expect(s.at(t)).toBeLessThanOrEqual(5 + 1e-9);
    }
  });

  it('flattens the tangent at a local extremum', () => {
    const m = monotoneTangents([
      { t: 0, y: 0 },
      { t: 1, y: 4 },
      { t: 2, y: 0 },
    ]);
    expect(m[1]).toBe(0);
  });

  it('the analytic slope agrees with a finite difference of the value', () => {
    const s = monotoneSpline([
      { t: 0, y: 1 },
      { t: 1, y: 2.5 },
      { t: 2.5, y: 2.5 },
      { t: 4, y: -1 },
    ]);
    for (const t of [0.3, 1.4, 2.0, 3.1]) {
      const h = 1e-6;
      const fd = (s.at(t + h) - s.at(t - h)) / (2 * h);
      expect(s.slopeAt(t)).toBeCloseTo(fd, 5);
    }
  });
});

/* ── the linked stack ────────────────────────────────────────────────────── */

describe('worldline', () => {
  it('differentiating constant-acceleration motion recovers v and a', () => {
    const w = worldlineFrom(constantAccel(2, 5, -3), 0, 4, 801);
    const mid = 400;
    expect(w.v[mid]).toBeCloseTo(5 - 3 * w.t[mid], 4);
    expect(w.a[mid]).toBeCloseTo(-3, 3);
  });

  it('integrating back up the stack returns the curve you started from', () => {
    // The round trip IS the chapter's claim that there is only one curve.
    const down = worldlineFrom(constantAccel(2, 5, -3), 0, 4, 801);
    const up = worldlineFromAcceleration(() => -3, 2, 5, 0, 4, 801);
    for (const i of [100, 400, 700]) {
      expect(up.x[i]).toBeCloseTo(down.x[i], 5);
      expect(up.v[i]).toBeCloseTo(down.v[i], 5);
    }
  });

  it('accumulate is undone by differentiate', () => {
    const t = Array.from({ length: 2001 }, (_, i) => i * 0.002);
    const v = t.map((ti) => Math.sin(ti) * 3);
    const x = accumulate(t, v, 7);
    expect(x[0]).toBe(7);
    // Both steps are second order, so the round trip converges as h² — at
    // h = 0.002 that leaves a few parts in 10⁶, and tightening the assertion
    // past that would be asserting against the discretisation, not the code.
    const back = differentiate(t, x);
    expect(back[1000]).toBeCloseTo(v[1000], 5);
  });

  it('the constant of integration is the thing v(t) alone cannot tell you', () => {
    const t = Array.from({ length: 201 }, (_, i) => i * 0.05);
    const v = t.map(() => 2);
    const fromZero = accumulate(t, v, 0);
    const fromTen = accumulate(t, v, 10);
    expect(netDisplacement(fromZero)).toBeCloseTo(netDisplacement(fromTen), 10);
    expect(fromTen[0] - fromZero[0]).toBe(10);
  });

  it('distance travelled exceeds net displacement when the motion turns', () => {
    // Up and back down: 20 m of travel, zero displacement.
    const t = Array.from({ length: 2001 }, (_, i) => i * 0.002);
    const v = t.map((ti) => (ti < 2 ? 5 : -5));
    const x = accumulate(t, v, 0);
    expect(distanceTravelled(t, v)).toBeCloseTo(20, 1);
    expect(Math.abs(netDisplacement(x))).toBeLessThan(0.05);
  });

  it('finds the instant the motion turns around', () => {
    const t = Array.from({ length: 401 }, (_, i) => i * 0.01);
    const v = t.map((ti) => 4 - 2 * ti);
    const turns = turningPoints(t, v);
    expect(turns).toHaveLength(1);
    expect(turns[0]).toBeCloseTo(2, 3);
  });

  it('speeding up is v and a sharing a sign, not the sign of a', () => {
    // Moving left and getting faster: v < 0, a < 0, speed rising.
    expect(speedingUp([-3], [-1])[0]).toBe(true);
    // Moving left and slowing: v < 0, a > 0.
    expect(speedingUp([-3], [1])[0]).toBe(false);
    expect(speedingUp([3], [1])[0]).toBe(true);
  });
});

/* ── projectiles and circles ─────────────────────────────────────────────── */

describe('projectile', () => {
  it('reproduces the closed-form range with no drag', () => {
    const path = launchProjectile(30, 40, { drag: 0, dt: 0.0005 });
    const landed = path[path.length - 1];
    expect(landed.x).toBeCloseTo(idealRange(30, 40), 1);
  });

  it('reproduces the closed-form apex with no drag', () => {
    const path = launchProjectile(30, 40, { drag: 0, dt: 0.0005 });
    const apex = Math.max(...path.map((p) => p.y));
    expect(apex).toBeCloseTo(idealApex(30, 40), 2);
  });

  it('keeps horizontal velocity exactly constant with no drag', () => {
    // "Horizontal velocity dies off" is the misconception; the model must not
    // quietly agree with it through integrator error.
    const path = launchProjectile(30, 40, { drag: 0, dt: 0.0005 });
    const vx0 = path[0].vx;
    for (const p of path) expect(p.vx).toBeCloseTo(vx0, 10);
  });

  it('drag shortens the range and makes the descent steeper than the climb', () => {
    const dry = launchProjectile(45, 45, { drag: 0, dt: 0.0005 });
    const wet = launchProjectile(45, 45, { drag: 0.01, dt: 0.0005 });
    const dryX = dry[dry.length - 1].x;
    const wetX = wet[wet.length - 1].x;
    expect(wetX).toBeLessThan(dryX);

    const apexIdx = wet.reduce((best, p, i) => (p.y > wet[best].y ? i : best), 0);
    const climb = wet[apexIdx].x;
    const fall = wetX - climb;
    expect(fall).toBeLessThan(climb);
  });

  it('45 degrees maximises range only when there is no drag', () => {
    const at = (deg: number) => {
      const p = launchProjectile(40, deg, { drag: 0, dt: 0.0005 });
      return p[p.length - 1].x;
    };
    expect(at(45)).toBeGreaterThan(at(35));
    expect(at(45)).toBeGreaterThan(at(55));
  });
});

describe('tangent/normal split', () => {
  it('puts all of a centripetal acceleration into the steering term', () => {
    // Moving +x, accelerating +y: pure turn, no speed change.
    const { tangential, normal } = tangentNormalSplit(5, 0, 0, 3);
    expect(tangential).toBeCloseTo(0, 12);
    expect(Math.abs(normal)).toBeCloseTo(3, 12);
  });

  it('puts all of a collinear acceleration into the speed term', () => {
    const { tangential, normal } = tangentNormalSplit(5, 0, 2, 0);
    expect(tangential).toBeCloseTo(2, 12);
    expect(normal).toBeCloseTo(0, 12);
  });

  it('an object can speed up while its acceleration points backwards-ish', () => {
    // v along +x, a mostly +x but tilted: still speeding up.
    const { tangential } = tangentNormalSplit(4, 0, 1, -6);
    expect(tangential).toBeGreaterThan(0);
  });

  it('centripetal acceleration grows with the square of speed', () => {
    expect(centripetal(4, 2)).toBeCloseTo(8, 12);
    expect(centripetal(8, 2) / centripetal(4, 2)).toBeCloseTo(4, 12);
  });
});
