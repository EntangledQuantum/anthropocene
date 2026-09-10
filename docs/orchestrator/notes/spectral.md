# Spectral methods — research notes (Agent 6)

Trefethen, *Spectral Methods in MATLAB* (SIAM, 2000), ch. 1–5.
Gibbs: Wilbraham 1848 / Gibbs 1899; overshoot → ~8.95% of the jump, forever.

## Structure the learner must feel

A local stencil (central difference) spends two neighbours and buys a power of *h*.
A global trigonometric interpolant spends every sample at once. For a smooth
periodic function the error does not pick an order — it falls faster than every
fixed power of N, then hits roundoff. One jump, anywhere, and the same global
basis rings everywhere (Gibbs) and the rate collapses to first order.

Tomorrow picture: error falling off a cliff until a kink, then a wall.

## Tempting wrong belief

Spectral methods are “very high-order finite differences,” so a jump costs you
a few orders. False. A jump is a singularity on the real axis. Every mode feels
it. The overshoot does not die with N; it just gets narrower.

Misconceptions: `wider-stencil-is-spectral`, `gibbs-dies-with-n`,
`spectral-always-better`.

## Simplest useful case

Four equispaced points of `cos x` on [0, 2π]. The interpolant *is* `cos x`.
Differentiating is multiplying the k=±1 coefficients by ±i. No stencil.

## Transfer costume

Heat equation on a circle: `u_t = u_xx` becomes `û_k' = -k² û_k`. Same
multiplier idea, not a PDE course.

## Numerics claims (each gets a test)

1. Smooth periodic (`e^{sin x}`): interpolant and spectral derivative errors
   fall faster than N^{-4} until they sit on the roundoff floor (~N=24 already
   < 10^{-12}).
2. Band-limited exactness: `sin(3x)` sampled at N≥8 is recovered to ~1e-13,
   and its spectral derivative is `3 cos(3x)`.
3. One jump (sawtooth `(π-x)/2`): max-norm error away from the jump is ~N^{-1};
   max-norm including the jump stays O(1) (Gibbs wall). Overshoot → ~9% of
   the jump and does not decrease with N.
4. Same N=16 grid: periodic central difference on `e^{sin x}` is ≥10^4 times
   worse than the spectral derivative.
5. Chebyshev (Tier): polynomial degree ≤ N is differentiated exactly; `e^x`
   on [-1,1] converges exponentially in N.

## Solvable chain

1. Hook / confrontation — Predict: 16 samples of `e^{sin x}`, central vs spectral.
2. Naive attempt — learner adds Fourier modes in the lab (expects “a bit better”).
3. World talks back — error plot falls off a cliff to machine precision.
4. Name the structure — differentiation is multiplication by ik. Global vs local.
5. Tighten — SketchCurve the cliff; Estimate N to hit 10^{-12}.
6. Representation shift — spectrum bars: smooth coeffs die, jump coeffs do not.
7. Near-transfer — Predict the jump; SketchCurve first-order on log-log; toggle.
8. Optional edge — Chebyshev for non-periodic (Tier).
9. Close — cliff until a kink, then a wall. Double the modes: cliff or wall?
