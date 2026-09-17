import type { SketchScenario } from '../sketch-scenarios.ts';
import { leftReleaseVelocity } from '../../../lib/physics/clock-ch14.ts';

export const sketch: Record<string, SketchScenario> = {
  'up-ch14-left-release-velocity': {
    xLabel: 'time (s)', yLabel: 'velocity (m/s)',
    xRange: [0, 2 * Math.PI / 3], yRange: [-1.4, 1.4],
    tolerance: 0.22,
    anchors: [{ x: 0, y: 0, label: 'released from rest on the left' }],
    truth: leftReleaseVelocity,
  },
};
