import { describe, expect, it } from 'vitest';
import {
  AIRY_FIRST_ZERO, MERCURY, RAYLEIGH_FACTOR, STARS, airy, airyAt, apertureToSplit, besselJ1, centralWidthFar,
  dipBetween, discHuygensFar, doubletDip, edgePathDifference, firstDarkOnWall, firstRingAngle, gratingAngle,
  gratingIntensity, gratingSum, huygensFar, huygensFarIntensity, lineHalfWidth, phasorChain, sincSquared,
  slitDarkAngle, slitField, slitForDarkAt, slitsToSplit, twoPointProfile, wallIntensity,
} from '../diffraction.ts';

const abs2 = (z: { re: number; im: number }) => z.re * z.re + z.im * z.im;
const DEG = Math.PI / 180;

describe('a single slit is many Huygens sources interfering', () => {
  it('the numerically summed far field matches sinc² everywhere', () => {
    for (const a of [1.5, 2.5, 6]) {
      for (let t = 0; t <= 80; t += 0.5) {
        const th = t * DEG;
        expect(Math.abs(huygensFarIntensity(a, 1, th, 2000) - sincSquared(a, 1, th))).toBeLessThan(2e-4);
      }
    }
  });

  it('the sum at a finite distance, far enough out, has the same shape', () => {
    // 2D Kirchhoff sum on an arc 3000 wavelengths away, normalised to straight ahead.
    const a = 5, R = 3000;
    const I0 = abs2(slitField(a, 1, R, 0, 400));
    for (let t = 0; t <= 40; t += 1) {
      const th = t * DEG;
      const I = abs2(slitField(a, 1, R * Math.cos(th), R * Math.sin(th), 400)) / I0;
      // the obliquity factor (1 + cos θ)/2 is the only difference from sinc²
      const obl = ((1 + Math.cos(th)) / 2) ** 2;
      expect(Math.abs(I - sincSquared(a, 1, th) * obl)).toBeLessThan(3e-3);
    }
  });

  it('first dark where the far edge is one whole wavelength behind: a sin θ = λ', () => {
    for (const a of [1.2, 2.5, 4, 9]) {
      const th = slitDarkAngle(a, 1);
      expect(edgePathDifference(a, th)).toBeCloseTo(1, 12);
      // twelve sources pair off exactly; so does any number of them
      for (const n of [2, 12, 400]) expect(huygensFarIntensity(a, 1, th, n)).toBeLessThan(1e-20);
    }
  });

  it('half a wavelength edge to edge is not dark: still about 40% of the peak', () => {
    const a = 2.5, th = Math.asin(0.5 / a);
    expect(huygensFarIntensity(a, 1, th, 12)).toBeCloseTo(0.4076, 3);
    expect(sincSquared(a, 1, th)).toBeCloseTo(4 / Math.PI ** 2, 10);
  });

  it('the twelve phasors close into a loop at the first dark, and lie straight ahead at 0°', () => {
    const a = 2.5;
    const flat = phasorChain(a, 1, 0, 12);
    expect(flat[12][0]).toBeCloseTo(12, 12);
    expect(flat[12][1]).toBeCloseTo(0, 12);
    const loop = phasorChain(a, 1, slitDarkAngle(a, 1), 12);
    expect(Math.hypot(...loop[12])).toBeLessThan(1e-9);
    // the chain's resultant is the far-field sum, times n
    const th = 15 * DEG;
    expect(Math.hypot(...phasorChain(a, 1, th, 12)[12]) / 12).toBeCloseTo(Math.sqrt(huygensFarIntensity(a, 1, th, 12)), 12);
  });

  it('halving the slit doubles the central band (small angles)', () => {
    // a red laser through 0.1 mm and 0.05 mm onto a wall 3 m away
    const w1 = centralWidthFar(1e-4, 650e-9, 3), w2 = centralWidthFar(5e-5, 650e-9, 3);
    expect(w2 / w1).toBeCloseTo(2, 3);
    expect(w1 * 1000).toBeCloseTo(39.0, 1);
    // the summed wall pattern agrees, 2000 wavelengths out
    const d1 = firstDarkOnWall(20, 1, 2000, 400)!, d2 = firstDarkOnWall(10, 1, 2000, 400)!;
    expect(d2 / d1).toBeGreaterThan(1.99);
    expect(d2 / d1).toBeLessThan(2.02);
  });

  it('narrowing the slit widens the band monotonically, and at L = 46λ the summed wall agrees with a sin θ = λ to 1.5%', () => {
    let prev = Infinity;
    for (const a of [2, 2.5, 3, 4, 6, 8, 10]) {
      const y = firstDarkOnWall(a, 1, 46, 60)!;
      expect(y).toBeLessThan(prev);
      prev = y;
      const far = 46 * Math.tan(slitDarkAngle(a, 1));
      expect(Math.abs(y / far - 1)).toBeLessThan(0.015);
    }
  });

  it('on the scene’s wall the centre stays the brightest spot, and a narrower slit lets through less light', () => {
    let prevI0 = 0;
    for (const a of [1, 2, 3, 5, 7, 10]) {
      const I0 = wallIntensity(a, 1, 46, 0);
      for (let y = 0.5; y <= 22; y += 0.5) expect(wallIntensity(a, 1, 46, y)).toBeLessThan(I0);
      expect(I0).toBeGreaterThan(prevI0);
      prevI0 = I0;
    }
  });

  it('the scene’s target: a 2.5λ slit puts the first dark bands 20λ out on a wall 46λ away', () => {
    const a = slitForDarkAt(20, 1, 46, 1, 10, 40);
    expect(a).toBeGreaterThan(2.45);
    expect(a).toBeLessThan(2.55);
    expect(firstDarkOnWall(a, 1, 46, 40)!).toBeCloseTo(20, 3);
  });
});

describe('a round aperture and the Rayleigh criterion', () => {
  it('J₁ from its integral matches tabulated values', () => {
    expect(besselJ1(1)).toBeCloseTo(0.4400505857, 9);
    expect(besselJ1(5)).toBeCloseTo(-0.3275791376, 9);
  });

  it('the first dark ring is at the first zero of J₁: sin θ = 1.22 λ/D', () => {
    expect(AIRY_FIRST_ZERO).toBeCloseTo(3.8317060, 6);
    expect(RAYLEIGH_FACTOR).toBeCloseTo(1.2197, 4);
    expect(airy(AIRY_FIRST_ZERO)).toBeLessThan(1e-20);
    expect(airyAt(0.1, 500e-9, firstRingAngle(0.1, 500e-9))).toBeLessThan(1e-20);
  });

  it('summing sources over a disc gives the Airy pattern', () => {
    for (const f of [0.3, 0.6, 1, 1.22, 1.6, 2.2]) {
      const th = Math.asin(f * 1e-3);
      expect(Math.abs(discHuygensFar(1, 1e-3, th) - airyAt(1, 1e-3, th))).toBeLessThan(1.5e-3);
    }
  });

  it('two stars at exactly 1.22 λ/D are just split: the dip between them is about 26%', () => {
    const D = apertureToSplit(STARS.sep, STARS.lambda);
    expect(D * 100).toBeCloseTo(13.84, 2);
    const dip = dipBetween(D, STARS.lambda, STARS.sep);
    expect(dip).toBeGreaterThan(0.26);
    expect(dip).toBeLessThan(0.27);
  });

  it('a smaller mirror merges them into one blob; a bigger one deepens the gap', () => {
    const DR = apertureToSplit(STARS.sep, STARS.lambda);
    expect(dipBetween(0.75 * DR, STARS.lambda, STARS.sep)).toBe(0);
    expect(dipBetween(0.5 * DR, STARS.lambda, STARS.sep)).toBe(0);
    expect(dipBetween(1.5 * DR, STARS.lambda, STARS.sep)).toBeGreaterThan(0.8);
  });

  it('magnifying the image changes nothing: the profile depends only on angle over λ/D', () => {
    const D = 0.05, z = 2;
    for (let t = -3; t <= 3; t += 0.25) {
      const th = t * STARS.sep;
      // doubling every angle in the picture, and the separation with it, is the same picture stretched
      const stretched = twoPointProfile(D / z, STARS.lambda, STARS.sep * z, th * z);
      expect(Math.abs(stretched - twoPointProfile(D, STARS.lambda, STARS.sep, th))).toBeLessThan(1e-9);
    }
    expect(dipBetween(D, STARS.lambda, STARS.sep)).toBe(0);
  });
});

describe('a grating is many slits: the same lines, sharper', () => {
  const d = 1e-3 / 600, lam = 546e-9;

  it('bright lines where d sin θ = mλ, for every N', () => {
    for (const N of [2, 10, 300]) {
      for (const m of [0, 1, 2]) {
        const th = gratingAngle(d, lam, m);
        expect(abs2(gratingSum(N, d, lam, th))).toBeCloseTo(1, 9);
      }
    }
  });

  it('the summed pattern matches the closed form', () => {
    for (const N of [2, 7, 50]) {
      for (let t = -60; t <= 60; t += 0.37) {
        const th = t * DEG;
        expect(Math.abs(abs2(gratingSum(N, d, lam, th)) - gratingIntensity(N, d, lam, th))).toBeLessThan(1e-9);
      }
    }
  });

  it('more slits leave the lines where they are and make them narrower, as 1/N', () => {
    const th1 = gratingAngle(d, lam, 1);
    for (const N of [2, 20, 200]) {
      // the brightest point near first order is at d sin θ = λ regardless of N
      let best = 0, at = 0;
      for (let i = -2000; i <= 2000; i++) {
        const th = th1 + i * 1e-6;
        const v = gratingIntensity(N, d, lam, th);
        if (v > best) { best = v; at = th; }
      }
      expect(Math.abs(at - th1)).toBeLessThan(2e-6);
    }
    const w20 = lineHalfWidth(20, d, lam, 1), w40 = lineHalfWidth(40, d, lam, 1);
    expect(w20 / w40).toBeCloseTo(2, 2);
    // and the first dark next to the line is really dark
    expect(gratingIntensity(20, d, lam, th1 + w20)).toBeLessThan(1e-12);
  });

  it('the mercury doublet splits by Rayleigh once N ≥ λ/Δλ, about 273 slits', () => {
    const { l1, l2 } = MERCURY;
    const NR = slitsToSplit(l1, l2, 1);
    expect(NR).toBeCloseTo(273.4, 1);
    // at N_R the 579 nm peak sits on the 577 nm line's first dark
    const t2 = gratingAngle(MERCURY.d, l2, 1), t1 = gratingAngle(MERCURY.d, l1, 1);
    expect(Math.abs(t1 + lineHalfWidth(NR, MERCURY.d, l1, 1) - t2) / (t2 - t1)).toBeLessThan(0.01);
    // slits come in whole numbers: 274 is the first that passes
    const dip = doubletDip(Math.ceil(NR), MERCURY.d, l1, l2, 1);
    expect(doubletDip(Math.floor(NR) - 10, MERCURY.d, l1, l2, 1)).toBeLessThan(0.13);
    expect(dip).toBeGreaterThan(0.17);
    expect(dip).toBeLessThan(0.21);
    expect(doubletDip(150, MERCURY.d, l1, l2, 1)).toBe(0);
    expect(doubletDip(200, MERCURY.d, l1, l2, 1)).toBe(0);
    expect(doubletDip(400, MERCURY.d, l1, l2, 1)).toBeGreaterThan(0.6);
    // in second order half as many slits do it
    expect(slitsToSplit(l1, l2, 2)).toBeCloseTo(NR / 2, 9);
  });
});

describe('the numbers the chapter 36 lessons quote', () => {
  it('a 2.5λ slit: first dark at 23.6°, which is 20 λ up a wall 46 λ away', () => {
    const th = slitDarkAngle(2.5, 1);
    expect(th / DEG).toBeCloseTo(23.58, 2);
    expect(46 * Math.tan(th)).toBeCloseTo(20.08, 2);
  });

  it('a 5 cm mirror’s first dark ring is 2.77″ out; 13.8 cm pulls it to 1″', () => {
    const arcsec = Math.PI / 180 / 3600;
    expect(firstRingAngle(0.05, 550e-9) / arcsec).toBeCloseTo(2.77, 2);
    expect(firstRingAngle(apertureToSplit(arcsec, 550e-9), 550e-9) / arcsec).toBeCloseTo(1, 9);
  });

  it('a 3 mm pupil splits headlights 1.5 m apart out to about 6.7 km', () => {
    const theta = firstRingAngle(3e-3, 550e-9);
    expect(1.5 / Math.tan(theta) / 1000).toBeCloseTo(6.7, 1);
  });

  it('the sodium pair needs about 980 slits in first order, half that in second', () => {
    expect(slitsToSplit(589.0e-9, 589.6e-9, 1)).toBeCloseTo(981.7, 1);
    expect(slitsToSplit(589.0e-9, 589.6e-9, 2)).toBeCloseTo(490.8, 1);
  });
});
