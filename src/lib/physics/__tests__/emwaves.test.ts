import { describe, expect, it } from 'vitest';
import {
  C, C_NS, EPS0, MU0, SOLAR_CONSTANT, angleBetween, bFromE, chargeY, createNewsClock, distanceAfter,
  evolveSnapshot, fieldDirection, fieldLine, intensity, leftFraction, measuredSpeed, meltedSpots,
  moveCharge, newsStep, peakField, photonPressure, poyntingX, radiationPressure, sailAcceleration,
  sideForDistance, snapshot, speedFromPins, standingHeat, startNews, wavelength, waveSpeed,
  type History, type P2,
} from '../emwaves.ts';

/** Rest at 0 until t0, move to `amp` at `speed` (m/ns), rest there. */
function stepHistory(t0: number, amp: number, speed: number): History {
  return [{ t: -1000, y: 0 }, { t: t0, y: 0 }, { t: t0 + Math.abs(amp) / speed, y: amp }];
}

describe('the speed of light is built from two electrical constants', () => {
  it('1/√(μ₀ε₀) is 299 792 458 m/s to better than one part in a billion', () => {
    expect(Math.abs(waveSpeed(MU0, EPS0) - 299792458) / 299792458).toBeLessThan(1e-9);
    expect(C).toBe(waveSpeed(MU0, EPS0));
  });
  it('a light-nanosecond is about 30 cm', () => {
    expect(C_NS).toBeCloseTo(0.2998, 4);
  });
  it('in a plane wave E = cB: 100 V/m goes with 0.33 µT', () => {
    expect(bFromE(100)).toBeCloseTo(3.3356e-7, 10);
  });
});

describe('the kink in a shaken charge’s field runs out at c', () => {
  const t0 = 2, t = 30, dr = 0.002;
  /** Outermost radius at which the broadside line has left the old rest line. */
  const front = (h: History) => {
    const pts = fieldLine(h, t, Math.PI / 2, 12, dr);
    let r = 0;
    pts.forEach((p, i) => { if (Math.abs(p[1]) > 1e-9) r = i * dr; });
    return r;
  };
  it('the front sits at c·(t − t₀) whatever the amplitude or the speed of the shake', () => {
    const expected = C_NS * (t - t0);
    for (const [amp, speed] of [[0.1, 0.15], [0.5, 0.15], [1.2, 0.15], [0.5, 0.05], [-0.8, 0.1]]) {
      expect(Math.abs(front(stepHistory(t0, amp, speed)) - expected)).toBeLessThan(2 * dr);
    }
  });
  it('the front of each ripple moves at c: measured at two times', () => {
    const h = stepHistory(t0, 0.7, 0.12);
    const pts = (tt: number) => fieldLine(h, tt, Math.PI / 2, 12, dr);
    const frontAt = (tt: number) => { let r = 0; pts(tt).forEach((p, i) => { if (Math.abs(p[1]) > 1e-9) r = i * dr; }); return r; };
    expect((frontAt(35) - frontAt(15)) / 20).toBeCloseTo(C_NS, 3);
  });
  it('outside the shell the lines are radial from the old spot, inside from the new one (Gauss)', () => {
    const amp = 0.6, h = stepHistory(t0, amp, 0.15);
    const tEnd = t0 + amp / 0.15;
    for (const theta of [0.3, 1.1, Math.PI / 2, 2.4]) {
      const pts = fieldLine(h, t, theta, 12, 0.01);
      pts.forEach((p, i) => {
        const r = i * 0.01;
        if (r > C_NS * (t - t0) + 0.01) expect(p[1]).toBeCloseTo(r * Math.cos(theta), 9);
        if (r < C_NS * (t - tEnd) - 0.01) expect(p[1]).toBeCloseTo(amp + r * Math.cos(theta), 9);
      });
    }
  });
  it('the kink’s sideways size is Δy·sinθ: largest broadside, zero along the rod', () => {
    const amp = 0.5, h = stepHistory(t0, amp, 0.15);
    for (const theta of [0, 0.4, Math.PI / 2, 2.2, Math.PI]) {
      const pts = fieldLine(h, t, theta, 12, 0.01);
      const inner = pts[100]; // r = 1 m, well inside
      const [ux, uy] = [Math.sin(theta), Math.cos(theta)];
      const sideways = Math.abs(inner[0] * uy - inner[1] * ux); // distance from the old radial line
      expect(sideways).toBeCloseTo(amp * Math.abs(Math.sin(theta)), 9);
    }
  });
});

describe('the detector’s stopwatch measures c, however the charge is shaken', () => {
  /** Run a scene-like loop: frames of `dt` ns, the charge chasing `target` at up to `vmax`. */
  function run(D: P2, target: number, vmax: number, dt = 10 / 60) {
    const h: History = [{ t: -1000, y: 0 }, { t: 0, y: 0 }];
    const clock = createNewsClock();
    let t = 0, y = 0, started = false;
    for (let i = 0; i < 400; i++) {
      t += dt;
      if (started) y = moveCharge(y, target, dt, vmax);
      h.push({ t, y });
      // The charge leaves rest at this frame; it moves from the next one on.
      if (!started && t > 3) { startNews(clock, t, y, D); started = true; }
      newsStep(clock, h, t);
    }
    return clock;
  }
  it('reads 3.00 × 10⁸ m/s for small, large, slow and quick shakes', () => {
    for (const [target, vmax] of [[0.2, 0.15], [1.2, 0.15], [0.6, 0.03], [-0.9, 0.1]]) {
      const clock = run([9, 0], target, vmax);
      expect(clock.state).toBe('done');
      expect(measuredSpeed(clock)! / C).toBeCloseTo(1, 6);
    }
  });
  it('the delay is distance over c at any spot, on or off the axis', () => {
    for (const D of [[6, 0], [3, 2], [0, 5], [-4, -1]] as P2[]) {
      const clock = run(D, 0.8, 0.15);
      expect(clock.delay!).toBeCloseTo(Math.hypot(D[0], D[1]) / C_NS, 5);
    }
  });
});

describe('nothing is sent along the line of shaking', () => {
  const h = stepHistory(2, 0.8, 0.15);
  const swing = (D: P2) => {
    const rest = fieldDirection(h, D, 0);
    let worst = 0;
    for (let t = 0; t < 60; t += 0.05) worst = Math.max(worst, angleBetween(rest, fieldDirection(h, D, t)));
    return worst;
  };
  it('a detector straight up the rod sees the field keep its direction', () => {
    expect(swing([0, 5])).toBeLessThan(1e-6);
    expect(swing([0, -5])).toBeLessThan(1e-6);
  });
  it('a detector anywhere off the rod sees it swing as the ripple passes', () => {
    expect(swing([5, 0])).toBeGreaterThan(5);
    expect(swing([5 / Math.SQRT2, 5 / Math.SQRT2])).toBeGreaterThan(5);
    expect(swing([1, 5])).toBeGreaterThan(1);
  });
  it('the charge follows its history and never outruns its speed limit', () => {
    expect(chargeY(h, 0)).toBe(0);
    expect(chargeY(h, 100)).toBe(0.8);
    expect(moveCharge(0, 1, 1, 0.15)).toBeCloseTo(0.15, 12);
  });
});

describe('a frozen snapshot of E and B, let go', () => {
  const k = Math.PI; // λ = 2
  it('obeys both curl equations: ∂E/∂t = −c ∂(cB)/∂x and ∂(cB)/∂t = −c ∂E/∂x', () => {
    const e = 1e-5;
    for (const phi of [0, 0.7, Math.PI / 2, Math.PI]) {
      for (const [x, ct] of [[0.3, 0.1], [1.7, 2.2], [-0.4, 0.9]]) {
        const f = (xx: number, tt: number) => evolveSnapshot(phi, xx, k, tt);
        const dEdt = (f(x, ct + e).E - f(x, ct - e).E) / (2 * e);
        const dBdx = (f(x + e, ct).cB - f(x - e, ct).cB) / (2 * e);
        const dBdt = (f(x, ct + e).cB - f(x, ct - e).cB) / (2 * e);
        const dEdx = (f(x + e, ct).E - f(x - e, ct).E) / (2 * e);
        expect(dEdt).toBeCloseTo(-dBdx, 5);
        expect(dBdt).toBeCloseTo(-dEdx, 5);
      }
    }
  });
  it('with B in step with E the whole pattern slides right at c, unchanged', () => {
    for (const x of [0, 0.4, 1.3]) {
      const w = evolveSnapshot(0, x, k, 0.7);
      expect(w.E).toBeCloseTo(Math.cos(k * (x - 0.7)), 12);
      expect(w.cB).toBeCloseTo(w.E, 12);
    }
  });
  it('with B flipped it slides left; a quarter wave out, it splits both ways', () => {
    const w = evolveSnapshot(Math.PI, 0.4, k, 0.7);
    expect(w.E).toBeCloseTo(Math.cos(k * (0.4 + 0.7)), 12);
    const E = (phi: number) => { let r = 0, l = 0; for (let i = 0; i < 400; i++) { const x = (i * 2) / 400; const s = snapshot(phi, x, k); r += ((s.E + s.cB) / 2) ** 2; l += ((s.E - s.cB) / 2) ** 2; } return l / (r + l); };
    for (const phi of [0, 0.5, Math.PI / 2, 2, Math.PI]) expect(E(phi)).toBeCloseTo(leftFraction(phi), 6);
  });
  it('E × B points along travel only when they are in step', () => {
    for (let i = 0; i < 20; i++) {
      const s = snapshot(0, i * 0.1, k);
      expect(poyntingX(s.E, s.cB)).toBeGreaterThanOrEqual(0);
    }
    const q = [0.1, 0.6].map((x) => { const s = snapshot(Math.PI / 2, x, k); return poyntingX(s.E, s.cB); });
    expect(q[0] * q[1]).toBeLessThan(0);
  });
});

describe('light carries energy and momentum', () => {
  it('intensity ½cε₀E₀²: sunlight has a peak field of about 1000 V/m', () => {
    expect(peakField(SOLAR_CONSTANT)).toBeCloseTo(1012.6, 0);
    expect(intensity(peakField(500))).toBeCloseTo(500, 9);
  });
  it('pressure is I/c on a black surface and 2I/c on a mirror', () => {
    expect(radiationPressure(SOLAR_CONSTANT, 'absorb')).toBeCloseTo(SOLAR_CONSTANT / C, 18);
    expect(radiationPressure(SOLAR_CONSTANT, 'reflect')).toBeCloseTo(2 * SOLAR_CONSTANT / C, 18);
    expect(radiationPressure(SOLAR_CONSTANT, 'reflect') * 1e6).toBeCloseTo(9.08, 2);
  });
  it('counting photons gives the same pressure, at any colour', () => {
    for (const f of [1e9, 5.5e14, 3e18]) {
      for (const s of ['absorb', 'reflect'] as const) {
        expect(photonPressure(SOLAR_CONSTANT, f, s) / radiationPressure(SOLAR_CONSTANT, s)).toBeCloseTo(1, 12);
      }
    }
  });
  it('a mirror sail accelerates twice as hard as a black one, and a 7.4 m sail takes 5 kg 373 km in a day', () => {
    expect(sailAcceleration(1361, 10, 5, 'reflect') / sailAcceleration(1361, 10, 5, 'absorb')).toBeCloseTo(2, 12);
    const side = sideForDistance(373e3, 86400, SOLAR_CONSTANT, 5, 'reflect');
    expect(side).toBeCloseTo(7.4, 1);
    expect(distanceAfter(sailAcceleration(SOLAR_CONSTANT, side, 5, 'reflect'), 86400)).toBeCloseTo(373e3, 3);
  });
});

describe('a microwave oven’s standing wave', () => {
  const lambda = wavelength(2.45e9);
  it('2.45 GHz is a 12.2 cm wave', () => {
    expect(lambda * 100).toBeCloseTo(12.24, 2);
  });
  it('the field is zero at the metal wall and the hot spots come every half wavelength', () => {
    expect(standingHeat(0, lambda)).toBe(0);
    const spots = meltedSpots(lambda, 0.02, 0.32, 0.7, 30000);
    expect(spots.length).toBeGreaterThanOrEqual(4);
    for (let i = 1; i < spots.length; i++) {
      if (spots[i].to < 0.32 && spots[i - 1].from > 0.02) {
        expect(Math.abs(spots[i].centre - spots[i - 1].centre - lambda / 2)).toBeLessThan(1e-4);
      }
    }
  });
  it('pins one wavelength apart give c; pins on neighbouring spots give half of it', () => {
    expect(speedFromPins(lambda, 2.45e9) / C).toBeCloseTo(1, 12);
    expect(speedFromPins(lambda / 2, 2.45e9) / C).toBeCloseTo(0.5, 12);
  });
});
