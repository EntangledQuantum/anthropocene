/** Chapter 3 scenes: a car in a bend, a puck on a string, two balls off a
 *  table, and a shot at a falling can.
 *
 *  Each function answers one question a scene asks, using the integrators that
 *  already exist: `stepSteered` (motion2d.ts) for an acceleration glued to the
 *  velocity, `launchProjectile` (kinematics.ts) for anything thrown. Nothing
 *  here is a new integrator; it is geometry and bookkeeping around them, so the
 *  numbers a scene prints are the numbers the tests pin.
 */
import { centripetal, launchProjectile, type ProjectileState } from './kinematics.ts';
import { stepSteered, type Particle } from './motion2d.ts';

const TAU = 2 * Math.PI;
/** Wrap an angle to (-π, π]. */
export const wrapAngle = (a: number): number => {
  let w = ((a + Math.PI) % TAU + TAU) % TAU - Math.PI;
  if (w === -Math.PI) w = Math.PI;
  return w;
};

/* ── the bend ────────────────────────────────────────────────────────────── */

/** A left-hand bend, seen from above. The car arrives up the page along x = 0,
 *  reaches the bend at the origin heading +y, goes a quarter turn round a
 *  centre at (-R, 0), and leaves along y = R heading -x. */
export interface Bend {
  /** Radius of the centreline, m. */
  radius: number;
  /** Half the lane width, m. Further than this from the centreline is off the road. */
  laneHalf: number;
  /** Length of the straight after the bend, m. */
  exit: number;
}

/** Signed distance from the centreline, positive to the right of the direction
 *  of travel. In the bend, right of travel is away from the centre, so positive
 *  means running wide and negative means cutting inside. */
export function offCentreline(b: Bend, x: number, y: number): number {
  const R = b.radius;
  if (y < 0) return x; // approach, heading +y: right is +x
  if (x >= -R) return Math.hypot(x + R, y) - R; // the arc
  return y - R; // exit, heading -x: right is +y
}

export type BendOutcome = 'held' | 'outside' | 'inside';

export interface BendRun {
  path: Particle[];
  outcome: BendOutcome;
  /** How far round the bend the car was when it left the road, degrees. */
  offAtDeg: number;
  /** Speed on leaving the road, or at the end of a clean run, m/s. */
  endSpeed: number;
  /** Radius of the circle the arrow would hold at the entry speed: v²/a_n. */
  circleRadius: number;
}

/** Drive into the bend with an acceleration fixed relative to the car.
 *
 *  `along` is the component along the velocity (speeds up), `across` the one
 *  across it (positive steers left). The arrow is glued to the car, as steering
 *  is, and is held until the car has turned a quarter turn; then the car goes
 *  straight. A car that leaves the lane is followed for `overrun` seconds more,
 *  so the scene can show it off the road. */
export function driveBend(opts: {
  speed: number;
  along: number;
  across: number;
  bend: Bend;
  dt?: number;
  maxTime?: number;
  /** Seconds the run carries on after leaving the road. */
  overrun?: number;
}): BendRun {
  const { speed, along, across, bend, dt = 0.002, maxTime = 20, overrun = 0.4 } = opts;
  const mag = Math.hypot(along, across);
  const ang = Math.atan2(across, along);
  const p: Particle = { t: 0, x: 0, y: 0, vx: 0, vy: speed };
  const path: Particle[] = [{ ...p }];
  const turned = () => wrapAngle(Math.atan2(p.vy, p.vx) - Math.PI / 2);
  let steering = true;
  let outcome: BendOutcome = 'held';
  let offAtDeg = 90;
  let endSpeed = NaN;
  let offAt = Infinity; // time the car left the road

  while (p.t < maxTime && p.t < offAt + overrun) {
    if (steering) {
      stepSteered(p, mag, ang, 'velocity', dt);
      if (turned() >= Math.PI / 2 || Math.hypot(p.vx, p.vy) < 0.05) steering = false;
    } else {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.t += dt;
    }
    path.push({ ...p });
    if (offAt < Infinity) continue; // already off: run on so the wreck is visibly off the road
    const off = offCentreline(bend, p.x, p.y);
    if (Math.abs(off) > bend.laneHalf) {
      outcome = off > 0 ? 'outside' : 'inside';
      // How far round the bend, measured about the bend's centre.
      const round = Math.atan2(p.y, p.x + bend.radius);
      offAtDeg = Math.max(0, Math.min(90, (round * 180) / Math.PI));
      endSpeed = Math.hypot(p.vx, p.vy);
      offAt = p.t;
      continue;
    }
    if (p.x < -bend.radius - bend.exit) break;
    if (Math.hypot(p.vx, p.vy) < 0.05) { outcome = 'inside'; offAtDeg = 0; break; }
  }
  return {
    path,
    outcome,
    offAtDeg,
    endSpeed: Number.isNaN(endSpeed) ? Math.hypot(p.vx, p.vy) : endSpeed,
    circleRadius: across === 0 ? Infinity : (speed * speed) / Math.abs(across),
  };
}

/** The sideways acceleration that holds a bend of radius R at speed v. */
export const holdingAccel = (speed: number, radius: number): number => centripetal(speed, radius);

/* ── the puck on a string ────────────────────────────────────────────────── */

/** A puck whirled anticlockwise on a string of length r at a steady speed, on
 *  a frictionless table, centre at the origin. */
export function whirl(r: number, speed: number, angle: number) {
  const c = Math.cos(angle), s = Math.sin(angle);
  return {
    x: r * c, y: r * s,
    vx: -speed * s, vy: speed * c,
    /** Pointing at the centre, size v²/r. */
    ax: -centripetal(speed, r) * c, ay: -centripetal(speed, r) * s,
  };
}

/** Where the puck is t seconds after the string is let go at `angle`.
 *  Nothing acts in the plane of the table, so it keeps the velocity it had. */
export function afterRelease(r: number, speed: number, angle: number, t: number): [number, number] {
  const w = whirl(r, speed, angle);
  return [w.x + w.vx * t, w.y + w.vy * t];
}

/** Closest the released puck comes to a target, and when. */
export function releaseMiss(r: number, speed: number, angle: number, target: readonly [number, number]) {
  const w = whirl(r, speed, angle);
  const dx = target[0] - w.x, dy = target[1] - w.y;
  const tStar = Math.max(0, (dx * w.vx + dy * w.vy) / (speed * speed));
  const [px, py] = [w.x + w.vx * tStar, w.y + w.vy * tStar];
  return { miss: Math.hypot(target[0] - px, target[1] - py), t: tStar };
}

/** The release angle that sends an anticlockwise puck through the target:
 *  the point where the tangent from the target touches the circle. */
export function releaseAngleFor(r: number, target: readonly [number, number]): number {
  const D = Math.hypot(target[0], target[1]);
  return wrapAngle(Math.atan2(target[1], target[0]) - Math.acos(r / D));
}

/* ── off the table edge ──────────────────────────────────────────────────── */

export interface TableFlight {
  path: ProjectileState[];
  /** Seconds from the edge to the floor. */
  landTime: number;
  /** Metres from the edge to where it lands. */
  landX: number;
}

/** A ball leaves a table of height h moving horizontally at v0. Coordinates
 *  have the floor at y = 0 and the table edge at x = 0. `drag` is quadratic
 *  drag per unit mass, 1/m (see `ballDrag`); zero is the vacuum. */
export function offTheTable(v0: number, h: number, opts: { drag?: number; g?: number } = {}): TableFlight {
  const { drag = 0, g = 9.81 } = opts;
  const raw = launchProjectile(v0, 0, { groundY: -h, g, drag, dt: 0.002 });
  const path = raw.map((s) => ({ ...s, y: s.y + h }));
  const b = path[path.length - 1], a = path[path.length - 2];
  const f = a.y / (a.y - b.y);
  return { path, landTime: a.t + f * (b.t - a.t), landX: a.x + f * (b.x - a.x) };
}

/* ── the falling can ─────────────────────────────────────────────────────── */

export interface CanShot {
  /** The ball, from the launcher at the origin. */
  ball: ProjectileState[];
  /** The can, let go from (D, H) at the instant the ball is fired. */
  can: ProjectileState[];
  /** Closest distance between ball and can, m. */
  closest: number;
  /** Ball height minus can height when the ball reaches the can's x; null if it
   *  lands first. Positive means the ball passes above. */
  gap: number | null;
  /** How far the can has fallen when the ball reaches it, m. */
  canFell: number | null;
  /** How far below its aim line the ball is at that moment, m. */
  ballFell: number | null;
  /** Where the ball lands, m from the launcher. */
  landX: number;
}

/** Fire a ball at `speed` along `aimDeg` from the origin at the instant a can
 *  is let go from (D, H). `drag` is the ball's quadratic drag per unit mass
 *  (1/m, see `ballDrag`); the can is heavy and falls freely. */
export function shootAtCan(opts: {
  speed: number;
  aimDeg: number;
  can: readonly [number, number];
  drag?: number;
  g?: number;
  dt?: number;
}): CanShot {
  const { speed, aimDeg, can: [D, H], drag = 0, g = 9.81, dt = 0.002 } = opts;
  const ball = launchProjectile(speed, aimDeg, { drag, g, dt });
  const fall = launchProjectile(0, 0, { g, dt, groundY: -H });
  const can = fall.map((s) => ({ ...s, x: s.x + D, y: s.y + H }));
  const at = (path: ProjectileState[], i: number) => path[Math.min(i, path.length - 1)];

  let closest = Infinity;
  for (let i = 0; i < ball.length; i++) {
    const b = ball[i], c = at(can, i);
    closest = Math.min(closest, Math.hypot(b.x - c.x, b.y - c.y));
  }

  let gap: number | null = null, canFell: number | null = null, ballFell: number | null = null;
  const tan = Math.tan((aimDeg * Math.PI) / 180);
  for (let i = 1; i < ball.length; i++) {
    const a = ball[i - 1], b = ball[i];
    if (a.x < D && b.x >= D) {
      const f = (D - a.x) / (b.x - a.x);
      const t = a.t + f * (b.t - a.t);
      const y = a.y + f * (b.y - a.y);
      // Same dt, so sample i of the can is the same instant as sample i of the ball.
      const ca = at(can, i - 1), cb = at(can, i);
      const cy = ca.y + f * (cb.y - ca.y);
      gap = y - cy;
      canFell = H - cy;
      ballFell = D * tan - y;
      break;
    }
  }
  const last = ball[ball.length - 1];
  return { ball, can, closest, gap, canFell, ballFell, landX: last.x };
}

/** The aim that points the barrel straight at the can. */
export const aimStraightAt = (can: readonly [number, number]): number =>
  (Math.atan2(can[1], can[0]) * 180) / Math.PI;
