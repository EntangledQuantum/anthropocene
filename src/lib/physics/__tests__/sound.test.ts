/**
 * Claims made by chapter 16, "Sound and Hearing", checked against the code
 * the ShuffleTheAir, PourToBoom, WhistlePass, RingTheGlass and KillTheThrob
 * scenes run.
 */
import { describe, expect, it } from 'vitest';
import {
  B_AIR, BOOM_TUBE, CROWD_WAVE, RHO_AIR, RIDER_FORK, V_AIR, WHISTLE,
  beatEnvelope, beatEnvelopeAtPhase, beatFrequency, closedPipeHarmonics, closedTubeDisplacement, closedTubeResonantLengths,
  closedTubeResponse, crests, displacement, dopplerShift, emissionLag, heardFrequency, idealGasSoundSpeed,
  listenerSpeedFor, openPipeHarmonics, pressure, pressureAmplitude, resonatorAmplitude, riderForkFrequency,
  riderPositionFor, sourceSpeedFor, speedOfSound, superpose, wavelength, wavelengthAhead, wavelengthBehind,
  type Pass,
} from '../sound.ts';

describe('the medium sets the speed', () => {
  it('air: √(B/ρ) with the adiabatic bulk modulus gives the quoted 343 m/s', () => {
    expect(speedOfSound(B_AIR, RHO_AIR)).toBeCloseTo(V_AIR, -0.5); // within ±1.5 m/s
    expect(Math.abs(speedOfSound(B_AIR, RHO_AIR) - V_AIR)).toBeLessThan(1.5);
  });
  it('ideal gas: air at 20 °C ≈ 343 m/s, helium ≈ 1007 m/s, about three times faster', () => {
    const air = idealGasSoundSpeed(293.15, 0.02897, 1.4);
    const he = idealGasSoundSpeed(293.15, 0.004003, 5 / 3);
    expect(Math.abs(air - 343)).toBeLessThan(1.5);
    expect(Math.abs(he - 1007)).toBeLessThan(3);
    expect(he / air).toBeGreaterThan(2.9);
  });
});

describe('pressure and displacement are a quarter wave out of step', () => {
  const w = CROWD_WAVE;
  const lam = wavelength(w.f, w.v);

  it('the scene note has a 2 m wavelength and a loud but ordinary pressure amplitude', () => {
    expect(lam).toBeCloseTo(2, 10);
    expect(pressureAmplitude(w)).toBeGreaterThan(8);
    expect(pressureAmplitude(w)).toBeLessThan(10);
    // B·k·s₀ is the same as ρ·v·ω·s₀ when v = √(B/ρ)
    const v = speedOfSound(B_AIR, RHO_AIR);
    const wv = { ...w, v };
    expect(pressureAmplitude(wv)).toBeCloseTo(RHO_AIR * v * 2 * Math.PI * w.f * w.s0, 8);
  });

  it('p = −B ∂s/∂x, measured by finite differences of the displacement', () => {
    const h = 1e-6;
    for (const [x, t] of [[0.1, 0], [0.73, 0.001], [1.6, 0.0042]]) {
      const dsdx = (displacement(w, x + h, t) - displacement(w, x - h, t)) / (2 * h);
      expect(pressure(w, x, t)).toBeCloseTo(-B_AIR * dsdx, 3);
    }
  });

  it('where the air has moved farthest, the pressure is normal; the squeeze sits where the displacement crosses zero', () => {
    const t = 0.0013;
    const xs = Array.from({ length: 4001 }, (_, i) => (i / 4000) * lam);
    const sMaxAt = xs.reduce((a, b) => (Math.abs(displacement(w, b, t)) > Math.abs(displacement(w, a, t)) ? b : a));
    const pMaxAt = xs.reduce((a, b) => (pressure(w, b, t) > pressure(w, a, t) ? b : a));
    expect(Math.abs(pressure(w, sMaxAt, t))).toBeLessThan(0.01 * pressureAmplitude(w));
    expect(Math.abs(displacement(w, pMaxAt, t))).toBeLessThan(0.01 * w.s0);
    const gap = Math.abs(sMaxAt - pMaxAt) % (lam / 2);
    expect(Math.min(gap, lam / 2 - gap)).toBeCloseTo(lam / 4, 2);
  });

  it('each parcel only oscillates about home: its mean displacement over a period is zero', () => {
    const N = 1000, T = 1 / w.f;
    let sum = 0;
    for (let i = 0; i < N; i++) sum += displacement(w, 1.234, (i / N) * T);
    expect(Math.abs(sum / N)).toBeLessThan(1e-12);
  });
});

describe('pipes: which patterns fit', () => {
  it('closed at one end: only odd multiples of v/4L', () => {
    const h = closedPipeHarmonics(1, 340, 4);
    expect(h).toEqual([85, 255, 425, 595]);
  });
  it('open at both ends: every multiple of v/2L', () => {
    expect(openPipeHarmonics(1, 340, 4)).toEqual([170, 340, 510, 680]);
  });
  it('the Classify step: a clarinet (closed) and a flute (open) sharing a 150 Hz floor', () => {
    const clarinet = closedPipeHarmonics(V_AIR / (4 * 150), V_AIR, 4).map((f) => Math.round(f));
    const flute = openPipeHarmonics(V_AIR / (2 * 150), V_AIR, 7).map((f) => Math.round(f));
    expect(clarinet).toEqual([150, 450, 750, 1050]);
    expect(flute).toEqual([150, 300, 450, 600, 750, 900, 1050]);
    for (const f of [300, 600, 900]) expect(clarinet).not.toContain(f);
    // the flute's tube is twice as long for the same lowest note
    expect((V_AIR / (2 * 150)) / (V_AIR / (4 * 150))).toBeCloseTo(2, 12);
  });

  const { f, v, alpha, height } = BOOM_TUBE;
  it('the 440 Hz tube booms at 19.5 cm and 58.5 cm: one and three quarter-waves', () => {
    const Ls = closedTubeResonantLengths(f, v, height);
    expect(Ls.length).toBe(2);
    expect(Ls[0]).toBeCloseTo(0.1949, 3);
    expect(Ls[1]).toBeCloseTo(0.5847, 3);
    expect(Ls[1] / Ls[0]).toBeCloseTo(3, 10);
  });

  it('the lossy response peaks at those lengths, and is weak half-way between (a half-wave column)', () => {
    const scan = Array.from({ length: 6801 }, (_, i) => 0.02 + (i / 6800) * 0.68);
    const r = scan.map((L) => closedTubeResponse(L, f, v, alpha));
    const peaks = scan.filter((_, i) => i > 0 && i < scan.length - 1 && r[i] > r[i - 1] && r[i] > r[i + 1] && r[i] > 2);
    expect(peaks.length).toBe(2);
    expect(Math.abs(peaks[0] - 0.1949)).toBeLessThan(0.002);
    expect(Math.abs(peaks[1] - 0.5847)).toBeLessThan(0.004); // loss nudges the broad second peak
    const halfWave = v / (2 * f);
    expect(closedTubeResponse(halfWave, f, v, alpha)).toBeLessThan(0.25); // vs ~10 at the first boom
    // the shorter column booms louder (less air to lose energy in)
    expect(closedTubeResponse(peaks[0], f, v, alpha)).toBeGreaterThan(closedTubeResponse(peaks[1], f, v, alpha));
  });

  it('the grading window: inside ±1.5 cm of 19.5 cm the tube is at least 3× its 1/8-wave response; 5 cm away it is under 2.5×', () => {
    const L1 = v / (4 * f);
    expect(closedTubeResponse(L1 + BOOM_TUBE.tolerance, f, v, alpha)).toBeGreaterThan(3);
    expect(closedTubeResponse(L1 - BOOM_TUBE.tolerance, f, v, alpha)).toBeGreaterThan(3);
    expect(closedTubeResponse(L1 + 0.05, f, v, alpha)).toBeLessThan(2.5);
  });

  it('the water is a displacement node and the mouth an antinode at resonance', () => {
    const L1 = v / (4 * f);
    expect(closedTubeDisplacement(0, L1, f, v, alpha)).toBe(0);
    const ys = Array.from({ length: 101 }, (_, i) => (i / 100) * L1);
    const amps = ys.map((y) => closedTubeDisplacement(y, L1, f, v, alpha));
    for (let i = 1; i < amps.length; i++) expect(amps[i]).toBeGreaterThan(amps[i - 1]);
  });
});

describe('Doppler: the medium is the stage', () => {
  const { f, v, glass } = WHISTLE;

  it('on the line of approach, f′ = f(v + v_L)/(v − v_S)', () => {
    expect(dopplerShift(f, v, 0, 0)).toBe(f);
    expect(dopplerShift(f, v, 40, 0)).toBeCloseTo(792.4, 1);
    expect(dopplerShift(f, v, -40, 0)).toBeCloseTo(626.9, 1);
  });

  it('to hear 800 Hz, a source must approach at 42.9 m/s but a listener must ride at 49.0 m/s', () => {
    const us = sourceSpeedFor(f, glass, v);
    const uL = listenerSpeedFor(f, glass, v);
    expect(us).toBeCloseTo(42.875, 3);
    expect(uL).toBeCloseTo(49.0, 3);
    expect(dopplerShift(f, v, us, 0)).toBeCloseTo(glass, 9);
    expect(dopplerShift(f, v, 0, uL)).toBeCloseTo(glass, 9);
    expect(uL).toBeGreaterThan(us);
  });

  it('a moving source changes the wavelength in the air; a moving listener does not', () => {
    const us = sourceSpeedFor(f, glass, v);
    expect(wavelengthAhead(f, v, us)).toBeLessThan(wavelength(f, v));
    expect(wavelengthBehind(f, v, us)).toBeGreaterThan(wavelength(f, v));
    // crests the scene draws, one every 100 periods, ahead of the source along the track
    const p: Pass = { f, v, u: us, x0: -300, d: 0 };
    const t = 3;
    const src = p.x0 + p.u * t;
    const ahead = crests(p, t, 100, 400).map((c) => c.cx + c.r).filter((x) => x > src).sort((a, b) => a - b);
    expect(ahead[1] - ahead[0]).toBeCloseTo(100 * wavelengthAhead(f, v, us), 6);
    const still = crests({ ...p, u: 0 }, t, 100, 400).map((c) => c.cx + c.r).sort((a, b) => a - b);
    expect(still[1] - still[0]).toBeCloseTo(100 * wavelength(f, v), 6);
  });

  it('the emission lag solves v·τ = distance from where the source was', () => {
    const p: Pass = { f, v, u: 40, x0: -450, d: 30 };
    for (const t of [0, 5, 11.25, 14]) {
      const tau = emissionLag(p, t);
      const xe = p.x0 + p.u * (t - tau);
      expect(v * tau).toBeCloseTo(Math.hypot(xe, p.d), 8);
    }
  });

  it('approaching, the pitch is high and steady: it does not rise as the train gets closer', () => {
    const p: Pass = { f, v, u: WHISTLE.passSpeed, x0: -450, d: WHISTLE.passDistance };
    const passAt = 450 / p.u; // the train is abreast of you at 11.25 s
    const far = heardFrequency(p, 1);       // ~400 m away
    const nearer = heardFrequency(p, passAt - 5); // ~200 m away
    expect(nearer).toBeLessThanOrEqual(far);          // never rises
    expect(Math.abs(nearer - far) / far).toBeLessThan(0.005);
    expect(far).toBeCloseTo(dopplerShift(f, v, p.u, 0), -1);
    // and over the whole pass it only ever falls
    let last = Infinity;
    for (let t = 0; t <= 22; t += 0.01) {
      const h = heardFrequency(p, t);
      expect(h).toBeLessThanOrEqual(last + 1e-9);
      last = h;
    }
    // the true pitch is heard after the train is abreast, when its sound from abreast arrives
    const tTrue = passAt + p.d / v;
    expect(heardFrequency(p, tTrue)).toBeCloseTo(f, 6);
  });

  it('the glass rings only near 800 Hz: ±3 m/s of the right speed', () => {
    const us = sourceSpeedFor(f, glass, v);
    const ring = (u: number) => resonatorAmplitude(dopplerShift(f, v, u, 0), glass, WHISTLE.Q);
    expect(ring(us)).toBeCloseTo(WHISTLE.Q, 0);
    expect(ring(us + 2.5)).toBeGreaterThan(WHISTLE.Q / Math.SQRT2);
    expect(ring(us - 2.5)).toBeGreaterThan(WHISTLE.Q / Math.SQRT2);
    expect(ring(us - 8)).toBeLessThan(WHISTLE.Q / 2);
    expect(ring(0)).toBeLessThan(5);
  });
});

describe('beats', () => {
  it('the sum of two tones equals a slow envelope times a fast carrier', () => {
    const f1 = 440, f2 = 443;
    for (const t of [0.01, 0.123, 0.4567]) {
      const product = 2 * Math.cos(Math.PI * (f1 - f2) * t) * Math.cos(Math.PI * (f1 + f2) * t);
      expect(superpose(f1, f2, t)).toBeCloseTo(product, 10);
      expect(Math.abs(superpose(f1, f2, t))).toBeLessThanOrEqual(beatEnvelope(f1, f2, t) + 1e-12);
    }
  });

  it('the running-phase envelope matches the closed form for a steady pair', () => {
    for (const t of [0.05, 0.31, 1.7]) {
      expect(beatEnvelopeAtPhase(2 * Math.PI * (440 - 443.5) * t)).toBeCloseTo(beatEnvelope(440, 443.5, t), 12);
    }
  });

  it('counting the quiet moments of the sampled sum over 4 s gives |f₁ − f₂| per second', () => {
    const f1 = 440, f2 = 443;
    const dt = 1 / 44100, win = Math.round(1 / 440 / dt) + 2;
    const s: number[] = [];
    for (let i = 0; i < 4 * 44100; i++) s.push(Math.abs(superpose(f1, f2, i * dt)));
    // loudness over one carrier period, then count its local minima below 0.2
    const loud: number[] = [];
    for (let i = 0; i + win < s.length; i += win) loud.push(Math.max(...s.slice(i, i + win)));
    let quiet = 0;
    for (let i = 1; i < loud.length - 1; i++) if (loud[i] < 0.2 && loud[i] <= loud[i - 1] && loud[i] <= loud[i + 1]) quiet++;
    expect(quiet).toBe(4 * beatFrequency(f1, f2));
  });

  it('the rider fork: 444.5 Hz bare, 432 Hz at the tip, falling steadily between', () => {
    const { f0, mu, reference } = RIDER_FORK;
    expect(riderForkFrequency(f0, 0, mu)).toBe(f0);
    expect(riderForkFrequency(f0, 1, mu)).toBeCloseTo(432, 9);
    let last = Infinity;
    for (let xi = 0; xi <= 1; xi += 0.01) {
      const fr = riderForkFrequency(f0, xi, mu);
      expect(fr).toBeLessThan(last + 1e-12);
      last = fr;
    }
    // starting at ξ = 0.25 the forks throb about 4.3 times a second
    expect(beatFrequency(riderForkFrequency(f0, 0.25, mu), reference)).toBeCloseTo(4.35, 1);
    // the throb vanishes about 69% of the way up the tine, and returns beyond it
    const xi440 = riderPositionFor(f0, mu, reference);
    expect(xi440).toBeCloseTo(0.692, 2);
    expect(beatFrequency(riderForkFrequency(f0, 0.95, mu), reference)).toBeGreaterThan(6);
  });
});
