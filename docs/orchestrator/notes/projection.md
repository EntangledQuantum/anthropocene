# Pressure projection — research notes (Agent 15)

## Solvable chain

1. **Hook.** A dye blob sits in a velocity field that looks like a swirl. Fluids are incompressible, so the blob should keep its area. Predict: after a few time units, what is the area?
2. **Naive attempt.** It shrinks. The heatmap of ∇·u is not black — a sink was hiding in the swirl. Looking like a vortex is not the constraint.
3. **The world talks back.** Helmholtz-project the same field (solve Poisson, subtract ∇φ). Arrows change, heatmap goes to roundoff, the blob stops shrinking and only shears.
4. **Name the structure.** Any field splits as u* = u + ∇φ with ∇·u = 0. Pressure is the Lagrange multiplier of ∇·u = 0. The discrete map has to land on the constraint.
5. **Tighten.** Sketch the area decay without projection. Predict leftover max|div| after one Poisson solve (roundoff, not "about ten times smaller"). Classify vortex / sink / translation / mixed.
6. **Representation shift.** MAC faces: discrete div of a discrete curl is identically zero. Estimate the leftover max|div| as an order of magnitude.
7. **Near-transfer.** Same idea as SHAKE, different clothing: the constraint belongs inside the map. Link, do not re-teach SHAKE. Pressure is λ for ∇·u = 0 the way SHAKE's λ is for g(q) = 0.
8. **Optional edge.** Jacobi sweeps are not the projection — hunt how many until leftover div drops a hundredfold. Collocated checkerboard. Chorin's first-order splitting error in time.
9. **Close.** Helmholtz split; pressure is the multiplier of ∇·u = 0. Without it in the map, a "fluid" is a compressible blob that happens to look swirly.

## Structure the learner must feel

Incompressibility is not a visual style. It is a constraint on the next velocity. A field that looks like a swirl can still have a sink in it, and a blob sitting on that sink loses area at a rate ∫ ∇·u. The Helmholtz projection is the discrete map that lands on ∇·u = 0: solve Poisson for the potential, subtract the gradient. After that, max|div| is roundoff, not "small". The leftover field is the swirl; the part that vanished was never a fluid motion.

## Tempting wrong belief

"If it looks like a vortex it is incompressible. Pressure is a cleanup you apply when divergence looks bad. Projection makes div smaller, not machine-zero. Subtracting the mean velocity (or the mean divergence) is the projection."

Misconceptions to name: `swirl-means-incompressible`, `projection-is-approximate`, `pressure-is-cleanup`, `mean-velocity-kills-div`.

## Simplest useful case

Periodic 2-D MAC (Harlow–Welch) on the unit torus. u on vertical faces, v on horizontal faces, p at cell centres. Discrete divergence at cell (i,j):

\[
(\nabla\cdot u)_{i,j} = \frac{u_{i,j}-u_{i-1,j}}{h} + \frac{v_{i,j}-v_{i,j-1}}{h}.
\]

A Gaussian stream function at vertices produces a vortex whose discrete div is identically zero. A Gaussian potential at cell centres produces a pure sink (gradient field) whose discrete curl is identically zero. Mixed = vortex + sink. A ring of dye around the centre: without projection the area falls; with it, max|div| → roundoff and the ring only shears.

Helmholtz step (Chorin 1968, spatial half): Δφ = ∇·u*, u ← u* − ∇φ. Periodic Poisson via the 5-point eigenmodes; the (0,0) mode is pinned to zero (compatibility: mean discrete div of any MAC field is identically zero on a torus).

## Transfer costume

SHAKE / RATTLE: g(q_{n+1}) = 0 is a constraint of the discrete map, λ is the multiplier. Here ∇·u = 0 is the constraint and pressure is λ. Same structure, fluid clothing. Do not re-teach SHAKE — link to `04-structure-preserving/03-constraints`. Chorin's time split is a predictor-then-project and is *not* SHAKE; the spatial constraint is what lands exactly.

Electrostatics / image-processing Hodge: any vector field is a gradient plus a curl. Same split, no fluid.

## Numerics claims (need tests)

- Discrete div of a MAC vortex (stream function at vertices) is identically 0.
- Discrete curl of a MAC sink (gradient of cell-centred potential) is identically 0.
- Mean discrete div of any periodic MAC field is 0 (telescoping / compatibility).
- Spectral Helmholtz projection: max|div| at roundoff (≲ 10⁻¹⁰ on n = 24).
- Projection is idempotent: P² = P.
- Discrete Hodge orthogonality: the kept field is L²-orthogonal to the removed gradient.
- A pure sink is killed (kinetic energy → 0); a pure vortex is unchanged (velocity matches to roundoff).
- Dye-ring area: mixed field without projection loses a large fraction of area by t = 1; with projection, |A/A₀ − 1| stays small (advection error, not compression).
- Subtracting the mean velocity does not change max|div|.
- Jacobi leftover max|div| decreases with iteration count; a handful of sweeps is not the projection.

## Sources

- Chorin, *Numerical solution of the Navier–Stokes equations*, Math. Comp. 22 (1968) 745–762. Projection / fractional step.
- Chorin, *On the convergence of discrete approximations of the Navier–Stokes equations*, Math. Comp. 23 (1969) 341–353.
- Temam, *Sur l'approximation de la solution des équations de Navier–Stokes par la méthode des pas fractionnaires*, Arch. Rational Mech. Anal. 32 (1969) 135–153.
- Harlow & Welch, *Numerical calculation of time-dependent viscous incompressible flow of fluid with free surface*, Phys. Fluids 8 (1965) 2182–2189. MAC staggered grid.
- Guermond, Minev, Shen, *An overview of projection methods for incompressible flows*, Comput. Methods Appl. Mech. Engrg. 195 (2006) 6011–6045.
- Brown, Cortez, Minion, *Accurate projection methods for the incompressible Navier–Stokes equations*, J. Comput. Phys. 168 (2001) 464–499.
- Helmholtz, *Über Integrale der hydrodynamischen Gleichungen, welche den Wirbelbewegungen entsprechen*, J. Reine Angew. Math. 55 (1858) 25–55. The split.
