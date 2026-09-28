import { describe, expect, it } from 'vitest';
import {
  CH29_COIL, CH29_EDGE, CH29_PIPE, CH29_RAILS, G, MU0, chargeThroughCoil, coilCurrent, coilEmf, coilLinkage,
  dipoleFlux, dipoleFluxSlope, edgeCurrent, edgeFlux, emfFromLinkage, fallStep, fieldLineRadius, followStep,
  holdForce, pipeDragByRings, pipeDragCoefficient, pipeFallTime, pushForPower, railState, railStep,
  railTerminalSpeed, ringOnFallingMagnet, settledPower, terminalSpeed, uniformFlux,
} from '../induction.ts';

describe('flux', () => {
  it('uniform flux is B A cos θ: zero edge-on', () => {
    expect(uniformFlux(0.5, 2)).toBeCloseTo(1, 12);
    expect(uniformFlux(0.5, 2, Math.PI / 2)).toBeCloseTo(0, 12);
  });
  it('the dipole flux slope is the derivative of the flux', () => {
    for (const z of [-0.1, -0.02, 0.01, 0.07]) {
      const h = 1e-7;
      const num = (dipoleFlux(1, 0.05, z + h) - dipoleFlux(1, 0.05, z - h)) / (2 * h);
      expect(dipoleFluxSlope(1, 0.05, z)).toBeCloseTo(num, 9);
    }
  });
  it('the field line r = R sin²θ with R = μ0 m / 2Φ threads exactly Φ through a ring it crosses', () => {
    const m = 1, phi = 2e-6, R = fieldLineRadius(m, phi);
    for (const th of [0.4, 0.9, 1.3]) {
      const r = R * Math.sin(th) ** 2;
      const a = r * Math.sin(th), z = r * Math.cos(th);
      expect(dipoleFlux(m, a, z)).toBeCloseTo(phi, 12);
    }
  });
});

describe('lesson 1: magnet and coil', () => {
  it('a magnet at rest drives no current, however much flux it threads', () => {
    for (const x of [-0.2, -0.03, 0, 0.04]) expect(Math.abs(coilEmf(x, 0))).toBe(0);
    // centre of the coil: the most flux, still nothing
    expect(coilLinkage(0)).toBeGreaterThan(coilLinkage(-0.1));
    expect(Math.abs(coilCurrent(0, 0))).toBe(0);
  });
  it('the EMF is proportional to the speed', () => {
    const e1 = coilEmf(-0.03, 0.5), e3 = coilEmf(-0.03, 1.5);
    expect(e3 / e1).toBeCloseTo(3, 12);
  });
  it('agrees with differencing the linkage in time', () => {
    const x = -0.04, v = 0.8, dt = 1e-6;
    expect(emfFromLinkage(coilLinkage(x - v * dt / 2), coilLinkage(x + v * dt / 2), dt)).toBeCloseTo(coilEmf(x, v), 8);
  });
  it('pushing in and pulling out kick the needle opposite ways; out either side kicks the same way', () => {
    expect(Math.sign(coilCurrent(-0.03, +1))).toBe(-1); // in from the left
    expect(Math.sign(coilCurrent(-0.03, -1))).toBe(1);  // out to the left
    expect(Math.sign(coilCurrent(+0.03, +1))).toBe(1);  // out to the right
  });
  it('the scene numbers: a brisk 1 m/s pull kicks past 5 mA, a slow 0.3 m/s one does not', () => {
    let peakFast = 0, peakSlow = 0;
    for (let x = 0; x < 0.3; x += 0.001) {
      peakFast = Math.max(peakFast, coilCurrent(x, 1));
      peakSlow = Math.max(peakSlow, coilCurrent(x, 0.3));
    }
    expect(peakFast).toBeGreaterThan(5e-3);
    expect(peakSlow).toBeLessThan(2.5e-3);
  });
  it('the charge that flows depends only on the flux change, not on the speed', () => {
    const run = (speed: number) => {
      let q = 0, x = 0, dt = 1e-5;
      while (x < 0.3) { q += coilCurrent(x + speed * dt / 2, speed) * dt; x += speed * dt; }
      return q;
    };
    const q1 = run(0.2), q2 = run(2);
    expect(q2).toBeCloseTo(q1, 7);
    expect(q1).toBeCloseTo(chargeThroughCoil(0, 0.3), 7);
  });
  it('Lenz: the induced current always opposes the change of linkage', () => {
    for (let i = 0; i < 200; i++) {
      const x = (Math.random() - 0.5) * 0.4, v = (Math.random() - 0.5) * 4;
      const dLdt = (coilLinkage(x + v * 1e-7) - coilLinkage(x)) / 1e-7;
      // the current's own linkage (L I, L > 0) has the opposite sign to dλ/dt
      expect(coilCurrent(x, v) * dLdt).toBeLessThanOrEqual(1e-18);
    }
  });
  it('the follower settles on the hand without overshoot', () => {
    let x = 0, v = 0, maxX = 0;
    for (let i = 0; i < 2000; i++) { [x, v] = followStep(x, v, 0.1, 5e-4); maxX = Math.max(maxX, x); }
    expect(x).toBeCloseTo(0.1, 4);
    expect(maxX).toBeLessThan(0.1 + 1e-4);
  });
});

describe('lesson 1: a loop and a field with an edge', () => {
  const f = CH29_EDGE;
  it('carrying the loop inside the field changes nothing: zero EMF', () => {
    expect(Math.abs(edgeCurrent([0.2, 0], [0.4, 0.05], 0.1))).toBe(0);
  });
  it('sliding along the edge, half in, changes nothing either', () => {
    expect(edgeCurrent([0, -0.05], [0, 0.05], 0.1)).toBeCloseTo(0, 15);
  });
  it('crossing the edge at speed v gives B s v, the motional EMF', () => {
    const v = 0.5, dt = 0.01;
    const I = edgeCurrent([-0.02, 0], [-0.02 + v * dt, 0], dt);
    expect(Math.abs(I) * f.R).toBeCloseTo(f.B * f.side * v, 10);
  });
  it('Lenz: entering drives counterclockwise (field out, against the growing inward flux); leaving, clockwise', () => {
    expect(edgeCurrent([-0.02, 0], [0.0, 0], 0.01)).toBeGreaterThan(0);
    expect(edgeCurrent([0.6, 0], [0.62, 0], 0.01)).toBeLessThan(0);
    for (let i = 0; i < 200; i++) {
      const p0: [number, number] = [Math.random() * 0.9 - 0.2, Math.random() * 0.5 - 0.25];
      const p1: [number, number] = [p0[0] + (Math.random() - 0.5) * 0.02, p0[1] + (Math.random() - 0.5) * 0.02];
      const dPhi = edgeFlux(p1[0], p1[1]) - edgeFlux(p0[0], p0[1]);
      expect(edgeCurrent(p0, p1, 0.01) * dPhi).toBeLessThanOrEqual(0);
    }
  });
});

describe('lesson 2: the falling magnet', () => {
  it('the ring-by-ring sum matches the closed-form drag', () => {
    const k = pipeDragCoefficient('copper');
    expect(pipeDragByRings('copper') / k).toBeCloseTo(1, 3);
  });
  it('plastic and a slotted pipe give no drag: free fall, 0.45 s for 1 m', () => {
    for (const kind of ['plastic', 'slotted'] as const) {
      expect(pipeDragCoefficient(kind)).toBe(0);
      expect(pipeFallTime(kind)).toBeCloseTo(Math.sqrt(2 / G), 10);
    }
    expect(pipeFallTime('plastic')).toBeCloseTo(0.45, 2);
  });
  it('the copper pipe takes about 9 s, some twenty times longer', () => {
    const t = pipeFallTime('copper');
    expect(t).toBeGreaterThan(8.5);
    expect(t).toBeLessThan(9.5);
    expect(t / pipeFallTime('plastic')).toBeGreaterThan(18);
    const vt = terminalSpeed(CH29_PIPE.M, pipeDragCoefficient('copper'));
    expect(vt).toBeGreaterThan(0.1);
    expect(vt).toBeLessThan(0.13);
  });
  it('the exact fall step agrees with the closed-form fall time', () => {
    const k = pipeDragCoefficient('copper');
    let y = 0, v = 0, t = 0; const dt = 1e-3;
    while (y < CH29_PIPE.L) { [y, v] = fallStep(y, v, dt, k, CH29_PIPE.M); t += dt; }
    expect(Math.abs(t - pipeFallTime('copper'))).toBeLessThan(2e-3);
  });
  it('Lenz: the ring below gets a north face on top and pushes up; the ring above a north face below and pulls up', () => {
    const v = 0.11, dz = 0.005, a = CH29_PIPE.a;
    const below = ringOnFallingMagnet(-a / 2, v, dz);
    const above = ringOnFallingMagnet(+a / 2, v, dz);
    expect(below.I).toBeGreaterThan(0);
    expect(above.I).toBeLessThan(0);
    expect(below.force).toBeGreaterThan(0);
    expect(above.force).toBeGreaterThan(0);
    // each current opposes the change of flux through its own ring
    expect(below.I * below.dPhiDt).toBeLessThan(0);
    expect(above.I * above.dPhiDt).toBeLessThan(0);
    // the wrong direction would push the magnet down
    expect(ringOnFallingMagnet(-a / 2, v, dz, 'copper', CH29_PIPE, -1).force).toBeLessThan(0);
    expect(ringOnFallingMagnet(+a / 2, v, dz, 'copper', CH29_PIPE, 1).force).toBeLessThan(0);
  });
  it('the rings’ forces add up to k v, and their heat equals the work the drag takes', () => {
    const v = 0.11, a = CH29_PIPE.a, dz = a / 200;
    let F = 0, heat = 0;
    for (let z = -60 * a; z <= 60 * a; z += dz) { const r = ringOnFallingMagnet(z, v, dz); F += r.force; heat += r.emf * r.I; }
    const k = pipeDragCoefficient('copper');
    expect(F / (k * v)).toBeCloseTo(1, 3);
    expect(heat / (F * v)).toBeCloseTo(1, 6);
  });
  it('MU0 is the SI value', () => expect(MU0 / (4e-7 * Math.PI)).toBeCloseTo(1, 8));
});

describe('lesson 2: the bar on rails', () => {
  const r = CH29_RAILS;
  it('the EMF is proportional to the speed', () => {
    expect(railState(3, 0).emf / railState(1, 0).emf).toBeCloseTo(3, 12);
    expect(railState(2.5, 0).emf).toBeCloseTo(2, 12);
  });
  it('a steady push settles the bar where the drag matches it; then P_mech = P_elec', () => {
    const F = pushForPower(4);
    expect(F).toBeCloseTo(1.6, 12);
    let v = 0;
    for (let i = 0; i < 12000; i++) v = railStep(v, F, 1e-3);
    expect(v).toBeCloseTo(railTerminalSpeed(F), 9);
    expect(v).toBeCloseTo(2.5, 9);
    const s = railState(v, F);
    expect(s.drag).toBeCloseTo(F, 9);
    expect(s.Pmech).toBeCloseTo(s.Pelec, 9);
    expect(s.Pelec).toBeCloseTo(4, 9);
    expect(settledPower(F)).toBeCloseTo(4, 12);
  });
  it('over a whole run, work in = kinetic energy + heat in the bulb', () => {
    const F = 1.2; let v = 0, Win = 0, heat = 0; const dt = 1e-5;
    for (let t = 0; t < 1.5; t += dt) {
      const v1 = railStep(v, F, dt), vm = (v + v1) / 2;
      Win += F * vm * dt; heat += railState(vm, F).Pelec * dt; v = v1;
    }
    expect((0.5 * r.m * v * v + heat) / Win).toBeCloseTo(1, 5);
  });
  it('the drag always opposes the motion (Lenz)', () => {
    for (const v of [-2, -0.1, 0.3, 5]) expect(railState(v, 0).accel * v).toBeLessThan(0);
  });
  it('the push to hold 3 m/s ranks: switch open < 4 Ω bulb < 1 Ω bulb < 1 Ω with the field doubled', () => {
    const open = holdForce(3, { ...r, R: Infinity });
    const dim = holdForce(3, { ...r, R: 4 });
    const base = holdForce(3, r);
    const strong = holdForce(3, { ...r, B: 2 * r.B });
    expect(open).toBe(0);
    expect(dim).toBeLessThan(base);
    expect(base).toBeLessThan(strong);
    expect(dim).toBeCloseTo(0.48, 12);
    expect(base).toBeCloseTo(1.92, 12);
    expect(strong).toBeCloseTo(7.68, 12);
    // a heavier bar needs no extra push once steady
    expect(holdForce(3, { ...r, m: 2 * r.m })).toBe(base);
  });
});

describe('the numbers the lesson text quotes', () => {
  it('pulling the magnet from the centre to the end of its travel sends 0.31 mC round the coil', () => {
    expect(chargeThroughCoil(0, 0.34) * 1000).toBeCloseTo(0.31, 2);
    expect(chargeThroughCoil(0, -0.34)).toBeCloseTo(chargeThroughCoil(0, 0.34), 12);
    expect(CH29_COIL.N).toBe(500);
  });
  it('the two frozen rings, one radius either side, brake the magnet with about 25 mN of its 100 mN weight', () => {
    const vt = terminalSpeed(CH29_PIPE.M, pipeDragCoefficient('copper'));
    const two = ringOnFallingMagnet(-CH29_PIPE.a, vt, 0.004).force + ringOnFallingMagnet(CH29_PIPE.a, vt, 0.004).force;
    expect(two * 1000).toBeGreaterThan(24);
    expect(two * 1000).toBeLessThan(26);
    expect(CH29_PIPE.M * G * 1000).toBeCloseTo(100, 0);
  });
  it('the copper magnet reaches its terminal speed within a centimetre', () => {
    const k = pipeDragCoefficient('copper');
    let y = 0, v = 0;
    while (y < 0.01) [y, v] = fallStep(y, v, 1e-4, k, CH29_PIPE.M);
    expect(v / terminalSpeed(CH29_PIPE.M, k)).toBeGreaterThan(0.99);
  });
  it('the rails at 3 m/s: 2.4 V, and with the 1 Ω bulb 2.4 A', () => {
    const s = railState(3, 0);
    expect(s.emf).toBeCloseTo(2.4, 12);
    expect(s.I).toBeCloseTo(2.4, 12);
  });
});
