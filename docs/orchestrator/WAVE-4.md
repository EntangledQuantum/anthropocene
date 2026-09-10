# Wave 4 assignments — one topic per agent

Wave 3 is on `main`. Append-only on registries / `lesson.astro`.
**JSX contractions in double quotes.**

---

## Agent 17 — What is conserved, cell by cell

- **Curriculum:** lines **461–477** (C2.1–C2.2). Stop before Riemann/WENO (later).
- **Lesson:** `content/paths/computational-physics/06-fields-and-continua/07-finite-volume.mdx`
- **Owns:** `finite-volume`, `conservation-form`
- **Requires:** `pde`, `cfl-condition`
- **Interactive:** 1D advection or Burgers. Two cells: flux leaving left = flux entering right, so the sum cannot drift. Contrast a non-conservative FD that leaks mass at a shock. Couple cell averages + a running total.
- **Tomorrow picture:** telescoping fluxes; conservation is a property of the discrete map, not of the PDE.
- Widget ids `fvm-`. Numerics `src/lib/numerics/fvm1d.ts`.

---

## Agent 18 — A matrix is a discrete operator

- **Curriculum:** lines **223–231** (B4.1).
- **Lesson:** `content/paths/linear-algebra/01-operators/01-matrix-as-operator.mdx`
- **Owns:** `discrete-operator`, `sparse-matrix`
- **Requires:** `central-difference`, `conditioning`
- **Interactive:** 1D Laplacian stencil becomes a matrix the learner can see (spy plot + apply-to-vector). A dense table of the same numbers hides the structure. Conditioning of that A is already taught — link, do not re-teach κ.
- **Tomorrow picture:** A is a stencil, not a spreadsheet. Sparsity is the method.
- Widget ids `op-`. Numerics can live in `src/lib/numerics/linalg.ts` append or `operator.ts`.

