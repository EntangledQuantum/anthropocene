/**
 * Claims made by "Nothing has to keep it going" (chapter 4, lesson 1), checked
 * against the same dynamics the HoldToPush and CancelTheArrow scenes run.
 */
import { describe, expect, it } from 'vitest';
import { accelerationOn, createWorld, netForceOn, step, weight, type Force } from '../dynamics.ts';
import { mag2 } from '../vectors.ts';

describe('hold to push', () => {
  const run = (pushFor: number, total: number) => {
    const w = createWorld({
      bodies: [{ id: 'puck', label: 'puck', mass: 2, pos: [0, 0], vel: [4, 0], size: 0.4 }],
      forces: [
        { id: 'w', on: 'puck', by: 'Earth', kind: 'gravity', vec: [0, -weight(2)] },
        { id: 'push', on: 'puck', by: 'you', kind: 'applied', vec: [6, 0] },
      ],
      surface: { angleRad: 0, muS: 0, muK: 0 },
    });
    const speeds: { t: number; v: number }[] = [];
    while (w.t < total - 1e-9) {
      if (w.t >= pushFor - 1e-9) w.forces = w.forces.filter((f) => f.id !== 'push');
      step(w, 1 / 240);
      speeds.push({ t: w.t, v: w.bodies[0].vel[0] });
    }
    return speeds;
  };

  it('a steady 6 N on 2 kg climbs at 3 m/s² and never levels off while pushing', () => {
    const s = run(10, 3);
    const at = (t: number) => s.find((p) => p.t >= t - 1e-9)!.v;
    expect(at(1)).toBeCloseTo(7, 2);
    expect(at(2)).toBeCloseTo(10, 2);
    expect(at(3)).toBeCloseTo(13, 2);
  });

  it('reaching 10 m/s from 4 m/s takes exactly 2 s of pushing', () => {
    const s = run(2, 2);
    expect(s[s.length - 1].v).toBeCloseTo(10, 2);
  });

  it('after release the speed is flat: no decay back to 4 m/s, no creep to zero', () => {
    const s = run(2, 8).filter((p) => p.t > 2.01);
    const vs = s.map((p) => p.v);
    expect(Math.max(...vs) - Math.min(...vs)).toBeLessThan(1e-9);
    expect(vs[0]).toBeCloseTo(10, 2);
  });
});

describe('cancel the arrow', () => {
  const fixed: Force[] = [
    { id: 'a', on: 'body', by: 'A', kind: 'applied', vec: [20, 0] },
    { id: 'b', on: 'body', by: 'B', kind: 'applied', vec: [0, 20] },
  ];
  it('the cancelling force is 20√2 ≈ 28 N pointing down-left, where neither given force points', () => {
    const mine: Force = { id: 'm', on: 'body', by: 'you', kind: 'applied', vec: [-20, -20] };
    expect(mag2(netForceOn('body', [...fixed, mine]))).toBeLessThan(1e-12);
    expect(mag2(mine.vec)).toBeCloseTo(28.28, 2);
  });
  it('the start position leaves the crate accelerating', () => {
    const mine: Force = { id: 'm', on: 'body', by: 'you', kind: 'applied', vec: [12, -6] };
    expect(mag2(accelerationOn('body', 8, [...fixed, mine]))).toBeGreaterThan(4);
  });
});
