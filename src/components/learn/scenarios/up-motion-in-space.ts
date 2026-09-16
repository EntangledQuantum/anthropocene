/** Scenario pack — University Physics, Chapter 3 (Motion in Two and Three
 *  Dimensions).
 *
 *  Registered automatically by the globs in `../sketch-scenarios.ts` and its
 *  siblings. Type-only imports keep that from being a runtime cycle.
 *
 *  Every truth here is COMPUTED from `src/lib/physics/`. There is not a single
 *  typed-in answer: an estimation question with a hand-entered true value is a
 *  trivia question wearing a slider.
 */
import type { SketchScenario } from '../sketch-scenarios.ts';
import type { EstimateScenario } from '../estimate-scenarios.ts';
import type { TuneScenario } from '../tune-scenarios.ts';
import { launchProjectile } from '../../../lib/physics/kinematics.ts';
import {
  BALLS,
  ballDrag,
  flightMetrics,
  steerRun,
  terminalSpeed,
} from '../../../lib/physics/motion2d.ts';

const DEG = Math.PI / 180;
const BASEBALL_K = ballDrag(BALLS.baseball);

/* ── sketch: the shape drag makes ────────────────────────────────────────── */

/** Height against horizontal distance for a hard-thrown baseball.
 *
 *  The tell is the asymmetry: the learner who has only ever drawn parabolas puts
 *  the apex in the middle and runs out of paper at 160 m. The truth peaks past
 *  the midpoint and comes down steeply, and stops well short.
 */
const draggedArc: SketchScenario = {
  xLabel: 'horizontal distance (m)',
  yLabel: 'height (m)',
  // The frame is wide and tall enough to hold the whole drag-free parabola
  // (163 m, apex 41 m), so the naive answer is drawable. It scores a mean
  // deviation of about 15 m against a tolerance of 2.6 — being able to make the
  // tempting mistake is the point of the question.
  xRange: [0, 170],
  yRange: [0, 45],
  tolerance: 2.6,
  anchors: [{ x: 0, y: 0, label: 'leaves the hand here' }],
  truth: () => {
    const path = launchProjectile(40, 45, { drag: BASEBALL_K, dt: 0.002 });
    const { range } = flightMetrics(path);
    // Resample onto the x grid the learner draws over, so the comparison is
    // height-against-distance and not a reparametrised curve.
    const out: { x: number; y: number }[] = [];
    for (let i = 0; i <= 120; i++) {
      const xWant = (range * i) / 120;
      let j = 1;
      while (j < path.length - 1 && path[j].x < xWant) j++;
      const a = path[j - 1];
      const b = path[j];
      const f = b.x === a.x ? 0 : (xWant - a.x) / (b.x - a.x);
      out.push({ x: xWant, y: Math.max(0, a.y + f * (b.y - a.y)) });
    }
    return out;
  },
};

export const sketch: Record<string, SketchScenario> = {
  'up-ch3-dragged-arc': draggedArc,
};

/* ── estimate: the speed that sets the scale ─────────────────────────────── */

/** The terminal speed of a baseball.
 *
 *  Asked *before* the drag panel is revealed, because it is the number that
 *  decides whether drag matters at all: a ball thrown slowly compared with this
 *  follows a parabola, and a ball thrown at it does not. Most people guess far
 *  too high — the honest answer is a bit under 90 mph, which is also why a
 *  fastball feels the air as strongly as it feels gravity. */
export const estimate: Record<string, EstimateScenario> = {
  'up-ch3-terminal-speed': {
    quantity: 'the steady speed a baseball reaches falling from a very great height',
    unit: 'm/s',
    logRange: [0, 3],
    logStart: 1.4,
    withinFactor: 1.5,
    landmarks: [
      { value: 9.81, label: 'one second of free fall' },
      { value: 31, label: 'motorway speed, 70 mph' },
      { value: 340, label: 'the speed of sound' },
    ],
    truth: () => terminalSpeed(BASEBALL_K),
  },
};

/* ── tune: find the angle that stops changing the speed ──────────────────── */

/** Sweep the angle between the acceleration arrow and the velocity, and watch
 *  what it does to the speed over one second.
 *
 *  The threshold is 90°, and the curve the learner is hunting on is
 *  d(speed)/dt = |a| cos θ — measured off real trajectories, not plotted from
 *  that formula. Zero crossing, not a maximum: the thing to find is where an
 *  effect *disappears*, which is a harder and more useful search. */
const steadySpeedAngle: TuneScenario = {
  param: {
    key: 'theta',
    label: 'angle from the velocity to the acceleration',
    symbol: 'θ',
    min: 0,
    max: 180,
    step: 1,
    value: 25,
    unit: '°',
    hint: '0° is straight ahead, 180° is straight backwards.',
  },
  target: 90,
  tolerance: 0.02, // ±1.8°
  x: { label: 'angle θ (degrees)', domain: [0, 180] },
  y: { label: 'speed change over one second (m/s)' },
  rules: [{ y: 0, label: 'speed unchanged' }],
  compute: (theta: number) => {
    // One second, and |a| small enough that even a fully backwards arrow cannot
    // bring the object to a halt inside it: a run that stops and reverses would
    // put a kink in the curve that is an artefact of the stop, not of the angle.
    const measure = (deg: number) => {
      const run = steerRun({
        speed0: 6,
        magnitude: 3,
        angle: deg * DEG,
        mode: 'velocity',
        duration: 1,
        dt: 0.002,
      });
      return run.speed[run.speed.length - 1] - run.speed[0];
    };

    const sweep: [number, number][] = [];
    for (let deg = 0; deg <= 180; deg += 5) sweep.push([deg, measure(deg)]);
    const here = measure(theta);

    const run = steerRun({
      speed0: 6,
      magnitude: 3,
      angle: theta * DEG,
      mode: 'velocity',
      duration: 1,
      dt: 0.002,
    });
    const r = run.readout[0];

    return {
      series: [
        { key: 'sweep', label: 'measured speed change', color: 'cyan', points: sweep },
        { key: 'you', label: 'your angle', color: 'magenta', style: 'dots', width: 6, points: [[theta, here]] },
      ],
      readouts: [
        { label: 'speed change', value: `${here >= 0 ? '+' : ''}${here.toFixed(3)} m/s` },
        { label: 'aₜ', value: `${r.tangential.toFixed(3)} m/s²` },
        { label: 'aₙ', value: `${Math.abs(r.normal).toFixed(3)} m/s²` },
        {
          // sin(180°) is 1e-16 rather than 0 in floating point, so "no steering
          // at all" arrives as an astronomically large radius rather than as
          // Infinity. Anything past a kilometre is a straight line here.
          label: 'turn radius',
          value: r.turnRadius < 1e3 ? `${r.turnRadius.toFixed(1)} m` : 'straight',
        },
      ],
    };
  },
};

export const tune: Record<string, TuneScenario> = {
  'up-ch3-steady-speed-angle': steadySpeedAngle,
};
