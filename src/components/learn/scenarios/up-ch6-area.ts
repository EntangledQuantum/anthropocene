import type { SketchScenario } from '../sketch-scenarios.ts';
import { AREA_DISTANCE, AREA_INITIAL_K, areaSketch } from '../../../lib/physics/work-area.ts';

export const sketch: Record<string, SketchScenario> = {
  'up-ch6-area-kinetic-shape': {
    xLabel: 'position along the track (m)',
    yLabel: 'kinetic energy (J)',
    xRange: [0, AREA_DISTANCE],
    yRange: [0, AREA_INITIAL_K.ordinary * 2],
    tolerance: 8,
    minCoverage: 0.95,
    anchors: [{ x: 0, y: AREA_INITIAL_K.ordinary, label: `starts with ${AREA_INITIAL_K.ordinary} J` }],
    truth: areaSketch,
  },
};
