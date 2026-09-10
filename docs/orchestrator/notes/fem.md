# Your first finite element — research notes (Agent 14)

Strang & Fix, *An Analysis of the Finite Element Method* (Wellesley-Cambridge);
Brenner & Scott, *The Mathematical Theory of Finite Element Methods* (Springer);
Hughes, *The Finite Element Method* (Dover); Langtangen, *Introduction to
numerical methods for variational problems* (FEM hats, assembly, 1D Poisson).

## Structure the learner must feel

Do not require −u″ = f at a point. Require the residual to be orthogonal to a
chosen test space. Piecewise-linear hats make that inner product a sparse
matrix you can see: each hat overlaps only its neighbours, so the global
stiffness is tridiagonal, assembled by dropping local 2×2s onto overlapping
index pairs. On a uniform mesh that matrix *is* the central-difference stencil.
On an irregular mesh the same variational statement still produces a matrix;
the FD reflex ("write (−1, 2, −1) and skip the fact that the neighbours
moved") does not.

Tomorrow picture: a hat; Galerkin as "orthogonal residual"; assembly as
overlapping local 2×2s.

## Tempting wrong belief

FEM is fancy finite differences. On any grid you keep writing the three-point
stencil and skip a neighbour that is not where you expected. False. The
stencil is a *consequence* of equal element lengths, not the method. Unequal
hats have unequal slopes; the assembled row is (−1/h_L, 1/h_L + 1/h_R, −1/h_R),
which is the inner product ∫ φᵢ′ φⱼ′, not a skipped neighbour.

Misconceptions: `fem-is-fancy-fd`, `residual-zero-everywhere`,
`weak-form-is-approximate`, `hats-are-isosceles`, `assembly-copy`.

## Simplest useful case

Two elements on [0, 1], nodes 0, ½, 1. One unknown. Each element matrix is
(1/h) [[1, −1], [−1, 1]] with h = ½, so [[2, −2], [−2, 2]]. They overlap at
the middle node: 2 + 2 = 4. For −u″ = 2 the load is ∫ 2 φ₁ = 1, so u(½) = ¼,
which is exact. Three numbers, one overlap, the whole method.

## Transfer costume

A taut string, or steady heat in a rod: the same −u″ = f, the same hats, the
same matrix. The clothing changes; the inner product does not. (Do not open
2D triangles or mixed methods.)

## Numerics claims (each gets a test)

1. Hats are cardinal (φᵢ(xⱼ) = δᵢⱼ) and form a partition of unity.
2. Element matrix is (1/h) [[1, −1], [−1, 1]]; assembly of those 2×2s is the
   global tridiagonal stiffness.
3. Uniform-mesh interior K equals (1/h) tridiag(−1, 2, −1), which is central
   FD for −u″ = f after multiplying the FD equation by h. For constant f the
   load is exact and the two methods produce the same nodal vector.
4. Interior K is SPD on uniform and irregular nodes (symmetric, Cholesky).
5. P1 Galerkin for 1D Poisson is nodally exact when the load is integrated
   exactly (Green's function at a node lives in the P1 space).
6. Irregular (Chebyshev-mapped) nodes still converge: L² error of the
   piecewise-linear field falls as ~h² under refinement. Naive uniform-stencil
   FD on the same nodes is *not* nodally exact and is worse in L².

## Solvable chain

1. Hook / confrontation — Predict: uniform mesh, hats vs central FD. Same matrix?
2. Naive attempt — they are the same, which feels like FEM was a waste.
3. World talks back — stretch the nodes; skip-a-neighbour FD leaves the parabola;
   the hats stay on the nodes.
4. Name the structure — weak form; Galerkin = residual ⊥ hats; assembly = 2×2s.
5. Tighten — SketchCurve an *asymmetric* hat. Predict the overlapping diagonal.
6. Representation shift — hat, matrix row, and solution are one state.
7. Near-transfer — Classify collocation / Galerkin / least squares / skip-neighbour
   by which inner product (or none) they declare small.
8. Optional edge — 1D nodal exactness is a gift of the Green's function; Tier.
9. Close — a hat; orthogonal residual; overlapping 2×2s.
