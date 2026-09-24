/**
 * Claims made by chapter 7's two lessons ("Height is not force" and "The
 * energy line"), checked against the same code the scenes run.
 */
import { describe, expect, it } from 'vitest';
import {
  CART_MASS, G, TRACKS, arrival, bondForce, bondU, buildTrack, clearsAt, driftFromRest,
  ledger, pushAt, runCart, startAt, strongestPull, trackOf, turnAhead, withZeroShifted,
} from '../coaster-ch7.ts';
import { turningPointsOf } from '../landscape.ts';

const maxOf = (xs: readonly number[]) => xs.reduce((m, v) => (v > m ? v : m), -Infinity);

describe('a track is a landscape in distance along the rail', () => {
  for (const key of Object.keys(TRACKS)) {
    it(`${key}: dU/ds is the derivative of U(s), and equals m g sin θ`, () => {
      const t = trackOf(key);
      const h = 1e-5;
      for (const f of [0.15, 0.35, 0.5, 0.65, 0.85]) {
        const s = t.length * f;
        const fd = (t.land.U(s + h) - t.land.U(s - h)) / (2 * h);
        expect(t.land.dU(s)).toBeCloseTo(fd, 5);
        expect(t.land.dU(s)).toBeCloseTo(CART_MASS * G * Math.sin(t.angleAt(s)), 10);
      }
    });
  }
  it('s and x convert back and forth', () => {
    const t = trackOf('hump');
    for (const x of [0.3, 1.7, 3.8, 6.1]) expect(t.xAt(t.sAt(x))).toBeCloseTo(x, 8);
  });
  it('frictionless: K + U stays put over a long swing (Verlet, bounded)', () => {
    const t = trackOf('zeroValley');
    const run = runCart(t, startAt(t, 0.5), 60);
    const E0 = ledger(t, run[0]).total;
    expect(maxOf(run.map((st) => Math.abs(ledger(t, st).total - E0) / E0))).toBeLessThan(1e-4);
  });
});

describe('lesson 1: height is not force', () => {
  it('hook: A is higher, B is steeper, and B gains speed ~10× faster at first', () => {
    const t = trackOf('shelfAndDrop');
    const A = t.sAt(0.5), B = t.sAt(2.5);
    expect(t.heightAt(A)).toBeGreaterThan(t.heightAt(B) + 0.9);
    expect(Math.abs(pushAt(t, B))).toBeGreaterThan(10 * Math.abs(pushAt(t, A)));
    const vA = runCart(t, startAt(t, 0.5), 0.5).at(-1)!.v;
    const vB = runCart(t, startAt(t, 2.5), 0.5).at(-1)!.v;
    expect(vB).toBeGreaterThan(8 * vA);
  });
  it('hook, second act: A still finishes faster, because it drops further', () => {
    const t = trackOf('shelfAndDrop');
    const a = arrival(t, 0.5, 4.8), b = arrival(t, 2.5, 4.8);
    expect(a.v).toBeGreaterThan(b.v);
    expect(a.v).toBeCloseTo(Math.sqrt(2 * G * (t.h(0.5) - t.h(4.8))), 2);
  });
  it('stay put: the flat high shelf holds the cart, the low end does not', () => {
    const t = trackOf('stayPut');
    for (const x of [0.8, 1.2, 1.8]) {
      expect(Math.abs(pushAt(t, t.sAt(x)))).toBe(0);
      expect(driftFromRest(t, x)).toBe(0);
    }
    // The lowest reachable place is the right-hand end, and it still tilts.
    let low = 0.1;
    for (let x = 0.1; x <= 5.6; x += 0.01) if (t.h(x) < t.h(low)) low = x;
    expect(low).toBeGreaterThan(5.5);
    expect(Math.abs(pushAt(t, t.sAt(5.5)))).toBeCloseTo(CART_MASS * G * Math.sin(Math.atan(0.1)), 3);
    expect(driftFromRest(t, 5.5)).toBeGreaterThan(0.05);
    expect(t.h(1.2)).toBeGreaterThan(t.h(5.5) + 1);
  });
  it('moving the zero of U changes every U value and nothing else', () => {
    const t = trackOf('zeroValley');
    const up = withZeroShifted(t, -15.7), down = withZeroShifted(t, 10);
    const a = runCart(t, startAt(t, 0.5), 5), b = runCart(up, startAt(up, 0.5), 5), c = runCart(down, startAt(down, 0.5), 5);
    for (let i = 0; i < a.length; i += 97) {
      expect(b[i].s).toBe(a[i].s);
      expect(c[i].v).toBe(a[i].v);
      expect(up.land.U(a[i].s) - t.land.U(a[i].s)).toBeCloseTo(-15.7, 10);
    }
    expect(up.land.U(t.sAt(2))).toBeLessThan(0); // U goes negative in the valley…
    expect(Math.sign(pushAt(up, t.sAt(1)))).toBe(Math.sign(pushAt(t, t.sAt(1)))); // …the push does not flip
  });
  it('bond: the strongest pull is on the outer wall, not at the bottom', () => {
    const p = strongestPull();
    expect(p.r).toBeCloseTo(0.4237, 3);
    expect(p.F).toBeCloseTo(-11.64, 1);
    const bottom = 2 ** (1 / 6) * 0.3405;
    expect(bondU(bottom)).toBeCloseTo(-1.654, 3);
    expect(Math.abs(bondForce(bottom))).toBeLessThan(1e-6);
    expect(Math.abs(bondForce(0.7))).toBeLessThan(3);
    // Grading window: within 10 % of the strongest pull.
    expect(Math.abs(bondForce(0.41))).toBeGreaterThan(0.9 * 11.64);
    expect(Math.abs(bondForce(0.44))).toBeGreaterThan(0.9 * 11.64);
    expect(Math.abs(bondForce(0.39))).toBeLessThan(0.9 * 11.64);
  });
});

describe('lesson 2: the energy line', () => {
  it('hook: a dip changes the arrival time, not the arrival speed', () => {
    const g = trackOf('gentle'), d = trackOf('dipped');
    expect(g.h(1)).toBe(d.h(1));
    expect(g.h(4.8)).toBe(d.h(4.8));
    const a = arrival(g, 1, 4.8), b = arrival(d, 1, 4.8);
    expect(b.v).toBeCloseTo(a.v, 3);
    expect(a.v).toBeCloseTo(Math.sqrt(2 * G * (g.h(1) - g.h(4.8))), 3);
    expect(b.t).toBeLessThan(a.t - 0.05);
  });
  it('clear the hump: starting any height above 1.2 m clears it, below does not', () => {
    const t = trackOf('hump');
    expect(t.h(3.8)).toBeCloseTo(1.2, 12);
    const xFor = (h: number) => { let lo = 0.05, hi = 2.1; for (let k = 0; k < 60; k++) { const m = (lo + hi) / 2; if (t.h(m) > h) lo = m; else hi = m; } return (lo + hi) / 2; };
    expect(clearsAt(t, xFor(1.21), 3.8).cleared).toBe(true);
    const low = clearsAt(t, xFor(1.1), 3.8);
    expect(low.cleared).toBe(false);
    expect(low.turnHeight!).toBeCloseTo(1.1, 6); // it turns at its start height
    // The animation agrees: from 1.21 m the run crosses the top.
    const run = runCart(t, startAt(t, xFor(1.21)), 20, { until: (st) => st.s > t.sAt(3.9) });
    expect(run.at(-1)!.s).toBeGreaterThan(t.sAt(3.9));
  });
  it('mark the turn: it turns where U has swallowed all of K, not at its start height', () => {
    const t = trackOf('lopsided');
    const x0 = 0.7, v0 = 3;
    const turn = turnAhead(t, x0, v0);
    expect(turn.height!).toBeCloseTo(t.h(x0) + (v0 * v0) / (2 * G), 6);
    expect(turn.height! - t.h(x0)).toBeGreaterThan(0.4);
    // The run agrees with the line: max height reached equals the turn height.
    const s0 = t.sAt(x0);
    const run = runCart(t, { t: 0, s: s0, v: v0, heat: 0, crossings: 0 }, 4);
    const top = maxOf(run.filter((st) => st.s > t.sAt(2)).map((st) => t.heightAt(st.s)));
    expect(top).toBeCloseTo(turn.height!, 3);
    // Two turning points, both at the same height, far apart horizontally.
    const turns = turningPointsOf(t.land, turn.E, 6000);
    expect(turns).toHaveLength(2);
    expect(t.heightAt(turns[0])).toBeCloseTo(t.heightAt(turns[1]), 6);
    expect(t.xAt(turns[1]) - 1.5).toBeGreaterThan(2 * (1.5 - t.xAt(turns[0])));
  });
  it('brake strip: all the energy above the floor ends up as heat, whatever the strip length', () => {
    const t = trackOf('brakeValley');
    const f = 0.3 * CART_MASS * G;
    const results = [0.5, 1.0].map((L) => {
      const brake = { from: t.sAt(3 - L / 2), to: t.sAt(3 + L / 2), force: f };
      const run = runCart(t, startAt(t, 0.5), 60, { brake });
      const E0 = ledger(t, run[0]).total;
      const drift = maxOf(run.map((st) => Math.abs(ledger(t, st).total - E0) / E0));
      return { last: run.at(-1)!, drift };
    });
    const expected = CART_MASS * G * (t.h(0.5) - t.h(3));
    for (const r of results) {
      expect(r.last.v).toBe(0);
      expect(r.last.heat).toBeCloseTo(expected, 3);
      expect(r.drift).toBeLessThan(1e-3);
    }
    expect(results[0].last.crossings).toBeGreaterThan(results[1].last.crossings);
    // And the total distance slid on the strip is h/μ, both times.
    for (const r of results) expect(r.last.heat / f).toBeCloseTo((t.h(0.5) - t.h(3)) / 0.3, 3);
  });
  it('a fresh build matches the cached one', () => {
    const a = buildTrack(TRACKS.hump), b = trackOf('hump');
    expect(a.length).toBeCloseTo(b.length, 12);
  });
});

/** Every number the lesson prose quotes, recomputed. If a track changes
 *  shape, this fails before a lesson can say something false. */
describe('numbers quoted in the chapter 7 lessons', () => {
  it('lesson 1 hook: 3° shelf vs 66° drop, push ratio ~15, 0.3 vs 2.8 m/s after half a second', () => {
    const t = trackOf('shelfAndDrop');
    const A = t.sAt(0.5), B = t.sAt(2.5);
    expect(Math.abs(t.angleAt(A) * 180 / Math.PI)).toBeCloseTo(3.4, 1);
    expect(Math.abs(t.angleAt(B) * 180 / Math.PI)).toBeCloseTo(66, 0);
    const ratio = pushAt(t, B) / pushAt(t, A);
    expect(ratio).toBeGreaterThan(14.5);
    expect(ratio).toBeLessThan(16);
    expect(runCart(t, startAt(t, 0.5), 0.5).at(-1)!.v).toBeCloseTo(0.29, 2);
    expect(runCart(t, startAt(t, 2.5), 0.5).at(-1)!.v).toBeCloseTo(2.84, 2);
  });
  it('lesson 1 stay put: the low end tilts 5.7° and pushes 1.9 N', () => {
    const t = trackOf('stayPut');
    const s = t.sAt(5.5);
    expect(Math.abs(t.angleAt(s) * 180 / Math.PI)).toBeCloseTo(5.7, 1);
    expect(Math.abs(pushAt(t, s))).toBeCloseTo(1.95, 2);
  });
  it('lesson 1 zero: measured from 0.8 m up, U on the valley floor is −11.8 J', () => {
    const t = trackOf('zeroValley');
    const up = withZeroShifted(t, -CART_MASS * G * 0.8);
    expect(up.land.U(t.sAt(2))).toBeCloseTo(-11.76, 2);
    expect(t.land.U(t.sAt(1)) - up.land.U(t.sAt(1))).toBeCloseTo(15.7, 1); // every U drops by m g (0.8 m)
  });
  it('lesson 2 hook: both drop 0.75 m and finish at 3.84 m/s', () => {
    const g = trackOf('gentle'), d = trackOf('dipped');
    expect(g.h(1) - g.h(4.8)).toBeCloseTo(0.75, 2);
    expect(arrival(g, 1, 4.8).v).toBeCloseTo(3.84, 2);
    expect(arrival(d, 1, 4.8).v).toBeCloseTo(3.84, 2);
  });
  it('lesson 2 turn: 11.2 J + 9.0 J = 20.2 J, turning at 1.03 m', () => {
    const t = trackOf('lopsided');
    const l = ledger(t, startAt(t, 0.7, 3));
    expect(l.U).toBeCloseTo(11.2, 1);
    expect(l.K).toBeCloseTo(9.0, 6);
    expect(l.total).toBeCloseTo(20.2, 1);
    expect(turnAhead(t, 0.7, 3).height!).toBeCloseTo(1.03, 2);
  });
  it('lesson 2 brake: 17.5 J above the floor, 5.9 N of friction, 3.0 m of sliding', () => {
    const t = trackOf('brakeValley');
    expect(CART_MASS * G * (t.h(0.5) - t.h(3))).toBeCloseTo(17.5, 1);
    expect(0.3 * CART_MASS * G).toBeCloseTo(5.9, 1);
    expect((t.h(0.5) - t.h(3)) / 0.3).toBeCloseTo(3.0, 1);
  });
});
