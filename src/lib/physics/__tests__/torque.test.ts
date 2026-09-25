/**
 * Claims made by chapter 10, "Dynamics of Rotational Motion", checked against
 * the code the PushTheDoor, PullInTheWeights and StepOnTheRide scenes run.
 */
import { describe, expect, it } from 'vitest';
import {
  CHAIR, DOOR, RIDE, TWO_PI, angleFromRest, angularAcceleration, chairInertia, chairSpin,
  collapseSpin, cross2, doorI, doorTorque, leverArm, leverFoot, netDoorTorque, particleL,
  pullInWork, radiusForSpin, reelIn, rideAfterStep, rideEnergies, slabAboutEdge, spinEnergy,
  stepOnSkid, stepRadiusFor, swingDoor, systemL, timeToTurn, torqueAbout,
} from '../torque.ts';

const rel = (a: number, b: number) => Math.abs(a - b) / Math.abs(b);

describe('torque is r × F: where and which way, not only how hard', () => {
  it('matches r F sin φ for a push on a door', () => {
    for (const [s, phi] of [[0.9, Math.PI / 2], [0.5, 0.3], [0.2, 2.5]]) {
      const F: [number, number] = [20 * Math.cos(phi), 20 * Math.sin(phi)];
      expect(torqueAbout([0, 0], [s, 0], F)).toBeCloseTo(doorTorque(s, 20, phi), 12);
    }
  });

  it('a push at the hinge, or along the door, turns nothing however hard it is', () => {
    expect(doorTorque(0, 500, Math.PI / 2)).toBe(0);
    expect(torqueAbout([0, 0], [0.9, 0], [-500, 0])).toBeCloseTo(0, 12);
    expect(leverArm([0, 0], [0.9, 0], [500, 0])).toBeCloseTo(0, 12);
  });

  it('the lever arm is the distance to the line of action, and |τ| = r⊥ F', () => {
    const P: [number, number] = [0.7, 0], F: [number, number] = [-6, 11];
    const foot = leverFoot([0, 0], P, F);
    // the foot lies on the line of action and is perpendicular to it from the pivot
    expect(cross2([foot[0] - P[0], foot[1] - P[1]], F)).toBeCloseTo(0, 12);
    expect(foot[0] * F[0] + foot[1] * F[1]).toBeCloseTo(0, 12);
    expect(Math.hypot(...foot)).toBeCloseTo(leverArm([0, 0], P, F), 12);
    expect(Math.abs(torqueAbout([0, 0], P, F))).toBeCloseTo(leverArm([0, 0], P, F) * Math.hypot(...F), 12);
  });

  it('the hook: 20 N at the edge at 30° turns the door exactly as hard as 20 N square-on at the middle', () => {
    expect(doorTorque(DOOR.L, DOOR.F, Math.PI / 6)).toBeCloseTo(doorTorque(DOOR.L / 2, DOOR.F, Math.PI / 2), 12);
    expect(doorTorque(DOOR.L, DOOR.F, Math.PI / 6)).toBeCloseTo(9, 12);
  });

  it('the sign is the sense of twist: the same push from the other side turns the door the other way', () => {
    expect(doorTorque(0.6, 20, Math.PI / 2)).toBeGreaterThan(0);
    expect(doorTorque(0.6, 20, -Math.PI / 2)).toBeCloseTo(-doorTorque(0.6, 20, Math.PI / 2), 12);
  });
});

describe('τ = I α', () => {
  it('the door is 18 kg and 0.9 m wide: I = 4.86 kg·m²', () => {
    expect(doorI()).toBeCloseTo(4.86, 10);
  });

  it('a steady torque turns the door through ½ α t², checked by stepping the motion', () => {
    const a = angularAcceleration(10, doorI());
    expect(rel(swingDoor(10, doorI(), 1), angleFromRest(a, 1))).toBeLessThan(1e-3);
  });

  it('reaching the 60° doorstop in one second needs 10.2 N·m: a lever arm of 0.51 m for 20 N', () => {
    const alpha = (2 * (Math.PI / 3)) / 1;
    const tau = alpha * doorI();
    expect(tau).toBeCloseTo(10.18, 2);
    expect(tau / DOOR.F).toBeCloseTo(0.509, 3);
    // reachable: square-on at the edge is 18 N·m, well above it
    expect(doorTorque(DOOR.L, DOOR.F, Math.PI / 2)).toBeGreaterThan(tau);
  });

  it('holding the door: 30 N needs 0.36 m of lever arm to cancel 12 N square-on at the edge', () => {
    const friend = { s: DOOR.L, F: 12, phi: -Math.PI / 2 };
    expect(netDoorTorque([friend, { s: 0.36, F: 30, phi: Math.PI / 2 }])).toBeCloseTo(0, 12);
    // pushing harder near the hinge loses: 30 N at 0.3 m against 12 N at 0.9 m
    expect(netDoorTorque([friend, { s: 0.3, F: 30, phi: Math.PI / 2 }])).toBeLessThan(0);
    // and the same 30 N at the edge but slanted 23.6° to the face also holds it
    expect(netDoorTorque([friend, { s: DOOR.L, F: 30, phi: Math.asin(0.4) }])).toBeCloseTo(0, 12);
  });

  it('a 2000 kg vault door opens 90° in about 6.5 s under 50 N at its edge; an ordinary door in 0.6 s', () => {
    const vault = timeToTurn(Math.PI / 2, 50 / slabAboutEdge(2000, 1));
    expect(vault).toBeGreaterThan(6.4);
    expect(vault).toBeLessThan(6.6);
    expect(timeToTurn(Math.PI / 2, (50 * DOOR.L) / doorI())).toBeCloseTo(0.58, 2);
  });
});

describe('angular momentum of a point-mass set', () => {
  it('for masses turning rigidly, Σ r × m v equals (Σ m r²) ω', () => {
    const w = 3.1;
    const ps = [
      { m: 2, r: [0.4, 0.1] as const }, { m: 1.5, r: [-0.3, 0.7] as const }, { m: 0.5, r: [0.05, -1.2] as const },
    ].map((p) => ({ m: p.m, r: p.r, v: [-w * p.r[1], w * p.r[0]] as const }));
    const I = ps.reduce((s, p) => s + p.m * (p.r[0] ** 2 + p.r[1] ** 2), 0);
    expect(systemL(ps)).toBeCloseTo(I * w, 12);
  });

  it('a particle moving in a straight line past the origin keeps r × p constant', () => {
    const v: [number, number] = [3, 0];
    const Ls = [-2, 0, 1, 5].map((t) => particleL(1.5, [-4 + 3 * t, 0.8], v));
    for (const L of Ls) expect(L).toBeCloseTo(Ls[0], 12);
  });
});

describe('pulling in the weights: L holds, K does not', () => {
  it('reeling a mass in on a string (plain particle motion, a central pull) keeps r × p fixed', () => {
    const out = reelIn(1, 1, 2, 0.4, 1);
    expect(out.r1).toBeCloseTo(0.4, 3);
    expect(rel(out.L1, out.L0)).toBeLessThan(1e-9);
    // … while the kinetic energy rises by exactly the work the string did
    expect(out.K1 / out.K0).toBeGreaterThan(5);
    expect(rel(out.K1 - out.K0, out.work)).toBeLessThan(1e-3);
  });

  it('the chair starts at 1 rev/s with the dumbbells at 0.75 m: I = 3.45 kg·m²', () => {
    expect(chairInertia(CHAIR, 0.75)).toBeCloseTo(3.45, 10);
  });

  const L = chairInertia(CHAIR, 0.75) * TWO_PI;

  it('the dumbbells at 0.36 m double the spin: half the inertia', () => {
    const r = radiusForSpin(CHAIR, L, 2 * TWO_PI);
    expect(r).toBeCloseTo(0.362, 3);
    expect(chairInertia(CHAIR, r)).toBeCloseTo(chairInertia(CHAIR, 0.75) / 2, 10);
  });

  it('pulling all the way to 0.15 m gives about 2.7 rev/s, not the 25× that r² alone would say', () => {
    const w = chairSpin(CHAIR, L, 0.15) / TWO_PI;
    expect(w).toBeCloseTo(2.67, 2);
    expect(w).toBeLessThan(25);
  });

  it('the spin energy rises from 68 J to 182 J, by exactly the work your arms do', () => {
    const K0 = spinEnergy(chairInertia(CHAIR, 0.75), TWO_PI);
    const K1 = spinEnergy(chairInertia(CHAIR, 0.15), chairSpin(CHAIR, L, 0.15));
    expect(K0).toBeCloseTo(68.1, 1);
    expect(K1).toBeCloseTo(182.1, 1);
    expect(rel(pullInWork(CHAIR, L, 0.75, 0.15), K1 - K0)).toBeLessThan(1e-5);
  });

  it('pushing the weights back out returns the chair to its starting spin', () => {
    expect(chairSpin(CHAIR, L, 0.75)).toBeCloseTo(TWO_PI, 12);
  });
});

describe('stepping onto the ride: L shared, K lost', () => {
  it('the ride is 225 kg·m² at 20 rpm; stepping on at the rim slows it to 15.4 rpm', () => {
    expect(rideAfterStep(RIDE, RIDE.R)).toBeCloseTo(15.38, 2);
  });

  it('17 rpm needs the child 1.15 m from the axle', () => {
    const r = stepRadiusFor(RIDE, 17);
    expect(r).toBeCloseTo(1.15, 2);
    expect(rideAfterStep(RIDE, r)).toBeCloseTo(17, 10);
  });

  it('the skid that brings her up to speed is friction, and still the total L cannot change', () => {
    for (const mu of [0.2, 0.6, 1.2]) {
      const out = stepOnSkid(RIDE, 1.15, mu);
      expect(rel(out.L1, out.L0)).toBeLessThan(1e-9);
      expect(out.rpm).toBeCloseTo(rideAfterStep(RIDE, 1.15), 2);
    }
  });

  it('kinetic energy falls from 493 J to 420 J: the same L, less energy, the opposite of the chair', () => {
    const { K0, K1 } = rideEnergies(RIDE, 1.15);
    expect(K0).toBeCloseTo(493.5, 1);
    expect(K1).toBeCloseTo(419.5, 1);
  });
});

describe('the collapsing star', () => {
  it('the Sun, 25-day spin, shrunk to 12 km with L fixed, turns about 1500 times a second', () => {
    const f = 1 / collapseSpin(25 * 86400, 696000, 12);
    expect(f).toBeGreaterThan(1400);
    expect(f).toBeLessThan(1700);
  });
});
