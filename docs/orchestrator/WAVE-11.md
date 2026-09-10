# Wave 11 — SPH and V&V

Append-only. JSX contractions in double quotes. Misconception ids lowercase-hyphenated. `updated: 2026-09-11`.

---

## Agent 31 — A kernel instead of a mesh

- **Curriculum:** SPH (D7).
- **Lesson:** `content/paths/computational-physics/05-other-paradigms/07-sph.mdx`
- **Owns:** `sph`
- **Requires:** `molecular-dynamics`, `pde`
- **Interactive:** 1D or 2D dam-break / hydrostatic. Density from Σ m W. Pairwise force. Tensile instability as the failure mode (clumping). Contrast with a grid that cannot tangle.
- **Tomorrow picture:** ρᵢ = Σⱼ mⱼ W(|xᵢ−xⱼ|, h); no mesh, but a kernel width.
- Widget ids `sph-`. Numerics `src/lib/numerics/sph.ts`. Tests: constant field recovered under a complete kernel; hydrostatic rest (or known leak); tensile clumping when unchecked.
- Notes: `docs/orchestrator/notes/sph.md`

---

## Agent 32 — When is a pretty picture a proof

- **Curriculum:** E3 V&V ~900–930 area.
- **Lesson:** `content/paths/computational-physics/07-trusting-the-run/01-vv.mdx`
- **Owns:** `verification`, `validation`
- **Requires:** `cfl-condition`, `order-of-accuracy`
- **Interactive:** the same heat/wave code run three ways: (1) manufactured solution — order of accuracy (verification); (2) refined grid that converges to the *wrong* PDE (valid equations, wrong physics); (3) a pretty but unverified plot. Classify each. The MMS residual vs h is the lab.
- **Tomorrow picture:** verification = solved the discrete problem; validation = the discrete problem is the physics.
- Widget ids `vv-`. Reuse `pde1d.ts` / `convergence.ts`. Tests: MMS recovered order; a deliberately wrong stencil that still “looks smooth.”
- Notes: `docs/orchestrator/notes/vv.md`
