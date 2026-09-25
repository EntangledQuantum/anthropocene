/**
 * Claims made by chapter 15, "Mechanical Waves", checked against the code the
 * FlickTheRope, AimTheBead, PassThrough and DriveTheString scenes run.
 */
import { describe, expect, it } from 'vitest';
import {
  G, beadVelocity, cabs, createRope, crossingTime, drivenAmplitude, drivenHeight, drivenPattern,
  drivenTravellers, hangerForCrossing, harmonic, layPulses, maxHeight, nodeVelocity, recordRope,
  ropeDt, ropeEnergy, ropeHeight, ropeSlope, setTension, stepRope, stillPoints, timeFlick,
  travellerHeight, waveSpeed, widestSwing, type Pulse,
} from '../waves.ts';

/* The scenes' ropes, as the lessons set them up. */
const FLICK = { length: 6, cells: 240, mu: 2, beadX: 4 };             // FlickTheRope
const PASS: Pulse[] = [                                               // PassThrough
  { centre: -2, amp: 0.35, width: 0.35, speed: 2 },
  { centre: 2, amp: -0.35, width: 0.35, speed: -2 },
];
const DRIVE = { length: 4, speed: waveSpeed(16, 0.25), damping: 0.3, amp: 0.01 }; // DriveTheString

/** Position of the tallest point of the rope, m (node 0 at x0). */
function peakX(y: Float64Array, dx: number, x0: number): number {
  let k = 0;
  for (let i = 1; i < y.length; i++) if (Math.abs(y[i]) > Math.abs(y[k])) k = i;
  return x0 + k * dx;
}

describe('what sets the speed', () => {
  it('a pulse on the discretised rope travels at √(F/μ)', () => {
    for (const [F, mu] of [[4, 1], [39.24, 2], [16, 0.25], [90, 0.4]]) {
      const r = createRope({ length: 8, cells: 400, tension: F, mu });
      layPulses(r, [{ centre: 2, amp: 0.2, width: 0.3, speed: waveSpeed(F, mu) }]);
      const x1 = peakX(r.y, r.dx, 0);
      for (let k = 0; k < 150; k++) stepRope(r);
      const x2 = peakX(r.y, r.dx, 0);
      expect((x2 - x1) / r.t).toBeCloseTo(Math.sqrt(F / mu), 6);
    }
  });

  it('a bigger flick does not arrive sooner: the time to the bead ignores the height of the flick', () => {
    const tension = 4 * G;
    const times = [0.05, 0.15, 0.3, 0.55].map((amp) => timeFlick({ ...FLICK, tension, amp, dur: 0.25 })!);
    const expected = FLICK.beadX / waveSpeed(tension, FLICK.mu);
    for (const t of times) expect(Math.abs(t - expected)).toBeLessThan(2 * (FLICK.length / FLICK.cells) / waveSpeed(tension, FLICK.mu));
    expect(Math.max(...times) - Math.min(...times)).toBeLessThan(1e-9);
  });

  it('nor does a quicker or slower flick', () => {
    const tension = 4 * G;
    const times = [0.1, 0.25, 0.5].map((dur) => timeFlick({ ...FLICK, tension, amp: 0.3, dur })!);
    expect(Math.max(...times) - Math.min(...times)).toBeLessThan(2 * ropeDt(createRope({ ...FLICK, tension })));
  });

  it('the hanger task: half the time takes four times the load, and twice the load is not enough', () => {
    const base = crossingTime(FLICK.beadX, 4, FLICK.mu);
    expect(base).toBeCloseTo(0.903, 3);
    expect(hangerForCrossing(FLICK.beadX, base / 2, FLICK.mu)).toBeCloseTo(16, 9);
    const doubled = crossingTime(FLICK.beadX, 8, FLICK.mu);
    expect(doubled / base).toBeCloseTo(1 / Math.SQRT2, 9);
    expect(doubled).toBeCloseTo(0.639, 3);
    // measured on the rope, not just from the formula
    const t16 = timeFlick({ ...FLICK, tension: 16 * G, amp: 0.3, dur: 0.25 })!;
    expect(Math.abs(t16 - base / 2) / (base / 2)).toBeLessThan(0.01);
    // the scene's 2.5 % window accepts only 16 kg among whole kilograms
    const ok = Array.from({ length: 20 }, (_, i) => i + 1)
      .filter((m) => Math.abs(crossingTime(FLICK.beadX, m, FLICK.mu) - base / 2) <= 0.025 * base / 2);
    expect(ok).toEqual([16]);
  });

  it('changing the tension mid-run keeps the rope’s shape and velocity', () => {
    const r = createRope({ length: 6, cells: 240, tension: 10, mu: 1 });
    layPulses(r, [{ centre: 2, amp: 0.3, width: 0.3, speed: waveSpeed(10, 1) }]);
    const v = nodeVelocity(r, 100), y = r.y[100];
    setTension(r, 40);
    expect(r.y[100]).toBe(y);
    expect(nodeVelocity(r, 100)).toBeCloseTo(v, 12);
  });

  it('the rank-order ropes, slowest to fastest', () => {
    const ropes = { 'heavy-slack': [10, 0.4], chain: [40, 0.9], 'light-slack': [10, 0.1], 'heavy-tight': [90, 0.4], 'light-tight': [40, 0.1] };
    const v = Object.fromEntries(Object.entries(ropes).map(([k, [F, mu]]) => [k, waveSpeed(F, mu)]));
    expect(v).toEqual({ 'heavy-slack': 5, chain: expect.closeTo(6.67, 2), 'light-slack': 10, 'heavy-tight': 15, 'light-tight': 20 });
    const order = Object.keys(v).sort((a, b) => v[a] - v[b]);
    expect(order).toEqual(['heavy-slack', 'chain', 'light-slack', 'heavy-tight', 'light-tight']);
  });
});

describe('the bead only goes up and down', () => {
  const one: Pulse[] = [{ centre: 0, amp: 0.35, width: 0.35, speed: 2 }];

  it('a bead on the front of a right-moving pulse rises, at the pulse speed times the slope', () => {
    expect(beadVelocity(one, 0.25)).toBeCloseTo(-2 * ropeSlope(one, 0.25), 12);
    expect(beadVelocity(one, 0.25)).toBeCloseTo(1.715, 3);
    expect(beadVelocity(one, -0.25)).toBeCloseTo(-1.715, 3); // the back falls
  });

  it('the discretised rope agrees with the travelling form', () => {
    const r = createRope({ length: 8, cells: 800, tension: 4, mu: 1 });
    layPulses(r, one, -4);
    for (let k = 0; k < 40; k++) stepRope(r);
    const i = Math.round((0.25 + 4) / r.dx);
    const x = -4 + i * r.dx;
    expect(nodeVelocity(r, i)).toBeCloseTo(beadVelocity(one, x, r.t - ropeDt(r) / 2), 2);
  });

  it('after the pulse has passed, every bead is back where it started', () => {
    const r = createRope({ length: 8, cells: 400, tension: 4, mu: 1 });
    layPulses(r, [{ centre: 1.5, amp: 0.35, width: 0.35, speed: 2 }]);
    const bead = Math.round(3 / r.dx);
    let top = 0;
    for (let k = 0; k < 160; k++) { stepRope(r); top = Math.max(top, r.y[bead]); }
    expect(top).toBeCloseTo(0.35, 2);           // it was lifted by the full hump…
    expect(Math.abs(r.y[bead])).toBeLessThan(1e-6); // …and set back down
  });
});

describe('two pulses walk through each other', () => {
  const r = createRope({ length: 8, cells: 400, tension: 4, mu: 1 });
  layPulses(r, PASS, -4);
  const E0 = ropeEnergy(r).total;
  const frames = recordRope(r, 200);
  const meet = 100; // 2 m at 2 m/s is 1 s; dt = 0.02 m / 2 m/s = 0.01 s

  it('the scene’s frames are 0.01 s apart and the meeting is frame 100', () => {
    expect(ropeDt(r)).toBeCloseTo(0.01, 12);
  });

  it('at the meeting instant the rope is flat', () => {
    expect(Math.max(...frames[meet].map(Math.abs))).toBeLessThan(1e-12);
  });

  it('the flat rope still holds all of the energy, as motion', () => {
    const s = createRope({ length: 8, cells: 400, tension: 4, mu: 1 });
    layPulses(s, PASS, -4);
    for (let k = 0; k < meet; k++) stepRope(s);
    const e = ropeEnergy(s);
    expect(Math.abs(e.stretch)).toBeLessThan(1e-12);
    expect(e.motion / E0).toBeCloseTo(1, 9);
    expect(maxHeight(s)).toBeLessThan(1e-12);
  });

  it('energy is conserved throughout', () => {
    const s = createRope({ length: 8, cells: 400, tension: 4, mu: 1 });
    layPulses(s, PASS, -4);
    for (let k = 0; k < 200; k++) { stepRope(s); expect(ropeEnergy(s).total / E0).toBeCloseTo(1, 9); }
  });

  it('afterwards both pulses carry on with their shapes unchanged', () => {
    for (let i = 0; i < frames[200].length; i++) {
      const x = -4 + i * r.dx;
      expect(frames[200][i]).toBeCloseTo(ropeHeight(PASS, x, 2), 9);
    }
  });

  it('on the flat rope, the bead just left of the middle moves down fast', () => {
    const atMeet: Pulse[] = PASS.map((p) => ({ ...p, centre: p.centre + p.speed * 1 }));
    expect(ropeHeight(atMeet, -0.25)).toBeCloseTo(0, 12);
    expect(beadVelocity(atMeet, -0.25)).toBeCloseTo(-3.43, 2);
    expect(beadVelocity(atMeet, 0)).toBeCloseTo(0, 12); // the very middle is still
  });

  it('a fixed end sends a pulse back upside down', () => {
    const s = createRope({ length: 4, cells: 400, tension: 4, mu: 1 });
    layPulses(s, [{ centre: 2, amp: 0.3, width: 0.25, speed: 2 }]);
    for (let k = 0; k < 400; k++) stepRope(s); // 400 × 0.005 s = 2 s: 2 m to the wall and 2 m back
    let lo = 0;
    for (const v of s.y) lo = Math.min(lo, v);
    expect(lo).toBeCloseTo(-0.3, 2);
  });
});

describe('the driven rope', () => {
  const v = DRIVE.speed;

  it('the scene’s rope: 8 m/s, harmonics at 1, 2 and 3 Hz', () => {
    expect(v).toBe(8);
    expect([1, 2, 3].map((n) => harmonic(n, 4, v))).toEqual([1, 2, 3]);
  });

  it('the swing peaks where n half-wavelengths fit, fₙ = n v / 2L', () => {
    for (const n of [1, 2, 3]) {
      let best = 0, bestF = 0;
      for (let f = harmonic(n, 4, v) - 0.3; f <= harmonic(n, 4, v) + 0.3; f += 0.002) {
        const s = cabs(drivenAmplitude({ ...DRIVE, freq: f }, 4 / (2 * n)));
        if (s > best) { best = s; bestF = f; }
      }
      expect(Math.abs(bestF - harmonic(n, 4, v)) / harmonic(n, 4, v)).toBeLessThan(0.01);
    }
  });

  it('at resonance the 1 cm shaker drives a swing about 13 times as wide', () => {
    const peak = widestSwing({ ...DRIVE, freq: 2 });
    expect(peak / DRIVE.amp).toBeGreaterThan(12);
    expect(peak / DRIVE.amp).toBeLessThan(15);
  });

  it('between harmonics the rope still shakes, at the shaker’s rate, but barely', () => {
    const d = { ...DRIVE, freq: 1.5 };
    expect(widestSwing(d)).toBeLessThan(0.03);
    // the motion repeats with the shaker's period, not with any period of the rope's own
    for (const x of [0.7, 2.1, 3.3]) expect(drivenHeight(d, x, 0.37 + 1 / 1.5)).toBeCloseTo(drivenHeight(d, x, 0.37), 12);
  });

  it('two loops: the still point sits at the middle of the rope', () => {
    const pts = stillPoints({ ...DRIVE, freq: 2 });
    expect(pts.length).toBe(1);
    expect(pts[0]).toBeCloseTo(2, 1);
  });

  it('three loops: still points at a third and two thirds', () => {
    const pts = stillPoints({ ...DRIVE, freq: 3 });
    expect(pts.length).toBe(2);
    expect(pts[0]).toBeCloseTo(4 / 3, 1);
    expect(pts[1]).toBeCloseTo(8 / 3, 1);
  });

  it('the grader: resonant only close to a harmonic, and it counts the loops', () => {
    expect(drivenPattern({ ...DRIVE, freq: 2 })).toMatchObject({ n: 2, resonant: true });
    expect(drivenPattern({ ...DRIVE, freq: 1 })).toMatchObject({ n: 1, resonant: true });
    expect(drivenPattern({ ...DRIVE, freq: 1.8 }).resonant).toBe(false);
    expect(drivenPattern({ ...DRIVE, freq: 2.2 }).resonant).toBe(false);
  });

  it('the standing wave is two equal travellers going opposite ways', () => {
    const d = { ...DRIVE, freq: 2 };
    for (const x of [0.3, 1.1, 2.5, 3.7]) {
      const { right, left } = drivenTravellers(d, x);
      const Y = drivenAmplitude(d, x);
      expect(right.re + left.re).toBeCloseTo(Y.re, 12);
      expect(right.im + left.im).toBeCloseTo(Y.im, 12);
      expect(cabs(right) / cabs(left)).toBeGreaterThan(0.85);
      expect(cabs(right) / cabs(left)).toBeLessThan(1.15);
      expect(travellerHeight(right, 2, 0.1) + travellerHeight(left, 2, 0.1)).toBeCloseTo(drivenHeight(d, x, 0.1), 12);
    }
    // the right traveller really moves right: with e^{iωt}, its phase falls by k per metre,
    // so a crest one metre on (a quarter of the 4 m wavelength) arrives a quarter-period later
    const arg = (x: number) => { const r = drivenTravellers(d, x).right; return Math.atan2(r.im, r.re); };
    const dphi = ((arg(1.5) - arg(0.5)) + 3 * Math.PI) % (2 * Math.PI) - Math.PI;
    expect(dphi).toBeCloseTo(-Math.PI / 2, 2);
    const argL = (x: number) => { const l = drivenTravellers(d, x).left; return Math.atan2(l.im, l.re); };
    const dphiL = ((argL(1.5) - argL(0.5)) + 3 * Math.PI) % (2 * Math.PI) - Math.PI;
    expect(dphiL).toBeCloseTo(Math.PI / 2, 2);
  });

  it('the settled formula is what the discretised rope settles into', () => {
    const d = { ...DRIVE, freq: 2 };
    const r = createRope({ length: 4, cells: 400, tension: 16, mu: 0.25, damping: DRIVE.damping });
    const w = 2 * Math.PI * d.freq;
    // start the shaker smoothly at its cosine phase; let the transient die away
    while (r.t < 45) stepRope(r, d.amp * Math.cos(w * (r.t + ropeDt(r))));
    const peak = widestSwing(d);
    let worst = 0;
    for (let i = 0; i < r.y.length; i += 10) worst = Math.max(worst, Math.abs(r.y[i] - drivenHeight(d, i * r.dx, r.t)));
    expect(worst / peak).toBeLessThan(0.03);
  });

  it('the classify step: what moves the lowest note', () => {
    const f1 = (F: number, mu: number, L: number) => harmonic(1, L, waveSpeed(F, mu));
    const base = f1(16, 0.25, 4);
    expect(f1(64, 0.25, 4) / base).toBeCloseTo(2, 12);   // four times the tension: doubled
    expect(f1(16, 0.25, 8) / base).toBeCloseTo(0.5, 12); // twice as long: halved
    expect(f1(16, 1, 4) / base).toBeCloseTo(0.5, 12);    // four times heavier: halved
    // shaking harder: the pattern scales, the resonant frequency does not
    expect(widestSwing({ ...DRIVE, amp: 0.02, freq: 2 }) / widestSwing({ ...DRIVE, freq: 2 })).toBeCloseTo(2, 9);
  });
});
