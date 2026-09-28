import { describe, expect, it } from 'vitest';
import {
  ELEMENTS, IONIZATION_EV, aufbau, configPlain, configString, fillingOrder, ionizationEV, outerSubshell,
  shellCapacity, slaterZeff, subshellCapacity,
} from '../aufbau.ts';

/** Ground configurations, H to Ca, from any periodic table. */
const KNOWN: Record<number, string> = {
  1: '1s1', 2: '1s2', 3: '1s2 2s1', 4: '1s2 2s2', 5: '1s2 2s2 2p1', 6: '1s2 2s2 2p2', 7: '1s2 2s2 2p3',
  8: '1s2 2s2 2p4', 9: '1s2 2s2 2p5', 10: '1s2 2s2 2p6', 11: '1s2 2s2 2p6 3s1', 12: '1s2 2s2 2p6 3s2',
  13: '1s2 2s2 2p6 3s2 3p1', 14: '1s2 2s2 2p6 3s2 3p2', 15: '1s2 2s2 2p6 3s2 3p3', 16: '1s2 2s2 2p6 3s2 3p4',
  17: '1s2 2s2 2p6 3s2 3p5', 18: '1s2 2s2 2p6 3s2 3p6', 19: '1s2 2s2 2p6 3s2 3p6 4s1',
  20: '1s2 2s2 2p6 3s2 3p6 4s2',
};

describe('exclusion counts the slots', () => {
  it('a subshell holds 2(2l+1): s 2, p 6, d 10, f 14', () => {
    expect([0, 1, 2, 3].map(subshellCapacity)).toEqual([2, 6, 10, 14]);
  });
  it('a shell holds 2n²: 2, 8, 18, 32', () => {
    expect([1, 2, 3, 4].map(shellCapacity)).toEqual([2, 8, 18, 32]);
  });
});

describe('the filling order builds the periodic table', () => {
  it('fills 1s 2s 2p 3s 3p 4s 3d 4p 5s', () => {
    expect(fillingOrder().slice(0, 9).map((s) => s.label)).toEqual(['1s', '2s', '2p', '3s', '3p', '4s', '3d', '4p', '5s']);
  });

  it('gives the known ground configuration for every element from H to Ca', () => {
    for (let Z = 1; Z <= 20; Z++) expect(configPlain(aufbau(Z)), ELEMENTS[Z - 1].name).toBe(KNOWN[Z]);
  });

  it('writes sodium as 1s² 2s² 2p⁶ 3s¹', () => {
    expect(configString(aufbau(11))).toBe('1s² 2s² 2p⁶ 3s¹');
  });

  it('noble gases close a p subshell (or 1s); alkali metals hold one electron alone in a new s', () => {
    for (const Z of [2, 10, 18]) { const o = outerSubshell(Z); expect(o.count).toBe(o.capacity); }
    for (const Z of [3, 11, 19]) { const o = outerSubshell(Z); expect(o.l).toBe(0); expect(o.count).toBe(1); }
  });
});

describe('the ionisation sawtooth (measured)', () => {
  it('peaks at the noble gases and bottoms out at the alkali metal right after', () => {
    for (const Z of [2, 10, 18]) {
      expect(ionizationEV(Z)).toBeGreaterThan(ionizationEV(Z - 1));
      expect(ionizationEV(Z + 1)).toBeLessThan(ionizationEV(Z) / 2.9);
    }
    expect(Math.max(...IONIZATION_EV.slice(2, 10))).toBe(ionizationEV(10));
    expect(Math.max(...IONIZATION_EV.slice(10, 18))).toBe(ionizationEV(18));
  });

  it('ranks K < Na < Li < Ar < Ne, the order the lesson asks for', () => {
    const order = [19, 11, 3, 18, 10].map(ionizationEV);
    for (let i = 1; i < order.length; i++) expect(order[i]).toBeGreaterThan(order[i - 1]);
  });

  it('sodium gives its outer electron up for about a quarter of what neon asks', () => {
    expect(ionizationEV(11) / ionizationEV(10)).toBeGreaterThan(0.2);
    expect(ionizationEV(11) / ionizationEV(10)).toBeLessThan(0.25);
  });
});

describe('screening (Slater, a model) explains the sawtooth', () => {
  it('gives the textbook effective charges', () => {
    expect(slaterZeff(3, 2, 0)).toBeCloseTo(1.3, 6);
    expect(slaterZeff(10, 2, 1)).toBeCloseTo(5.85, 6);
    expect(slaterZeff(11, 3, 0)).toBeCloseTo(2.2, 6);
    expect(slaterZeff(19, 4, 0)).toBeCloseTo(2.2, 6);
  });

  it('the outer electron feels far less charge right after each noble gas', () => {
    for (const Z of [2, 10, 18]) {
      const a = outerSubshell(Z), b = outerSubshell(Z + 1);
      expect(slaterZeff(Z + 1, b.n, b.l)).toBeLessThan(slaterZeff(Z, a.n, a.l) / 1.3);
    }
  });

  it('in potassium a 4s electron feels more charge than a 3d one would, so 4s fills first', () => {
    // 3d would be screened by all 18 inner electrons; 4s dives inside some of them.
    const zd = 19 - 18; // one 3d electron outside [Ar]: Slater gives 1.00 per inner electron
    expect(slaterZeff(19, 4, 0)).toBeGreaterThan(zd);
    const e4s = -13.6 * (slaterZeff(19, 4, 0) / 3.7) ** 2;
    const e3d = -13.6 * (zd / 3) ** 2;
    expect(e4s).toBeLessThan(e3d);
  });
});
