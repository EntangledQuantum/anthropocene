import { describe, expect, it } from 'vitest';
import {
  HB2M_E, INFINITE_WELL, M_PROTON, barrierTransmission, boxEnergy, boxState, countNodes, createPacket, decayRate,
  eigenEnergies, farWallMiss, flatBarrier, hb2mFor, hillTurningPoint, integrate, normalise, packetAverageTransmission,
  packetProbability, probabilityBetween, densitySampler, scatterNumeric, scatterWaveAt, seededRandom, shoot,
  shootBox, smoothHill, stepPacket, thicknessFor,
} from '../quantum1d.ts';

/* Chapter 40's claims, each pinned. Units: nm, eV, fs. */

describe('the box: only certain energies fit', () => {
  const L = 1;
  const levels = eigenEnergies(INFINITE_WELL, 0, L, 4, { Emax: 7 });

  it('ħ²/2m for an electron is 0.0381 eV·nm²', () => {
    expect(HB2M_E).toBeCloseTo(0.0380998, 6);
  });

  it('shooting finds E_n = n²h²/8mL² to 1e-6', () => {
    expect(levels).toHaveLength(4);
    levels.forEach((E, i) => {
      const exact = boxEnergy(i + 1, L);
      expect(Math.abs(E - exact) / exact).toBeLessThan(1e-6);
    });
    expect(levels[0]).toBeCloseTo(0.376, 3);
    expect(levels[1] / levels[0]).toBeCloseTo(4, 5);
  });

  it('holds for another width and a heavier particle', () => {
    const [E1] = eigenEnergies(INFINITE_WELL, 0, 0.3, 1, { Emax: 20, hb2m: hb2mFor(M_PROTON) });
    expect(Math.abs(E1 - boxEnergy(1, 0.3, M_PROTON)) / E1).toBeLessThan(1e-6);
  });

  it('the lowest level is above zero: E₁ > 0, and zero energy does not fit', () => {
    expect(levels[0]).toBeGreaterThan(0.3);
    // At E = 0 the wave is the straight ramp ψ = x: it arrives at the far wall at full height.
    expect(farWallMiss(shootBox(0, L))).toBeCloseTo(1, 6);
  });

  it('level n has n − 1 nodes', () => {
    levels.forEach((E, i) => {
      expect(countNodes(shootBox(E, L, 2000).psi)).toBe(i);
    });
  });

  it('between levels the shot misses the far wall', () => {
    const mid = (levels[0] + levels[1]) / 2;
    expect(Math.abs(farWallMiss(shootBox(mid, L)))).toBeGreaterThan(0.5);
    expect(Math.abs(farWallMiss(shootBox(levels[1], L)))).toBeLessThan(1e-6);
  });

  it('half the width, four times the energy', () => {
    expect(boxEnergy(1, 0.5) / boxEnergy(1, 1)).toBeCloseTo(4, 12);
    expect(boxEnergy(1, 0.1)).toBeGreaterThan(30); // an atom-sized box: tens of eV
  });
});

describe('the Born rule', () => {
  it('∫|ψ|² = 1 after normalisation', () => {
    const s = shootBox(boxEnergy(3, 1), 1, 600);
    const psi = normalise(s.xs, s.psi);
    expect(integrate(s.xs, psi.map((v) => v * v))).toBeCloseTo(1, 12);
    expect(probabilityBetween(s.xs, psi, 0, 1)).toBeCloseTo(1, 4);
  });

  it('matches √(2/L) sin(nπx/L)', () => {
    const { xs, psi } = boxState(2, 1);
    const i = xs.findIndex((x) => x >= 0.25);
    expect(Math.abs(psi[i])).toBeCloseTo(Math.SQRT2, 4);
  });

  it('level 2: the crest and the trough catch equally, the middle almost never', () => {
    const { xs, psi } = boxState(2, 1);
    const w = 0.1;
    const crest = probabilityBetween(xs, psi, 0.25 - w / 2, 0.25 + w / 2);
    const trough = probabilityBetween(xs, psi, 0.75 - w / 2, 0.75 + w / 2);
    const middle = probabilityBetween(xs, psi, 0.5 - w / 2, 0.5 + w / 2);
    expect(trough / crest).toBeCloseTo(1, 6);
    expect(crest).toBeGreaterThan(0.19);
    expect(middle).toBeLessThan(0.01);
    expect(psi[xs.findIndex((x) => x >= 0.5)]).toBeCloseTo(0, 6); // the node itself
  });

  it('sampled clicks follow ψ²', () => {
    const { xs, psi } = boxState(2, 1);
    const rnd = seededRandom(40);
    const click = densitySampler(xs, psi);
    const clicks = Array.from({ length: 20000 }, () => click(rnd()));
    const left = clicks.filter((x) => x < 0.5).length / clicks.length;
    const nearMiddle = clicks.filter((x) => Math.abs(x - 0.5) < 0.05).length / clicks.length;
    expect(left).toBeCloseTo(0.5, 1);
    expect(nearMiddle).toBeLessThan(0.012);
  });
});

describe('a barrier: the wave leaks through', () => {
  const E = 1, V0 = 2;

  it('the exact T matches the numerical T (backward march) for thin, thick and over-the-top', () => {
    for (const [e, a] of [[1, 0.3], [1, 0.58], [1, 1.5], [0.4, 0.8], [2, 0.5], [3, 0.7]] as const) {
      const exact = barrierTransmission(e, V0, a);
      const num = scatterNumeric(flatBarrier(V0, a), e, 0, a, 4000);
      expect(Math.abs(num.T - exact) / exact).toBeLessThan(1e-6);
      expect(num.T + num.R).toBeCloseTo(1, 8);
    }
  });

  it('padding with flat ground changes nothing', () => {
    const a = 0.5;
    const num = scatterNumeric(flatBarrier(V0, a), E, -0.4, a + 0.4, 12000);
    expect(Math.abs(num.T - barrierTransmission(E, V0, a)) / num.T).toBeLessThan(1e-3);
  });

  it('a thick barrier: ln T falls with slope −2κ', () => {
    const k = decayRate(E, V0);
    const slope = (Math.log(barrierTransmission(E, V0, 2.0)) - Math.log(barrierTransmission(E, V0, 1.5))) / 0.5;
    expect(slope / (-2 * k)).toBeCloseTo(1, 4);
  });

  it('1% gets through at about 0.58 nm; twice that lets through far less than half', () => {
    const a1 = thicknessFor(0.01, E, V0);
    expect(a1).toBeGreaterThan(0.55);
    expect(a1).toBeLessThan(0.62);
    expect(barrierTransmission(E, V0, a1)).toBeCloseTo(0.01, 8);
    expect(barrierTransmission(E, V0, 2 * a1)).toBeLessThan(1e-4);
  });

  it('inside the barrier the wave decays as e^{−κx}', () => {
    const a = 1.5;
    const s = scatterNumeric(flatBarrier(V0, a), E, 0, a, 3000);
    const m = (x: number) => Math.hypot(scatterWaveAt(s, x).re, scatterWaveAt(s, x).im);
    const rate = Math.log(m(0.3) / m(0.8)) / 0.5;
    expect(rate / decayRate(E, V0)).toBeCloseTo(1, 2);
  });

  it('the transmitted wave has the same wavelength as the incoming one', () => {
    const s = scatterNumeric(flatBarrier(V0, 0.3), E, 0, 0.3);
    const phase = (x: number) => { const v = scatterWaveAt(s, x); return Math.atan2(v.im, v.re); };
    const dphi = phase(1.01) - phase(1.0);
    expect(dphi / 0.01).toBeCloseTo(s.k, 3);
    expect(s.k).toBeCloseTo(Math.sqrt(E / HB2M_E), 12);
  });

  it('the STM: 0.1 nm more gap cuts the current about ninefold', () => {
    const Ef = 5, phi = 4.5;
    const ratio = barrierTransmission(Ef, Ef + phi, 0.5) / barrierTransmission(Ef, Ef + phi, 0.6);
    expect(ratio).toBeGreaterThan(8);
    expect(ratio).toBeLessThan(10);
  });
});

describe('a smooth hill: the wave fades from the turning point', () => {
  const V0 = 2, w = 1.2, E = 1;
  const xt = hillTurningPoint(E, V0, w)!;

  it('the turning point is where the hill reaches E', () => {
    expect(smoothHill(V0, w)(xt)).toBeCloseTo(E, 10);
    expect(xt).toBeCloseTo(-0.6, 10);
  });

  it('ψ curves toward the axis before it and away after it (ψ″/ψ changes sign there)', () => {
    const s = scatterNumeric(smoothHill(V0, w), E, -w, w, 4000);
    // A standing wave in front of a hill that reflects almost everything.
    expect(s.R).toBeGreaterThan(0.99);
    // Real part at the frame where the pattern is real-valued: use |ψ|, which has no nodes inside the hill.
    const mag = (x: number) => Math.hypot(scatterWaveAt(s, x).re, scatterWaveAt(s, x).im);
    // Past the turning point |ψ| only falls.
    let prev = mag(xt + 0.1);
    for (let x = xt + 0.15; x < 0.8; x += 0.05) { const m = mag(x); expect(m).toBeLessThan(prev); prev = m; }
    // The equation itself: ψ″ = (U − E)ψ/(ħ²/2m) changes sign exactly at xt.
    expect(smoothHill(V0, w)(xt - 0.05) - E).toBeLessThan(0);
    expect(smoothHill(V0, w)(xt + 0.05) - E).toBeGreaterThan(0);
  });

  it('T + R = 1 for the hill as well', () => {
    const s = scatterNumeric(smoothHill(V0, w), E, -w, w, 4000);
    expect(s.T + s.R).toBeCloseTo(1, 8);
  });
});

describe('a packet at a barrier', () => {
  const V0 = 2, a = 0.3, k0 = Math.sqrt(1 / HB2M_E), sigma = 1.5;

  it('Crank–Nicolson keeps ∫|ψ|² = 1, and the ghost matches the exact T averaged over the packet', () => {
    const p = createPacket({ from: -30, to: 30, n: 3001, x0: -9, k0, sigma, U: flatBarrier(V0, a) });
    expect(packetProbability(p, -Infinity, Infinity)).toBeCloseTo(1, 10);
    stepPacket(p, 0.02, 1500); // 30 fs: the packet has hit and split
    expect(packetProbability(p, -Infinity, Infinity)).toBeCloseTo(1, 9);
    const beyond = packetProbability(p, a, Infinity);
    const expected = packetAverageTransmission(k0, sigma, (E) => barrierTransmission(E, V0, a));
    expect(expected).toBeGreaterThan(0.12);
    expect(expected).toBeLessThan(0.22);
    expect(Math.abs(beyond - expected)).toBeLessThan(0.01);
  });
});

describe('shoot is independent of its starting slope', () => {
  it('only the scale changes', () => {
    const s = shoot(INFINITE_WELL, 0.9, 0, 1, 400);
    const n = normalise(s.xs, s.psi);
    const n2 = normalise(s.xs, s.psi.map((v) => 3 * v));
    expect(n[200]).toBeCloseTo(n2[200], 12);
  });
});
