# CFL — research notes (Agent 12)

## Solvable chain

1. **Hook.** The scheme everyone writes first: forward Euler in time, centred difference in space (FTCS) on a travelling bump. CFL = 0.5, so the stencil can see where the information comes from. Predict whether the bump survives.
2. **Naive attempt.** It explodes. Smaller Δt does not save a centred stencil on advection. CFL < 1 is necessary, not sufficient.
3. **The world talks back.** Switch to first-order upwind. Hunt the CFL where *that* explodes. It sits at 1.
4. **Name the structure.** ν = c Δt / Δx is how far information travels in one step, in mesh units. The CFL triangle: the numerical domain of dependence must contain the physical one (Courant–Friedrichs–Lewy 1928). Necessary for convergence, not a stability certificate.
5. **Tighten.** Stay below 1. Upwind is bounded. The bump gets shorter and wider. That is numerical viscosity pretending to be physics.
6. **Representation shift.** Space-time picture: stencil triangle vs the characteristic. Drag CFL across 1 and watch the true path leave the triangle, then watch the field detonate. Two views of one number.
7. **Near-transfer.** Heat, same three-point stencil, different number: r = α Δt / Δx² ≤ 1/2. The checkerboard mode sets it. Hunt the cliff. Then: 200 cells, largest stable FTCS Δt.
8. **Optional edge.** Von Neumann: FTCS advection has |G| = √(1 + ν² sin²θ) ≥ 1 for every ν ≠ 0. Unconditionally unstable — Euler's disc does not touch the imaginary axis. Upwind at ν = 1 is the exact shift. Modified equation: viscosity (c Δx/2)(1−ν) u_xx.
9. **Close.** The CFL triangle. A plot that does not explode can still be the scheme. Is this wiggle the PDE or the method?

## Structure the learner must feel

Information on a grid cannot outrun the stencil. After n steps a two-point upwind scheme has a domain of dependence n cells wide; the true characteristic travels c n Δt. If that foot lands outside the stencil, the update is inventing a value and the grid detonates.

The number that compares those two distances is CFL = c Δt / Δx — how far the signal travels in one step, **in mesh units**. One is the bound. Not 0.9, not 2.

CFL is necessary (domain of dependence) and not sufficient (FTCS advection explodes at every CFL > 0). The other failure is quieter: a dissipative scheme stays bounded and still lies.

## Most tempting wrong belief

**CFL < 1 means the scheme is stable.** (It means the stencil can *see* the information. FTCS advection can see it and still detonate, because a centred difference produces a pure-imaginary eigenvalue and forward Euler's stability region does not contain the imaginary axis.)

Secondary: **if the plot is smooth, the scheme is right.** (Upwind at CFL = 0.3 is smooth, stable, and the wrong PDE — advection plus numerical viscosity.)

Tertiary: **CFL is an accuracy requirement.** (It is a stability / domain-of-dependence requirement. Accuracy is a different question, and at CFL = 1 first-order upwind is actually exact for linear advection.)

## Simplest useful case

1D linear advection on the periodic unit interval, Gaussian pulse, three schemes:

```
u_t + c u_x = 0,   c = 1,   x ∈ [0, 1)
```

- FTCS: `u[i] += − (ν/2) (u[i+1] − u[i−1])` — unconditionally unstable.
- First-order upwind (c > 0): `u[i] += − ν (u[i] − u[i−1])` — stable for ν ≤ 1; exact shift at ν = 1; dissipative for ν < 1.
- Heat FTCS: `u[i] += r (u[i+1] − 2 u[i] + u[i−1])` with r = α Δt / Δx² — stable for r ≤ 1/2.

Two cells of stencil, one travelling bump. The triangle is six steps of that stencil against the characteristic.

## Transfer costume

Heat on the same three-point stencil. Infinite physical signal speed, so the CFL argument in the strict sense is never satisfied by an explicit scheme — you recover a usable bound from von Neumann (the checkerboard, r ≤ 1/2) instead of from characteristics. Same explosion, different units, and Δt now scales as Δx².

## Numerics claims (need tests)

- FTCS advection explodes for CFL > 1, and also for CFL = 0.5 (CFL < 1 is not sufficient). Von Neumann: |G| = √(1 + ν² sin²θ) ≥ 1 for all ν ≠ 0.
- Heat FTCS stays bounded for r = 0.4 and explodes for r = 0.6. Checkerboard gain G = 1 − 4r; |G| ≤ 1 iff r ≤ 1/2.
- First-order upwind stays bounded at CFL = 0.8 (past the centred-difference cliff) and explodes at CFL = 1.3. At CFL = 1 it is an exact one-cell shift. At CFL = 0.4 the pulse height drops while ‖u‖_∞ stays O(1) — dissipation, not blow-up.

## Sources

- R. Courant, K. Friedrichs, H. Lewy (1928), “Über die partiellen Differenzengleichungen der mathematischen Physik,” *Math. Ann.* **100**:32–74. English: *IBM J. Res. Dev.* **11** (1967) 215–234. The condition: the numerical domain of dependence must contain the analytic one.
- R. Courant, K. Friedrichs, H. Lewy (1967 translation), NYO-7689 / IBM. Heuristic: a wave must not travel more than one mesh cell per step.
- J. C. Strikwerda, *Finite Difference Schemes and Partial Differential Equations*, ch. 1–5. FTCS advection unconditionally unstable; upwind CFL ≤ 1; heat FTCS r ≤ 1/2; modified equation for upwind dissipation.
- R. J. LeVeque, *Finite Difference Methods for Ordinary and Partial Differential Equations* (SIAM, 2007), ch. 9–10. CFL as necessary; von Neumann as the practical test; numerical viscosity of first-order upwind (c Δx/2)(1−ν).
- C. Hirsch, *Numerical Computation of Internal and External Flows*. Dissipation vs dispersion; “stable-looking but wrong.”
- P. D. Lax, “Stability of difference schemes,” in *The CFL Condition, 80 Years After* (2010). CFL is necessary for convergence; sufficiency needs a stability theory (Lax equivalence).
