# Wave 2 assignments — one topic per agent

Stubs are already in the tree. Do not edit `LEARNING-PLAN.md`.
**Registry rule (to cut merge conflicts):** prefer a **new** numerics file.
If you must touch `tune-scenarios.ts` / `sketch-scenarios.ts` / `estimate-scenarios.ts`
/ `lesson.astro`, **append only** at the tail. Do not restyle the export object.

General notes: `docs/orchestrator/AGENT-BRIEFING.md`.
Curriculum: `docs/computational-physics-curriculum.md`.

---

## Agent 10 — Staying on the manifold

- **Curriculum:** lines **361–364** (SHAKE/RATTLE, Lie-group / rigid-body).
- **Lesson:** `content/paths/computational-physics/04-structure-preserving/03-constraints.mdx`
- **Owns:** `constrained-integration`
- **Requires:** `velocity-verlet`, `variational-integrators`
- **Interactive:** a rotating body (or a pendulum with a holonomic constraint) integrated with and without renormalisation / SHAKE. Rotation matrix (or `q·q`) drifts off the manifold without the constraint step, stays on it with it.
- **Tomorrow picture:** the constraint is part of the discrete map, not a cleanup.
- **Do not re-teach** Verlet vs RK4 energy. Link to the owner.

---

## Agent 11 — From particles to fields

- **Curriculum:** lines **129–140** (A4 costumes) and **410–420** (C0 PDE types).
- **Lesson:** `content/paths/computational-physics/06-fields-and-continua/01-from-particles-to-fields.mdx`
- **Owns:** `pde`, `continuum-limit`
- **Requires:** `forward-euler`, `order-of-accuracy`
- **Interactive:** the same smooth function in two costumes (particles vs samples on a line). Then three 1D personalities — elliptic / parabolic / hyperbolic — as *what information must enter through the boundary*. Classify symptoms into the three types. Simplest useful case: 1D.
- **Tomorrow picture:** domain of dependence as a triangle (hyperbolic), the whole interval (elliptic), one-sided fill (parabolic).

---

## Agent 12 — When the grid explodes (CFL)

- **Curriculum:** lines **161–168** (A7) and **444–460** (C1.3–C1.4 model equations + FTCS).
- **Lesson:** `content/paths/computational-physics/06-fields-and-continua/02-cfl.mdx`
- **Owns:** `cfl-condition`
- **Requires:** `pde`, `forward-euler`, `numerical-stability`
- **Depends on Agent 11 conceptually** (`pde` owner). You may still write in parallel; the concept file already exists.
- **Interactive (LEARNING-PLAN):** a 1D wave or advection solver. Learner drags CFL = c Δt / Δx across 1 and watches the grid explode. Couple the field and a CFL readout. Show a stable-looking but *wrong* dissipative run as the other failure (the scheme pretending to be physics).
- **Tomorrow picture:** the CFL triangle — information cannot outrun the stencil.
- **Numerics:** new `src/lib/numerics/pde1d.ts` (or similar). Tests: FTCS advection unstable for CFL > 1; heat FTCS unstable for r > 1/2; a first-order upwind that stays stable past the centred-difference cliff but smears.
