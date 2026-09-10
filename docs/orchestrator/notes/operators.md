# A matrix is a discrete operator — research notes (Agent 18)

Trefethen & Bau, *Numerical Linear Algebra* (SIAM), Lectures 1–2 (a matrix
as a linear map; matrix-vector multiplication as the operator); LeVeque,
*Finite Difference Methods for Ordinary and Partial Differential Equations*
(SIAM, 2007), ch. 2 (1D Poisson, tridiagonal Laplacian, sparsity from the
stencil); Saad, *Iterative Methods for Sparse Linear Systems* (SIAM), ch. 3
(sparsity patterns of PDE matrices). Strang, *Computational Science and
Engineering*: $A$ is a discrete differential operator.

## Solvable chain

1. **Hook / confrontation.** Five interior nodes, three-point stencil for
   $-u''$, Poisson is $Au=f$, $A$ is $5\times 5$. Predict nnz.
2. **Naive attempt.** Count $n^2 = 25$, or $3n = 15$, or the diagonal only.
3. **The world talks back.** Spy of $A$: three bands, nnz $= 3n-2 = 13$.
   Click a row: it reads three samples of $u$. $A e_i$ *is* the stencil.
4. **Name the structure.** The loop `out[i] = (2u[i]−u[i−1]−u[i+1])/h²` is
   the matrix. There is no table behind it.
5. **Tighten.** Dirichlet constant is not in the kernel — walls pull the
   ends. Estimate nnz at $n=200$. Rank stencil / sparse / dense storage.
6. **Representation shift.** Same numbers as a dense table. Grow $n$: the
   table becomes a wall of zeros; the spy still says three bands.
7. **Near-transfer.** Periodic wrap: two corner nonzeros, $A\mathbf{1}=0$.
   Classify local stencil vs global mix (Hilbert, Gaussian, 2D five-point).
8. **Optional edge.** Dirichlet spectrum $\lambda_k = 4(n+1)^2\sin^2(\cdots)$,
   sine mode, 2D spy bands from numbering, kernel as a physical mode. $\kappa$
   is linked, not re-taught.
9. **Close.** $A$ is a stencil, not a spreadsheet. Sparsity is the method.

## Structure the learner must feel

The 1D Laplacian stencil *is* $A$. A spy plot makes the bands a shape; a
dense table of the same numbers hides them. Applying $A$ to a vector is
applying the stencil; applying $A$ to a spike *is* the stencil. Zeros are
"this unknown does not see that unknown," not missing data.

Tomorrow picture: three bands on a spy. Sparsity is locality.

## Most tempting wrong belief

**A matrix is a dense spreadsheet of $n^2$ independent numbers.** (The table
reflex. Counting slots, storing $n^2$, reading the method off printed zeros.)

Secondary: **matrix-vector multiply mixes everyone into everyone.** (True of
a dense row. False of a stencil.)

Tertiary: **zeros are a storage optimisation.** (The zeros are structural.
nnz $= 3n-2$ *is* the operator.)

Quaternary: **the Laplacian is always invertible.** (Periodic / Neumann:
constants in the kernel. Dirichlet is what makes it SPD.)

Misconceptions: `matrix-is-a-table`, `apply-mixes-everything`,
`sparsity-is-optimization`, `no-bc-still-spd`.

## Simplest useful case

$n=5$ interior Dirichlet nodes, $h=1/6$.

$$
A = \frac{1}{h^2}\mathrm{tridiag}(-1,2,-1), \qquad \mathrm{nnz}=13=3\cdot5-2.
$$

Row 0 sees only columns 0 and 1. A constant interior vector has $Au$ equal
to $1/h^2$ at both ends and $0$ in the interior — the walls, not diffusion.

## Transfer costume

Heat in a rod, or a chain of springs: same $-u''$, same tridiagonal. Periodic
identification of the ends: two spy corners, singular $A$. 2D five-point:
still local, spy bands from the numbering. Graph Laplacian of a path: the
same stencil without $1/h^2$.

Do not re-teach $\kappa$. Link
`computational-physics/numerical-reality/conditioning-vs-stability`.
For this $A$, $\kappa\sim 1/h^2$ is a property of the Poisson problem.

## Numerics claims (each gets a test)

1. Dirichlet nnz $= 3n-2$ ($n=1$: $1$). Periodic nnz $= 3n$ for $n\ge 3$,
   with wrap-around corners nonzero.
2. COO product and dense $Au$ equal the three-point stencil loop.
3. $A e_i$ is column $i$, which is the stencil $(−1,2,−1)/h^2$.
4. Dirichlet $A$ is SPD (symmetric, Cholesky). Periodic $A$ is symmetric
   but singular: $A\mathbf{1}=0$.
5. Dirichlet constants are not in the kernel: end spikes $1/h^2$.
6. Closed-form Dirichlet eigenvalues sum to the trace. Sine-mode Rayleigh
   quotient approaches $\pi^2$.
