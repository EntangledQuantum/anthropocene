/** Scenario pack — University Physics, Chapter 11 (Equilibrium and Elasticity).
 *
 *  Registered automatically by the glob in `../estimate-scenarios.ts`. Every
 *  truth is computed by src/lib/physics/statics.ts, the same code the
 *  chapter's scenes run, and pinned in __tests__/statics.test.ts.
 */
import type { EstimateScenario } from '../estimate-scenarios.ts';
import { bicepsPull } from '../../../lib/physics/statics.ts';

export const estimate: Record<string, EstimateScenario> = {
  'up-ch11-biceps': {
    quantity: 'newtons the biceps pulls with, holding a 5 kg dumbbell on a level forearm',
    unit: 'N',
    logRange: [1, 4],
    logStart: 2,
    withinFactor: 1.6,
    landmarks: [
      { value: 49, label: 'the dumbbell’s weight' },
      { value: 700, label: 'your body weight' },
    ],
    truth: () => bicepsPull({ loadMass: 5, loadArm: 0.35, armMass: 1.5, armCg: 0.15, muscleArm: 0.04 }),
  },
};
