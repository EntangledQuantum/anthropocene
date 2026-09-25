/** Scenario pack — University Physics, Chapter 12 (Fluid Mechanics).
 *
 *  Registered automatically by the glob in `../estimate-scenarios.ts`. Every
 *  truth is computed from `src/lib/physics/fluids.ts`, the same code the
 *  chapter's scenes run; fluids.test.ts pins the numbers.
 */
import type { EstimateScenario } from '../estimate-scenarios.ts';
import { G, RHO_WATER, hydrostaticPressure, pipeArea } from '../../../lib/physics/fluids.ts';

const TUBE_HEIGHT = 10;   // m of thin tube above the lid
const TUBE_BORE = 0.01;   // m across
const LID = 0.3;          // m²

export const estimate: Record<string, EstimateScenario> = {
  'up-ch12-pascal-barrel': {
    quantity: 'upward force of the water on a 0.3 m² barrel lid, with a 1 cm tube of water rising 10 m above it',
    unit: 'N',
    logRange: [0, 6],
    logStart: 1.5,
    withinFactor: 2,
    landmarks: [
      { value: RHO_WATER * G * pipeArea(TUBE_BORE) * TUBE_HEIGHT, label: 'the tube’s water' },
      { value: 70 * G, label: 'a person' },
    ],
    truth: () => hydrostaticPressure(TUBE_HEIGHT) * LID,
  },
};
