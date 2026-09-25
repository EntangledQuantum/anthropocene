/**
 * Claims made by chapter 18, "Thermal Properties of Matter" (matter as
 * particles), checked against the hard-disc gas the HeatTheBox,
 * SqueezeThePiston, SpreadTheSpeeds and MixTheGases scenes run.
 *
 * Every run is seeded, so these are deterministic. Tolerances are set from
 * the statistical noise of a few hundred particles, not tuned to pass.
 */
import { describe, expect, it } from 'vitest';
import {
  AIR_BOX, MASS, MIX_BOX, SPREAD_BOX, WALL,
  areaFraction, boxPressure, boyleVolumeFraction, celsiusForPressureRatio, collidePair, createGas,
  equalKESpeed, gasConstant, hardDiscZ, heatingPressureRatio, histogram, idealPressure2D, kineticEnergy,
  ksDistance, mbCdf2D, mbDensity2D, meanKE, meanSpeed, meanSpeed2D, mostProbableSpeed2D, pistonLedger,
  resetTally, rmsSpeed2D, rmsSpeed3D, runGas, setPiston, speeds, temperature, temperatureOfSpeed,
  thermostat, toKPa, wallPressure, type Gas,
} from '../gas.ts';

const air = (seed = 3, radius: number = AIR_BOX.radius, mass: number = AIR_BOX.mass): Gas => createGas({
  w: AIR_BOX.w, h: AIR_BOX.h, seed,
  species: [{ count: AIR_BOX.count, mass, radius, T: AIR_BOX.T }],
});

function momentumOf(g: Gas): [number, number] {
  let px = 0, py = 0;
  for (let i = 0; i < g.n; i++) { px += g.m[i] * g.vx[i]; py += g.m[i] * g.vy[i]; }
  return [px, py];
}

/** Settle, then tally the walls for `span` ps. */
function measure(g: Gas, span: number, dt = 0.04) {
  runGas(g, 100, dt);
  resetTally(g);
  runGas(g, span, dt);
  return { P: boxPressure(g), ...pistonLedger(g) };
}

/** Time-average of f(g) over `span` ps, sampled every `every` ps. */
function timeAverage(g: Gas, span: number, every: number, f: (g: Gas) => number, dt = 0.02): number {
  let s = 0, n = 0;
  for (let t = 0; t < span; t += every) { runGas(g, every, dt); s += f(g); n++; }
  return s / n;
}

/* ── the collision ─────────────────────────────────────────────────────── */

describe('a disc–disc collision', { timeout: 60_000 }, () => {
  it('conserves momentum and kinetic energy exactly, for any masses and angles', () => {
    for (const [m1, m2] of [[4, 40], [28, 28], [1, 131]]) for (const angle of [0, 0.4, 1.1, 2.5]) {
      const g = createGas({ w: 10, h: 10, seed: 1, species: [{ count: 1, mass: m1, radius: 0.1, speed: 0 }, { count: 1, mass: m2, radius: 0.1, speed: 0 }] });
      g.x[0] = 5; g.y[0] = 5; g.x[1] = 5 + 0.19 * Math.cos(angle); g.y[1] = 5 + 0.19 * Math.sin(angle);
      g.vx[0] = 0.7; g.vy[0] = 0.2; g.vx[1] = -0.3; g.vy[1] = -0.5;
      const p0 = momentumOf(g), ke0 = kineticEnergy(g);
      collidePair(g, 0, 1);
      const p1 = momentumOf(g);
      expect(p1[0]).toBeCloseTo(p0[0], 12);
      expect(p1[1]).toBeCloseTo(p0[1], 12);
      expect(kineticEnergy(g)).toBeCloseTo(ke0, 12);
    }
  });

  it('keeps the total kinetic energy of the whole box through thousands of collisions', () => {
    const g = air(4);
    const ke0 = kineticEnergy(g);
    runGas(g, 400, 0.04);
    expect(g.collisions).toBeGreaterThan(5000);
    expect(Math.abs(kineticEnergy(g) / ke0 - 1)).toBeLessThan(1e-10);
  });
});

/* ── pressure is momentum rain on the walls ────────────────────────────── */

describe('pressure from wall hits', { timeout: 60_000 }, () => {
  it('matches the flat ideal gas law PA = NkT when the discs are small', () => {
    const g = air(9, 0.02);
    const { P } = measure(g, 1500);
    const ideal = idealPressure2D(AIR_BOX.count, AIR_BOX.T, AIR_BOX.w * AIR_BOX.h);
    expect(Math.abs(P / ideal - 1)).toBeLessThan(0.02);
    // and every wall feels the same pressure, within the noise of its own hits
    for (const wall of [WALL.left, WALL.right, WALL.bottom, WALL.top]) {
      expect(Math.abs(wallPressure(g, wall) / ideal - 1)).toBeLessThan(0.04);
    }
  });

  it('reads about one atmosphere for the lesson box of air at 20 °C', () => {
    const { P } = measure(air(), 1000);
    expect(toKPa(P)).toBeGreaterThan(97);
    expect(toKPa(P)).toBeLessThan(106);
    // slightly above ideal, by the hard-disc factor
    const eta = areaFraction(AIR_BOX.count, AIR_BOX.radius, AIR_BOX.w * AIR_BOX.h);
    const ideal = idealPressure2D(AIR_BOX.count, AIR_BOX.T, AIR_BOX.w * AIR_BOX.h);
    expect(Math.abs(P / (ideal * hardDiscZ(eta)) - 1)).toBeLessThan(0.03);
  });

  it('does not depend on the step size the scenes use', () => {
    const a = measure(air(), 1000, 0.02).P, b = measure(air(), 1000, 0.04).P;
    expect(Math.abs(a / b - 1)).toBeLessThan(0.02);
  });
});

describe('squeezing (Boyle)', { timeout: 60_000 }, () => {
  it('halving the volume doubles the pressure: twice the hits, each the same size', () => {
    const g = air();
    const full = measure(g, 1000);
    setPiston(g, AIR_BOX.w / 2);
    thermostat(g, AIR_BOX.T);
    const half = measure(g, 1000);
    expect(half.P / full.P).toBeGreaterThan(1.95);
    expect(half.P / full.P).toBeLessThan(2.2);
    expect(half.rate / full.rate).toBeGreaterThan(1.9);
    expect(half.rate / full.rate).toBeLessThan(2.25);
    expect(Math.abs(half.perHit / full.perHit - 1)).toBeLessThan(0.05);
    expect(boyleVolumeFraction(2)).toBe(0.5);
  });

  it('squeezed to a tenth, the pressure rises about 18×, not 10×: the discs take up room', () => {
    const g = air();
    const full = measure(g, 1000);
    setPiston(g, AIR_BOX.w / 10);
    thermostat(g, AIR_BOX.T);
    const tenth = measure(g, 1000, 0.02);
    const ratio = tenth.P / full.P;
    expect(ratio).toBeGreaterThan(16.5);
    expect(ratio).toBeLessThan(19.5);
    // The ideal gas would have needed no such correction; Henderson's
    // hard-disc equation of state accounts for most of it.
    const eta0 = areaFraction(AIR_BOX.count, AIR_BOX.radius, AIR_BOX.w * AIR_BOX.h);
    const predicted = 10 * hardDiscZ(eta0 * 10) / hardDiscZ(eta0);
    expect(Math.abs(ratio / predicted - 1)).toBeLessThan(0.08);
    // the discs cover about a quarter of the floor
    expect(eta0 * 10).toBeGreaterThan(0.22);
    expect(eta0 * 10).toBeLessThan(0.27);
  });
});

describe('heating (the kelvin scale)', { timeout: 60_000 }, () => {
  it('20 °C → 40 °C raises the pressure by under 7%, not 100%', () => {
    expect(heatingPressureRatio(20, 40)).toBeCloseTo(313.15 / 293.15, 12);
    expect(heatingPressureRatio(20, 40)).toBeGreaterThan(1.06);
    expect(heatingPressureRatio(20, 40)).toBeLessThan(1.07);
    // and the gas agrees
    const g = air();
    const cold = measure(g, 1500);
    thermostat(g, 313.15);
    const warm = measure(g, 1500);
    expect(Math.abs(warm.P / cold.P - heatingPressureRatio(20, 40))).toBeLessThan(0.02);
  });

  it('doubling the pressure takes 313 °C, where the kelvin temperature doubles', () => {
    expect(celsiusForPressureRatio(20, 2)).toBeCloseTo(313.15, 10);
    const g = air();
    const cold = measure(g, 1000);
    thermostat(g, 2 * AIR_BOX.T);
    const hot = measure(g, 1000, 0.03);
    expect(Math.abs(hot.P / cold.P - 2)).toBeLessThan(0.05);
    // the thermostat sets exactly the temperature asked for
    expect(temperature(g)).toBeCloseTo(2 * AIR_BOX.T, 6);
  });

  it('√2 faster molecules: √2 more hits per second, each √2 harder', () => {
    const g = air();
    const cold = measure(g, 1500);
    thermostat(g, 2 * AIR_BOX.T);
    const hot = measure(g, 1500, 0.03);
    expect(Math.abs(hot.rate / cold.rate - Math.SQRT2)).toBeLessThan(0.06);
    expect(Math.abs(hot.perHit / cold.perHit - Math.SQRT2)).toBeLessThan(0.04);
  });
});

describe('the ideal gas law in the room', { timeout: 60_000 }, () => {
  it('R = N_A k is 8.314 J/(mol·K)', () => {
    expect(gasConstant()).toBeCloseTo(8.314, 3);
  });
});

/* ── temperature as motion; the speeds spread ──────────────────────────── */

const spread = (speed: number = SPREAD_BOX.speed, seed = 5) => createGas({
  w: SPREAD_BOX.w, h: SPREAD_BOX.h, seed,
  species: [{ count: SPREAD_BOX.count, mass: SPREAD_BOX.mass, radius: SPREAD_BOX.radius, speed }],
});

describe('Maxwell–Boltzmann from any start', { timeout: 60_000 }, () => {
  it('molecules all starting at one speed relax to the 2D Maxwell–Boltzmann distribution', () => {
    const g = spread();
    const T = temperatureOfSpeed(SPREAD_BOX.mass, SPREAD_BOX.speed);
    const cdf = (v: number) => mbCdf2D(v, SPREAD_BOX.mass, T);
    expect(ksDistance(speeds(g), cdf)).toBeGreaterThan(0.6); // a spike is nothing like it
    runGas(g, 300, 0.04);
    // Kolmogorov–Smirnov at 300 samples: 0.08 is roughly the 1% critical value
    expect(ksDistance(speeds(g), cdf)).toBeLessThan(0.08);
  });

  it('a lopsided start (half at rest, half fast) relaxes to the same shape', () => {
    const g = createGas({
      w: SPREAD_BOX.w, h: SPREAD_BOX.h, seed: 11,
      species: [
        { count: 150, mass: SPREAD_BOX.mass, radius: SPREAD_BOX.radius, speed: 0 },
        { count: 150, mass: SPREAD_BOX.mass, radius: SPREAD_BOX.radius, speed: 0.4 * Math.SQRT2 },
      ],
    });
    const T = temperature(g);
    runGas(g, 400, 0.04);
    expect(ksDistance(speeds(g), (v) => mbCdf2D(v, SPREAD_BOX.mass, T))).toBeLessThan(0.08);
  });

  it('the temperature is fixed at the start: mean kinetic energy is kT, and collisions keep it', () => {
    const g = spread();
    const T = temperatureOfSpeed(SPREAD_BOX.mass, SPREAD_BOX.speed);
    runGas(g, 300, 0.04);
    expect(temperature(g)).toBeCloseTo(T, 8);
    // rms speed is still exactly the start speed
    const rms = Math.sqrt(speeds(g).reduce((s, v) => s + v * v, 0) / g.n);
    expect(rms).toBeCloseTo(SPREAD_BOX.speed, 10);
  });

  it('from 600 m/s: the peak settles near 424 m/s, the mean near 532, the rms stays 600', () => {
    const v0 = 0.6, m = SPREAD_BOX.mass, T = temperatureOfSpeed(m, v0);
    expect(mostProbableSpeed2D(m, T) * 1000).toBeCloseTo(424.3, 1);
    expect(meanSpeed2D(m, T) * 1000).toBeCloseTo(531.7, 1);
    expect(rmsSpeed2D(m, T) * 1000).toBeCloseTo(600, 6);
    // from 400 m/s, the lesson's first run, the peak is 283 m/s
    expect(mostProbableSpeed2D(m, temperatureOfSpeed(m, 0.4)) * 1000).toBeCloseTo(282.8, 1);

    const g = spread(v0, 13);
    runGas(g, 200, 0.03);
    const width = 0.05, bins = 30, sum = new Array(bins).fill(0);
    let mean = 0, samples = 0;
    for (let k = 0; k < 150; k++) {
      runGas(g, 4, 0.03);
      histogram(speeds(g), width, bins).forEach((c, i) => { sum[i] += c; });
      mean += meanSpeed(g); samples++;
    }
    const peakBin = sum.indexOf(Math.max(...sum));
    const peak = (peakBin + 0.5) * width;
    expect(Math.abs(peak - mostProbableSpeed2D(m, T))).toBeLessThan(1.5 * width);
    expect(Math.abs(mean / samples / meanSpeed2D(m, T) - 1)).toBeLessThan(0.03);
    // the settled histogram follows the density bin by bin
    const total = sum.reduce((a, b) => a + b, 0);
    for (let i = 2; i < 20; i++) {
      const expected = mbDensity2D((i + 0.5) * width, m, T) * width;
      expect(Math.abs(sum[i] / total - expected)).toBeLessThan(0.012);
    }
  });
});

describe('light and heavy at one temperature (equipartition)', { timeout: 60_000 }, () => {
  const mix = (argonSpeed: number = MIX_BOX.heavy.speed, seed = 7) => createGas({
    w: MIX_BOX.w, h: MIX_BOX.h, seed,
    species: [
      { ...MIX_BOX.light, radius: MIX_BOX.radius },
      { ...MIX_BOX.heavy, speed: argonSpeed, radius: MIX_BOX.radius },
    ],
  });

  it('helium and argon both starting at 400 m/s end with equal mean kinetic energy', () => {
    const g = mix();
    expect(meanKE(g, 1) / meanKE(g, 0)).toBeCloseTo(MASS.argon / MASS.helium, 10); // argon starts with 10×
    runGas(g, 300, 0.02);
    const he = timeAverage(g, 1500, 10, (x) => meanKE(x, 0));
    const ar = timeAverage(g, 1500, 10, (x) => meanKE(x, 1));
    expect(Math.abs(he / ar - 1)).toBeLessThan(0.06);
  });

  it('so helium ends about √10 ≈ 3.2× faster: near 830 m/s against argon near 260', () => {
    const g = mix();
    runGas(g, 300, 0.02);
    const he = timeAverage(g, 1500, 10, (x) => meanSpeed(x, 0));
    const ar = timeAverage(g, 1500, 10, (x) => meanSpeed(x, 1));
    expect(Math.abs(he / ar / Math.sqrt(MASS.argon / MASS.helium) - 1)).toBeLessThan(0.07);
    expect(Math.abs(he * 1000 - 831)).toBeLessThan(45);
    expect(Math.abs(ar * 1000 - 263)).toBeLessThan(15);
  });

  it('argon started at 127 m/s carries helium’s energy already, so nothing flows', () => {
    const v = equalKESpeed(0.4, MASS.helium, MASS.argon);
    expect(v * 1000).toBeCloseTo(126.6, 1);
    const g = mix(v);
    const start = meanKE(g, 0);
    const he = timeAverage(g, 1000, 10, (x) => meanKE(x, 0));
    const ar = timeAverage(g, 1000, 10, (x) => meanKE(x, 1));
    expect(Math.abs(he / start - 1)).toBeLessThan(0.08);
    expect(Math.abs(ar / start - 1)).toBeLessThan(0.08);
    // whereas the 400 m/s start sends energy from argon to helium
    const h = mix();
    runGas(h, 200, 0.02);
    expect(meanKE(h, 0) / start).toBeGreaterThan(3);
  });

  it('a heavier gas at the same temperature pushes just as hard: fewer hits, each harder', () => {
    const light = measure(air(3, AIR_BOX.radius, MASS.nitrogen), 1500);
    const heavy = measure(air(3, AIR_BOX.radius, 4 * MASS.nitrogen), 1500, 0.06);
    expect(Math.abs(heavy.P / light.P - 1)).toBeLessThan(0.04);
    expect(Math.abs(heavy.rate / light.rate - 0.5)).toBeLessThan(0.04);
    expect(Math.abs(heavy.perHit / light.perHit - 2)).toBeLessThan(0.1);
  });

  it('in three dimensions, nitrogen at 20 °C has an rms speed near 510 m/s', () => {
    expect(rmsSpeed3D(MASS.nitrogen, 293.15) * 1000).toBeCloseTo(511, 0);
  });
});
