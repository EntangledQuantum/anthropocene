# Wave 7 — QR and Newton

Append-only. JSX contractions in double quotes. Misconception ids: **lowercase-hyphenated only** (no capitals).

---

## Agent 23 — A stable way to lose a column

- **Curriculum:** Trefethen & Bau lectures on QR / Householder. Conditioning of AᵀA vs QR.
- **Lesson:** `content/paths/linear-algebra/03-factorizations/01-qr.mdx`
- **Owns:** `qr-factorization`, `householder`
- **Requires:** `discrete-operator`, `conditioning`
- **Interactive:** a 2-column nearly parallel pair. Forming AᵀA loses digits; a Householder reflector triangularises without squaring κ. Couple the two columns and the R entries.
- **Tomorrow picture:** κ(AᵀA) = κ(A)²; QR does not square it.
- Widget ids `qr-`. Numerics `src/lib/numerics/qr.ts`. Tests: Householder Q is orthogonal; R from QR matches; normal-equations residual is worse on a κ~1e8 pair.

---

## Agent 24 — Linearise, solve, repeat

- **Curriculum:** lines **282–308** (B4.8 Newton). Basin of attraction, not the formula.
- **Lesson:** `content/paths/linear-algebra/02-iterative/05-newton.mdx`
- **Owns:** `newtons-method`
- **Requires:** `conjugate-gradient`, `conditioning`
- **Interactive:** a 1D or 2D nonlinear F. Drag x₀; some start in the basin (quadratic catch), some diverge. Couple the residual history and a basin plot. The linear solve inside the step can be CG — link, do not re-teach CG.
- **Tomorrow picture:** the basin; quadratic once you are in it; a bad Jacobian is a different operator.
- Widget ids `nt-`. Numerics `src/lib/numerics/newton.ts`. Tests: quadratic residual drop near the root; a start outside the basin that diverges; one Newton step = linear solve of J δ = −F.
