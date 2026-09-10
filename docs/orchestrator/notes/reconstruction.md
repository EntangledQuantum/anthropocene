# Reconstruction / slope limiters — research notes (Agent 27)

## Solvable chain

1. **Hook.** A square pulse, cell averages, piecewise-constant faces. Put an unlimited linear slope in every cell and advect. Predict: does the jump get sharper, stay monotone, or ring?
2. **Naive attempt.** Tempting: second-order is closer to the truth, so a jump just gets sharper. Or: reconstruction recovers the function, like a spectral method. Or: a slope on the cell breaks the shared-face flux.
3. **The world talks back.** Cell-average bars, the reconstructed slope drawn inside each cell, a TV readout. Unlimited Fromm invents new maxima. TV grows. The slope sticks out past the neighbours.
4. **Name the structure.** Godunov (1959): a *linear* scheme that never makes new extrema is at most first-order. Unlimited MUSCL is linear and second-order, so it must ring. The escape is a *nonlinear* limiter.
5. **Tighten.** minmod (and superbee) zero or clip the slope wherever it would overshoot. TV of the cell averages is nonincreasing. Same conservation form as the finite-volume lesson; CFL stays at 0.4.
6. **Representation shift.** Sketch TV/TV₀ for unlimited Fromm on the pulse. The shape to commit to is a climb above 1, not a ruler and not a gentle smear-down.
7. **Near-transfer.** Three cells 0 | 0.8 | 1. Hunt the largest slope in the middle cell whose faces stay inside the neighbours — the Sweby upper bound. Then rank piecewise-constant / minmod / unlimited by L¹ error on a smooth sine: the limiter is a switch, not a viscosity. On smooth monotone data it stays out of the way.
8. **Optional edge.** TVD schemes drop to first order at smooth extrema (Osher–Chakravarthy). WENO is the reconstruction that refuses to. Superbee sits on the upper Sweby boundary and can square off a ramp. The Riemann problem is what to do with the two face states the reconstruction still disagrees about.
9. **Close.** A limited slope inside the cell. TV cannot increase.

## Structure the learner must feel

The function inside the cell is not stored. You reconstruct it from neighbouring averages, and the face values you then feed the flux are only as honest as that guess. An unlimited slope is a linear second-order method, so Godunov’s theorem says it *must* invent extrema at a jump. A limiter is the nonlinear switch that zeros the slope there. The picture is the slope drawn inside the cell, stopping at the neighbour.

## Most tempting wrong belief

**Higher order is always closer to the truth, so a jump just gets sharper.** (Order is a smoothness theorem. At a discontinuity the leading error term is not small; a linear second-order stencil rings. Godunov 1959.)

Secondary: **reconstruction recovers the exact function inside the cell.** (You only have averages. A slope is a guess. Spectral methods are a different contract.)

Tertiary: **a slope on the cell breaks conservation.** (The update is still one flux per face. Reconstruction picks the *states* the flux sees. Link finite-volume, do not re-teach telescoping.)

Quaternary: **a limiter is extra numerical viscosity.** (It is a switch on the reconstructed slope. On a smooth ramp with r ≈ 1 it returns the unlimited slope. It is first-order only where it has to be.)

## Simplest useful case

1D linear advection, periodic, square pulse 1|0, ν = 0.4.

- Piecewise constant: δ_i = 0. First-order upwind. Smears, TV nonincreasing.
- Unlimited Fromm: δ_i = ½(Q_{i+1} − Q_{i−1}). Linear, second-order, rings.
- minmod: δ_i = minmod(Q_i − Q_{i−1}, Q_{i+1} − Q_i). TVD, most dissipative of the second-order family.
- superbee: Sweby upper bound. TVD, compressive.

Three-cell zoom: Q = (0, 0.8, 1). Unlimited δ = 0.5 overshoots the right neighbour; the TVD bound is 2 min(Δ₋, Δ₊) = 0.4.

## Transfer costume

A smooth sine. Unlimited MUSCL is honestly second-order. minmod is still order > 1 in L¹ (a few extrema get clipped). Same code, opposite costume from the jump: the limiter is a local switch, not a global downgrade.

## Numerics claims (need tests)

- Unlimited Fromm on a 0–1 jump: max Q exceeds 1 (rings); TV grows.
- minmod on the same jump: values stay in [0, 1]; TV is nonincreasing at every step.
- Smooth sine, unlimited MUSCL: observed L¹ order > 1 (≈ 2).
- Piecewise constant is first-order upwind (δ = 0).
- Conservation form still telescopes: ΣQ to roundoff.
- Three-cell TVD bound for (0, 0.8, 1) is 0.4; Fromm’s 0.5 overshoots.

## Sources

- S. K. Godunov, “A difference method for numerical calculation of discontinuous solutions of the equations of hydrodynamics,” *Mat. Sb.* **47** (1959) 271–306. Linear monotone schemes are at most first-order.
- B. van Leer, “Towards the ultimate conservative difference scheme. V. A second-order sequel to Godunov’s method,” *J. Comput. Phys.* **32** (1979) 101–136. MUSCL.
- A. Harten, “High resolution schemes for hyperbolic conservation laws,” *J. Comput. Phys.* **49** (1983) 357–393. TVD.
- P. K. Sweby, “High resolution schemes using flux limiters for hyperbolic conservation laws,” *SIAM J. Numer. Anal.* **21** (1984) 995–1011. The φ(r) region; minmod on the lower boundary, superbee on the upper.
- P. L. Roe, “Characteristic-based schemes for the Euler equations,” *Ann. Rev. Fluid Mech.* **18** (1986) 337–365. Superbee.
- R. J. LeVeque, *Finite Volume Methods for Hyperbolic Problems* (Cambridge, 2002), ch. 6. Reconstruction, limiters, MUSCL-Hancock, Sweby diagram.
- S. Osher and S. Chakravarthy, “High resolution schemes and the entropy condition,” *SIAM J. Numer. Anal.* **21** (1984) 955–984. TVD schemes are at most first-order at smooth extrema.
- G.-S. Jiang and C.-W. Shu, “Efficient implementation of weighted ENO schemes,” *J. Comput. Phys.* **126** (1996) 202–228. WENO — the reconstruction that stays high-order at extrema. Mention, do not teach.
