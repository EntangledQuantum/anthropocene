# Curriculum landscape vs the current path

Source of truth for topics: `docs/computational-physics-curriculum.md` (1422 lines).
Current product path: `content/paths/computational-physics/` — five live lessons, nine draft stubs.

This file is the orchestrator map. Agents do not invent extra topics.

Status key: **live** / **draft stub** / **missing** (no lesson file).

---

## Already in the product (do not duplicate)

| Product lesson | Status | Curriculum coverage |
|---|---|---|
| `01-numerical-reality/01-floating-point.mdx` | live | A2 lines 106–109 (partial: FP, eps, cancellation) |
| `01-numerical-reality/02-conditioning-vs-stability.mdx` | **draft → Wave 1** | A2 lines 110–113 |
| `02-derivatives/01-finite-differences.mdx` | live | A5 lines 144–150, B2 lines 196–197 |
| `02-derivatives/02-richardson-and-complex-step.mdx` | **draft → Wave 1** | A3 line 126, B2 lines 197–204 |
| `03-ode-solvers/01-forward-euler.mdx` | live | A6, B5.1–B5.2 (Euler only) |
| `03-ode-solvers/02-rk4.mdx` | live | B5.2 lines 327–331 |
| `03-ode-solvers/03-implicit-and-stiffness.mdx` | **draft → Wave 1** | B5.3 lines 336–345 |
| `03-ode-solvers/04-adaptive-stepping.mdx` | **draft → Wave 1** | B5.2 lines 332–334 |
| `04-structure-preserving/01-verlet-vs-rk4.mdx` | live | B5.5 lines 355–360 |
| `04-structure-preserving/02-variational-view.mdx` | **draft → Wave 1** | B5.5 lines 361–364 |
| `05-other-paradigms/01-spectral-methods.mdx` | **draft → Wave 1b** | C5 lines 595–606, B6 383–391 |
| `05-other-paradigms/02-monte-carlo.mdx` | **draft → Wave 1b** | B7 394–402, D4.1 707–713 |
| `05-other-paradigms/03-molecular-dynamics.mdx` | **draft → Wave 1b** | D2 679–691 |
| `05-other-paradigms/04-differentiable-simulation.mdx` | **draft → Wave 1c** (blocked on Richardson) | E6 989–995, E9 1028–1034 |

---

## Wave 1 / 1b / 1c — ship the nine stubs (this run)

See `docs/orchestrator/WAVE-1.md`. One topic per agent. Isolated worktrees.

---

## Wave 2 — missing unlocking lessons (next, after Wave 1 merges)

These are the holes that make the current path feel “limited.” Scaffold with `npm run new:lesson`, then write.

| ID | Topic | Curriculum lines | Why it is next |
|---|---|---|---|
| A1 | What computational physics is | 94–103 | Path identity; currently assumed |
| A3 | Error is not one thing | 115–127 | Only order-of-accuracy is taught today |
| A4 | Discrete worlds: what is stored where | 129–140 | Unlocks FDM/FVM/FEM costumes |
| A7 | The first explosion (CFL / amplification) | 161–168 | Biggest pedagogical hole; LEARNING-PLAN ch.6 |
| A8 | Computational experiments as craft | 170–176 | Feeds E3 later |
| B4.1 | Matrices as discrete operators | 223–231 | “Every method becomes Au=b” |
| B4.3–4 | Jacobi smoothing → Krylov | 244–264 | Algebraic engine |
| C0 | The PDE before the method | 410–420 | LEARNING-PLAN ch.6 start |
| C1.3–1.4 | Model PDEs + FTCS/CFL | 444–460 | Heat/wave/advection studio |

---

## Wave 3+ — later courses (do not start now)

Depth beats catalog. Do not spawn these until Wave 2 lives.

- **B4.5–B4.8** preconditioners, multigrid, Newton (266–308)
- **C2** FVM, reconstruction, Riemann (461–504)
- **C3–C4** weak form + FEM (505–593)
- **C6–C9** DG, BEM, mesh, ALE (608–649)
- **D3–D13** PIC, LBM, SPH, MPM, DEM, peridynamics (692–873)
- **E1–E10** solver stack, V&V, UQ, HPC, surrogates (877–1043)
- **Domain tracks F/S/M/Q/K/A/P/O** (1046–1142) — clothing, after methods
- **Beyond-physics paths** in `LEARNING-PLAN.md` (linear algebra as its own path, etc.)

Packaging names for later courses: curriculum §12 lines 1311–1374.

---

## Shared constraints for every wave

- One concept, one owning lesson.
- Physics is clothing; methods are structure (curriculum §0, lines 41–43).
- 20+ solvables per unlocking concept is the long-term gym target; v1 of a lesson ships a tight 5–12 minute chain, not a survey.
- Lesson anatomy: curriculum §10, lines 1243–1298.
- Misconception library starters: lines 1271–1284.
