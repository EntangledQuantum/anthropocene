import { describe, expect, it } from 'vitest';
import {
  NUCLIDES, bindingEnergy, bindingPerNucleon, bestCut, chancePerTick, dropPeak, cutQ, decayTicks, dropDepth,
  expectedRemaining, fuseTwinQ, massDefectU, qValue, radiocarbonAge, reactionQ, reactionQPerNucleon,
  remainingByTick, semfBinding, splitHalfQ, stableZ, survivingFraction, timeToFraction, valleyDepth, valleyFloor,
} from '../nuclear.ts';

describe('measured binding: the missing mass', () => {
  it('helium-4 is 28.3 MeV lighter than two hydrogen atoms and two neutrons', () => {
    expect(bindingEnergy(NUCLIDES['He-4'])).toBeCloseTo(28.30, 1);
    // 0.76% of the parts
    const parts = 2 * NUCLIDES['H-1'].massU + 2 * NUCLIDES.n.massU;
    expect(bindingEnergy(NUCLIDES['He-4']) / 931.494 / parts).toBeCloseTo(0.0075, 3);
  });

  it('iron-56 holds each nucleon with 8.79 MeV, and nickel-62 is the tightest of all', () => {
    expect(bindingPerNucleon(NUCLIDES['Fe-56'])).toBeCloseTo(8.790, 2);
    const all = Object.values(NUCLIDES).filter((n) => n.A > 1);
    const top = all.reduce((a, b) => (bindingPerNucleon(b) > bindingPerNucleon(a) ? b : a));
    expect(top.key).toBe('Ni-62');
    expect(bindingPerNucleon(NUCLIDES['U-235'])).toBeCloseTo(7.59, 2);
  });

  it('refuses a reaction that does not conserve charge or nucleons', () => {
    expect(() => qValue(['H-2', 'H-3'], ['He-4'])).toThrow();
    expect(() => qValue(['H-2', 'H-2'], ['He-4', 'n'])).toThrow();
  });
});

describe('both ends pay', () => {
  it('D–T fusion releases 17.6 MeV, the mass the products lost', () => {
    expect(reactionQ('dt')).toBeGreaterThan(17.5);
    expect(reactionQ('dt')).toBeLessThan(17.7);
    expect(massDefectU(['H-2', 'H-3'], ['He-4', 'n'])).toBeCloseTo(0.01888, 4);
  });

  it('uranium-235 fission releases about 200 MeV once the fragments settle', () => {
    const prompt = reactionQ('u235Prompt');
    const total = reactionQ('u235ToStable');
    expect(prompt).toBeGreaterThan(165);
    expect(prompt).toBeLessThan(180);
    expect(total).toBeGreaterThan(190);
    expect(total).toBeLessThan(215);
  });

  it('per nucleon, fusion pays several times more than fission', () => {
    expect(reactionQPerNucleon('dt')).toBeCloseTo(3.5, 1);
    expect(reactionQPerNucleon('u235ToStable')).toBeLessThan(1);
    expect(reactionQPerNucleon('dt')).toBeGreaterThan(3.5 * reactionQPerNucleon('u235ToStable'));
  });

  it('fusing light nuclei and splitting heavy ones both land deeper; iron loses either way', () => {
    expect(fuseTwinQ(20)).toBeGreaterThan(0);   // neon + neon
    expect(splitHalfQ(236)).toBeGreaterThan(150);
    expect(fuseTwinQ(56)).toBeLessThan(0);
    expect(splitHalfQ(56)).toBeLessThan(0);
    expect(reactionQ('ironInHalf')).toBeLessThan(-20);
  });

  it('every nucleus between A ≈ 44 and 92 is a dead end for both moves', () => {
    for (let A = 46; A <= 88; A++) {
      expect(fuseTwinQ(A)).toBeLessThan(0);
      expect(splitHalfQ(A)).toBeLessThan(0);
    }
    expect(fuseTwinQ(30)).toBeGreaterThan(0);
    expect(splitHalfQ(120)).toBeGreaterThan(0);
  });
});

describe('the liquid drop', () => {
  it('puts iron-56 at 8.7–8.8 MeV per nucleon', () => {
    const b = semfBinding(56, 26) / 56;
    expect(b).toBeGreaterThan(8.7);
    expect(b).toBeLessThan(8.8);
    expect(stableZ(56)).toBe(26);
    expect(stableZ(238)).toBe(92);
  });

  it('peaks between A = 56 and 62, and the smooth valley bottoms out there too', () => {
    const peak = dropPeak();
    expect(peak.A).toBeGreaterThanOrEqual(56);
    expect(peak.A).toBeLessThanOrEqual(62);
    const floor = valleyFloor();
    expect(floor.A).toBeGreaterThanOrEqual(56);
    expect(floor.A).toBeLessThanOrEqual(64);
    // So flat there that iron-56 sits within 0.01 MeV of the floor.
    expect(floor.depth - valleyDepth(56)).toBeLessThan(0.01);
    expect(floor.depth).toBeGreaterThan(8.7);
    expect(floor.depth).toBeLessThan(8.85);
  });

  it('joins the measured light path smoothly at neon-20', () => {
    expect(Math.abs(dropDepth(20) - bindingPerNucleon(NUCLIDES['Ne-20']))).toBeLessThan(0.1);
    expect(valleyDepth(4)).toBeCloseTo(7.07, 2);
    expect(valleyDepth(1)).toBe(0);
  });

  it('tracks measured heavy nuclei to within 1%', () => {
    for (const k of ['Fe-56', 'Ni-62', 'Kr-92', 'Ba-141', 'Pb-208', 'U-238']) {
      const n = NUCLIDES[k];
      const drop = semfBinding(n.A, n.Z) / n.A;
      expect(Math.abs(drop / bindingPerNucleon(n) - 1)).toBeLessThan(0.01);
    }
  });

  it('splits uranium-236 for the most energy near the middle, about 180 MeV', () => {
    const best = bestCut(236, 92);
    expect(best.A1).toBeGreaterThan(108);
    expect(best.Q).toBeGreaterThan(170);
    expect(best.Q).toBeLessThan(200);
    // A small chip barely pays; a lopsided cut pays less than an even one.
    expect(cutQ(236, 92, 10).Q).toBeLessThan(20);
    expect(cutQ(236, 92, 60).Q).toBeLessThan(0.7 * best.Q);
    // Both fragments of the even cut sit deeper than the parent.
    const even = cutQ(236, 92, 118);
    expect(even.depth1).toBeGreaterThan(even.depthParent + 0.7);
  });
});

describe('stars: payouts shrink toward iron', () => {
  it('ranks the stages hydrogen > helium > silicon > iron', () => {
    const h = reactionQPerNucleon('hydrogenToHelium');
    const he = reactionQPerNucleon('heliumToCarbon');
    const si = reactionQPerNucleon('siliconToNickel');
    const fe = (semfBinding(112, 52) - 2 * semfBinding(56, 26)) / 112;
    expect(h).toBeCloseTo(6.68, 1);
    expect(he).toBeCloseTo(0.61, 1);
    expect(si).toBeCloseTo(0.20, 1);
    expect(fe).toBeLessThan(-0.2);
    expect(h).toBeGreaterThan(he);
    expect(he).toBeGreaterThan(si);
    expect(si).toBeGreaterThan(fe);
  });
});

describe('decay is a coin, not a timer', () => {
  const HALF = 10; // ticks
  const p = chancePerTick(HALF);

  it('the chance per tick for a 10-tick half-life is 6.7%, not 5%', () => {
    expect(p).toBeCloseTo(0.0670, 3);
    expect(survivingFraction(p, 10)).toBeCloseTo(0.5, 10);
    expect(survivingFraction(0.05, 10)).toBeCloseTo(0.599, 3);
  });

  it('two half-lives leave a quarter of 200, and the box is essentially never empty', () => {
    let total = 0, empties = 0;
    const runs = 400;
    for (let s = 1; s <= runs; s++) {
      const left = remainingByTick(decayTicks(200, p, 20, s), 20)[20];
      total += left;
      if (left === 0) empties++;
    }
    expect(total / runs).toBeGreaterThan(48);
    expect(total / runs).toBeLessThan(52);
    expect(empties).toBe(0);
    expect(expectedRemaining(200, 2 * HALF, HALF)).toBe(50);
    // and a few outlast a whole minute (six half-lives)
    expect(expectedRemaining(200, 60, HALF)).toBeCloseTo(3.1, 1);
  });

  it('the lesson boxes are honest, typical runs (0.1 s ticks, 10 s half-life)', () => {
    const q = chancePerTick(100);
    const hook = remainingByTick(decayTicks(200, q, 600, 21), 600);      // DecayBox default seed
    expect(Math.abs(hook[200] - 50)).toBeLessThanOrEqual(2);               // 20 s
    const alarm = remainingByTick(decayTicks(200, q, 600, 48), 600);     // the graded alarm box
    expect(Math.abs(alarm[332] - 20)).toBeLessThanOrEqual(2);              // 33.2 s
    const coin = remainingByTick(decayTicks(200, chancePerTick(10), 10, 43), 10); // LoadTheCoin
    expect(Math.abs(coin[10] - 100)).toBeLessThanOrEqual(6);
  });

  it('a seed replays the same run', () => {
    expect(decayTicks(50, p, 100, 7)).toEqual(decayTicks(50, p, 100, 7));
  });

  it('survivors are not overdue: those that lasted 30 ticks halve in the next 10 like fresh ones', () => {
    const ticks = decayTicks(20000, p, 400, 11);
    const survivors = ticks.filter((t) => t > 30);
    const halvedAfter = survivors.filter((t) => t > 40).length / survivors.length;
    expect(halvedAfter).toBeGreaterThan(0.47);
    expect(halvedAfter).toBeLessThan(0.53);
  });

  it('one in ten is left after 3.32 half-lives', () => {
    expect(timeToFraction(0.1, 10)).toBeCloseTo(33.2, 1);
    expect(timeToFraction(1 / 8, 10)).toBeCloseTo(30, 10);
  });

  it('charcoal with 1/8 of the living carbon-14 is three half-lives, about 17,200 years old', () => {
    expect(radiocarbonAge(1 / 8)).toBeCloseTo(17190, 0);
    expect(radiocarbonAge(0.5)).toBe(5730);
  });

  it('carbon-14 can beta decay to nitrogen-14: it is heavier by 0.156 MeV', () => {
    expect(() => qValue(['C-14'], ['N-14'])).toThrow();
    expect(qValue(['C-14'], ['N-14'], true)).toBeCloseTo(0.156, 2);
  });
});
