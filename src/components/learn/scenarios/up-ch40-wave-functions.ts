/** Scenario pack — University Physics, Chapter 40 (Wave functions).
 *
 *  Registered automatically by the glob in `../estimate-scenarios.ts`. The truth
 *  is computed from `src/lib/physics/quantum1d.ts`, whose tests pin both the
 *  exact barrier formula (against a numerical march through the barrier) and
 *  this ratio, about ninefold.
 */
import type { EstimateScenario } from '../estimate-scenarios.ts';
import { barrierTransmission } from '../../../lib/physics/quantum1d.ts';

/* A scanning tunnelling microscope: electrons near the Fermi level of a metal
   (about 5 eV of kinetic energy inside it) cross a vacuum gap whose barrier
   stands 4.5 eV above them, the work function. The current is proportional to
   the fraction that gets through. Lift the tip from 0.5 nm to 0.6 nm. */
const FERMI = 5, WORK_FUNCTION = 4.5;

export const estimate: Record<string, EstimateScenario> = {
  'up-ch40-stm-lift': {
    quantity: 'how many times smaller the tunnelling current gets when the tip is lifted from 0.5 nm to 0.6 nm',
    unit: '×',
    logRange: [0, 3],
    logStart: 0.3,
    withinFactor: 1.6,
    truth: () => barrierTransmission(FERMI, FERMI + WORK_FUNCTION, 0.5) / barrierTransmission(FERMI, FERMI + WORK_FUNCTION, 0.6),
    landmarks: [
      { value: 1.2, label: '20% less, in step with the gap' },
      { value: 100, label: 'a hundredfold' },
    ],
  },
};
