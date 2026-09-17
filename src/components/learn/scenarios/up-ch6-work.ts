/** Chapter 6: a new force pair, the same signed-work picture.
 *  Types only from the registry: no runtime cycle. The grading curve is a
 *  measured kinetic energy from the existing Newtonian integration in work.ts. */
import type { SketchScenario } from '../sketch-scenarios.ts';
import { constantForceTrial } from '../../../lib/physics/work.ts';

export const sketch: Record<string, SketchScenario> = {
  'up-ch6-kinetic-energy-with-brake': {
    xLabel: 'distance along the track (m)',
    yLabel: 'kinetic energy (J)',
    xRange: [0, 4],
    yRange: [0, 300],
    tolerance: 12,
    anchors: [{ x: 0, y: 180, label: 'starts with 180 J' }],
    truth: () => constantForceTrial({
      applied: [20, 0], brake: 40, mass: 10, speed0: 6, distance: 4,
    }).samples.map(s => ({ x: s.x, y: s.K })),
  },
};
