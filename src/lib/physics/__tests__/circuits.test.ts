import { describe, expect, it } from 'vitest';
import {
  CH26_BULB, CH26_EMF, CH26_FLASH, CH26_LAMP_R, TRIO_NODE, batteryCurrent, capEnergy, chargeLedger, chargeStep, chargeV,
  dischargeV, energyGoneAt, junctionFlows, nodeImbalance, parallel, readTrio, resistorForTime, series,
  solveCircuit, timeToFraction, type TrioSlot,
} from '../circuits.ts';

const SLOTS: TrioSlot[] = ['none', 'series', 'alongA', 'branch', 'battery'];

describe('the solver', () => {
  it('reproduces series and parallel on a plain divider', () => {
    // 9 V across 1 kΩ then 2 kΩ∥2 kΩ: 4.5 V across each part
    const s = solveCircuit({ nodes: 3, elements: [
      { id: 'v', kind: 'V', a: 1, b: 0, volts: 9 },
      { id: 'r1', kind: 'R', a: 1, b: 2, ohms: 1000 },
      { id: 'r2', kind: 'R', a: 2, b: 0, ohms: 2000 },
      { id: 'r3', kind: 'R', a: 2, b: 0, ohms: 2000 },
    ] });
    expect(s.v[2]).toBeCloseTo(4.5, 9);
    expect(s.i.r1).toBeCloseTo(4.5e-3, 12);
    expect(series(1, 2, 3)).toBe(6);
    expect(parallel(12, 12, 12)).toBeCloseTo(4, 12);
  });
});

describe('lesson 1: A in series with B∥C (the opening bet)', () => {
  const r = readTrio('none');
  it('A is four times brighter than B, and B and C match', () => {
    expect(r.power.A / r.power.B).toBeCloseTo(4, 9);
    expect(r.power.B).toBeCloseTo(r.power.C, 12);
    expect(r.power.A).toBeCloseTo(4 / 3, 9);
  });
  it('A carries twice the current of B: the current splits, it is not used up', () => {
    expect(r.current.A).toBeCloseTo(1 / 3, 9);
    expect(r.current.B + r.current.C).toBeCloseTo(r.current.A, 9);
    // the return wire carries exactly what left the battery
    expect(r.sol.i.b10).toBeCloseTo(r.sol.i.t01, 9);
  });
  it('the junction sits at 2 V, and only there do the flows balance', () => {
    expect(r.sol.v[TRIO_NODE.T5]).toBeCloseTo(2, 9);
    expect(junctionFlows(2).net).toBeCloseTo(0, 12);
    expect(junctionFlows(3).net).toBeCloseTo(-0.25, 12); // halfway: 0.25 A in, 0.5 A out
    expect(junctionFlows(4.5).net).toBeLessThan(0);
    expect(junctionFlows(1).net).toBeGreaterThan(0);
  });
});

describe('Kirchhoff and energy, for every wiring the scene offers', () => {
  for (const slot of SLOTS) {
    it(`slot ${slot}: current in equals current out at every node`, () => {
      const r = readTrio(slot);
      for (const net of nodeImbalance(r.circuit, r.sol)) expect(Math.abs(net)).toBeLessThan(1e-9);
    });
    it(`slot ${slot}: the bulbs' powers add to the battery's output`, () => {
      const r = readTrio(slot);
      const sum = Object.values(r.power).reduce((a, b) => a + b, 0);
      expect(sum).toBeCloseTo(r.batteryP, 9);
      // the loop rule: around battery → A → B the drops add to the EMF
      if (slot === 'none') expect(r.sol.v[TRIO_NODE.T2] - r.sol.v[TRIO_NODE.T3] + r.sol.v[TRIO_NODE.T5]).toBeCloseTo(CH26_EMF, 9);
    });
  }
});

describe('lesson 1: where the fourth bulb goes', () => {
  const pA0 = readTrio('none').power.A;
  it('beside B and C it brightens A (the circuit drops to 16 Ω)', () => {
    const r = readTrio('branch');
    expect(r.power.A).toBeGreaterThan(pA0);
    expect(r.batteryI).toBeCloseTo(CH26_EMF / 16, 9);
    expect(r.power.A).toBeCloseTo(1.6875, 9);
  });
  it('in line with A, or alongside A, it dims A', () => {
    expect(readTrio('series').power.A).toBeCloseTo(0.48, 9);
    expect(readTrio('alongA').power.A).toBeCloseTo(0.75, 9);
  });
  it('across the ideal battery it leaves A alone, and the battery works harder', () => {
    const r = readTrio('battery');
    expect(r.power.A).toBeCloseTo(pA0, 9);
    expect(r.batteryI).toBeCloseTo(1 / 3 + 1 / 2, 9);
  });
});

describe('lesson 1: the battery current ranking', () => {
  it('series < trio < one < two parallel < three parallel', () => {
    const order = (['two-series', 'trio', 'one', 'two-parallel', 'three-parallel'] as const).map((n) => batteryCurrent(n));
    for (let k = 1; k < order.length; k++) expect(order[k]).toBeGreaterThan(order[k - 1]);
    expect(batteryCurrent('two-parallel')).toBeCloseTo(2 * batteryCurrent('one'), 12);
  });
  it('adding a bulb in parallel leaves the first untouched; in series dims both to a quarter', () => {
    const one = CH26_EMF ** 2 / CH26_BULB;
    const inSeries = (batteryCurrent('two-series') ** 2) * CH26_BULB;
    const inParallel = (CH26_EMF ** 2) / CH26_BULB;
    expect(inSeries / one).toBeCloseTo(0.25, 12);
    expect(inParallel / one).toBe(1);
  });
});

describe('lesson 2: RC charging', () => {
  const { emf, C } = CH26_FLASH;
  it('reaches 63.2 % of the EMF at t = RC, whatever R and C are', () => {
    for (const [R, Cx] of [[1e3, 1e-3], [3.3e3, 200e-6], [1e6, 10e-12]]) {
      expect(chargeV(R * Cx, 1, R, Cx)).toBeCloseTo(1 - Math.exp(-1), 12);
    }
    expect(1 - Math.exp(-1)).toBeCloseTo(0.632, 3);
  });
  it('each equal interval closes the same fraction of the remaining gap', () => {
    // half-way in 1 s means three-quarters in 2 s, not full
    const R = resistorForTime(1, 0.5, C);
    expect(chargeV(1, emf, R, C) / emf).toBeCloseTo(0.5, 12);
    expect(chargeV(2, emf, R, C) / emf).toBeCloseTo(0.75, 12);
    expect(chargeV(3, emf, R, C) / emf).toBeCloseTo(0.875, 12);
  });
  it('matches a brute-force integration of dV/dt = (E − V)/RC', () => {
    const R = 3000; let v = 0; const dt = 1e-5;
    for (let n = 0; n < 60000; n++) {
      const k1 = (emf - v) / (R * C), k2 = (emf - (v + 0.5 * dt * k1)) / (R * C);
      const k3 = (emf - (v + 0.5 * dt * k2)) / (R * C), k4 = (emf - (v + dt * k3)) / (R * C);
      v += (dt / 6) * (k1 + 2 * k2 + 2 * k3 + k4);
    }
    expect(v).toBeCloseTo(chargeV(0.6, emf, R, C), 6);
  });
  it('ready (95 %) takes about three time constants; 2 s needs about 3.3 kΩ', () => {
    expect(timeToFraction(0.95, 1, 1)).toBeCloseTo(2.9957, 4);
    const R = resistorForTime(2, CH26_FLASH.ready, C);
    expect(R).toBeCloseTo(3338, 0);
    expect(timeToFraction(CH26_FLASH.ready, R, C)).toBeCloseTo(2, 12);
    // the naive steady-rate guess, R = t / C, is three times too slow
    expect(timeToFraction(CH26_FLASH.ready, 2 / C, C)).toBeCloseTo(5.99, 2);
  });
});

describe('lesson 2: the energy ledger', () => {
  const { emf, C } = CH26_FLASH;
  it('a full charge heats the resistor by ½CE², whatever R is', () => {
    for (const R of [100, 3338, 1e5]) {
      const L = chargeLedger(50 * R * C, emf, R, C);
      expect(L.heat).toBeCloseTo(0.5 * C * emf * emf, 6);
      expect(L.stored).toBeCloseTo(L.heat, 6);
      expect(L.source).toBeCloseTo(L.heat + L.stored, 9);
    }
  });
  it('the heat is really ∫I²R dt, by brute force', () => {
    const R = 500; let heat = 0; const dt = 1e-6; const T = 0.2;
    for (let n = 0; n < T / dt; n++) {
      const t = n * dt;
      const i1 = (emf - chargeV(t, emf, R, C)) / R, i2 = (emf - chargeV(t + dt, emf, R, C)) / R;
      heat += 0.5 * (i1 * i1 + i2 * i2) * R * dt;
    }
    expect(heat / chargeLedger(T, emf, R, C).heat).toBeCloseTo(1, 6);
  });
  it('on discharge, half the energy is gone at V₀/√2, and three-quarters at V₀/2', () => {
    const v0 = emf;
    expect(energyGoneAt(v0 / Math.SQRT2, v0)).toBeCloseTo(0.5, 12);
    expect(energyGoneAt(v0 / 2, v0)).toBeCloseTo(0.75, 12);
    expect(capEnergy(C, v0)).toBeCloseTo(9, 12);
    // the lamp: half the energy leaves at t = ½ RC ln 2
    const t = 0.5 * CH26_LAMP_R * C * Math.LN2;
    expect(dischargeV(t, v0, CH26_LAMP_R, C) / v0).toBeCloseTo(Math.SQRT1_2, 12);
  });
});

describe('lesson 2: the step the scenes run', () => {
  it('summed exact steps reproduce the closed-form ledger', () => {
    const { emf, C } = CH26_FLASH; const R = 3338;
    let v = 0, heat = 0, source = 0;
    for (let n = 0; n < 1000; n++) { const s = chargeStep(v, 1 / 600, emf, R, C); v = s.v; heat += s.heat; source += s.source; }
    const L = chargeLedger(1000 / 600, emf, R, C);
    expect(v).toBeCloseTo(chargeV(1000 / 600, emf, R, C), 9);
    expect(heat).toBeCloseTo(L.heat, 9);
    expect(source).toBeCloseTo(L.source, 9);
  });
  it('with emf 0 it empties the capacitor into the resistor, joule for joule', () => {
    const { emf, C } = CH26_FLASH; let v = emf, heat = 0;
    for (let n = 0; n < 2000; n++) { const s = chargeStep(v, 0.01, 0, CH26_LAMP_R, C); v = s.v; heat += s.heat; }
    expect(heat + capEnergy(C, v)).toBeCloseTo(capEnergy(C, emf), 9);
  });
});

describe('lesson 2: the values the lesson types in', () => {
  it('7213 Ω on 200 µF reaches half in one second (the opening bet)', () => {
    expect(Math.round(resistorForTime(1, 0.5, CH26_FLASH.C))).toBe(7213);
    expect(chargeV(1, 1, 7213, CH26_FLASH.C)).toBeCloseTo(0.5, 4);
  });
  it('the lamp keeps half the energy at 212 V', () => {
    expect(CH26_FLASH.emf * Math.SQRT1_2).toBeCloseTo(212, 0);
  });
});
