import { describe, expect, it } from 'vitest';
import {
  CORK_DIPPERS, CORK_START, FILM, LASER, SLITS, SPREAD, TANK,
  bobAmplitude, brightSpots, filmColour, filmReflectance, filmReflections, firstSpot, intensity,
  meanWallIntensity, measuredSpacing, pathDifference, peakWhiteReflectance, quietLineCount,
  relativeBrightness, stepsOutOfStep, twoBeamReflectance, wallIntensity, waveHeight,
  wavelengthFromFringes, youngSpacing, type P2, type Source,
} from '../interference.ts';

const A: Source = { x: 0, y: 2.5 }, B: Source = { x: 0, y: -2.5 };
const lambda = 2;

/** Walk out along a ray from the origin until the path difference is `target`. */
function pointWithDelta(target: number, angle: number): P2 {
  let lo = 0.01, hi = 200;
  const at = (r: number): P2 => [r * Math.cos(angle), r * Math.sin(angle)];
  const f = (r: number) => pathDifference(A, B, at(r)) - target;
  if (f(lo) * f(hi) > 0) throw new Error('no crossing on this ray');
  for (let i = 0; i < 200; i++) { const m = (lo + hi) / 2; if (f(lo) * f(m) <= 0) hi = m; else lo = m; }
  return at((lo + hi) / 2);
}

describe('two sources: quiet where the path difference is a half-integer of wavelengths', () => {
  it('the water is still wherever Δ = (m + ½)λ', () => {
    for (const m of [0, 1]) {
      for (const sign of [1, -1]) {
        const p = pointWithDelta(sign * (m + 0.5) * lambda, sign * (0.2 + 0.2 * m));
        expect(Math.abs(pathDifference(A, B, p)) / lambda).toBeCloseTo(m + 0.5, 9);
        expect(intensity([A, B], p, lambda)).toBeLessThan(1e-12);
        // and it stays still at every instant, not just on average
        for (let t = 0; t < 1; t += 0.05) expect(Math.abs(waveHeight([A, B], p, t, lambda, 1))).toBeLessThan(1e-6);
      }
    }
  });

  it('a whole wavelength of path difference is loud, not dark: four times one source', () => {
    for (const m of [0, 1, 2]) {
      const p = pointWithDelta(m * lambda, 0.1 + 0.25 * m);
      expect(intensity([A, B], p, lambda)).toBeCloseTo(4, 9);
      expect(intensity([A], p, lambda)).toBeCloseTo(1, 12);
    }
  });

  it('the number of quiet lines grows as the sources spread apart', () => {
    expect(quietLineCount(0.9, 2)).toBe(0);      // closer than λ/2: no quiet line at all
    expect(quietLineCount(3, 2)).toBe(2);
    expect(quietLineCount(5, 2)).toBe(4);        // the cork scene's 5 cm
    expect(quietLineCount(9, 2)).toBe(8);
  });

  it('stepsOutOfStep measures the distance from the nearest half', () => {
    expect(stepsOutOfStep(1, 2).offHalf).toBeCloseTo(0, 12);
    expect(stepsOutOfStep(2, 2).offHalf).toBeCloseTo(0.5, 12);
    expect(stepsOutOfStep(-1, 2).offHalf).toBeCloseTo(0, 12);
  });

  it('two sources that drift out of step leave no spot quiet on average', () => {
    // Averaged over every relative phase, each spot gets 1 + 1: the sum of the two alone.
    const p = pointWithDelta(0.5 * lambda, 0.3);
    let s = 0;
    const N = 720;
    for (let i = 0; i < N; i++) s += intensity([A, { ...B, phase: (2 * Math.PI * i) / N }], p, lambda);
    expect(s / N).toBeCloseTo(2, 9);
  });
});

describe('the lesson 1 scenes are set up as the prose says', () => {
  it('the cork starts on the loud centre line', () => {
    expect(bobAmplitude(CORK_DIPPERS, CORK_START, TANK.lambda)).toBeCloseTo(2, 9);
  });

  it('the leaf starts loud, and spreading B apart puts it on a quiet line once, near 5.25 cm', () => {
    const amp = (b: number) => bobAmplitude([SPREAD.a, { x: 0, y: b }], SPREAD.leaf, TANK.lambda);
    expect(amp(SPREAD.bStart)).toBeGreaterThan(1.95);
    const quiet: number[] = [];
    for (let b = SPREAD.bRange[0]; b <= SPREAD.bRange[1]; b += 0.001) if (amp(b) < 0.2) quiet.push(b);
    expect(quiet.length).toBeGreaterThan(0);
    expect(Math.min(...quiet)).toBeGreaterThan(4.5);
    expect(Math.max(...quiet)).toBeLessThan(6);
    const mid = (Math.min(...quiet) + Math.max(...quiet)) / 2;
    const d = pathDifference(SPREAD.a, { x: 0, y: mid }, SPREAD.leaf);
    expect(Math.abs(d) / TANK.lambda).toBeCloseTo(0.5, 1);
  });
});

describe('Young: the spacing λL/d comes out of the intensity', () => {
  it('numerically located loud spots are λL/d apart when the wall is far away', () => {
    const lam = 600e-9, d = 0.3e-3, L = 2;
    const s = measuredSpacing(d, lam, L, 0.02);
    expect(s / youngSpacing(lam, L, d)).toBeCloseTo(1, 3);
  });

  it('spacing doubles with the wall distance and halves with the slit spacing', () => {
    const lam = 500e-9;
    const s1 = measuredSpacing(0.2e-3, lam, 1, 0.01);
    expect(measuredSpacing(0.2e-3, lam, 2, 0.02) / s1).toBeCloseTo(2, 3);
    expect(measuredSpacing(0.4e-3, lam, 1, 0.01) / s1).toBeCloseTo(0.5, 3);
  });

  it('in the tank, close to the gaps, the small-angle formula is a few per cent short', () => {
    const L = 23;
    const y1 = firstSpot(SLITS.d, SLITS.lambda, L);
    expect(y1 / youngSpacing(SLITS.lambda, L, SLITS.d)).toBeGreaterThan(1.02);
    expect(y1 / youngSpacing(SLITS.lambda, L, SLITS.d)).toBeLessThan(1.05);
  });

  it('the slit scene has an answer inside the drag range, and starts wrong', () => {
    const [lo, hi] = SLITS.lRange;
    const f = (L: number) => firstSpot(SLITS.d, SLITS.lambda, L) - SLITS.mark;
    expect(f(lo)).toBeLessThan(0);
    expect(f(hi)).toBeGreaterThan(0);
    expect(Math.abs(f(SLITS.lStart))).toBeGreaterThan(1.5);
  });

  it('covering one gap makes a dark fringe brighter', () => {
    const { d, lambda: lam } = SLITS, L = 20;
    const spots = brightSpots(d, lam, L, 12);
    const dark = (spots[spots.length / 2 - 1] + spots[spots.length / 2]) / 2; // between two loud spots
    const both = wallIntensity(dark, d, lam, L);
    const one = wallIntensity(dark, d, lam, L, true);
    expect(both).toBeLessThan(0.01);
    expect(one).toBeCloseTo(1, 9);
  });

  it('interference moves light but destroys none: the wall averages to the sum of the two gaps', () => {
    const lam = 600e-9, d = 0.3e-3, L = 2;
    const mean = meanWallIntensity(d, lam, L, -0.02, 0.02);
    expect(mean).toBeCloseTo(2, 2);
    // the loud spots are four times one gap alone
    expect(wallIntensity(0, d, lam, L)).toBeCloseTo(4, 9);
  });

  it('the laser in the lesson: 632.8 nm, 0.25 mm, 3.0 m gives fringes 7.6 mm apart', () => {
    const s = measuredSpacing(LASER.d, LASER.lambda, LASER.L, 0.03);
    expect(s * 1000).toBeCloseTo(7.6, 1);
    expect(wavelengthFromFringes(0.0076, LASER.d, LASER.L) * 1e9).toBeCloseTo(633, 0);
  });
});

describe('thin films: the half-wave flip makes the thinnest film dark', () => {
  it('the soap surface flips the front reflection and not the back one', () => {
    const { front, back } = filmReflections(0, 550);
    expect(front.phase).toBeCloseTo(Math.PI, 12);
    expect(back.phase).toBeCloseTo(0, 12);
    expect(back.amp / front.amp).toBeGreaterThan(0.95);
  });

  it('a very thin film goes dark in reflection, at every colour', () => {
    for (const lam of [400, 500, 600, 700]) {
      expect(filmReflectance(4, lam)).toBeLessThan(0.002 * filmReflectance(lam / (4 * 1.33), lam) + 1e-3);
      expect(filmReflectance(0, lam)).toBeCloseTo(0, 12);
    }
    expect(relativeBrightness(FILM.tMin)).toBeLessThan(FILM.dark / 3);
    expect(filmColour(FILM.tMin).every((c) => c < 25)).toBe(true);
  });

  it('without the flip the thinnest film would be brightest instead', () => {
    const lam = 550;
    expect(twoBeamReflectance(1, lam, 1.33, false)).toBeGreaterThan(0.07);
    expect(twoBeamReflectance(1, lam, 1.33, true)).toBeLessThan(1e-4);
  });

  it('a quarter-wave film is brightest for its colour; a half-wave film is dark for it', () => {
    const lam = 550, n = 1.33;
    const q = filmReflectance(lam / (4 * n), lam), h = filmReflectance(lam / (2 * n), lam);
    for (let t = 0; t <= 300; t += 1) expect(filmReflectance(t, lam)).toBeLessThanOrEqual(q + 1e-12);
    expect(h).toBeLessThan(1e-12);
  });

  it('the purple band near 200 nm is darkish but still well above the black film', () => {
    let min = 1;
    for (let t = 150; t <= 250; t++) min = Math.min(min, relativeBrightness(t));
    expect(min).toBeGreaterThan(FILM.dark * 1.5);
    expect(relativeBrightness(FILM.tStart)).toBeGreaterThan(0.2);
  });

  it('the brightest band of a soap film reflects about 7-8 % of white light', () => {
    const { peak } = peakWhiteReflectance();
    expect(peak).toBeGreaterThan(0.06);
    expect(peak).toBeLessThan(0.09);
  });
});
