import { describe, expect, it } from 'vitest';
import {
  A0_PM, azimuthalNodePlanes, density, energyEV, mostLikelyRadius, nodeCount, polarNodes, probabilityBeyond,
  radialNodes, radialPeaks, radialProbability, radialR, realYlm, shellProbability, simpson,
} from '../hydrogen.ts';

const STATES: [number, number][] = [];
for (let n = 1; n <= 5; n++) for (let l = 0; l < n; l++) STATES.push([n, l]);

describe('hydrogen radial functions', () => {
  it('every R_nl up to n = 5 is normalised: ∫ r² R² dr = 1', () => {
    for (const [n, l] of STATES) {
      const total = simpson((r) => radialProbability(n, l, r), 0, 12 * n * n + 30, 20000);
      expect(total, `${n},${l}`).toBeCloseTo(1, 6);
    }
  });

  it('R_nl for different n and the same l are orthogonal', () => {
    const overlap = simpson((r) => r * r * radialR(1, 0, r) * radialR(2, 0, r), 0, 80, 20000);
    expect(Math.abs(overlap)).toBeLessThan(1e-8);
    const o2 = simpson((r) => r * r * radialR(2, 1, r) * radialR(4, 1, r), 0, 200, 20000);
    expect(Math.abs(o2)).toBeLessThan(1e-8);
  });

  it('matches the closed forms of 1s and 2s', () => {
    for (const r of [0, 0.3, 1, 2.5, 7]) {
      expect(radialR(1, 0, r)).toBeCloseTo(2 * Math.exp(-r), 12);
      expect(radialR(2, 0, r)).toBeCloseTo((1 / (2 * Math.SQRT2)) * (2 - r) * Math.exp(-r / 2), 12);
    }
  });
});

describe('the lesson-1 hook: dense is not likely', () => {
  it('|ψ_1s|² is largest at the nucleus and falls all the way out', () => {
    let prev = density(1, 0, 0, 0, 0, 0);
    for (let r = 0.05; r < 6; r += 0.05) {
      const d = density(1, 0, 0, r, 0, 0);
      expect(d).toBeLessThan(prev);
      prev = d;
    }
  });

  it('yet the radial probability of 1s peaks at exactly one Bohr radius, 52.9 pm', () => {
    const peaks = radialPeaks(1, 0);
    expect(peaks).toHaveLength(1);
    expect(peaks[0]).toBeCloseTo(1, 4);
    expect(peaks[0] * A0_PM).toBeCloseTo(52.9, 1);
  });

  it('a 5 pm shell at a₀ catches about 5% of the electron, one at 10 pm about 0.5%', () => {
    const dr = 5 / A0_PM;
    const atA0 = shellProbability(1, 0, 1 - dr / 2, dr);
    const near = shellProbability(1, 0, 10 / A0_PM - dr / 2, dr);
    expect(atA0).toBeGreaterThan(0.045);
    expect(atA0).toBeLessThan(0.055);
    expect(near).toBeLessThan(atA0 / 5);
  });

  it('the electron is not on a circle: 1s spends a third of its chance inside a₀ and a third beyond 1.35 a₀', () => {
    const inside = 1 - probabilityBeyond(1, 0, 1);
    expect(inside).toBeCloseTo(1 - 5 * Math.exp(-2), 6); // 0.323
    expect(probabilityBeyond(1, 0, 1.35)).toBeGreaterThan(0.25);
  });

  it('for l = n − 1 the most likely radius is n² a₀ (the Bohr radii, as peaks, not tracks)', () => {
    expect(mostLikelyRadius(2, 1)).toBeCloseTo(4, 3);
    expect(mostLikelyRadius(3, 2)).toBeCloseTo(9, 3);
    expect(mostLikelyRadius(4, 3)).toBeCloseTo(16, 3);
  });
});

describe('the lesson-1 tighten: 2s has two bumps', () => {
  it('2s peaks at (3 ∓ √5) a₀, and the outer one is the most likely distance', () => {
    const p = radialPeaks(2, 0);
    expect(p).toHaveLength(2);
    expect(p[0]).toBeCloseTo(3 - Math.sqrt(5), 3);
    expect(p[1]).toBeCloseTo(3 + Math.sqrt(5), 3);
    expect(mostLikelyRadius(2, 0)).toBeCloseTo(3 + Math.sqrt(5), 3);
  });

  it('a 5 pm shell on the outer bump catches more than three times what one on the inner bump does', () => {
    const dr = 5 / A0_PM;
    const [inner, outer] = radialPeaks(2, 0);
    expect(shellProbability(2, 0, outer - dr / 2, dr)).toBeGreaterThan(3 * shellProbability(2, 0, inner - dr / 2, dr));
  });

  it('the 2s density is still largest at the nucleus', () => {
    const d0 = density(2, 0, 0, 0, 0, 0);
    for (let r = 0.1; r < 20; r += 0.1) expect(density(2, 0, 0, r, 0, 0)).toBeLessThan(d0);
  });
});

describe('nodes: n − l − 1 dark shells, l dark surfaces', () => {
  it('R_nl changes sign n − l − 1 times', () => {
    for (const [n, l] of STATES) expect(radialNodes(n, l), `${n},${l}`).toHaveLength(n - l - 1);
  });

  it('the 2s dark shell sits at 2 a₀', () => {
    expect(radialNodes(2, 0)[0]).toBeCloseTo(2, 6);
  });

  it('every real Y_lm has exactly l nodal surfaces, cones plus planes', () => {
    for (let l = 0; l <= 4; l++) {
      for (let m = -l; m <= l; m++) {
        expect(polarNodes(l, m).length + azimuthalNodePlanes(m).length, `${l},${m}`).toBe(l);
        expect(nodeCount(l + 1, l, m).angular).toBe(l);
      }
    }
  });

  it('with m = 0 the slice shows l straight dark lines through the nucleus (p: the equator; d: an X)', () => {
    expect(polarNodes(1, 0)[0]).toBeCloseTo(Math.PI / 2, 6);
    const d = polarNodes(2, 0);
    expect(d).toHaveLength(2);
    expect(d[0]).toBeCloseTo(Math.acos(1 / Math.sqrt(3)), 5);
    expect(d[0] + d[1]).toBeCloseTo(Math.PI, 5); // the two cones mirror: two lines through the nucleus
  });

  it('the scene target, two dark shells and one dark line, is 4p and nothing else with n ≤ 5', () => {
    const hits = STATES.filter(([n, l]) => { const c = nodeCount(n, l, 0); return c.radial === 2 && c.angular === 1; });
    expect(hits).toEqual([[4, 1]]);
  });
});

describe('real spherical harmonics', () => {
  const sphere = (f: (t: number, p: number) => number) =>
    simpson((t) => simpson((p) => f(t, p) * Math.sin(t), 0, 2 * Math.PI, 200), 0, Math.PI, 200);

  it('are normalised on the sphere and orthogonal', () => {
    for (let l = 0; l <= 3; l++) {
      for (let m = -l; m <= l; m++) {
        expect(sphere((t, p) => realYlm(l, m, t, p) ** 2), `${l},${m}`).toBeCloseTo(1, 5);
      }
    }
    expect(Math.abs(sphere((t, p) => realYlm(1, 1, t, p) * realYlm(1, -1, t, p)))).toBeLessThan(1e-8);
    expect(Math.abs(sphere((t, p) => realYlm(2, 0, t, p) * realYlm(1, 0, t, p)))).toBeLessThan(1e-8);
  });

  it('a filled subshell is round: Σ_m |Y_lm|² = (2l+1)/4π in every direction', () => {
    for (let l = 1; l <= 3; l++) {
      for (const [t, p] of [[0.3, 0.2], [1.1, 2.5], [2.4, 4.0]]) {
        let s = 0;
        for (let m = -l; m <= l; m++) s += realYlm(l, m, t, p) ** 2;
        expect(s).toBeCloseTo((2 * l + 1) / (4 * Math.PI), 10);
      }
    }
  });
});

describe('energy levels', () => {
  it('E_n = −13.6 eV / n²', () => {
    expect(energyEV(1)).toBeCloseTo(-13.6, 1);
    expect(energyEV(2)).toBeCloseTo(-3.40, 2);
    expect(energyEV(3)).toBeCloseTo(-1.51, 2);
    expect(energyEV(4)).toBeCloseTo(-0.85, 2);
  });

  it('the 3→2 drop is the red Balmer line, 656 nm', () => {
    const dE = (energyEV(3) - energyEV(2)) * 1.602177e-19;
    const lambda = (6.62607e-34 * 2.99792458e8) / dE;
    expect(lambda * 1e9).toBeGreaterThan(655);
    expect(lambda * 1e9).toBeLessThan(657);
  });
});
