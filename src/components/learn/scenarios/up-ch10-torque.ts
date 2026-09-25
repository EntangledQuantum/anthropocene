/** Scenario pack — University Physics, Chapter 10 (Dynamics of Rotational Motion).
 *
 *  Registered automatically by the glob in `../estimate-scenarios.ts`. Every
 *  truth is computed from `src/lib/physics/torque.ts`, the same code the
 *  chapter's door scene runs; torque.test.ts pins the numbers.
 */
import type { EstimateScenario } from '../estimate-scenarios.ts';
import { DOOR, doorI, doorTorque, slabAboutEdge, timeToTurn } from '../../../lib/physics/torque.ts';

const VAULT_KG = 2000;
const VAULT_W = 1;
const PUSH = 50;
const QUARTER = Math.PI / 2;

export const estimate: Record<string, EstimateScenario> = {
  'up-ch10-vault-door': {
    quantity: 'time for a 50 N push, square-on at the edge, to swing a 2000 kg, 1 m wide vault door through 90° from rest',
    unit: 's',
    logRange: [-1, 3],
    logStart: 2,
    withinFactor: 2,
    landmarks: [
      { value: timeToTurn(QUARTER, doorTorque(DOOR.L, PUSH, QUARTER) / doorI()), label: 'an ordinary 18 kg door, same push' },
    ],
    truth: () => timeToTurn(QUARTER, doorTorque(VAULT_W, PUSH, QUARTER) / slabAboutEdge(VAULT_KG, VAULT_W)),
  },
};
