# Smoothing is not solving — research notes (Agent 19)

Briggs, Henson & McCormick, *A Multigrid Tutorial*, 2nd ed. (SIAM, 2000),
ch. 2 (weighted Jacobi, ω = 2/3, mixed-mode experiment k = 2 and k = 16);
Trottenberg, Oosterlee & Schüller, *Multigrid* (Academic Press, 2001), §2.1
(smoothing factor vs spectral radius); Saad, *Iterative Methods for Sparse
Linear Systems* (SIAM), ch. 4 (splitting A = M − N, Jacobi / Gauss–Seidel);
Young, *Iterative Solution of Large Linear Systems*; Strang, *Computational
Science and Engineering*, §6.2–6.3 (ρ = cos(π/(n+1)), GS squares it);
Hackbusch, *Multi-Grid Methods and Applications*.

## Solvable chain

1. **Hook / confrontation.** n = 31 Dirichlet Poisson, Au = 0, so the field
   *is* the error. Start from a long wave plus a ripple. Predict the field
   after five Jacobi sweeps.
2. **Naive attempt.** Mean-value property → one average should land on the
   harmonic function. Or: every mode shrinks together. Or: high-k is stiff,
   so the ripple survives.
3. **The world talks back.** Ripple gone, long wave almost full size.
   Spectrum: k = 16 bar collapses, k = 1 bar barely moves. Residual looks
   smooth and then stalls.
4. **Name the structure.** Jacobi replaces each unknown by a weighted
   neighbour average. Eigenvalues μ_k = 1 − 2ω sin²(kπ / (2(n+1))). High-k
   |μ| is small; μ_1 ≈ 1.
5. **Tighten.** Sketch ‖r‖ vs sweep (crash, then a floor). Rank modes by
   what remains after five sweeps. Estimate how many undamped Jacobi
   sweeps cut the long wave by 10× (hundreds, not dozens).
6. **Representation shift.** Same iteration, now |μ_k| against k. Hunt ω
   that flattens the high-k band: ω = 2/3, smoothing factor 1/3. Undamped
   ω = 1 leaves the Nyquist mode.
7. **Near-transfer.** Gauss–Seidel uses the neighbour you just wrote. Same
   leftover long wave, tighter beat (ρ_GS = ρ_J²). Not a second method to
   learn — a faster smoother.
8. **Optional edge.** ρ = cos(π/(n+1)) → 1 as n grows, so Jacobi as a
   *solver* costs O(n²) iterations. The stall *is* the coarse-grid
   correction, later. Heat / blur costume: more averaging cannot restore
   the long wave.
9. **Close.** High-k dies, low-k lives. That picture is why we smooth,
   then coarsen.

## Structure the learner must feel

Jacobi is a low-pass filter on the error, not a solver. After a few sweeps
the field is a long wave; the residual is that wave, small, and then it
stops moving. The spectrum makes the filter visible: high-k bars collapse,
the k = 1 bar stays.

Tomorrow picture: high-k dies, low-k lives. The stall is the coarse grid.

## Most tempting wrong belief

**Enough Jacobi sweeps will solve Poisson.** More iteration is more
accuracy, uniformly. The mean-value property makes this worse: harmonic
functions *are* neighbour averages, so one sweep “should” be the answer.
It is the fixed point, not the first iterate.

Secondary: **a smooth residual means you are done.** Smooth is not small
in the error — A maps a long wave to a small residual. The error can still
be O(1).

Tertiary: **ω = 1 is the honest step; weighting is a hack.** Undamped
Jacobi has |μ| ≈ 1 at *both* ends of the spectrum. ω = 2/3 is what makes
every high-k mode die (smoothing factor 1/3).

Quaternary: **Gauss–Seidel is a different idea.** It is the same average,
using the neighbour you just updated. Tighter beat, same leftover wave.

Misconceptions: `one-average-solves`, `more-sweeps-solves`,
`smooth-means-solved`, `undamped-is-better`.

## Simplest useful case

n = 3 interior Dirichlet nodes. Modes k = 1, 2, 3 have Jacobi factors
cos(π/4), 0, −cos(π/4). The middle mode dies in one sweep; the long wave
remains. The lab uses n = 31 so the long wave is visible as a shape, with
k = 1 and k = 16 (Nyquist/2) as the mixed pair.

Homogeneous Poisson Au = 0: the iterate *is* the error. Residual r = −Au.

## Transfer costume

A single Jacobi sweep is a local blur. Blurring a photograph kills film
grain and leaves the lighting. More blur does not restore the lighting
to a known answer — it just keeps flattening. Heat on a rod: high-k
decays first; the first sine mode is the leftover. Same filter, different
clothing.

Do not re-teach sparsity or the stencil. Link
`linear-algebra/operators/matrix-as-operator`. A is applyLaplacian.

## Numerics claims (each gets a test)

- Dirichlet sine modes are Jacobi eigenvectors. One sweep of a pure mode
  k scales it by μ_k = 1 − 2ω sin²(kπ / (2(n+1))).
- Undamped Jacobi spectral radius on this A is cos(π/(n+1)).
- Weighted Jacobi ω = 2/3: every mode with k ≥ n/2 has |μ_k| ≤ 1/3
  (smoothing factor 1/3, independent of h).
- Mixed k = 1 + k = 16, five sweeps of ω = 2/3: high-mode coefficient
  drops by more than 100×; low-mode stays above 95%. After 50 sweeps the
  low mode is still O(1).
- Gauss–Seidel spectral radius is cos²(π/(n+1)) (power iteration). On the
  same mixed start, five GS sweeps leave a smaller leftover than Jacobi
  and the same smooth shape.
- Sweep matches the matrix form u ← u + ω D⁻¹(f − Au) with D = (2/h²)I.
  Residual is f − applyLaplacian(u).
