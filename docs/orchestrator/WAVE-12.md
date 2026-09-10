# Wave 12 — UQ and DEM

Append-only. JSX contractions in double quotes. Misconception ids lowercase-hyphenated. `updated: 2026-09-11`.

---

## Agent 33 — The number came with a cloud

- **Curriculum:** E UQ / sensitivity.
- **Lesson:** `content/paths/computational-physics/07-trusting-the-run/02-uq.mdx`
- **Owns:** `uncertainty-quantification`
- **Requires:** `verification`, `monte-carlo-integration`
- **Interactive:** a cheap 1D model (decay, or heat end-time). Push a parameter distribution through; the output cloud *is* the prediction. Monte Carlo of the parameter, not of the PDE. Contrast one-at-a-time vs a joint sample. V&V is a link.
- **Tomorrow picture:** a histogram of outputs, not a single curve.
- Widget ids `uq-`. Numerics `src/lib/numerics/uq.ts`. Tests: mean/variance of a linear map; a nonlinear map that fattens the tail.
- Notes: `docs/orchestrator/notes/uq.md`

---

## Agent 34 — Contact is the constitutive law

- **Curriculum:** DEM (D11-ish).
- **Lesson:** `content/paths/computational-physics/05-other-paradigms/08-dem.mdx`
- **Owns:** `discrete-element`
- **Requires:** `molecular-dynamics`, `constrained-integration`
- **Interactive:** 2D discs, gravity, a hopper or a pile. Spring-dashpot contact. Angle of repose as the observable. MD is a link (soft potential vs contact).
- **Tomorrow picture:** overlap → force; the pile’s slope is the constitutive law.
- Widget ids `dem-`. Numerics `src/lib/numerics/dem.ts`. Tests: two-particle bounce with restitution; a small pile’s angle of repose is finite; no overlap when k→∞ in a 2-particle rest.
- Notes: `docs/orchestrator/notes/dem.md`
