import { describe, expect, it } from 'vitest';
import {
  A0, BASEBALL, HALF_RING, MU_H, MU_HE, NICKEL, TUBE,
  allowedRadius, balmerLinesNm, bandOf, baseballWavelength, braggAngle, echoPeakAngle, electronWavelength,
  extraPath, lapSurvival, lapWave, levelEV, orbitEnergy, photonEV, relativisticError, ringRadius,
  rowIntensity, spectralRgb, transitionWavelength, voltageForRing, wavesPerOrbit,
} from '../matterwaves.ts';

const DEG = Math.PI / 180;

describe('de Broglie: λ = h/p', () => {
  it('an electron through 54 V has λ ≈ 0.167 nm', () => {
    expect(electronWavelength(54) * 1e9).toBeCloseTo(0.1669, 3);
    expect(electronWavelength(54, true) * 1e9).toBeCloseTo(0.1669, 3);
  });

  it('λ falls as 1/√V: four times the voltage halves it', () => {
    for (const V of [54, 1200, 3000]) expect(electronWavelength(4 * V) / electronWavelength(V)).toBeCloseTo(0.5, 12);
  });

  it('relativity is negligible in the tube and matters in an electron microscope', () => {
    expect(relativisticError(54)).toBeLessThan(1e-4);
    expect(relativisticError(5000)).toBeLessThan(0.003);
    expect(relativisticError(100e3)).toBeGreaterThan(0.04);
    expect(relativisticError(100e3)).toBeLessThan(0.06);
    expect(electronWavelength(100e3, true) * 1e12).toBeCloseTo(3.70, 2);
  });

  it('a thrown baseball has λ of order 10⁻³⁴ m, 10¹⁹ times smaller than a proton', () => {
    const l = baseballWavelength();
    expect(Math.round(Math.log10(l))).toBe(-34);
    expect(l).toBeCloseTo(6.62607015e-34 / (BASEBALL.m * BASEBALL.v), 45);
    expect(1e-15 / l).toBeGreaterThan(1e18);
  });
});

describe('the graphite tube: rings shrink as the voltage rises', () => {
  it('the inner ring comes from the wider planes and sits inside the outer one', () => {
    for (const V of [1000, 3000, 5000]) expect(ringRadius(V, TUBE.d[0])).toBeLessThan(ringRadius(V, TUBE.d[1]));
  });

  it('ring radius ∝ 1/√V across the tube range, to within 1.5 %', () => {
    const k = ringRadius(2500, TUBE.d[0]) * Math.sqrt(2500);
    for (const V of [1000, 1500, 2000, 3000, 4000, 5000]) {
      expect(Math.abs(ringRadius(V, TUBE.d[0]) * Math.sqrt(V) / k - 1)).toBeLessThan(0.015);
    }
  });

  it('rings are centimetre-sized on the screen, as in a real tube', () => {
    expect(ringRadius(4000, TUBE.d[0]) * 1e3).toBeGreaterThan(10);
    expect(ringRadius(4000, TUBE.d[0]) * 1e3).toBeLessThan(14);
    expect(ringRadius(TUBE.vMin, TUBE.d[1]) * 1e3).toBeLessThan(TUBE.screenMm);
  });

  it('halving the inner ring from 1.2 kV takes about four times the voltage, not twice', () => {
    const V = voltageForRing(HALF_RING.target(), TUBE.d[0]);
    expect(V / HALF_RING.startV).toBeGreaterThan(3.8);
    expect(V / HALF_RING.startV).toBeLessThan(4.1);
    expect(ringRadius(2 * HALF_RING.startV, TUBE.d[0]) - HALF_RING.target()).toBeGreaterThan(HALF_RING.toleranceMm * 1e-3 * 5);
  });

  it('Bragg: 2d sinθ = λ, with no beam once λ > 2d', () => {
    const d = 0.2e-9;
    expect(2 * d * Math.sin(braggAngle(d, 0.1e-9))).toBeCloseTo(0.1e-9, 20);
    expect(braggAngle(d, 0.5e-9)).toBeNaN();
  });
});

describe('Davisson–Germer: 54 V electrons off nickel', () => {
  const lambda = electronWavelength(NICKEL.V);

  it('predicts the peak within 1.5° of the measured 50°', () => {
    const phi = echoPeakAngle(lambda) / DEG;
    expect(Math.abs(phi - NICKEL.measuredPeakDeg)).toBeLessThan(1.5);
  });

  it('at the peak each row’s echo is exactly one wavelength behind its neighbour', () => {
    expect(extraPath(echoPeakAngle(lambda)) / lambda).toBeCloseTo(1, 12);
  });

  it('the summed rows are loudest at the peak and nearly silent 15° away', () => {
    const p = echoPeakAngle(lambda);
    expect(rowIntensity(p, lambda)).toBeCloseTo(1, 10);
    let best = 0, bestAt = 0;
    for (let d = 10; d <= 89; d += 0.05) {
      const I = rowIntensity(d * DEG, lambda);
      if (I > best) { best = I; bestAt = d; }
    }
    expect(Math.abs(bestAt - p / DEG)).toBeLessThan(0.1);
    expect(rowIntensity(p - 15 * DEG, lambda)).toBeLessThan(0.05);
    expect(rowIntensity(30 * DEG, lambda)).toBeLessThan(0.05);
  });
});

describe('Bohr: only whole numbers of wavelengths close on themselves', () => {
  it('2πr/λ = √(r/a), and is a whole number n exactly at r = n²a', () => {
    for (const n of [1, 2, 3, 4]) expect(wavesPerOrbit(allowedRadius(n))).toBeCloseTo(n, 10);
    for (const r of [0.03e-9, 0.1e-9, 0.3e-9]) expect(wavesPerOrbit(r)).toBeCloseTo(Math.sqrt(r / allowedRadius(1)), 10);
  });

  it('the first orbit is the Bohr radius, 0.0529 nm (0.0529 nm × mₑ/μ with the proton recoiling)', () => {
    expect(A0 * 1e9).toBeCloseTo(0.05292, 5);
    expect(allowedRadius(1) * 1e9).toBeCloseTo(0.05295, 4);
  });

  it('allowed orbits spread out: the second is four times the first, not twice', () => {
    expect(allowedRadius(2) / allowedRadius(1)).toBeCloseTo(4, 12);
    expect(allowedRadius(3) / allowedRadius(1)).toBeCloseTo(9, 12);
  });

  it('the wave survives many laps only at whole numbers', () => {
    const K = 12;
    for (const n of [1, 2, 3]) expect(lapSurvival(wavesPerOrbit(allowedRadius(n)), K)).toBeCloseTo(1, 8);
    expect(lapSurvival(wavesPerOrbit(2 * allowedRadius(1)), K)).toBeLessThan(0.1); // 2a: √2 waves
    for (let nu = 1.1; nu < 1.9; nu += 0.05) expect(lapSurvival(nu, K)).toBeLessThan(0.3);
  });

  it('at a whole number the summed wave joins itself smoothly; otherwise it jumps at the seam', () => {
    const K = 12;
    const seam = (nu: number) => Math.abs(lapWave(nu, 2 * Math.PI - 1e-9, K) - lapWave(nu, 0, K));
    expect(seam(3)).toBeLessThan(1e-6);
    // one trip round: at 2.3 waves the end misses the start by most of a crest
    expect(Math.abs(lapWave(2.3, 2 * Math.PI - 1e-9, 1) - lapWave(2.3, 0, 1))).toBeGreaterThan(1);
    // many trips: the mismatch is still there, on a wave that has mostly cancelled
    expect(seam(2.3)).toBeGreaterThan(0.01);
    expect(lapSurvival(2.3, K)).toBeLessThan(0.15);
  });

  it('allowed energies are −13.6 eV/n², and match the orbit energy −ke²/2r', () => {
    expect(levelEV(1, 1, 9.1093837015e-31)).toBeCloseTo(-13.6057, 3);
    expect(levelEV(1)).toBeCloseTo(-13.598, 2);
    for (const n of [1, 2, 3]) expect(orbitEnergy(allowedRadius(n)) / 1.602176634e-19).toBeCloseTo(levelEV(n), 8);
  });
});

describe('spectra: a jump gives one photon of wavelength hc/ΔE', () => {
  it('hydrogen 3 → 2 is the red line at 656 nm (within 1 nm, reduced mass)', () => {
    const nm = transitionWavelength(3, 2) * 1e9;
    expect(Math.abs(nm - 656.3)).toBeLessThan(1);
    expect(photonEV(3, 2)).toBeCloseTo(1.89, 2);
  });

  it('the Balmer lines are the visible ones: 656, 486, 434, 410 nm', () => {
    const [a, b, c, d] = balmerLinesNm();
    expect(a).toBeCloseTo(656.5, 0); expect(b).toBeCloseTo(486.3, 0); expect(c).toBeCloseTo(434.2, 0); expect(d).toBeCloseTo(410.3, 0);
    for (const l of balmerLinesNm()) expect(bandOf(l)).toBe('visible');
  });

  it('2 → 1 is ultraviolet and 4 → 3 infrared', () => {
    expect(transitionWavelength(2, 1) * 1e9).toBeCloseTo(121.6, 0);
    expect(bandOf(transitionWavelength(2, 1) * 1e9)).toBe('ultraviolet');
    expect(bandOf(transitionWavelength(4, 3) * 1e9)).toBe('infrared');
  });

  it('He⁺: 6 → 4 gives the same red line, within 0.5 nm; 3 → 2 is ultraviolet', () => {
    const he64 = transitionWavelength(6, 4, 2, MU_HE) * 1e9;
    expect(Math.abs(he64 - transitionWavelength(3, 2, 1, MU_H) * 1e9)).toBeLessThan(0.5);
    expect(bandOf(transitionWavelength(3, 2, 2, MU_HE) * 1e9)).toBe('ultraviolet');
    // every He⁺ level is four times deeper
    expect(levelEV(2, 2, MU_HE) / levelEV(1, 1, MU_HE)).toBeCloseTo(1, 12);
  });

  it('visible wavelengths get a colour; the rest do not', () => {
    expect(spectralRgb(656)![0]).toBeGreaterThan(200);
    expect(spectralRgb(656)![2]).toBe(0);
    expect(spectralRgb(122)).toBeNull();
    expect(spectralRgb(1875)).toBeNull();
  });
});
