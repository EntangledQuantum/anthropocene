import { describe, expect, it } from 'vitest';
import {
  AU, COMET, DAY, GM_EARTH, GM_SUN, ISS_ALTITUDE, MOON_DISTANCE, MOON_SIDEREAL_PERIOD, R_EARTH,
  accelAt, anomalyAtTime, cannonClearSpeed, cannonShot, circularSpeed, cometDaysFromAphelion,
  elementsOf, escapeSpeed, fallInTime, gravityAt, integrate, periodOf, radiusAt, sagBelowTangent,
  sectorArea, specificEnergy, sweptArea, timeFromPeriapsis,
} from '../orbits.ts';

const rISS = R_EARTH + ISS_ALTITUDE;
const r = (p: readonly [number, number]) => Math.hypot(p[0], p[1]);

describe('the inverse-square law (lesson 1 hook)', () => {
  it('gravity at the ISS is about 90% of its surface value, not zero', () => {
    const frac = gravityAt(GM_EARTH, rISS) / gravityAt(GM_EARTH, R_EARTH);
    expect(frac).toBeGreaterThan(0.87);
    expect(frac).toBeLessThan(0.9);
    expect(gravityAt(GM_EARTH, R_EARTH)).toBeCloseTo(9.82, 1);
  });

  it('the acceleration points at the centre and has magnitude GM/r²', () => {
    const a = accelAt(GM_EARTH, [3e6, 4e6]);
    expect(Math.hypot(a[0], a[1])).toBeCloseTo(GM_EARTH / 25e12, 6);
    expect(a[0] / a[1]).toBeCloseTo(3 / 4, 12);
    expect(a[0]).toBeLessThan(0);
  });

  it('Newton\'s Moon test: the Moon\'s centripetal fall matches g scaled by 1/r² to 2%', () => {
    const v = (2 * Math.PI * MOON_DISTANCE) / MOON_SIDEREAL_PERIOD;
    const orbitFall = fallInTime(v * v / MOON_DISTANCE, 1);
    const gravityFall = fallInTime(gravityAt(GM_EARTH, MOON_DISTANCE), 1);
    expect(gravityFall * 1000).toBeCloseTo(1.35, 1); // mm in one second
    expect(Math.abs(orbitFall / gravityFall - 1)).toBeLessThan(0.02);
  });
});

describe('Newton\'s cannon', () => {
  const vClear = cannonClearSpeed(GM_EARTH, R_EARTH, rISS);

  it('from 400 km up the slowest shot that clears the ground is about 7.55 km/s, just under circular', () => {
    expect(vClear / 1000).toBeCloseTo(7.555, 2);
    expect(vClear).toBeLessThan(circularSpeed(GM_EARTH, rISS));
  });

  it('slower shots land, faster ones come all the way round, and the switch is at the predicted speed', () => {
    expect(cannonShot(GM_EARTH, R_EARTH, rISS, 3000).outcome).toBe('landed');
    expect(cannonShot(GM_EARTH, R_EARTH, rISS, vClear - 30).outcome).toBe('landed');
    expect(cannonShot(GM_EARTH, R_EARTH, rISS, vClear + 30).outcome).toBe('orbit');
    expect(cannonShot(GM_EARTH, R_EARTH, rISS, 8200).outcome).toBe('orbit');
  });

  it('a faster shot that still lands goes farther downrange', () => {
    const a = cannonShot(GM_EARTH, R_EARTH, rISS, 4000).downrange;
    const b = cannonShot(GM_EARTH, R_EARTH, rISS, 7000).downrange;
    expect(b).toBeGreaterThan(a);
  });

  it('at circular speed the altitude never changes (to 0.01%)', () => {
    const vc = circularSpeed(GM_EARTH, rISS);
    const shot = cannonShot(GM_EARTH, R_EARTH, rISS, vc, 1);
    expect(shot.outcome).toBe('orbit');
    for (const s of shot.path) expect(Math.abs(r(s.p) / rISS - 1)).toBeLessThan(1e-4);
    expect(shot.time).toBeCloseTo(periodOf(GM_EARTH, rISS), -1);
  });
});

describe('one second of orbit', () => {
  const g = gravityAt(GM_EARTH, rISS);
  const vc = circularSpeed(GM_EARTH, rISS);

  it('the fall in the first second does not depend on the sideways speed', () => {
    expect(fallInTime(g, 1)).toBeCloseTo(4.34, 2);
  });

  it('at v = √(g r) the ground curves away exactly as far as the ball falls', () => {
    expect(vc).toBeCloseTo(Math.sqrt(g * rISS), 6);
    expect(sagBelowTangent(rISS, vc * 1) / fallInTime(g, 1)).toBeCloseTo(1, 5);
  });

  it('slower, the ball falls more than the ground drops; faster, less', () => {
    expect(sagBelowTangent(rISS, 6000)).toBeLessThan(fallInTime(g, 1));
    expect(sagBelowTangent(rISS, 9000)).toBeGreaterThan(fallInTime(g, 1));
  });
});

describe('the integrator is honest', () => {
  it('velocity Verlet keeps energy to 1e-6 over five eccentric orbits, with no drift', () => {
    const p0: [number, number] = [COMET.a * (1 - COMET.e), 0];
    const vp = Math.sqrt((GM_SUN / COMET.a) * (1 + COMET.e) / (1 - COMET.e));
    const T = periodOf(GM_SUN, COMET.a);
    const path = integrate(GM_SUN, p0, [0, vp], T / 40000, 5 * T);
    const E0 = specificEnergy(GM_SUN, path[0].p, path[0].v);
    let worst = 0;
    for (const s of path) worst = Math.max(worst, Math.abs(specificEnergy(GM_SUN, s.p, s.v) / E0 - 1));
    expect(worst).toBeLessThan(1e-6);
    const last = path[path.length - 1];
    expect(Math.abs(specificEnergy(GM_SUN, last.p, last.v) / E0 - 1)).toBeLessThan(1e-6);
  });

  it('elementsOf reads back the ellipse the integrator flies', () => {
    const p0: [number, number] = [COMET.a * (1 - COMET.e), 0];
    const vp = Math.sqrt((GM_SUN / COMET.a) * (1 + COMET.e) / (1 - COMET.e));
    const el = elementsOf(GM_SUN, p0, [0, vp]);
    expect(el.a / COMET.a).toBeCloseTo(1, 10);
    expect(el.e).toBeCloseTo(COMET.e, 10);
    const path = integrate(GM_SUN, p0, [0, vp], DAY / 4, periodOf(GM_SUN, COMET.a));
    const far = Math.max(...path.map((s) => r(s.p)));
    expect(far / el.ra).toBeCloseTo(1, 4);
  });
});

describe('Kepler\'s second law: equal areas in equal times', () => {
  const { a, e } = COMET;
  const T = periodOf(GM_SUN, a);
  const p0: [number, number] = [a * (1 - e), 0];
  const vp = Math.sqrt((GM_SUN / a) * (1 + e) / (1 - e));
  const path = integrate(GM_SUN, p0, [0, vp], DAY / 20, T);
  const window = (t0: number, days: number) => path.filter((s) => s.t >= t0 - 1e-6 && s.t <= t0 + days * DAY + 1e-6);

  it('the integrator sweeps the same area in 60 days at perihelion as at aphelion', () => {
    const near = sweptArea(window(0, 60));
    const far = sweptArea(window(Math.round(T / 2 / (DAY / 20)) * (DAY / 20), 60));
    expect(Math.abs(near / far - 1)).toBeLessThan(2e-3);
  });

  it('yet the arc near the Sun is several times longer than the arc far away', () => {
    const arc = (w: typeof path) => w.slice(1).reduce((s, q, i) => s + Math.hypot(q.p[0] - w[i].p[0], q.p[1] - w[i].p[1]), 0);
    expect(arc(window(0, 60)) / arc(window(Math.round(T / 2 / (DAY / 20)) * (DAY / 20), 60))).toBeGreaterThan(3);
  });

  it('Kepler\'s equation agrees with the integrator on where the comet is after 60 days', () => {
    const s = path[Math.round((60 * DAY) / (DAY / 20))];
    const th = Math.atan2(s.p[1], s.p[0]);
    expect(timeFromPeriapsis(GM_SUN, a, e, th) / DAY).toBeCloseTo(60, 1);
    expect(anomalyAtTime(GM_SUN, a, e, 60 * DAY)).toBeCloseTo(th, 4);
    expect(radiusAt(a, e, th) / r(s.p)).toBeCloseTo(1, 5);
  });

  it('swept area by quadrature is proportional to elapsed time', () => {
    const rate = sectorArea(a, e, 0, 2 * Math.PI, 4000) / T; // total area / period
    expect(sectorArea(a, e, 0, 2 * Math.PI, 4000)).toBeCloseTo(Math.PI * a * a * Math.sqrt(1 - e * e), -18);
    for (const th of [0.4, 1.5, 3.0, 4.5]) {
      const t = timeFromPeriapsis(GM_SUN, a, e, th);
      expect(sectorArea(a, e, 0, th) / (rate * t)).toBeCloseTo(1, 4);
    }
  });

  it('cometDaysFromAphelion is zero at aphelion and 60 where the comet is 60 days later', () => {
    expect(cometDaysFromAphelion(Math.PI)).toBeCloseTo(0, 6);
    const th60 = anomalyAtTime(GM_SUN, a, e, T / 2 + 60 * DAY);
    expect(cometDaysFromAphelion(th60)).toBeCloseTo(60, 4);
    expect(T / DAY).toBeCloseTo(1032, -1);
  });
});

describe('Kepler\'s third law: T² ∝ a³', () => {
  it('measured periods from the integrator give the same T²/a³ for every orbit', () => {
    const ratios: number[] = [];
    for (const [rp, vFactor] of [[1 * AU, 1], [0.5 * AU, 1.2], [2 * AU, 1.05], [0.8 * AU, 0.9]] as const) {
      const v0 = circularSpeed(GM_SUN, rp) * vFactor;
      const el = elementsOf(GM_SUN, [rp, 0], [0, v0]);
      const Tguess = periodOf(GM_SUN, el.a);
      const path = integrate(GM_SUN, [rp, 0], [0, v0], Tguess / 20000, 1.2 * Tguess);
      // period: the first upward crossing of the +x axis after starting
      let T = NaN;
      for (let i = 2; i < path.length; i++) {
        const p = path[i - 1].p, q = path[i].p;
        if (p[1] < 0 && q[1] >= 0 && q[0] > 0) { T = path[i - 1].t + (path[i].t - path[i - 1].t) * (-p[1] / (q[1] - p[1])); break; }
      }
      ratios.push((T * T) / (el.a ** 3));
    }
    for (const k of ratios) expect(k / ((4 * Math.PI ** 2) / GM_SUN)).toBeCloseTo(1, 3);
  });

  it('a forward burn raises the orbit and lengthens the period, so the chaser falls behind', () => {
    const vc = circularSpeed(GM_EARTH, rISS);
    const el = elementsOf(GM_EARTH, [0, rISS], [vc * 1.03, 0]);
    expect(el.ra).toBeGreaterThan(rISS + 300e3);
    expect(periodOf(GM_EARTH, el.a)).toBeGreaterThan(periodOf(GM_EARTH, rISS) + 300);
  });
});

describe('escape: v_esc = √2 · v_circ, and E = 0 is the line', () => {
  it('at every radius the ratio is √2', () => {
    for (const rr of [R_EARTH, rISS, 4.2e7, MOON_DISTANCE]) {
      expect(escapeSpeed(GM_EARTH, rr) / circularSpeed(GM_EARTH, rr)).toBeCloseTo(Math.SQRT2, 12);
    }
    expect(escapeSpeed(GM_EARTH, rISS) / 1000).toBeCloseTo(10.85, 2);
  });

  it('total energy is zero exactly at escape speed, negative below, positive above', () => {
    const ve = escapeSpeed(GM_EARTH, rISS);
    expect(Math.abs(specificEnergy(GM_EARTH, [0, rISS], [ve, 0]))).toBeLessThan(1e-6 * GM_EARTH / rISS);
    expect(elementsOf(GM_EARTH, [0, rISS], [0.99 * ve, 0]).bound).toBe(true);
    expect(elementsOf(GM_EARTH, [0, rISS], [1.01 * ve, 0]).bound).toBe(false);
  });

  it('just below escape the integrator turns round and comes back; just above it never does', () => {
    const ve = escapeSpeed(GM_EARTH, rISS);
    const below = integrate(GM_EARTH, [0, rISS], [0.99 * ve, 0], 20, 4e6);
    const rs = below.map((s) => r(s.p));
    const iMax = rs.indexOf(Math.max(...rs));
    expect(iMax).toBeLessThan(rs.length - 1);
    expect(rs[rs.length - 1]).toBeLessThan(rs[iMax]);

    const above = integrate(GM_EARTH, [0, rISS], [1.01 * ve, 0], 20, 4e6);
    const ra = above.map((s) => r(s.p));
    for (let i = 1; i < ra.length; i++) expect(ra[i]).toBeGreaterThanOrEqual(ra[i - 1]);
    expect(ra[ra.length - 1]).toBeGreaterThan(50 * rISS);
  });
});
