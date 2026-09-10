# Adaptive stepping — research notes

## Solvable chain

1. **Hook.** A sech pulse in a quiet interval. Drag the tolerance; watch *h* as a curve. The picture is already the question: where does the solver spend its steps?
2. **Naive attempt.** Predict why *h* drops at the peak (tempting: "y is bigger so you need more digits").
3. **World talks back.** The two solutions in the pair disagree when the slope changes. Magenta dots are rejected attempts — time does not advance.
4. **Name the structure.** Embedded pair: two weight rows over the same stages. Local-error estimate is their difference.
5. **Tighten.** If you double the step, local error of an order-4 method scales as *h⁵* → ×32. That exponent is the controller.
6. **Representation shift.** Sawtooth *h(t)* ↔ two *b*-rows on the tableau ↔ `atol + rtol |y|` as the unit of "1".
7. **Near-transfer.** Rank which (atol, rtol) settings actually cost: on a size-1 solution, the larger of atol and rtol wins. Fixed stepping at min *h* is the expensive costume of "just be safe".
8. **Edge.** A rejected step is not a failure. PI control (Gustafsson) damps the ringing you get from the elementary *I*-controller near a stability boundary.
9. **Close.** Two weight rows; a sawtooth that tightens at the transient and relaxes after.

## Structure the learner must feel

The step size is a *function of time*, not a number you pick. Effort concentrates where the vector field is bending. The estimate that drives this is almost free: a second weight row on stages you already paid for.

## Tempting wrong belief

"Pick *h* from the fastest feature and use it everywhere." That is how you spend 90% of the budget on the flats. Related: thinking `rtol=1e-6` stamps six correct digits on *y(T)* — the controller holds *local* error, not global.

## Simplest useful case

Euler and Heun share *k₁*. Difference = *(h/2)(k₂ − k₁)*: half a step times how much the slope changed. If the slope barely moved, the interval was easy.

## Transfer costume

Perihelion of a Kepler orbit: the same sawtooth, now in orbital mechanics. Same controller, different clothing. (Not the live widget — the sech pulse has an exact solution, which the tests need.)

## Numerics claims (each needs a test)

- Local-error estimate of an embedded pair **is** *y_high − y_low*, componentwise.
- Dormand–Prince 5(4) as a fixed-step method is fifth order (advance with the high-order solution).
- *||y₅ − y₄||* scales as *h⁵*.
- Adaptive on the sech pulse uses fewer accepted steps than fixed stepping at that run's own *h_min*, at similar endpoint accuracy.
- Tight tolerance + oversized *h₀* produces rejected steps.
- Smallest adaptive *h* sits at the pulse, not on the flats.

## Sources

- J. R. Dormand & P. J. Prince, "A family of embedded Runge–Kutta formulae", *J. Comput. Appl. Math.* **6** (1980), 19–26. RK5(4)7M; minimise the 5th-order truncation terms; local extrapolation.
- K. Gustafsson, M. Lundh, G. Söderlind, "A PI stepsize control for the numerical solution of ordinary differential equations", *BIT* **28** (1988), 270–287. And Gustafsson, "Control theoretic techniques for stepsize selection in explicit Runge–Kutta methods", *ACM TOMS* **17** (1991).
- Hairer, Nørsett, Wanner, *Solving Ordinary Differential Equations I*. DOPRI5, FSAL, mixed `atol + rtol |y|` scaling, PI in the production `dopri5.f`.
- MATLAB `ode45`: Dormand–Prince (4,5). RelTol ≈ significant digits; AbsTol = "I do not care below this." Default RelTol `1e-3`, AbsTol `1e-6`.
- SciPy `RK45`: same pair; RMS of `err / (atol + rtol * max(|y|, |y_new|))`; accept if that norm ≤ 1.

## Controller actually implemented

Elementary *I*: `h ← h · (1/e)^{1/5}` with safety 0.9, clipped to `[0.2, 10]`.

PI (accepted steps): `h ← h · 0.9 · e^{-0.3/5} · (e_prev/e)^{0.4/5}` — Gustafsson PI.3.4, target already scaled so the setpoint is 1. Rejected steps fall back to *I* so a stale `e_prev` cannot grow *h*.
