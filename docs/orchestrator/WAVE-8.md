# Wave 8 — SVD and GMRES

Append-only. JSX contractions in double quotes. Misconception ids lowercase-hyphenated.

---

## Agent 25 — A stretch, a rotation, another stretch

- **Lesson:** `content/paths/linear-algebra/03-factorizations/02-svd.mdx`
- **Owns:** `svd`, `low-rank`
- **Requires:** `qr-factorization`, `conditioning`
- **Interactive:** a 2D unit circle mapped by A becomes an ellipse. Singular values are the axis lengths. Truncating the smallest σ is the best low-rank picture (Eckart–Young). Couple the ellipse and the σ slider.
- **Tomorrow picture:** A = U Σ Vᵀ; κ = σ_max/σ_min; drop small σ to compress.
- Widget ids `svd-`. Numerics `src/lib/numerics/svd.ts` (2×2 analytic is enough, plus a small dense SVD for a picture). Tests: 2×2 SVD reconstruction; Eckart–Young residual equals the dropped σ.
- Notes: `docs/orchestrator/notes/svd.md`

---

## Agent 26 — When A is not SPD

- **Lesson:** `content/paths/linear-algebra/02-iterative/06-gmres.mdx`
- **Owns:** `gmres`
- **Requires:** `krylov`, `qr-factorization`
- **Interactive:** a nonsymmetric 1D convection–diffusion (or a rotation+scale 2×2 family). Overlay CG (may break / stall) vs GMRES residual. Show the Arnoldi Hessenberg growing. Memory vs restart as a tightening beat.
- **Tomorrow picture:** min ‖r‖₂ over K_k; you store the whole basis; restart trades optimality for RAM.
- Widget ids `gm-`. Prefer `src/lib/numerics/gmres.ts` so you do not fight SVD on shared files. Tests: GMRES residual decreases; on SPD it matches CG residual at step k in exact arithmetic (or close); on a nonsymmetric A, CG fails or is slower.
- Notes: `docs/orchestrator/notes/gmres.md`
