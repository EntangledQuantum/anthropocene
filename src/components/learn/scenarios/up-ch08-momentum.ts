/** Scenario pack — University Physics, Chapter 8 (Momentum, Impulse, Collisions).
 *
 *  Registered automatically by the glob in `../estimate-scenarios.ts`. Every
 *  truth is computed from `src/lib/physics/momentum.ts`, the same code the
 *  chapter's scenes run; momentum.test.ts pins the numbers.
 */
import type { EstimateScenario } from '../estimate-scenarios.ts';
import { averageForce } from '../../../lib/physics/momentum.ts';

const DRIVER_KG = 70;
const SPEED = 50 / 3.6;   // 50 km/h in m/s
const AIRBAG_S = 0.12;    // belt and airbag spread the stop over this long

export const estimate: Record<string, EstimateScenario> = {
  'up-ch08-airbag-force': {
    quantity: 'average force on a 70 kg driver brought from 50 km/h to rest in 0.12 s by belt and airbag',
    unit: 'N',
    logRange: [2, 6],
    logStart: 2.5,
    withinFactor: 2,
    landmarks: [
      { value: DRIVER_KG * 9.81, label: 'the driver’s weight' },
    ],
    truth: () => averageForce(DRIVER_KG, SPEED, AIRBAG_S),
  },
};
