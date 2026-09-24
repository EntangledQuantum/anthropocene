/** Chapter 7: a cart on a coaster track, and the landscape it rides.
 *
 *  For gravity near the ground U = mgh, so the shape of the track *is* the
 *  potential-energy landscape. That is the whole trick of the chapter's
 *  scenes: the learner looks at a physical track and is already looking at
 *  U(x).
 *
 *  One subtlety is handled honestly rather than waved away. A cart on a track
 *  moves *along* the track, so its one coordinate is the distance s measured
 *  along the rail, not the horizontal x. `buildTrack` turns a height profile
 *  h(x) into a `Landscape` in s, with U(s) = m g h(x(s)) and
 *  dU/ds = m g h'(x) / √(1 + h'²) = m g sin θ. Then the shared velocity-Verlet
 *  marble from `landscape.ts` rolls it, and the push along the rail is
 *  F = −dU/ds exactly. Using x directly would overstate the push on steep
 *  stretches by a factor 1/cos θ, which is 2.4× at 65°.
 *
 *  The cart has frictionless wheels of negligible mass, so K = ½mv². A rolling
 *  marble would carry 2/7 of its kinetic energy as spin and go slower; that is
 *  why the scenes show a cart.
 */
import { LANDSCAPES, turningPointsOf, verletStep, type Landscape } from './landscape.ts';
import { forceAt, shiftLandscape, steepestPoint } from './landscapes-ch7.ts';

export const G = 9.8;
export const CART_MASS = 2;

/* ── height profiles built from smooth pieces ─────────────────────────── */

/** Smootherstep: 0 → 1 on [0, 1] with zero slope and curvature at both ends,
 *  so a track built from it has exactly flat shelves between its hills. */
const P = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * t * (t * (6 * t - 15) + 10));
const dP = (t: number) => (t <= 0 || t >= 1 ? 0 : 30 * t * t * (t - 1) * (t - 1));
/** ∫₀ᵗ P, continued as a straight line of slope 1 past t = 1. */
const Q = (t: number) => (t <= 0 ? 0 : t >= 1 ? 0.5 + (t - 1) : t * t * t * t * (t * t - 3 * t + 2.5));

export type Piece =
  /** Height changes by `dh` between x = a and x = b; flat on either side. */
  | { kind: 'step'; a: number; b: number; dh: number }
  /** The slope eases from 0 to `k` between a and b, then stays at k. */
  | { kind: 'ramp'; a: number; b: number; k: number };

export interface TrackShape {
  id: string;
  /** Horizontal extent of the rail, metres. */
  x: [number, number];
  /** Height at the far left before any piece acts, metres. */
  h0: number;
  pieces: Piece[];
}

export function heightOf(shape: TrackShape, x: number): number {
  let h = shape.h0;
  for (const p of shape.pieces) {
    const w = p.b - p.a;
    const t = (x - p.a) / w;
    h += p.kind === 'step' ? p.dh * P(t) : p.k * w * Q(t);
  }
  return h;
}

export function slopeOf(shape: TrackShape, x: number): number {
  let d = 0;
  for (const p of shape.pieces) {
    const w = p.b - p.a;
    const t = (x - p.a) / w;
    d += p.kind === 'step' ? (p.dh * dP(t)) / w : p.k * P(t);
  }
  return d;
}

/* ── the tracks the chapter's scenes use ──────────────────────────────── */

export const TRACKS: Record<string, TrackShape> = {
  /** Lesson 1 hook: a high, gently tilted shelf and a steep drop below it. */
  shelfAndDrop: {
    id: 'shelfAndDrop', x: [0, 5], h0: 1.62,
    pieces: [
      { kind: 'ramp', a: -1, b: 0, k: -0.06 },
      { kind: 'ramp', a: 1.5, b: 1.9, k: 0.06 },
      { kind: 'step', a: 1.9, b: 2.9, dh: -1.3 },
    ],
  },
  /** Lesson 1: the only place a cart stays is the high flat shelf. The lowest
   *  point, at the right-hand end, still tilts. */
  stayPut: {
    id: 'stayPut', x: [0, 6], h0: 2.0,
    pieces: [
      { kind: 'step', a: -0.3, b: 0.7, dh: -0.6 },
      { kind: 'step', a: 1.9, b: 2.7, dh: -0.8 },
      { kind: 'ramp', a: 2.5, b: 3.3, k: -0.1 },
    ],
  },
  /** Lesson 1: a plain valley to swing in while the zero of U moves. */
  zeroValley: {
    id: 'zeroValley', x: [0, 4], h0: 1.2,
    pieces: [
      { kind: 'step', a: -0.2, b: 1.6, dh: -1.0 },
      { kind: 'step', a: 2.4, b: 4.2, dh: 1.0 },
    ],
  },
  /** Lesson 2 hook: a gentle descent… */
  gentle: {
    id: 'gentle', x: [0, 5.2], h0: 1.0,
    pieces: [{ kind: 'step', a: 0.2, b: 4.2, dh: -0.8 }],
  },
  /** …and the same descent with a deep dip in the middle. Same ends. */
  dipped: {
    id: 'dipped', x: [0, 5.2], h0: 1.0,
    pieces: [
      { kind: 'step', a: 0.2, b: 4.2, dh: -0.8 },
      { kind: 'step', a: 1.2, b: 2.2, dh: -0.5 },
      { kind: 'step', a: 2.2, b: 3.2, dh: 0.5 },
    ],
  },
  /** Lesson 2: a tall start hill, a deep valley, then a 1.2 m hump. */
  hump: {
    id: 'hump', x: [0, 7.2], h0: 2.4,
    pieces: [
      { kind: 'step', a: -0.2, b: 2.2, dh: -2.3 },
      { kind: 'step', a: 2.8, b: 3.8, dh: 1.1 },
      { kind: 'step', a: 3.8, b: 4.8, dh: -0.9 },
    ],
  },
  /** Lesson 2: a steep left wall and a long gentle right-hand rise. */
  lopsided: {
    id: 'lopsided', x: [0, 6.4], h0: 1.7,
    pieces: [
      { kind: 'step', a: -0.2, b: 1.2, dh: -1.5 },
      { kind: 'step', a: 1.8, b: 6.6, dh: 1.5 },
    ],
  },
  /** Lesson 2: a valley with a flat floor, where the brake strip sits. */
  brakeValley: {
    id: 'brakeValley', x: [0, 6], h0: 1.2,
    pieces: [
      { kind: 'step', a: -0.2, b: 2.0, dh: -1.1 },
      { kind: 'step', a: 4.0, b: 6.2, dh: 1.1 },
    ],
  },
};

/* ── a track as a one-dimensional landscape in s ──────────────────────── */

export interface Track {
  shape: TrackShape;
  mass: number;
  /** Rail length, metres. */
  length: number;
  h(x: number): number;
  /** Horizontal position at distance s along the rail. */
  xAt(s: number): number;
  /** Distance along the rail at horizontal position x. */
  sAt(x: number): number;
  /** Height at distance s along the rail. */
  heightAt(s: number): number;
  /** Tilt of the rail at s, radians, positive when it rises to the right. */
  angleAt(s: number): number;
  /** U(s) = m g h in joules, and its slope dU/ds = m g sin θ in newtons. */
  land: Landscape;
}

export function buildTrack(shape: TrackShape, mass = CART_MASS, n = 4000): Track {
  const [x0, x1] = shape.x;
  const dx = (x1 - x0) / n;
  const f = (x: number) => Math.hypot(1, slopeOf(shape, x));
  const S = new Float64Array(n + 1);
  for (let i = 1; i <= n; i++) {
    const a = x0 + (i - 1) * dx;
    S[i] = S[i - 1] + ((f(a) + 4 * f(a + dx / 2) + f(a + dx)) * dx) / 6; // Simpson
  }
  const length = S[n];

  // Table lookup, then Simpson over the partial cell: accurate to ~1e-12 m,
  // so U(s) and dU/ds agree with each other and the marble sees no fake force.
  const sAt = (x: number) => {
    const xc = Math.min(Math.max(x, x0), x1);
    const i = Math.min(Math.floor((xc - x0) / dx), n - 1);
    const a = x0 + i * dx, w = xc - a;
    return S[i] + ((f(a) + 4 * f(a + w / 2) + f(xc)) * w) / 6;
  };
  const xAt = (s: number) => {
    if (s <= 0) return x0;
    if (s >= length) return x1;
    let lo = 0, hi = n;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (S[mid] <= s) lo = mid; else hi = mid;
    }
    let x = x0 + lo * dx + ((s - S[lo]) / (S[lo + 1] - S[lo])) * dx;
    // Two Newton steps on s(x) = s tighten the linear guess to rounding.
    x -= (sAt(x) - s) / f(x);
    x -= (sAt(x) - s) / f(x);
    return x;
  };
  const h = (x: number) => heightOf(shape, x);
  const heightAt = (s: number) => h(xAt(s));
  const angleAt = (s: number) => Math.atan(slopeOf(shape, xAt(s)));

  const land: Landscape = {
    id: `track:${shape.id}`,
    label: `coaster track ${shape.id}`,
    U: (s) => mass * G * heightAt(s),
    dU: (s) => mass * G * Math.sin(angleAt(s)),
    domain: [0, length],
    xLabel: 'distance along the track (m)',
  };
  return { shape, mass, length, h, xAt, sAt, heightAt, angleAt, land };
}

const cache = new Map<string, Track>();
/** Tracks are pure functions of their shape, so build each one once. */
export function trackOf(key: string): Track {
  let t = cache.get(key);
  if (!t) { t = buildTrack(TRACKS[key] ?? TRACKS.zeroValley); cache.set(key, t); }
  return t;
}

/** The push along the rail, newtons: F = −dU/ds. Positive pushes toward +x. */
export function pushAt(track: Track, s: number): number {
  return forceAt(track.land, s);
}

/* ── rolling, with an optional brake strip ────────────────────────────── */

export interface Brake {
  /** Strip ends, as distances along the rail. Must lie on a flat stretch. */
  from: number;
  to: number;
  /** Friction force while sliding over it, newtons. */
  force: number;
}

export interface CartState {
  t: number;
  s: number;
  v: number;
  /** Thermal energy made in the brake strip so far, joules. */
  heat: number;
  /** Times the cart has entered the strip. */
  crossings: number;
}

/** One step: velocity Verlet on the landscape, then kinetic friction for the
 *  part of the step that lay on the strip.
 *
 *  The strip sits on a flat floor, where gravity does nothing along the rail,
 *  so the friction is exact work-energy bookkeeping: each metre of strip
 *  crossed takes `force` joules out of K and puts them into `heat`. If K runs
 *  out part-way, the cart stops there and static friction holds it. */
export function stepCart(track: Track, st: CartState, dt: number, brake?: Brake): CartState {
  const m = track.mass;
  let [s, v] = verletStep(track.land, st.s, st.v, dt, m);
  let heat = st.heat;
  let crossings = st.crossings;
  if (brake && st.v !== 0) {
    const lo = Math.min(st.s, s), hi = Math.max(st.s, s);
    const overlap = Math.max(0, Math.min(hi, brake.to) - Math.max(lo, brake.from));
    const wasOn = st.s >= brake.from && st.s <= brake.to;
    if (overlap > 0 && !wasOn) crossings += 1;
    if (overlap > 0) {
      const K = 0.5 * m * v * v;
      const loss = brake.force * overlap;
      if (loss >= K) {
        const entry = st.v > 0 ? Math.max(st.s, brake.from) : Math.min(st.s, brake.to);
        s = entry + Math.sign(st.v) * (K / brake.force);
        v = 0;
        heat += K;
      } else {
        v = Math.sign(v) * Math.sqrt((2 * (K - loss)) / m);
        heat += loss;
      }
    }
  }
  // The rail ends in buffers: the cart stops dead there.
  if (s <= 0) { s = 0; v = 0; }
  if (s >= track.length) { s = track.length; v = 0; }
  return { t: st.t + dt, s, v, heat, crossings };
}

export function startAt(track: Track, x: number, v = 0): CartState {
  return { t: 0, s: track.sAt(x), v, heat: 0, crossings: 0 };
}

/** Total energy K + U + heat, the number that never changes. */
export function ledger(track: Track, st: CartState) {
  const K = 0.5 * track.mass * st.v * st.v;
  const U = track.land.U(st.s);
  return { K, U, heat: st.heat, mech: K + U, total: K + U + st.heat };
}

export const SIM_DT = 1 / 600;

/** Run from rest (or with a speed) until `until` says stop or tMax passes. */
export function runCart(
  track: Track, start: CartState, tMax: number,
  opts: { brake?: Brake; dt?: number; until?: (st: CartState) => boolean } = {},
): CartState[] {
  const dt = opts.dt ?? SIM_DT;
  const out = [start];
  let st = start;
  while (st.t < tMax - 1e-12) {
    st = stepCart(track, st, dt, opts.brake);
    out.push(st);
    if (opts.until?.(st)) break;
  }
  return out;
}

/* ── the questions the scenes grade ───────────────────────────────────── */

/** Let a cart go from rest at x and watch for `seconds`: how far does it get?
 *  "Stays put" is graded on this measured displacement, so the verdict and
 *  the animation are the same run. */
export function driftFromRest(track: Track, x: number, seconds = 3): number {
  const run = runCart(track, startAt(track, x), seconds);
  return run.reduce((m, st) => Math.max(m, Math.abs(st.s - run[0].s)), 0);
}

/** Released from rest at `x`, heading right: does the cart get over the rail
 *  at `overX`? If not, where does it turn around? Read from the energy line,
 *  via the shared turning-point finder. */
export function clearsAt(track: Track, x: number, overX: number) {
  const s0 = track.sAt(x);
  const E = track.land.U(s0);
  const sOver = track.sAt(overX);
  const turns = turningPointsOf(track.land, E, 6000).filter((t) => t > s0 + 1e-6);
  const turn = turns.find((t) => t < sOver);
  return {
    cleared: turn === undefined,
    startHeight: track.heightAt(s0),
    turnHeight: turn === undefined ? null : track.heightAt(turn),
    turnS: turn ?? null,
  };
}

/** Where a cart at `x` moving right at `v0` runs out of kinetic energy. */
export function turnAhead(track: Track, x: number, v0: number) {
  const s0 = track.sAt(x);
  const E = track.land.U(s0) + 0.5 * track.mass * v0 * v0;
  const s = turningPointsOf(track.land, E, 6000).find((t) => t > s0 + 1e-6) ?? null;
  return { E, s, x: s === null ? null : track.xAt(s), height: s === null ? null : track.heightAt(s) };
}

/** Time and speed at which a cart released from rest at x reaches `finishX`. */
export function arrival(track: Track, x: number, finishX: number, tMax = 20) {
  const sF = track.sAt(finishX);
  const run = runCart(track, startAt(track, x), tMax, { until: (st) => st.s >= sF });
  const last = run[run.length - 1];
  return { reached: last.s >= sF, t: last.t, v: last.v };
}

/** Everything the zero of U can change, and everything it cannot: the same
 *  run on the same track with U shifted by `c` joules. */
export function withZeroShifted(track: Track, c: number): Track {
  return { ...track, land: shiftLandscape(track.land, c) };
}

/* ── a bond: the same slope rule with no hill in the room ─────────────── */

/** Argon–argon Lennard-Jones parameters: ε in zeptojoules (10⁻²¹ J), σ in
 *  nanometres. Then force comes out in zJ/nm, which is piconewtons. */
export const ARGON = { eps: 1.654, sigma: 0.3405 };

const LJ = LANDSCAPES.lennardJones;

/** Potential energy of the pair at separation r (nm), zJ. */
export function bondU(r: number): number {
  return ARGON.eps * LJ.U(r / ARGON.sigma);
}

/** Force on the right-hand atom along r, pN. Positive pushes the pair apart;
 *  negative pulls them together. F = −dU/dr. */
export function bondForce(r: number): number {
  return -(ARGON.eps / ARGON.sigma) * LJ.dU(r / ARGON.sigma);
}

/** The strongest pull the bond can exert, and where: the steepest point of
 *  the outer wall. Measured off the curve, not quoted. */
export function strongestPull() {
  const outer: Landscape = { ...LJ, domain: [2 ** (1 / 6), 3.2] };
  const p = steepestPoint(outer, 20000);
  return { r: p.x * ARGON.sigma, F: bondForce(p.x * ARGON.sigma) };
}
