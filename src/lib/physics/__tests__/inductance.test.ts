import { describe, expect, it } from 'vitest';
import {
  CH30_CORE, CH30_LC, CH30_RADIO, CH30_RL, CH30_SPARK, CH30_TWIN_L, TAU,
  capEnergy, chargeZeroCrossings, coilEmf, coilEnergy, coilShare, coreForInductance, coreInductance,
  currentForEnergyFraction, energyFraction, energyIntoCoil, inductanceForFrequency, inductanceForHalfTime,
  lcEnergy, lcFrequency, lcOmega, lcPeakCurrent, lcPeriod, lcRelease, lcRun, lcStep, rlFall, rlFinal,
  rlHalfTime, rlRise, rlSlope, rlStep, rlTau, rlTimeToFraction, tankBand, tankResponse, twinStep, type TwinState,
} from '../inductance.ts';
import { springOmega } from '../oscillator.ts';

const { emf, R } = CH30_RL;

describe('RL: the coil resists change, not current', () => {
  it('carries no current at the instant the switch closes', () => {
    expect(rlRise(0, emf, R, 12)).toBe(0);
  });

  it('puts the whole battery voltage across the coil at that instant', () => {
    // ε = IR + L dI/dt with I = 0: the coil's back-emf matches the battery exactly.
    const dIdt = rlSlope(0, emf, R, 12);
    expect(coilEmf(12, dIdt)).toBeCloseTo(-emf, 12);
  });

  it('reaches 1 − 1/e ≈ 63% of the final current after one τ = L/R', () => {
    const L = 12;
    expect(rlTau(L, R)).toBe(1);
    expect(rlRise(rlTau(L, R), emf, R, L) / rlFinal(emf, R)).toBeCloseTo(1 - 1 / Math.E, 12);
    expect(rlRise(rlTau(L, R), emf, R, L) / rlFinal(emf, R)).toBeCloseTo(0.632, 3);
  });

  it('reaches half its final current at τ ln 2', () => {
    const L = 17;
    expect(rlRise(rlHalfTime(L, R), emf, R, L)).toBeCloseTo(rlFinal(emf, R) / 2, 12);
    expect(rlHalfTime(L, R)).toBeCloseTo(rlTau(L, R) * Math.LN2, 12);
  });

  it('settles to ε/R whatever the inductance: the coil does not block current', () => {
    for (const L of [0.1, 1, 12, 40]) expect(rlRise(60 * rlTau(L, R), emf, R, L)).toBeCloseTo(0.5, 10);
  });

  it('gets faster, not slower, when R grows: τ = L/R, unlike RC', () => {
    expect(rlHalfTime(8, 40)).toBeLessThan(rlHalfTime(8, 10));
  });

  it('steps exactly: many small rlSteps land on the closed-form rise and fall', () => {
    let I = 0;
    for (let k = 0; k < 1000; k++) I = rlStep(I, 0.003, emf, R, 12);
    expect(I).toBeCloseTo(rlRise(3, emf, R, 12), 12);
    let J = 0.5;
    for (let k = 0; k < 1000; k++) J = rlStep(J, 0.001, 0, R, 12);
    expect(J).toBeCloseTo(rlFall(1, 0.5, R, 12), 12);
  });

  it('stores the work the battery does against the coil as ½LI² in the field', () => {
    const L = 24, t = 3;
    const W = energyIntoCoil(t, emf, R, L);
    expect(W).toBeCloseTo(coilEnergy(L, rlRise(t, emf, R, L)), 6);
  });

  it('holds a quarter of its full energy at half current, and half at 1/√2', () => {
    expect(energyFraction(0.25, 0.5)).toBeCloseTo(0.25, 12);
    expect(currentForEnergyFraction(0.5, 0.5)).toBeCloseTo(0.5 / Math.SQRT2, 12);
  });
});

describe('the two-branch hook', () => {
  it('lights lamp A at once and lamp B from zero, both ending equal', () => {
    let s: TwinState = { closed: true, iA: 0, iB: 0 };
    s = twinStep(s, 1e-3, emf, R, CH30_TWIN_L);
    expect(s.iA).toBeCloseTo(0.5, 12);
    expect(s.iB).toBeLessThan(0.001);
    for (let k = 0; k < 10000; k++) s = twinStep(s, 1e-3, emf, R, CH30_TWIN_L);
    expect(s.iB).toBeCloseTo(s.iA, 4);
  });

  it('keeps the coil current going after the switch opens, backwards through lamp A, fading with τ = L/2R', () => {
    let s: TwinState = { closed: false, iA: 0.5, iB: 0.5 };
    s = twinStep(s, 1e-4, emf, R, CH30_TWIN_L);
    expect(s.iA).toBeCloseTo(-0.5, 2);
    let t = 1e-4;
    while (t < CH30_TWIN_L / (2 * R)) { s = twinStep(s, 1e-4, emf, R, CH30_TWIN_L); t += 1e-4; }
    expect(s.iB / 0.5).toBeCloseTo(Math.exp(-t / (CH30_TWIN_L / (2 * R))), 6);
  });
});

describe('the lesson-1 scenes', () => {
  it('the iron core spans 1 H to 40 H, and the target inductance lies inside its travel', () => {
    expect(coreInductance(0, CH30_CORE.Lair, CH30_CORE.Lfull)).toBeCloseTo(1, 12);
    expect(coreInductance(1, CH30_CORE.Lair, CH30_CORE.Lfull)).toBeCloseTo(40, 12);
    const Lt = inductanceForHalfTime(CH30_CORE.halfAt, R);
    expect(Lt).toBeCloseTo(17.31, 2);
    const x = coreForInductance(Lt, CH30_CORE.Lair, CH30_CORE.Lfull);
    expect(x).toBeGreaterThan(CH30_CORE.start);
    expect(x).toBeLessThan(1);
    expect(coreInductance(x, CH30_CORE.Lair, CH30_CORE.Lfull)).toBeCloseTo(Lt, 9);
  });

  it('the spark scene: half the energy is at 0.354 A, 2.46 s after closing', () => {
    const Ifull = rlFinal(emf, R);
    const I = currentForEnergyFraction(CH30_SPARK.target, Ifull);
    expect(I).toBeCloseTo(0.354, 3);
    expect(rlTimeToFraction(I / Ifull, CH30_SPARK.L, R)).toBeCloseTo(2.455, 2);
    expect(coilEnergy(CH30_SPARK.L, Ifull)).toBeCloseTo(3, 12);
  });

  it('the rank-order claims: half-way times of four coil-and-lamp pairs', () => {
    const t = (L: number, r: number) => rlHalfTime(L, r);
    // 2 H + 40 Ω < 8 H + 40 Ω < 2 H + 5 Ω < 8 H + 10 Ω
    const order = [t(2, 40), t(8, 40), t(2, 5), t(8, 10)];
    expect(order.map((v) => +v.toFixed(3))).toEqual([0.035, 0.139, 0.277, 0.555]);
    for (let k = 1; k < order.length; k++) expect(order[k]).toBeGreaterThan(order[k - 1]);
    // the RC trap: the same coil with four times the resistance is four times as fast
    expect(t(8, 10) / t(8, 40)).toBeCloseTo(4, 12);
  });
});

describe('LC: a spring and a mass in electrical clothes', () => {
  const { L, C, V0 } = CH30_LC;

  it('rings at ω = 1/√(LC), measured from the charge zero crossings', () => {
    const T = lcPeriod(L, C);
    const run = lcRun(lcRelease(V0, C), T / 4000, 4000 * 50, L, C);
    const z = chargeZeroCrossings(run);
    const halfPeriods = z.slice(1).map((t, k) => t - z[k]);
    const measured = 1 / (2 * (halfPeriods.reduce((a, b) => a + b, 0) / halfPeriods.length));
    expect(measured / lcFrequency(L, C) - 1).toBeLessThan(1e-5);
    expect(lcFrequency(L, C)).toBeCloseTo(31.83, 2);
  });

  it('conserves total energy to 1e-6 over 200 cycles (Verlet: bounded, no drift)', () => {
    const T = lcPeriod(L, C);
    const s0 = lcRelease(V0, C);
    const E0 = lcEnergy(s0, L, C);
    let s = s0, worst = 0;
    for (let k = 0; k < 4000 * 200; k++) {
      s = lcStep(s, T / 4000, L, C);
      worst = Math.max(worst, Math.abs(lcEnergy(s, L, C) / E0 - 1));
    }
    expect(worst).toBeLessThan(1e-6);
    expect(Math.abs(lcEnergy(s, L, C) / E0 - 1)).toBeLessThan(1e-6);
  });

  it('holds all the energy in the coil, at peak current, the instant the capacitor empties', () => {
    const T = lcPeriod(L, C);
    const dt = T / 4000;
    let s = lcRelease(V0, C);
    while (s.q > 0) s = lcStep(s, dt, L, C);
    expect(coilShare(s, L, C)).toBeGreaterThan(0.99999);
    expect(Math.abs(s.I)).toBeCloseTo(lcPeakCurrent(V0, L, C), 3);
    expect(capEnergy(s.q, C)).toBeLessThan(1e-5 * lcEnergy(s, L, C));
  });

  it('takes the same time to empty whatever the starting charge', () => {
    const T = lcPeriod(L, C);
    const first = (V: number) => chargeZeroCrossings(lcRun(lcRelease(V, C), T / 4000, 2000, L, C))[0];
    expect(first(20)).toBeCloseTo(first(10), 12);
    expect(first(10)).toBeCloseTo(T / 4, 6);
  });

  it('is chapter 14 line for line: L is the mass, 1/C the spring constant', () => {
    expect(lcOmega(L, C)).toBeCloseTo(springOmega(1 / C, L), 12);
    expect(capEnergy(0.003, C)).toBeCloseTo(0.5 * (1 / C) * 0.003 ** 2, 12);
  });
});

describe('the radio tuner', () => {
  const { C, Lair, Lfull, Q, startHz, stationHz } = CH30_RADIO;

  it('doubling the frequency takes a quarter of the inductance', () => {
    expect(inductanceForFrequency(stationHz, C) / inductanceForFrequency(startHz, C)).toBeCloseTo(0.25, 12);
    expect(lcFrequency(inductanceForFrequency(stationHz, C), C)).toBeCloseTo(stationHz, 3);
    expect(inductanceForFrequency(stationHz, C) * 1e6).toBeCloseTo(88.0, 1);
  });

  it('both settings lie within the slug travel', () => {
    for (const f of [startHz, stationHz]) {
      const x = coreForInductance(inductanceForFrequency(f, C), Lair, Lfull);
      expect(x).toBeGreaterThan(0);
      expect(x).toBeLessThan(1);
    }
  });

  it('halving L misses the station: 849 kHz, far outside the band', () => {
    const f = lcFrequency(inductanceForFrequency(startHz, C) / 2, C);
    expect(f / 1e3).toBeCloseTo(848.5, 0);
    expect(tankResponse(stationHz, f, Q)).toBeLessThan(0.1);
  });

  it('the tank responds fully at resonance and at half power across f0/Q', () => {
    expect(tankResponse(stationHz, stationHz, Q)).toBe(1);
    const [lo, hi] = tankBand(stationHz, Q);
    expect(tankResponse(lo, stationHz, Q)).toBeCloseTo(Math.SQRT1_2, 9);
    expect(tankResponse(hi, stationHz, Q)).toBeCloseTo(Math.SQRT1_2, 9);
    expect((hi - lo) / stationHz).toBeCloseTo(1 / Q, 9);
    expect(TAU).toBeCloseTo(2 * Math.PI, 15);
  });
});

describe('the numbers the lessons print', () => {
  it('lesson 2: first empty at 7.9 ms, then every 15.7 ms, at 0.20 A peak', () => {
    const { L, C, V0 } = CH30_LC;
    expect(lcPeriod(L, C) / 4 * 1000).toBeCloseTo(7.85, 2);
    expect(lcPeriod(L, C) / 2 * 1000).toBeCloseTo(15.71, 2);
    expect(lcPeakCurrent(V0, L, C)).toBeCloseTo(0.2, 12);
  });

  it('lesson 2: the radio starts on 352 µH', () => {
    expect(inductanceForFrequency(CH30_RADIO.startHz, CH30_RADIO.C) * 1e6).toBeCloseTo(351.8, 1);
  });

  it('lesson 1: about 17 H for half-way at 1 s; 1.5 J of 3.0 J at 0.35 A', () => {
    expect(Math.round(inductanceForHalfTime(1, R))).toBe(17);
    expect(coilEnergy(CH30_SPARK.L, currentForEnergyFraction(0.5, 0.5))).toBeCloseTo(1.5, 12);
  });
});
