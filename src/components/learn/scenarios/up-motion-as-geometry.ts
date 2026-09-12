/** Scenario pack — University Physics, Chapter 2 (Motion Along a Line).
 *
 *  Contributed scenarios are merged into the shared registries by the glob in
 *  `../sketch-scenarios.ts` and its siblings, so this file registers itself.
 *  Type-only imports keep that from being a cycle at runtime.
 */
import type { SketchScenario } from '../sketch-scenarios.ts';
import type { EstimateScenario } from '../estimate-scenarios.ts';
import { monotoneSpline } from '../../../lib/physics/interp.ts';
import { accumulate, distanceTravelled } from '../../../lib/physics/kinematics.ts';

/** The velocity history the learner is asked to integrate by eye.
 *
 *  Deliberately built from the same spline the `<LinkedGraphs>` widget uses, so
 *  the curve they sketched against is numerically the curve they dragged. */
const V_KNOTS = [
  { t: 0, y: 0 },
  { t: 2, y: 6 },
  { t: 4, y: 6 },
  { t: 6, y: 0 },
  { t: 8, y: -4 },
  { t: 10, y: -4 },
];

const GRID = Array.from({ length: 241 }, (_, i) => (i * 10) / 240);

function positionHistory(): { x: number; y: number }[] {
  const spline = monotoneSpline(V_KNOTS);
  const v = GRID.map((t) => spline.at(t));
  const x = accumulate(GRID, v, 0);
  return GRID.map((t, i) => ({ x: t, y: x[i] }));
}

/** Sketch x(t) given v(t). The tell is the maximum: it sits where v crosses
 *  zero, not where v is largest, and a learner who has not separated "fast"
 *  from "far along" puts the peak in the wrong place. */
const xFromV: SketchScenario = {
  xLabel: 'time (s)',
  yLabel: 'position (m)',
  xRange: [0, 10],
  yRange: [-4, 30],
  tolerance: 3.2,
  anchors: [{ x: 0, y: 0, label: 'starts at the origin' }],
  truth: positionHistory,
};

export const sketch: Record<string, SketchScenario> = {
  'up-x-from-v-signflip': xFromV,
};

/** How far did the odometer turn, given that same velocity history?
 *
 *  Graded on a factor rather than a percentage, and the answer is computed —
 *  a learner who reports the net displacement instead lands nearly a factor of
 *  three low, which is the whole point of asking. */
export const estimate: Record<string, EstimateScenario> = {
  'up-distance-vs-displacement': {
    quantity: 'total distance the object travelled over the ten seconds',
    unit: 'm',
    logRange: [0, 3],
    logStart: 1,
    withinFactor: 1.5,
    landmarks: [
      { value: 12, label: 'where it ended up' },
      { value: 100, label: 'a hundred metres' },
    ],
    truth: () => {
      const spline = monotoneSpline(V_KNOTS);
      const v = GRID.map((t) => spline.at(t));
      return distanceTravelled(GRID, v);
    },
  },
};
