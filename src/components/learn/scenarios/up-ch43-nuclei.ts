/** Scenario pack — University Physics, Chapter 43 (Nuclear physics).
 *
 *  Registered automatically by the glob in `../estimate-scenarios.ts`. The truth
 *  is computed from `src/lib/physics/nuclear.ts`, whose tests pin it.
 */
import type { EstimateScenario } from '../estimate-scenarios.ts';
import { C14_HALF_LIFE_YR, radiocarbonAge } from '../../../lib/physics/nuclear.ts';

export const estimate: Record<string, EstimateScenario> = {
  /* Charcoal from a hearth holds 1/8 of the carbon-14 that living wood holds.
     Three halvings: 3 × 5,730 ≈ 17,200 years. Linear thinking (7/8 gone, so
     7/8 of two half-lives) lands near 10,000; "two half-lives and it is all
     gone" lands below 11,460. Both miss by more than the factor. */
  'up-ch43-charcoal-age': {
    quantity: 'age of charcoal holding 1/8 of the carbon-14 that living wood holds',
    unit: 'years',
    logRange: [2, 6],
    logStart: 3,
    withinFactor: 1.25,
    truth: () => radiocarbonAge(1 / 8),
    landmarks: [
      { value: C14_HALF_LIFE_YR, label: 'one half-life' },
      { value: 1e5, label: '100,000 years' },
    ],
  },
};
