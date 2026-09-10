# Conditioning versus stability — research notes

Sources: Trefethen & Bau, *Numerical Linear Algebra* (Lectures 12–15);
Higham, *Accuracy and Stability of Numerical Algorithms* (2nd ed.);
Numerical Recipes §5.6 (quadratic rearrangement);
Wilkinson / Turing on ill-conditioned systems.

## Solvable chain (thesis §5.2)

1. **Hook / confrontation** — A 2×2 whose right-hand side moves by 10⁻⁸ and whose answer jumps from (2, 0) to (1, 1). Predict: problem or algorithm? (`cond-who-fault`)
2. **Naive attempt** — Same solver, drag the perturbation. The algorithm is not a variable. (`cond-kappa-tune`)
3. **The world talks back** — x₂ = δ/ε. A 10⁻⁸ wiggle is an O(1) swing. The stretch *is* κ.
4. **Name the structure** — Conditioning is the problem; stability is the algorithm. A backward-stable method returns the exact answer to a nearby question. Forward error ≲ κ × backward error.
5. **Tighten** — How many of float64's 16 digits survive κ ≈ 4×10⁸? (`cond-digits-left`) Then: tiny residual, wrong x. (`cond-residual-trust`)
6. **Representation shift** — Sort symptoms into bad-problem vs bad-algorithm, including error-kind costumes (residual vs error, mesh that will not move). (`cond-classify-symptoms`)
7. **Near-transfer** — Textbook quadratic formula on x² + 10⁸ x + 1 = 0. Same well-conditioned roots, two algorithms; one cancels. (`cond-quad-naive`, `cond-quad-tune`)
8. **Optional edge** — Wilkinson's polynomial; more digits do not shrink κ.
9. **Close** — κ as a stretch of the input disk. A stable algorithm lands inside a nearby disk; an unstable one does not.

Target: 15 focused minutes.

## Structure the learner must feel

A small disk of possible inputs (b, or the coefficients) is stretched into a long thin ellipse of possible answers. κ is that stretch factor. You cannot un-stretch it by switching libraries. You *can* stop adding extra stretch with a sloppy algorithm.

Picture to leave: input disk → long ellipse; a stable algorithm's output sits on the ellipse of a *nearby* disk; an unstable algorithm's output sits somewhere that is not the answer to any nearby problem.

## Most tempting wrong belief

"Garbage output means a buggy / unstable algorithm." (Or: "buy more digits.") The 2×2 produces the same jump in every backward-stable solver. Extra precision prints more of the budget κ·ε; it does not shrink κ, and it does not help if the *data* is already uncertain at 1/κ.

Second belief, quadratic costume: "algebraically equivalent formulas are numerically equivalent." Equivalence is a statement about the reals. On a machine the order of operations *is* the algorithm.

Third: "a tiny residual means a tiny error in x." Residual is backward error. Forward error ≤ κ × backward error.

## Simplest useful case

$$
A = \begin{bmatrix}1&1\\1&1+\varepsilon\end{bmatrix},\quad
b=\begin{bmatrix}2\\2\end{bmatrix},\quad
\varepsilon=10^{-8}.
$$

Exact x = (2, 0). κ_∞(A) = (2+ε)²/ε ≈ 4×10⁸.
Perturb b₂ by δ: x₂ = δ/ε, x₁ = 2 − x₂. At δ = ε, x = (1, 1).

The algorithm is `solveDense` (LU with partial pivoting) — fixed.

## Unstable-algorithm case

x² + b x + 1 = 0, b ≫ 2. Roots ≈ −b and −1/b, both simple, both well-conditioned.
Naive: x = (−b ± √(b²−4))/2. For b > 0 the "+" root subtracts two close numbers.
Stable (Numerical Recipes / Higham): form q = −½ (b + sgn(b) √(b²−4ac)), then x_far = q/a, x_near = c/q (Vieta).

## Transfer costume

Error kinds (curriculum A3) as clothing, not as a new chapter:
- Tiny residual, wrong x → ill-conditioned problem, stable algorithm (roundoff dressed as "the solver worked").
- Mesh refinement that will not move a recovered initial temperature → the inverse problem is sensitive (looks like truncation, is conditioning).
- Two identical formulas, one dies → unstable algorithm (cancellation as a property of the procedure).

Wilkinson's polynomial (x−1)…(x−20): coefficient perturbations of size 2⁻²³ move roots off the real axis. np.roots is stable; the *question* is not.

## Numerics claims that need tests

- κ_∞ of the 2×2 equals (2+ε)²/ε, and `condInf` using `solveDense` recovers it.
- Perturbing b₂ by ε sends x from (2, 0) to (1, 1) under `solveDense`.
- Measured amplification ||Δx||/||x|| over ||Δb||/||b|| is within a small factor of κ.
- Backward-stable solve: relative residual ~ ε even when only ~7 digits of x are correct (κ ε ≈ 10⁻⁷).
- Remaining digits ≈ −log₁₀(κ ε) ≈ 7 for ε = 10⁻⁸ in float64.
- Quadratic, b = 10⁸: stable small root satisfies Vieta to ~ε; naive "+" root has relative error ≫ 10⁻⁶ (typically all digits gone).
- Naive and stable agree for modest b (no cancellation yet).
- Polynomial residual at the naive small root is large; at the stable small root it is ~ε.

## Rule of thumb (Trefethen Thm 15.1 / Higham)

A backward-stable algorithm on a problem with condition number κ satisfies

relative forward error = O(κ ε_machine).

In words: *exactly* the right answer to *nearly* the right question, stretched by κ.

"If the answer is highly sensitive to perturbations, you have probably asked the wrong question." (Trefethen & Bau)
