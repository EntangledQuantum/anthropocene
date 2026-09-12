/** Newton's laws as a bookkeeping problem over interactions.
 *
 *  Chapter 4's whole argument is that a force is a relationship between two
 *  bodies, not a property one of them carries. So the primitive here is not a
 *  vector — it is a `Force` that knows which body it acts **on** and which
 *  agent it comes **from**. Everything else falls out of that one decision:
 *
 *    - `netForceOn` filters by `on`, so a third-law partner is structurally
 *      incapable of entering the wrong sum. There is no rule to remember and no
 *      way to get it wrong; the data shape forbids it.
 *    - `thirdLawPartner` is a pure transformation that swaps the two ends and
 *      negates the arrow. The law stops being a claim and becomes a symmetry of
 *      the representation.
 *    - Choosing a system is choosing which `on` values you are summing over,
 *      which is exactly what "internal vs external" means.
 *
 *  Arithmetic comes from `vectors.ts`; nothing here reimplements it.
 */

import {
  add2,
  cross2,
  dot2,
  mag2,
  rotate2,
  scale2,
  sub2,
  decompose,
  type Vec2,
} from './vectors.ts';

/** Standard gravity at the Earth's surface, m/s². */
export const G_EARTH = 9.81;

export type ForceKind =
  | 'gravity'
  | 'normal'
  | 'applied'
  | 'friction'
  | 'tension'
  | 'contact'
  | 'drag'
  | 'spring';

export interface Force {
  id: string;
  /** Id of the body this force acts ON. The only sum it may enter. */
  on: string;
  /** Who exerts it: another body's id, or a named agent ('Earth', 'the table'). */
  by: string;
  /** Newtons, +y up. */
  vec: Vec2;
  kind: ForceKind;
  label?: string;
  /** Application point relative to the body's centre, in metres. Only torque
   *  cares; translation does not. Chapter 11's business. */
  at?: Vec2;
}

export interface Body {
  id: string;
  label: string;
  /** kg. Resistance to having the velocity changed — nothing else. */
  mass: number;
  /** metres */
  pos: Vec2;
  /** m/s */
  vel: Vec2;
  /** Drawn half-width in metres. Geometry only; the dynamics is a point mass. */
  size: number;
}

/* ── the sums ─────────────────────────────────────────────────────────────── */

/** Vector sum of every force acting ON `bodyId`, and of nothing else.
 *
 *  The filter is the lesson. A learner who puts the reaction force on the same
 *  diagram has written `on: 'block'` for a force that is genuinely
 *  `on: 'table'`, and the sum simply does not see it. */
export function netForceOn(bodyId: string, forces: readonly Force[]): Vec2 {
  return forces
    .filter((f) => f.on === bodyId)
    .reduce<Vec2>((acc, f) => add2(acc, f.vec), [0, 0]);
}

/** F_net = m a, solved the only way it is ever actually used: for a. */
export function accelerationOn(
  bodyId: string,
  mass: number,
  forces: readonly Force[],
): Vec2 {
  return scale2(netForceOn(bodyId, forces), 1 / mass);
}

/** Sum over a chosen SYSTEM of bodies. Forces between members appear twice —
 *  once as themselves and once as their partner — and cancel, which is the
 *  entire content of "internal forces do not accelerate the system". */
export function netForceOnSystem(
  bodyIds: readonly string[],
  forces: readonly Force[],
): Vec2 {
  const inside = new Set(bodyIds);
  return forces
    .filter((f) => inside.has(f.on))
    .reduce<Vec2>((acc, f) => add2(acc, f.vec), [0, 0]);
}

/** Which forces on the chosen system are internal — i.e. exerted by another
 *  member. These are the ones that vanish from the system's budget. */
export function internalForces(
  bodyIds: readonly string[],
  forces: readonly Force[],
): Force[] {
  const inside = new Set(bodyIds);
  return forces.filter((f) => inside.has(f.on) && inside.has(f.by));
}

/** Torque of every force about `pivot`, out of the page positive. Chapter 11
 *  reuses this; translation ignores it entirely. */
export function netTorqueAbout(
  pivot: Vec2,
  bodies: readonly Body[],
  forces: readonly Force[],
): number {
  let tau = 0;
  for (const f of forces) {
    const b = bodies.find((x) => x.id === f.on);
    if (!b) continue;
    const app = add2(b.pos, f.at ?? [0, 0]);
    tau += cross2(sub2(app, pivot), f.vec);
  }
  return tau;
}

/** Equilibrium is a = 0, which is a statement about the SUM. It is not "no
 *  forces", and Chapter 5 opens on exactly that distinction. */
export function inEquilibrium(
  bodyId: string,
  forces: readonly Force[],
  tol = 1e-9,
): boolean {
  return mag2(netForceOn(bodyId, forces)) <= tol;
}

/* ── the third law ────────────────────────────────────────────────────────── */

/** The same interaction, read from the other end.
 *
 *  Swap the two participants and negate the arrow. Note what this does NOT
 *  consult: either mass. A force pair cannot know which body is heavier, which
 *  is why the third law has no exceptions for a truck meeting a car. */
export function thirdLawPartner(f: Force, idSuffix = '-partner'): Force {
  return {
    ...f,
    id: `${f.id}${idSuffix}`,
    on: f.by,
    by: f.on,
    vec: scale2(f.vec, -1),
    label: f.label ? `${f.label} (partner)` : undefined,
  };
}

/** Are these two forces the two ends of one interaction?
 *
 *  Three conditions, and the third is the one people drop: the pair must live
 *  on DIFFERENT bodies. Gravity and the normal force on a resting book are
 *  equal and opposite and are not a pair, because they both act on the book and
 *  they come from different interactions. */
export function isThirdLawPair(a: Force, b: Force, tol = 1e-9): boolean {
  const opposite = mag2(add2(a.vec, b.vec)) <= tol;
  const swapped = a.on === b.by && a.by === b.on;
  const differentBodies = a.on !== b.on;
  return opposite && swapped && differentBodies;
}

/* ── weight, and what a scale actually measures ───────────────────────────── */

/** The gravitational force on a mass. A force, in newtons — never a mass. */
export function weight(mass: number, g = G_EARTH): number {
  return mass * g;
}

/** What a bathroom scale under a body reads, in newtons.
 *
 *  A scale reports the NORMAL force it exerts, which equals m(g + a_y) — so it
 *  agrees with the weight only when a_y = 0. In free fall it reads zero with
 *  gravity entirely undiminished, which is what "weightless" actually names.
 *  Clamped at zero: a scale pushes and cannot pull. */
export function scaleReading(mass: number, aY: number, g = G_EARTH): number {
  return Math.max(0, mass * (g + aY));
}

/* ── contact with a surface ───────────────────────────────────────────────── */

export interface Surface {
  /** Radians CCW from horizontal. 0 is a level table. */
  angleRad: number;
  muS: number;
  muK: number;
}

/** Unit vector along the surface, pointing "uphill-positive". */
export const surfaceTangent = (s: Surface): Vec2 => rotate2([1, 0], s.angleRad);
/** Outward unit normal — the direction the surface can push. */
export const surfaceNormal = (s: Surface): Vec2 => rotate2([0, 1], s.angleRad);

export interface ContactSolution {
  /** Magnitude of the normal force, newtons. Zero means the body has left. */
  normalMag: number;
  /** Signed friction along the tangent, newtons. */
  frictionTangential: number;
  /** True while the surface is still pushing. */
  touching: boolean;
  /** Static friction was sufficient and the body is not sliding. */
  stuck: boolean;
}

const SLIDE_EPS = 1e-4;

/** Solve the contact forces a surface must supply, given everything else.
 *
 *  The normal force is not a law, it is a consequence: it takes whatever value
 *  cancels the into-the-surface component of every other force — and it is
 *  clamped at zero, because a surface pushes and never pulls. Pull up hard
 *  enough and N goes to zero and the body leaves. That clamp is the reason a
 *  learner can discover "N is not always mg" instead of being told. */
export function solveContact(
  body: Body,
  otherForces: readonly Force[],
  surface: Surface,
): ContactSolution {
  const nHat = surfaceNormal(surface);
  const tHat = surfaceTangent(surface);
  const other = netForceOn(body.id, otherForces);

  const intoSurface = -dot2(other, nHat);
  if (intoSurface <= 0) {
    return { normalMag: 0, frictionTangential: 0, touching: false, stuck: false };
  }
  const normalMag = intoSurface;

  const appliedT = dot2(other, tHat);
  const vT = dot2(body.vel, tHat);

  if (Math.abs(vT) < SLIDE_EPS) {
    const maxStatic = surface.muS * normalMag;
    if (Math.abs(appliedT) <= maxStatic) {
      // Static friction is whatever it takes, up to a ceiling. It does not
      // have a formula of its own.
      return { normalMag, frictionTangential: -appliedT, touching: true, stuck: true };
    }
    return {
      normalMag,
      frictionTangential: -Math.sign(appliedT) * surface.muK * normalMag,
      touching: true,
      stuck: false,
    };
  }

  return {
    normalMag,
    frictionTangential: -Math.sign(vT) * surface.muK * normalMag,
    touching: true,
    stuck: false,
  };
}

/** The solved contact as drawable `Force` records, so the FBD shows exactly
 *  what the integrator used. */
export function contactForces(
  body: Body,
  sol: ContactSolution,
  surface: Surface,
  by = 'the surface',
): Force[] {
  if (!sol.touching) return [];
  const out: Force[] = [
    {
      id: `${body.id}-normal`,
      on: body.id,
      by,
      kind: 'normal',
      label: 'normal',
      vec: scale2(surfaceNormal(surface), sol.normalMag),
    },
  ];
  if (Math.abs(sol.frictionTangential) > 1e-12) {
    out.push({
      id: `${body.id}-friction`,
      on: body.id,
      by,
      kind: 'friction',
      label: 'friction',
      vec: scale2(surfaceTangent(surface), sol.frictionTangential),
    });
  }
  return out;
}

/* ── the world ────────────────────────────────────────────────────────────── */

export interface World {
  t: number;
  steps: number;
  bodies: Body[];
  /** Forces somebody declared: gravity, the learner's pushes, a tension. */
  forces: Force[];
  surface: Surface | null;
  /** Body ids the surface is still supporting. A body that lifts off is removed
   *  and does not come back for the rest of the run — no bouncing model here. */
  touching: string[];
  /** Contact forces solved on the last step. What the FBD panel draws. */
  solved: Force[];
  /** Acceleration per body from the last step, m/s². */
  accel: Record<string, Vec2>;
}

export interface WorldSpec {
  bodies: Body[];
  forces?: Force[];
  surface?: Surface | null;
  /** Which bodies start resting on the surface. Defaults to all of them when a
   *  surface exists. */
  touching?: string[];
}

export function createWorld(spec: WorldSpec): World {
  const bodies = spec.bodies.map((b) => ({ ...b, pos: [...b.pos] as Vec2, vel: [...b.vel] as Vec2 }));
  const w: World = {
    t: 0,
    steps: 0,
    bodies,
    forces: (spec.forces ?? []).map((f) => ({ ...f })),
    surface: spec.surface ?? null,
    touching: spec.surface ? (spec.touching ?? bodies.map((b) => b.id)) : [],
    solved: [],
    accel: {},
  };
  resolve(w);
  return w;
}

/** Solve the contact forces and the accelerations for the current configuration
 *  without advancing time. This is what the FBD reads when the world is paused,
 *  so a static diagram and a running one are never two different computations. */
export function resolve(w: World): void {
  w.solved = [];
  if (w.surface) {
    for (const b of w.bodies) {
      if (!w.touching.includes(b.id)) continue;
      const sol = solveContact(b, w.forces, w.surface);
      if (!sol.touching) {
        w.touching = w.touching.filter((id) => id !== b.id);
        continue;
      }
      w.solved.push(...contactForces(b, sol, w.surface));
    }
  }
  const all = [...w.forces, ...w.solved];
  w.accel = {};
  for (const b of w.bodies) w.accel[b.id] = accelerationOn(b.id, b.mass, all);
}

/** One step. Position uses the half-a-t-squared term, so a constant net force
 *  is integrated exactly; the only first-order piece is the velocity dependence
 *  of friction and drag, and dt is small enough that it does not show. */
export function step(w: World, dt: number): void {
  resolve(w);
  for (const b of w.bodies) {
    const a = w.accel[b.id] ?? [0, 0];
    b.pos = add2(b.pos, add2(scale2(b.vel, dt), scale2(a, 0.5 * dt * dt)));
    b.vel = add2(b.vel, scale2(a, dt));
  }
  w.t += dt;
  w.steps += 1;
}

/** Every force the world currently applies, declared plus solved. */
export const allForces = (w: World): Force[] => [...w.forces, ...w.solved];

/* ── reading the result ───────────────────────────────────────────────────── */

/** Do all of these accelerations agree, within tolerance? Chapter 4's
 *  "the two blocks must travel together" constraint, stated honestly — the
 *  learner is not told the value, only that the two must match. */
export function accelerationsAgree(accels: readonly Vec2[], tol = 0.05): boolean {
  if (accels.length < 2) return true;
  const [first, ...rest] = accels;
  return rest.every((a) => mag2(sub2(a, first)) <= tol);
}

/** Split a force (or the net force) into the part along the surface and the
 *  part pressing into it. Chapter 5's ramp coordinates, and nothing more than
 *  `decompose` from `vectors.ts` wearing a name. */
export function surfaceComponents(
  v: Vec2,
  surface: Surface,
): { along: number; into: number } {
  const { parallel, perpendicular } = decompose(v, surfaceTangent(surface));
  const along = dot2(parallel, surfaceTangent(surface));
  const into = dot2(perpendicular, surfaceNormal(surface));
  return { along, into };
}

/** Time for a constant net force to bring a mass to a target speed from rest.
 *  Used by the Chapter 4 estimate, where the surprise is how short it is. */
export function timeToReachSpeed(mass: number, forceN: number, speed: number): number {
  return (mass * speed) / forceN;
}
