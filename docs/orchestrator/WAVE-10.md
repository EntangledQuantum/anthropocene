# Wave 10 — PIC and LBM

MD and PDE types are live. Append-only. JSX contractions in double quotes. Misconception ids lowercase-hyphenated.

---

## Agent 29 — Charge on a grid, motion on particles

- **Curriculum:** D3 PIC ~692–706.
- **Lesson:** `content/paths/computational-physics/05-other-paradigms/05-pic.mdx`
- **Owns:** `particle-in-cell`
- **Requires:** `molecular-dynamics`, `pde`
- **Interactive:** 1D electrostatic PIC. Deposit charge to grid, solve Poisson, gather E, push particles. Couple particles and ρ/φ. Two-stream or a plasma oscillation. N² Coulomb is the contrast, not a second method.
- **Tomorrow picture:** charge clouds on a mesh; the field is a Poisson solve, not a sum over pairs.
- Widget ids `pic-`. Numerics `src/lib/numerics/pic.ts`. Tests: charge conservation on deposit; plasma frequency of a small oscillation; gather is adjoint of scatter (or a 2-particle identity).
- Notes: `docs/orchestrator/notes/pic.md`

---

## Agent 30 — A gas that forgot it was particles

- **Curriculum:** D5 LBM ~714–730 area of curriculum (LBM).
- **Lesson:** `content/paths/computational-physics/05-other-paradigms/06-lbm.mdx`
- **Owns:** `lattice-boltzmann`
- **Requires:** `pde`, `cfl-condition`
- **Interactive:** D1Q3 or D2Q9 lid-driven / Poiseuille. Stream and collide as two views. Density/velocity moments recover a NS-like profile. Bounce-back walls.
- **Tomorrow picture:** f_i stream along lattice links; collide toward f^eq; ρ,u are moments.
- Widget ids `lbm-`. Numerics `src/lib/numerics/lbm.ts`. Tests: mass conserved; Poiseuille parabola (1D/2D channel); τ related to viscosity.
- Notes: `docs/orchestrator/notes/lbm.md`
