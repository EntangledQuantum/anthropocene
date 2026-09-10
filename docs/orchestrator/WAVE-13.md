# Wave 13 — peridynamics and scaling

Append-only. JSX contractions in double quotes. Misconception ids lowercase-hyphenated. `updated: 2026-09-11`.

---

## Agent 35 — A derivative that is an integral

- **Curriculum:** peridynamics (D13).
- **Lesson:** `content/paths/computational-physics/05-other-paradigms/09-peridynamics.mdx`
- **Owns:** `peridynamics`
- **Requires:** `sph`, `pde`
- **Interactive:** 1D bar. Bond stretch → force. Break bonds above a stretch; a crack is just missing bonds. Contrast a local FEM/FD bar that needs a special crack rule. SPH is a link (kernel vs horizon).
- **Tomorrow picture:** the stress divergence is an integral over a horizon.
- Widget ids `pd-`. Numerics `src/lib/numerics/peridynamics.ts`. Tests: uniform stretch recovers linear elasticity; a broken bond carries no force; energy drops when a bond snaps.
- Notes: `docs/orchestrator/notes/peridynamics.md`

---

## Agent 36 — Twice the cores is not twice as fast

- **Curriculum:** HPC / Amdahl / strong vs weak scaling.
- **Lesson:** `content/paths/computational-physics/07-trusting-the-run/03-scaling.mdx`
- **Owns:** `strong-scaling`, `amdahl`
- **Requires:** `verification`
- **Interactive:** a toy split: serial fraction s, parallel work. Drag cores; speedup saturates at 1/s. Then a 1D halo-exchange model: communication vs compute as n/P shrinks (strong) vs stays (weak). No real MPI — a model of the times.
- **Tomorrow picture:** Amdahl ceiling; strong scaling dies when the halo eats the cell.
- Widget ids `sc-`. Numerics `src/lib/numerics/scaling.ts`. Tests: Amdahl limit; strong vs weak curves.
- Notes: `docs/orchestrator/notes/scaling.md`
