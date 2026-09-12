/** 2D and 3D vector algebra, written to be read.
 *
 *  Chapter 1's whole argument is that a vector is not its components — the
 *  arrow survives a change of basis and the numbers do not. So the primitives
 *  here keep `rotate2` and `componentsIn` as separate, visibly different
 *  operations: one moves the arrow, the other moves the grid.
 */

export type Vec2 = readonly [number, number];
export type Vec3 = readonly [number, number, number];

export const v2 = (x: number, y: number): Vec2 => [x, y];
export const v3 = (x: number, y: number, z: number): Vec3 => [x, y, z];

export const add2 = (a: Vec2, b: Vec2): Vec2 => [a[0] + b[0], a[1] + b[1]];
export const sub2 = (a: Vec2, b: Vec2): Vec2 => [a[0] - b[0], a[1] - b[1]];
export const scale2 = (a: Vec2, s: number): Vec2 => [a[0] * s, a[1] * s];
export const dot2 = (a: Vec2, b: Vec2): number => a[0] * b[0] + a[1] * b[1];
export const mag2 = (a: Vec2): number => Math.hypot(a[0], a[1]);

/** The scalar "z-component" of a 2D cross product: the signed area of the
 *  parallelogram, which is also the torque about the out-of-page axis. */
export const cross2 = (a: Vec2, b: Vec2): number => a[0] * b[1] - a[1] * b[0];

export const add3 = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub3 = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const scale3 = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s];
export const dot3 = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const mag3 = (a: Vec3): number => Math.hypot(a[0], a[1], a[2]);

export const cross3 = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];

export function normalize2(a: Vec2): Vec2 {
  const m = mag2(a);
  return m === 0 ? [0, 0] : [a[0] / m, a[1] / m];
}

export function normalize3(a: Vec3): Vec3 {
  const m = mag3(a);
  return m === 0 ? [0, 0, 0] : [a[0] / m, a[1] / m, a[2] / m];
}

/** Rotate the ARROW by `theta` (radians, counter-clockwise), grid held fixed. */
export function rotate2(a: Vec2, theta: number): Vec2 {
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  return [a[0] * c - a[1] * s, a[0] * s + a[1] * c];
}

/** Components of the SAME arrow read off a grid rotated by `theta`.
 *
 *  Numerically this is `rotate2(a, -theta)`, and the two are worth keeping
 *  apart anyway: the point of Chapter 1 is that they are different physical
 *  statements that happen to share arithmetic. */
export function componentsIn(a: Vec2, theta: number): Vec2 {
  return rotate2(a, -theta);
}

/** How much of `a` lies along `b` — the scalar projection. Zero when
 *  perpendicular, which is why a centripetal force does no work. */
export function along(a: Vec2, b: Vec2): number {
  const m = mag2(b);
  return m === 0 ? 0 : dot2(a, b) / m;
}

/** The vector projection of `a` onto `b`: the piece of `a` that `b` "sees". */
export function projectOnto(a: Vec2, b: Vec2): Vec2 {
  const mm = dot2(b, b);
  return mm === 0 ? [0, 0] : scale2(b, dot2(a, b) / mm);
}

/** Angle between two vectors in radians, clamped against round-off so that
 *  parallel vectors do not produce NaN from acos(1 + 1e-16). */
export function angleBetween2(a: Vec2, b: Vec2): number {
  const m = mag2(a) * mag2(b);
  if (m === 0) return 0;
  return Math.acos(Math.min(1, Math.max(-1, dot2(a, b) / m)));
}

/** Do these arrows, laid tip-to-tail, close a triangle? Chapter 1's
 *  "can these two arrows make a closed triangle" solvable grades on this. */
export function closesLoop(vs: readonly Vec2[], tol = 1e-9): boolean {
  const sum = vs.reduce<Vec2>((acc, v) => add2(acc, v), [0, 0]);
  return mag2(sum) <= tol;
}

/** Split `a` into the part along `b` and the part perpendicular to it.
 *
 *  This is the single most reused decomposition in the whole path: tangential
 *  vs normal acceleration, work vs no-work, ramp coordinates, the component of
 *  a field along a surface. */
export function decompose(a: Vec2, b: Vec2): { parallel: Vec2; perpendicular: Vec2 } {
  const parallel = projectOnto(a, b);
  return { parallel, perpendicular: sub2(a, parallel) };
}
