import { describe, expect, it } from 'vitest';
import {
  HCL, ISOTOPES as I, absorbed, absorptionTHz, atomOffsets, atomsForWidthRatio, atomsPerFreeElectron,
  bestFilling, bondStiffness, chainLevels, chainLevelsExact, copperConductanceRatio, copperResistivity,
  crystalBands, curvatureAt, DIAMOND_GAP, electronsIn, harmonicTHz, intrinsicDensity, isotopeRatio,
  kelvinsPerDecade, morseU, reducedMass, ringShells, seaCurrent, siliconConductanceRatio, spread,
  thzToMicron, volumePerFreeElectron, wellBottom, widthOverPairSplit,
} from '../solids.ts';

const C_CM = 299792458 * 100;
const cm = (thz: number) => (thz * 1e12) / C_CM;

describe('a bond is a spring', () => {
  it('the bottom of the Morse well is at r_e, and its curvature is 2 D_e a²', () => {
    const U = (r: number) => morseU(HCL, r);
    expect(wellBottom(U, 0.6, 3)).toBeCloseTo(HCL.re, 6);
    expect(curvatureAt(U, HCL.re)).toBeCloseTo(2 * HCL.De * HCL.a ** 2, 3);
  });
  it('HCl is a 517 N/m spring', () => {
    expect(bondStiffness(HCL)).toBeGreaterThan(510);
    expect(bondStiffness(HCL)).toBeLessThan(522);
  });
  it('the spring alone predicts H³⁵Cl at about 2991 cm⁻¹ (measured ω_e 2990.9)', () => {
    expect(cm(harmonicTHz(HCL, I.H, I.Cl35))).toBeCloseTo(2991, -1);
  });
  it('the absorbed lines land within 1% of the measured 2886 and 2091 cm⁻¹', () => {
    expect(Math.abs(cm(absorptionTHz(HCL, I.H, I.Cl35)) / 2886 - 1)).toBeLessThan(0.01);
    expect(Math.abs(cm(absorptionTHz(HCL, I.D, I.Cl35)) / 2091 - 1)).toBeLessThan(0.01);
  });
  it('the lines sit in the infrared, near 3.5 µm and 4.8 µm', () => {
    expect(thzToMicron(absorptionTHz(HCL, I.H, I.Cl35))).toBeCloseTo(3.48, 1);
    expect(thzToMicron(absorptionTHz(HCL, I.D, I.Cl35))).toBeCloseTo(4.80, 1);
  });
  it('the absorbed line sits about 4% below the harmonic one: the well softens as it widens', () => {
    expect(absorptionTHz(HCL, I.H, I.Cl35)).toBeLessThan(harmonicTHz(HCL, I.H, I.Cl35));
    expect(harmonicTHz(HCL, I.H, I.Cl35) / absorptionTHz(HCL, I.H, I.Cl35)).toBeCloseTo(1.04, 2);
  });
  it('the fit is judgeable: a parabola centred between the walls 0.5 eV up is within 15% of the curvature, one hugging a single wall is not', () => {
    const k = 2 * HCL.De * HCL.a ** 2;
    const h = 0.5;
    const outer = -Math.log(1 - Math.sqrt(h / HCL.De)) / HCL.a;
    const inner = Math.log(1 + Math.sqrt(h / HCL.De)) / HCL.a;
    const kOf = (x: number) => (2 * h) / (x * x);
    expect(Math.abs(kOf((outer + inner) / 2) / k - 1)).toBeLessThan(0.15);
    expect(Math.abs(kOf(outer) / k - 1)).toBeGreaterThan(0.25);
    expect(Math.abs(kOf(inner) / k - 1)).toBeGreaterThan(0.25);
  });
  it('far from the bottom the well flattens toward D_e while the parabola keeps climbing', () => {
    const k = 2 * HCL.De * HCL.a ** 2;
    const s = 1.2;
    expect(morseU(HCL, HCL.re + s)).toBeLessThan(0);
    expect(0.5 * k * s * s - HCL.De).toBeGreaterThan(5);
  });
});

describe('the reduced mass', () => {
  it('HCl → DCl: the frequency falls to √(μ_H/μ_D) ≈ 0.717, not 1/2 and not 1/√2', () => {
    const r = harmonicTHz(HCL, I.D, I.Cl35) / harmonicTHz(HCL, I.H, I.Cl35);
    expect(r).toBeCloseTo(Math.sqrt(reducedMass(I.H, I.Cl35) / reducedMass(I.D, I.Cl35)), 10);
    expect(r).toBeCloseTo(0.717, 3);
    expect(Math.abs(r - 0.5)).toBeGreaterThan(0.2);
    expect(r).toBeGreaterThan(1 / Math.SQRT2);
  });
  it('with the anharmonic correction the measured ratio is still about 0.72', () => {
    const r = absorptionTHz(HCL, I.D, I.Cl35) / absorptionTHz(HCL, I.H, I.Cl35);
    expect(r).toBeGreaterThan(0.715);
    expect(r).toBeLessThan(0.73);
  });
  it('the light atom does the moving: in HCl the H moves 35 times as far as the Cl', () => {
    const [xh, xcl] = atomOffsets(I.H, I.Cl35, 0.1);
    expect(Math.abs(xh / xcl)).toBeCloseTo(I.Cl35 / I.H, 6);
    expect(xcl - xh).toBeCloseTo(0.1, 12);
  });
  it('swapping the light atom shifts the line a lot; swapping the heavy one barely moves it', () => {
    // f ∝ 1/√μ, so a shift factor above 1 means the original was faster.
    expect(isotopeRatio([I.D, I.D], [I.H, I.H])).toBeCloseTo(Math.SQRT2, 2); // H₂ → D₂
    expect(isotopeRatio([I.H, I.D], [I.H, I.H])).toBeGreaterThan(1.15);      // H₂ → HD
    expect(isotopeRatio([I.D, I.I127], [I.H, I.I127])).toBeGreaterThan(1.4); // HI → DI
    expect(isotopeRatio([I.H, I.Cl37], [I.H, I.Cl35])).toBeLessThan(1.001);   // H³⁵Cl → H³⁷Cl
    expect(isotopeRatio([I.C13, I.O16], [I.C12, I.O16])).toBeLessThan(1.03);  // ¹²CO → ¹³CO
  });
  it('scaling the H–Cl line by 1/√2 or by the harmonic ratio lands within 2 THz of D–Cl; by 1/2 or by 1 does not', () => {
    const fh = absorptionTHz(HCL, I.H, I.Cl35), fd = absorptionTHz(HCL, I.D, I.Cl35);
    expect(Math.abs(fh / Math.SQRT2 - fd)).toBeLessThan(2);
    expect(Math.abs(fh * isotopeRatio([I.H, I.Cl35], [I.D, I.Cl35]) - fd)).toBeLessThan(2);
    expect(Math.abs(fh / 2 - fd)).toBeGreaterThan(10);
    expect(Math.abs(fh - fd)).toBeGreaterThan(10);
  });
  it('the gas absorbs fully on its line and hardly at all 15% away', () => {
    const f0 = absorptionTHz(HCL, I.D, I.Cl35);
    expect(absorbed(f0, f0)).toBe(1);
    expect(absorbed(f0 * 1.15, f0)).toBeLessThan(0.05);
  });
});

describe('bands from atoms', () => {
  it('N atoms make exactly N levels, and the computed eigenvalues match the closed form', () => {
    for (const N of [1, 2, 3, 7, 12, 40]) {
      const L = chainLevels(N, -3, 0.7);
      expect(L).toHaveLength(N);
      const X = chainLevelsExact(N, -3, 0.7);
      L.forEach((e, j) => expect(e).toBeCloseTo(X[j], 9));
    }
  });
  it('a pair splits by 2t, one level down and one up', () => {
    const [a, b] = chainLevels(2, -5, 0.6);
    expect(a).toBeCloseTo(-5.6, 10);
    expect(b).toBeCloseTo(-4.4, 10);
  });
  it('the band width approaches 4t as N grows, and never exceeds it', () => {
    const t = 0.8;
    for (const N of [3, 10, 50, 200]) expect(spread(chainLevels(N, 0, t))).toBeLessThan(4 * t);
    expect(spread(chainLevels(400, 0, t))).toBeCloseTo(4 * t, 3);
  });
  it('so a band is never twice the pair split; it takes 9 atoms to reach 1.9 times', () => {
    expect(widthOverPairSplit(4)).toBeCloseTo(1.618, 3);
    expect(widthOverPairSplit(8)).toBeLessThan(1.9);
    expect(widthOverPairSplit(9)).toBeGreaterThanOrEqual(1.9);
    expect(atomsForWidthRatio(1.9)).toBe(9);
    expect(widthOverPairSplit(1000)).toBeLessThan(2);
  });
  it('the ratio does not depend on the spacing', () => {
    const at = (d: number) => {
      const [lo] = crystalBands(9, d);
      const [pair] = crystalBands(2, d);
      return spread(lo) / spread(pair);
    };
    expect(at(0.24)).toBeCloseTo(at(0.3), 9);
  });
  it('far apart, the levels are the atoms’ own; closer in, they fan into bands with a gap', () => {
    const far = crystalBands(12, 0.6);
    expect(spread(far[0])).toBeLessThan(0.01);
    const near = crystalBands(12, 0.25);
    const gap = Math.min(...near[1]) - Math.max(...near[0]);
    expect(spread(near[0])).toBeGreaterThan(1.5);
    expect(gap).toBeGreaterThan(0.5);
    expect(gap).toBeLessThan(2);
  });
});

describe('a full band carries nothing', () => {
  const N = 13;
  it('a ring of 13 has 7 shells holding 26 electrons, two per atom', () => {
    expect(ringShells(N)).toHaveLength(7);
    expect(electronsIn(N, 7)).toBe(2 * N);
  });
  it('unpushed, every filling carries zero current: the electrons move both ways', () => {
    for (let f = 1; f <= 7; f++) expect(seaCurrent(N, f, 0)).toBeCloseTo(0, 10);
  });
  it('pushed, a full band still carries exactly zero', () => {
    expect(seaCurrent(N, 7, 1)).toBeCloseTo(0, 10);
    expect(seaCurrent(N, 7, 3)).toBeCloseTo(0, 10);
  });
  it('the most current flows near half full, about one electron per atom', () => {
    const f = bestFilling(N);
    expect(electronsIn(N, f) / N).toBeGreaterThan(0.8);
    expect(electronsIn(N, f) / N).toBeLessThan(1.2);
    expect(seaCurrent(N, f, 1)).toBeGreaterThan(seaCurrent(N, 7 - 1, 1));
    expect(seaCurrent(N, f, 1)).toBeGreaterThan(seaCurrent(N, 2, 1));
  });
});

describe('warming a semiconductor and a metal', () => {
  it('pure silicon has about 10¹⁰ free electrons per cm³ at room temperature', () => {
    const n = intrinsicDensity(300);
    expect(n).toBeGreaterThan(5e9);
    expect(n).toBeLessThan(2e10);
  });
  it('that is one free electron per several trillion atoms', () => {
    const a = atomsPerFreeElectron(293.15);
    expect(a).toBeGreaterThan(3e12);
    expect(a).toBeLessThan(3e13);
  });
  it('near room temperature the density rises tenfold for every 30 to 45 K', () => {
    for (const T of [300, 330, 350]) {
      const dT = kelvinsPerDecade(T);
      expect(dT).toBeGreaterThan(25);
      expect(dT).toBeLessThan(46);
    }
  });
  it('the factor is exp(E_g/2kT)-shaped: ln n against 1/T is a straight line of slope −E_g/2k', () => {
    const f = (T: number) => Math.log(intrinsicDensity(T) / T ** 1.5);
    const slope = (f(400) - f(300)) / (1 / 400 - 1 / 300);
    expect(slope).toBeCloseTo(-1.12 / (2 * 8.617333262e-5), 3);
  });
  it('from 20 °C to 100 °C, silicon conducts about a hundred times better and copper about 21% worse', () => {
    const si = siliconConductanceRatio(373.15);
    expect(si).toBeGreaterThan(80);
    expect(si).toBeLessThan(160);
    expect(copperConductanceRatio(373.15)).toBeCloseTo(0.786, 3);
    expect(Math.round(si)).toBe(116);
  });
  it('copper’s resistance rises linearly with T in the simple phonon model', () => {
    const r = [250, 300, 350, 400].map(copperResistivity);
    expect(r[1] - r[0]).toBeCloseTo(r[2] - r[1], 20);
    expect(r[2] - r[1]).toBeCloseTo(r[3] - r[2], 20);
    expect(r[3]).toBeGreaterThan(r[0]);
  });
  it('a diamond larger than the Earth holds about one heat-freed electron at 20 °C', () => {
    const v = volumePerFreeElectron(293.15, DIAMOND_GAP);
    expect(v).toBeGreaterThan(1.08e21);
    expect(v).toBeLessThan(1e23);
    expect(volumePerFreeElectron(293.15) / v).toBeLessThan(1e-35);
    expect(v / 1.083e21).toBeCloseTo(4.4, 0); // four Earths
    const decades = Math.log10(v / volumePerFreeElectron(293.15));
    expect(decades).toBeGreaterThan(37);
    expect(decades).toBeLessThan(38);
  });
  it('in silicon at 20 °C the same one electron has a speck about 6 µm across to itself', () => {
    expect(Math.cbrt(volumePerFreeElectron(293.15)) * 1e6).toBeCloseTo(5.8, 0);
  });
});
