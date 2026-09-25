import { describe, expect, it } from 'vitest';
import {
  METALS, FERMI_SPEED_COPPER, bestLoad, currentForDrift, drawnOut, driftSpeed, driftTime, lengthFor,
  loadPower, loadState, loopCurrent, mm2, parallel, resistance, shortCircuitCurrent, signalTime,
  terminalVoltage, wireArea, type Cell,
} from '../current.ts';

const Cu = METALS.copper;

describe('drift: the electrons crawl', () => {
  it('1 A in household copper drifts at about 0.02 mm/s', () => {
    // 12-gauge house wire, 2.05 mm across.
    const v = driftSpeed(1, wireArea(2.05e-3));
    expect(v * 1000).toBeGreaterThan(0.018);
    expect(v * 1000).toBeLessThan(0.026);
    // and a 2.5 mm² ring-main conductor lands in the same place
    expect(driftSpeed(1, mm2(2.5)) * 1000).toBeCloseTo(0.029, 3);
  });

  it('an electron takes about eleven hours to cross a 2 m lamp cord; the push takes nanoseconds', () => {
    const v = driftSpeed(0.5, mm2(0.75));
    expect(v * 1000).toBeCloseTo(0.049, 3);
    const hours = driftTime(2, v) / 3600;
    expect(hours).toBeGreaterThan(10);
    expect(hours).toBeLessThan(12);
    expect(signalTime(2)).toBeLessThan(2e-8);
    expect(driftTime(2, v) / signalTime(2)).toBeGreaterThan(1e12);
  });

  it('the random motion is a hundred billion times faster than the drift', () => {
    expect(FERMI_SPEED_COPPER / driftSpeed(0.5, mm2(0.75))).toBeGreaterThan(1e10);
  });

  it("keeping pace with a 1 mm/s snail in 1 mm² copper takes a kettle's current, about 14 A", () => {
    const I = currentForDrift(1e-3, mm2(1));
    expect(I).toBeCloseTo(13.6, 1);
    expect(driftSpeed(I, mm2(1))).toBeCloseTo(1e-3, 10);
  });

  it('the same current drifts faster through a thinner wire', () => {
    expect(driftSpeed(1, mm2(0.5)) / driftSpeed(1, mm2(1))).toBeCloseTo(2, 10);
  });
});

describe('resistance: R = ρL/A', () => {
  const rho = METALS.nichrome.rho;
  const A = wireArea(0.4e-3);
  it('doubling the length doubles R; doubling the diameter quarters it', () => {
    expect(resistance(rho, 2, A) / resistance(rho, 1, A)).toBeCloseTo(2, 12);
    expect(resistance(rho, 1, wireArea(0.8e-3)) / resistance(rho, 1, A)).toBeCloseTo(0.25, 12);
  });

  it('drawing a wire out to twice its length at fixed volume makes it four times the resistance', () => {
    expect(drawnOut(rho, 1, A, 2) / resistance(rho, 1, A)).toBeCloseTo(4, 12);
  });

  it('a 12 V, 2 A heater is about a metre of 0.4 mm nichrome, and any L/A with the same ratio works', () => {
    const R = 12 / 2;
    const L = lengthFor(R, rho, A);
    expect(L).toBeGreaterThan(0.6);
    expect(L).toBeLessThan(0.8);
    expect(resistance(rho, 2 * L, 2 * A)).toBeCloseTo(R, 10);
  });

  it('a short nichrome stub out-resists a long copper wire: the metal matters as much as the shape', () => {
    const cu = resistance(Cu.rho, 1, mm2(1));
    const nic = resistance(METALS.nichrome.rho, 0.1, mm2(1));
    expect(nic / cu).toBeGreaterThan(6);
  });
});

describe('a real cell: V = ε − Ir', () => {
  const cell: Cell = { emf: 1.5, r: 0.5 };
  const bulb = 3;

  it('an open cell reads its emf; every bulb added in parallel pulls the terminals lower', () => {
    expect(terminalVoltage(cell, loopCurrent(cell, parallel(bulb, 0)))).toBe(1.5);
    const V = [1, 2, 3, 4].map((n) => loadState(cell, parallel(bulb, n)).V);
    expect(V[0]).toBeCloseTo(1.286, 3);
    for (let i = 1; i < V.length; i++) expect(V[i]).toBeLessThan(V[i - 1]);
  });

  it('the (I, V) points lie on one straight line that reaches zero volts at ε/r', () => {
    const pts = [0, 1, 2, 3, 4].map((n) => loadState(cell, parallel(bulb, n)));
    for (const p of pts) expect(p.V).toBeCloseTo(cell.emf - cell.r * p.I, 12);
    expect(shortCircuitCurrent(cell)).toBeCloseTo(3, 12);
    const shorted = loadState(cell, 0);
    expect(shorted.I).toBeCloseTo(3, 12);
    expect(shorted.V).toBeCloseTo(0, 12);
    expect(shorted.lost).toBeCloseTo(cell.emf, 12);
  });

  it('the load takes the most power when R = r, and that is only half what the pump delivers', () => {
    for (const c of [cell, { emf: 12.6, r: 0.02 }, { emf: 9, r: 2 }]) {
      const R = bestLoad(c);
      expect(R / c.r).toBeCloseTo(1, 4);
      expect(loadPower(c, R)).toBeCloseTo((c.emf * c.emf) / (4 * c.r), 8);
      expect(loadState(c, R).efficiency).toBeCloseTo(0.5, 4);
    }
    // both less and more resistance deliver less
    expect(loadPower(cell, 0.1)).toBeLessThan(loadPower(cell, 0.5));
    expect(loadPower(cell, 2)).toBeLessThan(loadPower(cell, 0.5));
  });

  it('P = I²R = VI = V²/R, and εI = I²R + I²r', () => {
    for (const R of [0.1, 0.5, 1, 3, 10]) {
      const s = loadState(cell, R);
      expect(s.Pload).toBeCloseTo(s.V * s.I, 12);
      expect(s.Pload).toBeCloseTo((s.V * s.V) / R, 12);
      expect(s.Ppump).toBeCloseTo(s.Pload + s.Pcell, 12);
    }
  });

  it('a big load is efficient but not powerful: 10r keeps 91% and delivers a third of the peak', () => {
    const s = loadState(cell, 10 * cell.r);
    expect(s.efficiency).toBeCloseTo(10 / 11, 12);
    expect(s.Pload / loadPower(cell, cell.r)).toBeCloseTo(40 / 121, 12);
  });
});
