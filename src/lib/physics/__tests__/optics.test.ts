import { describe, expect, it } from 'vitest';
import {
  centreAt, fanCrossing, fanFrom, floorMirror, heightAt, imageDistance, isVirtual, magnification,
  mirrorImage, mirrorNormal, principalRays, reflect, reflectionPoint, seenThrough, smallestMirror,
  spreadAt, visibleBand, wallMirror, type P2,
} from '../optics.ts';

const unit = (a: P2): P2 => { const L = Math.hypot(a[0], a[1]); return [a[0] / L, a[1] / L]; };

describe('the law of reflection', () => {
  it('keeps the part along the glass and flips the part across it', () => {
    const d = unit([1, -0.5]);
    const r = reflect(d, [0, 1]);
    expect(r[0]).toBeCloseTo(d[0], 14);
    expect(r[1]).toBeCloseTo(-d[1], 14);
  });

  it('the bisected reflection point really has equal angles either side of the normal', () => {
    const m = floorMirror(0);
    const src: P2 = [-0.6, 1.2], eye: P2 = [1.3, 0.7];
    const P = reflectionPoint(src, eye, m);
    const inc = unit([P[0] - src[0], P[1] - src[1]]);
    const out = unit([eye[0] - P[0], eye[1] - P[1]]);
    const r = reflect(inc, mirrorNormal(m));
    expect(r[0]).toBeCloseTo(out[0], 9);
    expect(r[1]).toBeCloseTo(out[1], 9);
  });
});

describe('a flat mirror makes a virtual image as far behind as the object is in front', () => {
  it('every eye traces its sight line back to the same point behind the glass', () => {
    const m = floorMirror(0);
    const lamp: P2 = [-0.6, 1.2];
    const img = mirrorImage(lamp, m);
    expect(img[0]).toBeCloseTo(-0.6, 12);
    expect(img[1]).toBeCloseTo(-1.2, 12);
    for (const eye of [[1.3, 0.7], [0.4, 2.1], [-1.8, 0.5]] as P2[]) {
      const P = reflectionPoint(lamp, eye, m);
      // the sight line eye → P, carried on in a straight line, passes through the image
      const d = [P[0] - eye[0], P[1] - eye[1]];
      const cross = d[0] * (img[1] - eye[1]) - d[1] * (img[0] - eye[0]);
      expect(Math.abs(cross)).toBeLessThan(1e-9);
    }
  });

  it('the image is not on the glass: two eyes see the lamp at two different spots on it', () => {
    const m = floorMirror(0);
    const lamp: P2 = [-0.6, 1.2];
    const a = reflectionPoint(lamp, [1.3, 0.7], m), b = reflectionPoint(lamp, [0.4, 2.1], m);
    expect(Math.abs(a[0] - b[0])).toBeGreaterThan(0.2);
  });
});

describe('you need a mirror half your height, whatever the distance', () => {
  const EYE = 1.68, HEAD = 1.8;

  it('the smallest whole-body mirror is exactly half your height at every distance', () => {
    for (const d of [0.3, 1, 2.4, 10]) {
      const s = smallestMirror(-d, EYE, HEAD, 0);
      expect(s.height).toBeCloseTo(HEAD / 2, 9);
      expect(s.bottom).toBeCloseTo(EYE / 2, 9);
      expect(s.top).toBeCloseTo((EYE + HEAD) / 2, 9);
    }
  });

  it('stepping back shows you no more of yourself: the visible band does not move', () => {
    const near = visibleBand([-0.5, EYE], 0, 1.2, 1.9);
    const far = visibleBand([-2.4, EYE], 0, 1.2, 1.9);
    expect(near.lo).toBeCloseTo(far.lo, 9);
    expect(near.hi).toBeCloseTo(far.hi, 9);
    // and it is the edges doubled: 2·1.2 − 1.68 and 2·1.9 − 1.68
    expect(near.lo).toBeCloseTo(0.72, 9);
    expect(near.hi).toBeCloseTo(2.12, 9);
  });

  it('what a sight line lands on is the matching point of the image, flipped back', () => {
    const eye: P2 = [-1.5, EYE];
    const P: P2 = [0, 1.0];
    const seen = seenThrough(eye, P, wallMirror(0), eye[0]);
    expect(seen[1]).toBeCloseTo(2 * 1.0 - EYE, 12);
  });
});

describe('a converging lens bends a fan of rays to one point', () => {
  const f = 10, R = 3.5, h = 1.5;

  it('the traced fan meets at dᵢ from 1/dₒ + 1/dᵢ = 1/f', () => {
    for (const dObj of [30, 20, 15, 12]) {
      const c = fanCrossing(fanFrom(dObj, h, f, R));
      expect(c.x).toBeCloseTo(imageDistance(dObj, f), 9);
      expect(1 / dObj + 1 / c.x).toBeCloseTo(1 / f, 12);
    }
    expect(imageDistance(30, 10)).toBeCloseTo(15, 12); // not at the focal point
  });

  it('the blur spot on a screen is smallest, and zero, exactly there', () => {
    const fan = fanFrom(20, h, f, R);
    let best = 0, min = Infinity;
    for (let x = 5; x <= 60; x += 0.01) { const w = spreadAt(fan, x); if (w < min) { min = w; best = x; } }
    expect(best).toBeCloseTo(20, 1);
    expect(spreadAt(fan, 20)).toBeLessThan(1e-12);
    // and it grows linearly either side: 2R·|x − dᵢ|/dᵢ
    expect(spreadAt(fan, 25)).toBeCloseTo((2 * R * 5) / 20, 12);
  });

  it('the image is upside down and scaled by m = −dᵢ/dₒ', () => {
    for (const dObj of [30, 20, 15]) {
      const di = imageDistance(dObj, f);
      const y = centreAt(fanFrom(dObj, h, f, R), di);
      expect(y / h).toBeCloseTo(magnification(dObj, di), 9);
    }
    expect(magnification(15, imageDistance(15, f))).toBeCloseTo(-2, 12);
  });

  it('the three principal rays cross at the same point as the whole fan', () => {
    const dObj = 15, di = imageDistance(dObj, f);
    const p = principalRays(dObj, h, f);
    for (const r of [p.parallel, p.centre, p.focal]) expect(heightAt(r, di)).toBeCloseTo((-h * di) / dObj, 9);
    expect(heightAt(p.parallel, f)).toBeCloseTo(0, 12); // through the far focal point
    expect(p.focal.k).toBeCloseTo(0, 12); // leaves level
  });

  it('covering half the lens leaves the whole image in place, made of half the light', () => {
    const dObj = 20, di = imageDistance(dObj, f);
    const full = fanFrom(dObj, h, f, R, 41);
    const half = fanFrom(dObj, h, f, R, 41, 'top');
    expect(half.length).toBeLessThan(full.length * 0.55);
    expect(fanCrossing(half).x).toBeCloseTo(di, 9);
    expect(centreAt(half, di)).toBeCloseTo(centreAt(full, di), 9);
    // the tip and the foot of the arrow both still image: nothing is cut off
    expect(centreAt(fanFrom(dObj, 0, f, R, 41, 'top'), di)).toBeCloseTo(0, 9);
  });
});

describe('inside the focal length no screen works: the image is virtual', () => {
  const f = 10, R = 3.5, h = 1;

  it('the rays leave spreading, so the blur only grows beyond the lens', () => {
    const fan = fanFrom(5, h, f, R);
    let prev = spreadAt(fan, 0.01);
    for (let x = 1; x <= 100; x += 1) { const w = spreadAt(fan, x); expect(w).toBeGreaterThan(prev); prev = w; }
    expect(isVirtual(5, f)).toBe(true);
    expect(isVirtual(15, f)).toBe(false);
  });

  it('their backward extensions meet on the object side: upright, twice the size at dₒ = f/2', () => {
    const c = fanCrossing(fanFrom(5, h, f, R));
    expect(c.x).toBeCloseTo(imageDistance(5, f), 9);
    expect(c.x).toBeCloseTo(-10, 9);
    expect(c.y / h).toBeCloseTo(2, 9);
    expect(magnification(5, c.x)).toBeCloseTo(2, 12);
  });

  it('at dₒ = f the rays leave parallel and there is no image at any distance', () => {
    const c = fanCrossing(fanFrom(10, h, f, R));
    expect(c.x).toBe(Infinity);
    expect(imageDistance(10, f)).toBe(Infinity);
  });
});
