import { describe, expect, it } from 'vitest';
import {
  DEG, N_GLASS, N_WATER, alongAxis, apparentPoint, brewsterAngle, criticalAngle, fastestEntry,
  frequencyInside, frequencyOf, fresnel, indexFor, laserLanding, malus, pathAngles, pathTime,
  planeWavePhase, snell, speedIn, stepsToKeep, straightEntry, throughFilters, transmittance,
  twistTransmission, wavelengthIn,
} from '../light.ts';
import { C } from '../emwaves.ts';

describe('the quickest road is Snell’s law', () => {
  // The lifeguard scene: chair 30 m up the beach, swimmer 50 m along and 20 m out.
  const A = [0, 30] as const, B = [50, -20] as const;
  const RUN = 5, SWIM = 2;

  it('the time-minimising entry point satisfies n₁ sin θ₁ = n₂ sin θ₂ to 1e-6', () => {
    for (const [v1, v2] of [[RUN, SWIM], [C, C / N_WATER], [C / N_GLASS, C], [3, 3]]) {
      const x = fastestEntry(A, B, v1, v2);
      const { theta1, theta2 } = pathAngles(A, B, x);
      const n1 = indexFor(v1), n2 = indexFor(v2);
      expect(Math.abs(n1 * Math.sin(theta1) - n2 * Math.sin(theta2))).toBeLessThan(1e-6);
    }
  });

  it('is a true minimum: every other entry point is slower', () => {
    const x = fastestEntry(A, B, RUN, SWIM);
    const best = pathTime(A, B, x, RUN, SWIM);
    for (let xx = 0; xx <= 50; xx += 0.25) expect(pathTime(A, B, xx, RUN, SWIM)).toBeGreaterThanOrEqual(best - 1e-12);
  });

  it('beats both the straight line and the shortest swim, and lies between them', () => {
    const x = fastestEntry(A, B, RUN, SWIM);
    const t = pathTime(A, B, x, RUN, SWIM);
    const xs = straightEntry(A, B);
    expect(xs).toBeCloseTo(30, 12);
    expect(x).toBeGreaterThan(xs);
    expect(x).toBeLessThan(B[0]);
    expect(pathTime(A, B, xs, RUN, SWIM) - t).toBeGreaterThan(1);
    expect(pathTime(A, B, B[0], RUN, SWIM) - t).toBeGreaterThan(0.4);
  });

  it('with equal speeds the fastest road is the straight line', () => {
    expect(fastestEntry(A, B, 3, 3)).toBeCloseTo(straightEntry(A, B), 9);
  });
});

describe('Snell’s law and the critical angle', () => {
  it('the critical angle for glass (n = 1.5) into air is 41.8°', () => {
    expect(criticalAngle(1.5, 1) / DEG).toBeCloseTo(41.81, 2);
  });

  it('light bends toward the normal going into water, away from it coming out', () => {
    const t = snell(1, N_WATER, 40 * DEG)!;
    expect(t).toBeLessThan(40 * DEG);
    expect(snell(N_WATER, 1, t)!).toBeCloseTo(40 * DEG, 12);
  });

  it('past the critical angle there is no refracted ray; from air there is always one', () => {
    const c = criticalAngle(N_GLASS, 1);
    expect(snell(N_GLASS, 1, c - 1e-6)).not.toBeNull();
    expect(snell(N_GLASS, 1, c + 1e-6)).toBeNull();
    expect(Number.isNaN(criticalAngle(1, N_GLASS))).toBe(true);
    expect(snell(1, N_GLASS, 89.9 * DEG)).not.toBeNull();
  });

  it('a laser aimed straight at the coin lands short of it, toward the wall', () => {
    const L = [0, 1.2] as const, coin = 4.2, depth = 2;
    const x = straightEntry(L, [coin, -depth]);
    const { landX, theta1, theta2 } = laserLanding(L, x, -depth, 1, N_WATER);
    expect(theta2).toBeLessThan(theta1);
    expect(coin - landX).toBeGreaterThan(0.5);
  });
});

describe('the bent stick', () => {
  it('seen from straight above, a point at depth d looks to be at d/n', () => {
    const { image } = apparentPoint([0, -10], [0, 20], N_WATER, 1);
    expect(image[0]).toBeCloseTo(0, 6);
    expect(image[1]).toBeCloseTo(-10 / N_WATER, 3);
  });

  it('seen at a slant, it looks raised, and lies on the ray that reaches the eye', () => {
    const obj = [3, -7] as const, eye = [14, 10] as const;
    const { image, exit } = apparentPoint(obj, eye, N_WATER, 1);
    expect(image[1]).toBeGreaterThan(obj[1] + 1);
    expect(image[1]).toBeLessThan(0);
    // image, exit point and eye are collinear: the eye traces the ray straight back
    const cross = (exit - image[0]) * (eye[1] - image[1]) - (0 - image[1]) * (eye[0] - image[0]);
    expect(Math.abs(cross) / Math.hypot(eye[0] - image[0], eye[1] - image[1])).toBeLessThan(1e-3);
  });
});

describe('what the boundary cannot change', () => {
  const lambda0 = 600e-9;
  it('inside glass the wavelength shrinks by n and the frequency is unchanged', () => {
    expect(wavelengthIn(lambda0, N_GLASS)).toBeCloseTo(400e-9, 15);
    expect(frequencyInside(lambda0, N_GLASS) / frequencyOf(lambda0)).toBeCloseTo(1, 12);
    expect(speedIn(N_GLASS)).toBeCloseTo(C / 1.5, 3);
  });

  it('crests on the two sides meet along the boundary exactly when Snell holds', () => {
    const t1 = 40 * DEG, t2 = snell(1, N_GLASS, t1)!;
    for (const x of [-3e-6, 0.37e-6, 5e-6]) {
      expect(planeWavePhase(1, t1, lambda0, x, 0)).toBeCloseTo(planeWavePhase(N_GLASS, t2, lambda0, x, 0), 9);
    }
    // With any other angle they tear apart.
    expect(Math.abs(planeWavePhase(1, t1, lambda0, 5e-6, 0) - planeWavePhase(N_GLASS, t1, lambda0, 5e-6, 0))).toBeGreaterThan(1);
  });
});

describe('how much reflects', () => {
  it('glass reflects 4% at normal incidence', () => {
    expect(fresnel(1, N_GLASS, 0).R).toBeCloseTo(0.04, 12);
  });

  it('transmitted power from the amplitudes equals 1 − R: energy is conserved', () => {
    for (const th of [0, 20, 35, 41, 41.8]) {
      const f = fresnel(N_GLASS, 1, th * DEG), t = transmittance(N_GLASS, 1, th * DEG);
      expect(t.Ts).toBeCloseTo(1 - f.Rs, 10);
      expect(t.Tp).toBeCloseTo(1 - f.Rp, 10);
    }
  });

  it('the escaping ray fades out as the critical angle arrives, rather than switching off', () => {
    const c = criticalAngle(N_GLASS, 1);
    expect(fresnel(N_GLASS, 1, 30 * DEG).T).toBeGreaterThan(0.9);
    expect(fresnel(N_GLASS, 1, c - 0.5 * DEG).T).toBeLessThan(0.5);
    expect(fresnel(N_GLASS, 1, c - 1e-7).T).toBeLessThan(0.01);
    expect(fresnel(N_GLASS, 1, c + 1e-7).R).toBe(1);
  });

  it('Brewster’s angle for water is 53.1°, reflects no p-light, and makes the rays square', () => {
    const b = brewsterAngle(1, N_WATER);
    expect(b / DEG).toBeCloseTo(53.12, 2);
    const f = fresnel(1, N_WATER, b);
    expect(f.Rp).toBeLessThan(1e-20);
    expect(f.Rs).toBeGreaterThan(0.03);
    expect((b + f.theta2!) / DEG).toBeCloseTo(90, 9);
  });
});

describe('polarising filters', () => {
  it('Malus: cos² at 30° passes 0.75, and the field passes cos 30° = 0.866', () => {
    expect(malus(1, 30 * DEG)).toBeCloseTo(0.75, 12);
    expect(alongAxis(1, 30 * DEG)).toBeCloseTo(0.8660, 4);
    expect(malus(1, 60 * DEG)).toBeCloseTo(0.25, 12);
  });

  it('the first filter halves unpolarised light, whatever its angle', () => {
    for (const a of [0, 17, 90]) expect(throughFilters(1, [a * DEG])[0]).toBeCloseTo(0.5, 12);
  });

  it('crossed filters pass nothing; a third at 45° between them passes 1/8', () => {
    expect(throughFilters(1, [0, 90 * DEG]).at(-1)!).toBeCloseTo(0, 12);
    expect(throughFilters(1, [0, 45 * DEG, 90 * DEG]).at(-1)!).toBeCloseTo(1 / 8, 12);
    expect(throughFilters(1, [0, 90 * DEG, 45 * DEG]).at(-1)!).toBeCloseTo(0, 12);
  });

  it('the middle filter lets through the most at 45°', () => {
    let best = 0, at = 0;
    for (let a = 0; a <= 90; a += 0.5) {
      const I = throughFilters(1, [0, a * DEG, 90 * DEG]).at(-1)!;
      if (I > best) { best = I; at = a; }
    }
    expect(at).toBe(45);
  });

  it('more, smaller turns lose less: 12 filters turn the light 90° and keep 81%', () => {
    for (let n = 2; n < 40; n++) expect(twistTransmission(n + 1)).toBeGreaterThan(twistTransmission(n));
    expect(twistTransmission(1)).toBeCloseTo(0, 12);
    expect(twistTransmission(2)).toBeCloseTo(0.25, 12);
    expect(twistTransmission(11)).toBeLessThan(0.8);
    expect(twistTransmission(12)).toBeCloseTo(0.8137, 4);
    expect(stepsToKeep(0.8)).toBe(12);
    expect(twistTransmission(1000)).toBeGreaterThan(0.997);
  });
});
