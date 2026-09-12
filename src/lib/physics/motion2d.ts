/** Motion in two dimensions: steering, and the parabola that isn't one.
 *
 *  Chapter 3's reusable picture is "a velocity arrow whose tip is being dragged
 *  by an acceleration arrow", so the primitives here are all about the *angle
 *  between the two arrows*. Point the acceleration along v and you change speed
 *  only; point it across v and you change direction only; anything in between
 *  does both, in the proportions `tangentNormalSplit` reports.
 *
 *  Nothing here reimplements an integrator or a decomposition. The stepper is
 *  the same velocity-Verlet update `kinematics.launchProjectile` uses, the split
 *  is `kinematics.tangentNormalSplit`, and the projectile flights come straight
 *  from `kinematics.launchProjectile`. This file is the 2D *questions* asked of
 *  that code.
 */
import {
  centripetal,
  tangentNormalSplit,
  type ProjectileState,
} from './kinematics.ts';

/* ── steering: dragging the acceleration arrow ───────────────────────────── */

export interface Particle {
  t: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
}

/** How the learner's acceleration arrow is anchored.
 *
 *  `world` holds the arrow at a fixed compass direction — gravity, a constant
 *  wind, the field between two plates. `velocity` holds it at a fixed angle to
 *  the current velocity, which is the only way a hand can *hold* a circle:
 *  steering has to turn as you turn. Both are physically real situations, and
 *  the difference between them is most of what "centripetal" means. */
export type AnchorMode = 'world' | 'velocity';

/** The acceleration vector implied by a magnitude, an angle, and an anchor.
 *
 *  In `world` mode the angle is measured from the +x axis. In `velocity` mode it
 *  is measured from the velocity direction, counter-clockwise, so 0° is pure
 *  speeding up, 180° pure braking, and 90° pure left-hand steering. */
export function accelVector(
  p: Particle,
  magnitude: number,
  angleRad: number,
  mode: AnchorMode,
): [number, number] {
  if (mode === 'world') {
    return [magnitude * Math.cos(angleRad), magnitude * Math.sin(angleRad)];
  }
  const s = Math.hypot(p.vx, p.vy);
  if (s === 0) return [magnitude * Math.cos(angleRad), magnitude * Math.sin(angleRad)];
  // Unit tangent, then rotate it by the angle. Same rotation `vectors.rotate2`
  // performs; written out here so the stepper carries no allocation per step.
  const tx = p.vx / s;
  const ty = p.vy / s;
  const c = Math.cos(angleRad);
  const sn = Math.sin(angleRad);
  return [magnitude * (tx * c - ty * sn), magnitude * (tx * sn + ty * c)];
}

/** One step under a *constant* acceleration. Exact for constant a, which is
 *  what `world` mode is: the position update carries the ½at² term and the
 *  velocity update is the whole change.
 *
 *  Mutates `p` — the widget runs this from a ref, hundreds of times a second,
 *  and a fresh object per step would put the garbage collector inside the
 *  animation loop. */
export function stepParticle(p: Particle, ax: number, ay: number, dt: number): void {
  p.x += p.vx * dt + 0.5 * ax * dt * dt;
  p.y += p.vy * dt + 0.5 * ay * dt * dt;
  p.vx += ax * dt;
  p.vy += ay * dt;
  p.t += dt;
}

/** One step with the acceleration arrow re-evaluated at the predicted velocity.
 *
 *  The same two-pass predictor `kinematics.launchProjectile` uses for drag, and
 *  it matters for exactly the same reason: in `velocity` mode the arrow turns as
 *  the velocity turns, so taking a fixed a across the step would nudge the speed
 *  every time. With a perpendicular arrow that error is what a learner would see
 *  as a circle that slowly spirals — integrator error masquerading as physics,
 *  and the one thing this widget must not do. In `world` mode the corrector is a
 *  no-op, because a really is constant. */
export function stepSteered(
  p: Particle,
  magnitude: number,
  angleRad: number,
  mode: AnchorMode,
  dt: number,
): void {
  const [ax, ay] = accelVector(p, magnitude, angleRad, mode);
  p.x += p.vx * dt + 0.5 * ax * dt * dt;
  p.y += p.vy * dt + 0.5 * ay * dt * dt;

  const predicted: Particle = { ...p, vx: p.vx + ax * dt, vy: p.vy + ay * dt };
  const [px, py] = accelVector(predicted, magnitude, angleRad, mode);
  p.vx += 0.5 * (ax + px) * dt;
  p.vy += 0.5 * (ay + py) * dt;
  p.t += dt;
}

export interface SteerReadout {
  speed: number;
  /** Component of a along v: the rate at which speed itself is changing. */
  tangential: number;
  /** Component of a across v, signed positive for a left turn. */
  normal: number;
  /** |a_n| / v² — how sharply the path is bending, independent of how fast. */
  curvature: number;
  /** v² / |a_n|, the radius of the circle the path is momentarily following.
   *  Infinite when nothing is steering. */
  turnRadius: number;
  /** How fast the velocity *direction* is rotating, in rad/s. Signed. */
  turnRate: number;
}

/** Everything the steering widget prints, from one (v, a) pair. */
export function steerReadout(
  vx: number,
  vy: number,
  ax: number,
  ay: number,
): SteerReadout {
  const speed = Math.hypot(vx, vy);
  const { tangential, normal } = tangentNormalSplit(vx, vy, ax, ay);
  const curvature = speed === 0 ? Infinity : Math.abs(normal) / (speed * speed);
  return {
    speed,
    tangential,
    normal,
    curvature,
    turnRadius: normal === 0 ? Infinity : (speed * speed) / Math.abs(normal),
    turnRate: speed === 0 ? 0 : normal / speed,
  };
}

export interface SteerOptions {
  speed0: number;
  /** Initial heading, radians from +x. */
  heading0?: number;
  magnitude: number;
  /** Angle of the acceleration arrow, radians. Interpretation set by `mode`. */
  angle: number;
  mode: AnchorMode;
  duration: number;
  dt?: number;
  x0?: number;
  y0?: number;
}

export interface SteerRun {
  path: Particle[];
  /** Speed at each sample — the honest answer to "is it speeding up?". */
  speed: number[];
  readout: SteerReadout[];
}

/** Integrate a steered particle for a fixed time and keep the whole history.
 *
 *  Used by the scenarios and the tests. The live widget steps incrementally
 *  instead, because the learner changes the arrow mid-flight. */
export function steerRun(opts: SteerOptions): SteerRun {
  const { speed0, heading0 = 0, magnitude, angle, mode, duration, dt = 0.002, x0 = 0, y0 = 0 } = opts;
  const p: Particle = {
    t: 0,
    x: x0,
    y: y0,
    vx: speed0 * Math.cos(heading0),
    vy: speed0 * Math.sin(heading0),
  };
  const n = Math.max(1, Math.round(duration / dt));

  const path: Particle[] = [{ ...p }];
  const speed: number[] = [Math.hypot(p.vx, p.vy)];
  const readout: SteerReadout[] = [];
  {
    const [ax, ay] = accelVector(p, magnitude, angle, mode);
    readout.push(steerReadout(p.vx, p.vy, ax, ay));
  }

  for (let i = 0; i < n; i++) {
    stepSteered(p, magnitude, angle, mode, dt);
    path.push({ ...p });
    speed.push(Math.hypot(p.vx, p.vy));
    const [nx, ny] = accelVector(p, magnitude, angle, mode);
    readout.push(steerReadout(p.vx, p.vy, nx, ny));
  }
  return { path, speed, readout };
}

/** The circle a purely perpendicular acceleration produces.
 *
 *  Written as the *inverse* of `centripetal`: the lesson hands the learner a
 *  speed and an acceleration magnitude and asks what circle that forces, which
 *  is the direction the reasoning actually runs when you are steering. */
export function circleFromSteering(speed: number, aMagnitude: number) {
  const radius = aMagnitude === 0 ? Infinity : (speed * speed) / aMagnitude;
  const omega = radius === Infinity ? 0 : speed / radius;
  return {
    radius,
    /** rad/s */
    omega,
    /** seconds for one lap */
    period: omega === 0 ? Infinity : (2 * Math.PI) / omega,
    /** laps per second */
    frequency: omega === 0 ? 0 : omega / (2 * Math.PI),
    /** Round trip through `centripetal`: this must return `aMagnitude`. */
    check: radius === Infinity ? 0 : centripetal(speed, radius),
  };
}

/* ── projectiles: two 1D motions sharing one clock ───────────────────────── */

/** Height of an object released from rest at t = 0. The comparison ball in the
 *  "dropped at the same instant" picture — and the whole content of vertical
 *  independence, since a launched projectile's *vertical* motion differs from
 *  this only by its initial vy. */
export const freeFall = (t: number, g = 9.81): number => -0.5 * g * t * t;

export interface FlightMetrics {
  /** Horizontal distance at the moment the ball returns to launch height. */
  range: number;
  /** Greatest height reached. */
  apex: number;
  timeOfFlight: number;
  /** Time spent climbing, and time spent descending. Equal without drag, and
   *  the inequality is the cleanest single symptom that drag is present. */
  riseTime: number;
  fallTime: number;
  launchSpeed: number;
  impactSpeed: number;
  /** Angle below the horizontal on landing, degrees. Equals the launch angle
   *  exactly when there is no drag. */
  impactAngleDeg: number;
  /** Horizontal speed at landing over horizontal speed at launch. 1 without
   *  drag — the honest test of "horizontal velocity dies off". */
  horizontalRetained: number;
}

/** Measure a flight that `launchProjectile` produced.
 *
 *  Range and time of flight are linearly interpolated across the sample that
 *  straddles the ground, not read off the last sample: at dt = 4 ms a 40 m/s
 *  ball moves 16 cm per step, and a lesson comparing a measured range to a
 *  closed form must not lose a decimal place to the sampling grid. */
export function flightMetrics(path: readonly ProjectileState[], g = 9.81): FlightMetrics {
  const first = path[0];
  const last = path[path.length - 1];

  let apex = first.y;
  let riseTime = 0;
  for (const s of path) {
    if (s.y > apex) {
      apex = s.y;
      riseTime = s.t;
    }
  }

  // Interpolate the ground crossing.
  let end = last;
  let range = last.x;
  let timeOfFlight = last.t;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1];
    const b = path[i];
    if (a.y > first.y && b.y <= first.y) {
      const f = (a.y - first.y) / (a.y - b.y);
      range = a.x + f * (b.x - a.x);
      timeOfFlight = a.t + f * (b.t - a.t);
      end = {
        t: timeOfFlight,
        x: range,
        y: first.y,
        vx: a.vx + f * (b.vx - a.vx),
        vy: a.vy + f * (b.vy - a.vy),
      };
      break;
    }
  }

  const launchSpeed = Math.hypot(first.vx, first.vy);
  const impactSpeed = Math.hypot(end.vx, end.vy);
  return {
    range,
    apex: apex - first.y,
    timeOfFlight,
    riseTime,
    fallTime: timeOfFlight - riseTime,
    launchSpeed,
    impactSpeed,
    impactAngleDeg: (Math.atan2(-end.vy, end.vx) * 180) / Math.PI,
    horizontalRetained: first.vx === 0 ? 1 : end.vx / first.vx,
  };
}

/** Linear interpolation into a flight at an arbitrary time — what a scrubber
 *  needs, and what keeps the widget's marker on the curve instead of snapping
 *  between samples. */
export function sampleFlight(
  path: readonly ProjectileState[],
  t: number,
): ProjectileState {
  if (t <= path[0].t) return path[0];
  const last = path[path.length - 1];
  if (t >= last.t) return last;
  // Uniform dt, so the index is arithmetic rather than a search.
  const dt = path[1].t - path[0].t;
  const i = Math.min(path.length - 2, Math.max(0, Math.floor((t - path[0].t) / dt)));
  const a = path[i];
  const b = path[i + 1];
  const f = (t - a.t) / (b.t - a.t);
  return {
    t,
    x: a.x + f * (b.x - a.x),
    y: a.y + f * (b.y - a.y),
    vx: a.vx + f * (b.vx - a.vx),
    vy: a.vy + f * (b.vy - a.vy),
  };
}

/* ── drag, in units a ball actually has ──────────────────────────────────── */

export interface BallSpec {
  label: string;
  /** kg */
  mass: number;
  /** m */
  radius: number;
  /** dimensionless */
  dragCoefficient: number;
}

/** Air density at sea level, kg/m³. */
export const RHO_AIR = 1.225;

/** The `drag` parameter `launchProjectile` wants, in 1/m.
 *
 *  a_drag = -k |v| v with k = ½ρC_dA/m. Converting here rather than in a lesson
 *  means no lesson ever contains a magic number: it contains a ball. */
export function ballDrag(ball: BallSpec, rho = RHO_AIR): number {
  const area = Math.PI * ball.radius * ball.radius;
  return (0.5 * rho * ball.dragCoefficient * area) / ball.mass;
}

/** Speed at which quadratic drag balances weight. Also the speed above which
 *  "drag is a small correction" stops being true. */
export const terminalSpeed = (drag: number, g = 9.81): number =>
  drag <= 0 ? Infinity : Math.sqrt(g / drag);

/** Ball specs, with sources in docs/orchestrator-university/notes/ch03.md.
 *
 *  C_d ≈ 0.35 for a spinning pitched baseball at Re ≈ 2 × 10⁵ — quadratic drag
 *  territory, not Stokes. The ping-pong ball is here because it is the case
 *  where the parabola is not a decent approximation at all. */
export const BALLS: Record<string, BallSpec> = {
  baseball: { label: 'baseball', mass: 0.145, radius: 0.0366, dragCoefficient: 0.35 },
  soccer: { label: 'soccer ball', mass: 0.43, radius: 0.11, dragCoefficient: 0.25 },
  pingpong: { label: 'ping-pong ball', mass: 0.0027, radius: 0.02, dragCoefficient: 0.45 },
  shotput: { label: 'shot put', mass: 7.26, radius: 0.06, dragCoefficient: 0.47 },
};
