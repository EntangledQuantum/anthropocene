/** Chapter 6: spatial force histories, not time histories.
 * Straight segments make trapezoidal work exact; no spline can invent a lobe.
 * Motion is independently integrated by the existing work.ts implementation.
 * We expose only the first forward passage, never a later allowed island beyond K=0.
 */
import { cumulativeWork, kineticEnergy, pushThroughField, speedFromKinetic } from './work.ts';

export const AREA_DISTANCE = 4;
export const AREA_MASS = 10;
export const AREA_FORCE_LIMIT = 60;
export const AREA_X = [0, 1, 2, 3, 4] as const;
export const AREA_INITIAL_K = { ordinary: kineticEnergy(AREA_MASS, 4), low: kineticEnergy(AREA_MASS, 2) };
export const AREA_PROFILES = {
  narrow: { label: 'A · narrow peak', forces: [0, 40, 0, 0, 0] },
  broad: { label: 'B · broad push', forces: [0, 20, 20, 20, 0] },
  cancel: { label: 'Push, then oppose', forces: [0, 40, 0, -40, 0] },
  reverse: { label: 'Oppose, then push', forces: [0, -40, 0, 40, 0] },
} as const;
export type AreaProfile = keyof typeof AREA_PROFILES;
export interface AreaPoint { x: number; force: number }
export const areaProfile = (name: AreaProfile): AreaPoint[] => AREA_X.map((x, i) => ({ x, force: AREA_PROFILES[name].forces[i] }));
export function validateAreaPoints(points: readonly AreaPoint[]) {
  if (points.length < 2 || points[0].x !== 0 || points.at(-1)!.x !== AREA_DISTANCE ||
    points.some((p, i) => !Number.isFinite(p.x) || !Number.isFinite(p.force) || Math.abs(p.force) > AREA_FORCE_LIMIT || (i > 0 && p.x <= points[i - 1].x))) {
    throw new RangeError('Use increasing positions from 0 to 4 m and finite forces within ±60 N.');
  }
}
export function areaForce(points: readonly AreaPoint[], x: number): number {
  const q = Math.max(0, Math.min(AREA_DISTANCE, x));
  const i = Math.max(1, points.findIndex(p => p.x >= q));
  const a = points[i - 1], b = points[i];
  return a.force + (b.force - a.force) * (q - a.x) / (b.x - a.x);
}
/** Include every knot and zero crossing: positive/negative integrals stay exact. */
export function areaBreaks(points: readonly AreaPoint[], end = AREA_DISTANCE): AreaPoint[] {
  const bound = Math.max(0, Math.min(AREA_DISTANCE, end));
  const xs = [0, bound, ...points.filter(p => p.x < bound).map(p => p.x)];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    if (a.force * b.force < 0) {
      const zero = a.x - a.force * (b.x - a.x) / (b.force - a.force);
      if (zero < bound) xs.push(zero);
    }
  }
  return [...new Set(xs)].sort((a, b) => a - b).map(x => ({ x, force: areaForce(points, x) }));
}
export function signedArea(points: readonly AreaPoint[], end = AREA_DISTANCE) {
  const parts = areaBreaks(points, end);
  const x = parts.map(p => p.x), f = parts.map(p => p.force);
  const work = cumulativeWork(x, f).at(-1)!;
  const positive = cumulativeWork(x, f.map(v => Math.max(0, v))).at(-1)!;
  const negative = cumulativeWork(x, f.map(v => Math.min(0, v))).at(-1)!;
  return { work, positive, negative };
}
/** First zero of K0 + W, including a tangency at F=0 (an asymptotic stop).
 * On each sign-constant interval the energy is monotone, so bisection cannot
 * skip a forbidden interval even when the eventual endpoint has positive K.
 */
export function firstAreaBoundary(points: readonly AreaPoint[], initialK: number): number | null {
  if (initialK <= 0) return 0;
  const breaks = areaBreaks(points);
  for (let i = 1; i < breaks.length; i++) {
    const b = breaks[i].x;
    if (initialK + signedArea(points, b).work <= 1e-10) {
      let lo = breaks[i - 1].x, hi = b;
      for (let j = 0; j < 60; j++) {
        const mid = (lo + hi) / 2;
        if (initialK + signedArea(points, mid).work > 0) lo = mid;
        else hi = mid;
      }
      return (lo + hi) / 2;
    }
  }
  return null;
}
export interface AreaSample { x: number; force: number; work: number; positive: number; negative: number; K: number; deltaK: number; v: number }
export function workAreaTrial(points: readonly AreaPoint[], initialK = AREA_INITIAL_K.ordinary) {
  validateAreaPoints(points);
  if (!Number.isFinite(initialK) || initialK <= 0) throw new RangeError('Initial kinetic energy must be positive.');
  const boundary = firstAreaBoundary(points, initialK);
  // The existing Verlet solver stops at its first velocity reversal. A force
  // evaluation in its terminal step can be microscopically beyond the analytic
  // boundary; no such state is exposed as forward motion or accumulated work.
  const run = pushThroughField({ mass: AREA_MASS, v0: speedFromKinetic(AREA_MASS, initialK), xEnd: AREA_DISTANCE,
    force: x => areaForce(points, x), dt: 0.0005, record: 8, maxSteps: 120_000 });
  const last = run.states.at(-1)!;
  const stopped = run.outcome === 'turned-back';
  const reachable = Math.min(boundary ?? AREA_DISTANCE, last.x);
  const samples: AreaSample[] = run.states.filter(s => s.x <= reachable && s.v >= 0).map(s => ({
    x: s.x, force: areaForce(points, s.x), ...signedArea(points, s.x), K: s.K, deltaK: s.K - initialK, v: s.v,
  }));
  // Root-locate the coordinate of an observed v=0 event. K still comes from
  // that event's measured velocity, not from assigning K=K0+W.
  if (stopped && boundary !== null) {
    samples.push({ x: boundary, force: areaForce(points, boundary), ...signedArea(points, boundary), K: last.K, deltaK: last.K - initialK, v: last.v });
  }
  const limit = samples.at(-1)!.x;
  return { points, initialK, boundary, samples, limit, stopped, outcome: run.outcome,
    planned: signedArea(points), numericalStop: run.turnedAt };
}
export type WorkAreaTrial = ReturnType<typeof workAreaTrial>;
/** Linear interpolation of independently integrated velocity. Geometry is
 * evaluated exactly at the same clamped distance, never at a later sample. */
export function inspectWorkArea(trial: WorkAreaTrial, requested: number): AreaSample {
  const x = Math.max(0, Math.min(trial.limit, requested));
  let lo = 0, hi = trial.samples.length - 1;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (trial.samples[mid].x < x) lo = mid; else hi = mid; }
  const a = trial.samples[lo], b = trial.samples[hi];
  const t = b.x > a.x ? (x - a.x) / (b.x - a.x) : 0;
  const v = a.v + t * (b.v - a.v);
  const K = kineticEnergy(AREA_MASS, v);
  return { x, force: areaForce(trial.points, x), ...signedArea(trial.points, x), v, K, deltaK: K - trial.initialK };
}
export function areaSketch() {
  const trial = workAreaTrial(areaProfile('cancel'));
  return Array.from({ length: 81 }, (_, i) => { const s = inspectWorkArea(trial, AREA_DISTANCE * i / 80); return { x: s.x, y: s.K }; });
}
