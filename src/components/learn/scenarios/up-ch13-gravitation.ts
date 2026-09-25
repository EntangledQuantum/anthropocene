/** Scenario pack — University Physics, Chapter 13 (Gravitation).
 *
 *  Registered automatically by the glob in `../estimate-scenarios.ts`. The truth
 *  is computed from `src/lib/physics/orbits.ts`, whose tests also check it
 *  against the Moon's real orbit (Newton's Moon test, to 2%).
 */
import type { EstimateScenario } from '../estimate-scenarios.ts';
import { GM_EARTH, MOON_DISTANCE, fallInTime, gravityAt } from '../../../lib/physics/orbits.ts';

export const estimate: Record<string, EstimateScenario> = {
  /* The Moon falls toward the Earth by the same law as the apple, with gravity
     cut by 60² = 3600. In one second that is about 1.35 mm. */
  'up-ch13-moon-fall': {
    quantity: 'how far the Moon falls toward the Earth in one second',
    unit: 'mm',
    logRange: [-3, 5],
    logStart: 2,
    withinFactor: 3,
    truth: () => fallInTime(gravityAt(GM_EARTH, MOON_DISTANCE), 1) * 1000,
    landmarks: [
      { value: 4900, label: 'an apple, 4.9 m' },
      { value: 1, label: 'a millimetre' },
      { value: 0.07, label: 'a hair’s width' },
    ],
  },
};
