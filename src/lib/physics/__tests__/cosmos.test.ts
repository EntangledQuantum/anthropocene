import { describe, expect, it } from 'vitest';
import {
  CH44_Q, CH44_SHEET, CMB, CMB_STRETCH, H0, SCALES, coastingScale, dist, farthestFrom, flowToBinding, galaxySheet,
  hubbleSpeed, hubbleTimeGyr, meetTimeGyr, peakWavelength, redshiftOf, relativeVelocity,
  rewindDistance, seenFrom, stretchedAbout, stretchedPhotonEnergy, stretchedTemperature,
  stretchedWavelength,
} from '../cosmos.ts';

const SHEET = CH44_SHEET;

describe('no centre: the same law from every home', () => {
  it('from every galaxy, every other recedes at v = H₀ d', () => {
    for (let h = 0; h < SHEET.length; h++) {
      for (const { d, v } of seenFrom(SHEET[h], SHEET)) expect(v).toBeCloseTo(H0 * d, 8);
    }
  });
  it('velocity points straight away from whichever galaxy is home', () => {
    const home = SHEET[3], p = SHEET[20];
    const u = relativeVelocity(home, p);
    const cross = u[0] * (p[1] - home[1]) - u[1] * (p[0] - home[0]);
    expect(Math.abs(cross)).toBeLessThan(1e-6);
    expect(u[0] * (p[0] - home[0]) + u[1] * (p[1] - home[1])).toBeGreaterThan(0);
  });
  it('a uniform stretch about one galaxy is the same stretch about any other, up to a shift', () => {
    const s = 1.3, a = SHEET[0], b = SHEET[17];
    for (const p of SHEET) {
      const fromA = stretchedAbout(a, p, s), fromB = stretchedAbout(b, p, s);
      const shift = [fromA[0] - fromB[0], fromA[1] - fromB[1]];
      expect(shift[0]).toBeCloseTo((1 - s) * (a[0] - b[0]), 9);
      expect(shift[1]).toBeCloseTo((1 - s) * (a[1] - b[1]), 9);
    }
  });
  it('the scene\'s Q is fled fastest from the galaxy farthest from it', () => {
    const q = CH44_Q;
    const f = farthestFrom(q, SHEET);
    const speeds = SHEET.map((h) => hubbleSpeed(dist(h, SHEET[q])));
    expect(speeds.indexOf(Math.max(...speeds))).toBe(f);
    // and clearly so: the runner-up is more than 50 Mpc nearer
    const ds = SHEET.map((h) => dist(h, SHEET[q])).sort((a, b) => b - a);
    expect(ds[0] - ds[1]).toBeGreaterThan(50);
    // the lesson quotes about 480 Mpc and 33,600 km/s
    expect(ds[0]).toBeCloseTo(480, -1);
    expect(hubbleSpeed(ds[0]) / 1000).toBeCloseTo(33.6, 0);
    expect(galaxySheet(7, 5, 420, 300, 43)).toEqual(SHEET);
  });
});

describe('the age: run it backwards', () => {
  it('1/H₀ is about 14 billion years for H₀ = 70 km/s/Mpc', () => {
    expect(hubbleTimeGyr()).toBeCloseTo(13.97, 2);
  });
  it('every pair meets at the same moment, near or far', () => {
    for (const d of [10, 140, 260, 1000]) expect(meetTimeGyr(d, hubbleSpeed(d))).toBeCloseTo(hubbleTimeGyr(), 9);
  });
  it('rewinding at constant speed closes every gap to zero at 1/H₀ and not before', () => {
    const tH = hubbleTimeGyr();
    expect(rewindDistance(140, tH)).toBeCloseTo(0, 9);
    expect(rewindDistance(140, tH - 0.5)).toBeGreaterThan(4);
    expect(rewindDistance(260, tH / 2)).toBeCloseTo(130, 6);
    expect(coastingScale(tH + 3)).toBe(0);
  });
});

describe('light stretches with the sheet', () => {
  it('1 + z is the stretch: light from a sheet half the size arrives at z = 1, twice the wavelength', () => {
    expect(redshiftOf(0.5)).toBeCloseTo(1, 12);
    expect(stretchedWavelength(500, 1 + redshiftOf(0.5))).toBeCloseTo(1000, 9);
  });
  it('each photon keeps 1/(1+z) of its energy', () => {
    expect(stretchedPhotonEnergy(2.4, 2)).toBeCloseTo(1.2, 12);
  });
  it('3000 K light stretched about 1100 times is the 2.7 K microwave sky', () => {
    expect(CMB_STRETCH).toBeCloseTo(1101, 0);
    expect(stretchedTemperature(3000, 1100)).toBeCloseTo(2.73, 2);
  });
  it('its peak moves from the near infrared (about 1 µm) to about 1 mm', () => {
    expect(peakWavelength(CMB.tEmit) * 1e9).toBeCloseTo(966, 0);
    expect(peakWavelength(CMB.tNow) * 1e3).toBeCloseTo(1.063, 2);
    expect(peakWavelength(CMB.tNow) / peakWavelength(CMB.tEmit)).toBeCloseTo(CMB_STRETCH, 6);
  });
});

describe('where the stretching does not apply', () => {
  it('Earth\'s orbit and the Milky Way are held together far more strongly than the flow pulls them apart', () => {
    expect(flowToBinding(SCALES.earthSun.dMpc, SCALES.earthSun.internalKmS)).toBeLessThan(1e-9);
    expect(flowToBinding(SCALES.milkyWay.dMpc, SCALES.milkyWay.internalKmS)).toBeLessThan(0.01);
  });
  it('Andromeda should recede at about 55 km/s by Hubble\'s law, yet it approaches at 110', () => {
    expect(hubbleSpeed(SCALES.andromeda.dMpc)).toBeCloseTo(54.6, 1);
    expect(SCALES.andromeda.measuredKmS).toBeLessThan(0);
  });
  it('the numbers the sort quotes: 3 × 10⁻¹⁰ km/s across 1 au, about 0.6 km/s across the Sun\'s orbit, 21,000 km/s between clusters', () => {
    expect(hubbleSpeed(SCALES.earthSun.dMpc)).toBeCloseTo(3.4e-10, 11);
    expect(hubbleSpeed(SCALES.milkyWay.dMpc)).toBeCloseTo(0.57, 2);
    expect(hubbleSpeed(SCALES.clusters.dMpc)).toBe(21000);
  });
  it('clusters 300 Mpc apart are carried by the flow', () => {
    expect(flowToBinding(SCALES.clusters.dMpc, SCALES.clusters.internalKmS)).toBeGreaterThan(40);
  });
});
