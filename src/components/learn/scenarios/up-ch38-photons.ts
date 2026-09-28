/** Scenario pack — University Physics, Chapter 38 (Photons).
 *
 *  Registered automatically by the glob in `../estimate-scenarios.ts`. The truth
 *  is computed from `src/lib/physics/photons.ts`, whose tests pin it.
 */
import type { EstimateScenario } from '../estimate-scenarios.ts';
import { METALS, classicalSoakTime } from '../../../lib/physics/photons.ts';

export const estimate: Record<string, EstimateScenario> = {
  /* The wave model's clock: dim light (1 mW/m²) spread evenly over sodium,
     one atom-sized patch 0.3 nm square collecting 2.36 eV. About 70 minutes.
     Experiment: electrons appear within nanoseconds. */
  'up-ch38-wave-soak-time': {
    quantity: 'seconds before one atom-sized patch of sodium soaks up 2.36 eV from evenly spread dim light',
    unit: 's',
    logRange: [-10, 6],
    logStart: -2,
    withinFactor: 4,
    truth: () => classicalSoakTime(1e-3, 0.3e-9, METALS.sodium.phi),
    landmarks: [
      { value: 1e-9, label: 'a nanosecond' },
      { value: 1, label: 'a second' },
      { value: 60, label: 'a minute' },
      { value: 86400, label: 'a day' },
    ],
  },
};
