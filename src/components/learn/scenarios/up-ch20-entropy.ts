/** Scenario pack — University Physics, Chapter 20 (The Second Law).
 *
 *  Registered automatically by the glob in `../estimate-scenarios.ts`. Every
 *  truth is computed from `src/lib/physics/entropy.ts`, the same code the
 *  chapter's scenes run; entropy.test.ts pins the numbers.
 */
import type { EstimateScenario } from '../estimate-scenarios.ts';
import { AGE_OF_UNIVERSE_S, particlesForWait } from '../../../lib/physics/entropy.ts';

export const estimate: Record<string, EstimateScenario> = {
  'up-ch20-universe-wait': {
    quantity: 'particles in the box before the expected wait to catch them all on the left, looking once a second, passes the age of the universe',
    unit: 'particles',
    logRange: [0, 24],
    logStart: 6,
    withinFactor: 1.4,
    landmarks: [
      { value: 4, label: 'the four you trapped' },
      { value: 2.5e19, label: 'a cubic centimetre of air' },
    ],
    truth: () => particlesForWait(AGE_OF_UNIVERSE_S, 1),
  },
};
