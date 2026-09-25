import { describe, expect, it } from 'vitest';
import {
  AIR_BREAKDOWN, EPS0, GLASS, atVoltage, boundCharge, cap, capacitance, chargeSplit, connect,
  energy, energyDensity, field, fieldEnergy, maxEnergy, parallelPlateC, plateForce, pullConnected,
  pullIsolated, si, slideConnected, slideIsolated, sparks, storedEnergy, voltage,
} from '../capacitor.ts';

const MM = 1e-3;
const A = 0.01; // 10 cm × 10 cm plates

/** Integrate your pull numerically: many small steps of plate force × distance. */
function integratePull(c0: ReturnType<typeof cap>, gap: number, V?: number, n = 20000) {
  let c = V === undefined ? c0 : atVoltage(c0, V);
  let work = 0;
  const h = (gap - c.gap) / n;
  for (let i = 0; i < n; i++) {
    const mid = { ...c, gap: c.gap + h / 2 };
    const at = V === undefined ? mid : atVoltage(mid, V);
    work += plateForce(at) * h;
    c = V === undefined ? { ...c, gap: c.gap + h } : atVoltage({ ...c, gap: c.gap + h }, V);
  }
  return work;
}

/* Lesson 1 — "Pull the plates apart" */

describe('parallel-plate capacitance', () => {
  it('is ε₀A/d: 44.3 pF for 10 cm plates 2 mm apart', () => {
    expect(parallelPlateC(A, 2 * MM)).toBeCloseTo(44.27e-12, 14);
  });
  it('doubles when the gap halves, and Q = CV', () => {
    expect(parallelPlateC(A, 1 * MM) / parallelPlateC(A, 2 * MM)).toBeCloseTo(2, 12);
    const c = atVoltage(cap(A, 2 * MM), 12);
    expect(c.q).toBeCloseTo(capacitance(c) * 12, 20);
    expect(voltage(c)).toBeCloseTo(12, 10);
  });
});

describe('disconnected: the charge stays put', () => {
  const c = atVoltage(cap(A, 2 * MM), 12);
  const m = pullIsolated(c, 4 * MM);
  it('double the gap doubles the voltage (12 V → 24 V) and keeps the field', () => {
    expect(m.after.q).toBe(c.q);
    expect(voltage(m.after)).toBeCloseTo(24, 10);
    expect(field(m.after)).toBeCloseTo(field(c), 6);
  });
  it('the energy doubles too', () => {
    expect(energy(m.after) / energy(c)).toBeCloseTo(2, 10);
  });
  it('the attraction is the same at every gap', () => {
    expect(plateForce(m.after)).toBeCloseTo(plateForce(c), 18);
  });
  it('the work you do pulling equals the rise in stored energy', () => {
    expect(m.you).toBeCloseTo(m.dU, 20);
    expect(integratePull(c, 4 * MM) / m.dU).toBeCloseTo(1, 8);
    expect(m.dU).toBeGreaterThan(0);
  });
});

describe('connected: the voltage stays put', () => {
  const V = 12;
  const c = atVoltage(cap(A, 3 * MM), V);
  it('a third of the gap holds three times the charge', () => {
    const m = pullConnected(c, V, 1 * MM);
    expect(m.after.q / c.q).toBeCloseTo(3, 10);
    expect(voltage(m.after)).toBeCloseTo(V, 10);
  });
  it('pulling apart sends charge back into the battery', () => {
    const m = pullConnected(atVoltage(cap(A, 1 * MM), V), V, 3 * MM);
    expect(m.battery).toBeLessThan(0);
    expect(m.dU).toBeLessThan(0);
    expect(m.you).toBeGreaterThan(0);
  });
  it('the battery takes 2|ΔU|: half from the field, half from your pull', () => {
    const c1 = atVoltage(cap(A, 1 * MM), V);
    const m = pullConnected(c1, V, 3 * MM);
    expect(m.battery / m.dU).toBeCloseTo(2, 10);
    expect(m.you / -m.dU).toBeCloseTo(1, 10);
    // energy is conserved: your work + battery work = change in field energy
    expect(m.you + m.battery).toBeCloseTo(m.dU, 20);
    // and the analytic pull matches the integrated plate force
    expect(integratePull(c1, 3 * MM, V) / m.you).toBeCloseTo(1, 6);
  });
});

describe('beat the battery: 30 V from 12 V', () => {
  it('push to 1.2 mm while connected, open the switch, pull to 3 mm', () => {
    const V = 12;
    const charged = pullConnected(atVoltage(cap(A, 3 * MM), V), V, 1.2 * MM).after;
    const pulled = pullIsolated(charged, 3 * MM).after;
    expect(voltage(pulled)).toBeCloseTo(30, 8);
  });
  it('closing a switch onto a mismatched voltage turns ½ C ΔV² into heat', () => {
    const c = pullIsolated(atVoltage(cap(A, 1 * MM), 12), 3 * MM).after; // 36 V
    const m = connect(c, 12);
    expect(m.heat).toBeCloseTo(0.5 * capacitance(c) * (36 - 12) ** 2, 20);
    expect(m.battery + 0 - m.dU).toBeCloseTo(m.heat, 20);
  });
});

/* Lesson 2 — "Slide in the glass" */

describe('a full slab of glass, disconnected', () => {
  const c = atVoltage(cap(A, 1 * MM, 0, GLASS.kappa, 0), 1000);
  const m = slideIsolated(c, 1);
  it('divides V, E and U by κ: 1000 V → 200 V', () => {
    expect(voltage(m.after)).toBeCloseTo(200, 8);
    expect(field(m.after) / field(c)).toBeCloseTo(1 / GLASS.kappa, 10);
    expect(energy(m.after) / energy(c)).toBeCloseTo(1 / GLASS.kappa, 10);
  });
  it('makes no charge: the free charge on the plate is unchanged', () => {
    expect(m.after.q).toBe(c.q);
    const s = chargeSplit(m.after);
    expect(s.glass + s.air).toBeCloseTo(c.q, 18);
  });
  it('bound charge cancels all but 1/κ of the free charge beside it', () => {
    const s = chargeSplit(m.after);
    expect((s.glass - boundCharge(m.after)) / s.glass).toBeCloseTo(1 / GLASS.kappa, 10);
  });
  it('the capacitor pulls the glass in: the energy falls at every step', () => {
    let prev = energy(c);
    for (let f = 0.05; f <= 1; f += 0.05) {
      const u = energy({ ...c, fill: f });
      expect(u).toBeLessThan(prev);
      prev = u;
    }
  });
});

describe('a full slab of glass, connected', () => {
  it('multiplies Q and U by κ, and the battery pays 2 ΔU', () => {
    const c = atVoltage(cap(A, 1 * MM, 0, GLASS.kappa, 0), 1000);
    const m = slideConnected(c, 1000, 1);
    expect(m.after.q / c.q).toBeCloseTo(GLASS.kappa, 10);
    expect(energy(m.after) / energy(c)).toBeCloseTo(GLASS.kappa, 10);
    expect(m.battery / m.dU).toBeCloseTo(2, 10);
    expect(m.you).toBeLessThan(0); // the slab is pulled in; you hold it back
  });
});

describe('a partial slab: the glass hogs the charge', () => {
  const c = atVoltage(cap(A, 1 * MM, 0, GLASS.kappa, 0), 1000);
  it('covering 1/(κ+1) of the plate puts half the charge beside the glass', () => {
    const f = 1 / (GLASS.kappa + 1);
    const s = chargeSplit(slideIsolated(c, f).after);
    expect(s.glass / (s.glass + s.air)).toBeCloseTo(0.5, 10);
  });
  it('covering half the plate puts κ/(κ+1) of it there: 83%', () => {
    const s = chargeSplit(slideIsolated(c, 0.5).after);
    expect(s.glass / (s.glass + s.air)).toBeCloseTo(5 / 6, 10);
  });
  it('the field is the same beside the glass as beside the air', () => {
    const after = slideIsolated(c, 0.3).after;
    const s = chargeSplit(after);
    const Eair = s.air / (EPS0 * A * 0.7);
    const Eglass = (s.glass - boundCharge(after)) / (EPS0 * A * 0.3);
    expect(Eair).toBeCloseTo(field(after), 2);
    expect(Eglass / Eair).toBeCloseTo(1, 10);
  });
});

describe('the energy lives in the gap', () => {
  it('½ κ ε₀ E² over the gap volume is ½ C V², with or without glass', () => {
    for (const fill of [0, 0.3, 1]) {
      const c = atVoltage(cap(A, 1 * MM, 0, GLASS.kappa, fill), 700);
      expect(fieldEnergy(c) / storedEnergy(capacitance(c), 700)).toBeCloseTo(1, 10);
      expect(energy(c) / storedEnergy(capacitance(c), 700)).toBeCloseTo(1, 10);
    }
  });
});

describe('breakdown caps the field', () => {
  const air = cap(A, 1 * MM);
  const glass = cap(A, 1 * MM, 0, GLASS.kappa, 1);
  it('air sparks at 3 kV across 1 mm, holding only 0.40 mJ', () => {
    expect(sparks(atVoltage(air, 2990))).toBe(false);
    expect(sparks(atVoltage(air, 3010))).toBe(true);
    expect(maxEnergy(A, 1 * MM, 1, AIR_BREAKDOWN) * 1e3).toBeCloseTo(0.398, 3);
  });
  it('glass takes 10 kV and 22 mJ: 55 times what air can hold', () => {
    expect(sparks(atVoltage(glass, 9990))).toBe(false);
    expect(sparks(atVoltage(glass, 10010))).toBe(true);
    const ratio = maxEnergy(A, 1 * MM, GLASS.kappa, GLASS.breakdown) / maxEnergy(A, 1 * MM, 1, AIR_BREAKDOWN);
    expect(ratio).toBeCloseTo(GLASS.kappa * (GLASS.breakdown / AIR_BREAKDOWN) ** 2, 10);
    expect(ratio).toBeGreaterThan(50);
  });
  it('10 mJ is out of reach with air and within reach with glass', () => {
    expect(maxEnergy(A, 1 * MM, 1, AIR_BREAKDOWN)).toBeLessThan(10e-3);
    expect(maxEnergy(A, 1 * MM, GLASS.kappa, GLASS.breakdown)).toBeGreaterThan(10e-3);
  });
  it('energy density ½ε₀E² is 40 J/m³ in air at breakdown', () => {
    expect(energyDensity(AIR_BREAKDOWN)).toBeCloseTo(39.8, 1);
  });
});

describe('defibrillator', () => {
  it('32 µF at 5 kV stores 400 J', () => {
    expect(storedEnergy(32e-6, 5000)).toBeCloseTo(400, 8);
  });
});

describe('si formatting', () => {
  it('prints three figures with a prefix', () => {
    expect(si(531e-12, 'C')).toBe('531 pC');
    expect(si(3.19e-9, 'J')).toBe('3.19 nJ');
    expect(si(12, 'V')).toBe('12.0 V');
    expect(si(0, 'J')).toBe('0 J');
  });
});
