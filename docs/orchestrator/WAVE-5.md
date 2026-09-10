# Wave 5 assignments — linear algebra iterative solvers

Append-only on registries. JSX contractions in double quotes.
Operator lesson is live: `01-matrix-as-operator`. Link it. Do not re-teach sparsity.

Curriculum: `docs/computational-physics-curriculum.md` B4.3–B4.4.

---

## Agent 19 — Smoothing is not solving

- **Curriculum:** lines **244–251** (Jacobi, Gauss–Seidel, the smoother).
- **Lesson:** `content/paths/linear-algebra/02-iterative/01-jacobi-smoothing.mdx`
- **Owns:** `jacobi-iteration`, `smoothing`
- **Requires:** `discrete-operator`, `sparse-matrix`
- **Interactive:** 1D Poisson. Start from a mixed-frequency error. After a few Jacobi sweeps the residual looks smooth and then stalls. Couple the field and a Fourier (or mode) plot of the error. Gauss–Seidel as a tightening beat.
- **Tomorrow picture:** high-k dies, low-k lives. That stall *is* the coarse-grid correction, later.
- Widget ids `jac-`. Numerics: reuse Laplacian from `operator.ts`; add `src/lib/numerics/iterative.ts`. Tests: high-mode decay vs low-mode stall; spectral radius of Jacobi on this A.

---

## Agent 20 — The residual's own subspace

- **Curriculum:** lines **253–264** (Krylov, CG). Stop before GMRES/preconditioners (later).
- **Lesson:** `content/paths/linear-algebra/02-iterative/02-krylov.mdx`
- **Owns:** `krylov`, `conjugate-gradient`
- **Requires:** `jacobi-iteration`, `discrete-operator`
- **Interactive:** same 1D Poisson. Overlay Jacobi residual vs CG residual vs iteration. CG in a 2D Krylov plane: the next residual is A-orthogonal to the previous. That picture, not the formula, is the lesson.
- **Tomorrow picture:** K_k = span{r, Ar, …}; CG picks the A-best in that plane.
- Widget ids `cg-`. Same `iterative.ts`. Tests: CG residual drops faster than Jacobi; A-orthogonality of successive residuals; exact in n steps on an n-dimensional SPD problem (tiny n).
