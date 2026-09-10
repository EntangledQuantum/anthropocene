# Agent 2 — Richardson extrapolation and complex-step differentiation

## Solvable chain

1. **Hook.** Two central-difference estimates of the same derivative, both too high, same direction. Predict: average, throw away the coarse one, or form `(4 D(h/2) − D(h))/3`.
2. **Naive attempt.** Fill a Richardson tableau by picking which two rows to combine. Adjacent same-column pair with the 4:−1 weights is the move; skipping a row, or averaging, is the tempting miss.
3. **The world talks back.** The combined cell’s |error| drops by far more than halving h. Averaging two overestimates stays an overestimate. A skipped-row pair with the wrong ratio does not cancel.
4. **Name the structure.** The leading error is `c₂ h²`. Halving h quarters it, so the unique combination that kills `c₂` is `(4 D(h/2) − D(h))/3`, leftover `O(h⁴)`.
5. **Tighten.** Rank the four estimates (two coarsest centrals, a finer central, the extrapolated pair). Classify which combinations cancel `h²`, cancel `h⁴`, or cancel nothing.
6. **Representation shift.** Sketch the U-curve after the subtraction is removed. Then `<DerivativeLab complexStepCurve>` — the roundoff branch refuses to appear.
7. **Near-transfer.** Classify which methods still have a U (anything that subtracts nearby values, including Richardson itself) versus complex-step (never subtracts). Same idea, different costume: Romberg is this tableau on the trapezoid rule.
8. **Optional edge.** `f` must be analytic and implemented generically. `abs`, `min`, real-only branches break it. AD supersedes it for instrumented code; complex-step remains the independent check.
9. **Close.** Two wrong answers, algebraically combined, cancel the leading error. Complex-step never subtracts, so there is no roundoff branch to begin with.

## Structure the learner must feel

Not a definition of extrapolation. The feeling: two biased answers with a *known ratio of biases* can be combined so the bias vanishes, and the combination can beat a finer sample you did not take. Then the second feeling: the U-curve is not a law of nature — it is a picture of subtraction. Remove the subtraction and the right-hand (small-`h`) arm never rises.

## Most tempting wrong beliefs

- Averaging two estimates cancels error. (The errors point the *same* way.)
- The coarser estimate is wasted once you have the finer one. (It is the instrument that tells you the size of `c₂`.)
- Richardson also kills roundoff, so you can take `h` as small as you like. (It still subtracts; it *is* a wider stencil.)
- Complex-step is “just a central difference in the imaginary direction,” so it still cancels. (There is no difference of two nearby real values.)
- Complex-step works for any `f` you can evaluate. (`abs`, `min`, lookup tables, real-only `if` all break analyticity or never see the perturbation.)

## Simplest useful case

`sin(x)` at `x = 1`. Central differences at `h, h/2, h/4, h/8` with `h = 0.4`. One Richardson step on the two coarsest rows. A cubic (`x³ − 2x`) as the exactness check: after one extrapolation the `h²` term is the whole error, so the combination is exact up to roundoff.

## Transfer costume

Romberg integration: the same tableau, column 0 = composite trapezoid (even powers of `h`), first extrapolation = Simpson. ODE extrapolation methods (Gragg–Bulirsch–Stoer) wear the same clothes. Complex-step’s costume in the wild is checking an AD Jacobian of a CFD residual (Martins / Sturdza / Alonso).

## Numerics claims that need tests

- One Richardson step on two order-2 centrals is order 4 (measured).
- A second step is order 6 (measured).
- On a cubic, one step is exact to ~1e-12.
- `richardson(central(2h), central(h), 2)` equals the five-point stencil (same four samples).
- At `h₀ = 0.4` on `sin`, the extrapolated pair beats a raw central difference at `h/4` and at `h/8`.
- Complex-step error on `sin` and `exp` stays ≲ 1e-14 for `h ∈ {1e-8, 1e-12, 1e-16, 1e-20}`.
- Complex-step truncation at large `h` is still `O(h²)`.

## Sources

- L. F. Richardson, *Phil. Trans. R. Soc. A* 210 (1911) 307–357. Deferred approach to the limit.
- W. Romberg, *Kgl. Norske Vid. Selsk. Forsk.* 28 (1955) 30–36. Tableau on the trapezoid rule.
- W. Squire & G. Trapp, *SIAM Rev.* 40 (1998) 110–112. `Im f(x+ih)/h`; no subtractive cancellation; `O(h²)` remainder.
- J. Lyness & C. Moler, *SIAM J. Numer. Anal.* 4 (1967) 202–210. Earlier complex-variable differentiation (Cauchy integrals), which Squire–Trapp simplify.
- J. R. R. A. Martins, P. Sturdza, J. J. Alonso, *ACM TOMS* 29 (2003) 245–262. Complex-step in large aero codes; connection to algorithmic differentiation; `abs`/`max`/relational operators need care; for small enough `h` the imaginary part *is* a forward-mode AD seed.
- N. J. Higham, “What is the complex-step approximation?” (2020). `h = 10^{-100}` is fine; optimal finite-difference error is `O(√u)`, complex-step reaches `O(u)`.
