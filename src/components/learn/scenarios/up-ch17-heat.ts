/** Scenario pack — University Physics, Chapter 17 (Temperature and Heat).
 *
 *  Registered automatically by the glob in `../estimate-scenarios.ts`. Every
 *  truth is computed from `src/lib/physics/heat.ts`; heat.test.ts pins it.
 */
import type { EstimateScenario } from '../estimate-scenarios.ts';
import { C_WATER, liftForWarming } from '../../../lib/physics/heat.ts';
import { G_EARTH } from '../../../lib/physics/dynamics.ts';

export const estimate: Record<string, EstimateScenario> = {
  'up-ch17-lift-for-a-degree': {
    quantity: 'height you could lift a litre of water with the energy that warms it by 1 °C',
    unit: 'm',
    logRange: [-1, 5],
    logStart: 0,
    withinFactor: 2,
    landmarks: [
      { value: 3, label: 'a ceiling' },
      { value: 330, label: 'the Eiffel Tower' },
      { value: 8849, label: 'Everest' },
    ],
    truth: () => liftForWarming(C_WATER, 1, G_EARTH),
  },
};
