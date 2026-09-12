/** Scenario pack — University Physics, Chapter 1 (Language of Nature).
 *
 *  Picked up automatically by the globs in `../tune-scenarios.ts` and its
 *  siblings. Type-only imports so registering is not a runtime cycle.
 *
 *  Every truth in here is computed from `src/lib/physics/` — the vector
 *  primitives for the component curves, the unit registry for the conversion
 *  factor. The arrows below are the same two arrows the lesson's `<VectorFrame>`
 *  instances are built from, so the curve the learner sketches is numerically
 *  the curve they dragged a grid under.
 */
import type { SketchScenario } from '../sketch-scenarios.ts';
import type { EstimateScenario } from '../estimate-scenarios.ts';
import type { TuneScenario } from '../tune-scenarios.ts';
import { along, componentsIn, dot2, mag2, type Vec2 } from '../../../lib/physics/vectors.ts';
import { conversionFactor } from '../../../lib/physics/dimensions.ts';

/** The chapter's two arrows. |A| = 5 exactly, which makes the sketch's tell
 *  unmissable: the component curve has to reach 5, higher than the 4 it starts
 *  at, because there is a frame in which A lies entirely along one axis. */
const A: Vec2 = [4, 3];
const B: Vec2 = [1, 4];

const DEG = 180 / Math.PI;

/** First component of A read off a grid turned by `deg`. */
const firstComponent = (deg: number) => componentsIn(A, deg / DEG)[0];

/* ── sketch: the component as a function of the grid angle ────────────────── */

export const sketch: Record<string, SketchScenario> = {
  'up-ch1-component-vs-angle': {
    xLabel: 'angle of the grid (°)',
    yLabel: 'first component of A',
    xRange: [0, 360],
    yRange: [-6, 6],
    tolerance: 1.15,
    anchors: [{ x: 0, y: 4, label: 'the grid starts square, and the component is 4' }],
    truth: () =>
      Array.from({ length: 181 }, (_, i) => {
        const deg = (i * 360) / 180;
        return { x: deg, y: firstComponent(deg) };
      }),
  },
};

/* ── tune: turn the grid until one axis lies along B ──────────────────────── */

const alongAB = along(A, B);
const angleOfB = Math.atan2(B[1], B[0]) * DEG;

export const tune: Record<string, TuneScenario> = {
  'up-ch1-align-with-b': {
    param: {
      key: 'theta',
      label: 'angle of the grid',
      symbol: 'θ',
      unit: '°',
      min: -180,
      max: 180,
      step: 1,
      value: 0,
      hint: 'Turning the grid never moves either arrow.',
    },
    // The frame in which the first axis points along B. Nothing about A is
    // changing — only which frame it is being described in.
    target: angleOfB,
    tolerance: 0.03,
    x: { label: 'angle of the grid (°)', domain: [-180, 180] },
    y: { label: 'first component of A' },
    rules: [
      { y: alongAB, label: 'how much of A lies along B', color: 'rgba(255,77,158,0.55)' },
      { y: 0, color: 'rgba(242,238,247,0.25)' },
    ],
    compute: (deg: number) => ({
      series: [
        {
          key: 'curve',
          label: 'first component of A',
          color: 'cyan',
          points: Array.from({ length: 361 }, (_, i) => {
            const d = i - 180;
            return [d, firstComponent(d)] as const;
          }),
        },
        {
          key: 'you',
          label: 'your grid',
          color: 'magenta',
          style: 'dots',
          width: 6,
          points: [[deg, firstComponent(deg)]],
        },
      ],
      readouts: [
        { label: 'first component of A', value: firstComponent(deg).toFixed(3) },
        { label: 'A · B', value: dot2(A, B).toFixed(3) },
        { label: '|B|', value: mag2(B).toFixed(3) },
        { label: 'A · B / |B|', value: alongAB.toFixed(3) },
      ],
    }),
  },
};

/* ── estimate: the factor that lost a spacecraft ─────────────────────────── */

export const estimate: Record<string, EstimateScenario> = {
  'up-ch1-lbf-vs-newton': {
    quantity: 'factor by which a pound-force second differs from a newton second',
    logRange: [-0.5, 2],
    logStart: 0,
    withinFactor: 1.6,
    landmarks: [
      { value: 1, label: 'no difference at all' },
      { value: 10, label: 'a factor of ten' },
    ],
    // Computed from the unit registry, where the pound-force is itself built
    // out of the pound and standard gravity.
    truth: () => conversionFactor('lbfs', 'Ns'),
  },
};
