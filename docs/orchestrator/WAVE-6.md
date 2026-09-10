# Wave 6 — preconditioners and two-grid

Append-only registries. JSX contractions in double quotes.
CG and Jacobi are live. Link them.

---

## Agent 21 — A fake inverse that clusters the spectrum

- **Curriculum:** lines **266–273** (B4.5). Jacobi / SSOR / ILU as *operators*, not recipes.
- **Lesson:** `content/paths/linear-algebra/02-iterative/03-preconditioners.mdx`
- **Owns:** `preconditioning`
- **Requires:** `conjugate-gradient`, `krylov`
- **Interactive:** same 1D Poisson. Overlay CG vs Jacobi-preconditioned CG (or a diagonal / SSOR M). Spectrum of A vs M⁻¹A bunches. Iteration count drops.
- **Tomorrow picture:** Krylov is an accelerator; the algorithm is M⁻¹A.
- Widget ids `pc-`. Append `iterative.ts` (do not rewrite Jacobi/CG). Tests: κ(M⁻¹A) < κ(A); fewer CG steps with Jacobi/SSOR M.

---

## Agent 22 — The leftover wave lives on a coarser grid

- **Curriculum:** lines **274–280** (B4.6). Two-grid V-cycle only. Nested V-cycles as a tightening beat.
- **Lesson:** `content/paths/linear-algebra/02-iterative/04-two-grid.mdx`
- **Owns:** `multigrid`, `restriction-prolongation`
- **Requires:** `smoothing`, `discrete-operator`
- **Interactive:** 1D. Smooth, restrict the residual, solve coarse, prolong, correct. The leftover long wave disappears. Couple fine field and coarse residual.
- **Tomorrow picture:** high-k dies on the fine grid; low-k is a cheap coarse solve.
- Widget ids `mg-`. New `src/lib/numerics/multigrid.ts` or append iterative. Tests: two-grid residual drop independent of n (or much weaker than Jacobi); restriction/prolongation adjoint identity.
