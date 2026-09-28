/** Scenario pack — University Physics, Chapter 28 (Sources of magnetic field).
 *
 *  Registered automatically by the glob in `../estimate-scenarios.ts`. The truth
 *  is computed from `src/lib/physics/biot.ts`, B = μ₀nI solved for n, whose
 *  long-solenoid claim is pinned against a numerically integrated helix in
 *  biot.test.ts.
 */
import type { EstimateScenario } from '../estimate-scenarios.ts';
import { turnsPerMetreFor } from '../../../lib/physics/biot.ts';

export const estimate: Record<string, EstimateScenario> = {
  /* A 3 T MRI magnet with superconducting wire carrying 500 A: about 48 turns
     in every centimetre of the bore's length. */
  'up-ch28-mri-turns': {
    quantity: 'turns of wire in each centimetre of the coil',
    unit: 'turns/cm',
    logRange: [-1, 5],
    logStart: 0,
    withinFactor: 2,
    truth: () => turnsPerMetreFor(3, 500) / 100,
    landmarks: [
      { value: 10, label: 'one layer of 1 mm wire' },
      { value: 1000, label: 'a layer of hair-thin wire' },
    ],
  },
};
