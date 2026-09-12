/** Scenario pack — University Physics, Chapter 4 (Newton's Laws).
 *
 *  Registered automatically by the globs in `../sketch-scenarios.ts` and
 *  `../estimate-scenarios.ts`. Type-only imports keep that from being a cycle.
 *
 *  Every truth here is produced by running `src/lib/physics/dynamics.ts` — the
 *  same integrator the `<FbdBuilder>` widget runs. The curve the learner is
 *  graded against is the curve they watched.
 */
import type { SketchScenario } from '../sketch-scenarios.ts';
import type { EstimateScenario } from '../estimate-scenarios.ts';
import {
  createWorld,
  step,
  timeToReachSpeed,
  weight,
  type Force,
} from '../../../lib/physics/dynamics.ts';

const DT = 1 / 240;

/* ── the puck that is pushed, then released ────────────────────────────────
   A 2 kg puck already coasting at 4 m/s on frictionless ice. A steady 6 N
   forward push from t = 0 to t = 3 s, then nothing.

   Three wrong shapes are available and all three are diagnostic:
     · a step up to a new constant speed          → force-sustains-speed (FCI AF4)
     · a rise, then a decay back toward 4 m/s     → motion-stops-when-force-stops
     · a rise that flattens while the push is on  → drag imagined where there is none
   ──────────────────────────────────────────────────────────────────────── */

const PUCK_M = 2;
const PUSH_N = 6;
const RELEASE_T = 3;
const SPAN_T = 6;

function pushThenReleaseHistory(): { x: number; y: number }[] {
  const push: Force = {
    id: 'push',
    on: 'puck',
    by: 'you',
    kind: 'applied',
    vec: [PUSH_N, 0],
  };
  const w = createWorld({
    bodies: [{ id: 'puck', label: 'puck', mass: PUCK_M, pos: [0, 0], vel: [4, 0], size: 0.4 }],
    forces: [
      { id: 'w', on: 'puck', by: 'Earth', kind: 'gravity', vec: [0, -weight(PUCK_M)] },
      push,
    ],
    surface: { angleRad: 0, muS: 0, muK: 0 },
  });

  const out: { x: number; y: number }[] = [{ x: 0, y: w.bodies[0].vel[0] }];
  let released = false;
  const n = Math.round(SPAN_T / DT);
  for (let i = 1; i <= n; i++) {
    if (!released && w.t >= RELEASE_T) {
      // The hand lets go. Nothing else changes, and that is the whole point.
      w.forces = w.forces.filter((f) => f.id !== 'push');
      released = true;
    }
    step(w, DT);
    if (i % 4 === 0) out.push({ x: w.t, y: w.bodies[0].vel[0] });
  }
  return out;
}

const pushThenRelease: SketchScenario = {
  xLabel: 'time (s)',
  yLabel: 'speed (m/s)',
  xRange: [0, SPAN_T],
  yRange: [0, 18],
  tolerance: 1.6,
  anchors: [{ x: 0, y: 4, label: 'already coasting at 4 m/s' }],
  truth: pushThenReleaseHistory,
};

export const sketch: Record<string, SketchScenario> = {
  'up-ch4-push-then-release': pushThenRelease,
};

/* ── how long does one person need to move a car? ──────────────────────────
   1400 kg, a steady 300 N shoulder against the back, level ground with the
   handbrake off. The surprise is that mass alone is not much of an obstacle —
   what usually stops you is the rolling resistance, not the inertia.
   ──────────────────────────────────────────────────────────────────────── */

const CAR_M = 1400;
const SHOULDER_N = 300;
const WALKING_V = 1.4;

export const estimate: Record<string, EstimateScenario> = {
  'up-ch4-car-to-walking-pace': {
    quantity: 'seconds of steady 300 N pushing to get a 1400 kg car from rest to walking pace (1.4 m/s), with the rolling resistance neglected',
    unit: 's',
    logRange: [0, 3.2],
    logStart: 1.7,
    withinFactor: 1.7,
    landmarks: [
      { value: 10, label: 'ten seconds' },
      { value: 60, label: 'a minute' },
      { value: 600, label: 'ten minutes' },
    ],
    truth: () => timeToReachSpeed(CAR_M, SHOULDER_N, WALKING_V),
  },
};
