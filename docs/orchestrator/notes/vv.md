# V&V — research notes (Agent 32)

Roache, *J. Fluids Eng.* **124** (2002), “Code Verification by the Method of Manufactured Solutions.”
Oberkampf & Trucano, *Prog. Aerosp. Sci.* **38** (2002).
ASME V&V 20; AIAA G-077. Boehm: building the product right vs the right product.

## Solvable chain

1. **Hook.** A smooth heat-looking sine. CFL-safe. Predict: is this a proof? (`vv-pretty-proof`)
2. **Naive attempt.** Bounded and pretty means verified. Or: refine once and look again. Or: check that mass is conserved.
3. **The world talks back.** Same run with the manufactured overlay: extra `/2` on the Laplacian. Residual stuck at ~14 for every $n$. (`<VvLab kind="half-stencil">`)
4. **Name the structure.** Pick $\hat u$, plug into the PDE, take $f = \hat u_t - \alpha\hat u_{xx}$. Residual vs $\Delta x$ at the design order is verification. (`vv-coeff-order`, `vv-residual-sketch`)
5. **Tighten.** Double $n$: error falls by ~4, not 2, not 1. (`vv-mms-drop`)
6. **Representation shift.** Field view ↔ log-log residual. Three runs of the same code. (`vv-three-runs`, `<VvLab>` unlocked)
7. **Near-transfer.** Recover order 2 against a manufactured solution of $\alpha=1/2$. Have you validated $\alpha=1$? (`vv-order-is-physics`)
8. **Optional edge.** Code vs solution verification; GCI; conservation is necessary and weak. Upwind vs heat as the wave costume. (`<Tier advanced>`)
9. **Close.** Verification = solved the discrete problem. Validation = the discrete problem is the physics. (`vv-solved-right`)

## Structure the learner must feel

A pretty field is a colour map. The proof is a slope. MMS manufactures an exact solution of whatever operator you wrote, so it will happily verify the wrong physics.

Tomorrow picture: two sentences. Verification = solved the discrete problem. Validation = the discrete problem is the physics. Residual vs $h$, slope $p$.

## Most tempting wrong belief

**A pretty field is a verified field.** (The extra `/2` Laplacian is smooth, bounded, CFL-safe, and the residual does not fall.)

Secondary: **recovering the design order means the model is the physics.** (Matched-$\alpha$ MMS on the extra `/2` recovers order 2 and is still $\alpha=1/2$.)

Tertiary: **one resolved-looking run is a verification.** (A single grid cannot measure an order; two grids that have both converged to the wrong PDE “look the same.”)

Misconceptions: `pretty-is-verified`, `one-grid-enough`, `order-is-validation`. CFL already owns `smooth-means-right`; do not duplicate.

## Simplest useful case

1D periodic heat, FTCS, $r=0.25$, $\hat u = \sin(2\pi x)\cos(2\pi t)$.

- Matching $\alpha$: spatial residual and solution error both $\Order(\Delta x^2)$.
- Extra `/2` on the stencil: residual ≈ 14, slope ≈ 0, field still a sine.
- Upwind of a Gaussian: error vs heat stays $O(1)$; error vs exact advection falls as $\Delta x$.

## Transfer costume

Advection wearing heat's clothes: a travelling bump you might ship as a wave. Refine; it becomes a better travelling bump, never a spreading one.

## Numerics claims (each tested)

- MMS heat FTCS, $r$ fixed: residual order $\approx 2$; doubling $n$ drops $L^2$ error by $\approx 4$.
- Matched $\alpha=1/2$ MMS still recovers order 2 (verification of the written operator).
- Extra `/2` stencil: bounded, sine-shaped; residual vs intended $\alpha$ is $O(1)$, slope $\approx 0$.
- Upwind vs heat: $L^2$ distance stays $O(1)$ under refinement; vs exact advection the error falls.

## Sources

- P. J. Roache, “Code Verification by the Method of Manufactured Solutions,” *J. Fluids Eng.* **124** 4–10 (2002). https://doi.org/10.1115/1.1436090
- W. L. Oberkampf, T. G. Trucano, “Verification and validation in computational fluid dynamics,” *Prog. Aerosp. Sci.* **38** 209–272 (2002). https://doi.org/10.1016/S0376-0421(02)00005-2
- K. Salari, P. Knupp, *Code Verification by the Method of Manufactured Solutions*, SAND2000-1444.
- ASME V&V 20-2009, *Standard for Verification and Validation in Computational Fluid Dynamics and Heat Transfer*.

## Tomorrow picture

A log-log residual. Slope 2 means you solved the discrete problem you wrote. Slope 0 means you didn't, even if the field is beautiful. Validation is a different axis.
