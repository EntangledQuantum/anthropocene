/** Shape-preserving interpolation through control points.
 *
 *  When a learner drags a curve, the interpolant is part of the physics they
 *  see: a spline that overshoots between handles invents accelerations nobody
 *  asked for, and the a(t) panel — which is the interpolant's *derivative* —
 *  shows that invention at full volume.
 *
 *  Fritsch–Carlson monotone cubic Hermite is the fix. It is C¹, it passes
 *  through every handle, and it provably never overshoots a local extremum, so
 *  the only wiggles in the derived curves are ones the learner put there.
 */

export interface Knot {
  t: number;
  y: number;
}

/** Tangents at each knot, limited so no interval overshoots.
 *
 *  The limiter is the whole algorithm: where the data turn (secant slopes
 *  change sign) the tangent is forced to zero, and elsewhere it is shrunk onto
 *  the circle of radius 3 in (alpha, beta) space, which is the region Fritsch
 *  and Carlson proved to be monotone. */
export function monotoneTangents(knots: readonly Knot[]): number[] {
  const n = knots.length;
  if (n < 2) return new Array(n).fill(0);

  const h: number[] = [];
  const delta: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    h.push(knots[i + 1].t - knots[i].t);
    delta.push((knots[i + 1].y - knots[i].y) / (knots[i + 1].t - knots[i].t));
  }

  const m = new Array<number>(n);
  m[0] = delta[0];
  m[n - 1] = delta[n - 2];
  for (let i = 1; i < n - 1; i++) {
    // A sign change means this knot is a local extremum: flat tangent, or the
    // curve would bulge past the handle the learner placed.
    m[i] = delta[i - 1] * delta[i] <= 0 ? 0 : (delta[i - 1] * h[i] + delta[i] * h[i - 1]) / (h[i - 1] + h[i]);
  }

  for (let i = 0; i < n - 1; i++) {
    if (delta[i] === 0) {
      m[i] = 0;
      m[i + 1] = 0;
      continue;
    }
    const a = m[i] / delta[i];
    const b = m[i + 1] / delta[i];
    const s = a * a + b * b;
    if (s > 9) {
      const tau = 3 / Math.sqrt(s);
      m[i] = tau * a * delta[i];
      m[i + 1] = tau * b * delta[i];
    }
  }
  return m;
}

export interface MonotoneSpline {
  /** Value at t, clamped to the knot range. */
  at(t: number): number;
  /** Exact analytic derivative of the same cubic — not a finite difference. */
  slopeAt(t: number): number;
  knots: readonly Knot[];
}

export function monotoneSpline(knots: readonly Knot[]): MonotoneSpline {
  const sorted = [...knots].sort((p, q) => p.t - q.t);
  const m = monotoneTangents(sorted);
  const n = sorted.length;

  const findInterval = (t: number): number => {
    if (t <= sorted[0].t) return 0;
    if (t >= sorted[n - 1].t) return n - 2;
    let lo = 0;
    let hi = n - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (sorted[mid].t <= t) lo = mid;
      else hi = mid;
    }
    return lo;
  };

  if (n === 1) {
    const y = sorted[0].y;
    return { at: () => y, slopeAt: () => 0, knots: sorted };
  }

  return {
    knots: sorted,
    at(t: number) {
      const i = findInterval(t);
      const h = sorted[i + 1].t - sorted[i].t;
      const s = Math.min(1, Math.max(0, (t - sorted[i].t) / h));
      const s2 = s * s;
      const s3 = s2 * s;
      // Hermite basis.
      const h00 = 2 * s3 - 3 * s2 + 1;
      const h10 = s3 - 2 * s2 + s;
      const h01 = -2 * s3 + 3 * s2;
      const h11 = s3 - s2;
      return h00 * sorted[i].y + h10 * h * m[i] + h01 * sorted[i + 1].y + h11 * h * m[i + 1];
    },
    slopeAt(t: number) {
      const i = findInterval(t);
      const h = sorted[i + 1].t - sorted[i].t;
      const s = Math.min(1, Math.max(0, (t - sorted[i].t) / h));
      const s2 = s * s;
      const d00 = 6 * s2 - 6 * s;
      const d10 = 3 * s2 - 4 * s + 1;
      const d01 = -6 * s2 + 6 * s;
      const d11 = 3 * s2 - 2 * s;
      return (d00 * sorted[i].y) / h + d10 * m[i] + (d01 * sorted[i + 1].y) / h + d11 * m[i + 1];
    },
  };
}
