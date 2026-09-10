# The leftover wave lives on a coarser grid — research notes (Agent 22)

Briggs, Henson & McCormick, *A Multigrid Tutorial*, 2nd ed. (SIAM, 2000),
ch. 2–5 (smoothing, two-grid correction, V-cycle; full weighting as the
adjoint of linear interpolation; Galerkin A_c = R A P); Trottenberg,
Oosterlee & Schüller, *Multigrid* (Academic Press, 2001), §2.3–2.4
(two-grid operator E = S^{ν2}(I − P A_c^{−1} R A) S^{ν1}, h-independent
factor); Hackbusch, *Multi-Grid Methods and Applications*; Brandt (1977),
*Math. Comp.* 31; Yavneh, “Why Multigrid Methods Are So Efficient.”

## Solvable chain

1. **Hook / confrontation.** Same n = 31 Dirichlet Poisson as Jacobi.
   Five weighted sweeps left a sine. Predict: restrict that residual,
   solve on 15 points, prolong, add. What happens to the long wave?
2. **Naive attempt.** Fifteen points cannot resolve a 31-point sine.
   Or: the leftover is already smooth, so you are done. Or: a coarse
   grid is just cheaper Jacobi.
3. **The world talks back.** One two-grid cycle, the long wave is gone.
   Coupled views: fine error and the restricted residual. The coarse
   residual *is* that sine, well resolved.
4. **Name the structure.** Smooth → restrict r → solve A_c e_c = r_c →
   prolong → correct. R = (1/2) P^T (full weighting, linear
   interpolation). That pair is the whole of two-grid.
5. **Tighten.** Rank which stage kills which piece. Sketch log residual
   against V-cycle: it keeps falling, no Jacobi floor.
6. **Representation shift.** Skip the pre-smooth. High-k aliases onto
   the coarse grid; the correction is the wrong long wave. Smoothing
   is what makes the residual legal to coarsen.
7. **Near-transfer.** Residual drop of one cycle at n = 15 vs n = 63
   is essentially the same factor. Jacobi’s leftover rate is 1 − O(h²).
8. **Optional edge.** Nested two-grid *is* the V-cycle: the coarse
   Poisson is the same leftover-wave problem. n = 3 → one unknown.
   Helmholtz (indefinite) and AMG as costumes, not this lesson.
9. **Close.** High-k dies on the fine grid; low-k is a cheap coarse
   solve.

## Structure the learner must feel

After a few Jacobi sweeps the error is a long wave the stencil cannot
see. That wave is a cheap, well-resolved Poisson problem on a grid
twice as coarse. Restriction copies the residual there; an exact coarse
solve computes the wave; prolongation adds it back. Complementary
jobs: the smoother kills what the coarse grid would alias, the coarse
solve kills what the smoother cannot touch.

Tomorrow picture: high-k dies on the fine grid; low-k is a cheap
coarse solve.

## Most tempting wrong belief

**A coarser grid is a worse copy of the same problem, so it cannot
see the leftover sine.** The leftover is the one mode a coarse grid
is *for*. Sampling every other point of a k = 1 sine is a k = 1 sine.

Secondary: **skip smoothing, just restrict.** The mixed ripple
(k = 16) is in ker(R) — full weighting averages it to zero — so the
coarse solve never sees it and CGC leaves it. Nearby high modes
alias and get amplified. Smoothing is the job that kills those.

Tertiary: **a smooth residual means you are done** (from the Jacobi
lesson). Smooth is the shape of the leftover, not the size of the
error. CGC is what actually removes it.

Quaternary: **more grids is a different idea.** A V-cycle is two-grid
applied to the coarse problem. Recursion, not a new method.

Misconceptions: `coarse-too-crude`, `skip-smooth-ok`,
`smooth-means-solved` (owned by `smoothing`), `vcycle-is-new`.

## Simplest useful case

n = 3 interiors, n_c = 1. P maps a scalar c to (c/2, c, c/2). R is
full weighting, R = (1/2) P^T. Galerkin R A P equals the 1×1 coarse
Laplacian 2/H² = 8. The whole lesson, four numbers.

The lab uses n = 31 so the long wave is a shape, n_c = 15, matching
the Jacobi mixed start (k = 1 + k = 16). Homogeneous Poisson: the
field *is* the error.

## Transfer costume

A blurry photograph: local averaging kills grain (smoothing) and
leaves the lighting. You do not keep blurring. You downsample the
residual lighting, solve it on the small image, bilinear-upsample,
add. Same split, pixels not PDEs.

Helmholtz is the costume that breaks: the operator is indefinite, so
a local average is not a low-pass filter on the error, and the
coarse problem is not easier. That is a later lesson.

## Numerics claims (each gets a test)

- Linear interpolation P and full weighting R satisfy the Euclidean
  adjoint identity 2 ⟨R f, c⟩ = ⟨f, P c⟩, i.e. R = (1/2) P^T.
  Variationally they are adjoint in the discrete L² inner product
  (weights h vs 2h).
- Galerkin coarsening A_c = R A^h P equals the geometric coarse
  Laplacian A^{2h} on this 1D Dirichlet Poisson, for n = 2^k − 1.
- From the Jacobi mixed start, five weighted sweeps then one
  coarse-grid correction: |c_1| drops by more than 10×; five more
  Jacobi sweeps of the leftover barely move |c_1|.
- One two-grid cycle (ν₁ = 2, ν₂ = 1, ω = 2/3) reduces the error
  from a hashed start by a factor that stays O(1) from n = 15 to
  n = 63. The same number of Jacobi sweeps leaves a leftover whose
  remaining factor moves toward 1 like 1 − O(h²).
- Skip pre-smoothing on mixed: k = 16 is in ker(R) (full weighting
  of a 4-point wave is zero), so CGC never sees the ripple and
  leaves it. Nearby high modes (k = 24) alias and CGC amplifies
  them. Smoothing is the complementary job.
- Nested V-cycle (recurse until n = 1) is two-grid at every level;
  its residual drop is also weakly dependent on n.
