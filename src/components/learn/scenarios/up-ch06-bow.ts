/** Scenario pack: University Physics, Chapter 6 (Work and Kinetic Energy).
 *
 *  Registered automatically by the glob in `../estimate-scenarios.ts`. The
 *  truth is the area under the bow's draw force, from
 *  `src/lib/physics/work-scenes-ch06.ts`: the same `springWork` the
 *  StretchSpring scene fills in.
 */
import type { EstimateScenario } from '../estimate-scenarios.ts';
import { bowArrowSpeed } from '../../../lib/physics/work-scenes-ch06.ts';

export const estimate: Record<string, EstimateScenario> = {
  'up-ch06-bow-arrow': {
    quantity: 'launch speed of the arrow',
    unit: 'm/s',
    logRange: [0, 3],
    logStart: 1,
    // Peak force times draw (the rectangle, not the triangle) is off by √2 and
    // must fail, so the factor sits below 1.41.
    withinFactor: 1.3,
    truth: () => bowArrowSpeed(),
    landmarks: [
      { value: 10, label: 'a sprinter' },
      { value: 30, label: 'motorway traffic' },
      { value: 340, label: 'sound' },
    ],
  },
};
