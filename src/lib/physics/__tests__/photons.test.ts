import { describe, expect, it } from 'vitest';
import {
  COMPTON, COMPTON_LAMBDA, C_LIGHT, E_CHARGE, H, HC_EV_NM, MERCURY_LINES, METALS, SLITS,
  classicalSoakTime, comptonEvent, comptonShift, cutoffNm, darkStripesMm, electronRate, emits,
  fire, firedShare, frequencyOf, kMaxEv, lineFit, makePattern, photocurrent, photonEnergyEv,
  photonRate, planckFromPoints, rng, sampleArrival, screenIntensity, shareOf, stoppingVoltage,
  stripeSpacingMm,
} from '../photons.ts';

const Na = METALS.sodium.phi;

describe('photon energy', () => {
  it('E = hf: a 1240 nm photon carries 1 eV', () => {
    expect(HC_EV_NM).toBeCloseTo(1239.84, 2);
    expect(photonEnergyEv(1239.84198)).toBeCloseTo(1, 6);
  });
  it('bluer light carries more per photon', () => {
    expect(photonEnergyEv(400)).toBeGreaterThan(photonEnergyEv(650));
  });
});

describe('the photoelectric threshold', () => {
  it("sodium's cutoff is green, about 525 nm", () => {
    expect(cutoffNm(Na)).toBeCloseTo(525.4, 0);
  });
  it('no electrons below threshold at any intensity', () => {
    for (const nm of [530, 589, 650, 700]) {
      for (const P of [1e-9, 1e-6, 1e-3, 1, 1e3]) expect(electronRate(P, nm, Na)).toBe(0);
    }
  });
  it('above threshold, emission starts at any intensity, however dim', () => {
    expect(electronRate(1e-12, 400, Na)).toBeGreaterThan(0);
  });
  it('maximum kinetic energy is independent of intensity', () => {
    // K_max takes no power argument; check the stopping point of the current too.
    const v0 = stoppingVoltage(405, Na);
    for (const P of [1e-7, 1e-5, 1e-3]) {
      expect(photocurrent(v0 - 1e-3, P, 405, Na)).toBeGreaterThan(0);
      expect(photocurrent(v0, P, 405, Na)).toBe(0);
      expect(photocurrent(v0 + 0.5, P, 405, Na)).toBe(0);
    }
  });
  it('the number of electrons scales with intensity', () => {
    const r1 = electronRate(1e-6, 405, Na), r10 = electronRate(1e-5, 405, Na);
    expect(r10 / r1).toBeCloseTo(10, 10);
    expect(photonRate(2e-6, 405) / photonRate(1e-6, 405)).toBeCloseTo(2, 10);
  });
  it('K_max = hf − φ: violet on sodium gives 0.70 eV', () => {
    expect(kMaxEv(404.7, Na)).toBeCloseTo(3.064 - 2.36, 2);
  });
});

describe('the stopping-voltage line', () => {
  const pts = MERCURY_LINES.filter((l) => emits(l.nm, Na)).map((l) => [frequencyOf(l.nm), stoppingVoltage(l.nm, Na)] as const);
  it('three mercury lines free electrons from sodium, the green and yellow do not', () => {
    expect(pts.length).toBe(3);
    expect(emits(546.1, Na)).toBe(false);
  });
  it('slope is h/e to 1e-6', () => {
    const { slope } = lineFit(pts);
    expect(Math.abs(slope / (H / E_CHARGE) - 1)).toBeLessThan(1e-6);
    expect(Math.abs(planckFromPoints(pts) / H - 1)).toBeLessThan(1e-6);
  });
  it('intercept is −φ: every metal gives a parallel line', () => {
    for (const m of [METALS.cesium, METALS.sodium, METALS.calcium]) {
      const p = [300, 330, 360].map((nm) => [frequencyOf(nm), stoppingVoltage(nm, m.phi)] as const);
      const f = lineFit(p);
      expect(f.intercept).toBeCloseTo(-m.phi, 6);
      expect(f.slope / (H / E_CHARGE)).toBeCloseTo(1, 6);
    }
  });
});

describe('the wave model is too slow', () => {
  it('dim light soaking into an atom-sized patch takes about an hour', () => {
    const t = classicalSoakTime(1e-3, 0.3e-9, Na);
    expect(t).toBeGreaterThan(3000);
    expect(t).toBeLessThan(6000);
  });
});

describe('photons through two slits', () => {
  const both = makePattern('both');
  const one = makePattern('A');

  it('bright stripes are λL/d apart, dark stripes between', () => {
    expect(stripeSpacingMm()).toBeCloseTo(2.532, 3);
    const dark = darkStripesMm();
    expect(Math.min(...dark.filter((y) => y > 0))).toBeCloseTo(1.266, 2);
    expect(Math.max(...dark.filter((y) => y < 0))).toBeCloseTo(-1.266, 2);
    for (const y of dark) expect(screenIntensity(y, 'both')).toBeLessThan(1e-20);
  });

  it('the histogram of arrivals converges to the intensity (KS test, seeded)', () => {
    const r = rng(38);
    const N = 20000;
    const xs = Array.from({ length: N }, () => sampleArrival(both, r())).sort((a, b) => a - b);
    let D = 0;
    for (let i = 0; i < N; i++) {
      const F = shareOf(both, -SLITS.screenMm, xs[i]);
      D = Math.max(D, Math.abs(F - (i + 1) / N), Math.abs(F - i / N));
    }
    expect(D).toBeLessThan(1.36 / Math.sqrt(N)); // 95% critical value
  });

  it('binned counts match expected counts (chi-square, seeded)', () => {
    const r = rng(7);
    const N = 50000, B = 60, Y = SLITS.screenMm;
    const counts = new Array(B).fill(0);
    for (let i = 0; i < N; i++) {
      const y = sampleArrival(both, r());
      counts[Math.min(B - 1, Math.floor(((y + Y) / (2 * Y)) * B))]++;
    }
    let chi2 = 0, dof = 0;
    for (let b = 0; b < B; b++) {
      const e = N * shareOf(both, -Y + (b * 2 * Y) / B, -Y + ((b + 1) * 2 * Y) / B);
      if (e < 5) continue;
      chi2 += (counts[b] - e) ** 2 / e; dof++;
    }
    // generous bound: mean dof, sd sqrt(2 dof); allow 4 sd
    expect(chi2).toBeLessThan(dof + 4 * Math.sqrt(2 * dof));
  });

  it('a narrow counter on a dark stripe catches almost nothing', () => {
    const y = darkStripesMm().find((v) => v > 0)!;
    expect(1000 * firedShare(both, y - 0.15, y + 0.15)).toBeLessThan(1);
    expect(1000 * firedShare(both, -0.15, 0.15)).toBeGreaterThan(30);
  });

  it('covering one slit makes photons arrive where none arrived before', () => {
    const y = darkStripesMm().find((v) => v > 0)!;
    const withBoth = firedShare(both, y - 0.15, y + 0.15);
    const withOne = firedShare(one, y - 0.15, y + 0.15);
    expect(withOne).toBeGreaterThan(10 * withBoth);
    // and the seeded run agrees
    const r = rng(1);
    const hits = fire(one, 20000, r).filter((v) => v !== null && Math.abs(v - y) <= 0.15).length;
    expect(hits).toBeGreaterThan(20000 * withOne * 0.7);
    expect(hits).toBeLessThan(20000 * withOne * 1.3);
  });

  it('with one slit covered, half the fired photons are absorbed', () => {
    const shots = fire(one, 10000, rng(3));
    const blocked = shots.filter((v) => v === null).length;
    expect(Math.abs(blocked / 10000 - 0.5)).toBeLessThan(0.02);
  });
});

describe('Compton scattering', () => {
  it('the shift at 90° is the Compton wavelength, 2.43 pm, whatever λ', () => {
    expect(COMPTON_LAMBDA).toBeCloseTo(2.426e-12, 14);
    expect(comptonShift(Math.PI / 2)).toBeCloseTo(COMPTON_LAMBDA, 20);
    for (const lam of [20e-12, 71.1e-12, 150e-12]) {
      expect(comptonEvent(lam, Math.PI / 2).lambdaOut - lam).toBeCloseTo(COMPTON_LAMBDA, 20);
    }
  });
  it('momentum and energy are both conserved (relativistic electron)', () => {
    for (const th of [0.3, Math.PI / 2, 2.5]) {
      const ev = comptonEvent(COMPTON.lambda, th);
      expect(ev.pOut[0] + ev.pE[0]).toBeCloseTo(ev.pIn[0], 35);
      expect(ev.pOut[1] + ev.pE[1]).toBeCloseTo(0, 35);
      expect(Math.abs(ev.eInKeV - ev.eOutKeV - ev.electronKeV) / ev.electronKeV).toBeLessThan(1e-6);
    }
  });
  it('molybdenum Kα at 90°: the electron takes about 0.57 keV', () => {
    const ev = comptonEvent(COMPTON.lambda, COMPTON.theta);
    expect(ev.eInKeV).toBeCloseTo(17.44, 1);
    expect(ev.electronKeV).toBeCloseTo(0.57, 1);
    expect(C_LIGHT).toBe(299792458);
  });
});
