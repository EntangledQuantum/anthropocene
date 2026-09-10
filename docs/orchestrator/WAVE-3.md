# Wave 3 assignments — remaining chapter 6, one topic per agent

Stubs are in the tree. Do not edit `LEARNING-PLAN.md`.
**Append-only** on `tune-scenarios.ts` / `sketch-scenarios.ts` / `estimate-scenarios.ts` / `lesson.astro`.
**JSX strings:** contractions (`paper's`, `don't`) go in **double quotes**, or the GitHub Pages build dies.

General notes: `docs/orchestrator/AGENT-BRIEFING.md`.
Curriculum: `docs/computational-physics-curriculum.md`.

---

## Agent 13 — Boundaries are different animals

- **Curriculum:** lines **424–430** (C1.1 construction: one-sided, ghost, mapped, MOL).
- **Lesson:** `content/paths/computational-physics/06-fields-and-continua/03-stencils-and-ghosts.mdx`
- **Owns:** `ghost-points`, `boundary-stencils`
- **Requires:** `cfl-condition`, `pde`
- **Interactive:** 1D Poisson or heat on [0,1]. Learner chooses Dirichlet vs Neumann. A naive interior stencil at the wall is visibly the wrong order; a ghost that encodes the BC restores it. Couple the stencil cartoon and the residual / order.
- **Tomorrow picture:** the missing neighbour is a fictitious value that *is* the boundary condition.
- **Do not** re-teach CFL. Link to `02-cfl`.
- Widget ids `ghost-`. New numerics file `src/lib/numerics/stencil-bc.ts` (or similar).

---

## Agent 14 — Your first finite element

- **Curriculum:** lines **505–529** (C3 weak form, C4.1 hats, assembly). Stop before 2D triangles / isoparametrics (those are later).
- **Lesson:** `content/paths/computational-physics/06-fields-and-continua/04-hat-functions.mdx`
- **Owns:** `weak-form`, `finite-elements`
- **Requires:** `pde`, `central-difference`
- **Interactive:** 1D Poisson. Learner places / sees piecewise-linear hats. Assembled tridiagonal is the same stencil as central differences **until the grid is irregular** — then FEM stays variational and FD's "just skip a neighbour" does not. That contrast is the lesson.
- **Tomorrow picture:** a hat function; Galerkin as "orthogonal residual"; assembly as overlapping local 2×2s.
- Widget ids `fem-`. New numerics `src/lib/numerics/fem1d.ts`.

---

## Agent 15 — Making a velocity field incompressible

- **Curriculum:** Track F lines **1051–1065** (projection, pressure Poisson). Also the constraint-as-map idea from SHAKE (do not re-teach SHAKE; link).
- **Lesson:** `content/paths/computational-physics/06-fields-and-continua/05-pressure-projection.mdx`
- **Owns:** `pressure-projection`, `incompressibility`
- **Requires:** `pde`, `cfl-condition`
- **Interactive:** 2D (or 1D-periodic + a transverse) MAC / staggered velocity. Learner stirs or sets a divergent field; **without** projection a blob shrinks; **with** projection, pressure solves Poisson and divergence goes to roundoff. Couple velocity arrows and a div heatmap.
- **Tomorrow picture:** Helmholtz split; pressure is the Lagrange multiplier of ∇·u = 0.
- Widget ids `proj-`. New numerics `src/lib/numerics/projection.ts`. Canvas 2D is enough; GPU only if N is large.

---

## Agent 16 — Particles that borrow a grid

- **Curriculum:** lines **777–820** (D8 MPM: PIC/FLIP/APIC, P2G/G2P, why the mesh is thrown away). One constitutive model (elastic or snow-like) is enough. Do not also write DEM/SPH.
- **Lesson:** `content/paths/computational-physics/06-fields-and-continua/06-material-point.mdx`
- **Owns:** `material-point-method`
- **Requires:** `velocity-verlet`, `pde`
- **Interactive:** 2D drop of elastic (or snow) particles. Toggle "keep the mesh" vs "reset the grid every step." Tangling vs not. Show P2G → grid momentum update → G2P as three coupled views of one step.
- **Tomorrow picture:** history lives on particles; derivatives live on a disposable grid.
- Widget ids `mpm-`. New numerics `src/lib/numerics/mpm.ts`. Animate from refs, not setState per frame.
