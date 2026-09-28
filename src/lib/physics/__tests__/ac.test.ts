import { describe, expect, it } from 'vitest';
import {
  MAINS, HEATER_R, RADIO, SINGLE, TUNE, abs, angleAt, averagePower, capForFrequency, cx, dcEquivalent, deg, lead,
  polar, qualityFactor, rad, reception, resonantOmega, risingAt, rms, seriesRLC, shadow, simulateSeries,
  singleCurrent, sinePowerInResistor, sub, add, tunedFrequency,
} from '../ac.ts';

const w50 = 2 * Math.PI * 50;

describe('phasors: the shadow of a turning arrow is the sine', () => {
  it('the shadow of V₀∠φ is V₀ sin(ωt + φ) at every instant', () => {
    const p = polar(325, rad(40));
    for (const t of [0, 0.001, 0.0037, 0.012, 0.019]) {
      expect(shadow(p, w50, t)).toBeCloseTo(325 * Math.sin(w50 * t + rad(40)), 9);
    }
  });

  it('adding two sines of one frequency is adding their arrows', () => {
    const a = polar(3, rad(10)), b = polar(4, rad(100));
    const s = add(a, b);
    for (const t of [0, 0.002, 0.0071, 0.013]) {
      expect(shadow(s, w50, t)).toBeCloseTo(shadow(a, w50, t) + shadow(b, w50, t), 9);
    }
    expect(abs(s)).toBeCloseTo(5, 9); // 90° apart: 3-4-5, not 7
  });

  it('+162 V appears twice a cycle; falling is the one at 150°, rising at 30°', () => {
    expect(deg(angleAt(MAINS.peak / 2, MAINS.peak, true))).toBeCloseTo(150, 9);
    expect(deg(angleAt(MAINS.peak / 2, MAINS.peak, false))).toBeCloseTo(30, 9);
    expect(risingAt(rad(30))).toBe(true);
    expect(risingAt(rad(150))).toBe(false);
  });
});

describe('capacitor and coil: the quarter cycle', () => {
  it('a capacitor’s current leads its voltage by exactly 90°', () => {
    expect(deg(lead(singleCurrent('capacitor'), cx(SINGLE.V0)))).toBeCloseTo(90, 9);
  });

  it('…and the same from i = C dv/dt, differentiated numerically: the current peaks a quarter period early', () => {
    const T = 1 / SINGLE.hz, n = 4000, h = T / n;
    const v = (t: number) => SINGLE.V0 * Math.sin(w50 * t);
    const i = (t: number) => SINGLE.C * (v(t + h) - v(t - h)) / (2 * h);
    let tv = 0, ti = 0, vm = -Infinity, im = -Infinity;
    for (let k = 0; k < n; k++) {
      const t = k * h;
      if (v(t) > vm) { vm = v(t); tv = t; }
      if (i(t) > im) { im = i(t); ti = t; }
    }
    expect((tv - ti) / T).toBeCloseTo(0.25, 3);
    expect(im).toBeCloseTo(abs(singleCurrent('capacitor')), 5);
    // at the voltage peak the current is zero
    expect(Math.abs(i(tv))).toBeLessThan(1e-3 * im);
  });

  it('a coil’s current lags its voltage by exactly 90°', () => {
    expect(deg(lead(singleCurrent('inductor'), cx(SINGLE.V0)))).toBeCloseTo(-90, 9);
  });

  it('a resistor’s current is in step', () => {
    expect(deg(lead(singleCurrent('resistor'), cx(SINGLE.V0)))).toBeCloseTo(0, 9);
  });

  it('both scene elements carry about 31 mA peak', () => {
    expect(abs(singleCurrent('capacitor')) * 1000).toBeCloseTo(31.4, 1);
    expect(abs(singleCurrent('inductor')) * 1000).toBeCloseTo(31.8, 1);
  });
});

describe('RMS, integrated numerically', () => {
  it('the RMS of a sine is peak/√2', () => {
    for (const V0 of [1, 10, 325]) {
      expect(rms((t) => V0 * Math.sin(w50 * t + 0.3), 1 / 50)).toBeCloseTo(V0 / Math.SQRT2, 9);
    }
  });

  it('230 V mains peaks at 325 V, and a 325 V-peak sine heats like 230 V DC', () => {
    expect(MAINS.peak).toBeCloseTo(325.3, 1);
    expect(dcEquivalent(MAINS.peak)).toBeCloseTo(230, 6);
    expect(sinePowerInResistor(MAINS.peak, HEATER_R, 50)).toBeCloseTo(529, 6);
  });

  it('the tempting answers are wrong: the mean of |sin| (207 V) and half the peak (163 V) under-heat', () => {
    const p230 = sinePowerInResistor(MAINS.peak, HEATER_R, 50);
    const meanAbs = (2 / Math.PI) * MAINS.peak;
    expect(meanAbs).toBeCloseTo(207, 0);
    expect(meanAbs ** 2 / HEATER_R).toBeLessThan(0.85 * p230);
    expect(MAINS.peak ** 2 / HEATER_R).toBeCloseTo(2 * p230, 6); // the peak doubles it
  });

  it('a capacitor on the mains takes no average power; a heater takes V_rms·I_rms', () => {
    const T = 1 / 50;
    const v = (t: number) => MAINS.peak * Math.sin(w50 * t);
    const I = singleCurrent('capacitor', { V0: MAINS.peak, hz: 50, C: 13.84e-6, L: 1 });
    const iC = (t: number) => shadow(I, w50, t);
    expect(Math.abs(averagePower(v, iC, T))).toBeLessThan(1e-9);
    expect(abs(I) / Math.SQRT2).toBeCloseTo(1.0, 2); // about 1 A rms
    expect(averagePower(v, (t) => v(t) / HEATER_R, T)).toBeCloseTo(230 * 2.3, 6);
  });
});

describe('series RLC resonance', () => {
  const w0 = resonantOmega(TUNE.L, TUNE.C);

  it('resonance sits at 1/√(LC): ω₀ = 10⁴ rad/s, f₀ ≈ 1592 Hz', () => {
    expect(w0).toBeCloseTo(1e4, 6);
    expect(w0 / (2 * Math.PI)).toBeCloseTo(1591.5, 1);
  });

  it('the current peaks there, found by scanning the frequency', () => {
    let best = 0, bestW = 0;
    for (let w = 2000; w <= 30000; w += 1) {
      const i = abs(seriesRLC(TUNE, TUNE.Vs, w).I);
      if (i > best) { best = i; bestW = w; }
    }
    expect(Math.abs(bestW - w0)).toBeLessThanOrEqual(1);
    expect(best).toBeCloseTo(TUNE.Vs / TUNE.R, 9); // Z = R: 125 mA
  });

  it('at ω₀ the phase is zero, and V_L and V_C are equal and opposite', () => {
    const r = seriesRLC(TUNE, TUNE.Vs, w0);
    expect(r.phase).toBeCloseTo(0, 9);
    expect(abs(r.VL)).toBeCloseTo(abs(r.VC), 9);
    expect(abs(add(r.VL, r.VC))).toBeLessThan(1e-9);
    expect(abs(sub(r.VR, cx(TUNE.Vs)))).toBeLessThan(1e-9); // the lamp gets the whole supply
  });

  it('with Q > 1, the coil and the capacitor each exceed the supply: Q × 10 V = 50 V', () => {
    expect(qualityFactor(TUNE)).toBeCloseTo(5, 9);
    const r = seriesRLC(TUNE, TUNE.Vs, w0);
    expect(abs(r.VC)).toBeCloseTo(50, 9);
    expect(abs(r.VL)).toBeGreaterThan(TUNE.Vs);
    expect(abs(r.VC)).toBeGreaterThan(TUNE.Vs);
  });

  it('…but with Q < 1 they do not', () => {
    const lossy = { ...TUNE, R: 800 };
    expect(qualityFactor(lossy)).toBeLessThan(1);
    expect(abs(seriesRLC(lossy, TUNE.Vs, w0).VC)).toBeLessThan(TUNE.Vs);
  });

  it('below resonance the capacitor dominates and the current leads; above, the coil and it lags', () => {
    expect(seriesRLC(TUNE, TUNE.Vs, 0.5 * w0).phase).toBeGreaterThan(0);
    expect(seriesRLC(TUNE, TUNE.Vs, 2 * w0).phase).toBeLessThan(0);
  });

  it('the real circuit, stepped in time, agrees: 50 V across C at resonance, current in step', () => {
    const peak = TUNE.Vs * Math.SQRT2;
    const sim = simulateSeries(TUNE, peak, w0);
    expect(sim.vcPeak / Math.SQRT2).toBeCloseTo(50, 1);
    expect(sim.iPeak / Math.SQRT2).toBeCloseTo(0.125, 3);
    expect(Math.abs(deg(sim.currentLead))).toBeLessThan(1.5);
    const off = simulateSeries(TUNE, peak, 1.3 * w0);
    expect(off.vcPeak).toBeCloseTo(abs(seriesRLC(TUNE, peak, 1.3 * w0).VC), 1);
    expect(deg(off.currentLead)).toBeCloseTo(deg(seriesRLC(TUNE, peak, 1.3 * w0).phase), 0);
  });
});

describe('the radio tuner', () => {
  it('the dial covers the AM band', () => {
    expect(tunedFrequency(RADIO.cMax)).toBeLessThan(0.5e6);
    expect(tunedFrequency(RADIO.cMin)).toBeGreaterThan(1.55e6);
  });

  it('halving the frequency takes four times the capacitance, not two', () => {
    const c12 = capForFrequency(1.2e6), c06 = capForFrequency(0.6e6);
    expect(c06 / c12).toBeCloseTo(4, 9);
    expect(c12 * 1e12).toBeCloseTo(70.4, 1);
    expect(c06 * 1e12).toBeCloseTo(281.4, 1);
  });

  it('tuned to a station, its neighbours are nearly silent', () => {
    const c = capForFrequency(0.6e6);
    expect(reception(0.6e6, c)).toBeCloseTo(1, 9);
    for (const f of RADIO.stations.filter((s) => s !== 0.6e6)) expect(reception(f, c)).toBeLessThan(0.12);
  });

  it('twice the capacitance (the tempting guess) lands on the 0.85 MHz station, not 0.6', () => {
    const c = 2 * capForFrequency(1.2e6);
    expect(tunedFrequency(c) / 1e6).toBeCloseTo(0.849, 2);
    expect(reception(0.85e6, c)).toBeGreaterThan(0.9);
    expect(reception(0.6e6, c)).toBeLessThan(0.1);
  });
});
