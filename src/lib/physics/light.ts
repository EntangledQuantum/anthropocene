/**
 * Chapter 33 — the nature and propagation of light.
 *
 * Five small pieces, each written to be read:
 *
 *  1. Index and speed. n = c/v, with c computed in emwaves.ts from μ₀ and ε₀.
 *     Inside a medium the wavelength shrinks by n and the frequency does not
 *     change at all: the boundary cannot create or destroy crests.
 *
 *  2. The quickest road (Fermat). A path that crosses the flat boundary y = 0
 *     from A (above, speed v₁) to B (below, speed v₂) is two straight pieces.
 *     `fastestEntry` finds the entry point that minimises the travel time by
 *     bisecting on dT/dx, which is strictly increasing. Nothing about sines is
 *     put in: the tests check that the minimum *comes out* obeying
 *     sin θ₁ / v₁ = sin θ₂ / v₂, which is Snell's law.
 *
 *  3. Snell, the critical angle, and the bent stick. `apparentPoint` finds
 *     where an underwater point seems to be, honestly: it traces the two real
 *     rays that reach two nearby eye positions and intersects their straight
 *     back-extensions.
 *
 *  4. How much reflects (Fresnel). The s and p reflectances, which make the
 *     escaping ray fade out at the critical angle, and make p-light vanish from
 *     a reflection at Brewster's angle.
 *
 *  5. Polarising filters (Malus). An ideal filter passes the part of the field
 *     along its axis, so intensity goes as cos²θ. Unpolarised light loses half
 *     at the first filter whatever its angle.
 *
 * Angles are radians and measured from the normal unless a name says `Deg`.
 */
import { C } from './emwaves.ts';

export const DEG = Math.PI / 180;

/** Indices used by the scenes. */
export const N_AIR = 1.0;
export const N_WATER = 1.333;
export const N_GLASS = 1.5;

/* ── 1. index, speed, wavelength, frequency ──────────────────────────── */

/** Speed of light in a medium of index n, m/s. */
export const speedIn = (n: number) => C / n;
/** Index of a medium in which light travels at v. */
export const indexFor = (v: number) => C / v;
/** Wavelength inside a medium, given the vacuum wavelength. */
export const wavelengthIn = (lambda0: number, n: number) => lambda0 / n;
/** Frequency of light of vacuum wavelength λ₀. The medium does not enter. */
export const frequencyOf = (lambda0: number) => C / lambda0;
/** Frequency measured inside the medium: its speed over its wavelength. */
export const frequencyInside = (lambda0: number, n: number) => speedIn(n) / wavelengthIn(lambda0, n);

/**
 * Phase of a plane wave travelling downward at angle θ from the normal, in a
 * medium of index n, at the point (x, y). Crests are where the phase is a
 * whole number of 2π. The two media's crests meet along y = 0 exactly when
 * n₁ sin θ₁ = n₂ sin θ₂.
 */
export const planeWavePhase = (n: number, theta: number, lambda0: number, x: number, y: number) =>
  ((2 * Math.PI * n) / lambda0) * (x * Math.sin(theta) - y * Math.cos(theta));

/* ── 2. the quickest road ─────────────────────────────────────────────── */

export type P2 = readonly [number, number];

/** Time along A → (x, 0) → B at speed v1 above the boundary and v2 below. */
export function pathTime(A: P2, B: P2, x: number, v1: number, v2: number): number {
  return Math.hypot(x - A[0], A[1]) / v1 + Math.hypot(B[0] - x, B[1]) / v2;
}

/** Angles from the normal on each side of the entry point (x, 0). */
export function pathAngles(A: P2, B: P2, x: number) {
  return {
    theta1: Math.atan2(Math.abs(x - A[0]), Math.abs(A[1])),
    theta2: Math.atan2(Math.abs(B[0] - x), Math.abs(B[1])),
  };
}

/** dT/dx of `pathTime`: strictly increasing in x, zero at the fastest route. */
export function pathTimeSlope(A: P2, B: P2, x: number, v1: number, v2: number): number {
  return (x - A[0]) / (v1 * Math.hypot(x - A[0], A[1])) - (B[0] - x) / (v2 * Math.hypot(B[0] - x, B[1]));
}

/** The entry point on y = 0 of the fastest route from A to B. */
export function fastestEntry(A: P2, B: P2, v1: number, v2: number): number {
  let lo = Math.min(A[0], B[0]), hi = Math.max(A[0], B[0]);
  for (let i = 0; i < 200 && hi - lo > 1e-13 * (1 + Math.abs(hi)); i++) {
    const mid = (lo + hi) / 2;
    if (pathTimeSlope(A, B, mid, v1, v2) > 0) hi = mid; else lo = mid;
  }
  return (lo + hi) / 2;
}

/** Where the straight line from A to B crosses y = 0. */
export const straightEntry = (A: P2, B: P2) => A[0] + ((B[0] - A[0]) * A[1]) / (A[1] - B[1]);

/* ── 3. Snell's law, the critical angle, the bent stick ──────────────── */

/** Refracted angle, or null when there is none (total internal reflection). */
export function snell(n1: number, n2: number, theta1: number): number | null {
  const s = (n1 / n2) * Math.sin(theta1);
  return Math.abs(s) > 1 ? null : Math.asin(s);
}

/** The angle of incidence beyond which nothing gets out, n1 → n2. NaN if n1 ≤ n2. */
export const criticalAngle = (n1: number, n2: number) => (n1 > n2 ? Math.asin(n2 / n1) : NaN);

/**
 * Where a laser at L, aimed through the surface point (x, 0), lands on the
 * floor y = floorY of the lower medium. Returns the landing x and the angles.
 */
export function laserLanding(L: P2, x: number, floorY: number, n1: number, n2: number) {
  const theta1 = Math.atan2(Math.abs(x - L[0]), Math.abs(L[1]));
  const theta2 = snell(n1, n2, theta1) ?? Math.PI / 2;
  const dir = Math.sign(x - L[0]) || 1;
  return { theta1, theta2, landX: x + dir * Math.abs(floorY) * Math.tan(theta2) };
}

/**
 * Where a point `obj` under the surface (y < 0, index nObj) appears to an eye
 * at `eye` above it (y > 0, index nEye). The real ray to each of two eye
 * positions a hair apart is the fastest one (speed ∝ 1/n); their straight
 * back-extensions meet at the image. Also returns the surface point of the ray
 * that reaches `eye` itself.
 */
export function apparentPoint(obj: P2, eye: P2, nObj: number, nEye: number) {
  const d = 1e-4 * (Math.hypot(eye[0] - obj[0], eye[1] - obj[1]) || 1);
  const e1: P2 = [eye[0] - d, eye[1]], e2: P2 = [eye[0] + d, eye[1]];
  // Travel from the eye down to the object: speed 1/nEye above, 1/nObj below.
  const x1 = fastestEntry(e1, obj, 1 / nEye, 1 / nObj);
  const x2 = fastestEntry(e2, obj, 1 / nEye, 1 / nObj);
  const exit = fastestEntry(eye, obj, 1 / nEye, 1 / nObj);
  // Line k: from (xk, 0) through ek. Intersect the two lines.
  const u1 = [e1[0] - x1, e1[1]], u2 = [e2[0] - x2, e2[1]];
  const den = u1[0] * u2[1] - u1[1] * u2[0];
  const t = ((x2 - x1) * u2[1]) / den;
  const image: P2 = [x1 + u1[0] * t, u1[1] * t];
  return { image, exit };
}

/* ── 4. how much reflects ─────────────────────────────────────────────── */

/**
 * Fresnel reflectances for light going from n1 into n2 at incidence θ.
 * s: field perpendicular to the plane of incidence; p: field in it.
 * Past the critical angle both are 1.
 */
export function fresnel(n1: number, n2: number, theta: number) {
  const t = snell(n1, n2, theta);
  if (t === null) return { Rs: 1, Rp: 1, R: 1, T: 0, theta2: null as number | null };
  const ci = Math.cos(theta), ct = Math.cos(t);
  const rs = (n1 * ci - n2 * ct) / (n1 * ci + n2 * ct);
  const rp = (n2 * ci - n1 * ct) / (n2 * ci + n1 * ct);
  const Rs = rs * rs, Rp = rp * rp, R = (Rs + Rp) / 2;
  return { Rs, Rp, R, T: 1 - R, theta2: t as number | null };
}

/**
 * Transmitted power fraction computed from the transmitted *amplitudes*, not
 * as 1 − R. The tests check it agrees with 1 − R, which is energy conservation
 * and a check that the reflectances are right.
 */
export function transmittance(n1: number, n2: number, theta: number) {
  const t = snell(n1, n2, theta);
  if (t === null) return { Ts: 0, Tp: 0 };
  const ci = Math.cos(theta), ct = Math.cos(t);
  const ts = (2 * n1 * ci) / (n1 * ci + n2 * ct);
  const tp = (2 * n1 * ci) / (n2 * ci + n1 * ct);
  const k = (n2 * ct) / (n1 * ci);
  return { Ts: k * ts * ts, Tp: k * tp * tp };
}

/** Brewster's angle, n1 → n2: the reflection holds no p-light at all. */
export const brewsterAngle = (n1: number, n2: number) => Math.atan(n2 / n1);

/* ── 5. polarising filters ────────────────────────────────────────────── */

/** Malus: an ideal filter at θ to the light's field passes cos²θ of it. */
export const malus = (I: number, theta: number) => I * Math.cos(theta) ** 2;

/** The part of a field of amplitude E0 that lies along an axis at θ to it. */
export const alongAxis = (E0: number, theta: number) => E0 * Math.cos(theta);

/**
 * Light through a stack of ideal filters with axes `axes` (radians).
 * `pol` is the incoming field direction, or 'unpolarised'. Returns the
 * intensity after each filter; the field leaves along the last axis.
 */
export function throughFilters(I0: number, axes: number[], pol: number | 'unpolarised' = 'unpolarised') {
  const after: number[] = [];
  let I = I0;
  let dir = pol;
  for (const a of axes) {
    I = dir === 'unpolarised' ? I / 2 : malus(I, a - dir);
    dir = a;
    after.push(I);
  }
  return after;
}

/**
 * Turn polarised light through 90° with `steps` filters, each turned 90°/steps
 * past the one before (the first is already turned). Returns the fraction of
 * the light that survives.
 */
export function twistTransmission(steps: number): number {
  if (steps < 1) return 0;
  const axes = Array.from({ length: steps }, (_, i) => ((i + 1) * Math.PI) / 2 / steps);
  const out = throughFilters(1, axes, 0);
  return out[out.length - 1];
}

/** Fewest filters in the stack that keeps at least `fraction` of the light. */
export function stepsToKeep(fraction: number, max = 1000): number {
  for (let n = 1; n <= max; n++) if (twistTransmission(n) >= fraction) return n;
  return NaN;
}
