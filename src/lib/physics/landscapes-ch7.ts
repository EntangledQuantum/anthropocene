/** Chapter 7 additions to the potential-track world.
 *
 *  `landscape.ts` owns the shared world — the curve, the marble, the
 *  dashed-E line — and chapters 14, 30 and 40 read it too, so nothing here
 *  edits it. This file adds the three things chapter 7 needs and nobody else
 *  does yet:
 *
 *    1. `shiftLandscape` — the same physics with a different floor. The whole
 *       "U is defined only up to a constant" lesson is one function, and
 *       having it be a function means the invariance can be *tested* rather
 *       than asserted.
 *    2. `staircase` — a landscape where the highest place is the flattest.
 *       Built specifically to kill "a higher U means a larger force", which is
 *       hard to dislodge on a spring because there U and |F| happen to rise
 *       together.
 *    3. Readers — force, escape threshold, and the trapped / bound / runaway
 *       verdict — so a lesson's claims about a picture are computed from the
 *       same code that draws it.
 */

import {
  LANDSCAPES,
  allowedRegions,
  equilibriaOf,
  turningPointsOf,
  type Landscape,
} from './landscape.ts';

/* ── the floor is a choice ─────────────────────────────────────────────── */

/** The same landscape with a constant added to U.
 *
 *  `dU` is passed through untouched, which is the entire point: a constant has
 *  no slope, so the force at every x is byte-for-byte the force before. The
 *  marble cannot tell, and neither can any measurement. */
export function shiftLandscape(land: Landscape, c: number): Landscape {
  return {
    ...land,
    id: `${land.id}+${c}`,
    label: land.label,
    U: (x) => land.U(x) + c,
    dU: (x) => land.dU(x),
    suggestedE: land.suggestedE === undefined ? undefined : land.suggestedE + c,
  };
}

/* ── extra landscapes ──────────────────────────────────────────────────── */

const sech2 = (u: number) => 1 / Math.cosh(u) ** 2;

const STAIR_K = 2.2;
const STAIR_A = 1.5;
const STAIR_X1 = -1.6;
const STAIR_X2 = 0.4;

export const CH7_LANDSCAPES: Record<string, Landscape> = {
  /** Two smooth steps: nearly flat shelves joined by steep risers.
   *
   *  The tanh tails have a tiny but nonzero slope at every finite x. The high
   *  shelf therefore has a tiny force, while the largest force is on a riser at
   *  a middling height. "High" and "steep" are visibly independent here, which
   *  is exactly the confusion the chapter has to break. */
  staircase: {
    id: 'staircase',
    label: 'two steps — a flat top and a steep riser',
    U: (x) => STAIR_A * (Math.tanh(STAIR_K * (x - STAIR_X1)) + Math.tanh(STAIR_K * (x - STAIR_X2))),
    dU: (x) =>
      STAIR_A * STAIR_K * (sech2(STAIR_K * (x - STAIR_X1)) + sech2(STAIR_K * (x - STAIR_X2))),
    domain: [-4, 3],
    suggestedE: 3.2,
    xLabel: 'position (m)',
  },
};

/** Every landscape a chapter-7 widget may be asked for: the shared five plus
 *  the ones added here. Lookup only — `LANDSCAPES` itself is never mutated. */
export const ALL_LANDSCAPES: Record<string, Landscape> = {
  ...LANDSCAPES,
  ...CH7_LANDSCAPES,
};

export function landscapeOf(key: string): Landscape {
  return ALL_LANDSCAPES[key] ?? LANDSCAPES.spring;
}

/* ── reading the slope ─────────────────────────────────────────────────── */

/** The 1D conservative force, F = −dU/dx. Downhill, always. */
export function forceAt(land: Landscape, x: number): number {
  return -land.dU(x);
}

export interface SlopeSample {
  x: number;
  U: number;
  F: number;
}

/** U and F on a shared grid, so the two panels of a linked plot can never
 *  disagree about which landscape they are drawing. */
export function slopeProfile(land: Landscape, samples = 480): SlopeSample[] {
  const [a, b] = land.domain;
  return Array.from({ length: samples }, (_, i) => {
    const x = a + ((b - a) * i) / (samples - 1);
    return { x, U: land.U(x), F: forceAt(land, x) };
  });
}

/** Where in the domain the force is strongest, and how strong. Measured off
 *  the grid rather than argued for, because the lesson asks the learner to
 *  point at that place. */
export function steepestPoint(land: Landscape, samples = 4000): SlopeSample {
  const prof = slopeProfile(land, samples);
  return prof.reduce((best, s) => (Math.abs(s.F) > Math.abs(best.F) ? s : best), prof[0]);
}

/* ── thresholds and verdicts ───────────────────────────────────────────── */

/** The lowest total energy at which no barrier inside the domain can hold the
 *  marble in one valley — i.e. the highest local maximum of U.
 *
 *  Returns null when the landscape has no interior maximum, which is the
 *  honest answer for a spring or a straight ramp. */
export function barrierEnergy(land: Landscape, mass = 1): number | null {
  const tops = equilibriaOf(land, mass).filter((e) => e.stability === 'unstable');
  if (tops.length === 0) return null;
  return tops.reduce((m, e) => Math.max(m, e.U), -Infinity);
}

export type Fate =
  /** Oscillates forever between two turning points inside the domain. */
  | 'bound'
  /** Bound, but the domain offers more than one separate allowed valley, so it
   *  is stuck in whichever one it started in. */
  | 'trapped'
  /** Reaches the end of the track without turning around. */
  | 'runaway'
  /** E is below U everywhere — no such state exists. */
  | 'impossible';

/** Trap, bounce, or run away — the chapter's visual question, computed.
 *
 *  Everything here comes from `allowedRegions`, so the verdict a lesson prints
 *  and the magenta bands a widget draws are the same fact. */
export function fateOf(land: Landscape, E: number): Fate {
  const [a, b] = land.domain;
  const regions = allowedRegions(land, E);
  if (regions.length === 0) return 'impossible';
  const eps = (b - a) * 1e-6;
  const open = regions.some(([lo, hi]) => lo <= a + eps || hi >= b - eps);
  if (open) return 'runaway';
  return regions.length > 1 ? 'trapped' : 'bound';
}

/** Width of the stretch of track available at energy E, summed over every
 *  separate allowed region. Jumps discontinuously when two valleys merge,
 *  which is what makes the barrier findable with a slider. */
export function allowedWidth(land: Landscape, E: number): number {
  return allowedRegions(land, E).reduce((s, [lo, hi]) => s + (hi - lo), 0);
}

/** The midpoint of the swing at energy E — the average of the two turning
 *  points bracketing `near`.
 *
 *  On a spring this never moves. On a Lennard-Jones bond it creeps outward as
 *  E rises, because the well is steeper on the inside than the outside, and
 *  that creep is thermal expansion. */
export function swingCentre(land: Landscape, E: number, near: number): number | null {
  const turns = turningPointsOf(land, E);
  const left = turns.filter((t) => t <= near).pop();
  const right = turns.find((t) => t >= near);
  if (left === undefined || right === undefined) return null;
  return (left + right) / 2;
}
