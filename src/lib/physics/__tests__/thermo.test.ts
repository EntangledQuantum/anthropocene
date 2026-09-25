import { describe, expect, it } from 'vitest';
import {
  CH19_A, CH19_B, CH19_GAS, CH19_P, CH19_ROOM, CH19_V0, CV_MONATOMIC, KPA, L, PUMP_G, PUMP_GAS, PUMP_V0, PUMP_V1, R,
  adiabatPressure, adiabatic, adiabaticWork, air, cpOf, cylinderAt, cylinderPressure, deltaU, enclosedArea, gammaOf,
  heatAtFixedPressure, heatAtFixedVolume, heatToWarm, internalEnergy, isobaric, isochoric, isothermal, isothermalWork,
  ledgerAlong, movePiston, routeOver, routeUnder, stroke, temperatureOf, workAlong, type Cylinder, type Gas, type State,
} from '../thermo.ts';

const g = CH19_GAS;

describe('work is the area under the path', () => {
  it('a rectangle-shaped route does p·ΔV', () => {
    expect(workAlong(routeOver(CH19_A, CH19_B))).toBeCloseTo(4000, 9);   // 200 kPa × 20 L
    expect(workAlong(routeUnder(CH19_A, CH19_B))).toBeCloseTo(2000, 9);  // 100 kPa × 20 L
    expect(workAlong([CH19_A, CH19_B])).toBeCloseTo(3000, 9);            // the trapezoid
  });

  it('the sampled isotherm and adiabat match their closed forms', () => {
    const s: State = { p: 100 * KPA, V: 20 * L };
    const T = temperatureOf(g, s);
    expect(workAlong(isothermal(g, s, 35 * L, 4000)) / isothermalWork(g, T, 20 * L, 35 * L)).toBeCloseTo(1, 5);
    expect(workAlong(adiabatic(g, s, 8 * L, 4000)) / adiabaticWork(g, s, 8 * L)).toBeCloseTo(1, 5);
  });

  it('going backwards along a path undoes its work', () => {
    const p = isothermal(g, CH19_A, 30 * L);
    expect(workAlong(p) + workAlong([...p].reverse())).toBeCloseTo(0, 9);
  });

  it('a closed loop does net work equal to the area it encloses, positive clockwise', () => {
    const loop: State[] = [CH19_A, { p: 200 * KPA, V: 25 * L }, { p: 100 * KPA, V: 25 * L }, { p: 100 * KPA, V: 10 * L }];
    const closed = [...loop, CH19_A];
    expect(workAlong(closed)).toBeCloseTo(1500, 9);
    expect(enclosedArea(loop)).toBeCloseTo(1500, 9);
    expect(workAlong([...closed].reverse())).toBeCloseTo(-1500, 9);
    // and a wiggly loop: a circle
    const circle = Array.from({ length: 2001 }, (_, i) => {
      const a = (-2 * Math.PI * i) / 2000;           // clockwise
      return { V: (20 + 5 * Math.cos(a)) * L, p: (150 + 50 * Math.sin(a)) * KPA };
    });
    expect(workAlong(circle) / (Math.PI * 5 * 50)).toBeCloseTo(1, 4);
    const ledger = ledgerAlong(g, circle);
    expect(ledger.dU).toBeCloseTo(0, 9);
    expect(ledger.Q).toBeCloseTo(ledger.W, 9);
  });
});

describe('ΔU depends only on the endpoints', () => {
  it('every route from A to B has ΔU = 2500 J, with different W and Q', () => {
    const routes = [
      routeOver(CH19_A, CH19_B),
      routeUnder(CH19_A, CH19_B),
      [CH19_A, CH19_B],
      [CH19_A, { p: 250 * KPA, V: 10 * L }, { p: 250 * KPA, V: 30 * L }, CH19_B],
      [CH19_A, { p: 40 * KPA, V: 38 * L }, { p: 280 * KPA, V: 12 * L }, CH19_B],
    ];
    const ledgers = routes.map((r) => ledgerAlong(g, r));
    for (const l of ledgers) {
      expect(l.dU).toBeCloseTo(2500, 6);
      expect(l.Q - l.W).toBeCloseTo(l.dU, 9);
    }
    expect(ledgers[0]).toMatchObject({ W: expect.closeTo(4000, 6), Q: expect.closeTo(6500, 6) });
    expect(ledgers[1]).toMatchObject({ W: expect.closeTo(2000, 6), Q: expect.closeTo(4500, 6) });
    expect(ledgers[3].W).toBeCloseTo(5000, 6);          // the lesson's target: over a higher roof
    expect(new Set(ledgers.map((l) => l.W.toFixed(3))).size).toBe(routes.length);
  });

  it('A and B are 240.5 K and 360.8 K for one mole of air', () => {
    expect(temperatureOf(g, CH19_A)).toBeCloseTo(240.5, 1);
    expect(temperatureOf(g, CH19_B)).toBeCloseTo(360.8, 1);
    expect(deltaU(g, CH19_A, CH19_B)).toBeCloseTo(2.5 * (3000 - 2000), 9);
  });
});

describe('Cp − Cv = R', () => {
  it('holds for any ideal gas, from the constants', () => {
    for (const gas of [air(1), { n: 2, cv: CV_MONATOMIC }] as Gas[]) expect(cpOf(gas) - gas.cv).toBeCloseTo(R, 12);
    expect(gammaOf(air(1))).toBeCloseTo(1.4, 12);
  });

  it('is measured: heating under a free piston costs n R ΔT more, and that extra is the work', () => {
    // warm a rigid box and a free piston by 30 K, a joule at a time
    let box = cylinderAt(CH19_ROOM, CH19_V0), piston = cylinderAt(CH19_ROOM, CH19_V0);
    while (box.T < CH19_ROOM + 30 - 1e-9) box = heatAtFixedVolume(g, box, Math.min(1, (CH19_ROOM + 30 - box.T) * g.n * g.cv));
    while (piston.T < CH19_ROOM + 30 - 1e-9) piston = heatAtFixedPressure(g, piston, Math.min(1, (CH19_ROOM + 30 - piston.T) * g.n * cpOf(g)), CH19_P);
    expect(box.Q).toBeCloseTo(623.6, 1);
    expect(piston.Q).toBeCloseTo(873.0, 1);
    expect(piston.Q - box.Q).toBeCloseTo(g.n * R * 30, 6);   // 249.4 J
    expect(piston.W).toBeCloseTo(piston.Q - box.Q, 6);
    expect(box.W).toBe(0);
    expect(heatToWarm(g, 30, 'pressure') - heatToWarm(g, 30, 'volume')).toBeCloseTo(249.4, 1);
    // the same extra for helium: it is n R ΔT, not a property of the gas
    const he: Gas = { n: 1, cv: CV_MONATOMIC };
    expect(heatToWarm(he, 30, 'pressure') - heatToWarm(he, 30, 'volume')).toBeCloseTo(249.4, 1);
  });
});

describe('pV^γ is constant on an adiabat', () => {
  it('moving the piston with no heat follows pV^γ = const, in small steps or one', () => {
    let c: Cylinder = cylinderAt(CH19_ROOM, CH19_V0);
    const k0 = cylinderPressure(g, c) * c.V ** gammaOf(g);
    for (let V = CH19_V0; V > 12 * L; V -= 0.05 * L) c = movePiston(g, c, V);
    expect((cylinderPressure(g, c) * c.V ** gammaOf(g)) / k0).toBeCloseTo(1, 12);
    expect(adiabatPressure(g, { p: CH19_P, V: CH19_V0 }, c.V) / cylinderPressure(g, c)).toBeCloseTo(1, 12);
    // the ledger: Q = 0, and the work done on the gas is all of its gain in U
    expect(c.Q).toBe(0);
    expect(-c.W).toBeCloseTo(internalEnergy(g, { p: cylinderPressure(g, c), V: c.V }) - internalEnergy(g, { p: CH19_P, V: CH19_V0 }), 6);
  });

  it('squeezing to 21.2 L warms the gas by 20 K with no flame; the piston does 416 J on it', () => {
    const c = movePiston(g, cylinderAt(CH19_ROOM, CH19_V0), 21.23 * L);
    expect(c.T - CH19_ROOM).toBeCloseTo(20, 1);
    expect(-c.W).toBeCloseTo(g.n * g.cv * 20, -1);
  });

  it('an adiabat is steeper than the isotherm through the same point', () => {
    const s: State = { p: CH19_P, V: CH19_V0 };
    const V = 0.5 * CH19_V0;
    expect(adiabatPressure(g, s, V)).toBeGreaterThan(2 * CH19_P);
  });
});

describe('heat in, temperature flat: all of it leaves as work', () => {
  it('400 J of flame, then back to 300 K by any route: W = 400 J', () => {
    // route 1: heat first at fixed volume, then let the piston out
    let a = heatAtFixedVolume(g, cylinderAt(CH19_ROOM, CH19_V0), 400);
    a = movePiston(g, a, a.V * (a.T / CH19_ROOM) ** (1 / (gammaOf(g) - 1)));
    // route 2: nearly isothermal, a joule of heat then a nudge of the piston
    let b = cylinderAt(CH19_ROOM, CH19_V0);
    for (let i = 0; i < 400; i++) {
      b = heatAtFixedVolume(g, b, 1);
      b = movePiston(g, b, b.V * (b.T / CH19_ROOM) ** (1 / (gammaOf(g) - 1)));
    }
    for (const c of [a, b]) {
      expect(c.T).toBeCloseTo(CH19_ROOM, 9);
      expect(c.Q).toBe(400);
      expect(c.W).toBeCloseTo(400, 9);
    }
    // different final volumes: the path changed where the piston ended, not the ledger
    expect(a.V / L).toBeCloseTo(29.1, 1);
    expect(b.V / L).toBeCloseTo(29.3, 1);
    expect(b.V / L).toBeCloseTo(CH19_V0 / L * Math.exp(400 / (R * CH19_ROOM)), 2);
  });
});

describe('adiabatic means no time for heat, not insulated walls', () => {
  it('a fast stroke of the leaky pump nearly follows the adiabat; a slow one nearly the isotherm', () => {
    const adiabaticT = CH19_ROOM * (PUMP_V0 / PUMP_V1) ** (gammaOf(PUMP_GAS) - 1);
    expect(adiabaticT).toBeCloseTo(465.6, 1);
    const fast = stroke(PUMP_GAS, PUMP_V0, PUMP_V1, 0.2, PUMP_G, CH19_ROOM);
    const slow = stroke(PUMP_GAS, PUMP_V0, PUMP_V1, 60, PUMP_G, CH19_ROOM);
    expect(fast.peak).toBeGreaterThan(450);
    expect(slow.peak).toBeLessThan(310);
    // the lesson's threshold: 430 K needs a stroke shorter than about 0.85 s
    expect(stroke(PUMP_GAS, PUMP_V0, PUMP_V1, 0.8, PUMP_G, CH19_ROOM).peak).toBeGreaterThan(430);
    expect(stroke(PUMP_GAS, PUMP_V0, PUMP_V1, 1.0, PUMP_G, CH19_ROOM).peak).toBeLessThan(430);
    expect(stroke(PUMP_GAS, PUMP_V0, PUMP_V1, 2.0, PUMP_G, CH19_ROOM).peak).toBeLessThan(400);
    // the ledger balances along the leaky stroke too
    const e = slow.end;
    expect(e.Q - e.W).toBeCloseTo(PUMP_GAS.n * PUMP_GAS.cv * (e.T - CH19_ROOM), 9);
    // more work goes in on the fast stroke: the gas pushes back harder when hot
    expect(-fast.end.W).toBeGreaterThan(-slow.end.W);
  });
});

describe('the four named paths', () => {
  it('isochoric does no work; isobaric does p ΔV; isothermal keeps pV', () => {
    const s: State = { p: CH19_P, V: CH19_V0 };
    expect(workAlong(isochoric(g, s, 400))).toBe(0);
    const ib = isobaric(g, s, 330);
    expect(workAlong(ib)).toBeCloseTo(g.n * R * 30, 6);
    const it2 = isothermal(g, s, 2 * CH19_V0);
    expect(it2[it2.length - 1].p * it2[it2.length - 1].V).toBeCloseTo(s.p * s.V, 6);
    expect(ledgerAlong(g, it2).dU).toBeCloseTo(0, 9);
  });
});
