/**
 * Chapter 34 — geometric optics: flat mirrors and the thin lens.
 *
 * Everything is traced, not assumed. The formulas at the bottom of each part
 * (image distance, the half-height mirror, 1/dₒ + 1/dᵢ = 1/f, m = −dᵢ/dₒ) are
 * the captions, and the tests check that the traced rays agree with them.
 *
 *  1. The flat mirror. A mirror is a line: a point on it and a unit direction
 *     along it. `reflect` flips the normal part of a direction and keeps the
 *     part along the glass. `reflectionPoint` finds where light from a source
 *     must strike the glass to reach an eye, by bisecting on the law of
 *     reflection itself (the along-glass part of the unit direction is the
 *     same before and after). Nothing about images is put in: the tests show
 *     that the sight line through that point, carried on in a straight line
 *     behind the glass, lands on the source's mirror image.
 *
 *  2. The whole-body mirror. `seenThrough` carries a sight line from the eye to
 *     a point of the glass, reflects it, and follows it back to the plane you
 *     stand in. The band of yourself a mirror shows is its two edges traced
 *     that way, and the smallest mirror that shows all of you is the span
 *     between the reflection points for your toes and the top of your head.
 *
 *  3. The thin lens. A lens sits at x = 0 on an axis y = 0; object distances
 *     are positive to the left, image distances positive to the right (real).
 *     A ray reaching the lens at height y with slope k leaves with slope
 *     k − y/f, which is the whole of the ideal thin lens. `fanFrom` sends rays
 *     from one object point through the aperture, `spreadAt` measures how wide
 *     the fan is on a screen (the blur spot), and `fanCrossing` finds where the
 *     outgoing lines come closest together by least squares, whether they
 *     really meet (a real image) or only their backward extensions do
 *     (a virtual one).
 *
 * Lengths in any one unit (the scenes use metres for the mirror, cm for the lens).
 */

export type P2 = readonly [number, number];

const dot = (a: P2, b: P2) => a[0] * b[0] + a[1] * b[1];
const sub = (a: P2, b: P2): P2 => [a[0] - b[0], a[1] - b[1]];
const norm = (a: P2): P2 => { const L = Math.hypot(a[0], a[1]); return [a[0] / L, a[1] / L]; };

/* ── 1. the flat mirror ──────────────────────────────────────────────── */

/** A flat mirror: the line through `at` along the unit vector `along`. */
export interface Mirror { at: P2; along: P2 }

/** A vertical wall mirror at x = x0 (only the line; its edges are the scene's). */
export const wallMirror = (x0: number): Mirror => ({ at: [x0, 0], along: [0, 1] });
/** A horizontal mirror along y = y0, as seen from above. */
export const floorMirror = (y0: number): Mirror => ({ at: [0, y0], along: [1, 0] });

/** The point of the mirror line at parameter t along it. */
export const onMirror = (m: Mirror, t: number): P2 => [m.at[0] + m.along[0] * t, m.at[1] + m.along[1] * t];
/** A point's parameter along the mirror line. */
export const alongMirror = (m: Mirror, p: P2) => dot(sub(p, m.at), m.along);

/** Reflect a direction off a surface with unit normal n: d − 2(d·n)n. */
export function reflect(d: P2, n: P2): P2 {
  const k = 2 * dot(d, n);
  return [d[0] - k * n[0], d[1] - k * n[1]];
}

/** The mirror's unit normal (either side; `reflect` does not care which). */
export const mirrorNormal = (m: Mirror): P2 => [-m.along[1], m.along[0]];

/** Reflection of a point in the mirror line. */
export function mirrorImage(p: P2, m: Mirror): P2 {
  const n = mirrorNormal(m);
  const h = dot(sub(p, m.at), n);
  return [p[0] - 2 * h * n[0], p[1] - 2 * h * n[1]];
}

/**
 * Where light from `src` must hit the mirror line to reach `eye` (both on the
 * same side). Found from the law of reflection alone: along the glass, the
 * unit direction of the incoming ray (src → P) and of the outgoing one
 * (P → eye) must agree. That difference rises steadily with the position
 * along the glass, so bisection finds its zero.
 */
export function reflectionPoint(src: P2, eye: P2, m: Mirror): P2 {
  const g = (t: number) => {
    const P = onMirror(m, t);
    return dot(norm(sub(P, src)), m.along) - dot(norm(sub(eye, P)), m.along);
  };
  const span = 10 * (Math.hypot(...sub(src, m.at)) + Math.hypot(...sub(eye, m.at)) + 1);
  let lo = -span, hi = span;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    if (g(mid) > 0) hi = mid; else lo = mid;
  }
  return onMirror(m, (lo + hi) / 2);
}

/**
 * Carry a sight line from the eye to point P on the glass, reflect it, and
 * follow it to the plane `alongX` = const (the vertical plane you stand in).
 * Returns the point it lands on: what the eye sees at P.
 */
export function seenThrough(eye: P2, P: P2, m: Mirror, targetX: number): P2 {
  const d = reflect(norm(sub(P, eye)), mirrorNormal(m));
  const s = (targetX - P[0]) / d[0];
  return [targetX, P[1] + s * d[1]];
}

/** The band of your own body (heights) that a wall mirror from `bottom` to `top` shows your eye. */
export function visibleBand(eye: P2, mirrorX: number, bottom: number, top: number) {
  const m = wallMirror(mirrorX);
  const lo = seenThrough(eye, [mirrorX, bottom], m, eye[0])[1];
  const hi = seenThrough(eye, [mirrorX, top], m, eye[0])[1];
  return { lo, hi };
}

/**
 * The smallest wall mirror that shows you head to toe, standing at x = `x`
 * with the mirror at x = `mirrorX`: the reflection points for your toes and
 * for the top of your head, found by the law of reflection.
 */
export function smallestMirror(x: number, eyeH: number, headH: number, mirrorX: number, feetH = 0) {
  const m = wallMirror(mirrorX);
  const bottom = reflectionPoint([x, feetH], [x, eyeH], m)[1];
  const top = reflectionPoint([x, headH], [x, eyeH], m)[1];
  return { bottom, top, height: top - bottom };
}

/* ── 3. the thin lens ────────────────────────────────────────────────── */

/** A ray leaving the lens: at the lens (x = 0) height y, then slope k. */
export interface LensRay { y: number; k: number }

/** Ideal thin lens: a ray arriving at height y with slope kIn leaves with slope kIn − y/f. */
export const throughLens = (y: number, kIn: number, f: number): LensRay => ({ y, k: kIn - y / f });

/** Height of an outgoing ray at distance x beyond the lens (x < 0: its backward extension). */
export const heightAt = (r: LensRay, x: number) => r.y + r.k * x;

/**
 * The ray from the object point (−dₒ, h) that crosses the lens at height y.
 */
export function rayFrom(dObj: number, h: number, y: number, f: number): LensRay {
  return throughLens(y, (y - h) / dObj, f);
}

/**
 * A fan of `n` rays from the object point (−dₒ, h), spread evenly over the
 * aperture from −R to R. `cover` blocks part of the lens: 'top' keeps only
 * rays below the axis, 'bottom' only rays above it.
 */
export function fanFrom(dObj: number, h: number, f: number, R: number, n = 21, cover: 'none' | 'top' | 'bottom' = 'none'): LensRay[] {
  const out: LensRay[] = [];
  for (let i = 0; i < n; i++) {
    const y = -R + (2 * R * i) / (n - 1);
    if (cover === 'top' && y > 0) continue;
    if (cover === 'bottom' && y < 0) continue;
    out.push(rayFrom(dObj, h, y, f));
  }
  return out;
}

/** Width of the fan on a screen at distance x: the blur spot's diameter. */
export function spreadAt(fan: LensRay[], x: number): number {
  let lo = Infinity, hi = -Infinity;
  for (const r of fan) { const v = heightAt(r, x); lo = Math.min(lo, v); hi = Math.max(hi, v); }
  return hi - lo;
}

/** Centre of the fan's patch on a screen at distance x. */
export function centreAt(fan: LensRay[], x: number): number {
  let lo = Infinity, hi = -Infinity;
  for (const r of fan) { const v = heightAt(r, x); lo = Math.min(lo, v); hi = Math.max(hi, v); }
  return (lo + hi) / 2;
}

/**
 * Where the outgoing lines of a fan come closest together, by least squares:
 * the x that minimises the variance of their heights, and the mean height
 * there. For an ideal lens they meet exactly. x > 0 is a real crossing; x < 0
 * means only their backward extensions meet (a virtual image); Infinity means
 * they leave parallel.
 */
export function fanCrossing(fan: LensRay[]): { x: number; y: number } {
  const n = fan.length;
  const my = fan.reduce((a, r) => a + r.y, 0) / n, mk = fan.reduce((a, r) => a + r.k, 0) / n;
  let cov = 0, vk = 0;
  for (const r of fan) { cov += (r.y - my) * (r.k - mk); vk += (r.k - mk) ** 2; }
  if (vk < 1e-18) return { x: Infinity, y: NaN };
  const x = -cov / vk;
  return { x, y: my + mk * x };
}

/** The thin-lens equation, 1/dₒ + 1/dᵢ = 1/f, solved for dᵢ. Negative: virtual. */
export function imageDistance(dObj: number, f: number): number {
  const inv = 1 / f - 1 / dObj;
  return Math.abs(inv) < 1e-15 ? Infinity : 1 / inv;
}

/** Lateral magnification m = −dᵢ/dₒ: negative is upside down, |m| > 1 is bigger. */
export const magnification = (dObj: number, dImg: number) => -dImg / dObj;

/** Is the image of an object at dₒ virtual (only back-extensions meet)? */
export const isVirtual = (dObj: number, f: number) => dObj < f;

/**
 * The three principal rays from the object tip (−dₒ, h):
 *  parallel: comes in level, leaves through the far focal point;
 *  centre:   through the middle of the lens, undeflected;
 *  focal:    through the near focal point, leaves level.
 * Each is traced with `throughLens`, like every other ray.
 */
export function principalRays(dObj: number, h: number, f: number) {
  return {
    parallel: throughLens(h, 0, f),
    centre: throughLens(0, -h / dObj, f),
    focal: throughLens((-h * f) / (dObj - f), -h / (dObj - f), f),
  };
}
