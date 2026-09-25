/**
 * Claims made by chapter 17, "Temperature and Heat", checked against the code
 * the DropTheIron, HeatThePot, MeltTheIce, ChillTheDrink, TouchTheBench and
 * CoolBoxDay scenes run.
 */
import { describe, expect, it } from 'vitest';
import {
  C_ICE, C_WATER, L_FUSION, MATERIALS, SKIN_T,
  conductionPower, contactFlux, coolBoxAt, drinkEnthalpy, drinkSettles, effusivity, equilibrate,
  exchange, feltTemperature, heatFor, heatLedger, heatWater, liftForWarming, mixTemperature,
  partnerMassFor, plateauRatio, stepDrink, thinnestWall, totalEnthalpy, warmTogether,
  waterEnthalpy, waterFromEnthalpy, type Drink, type Lump,
} from '../heat.ts';
import { G_EARTH } from '../dynamics.ts';

const { iron, water, steel, wood, polystyrene } = MATERIALS;

/* ── lesson 1: the water wins ──────────────────────────────────────────── */

describe('iron dropped into water', () => {
  const hot: Lump = { m: 1, c: iron.c, T: 100 };
  const cold: Lump = { m: 1, c: water.c, T: 20 };

  it('lands much nearer the water than the midpoint (the hook)', () => {
    const Tf = mixTemperature([hot, cold]);
    expect(Tf).toBeCloseTo(27.75, 1);
    expect(Math.abs(Tf - 20)).toBeLessThan(Math.abs(Tf - 60));
  });

  it('the iron loses exactly what the water gains, about 32 kJ', () => {
    const [qIron, qWater] = heatLedger([hot, cold]);
    expect(qIron + qWater).toBeCloseTo(0, 6);
    expect(qWater / 1000).toBeCloseTo(32.4, 1);
    // …while the temperature changes are wildly unequal: heat is not temperature.
    const Tf = mixTemperature([hot, cold]);
    expect((hot.T - Tf) / (Tf - cold.T)).toBeCloseTo(water.c / iron.c, 6);
  });

  it('a third of a litre of water brings a kilogram of iron to 40 °C (step 2)', () => {
    const m = partnerMassFor(hot, water.c, 20, 40);
    expect(m).toBeCloseTo(0.322, 3);
    expect(mixTemperature([hot, { m, c: water.c, T: 20 }])).toBeCloseTo(40, 9);
    // the scene's ±1 °C window is about ±20 g of water
    expect(mixTemperature([hot, { m: m + 0.02, c: water.c, T: 20 }])).toBeGreaterThan(39);
    expect(mixTemperature([hot, { m: m - 0.02, c: water.c, T: 20 }])).toBeLessThan(41);
  });

  it('balances the books in every mix, for any number of lumps', () => {
    const cs = [iron.c, water.c, 900, 385, 1700];
    for (let n = 2; n <= 5; n++) {
      for (let s = 0; s < 40; s++) {
        const bodies: Lump[] = Array.from({ length: n }, (_, i) => ({
          m: 0.1 + ((s * 7 + i * 13) % 17) / 5, c: cs[(s + i) % cs.length], T: -30 + ((s * 11 + i * 29) % 150),
        }));
        const Tf = mixTemperature(bodies);
        const q = heatLedger(bodies, Tf);
        const scale = Math.max(...q.map(Math.abs), 1);
        expect(q.reduce((a, b) => a + b, 0) / scale).toBeCloseTo(0, 9);
        expect(Tf).toBeGreaterThanOrEqual(Math.min(...bodies.map((b) => b.T)) - 1e-9);
        expect(Tf).toBeLessThanOrEqual(Math.max(...bodies.map((b) => b.T)) + 1e-9);
      }
    }
  });
});

describe('exchange through a conductance', () => {
  const a: Lump = { m: 1, c: iron.c, T: 100 };
  const b: Lump = { m: 0.8, c: water.c, T: 20 };
  const ex = exchange(a, b, 7.5);

  it('conserves energy at every instant, not only at the end', () => {
    for (let t = 0; t <= 10 * ex.tau; t += ex.tau / 7) {
      const s = ex.at(t);
      const dUa = a.m * a.c * (s.Ta - a.T), dUb = b.m * b.c * (s.Tb - b.T);
      expect(dUa + dUb).toBeCloseTo(0, 6);
      expect(dUb).toBeCloseTo(s.Q, 6);
    }
  });

  it('heat only ever runs from hot to cold, and the pipe shuts when T matches', () => {
    let lastQ = -1;
    for (let t = 0; t <= 12 * ex.tau; t += ex.tau / 5) {
      const s = ex.at(t);
      expect(s.Ta).toBeGreaterThanOrEqual(s.Tb - 1e-9);
      expect(s.P).toBeGreaterThanOrEqual(0);
      expect(s.Q).toBeGreaterThanOrEqual(lastQ);
      lastQ = s.Q;
    }
    const end = ex.at(40 * ex.tau);
    expect(end.Ta).toBeCloseTo(ex.Tf, 6);
    expect(end.Tb).toBeCloseTo(ex.Tf, 6);
    expect(end.P).toBeCloseTo(0, 6);
    expect(end.Q).toBeCloseTo(ex.Qtotal, 6);
  });

  it('matches a brute-force integration of dQ/dt = G(Ta − Tb)', () => {
    let Ta = a.T, Tb = b.T;
    const dt = ex.tau / 20000;
    for (let t = 0; t < 2 * ex.tau; t += dt) {
      const P = 7.5 * (Ta - Tb);
      Ta -= (P * dt) / (a.m * a.c); Tb += (P * dt) / (b.m * b.c);
    }
    const s = ex.at(2 * ex.tau);
    expect(Ta).toBeCloseTo(s.Ta, 2);
    expect(Tb).toBeCloseTo(s.Tb, 2);
  });
});

describe('heating a pot of water blind (step 4)', () => {
  const pot: Lump[] = [{ m: 2, c: water.c, T: 20 }, { m: 1.5, c: iron.c, T: 20 }];
  const need = (2 * water.c + 1.5 * iron.c) * 30;

  it('needs about 271 kJ to go from 20 °C to 50 °C, pot included', () => {
    expect(need / 1000).toBeCloseTo(271.4, 1);
    const { T, shares } = warmTogether(pot, need);
    expect(T).toBeCloseTo(50, 9);
    expect(shares[0] + shares[1]).toBeCloseTo(need, 6);
    expect(shares[1] / 1000).toBeCloseTo(20.2, 1);
  });

  it('forgetting the pot leaves the water about 2 °C short, outside the ±1 °C window', () => {
    const waterOnly = heatFor(2, water.c, 30);
    const { T } = warmTogether(pot, waterOnly);
    expect(T).toBeCloseTo(47.8, 1);
    expect(50 - T).toBeGreaterThan(1.5);
  });
});

describe('heat is energy (the estimate)', () => {
  it('warming water by 1 °C takes the energy that would lift it about 427 m', () => {
    expect(liftForWarming(C_WATER, 1, G_EARTH)).toBeCloseTo(426.7, 1);
    // same statement as an energy budget: m c ΔT = m g h
    const h = liftForWarming(C_WATER, 1, G_EARTH);
    expect(heatFor(3, C_WATER, 1)).toBeCloseTo(3 * G_EARTH * h, 6);
  });
});

/* ── lesson 2: energy with nowhere visible to go ───────────────────────── */

describe('water with its phase', () => {
  it('enthalpy and state are inverses, across all three regimes', () => {
    for (const w of [{ m: 1, ice: 1, T: -20 }, { m: 1, ice: 0.3, T: 0 }, { m: 2, ice: 0, T: 37 }, { m: 0.5, ice: 0.5, T: 0 }]) {
      const back = waterFromEnthalpy(w.m, waterEnthalpy(w));
      expect(back.T).toBeCloseTo(w.T, 9);
      expect(back.ice).toBeCloseTo(w.ice, 9);
    }
  });

  it('the thermometer sits at 0 °C for the whole of the melt (the plateau)', () => {
    const P = 2090; // W: warms 1 kg of ice by 1 °C per second
    let w = { m: 1, ice: 1, T: -20 };
    const trace: { t: number; T: number; ice: number }[] = [];
    for (let t = 0; t <= 240; t += 1) { trace.push({ t, T: w.T, ice: w.ice }); w = heatWater(w, P); }
    const at = (t: number) => trace[t];
    expect(at(20).T).toBeCloseTo(0, 9);
    expect(at(20).ice).toBeCloseTo(1, 9);
    for (let t = 21; t < 180; t++) expect(at(t).T).toBe(0);
    expect(at(100).ice).toBeCloseTo(1 - (80 * P) / L_FUSION, 9);
    expect(at(181).ice).toBe(0);
    // after the melt, liquid water warms at half the rate the ice did
    expect(at(230).T - at(220).T).toBeCloseTo((10 * P) / C_WATER, 9);
  });

  it('melting takes 8 times as long as warming the ice from −20 °C (the hook)', () => {
    expect(plateauRatio(20)).toBeCloseTo(7.99, 2);
    const P = C_ICE; // 1 kg reaches 0 °C in 20 s
    const tMelt = L_FUSION / P;
    const tToPlusOne = tMelt + C_WATER / P;
    expect(tToPlusOne).toBeGreaterThan(150); // "about 3 minutes", not 1 s
    expect(tToPlusOne).toBeLessThan(200);
  });
});

describe('ice in a drink (step 2)', () => {
  const settle = (cubes: number) => drinkSettles(0.3, 25, cubes * 0.02);

  it('three 20 g cubes chill 300 g at 25 °C into the 5–10 °C band, and only three do', () => {
    const inBand = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].filter((n) => {
      const e = settle(n);
      return e.ice === 0 && e.T >= 5 && e.T <= 10;
    });
    expect(inBand).toEqual([3]);
    expect(settle(3).T).toBeCloseTo(7.5, 1);
    expect(settle(2).T).toBeCloseTo(12.7, 1);
    expect(settle(4).T).toBeCloseTo(2.9, 1);
  });

  it('too many cubes: stuck at 0 °C with ice left floating', () => {
    const e = settle(12);
    expect(e.T).toBe(0);
    expect(e.ice).toBeGreaterThan(0.1);
  });

  it('ignoring the melt, you would think you needed about 35 cubes', () => {
    // mass-weighted mixing with the ice treated as 0 °C water
    const naive = (0.3 * (25 - 7.5)) / 7.5 / 0.02;
    expect(naive).toBeGreaterThan(30);
  });

  it('the animated melt conserves enthalpy every step and lands on the budget', () => {
    let d: Drink = { liquid: 0.3, T: 25, ice: 0.06 };
    const H0 = drinkEnthalpy(d);
    for (let i = 0; i < 20000; i++) {
      d = stepDrink(d, 4, 0.06, 0.1);
      expect(drinkEnthalpy(d)).toBeCloseTo(H0, 6);
    }
    const e = settle(3);
    expect(d.T).toBeCloseTo(e.T, 3);
    expect(d.ice).toBeCloseTo(0, 6);
  });

  it('equilibrate conserves enthalpy and reduces to plain mixing without water', () => {
    const solids: Lump[] = [{ m: 1, c: iron.c, T: 300 }, { m: 0.2, c: 900, T: -5 }];
    const waters = [{ m: 0.5, ice: 0.5, T: -10 }, { m: 0.25, ice: 0, T: 40 }];
    const e = equilibrate(solids, waters);
    const after = totalEnthalpy(
      solids.map((b) => ({ ...b, T: e.T })),
      [{ m: 0.75, ice: e.ice, T: e.T }],
    );
    expect(after).toBeCloseTo(e.H, 6);
    expect(equilibrate(solids, []).T).toBeCloseTo(mixTemperature(solids), 9);
  });
});

describe('conduction', () => {
  it('halving a wall doubles the leak (Fourier)', () => {
    const P1 = conductionPower(polystyrene.k, 0.5, 30, 0.04);
    expect(conductionPower(polystyrene.k, 0.5, 30, 0.02)).toBeCloseTo(2 * P1, 9);
  });

  const box = { ice: 3, k: polystyrene.k, A: 0.5, Tout: 30 };
  const day = 12 * 3600;

  it('the inside stays at 0 °C and the ice falls in a straight line while any is left', () => {
    const b = { ...box, L: 0.04 };
    const a = coolBoxAt(b, 3600), c = coolBoxAt(b, 7200), d = coolBoxAt(b, 10800);
    expect(a.T).toBe(0); expect(d.T).toBe(0);
    expect(a.ice - c.ice).toBeCloseTo(c.ice - d.ice, 9);
  });

  it('the thinnest wall that keeps 1 kg of 3 kg for 12 h is about 3.2 cm', () => {
    const L = thinnestWall(box, 1, day);
    expect(L * 100).toBeCloseTo(3.2, 1);
    expect(coolBoxAt({ ...box, L }, day).ice).toBeCloseTo(1, 9);
    // the scene accepts up to half a centimetre more
    expect(coolBoxAt({ ...box, L: L + 0.005 }, day).ice).toBeLessThan(1.3);
    // and a 2 cm wall loses it all before evening
    expect(coolBoxAt({ ...box, L: 0.02 }, day).ice).toBe(0);
  });

  it('after the ice is gone the meltwater warms toward the outside air', () => {
    const b = { ...box, L: 0.01 };
    const late = coolBoxAt(b, 2 * day);
    expect(late.ice).toBe(0);
    expect(late.T).toBeGreaterThan(29);
    expect(late.T).toBeLessThan(30);
  });
});

describe('the bench that feels cold', () => {
  it('steel at 5 °C meets your skin at about 7 °C; pine at about 27 °C', () => {
    expect(feltTemperature(steel, 5)).toBeCloseTo(7.2, 0);
    expect(feltTemperature(wood, 5)).toBeCloseTo(27.1, 0);
    expect(effusivity(steel) / effusivity(wood)).toBeGreaterThan(40);
  });

  it('they feel the same only at skin temperature, where no heat flows', () => {
    for (let T = -10; T <= 60; T += 0.5) {
      const gap = feltTemperature(steel, T) - feltTemperature(wood, T);
      if (Math.abs(T - SKIN_T) < 1e-9) expect(gap).toBeCloseTo(0, 9);
      else expect(Math.abs(gap)).toBeGreaterThan(0.3);
      expect(Math.sign(gap)).toBe(Math.sign(T - SKIN_T));
    }
    const eS = effusivity(MATERIALS.skin);
    expect(contactFlux(eS, SKIN_T, effusivity(steel), SKIN_T, 1)).toBe(0);
  });

  it('on a hot day the steel is the one that burns', () => {
    expect(feltTemperature(steel, 60)).toBeGreaterThan(55);
    expect(feltTemperature(wood, 60)).toBeLessThan(40);
  });

  it('steel pulls heat from your hand several times faster than pine', () => {
    const eS = effusivity(MATERIALS.skin);
    const fSteel = contactFlux(eS, SKIN_T, effusivity(steel), 5, 1);
    const fWood = contactFlux(eS, SKIN_T, effusivity(wood), 5, 1);
    expect(fSteel / fWood).toBeGreaterThan(4);
  });
});
