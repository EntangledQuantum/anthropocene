# Stiffness, A-stability, L-stability — research notes (Agent 3)

## Solvable chain

1. **Hook.** Two clocks, one system. Slow mode is the physics; fast mode died in a millisecond. Take a step that looks generous for the slow clock. Predict what explicit methods do to the *slow* variable.
2. **Naive attempt.** Tune: hunt the cliff. It sits at `h = 2/λ_fast`, not at anything accuracy asked for.
3. **The world talks back.** Explicit methods explode while the true slow solution is `≈ e^{-t}`. The problem is fine.
4. **Name the structure.** Stiffness is a timescale gap. Stability, not accuracy, sets `Δt`.
5. **Tighten.** Backward Euler evaluates the slope at the destination. The unknown is on both sides. Newton, not fixed-point — the contraction condition is exactly the explicit stability limit.
6. **Representation shift.** Stability region in the complex plane. Implicit methods swallow the left half-plane: A-stability. No explicit method has this shape (`R(z)` is a polynomial).
7. **Near-transfer.** One giant step on a stiff decay. Trapezoid rings (`|R| → 1` as `z → −∞`); backward Euler damps (`R → 0`). L-stability. Sketch the ring.
8. **Optional edge.** Dahlquist’s second barrier; BDF; van der Pol as clothing.
9. **Close.** Picture: left half-plane filled; explicit methods dying on a mode you do not care about.

## Structure the learner must feel

A system can have a *smooth, slowly varying* solution while its Jacobian has a large negative eigenvalue. Explicit methods still have to resolve that eigenvalue. The step is set by a transient that has already vanished. Hairer & Wanner II, IV.1: stiff problems are those where “the numerical solution of *slow* smooth movements is considerably perturbed by nearby *rapid* solutions.”

## Most tempting wrong belief

**Stiff means the solution is changing fast / the problem is badly posed.** (It usually means the opposite: the interesting solution is slow; an explicit method is the wrong tool.) Secondary: A-stable ⇒ stiff modes are damped (trapezoid is the counterexample). Tertiary: just iterate the implicit formula; Newton is overkill (fixed-point contracts only when `h|∂f/∂y| < 1`).

## Simplest useful case

Linear two-rate system, slow first so a default trajectory plot is the quantity you care about:

```
ẏ_s = −λ_s y_s + y_f
ẏ_f = −λ_f y_f
```

with `λ_f = 400`, `λ_s = 1`, `y(0) = (1, 1)`. Eigenvalues `{−1, −400}`. Forward Euler dies for `h > 2/400 = 0.005`. The slow solution is essentially `e^{-t}`. Coupling injects the exploding fast mode into the slow variable, so you cannot “just not integrate the fast one.”

Scalar costume for L-stability: `y' = −400 y` at `h = 0.1` (`z = −40`).

- Backward Euler: `R(z) = 1/(1 − z) ≈ 0.024` — dead in one step.
- Trapezoid: `R(z) = (1 + z/2)/(1 − z/2) ≈ −0.951` — sign-flips, amplitude stays O(1).

## Transfer costume

Van der Pol at large `μ` (Hairer IV.1); Robertson chemical kinetics. Same gap: a slow manifold with a fast attracting direction. Not the first contact — the linear pair already has the eigenvalues in the open.

## Numerics claims (need tests)

- A-stability: `|R_BE(z)| ≤ 1` and `|R_trap(z)| ≤ 1` for all `Re z < 0`. Forward Euler and RK4 fail this (e.g. `z = −3`).
- L-stability: `|R_BE(−10^6)| → 0`; `|R_trap(−10^6)| → 1`. Integrators: on `y' = −400y`, `h = 0.1`, BE damps in one step; trapezoid rings (alternating sign, `|y|` stays O(1)).
- Explicit blow-up on two-rate past `h = 2/λ_fast`; backward Euler stays bounded at the same `h`.
- Newton vs fixed-point: the map `y ↦ y_n − hλ y` diverges when `hλ > 1`; `newtonSolve` on the BE residual returns `y_n/(1 + hλ)`.

## Sources

- Hairer & Wanner, *Solving Ordinary Differential Equations II* (stiff & DAE). IV.1 examples; IV.3 A-stability and L-stability (`lim_{z→∞} R(z) = 0`).
- Dahlquist, G. (1963), “A special stability problem for linear multistep methods,” *BIT* 3:27–43. A-stability = stability region contains the left half-plane. Second barrier: no A-stable LMS of order > 2; trapezoid has the smallest error constant among them. No explicit LMS is A-stable. (The same “no explicit method is A-stable” holds for explicit RK: `R(z)` polynomial ⇒ `|R| → ∞` as `|z| → ∞`.)
- Ehle (1969) / Hairer–Wanner: L-stability. Implicit trapezoid / Crank–Nicolson is A-stable but not L-stable — the ringing on stiff modes.
- Lambert / Hairer I: fixed-point iteration of an implicit step contracts iff `h L < 1` (Lipschitz of `f`), i.e. exactly the explicit-method regime.
