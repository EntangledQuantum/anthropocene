# The residual's own subspace — research notes (Agent 20)

Hestenes & Stiefel, *Methods of conjugate gradients for solving linear
systems*, J. Research NBS 49 (1952); Shewchuk, *An Introduction to the
Conjugate Gradient Method Without the Agonizing Pain* (CMU-CS-94-125);
Trefethen & Bau, *Numerical Linear Algebra*, Lectures 33 and 38; Saad,
*Iterative Methods for Sparse Linear Systems*, ch. 6.

## Solvable chain

1. **Hook / confrontation.** Same 1D Dirichlet Poisson. Jacobi has been
   sweeping. After a dozen iterations the residual has barely moved.
   Predict what twelve CG steps do to the same residual.
2. **Naive attempt.** Treat CG as a slightly smarter Jacobi, or as
   gradient descent on the energy — so a similar linear drop, maybe a
   bit steeper.
3. **The world talks back.** Overlay: Jacobi crawls; CG has already
   crashed toward roundoff. Same matvecs. No $A^{-1}$.
4. **Name the structure.** $K_k = \mathrm{span}\{r, Ar, A^2 r, \ldots,
   A^{k-1}r\}$ — everything matvecs can tell you from one residual.
   CG picks the $A$-best point in $x_0 + K_k$.
5. **Tighten.** 2D Krylov plane: the next residual is Euclidean-orthogonal
   to the previous; the search directions are $A$-orthogonal. That is
   why it is not gradient descent (steepest descent only orthogonalizes
   against the last residual, so it retraces).
6. **Representation shift.** Sketch $\log_{10}\|r\|$ against iteration.
   The shape is a crash to a floor at $k = n$, not Jacobi's shallow line.
7. **Near-transfer.** Hunt the $k$ where CG on $n = 8$ hits $10^{-10}$
   (finite termination). Estimate how many Jacobi sweeps match eight CG
   steps. Classify Jacobi / steepest descent / CG by what they actually
   orthogonalize.
8. **Optional edge.** Rate $2((\sqrt{\kappa}-1)/(\sqrt{\kappa}+1))^k$,
   clustering, why we stop before GMRES / preconditioners.
9. **Close.** Tomorrow picture: $K_k = \mathrm{span}\{r, Ar, \ldots\}$;
   CG picks the $A$-best residual in that plane.

## Structure the learner must feel

A matvec $v \mapsto Av$ is the only access to $A$. After $k$ of them,
starting from $r$, the only subspace you have earned is $K_k$. CG does
not walk downhill in the Euclidean residual; it takes the point in
$x_0 + K_k$ that minimises the $A$-norm of the error. Successive
residuals are orthogonal, successive search directions are $A$-orthogonal,
and in $n$ dimensions that plane becomes the whole space — so CG is
exact in $n$ steps.

Tomorrow picture: the Krylov plane, and the next residual standing
perpendicular to the last one.

## Most tempting wrong belief

**CG is gradient descent (steepest descent) on the energy.** Consecutive
SD residuals *are* orthogonal, from the line search. CG's residuals are
orthogonal to the *whole* Krylov space so far, and its search directions
are $A$-orthogonal, so it never undoes a previous step.

Secondary: **solving $Au=b$ means forming $A^{-1}$.** Both Jacobi and CG
need only matvecs. The operator lesson already made $A$ a stencil.

Tertiary: **iterative means never exact.** On an $n\times n$ SPD problem,
CG in exact arithmetic terminates at step $n$.

Quaternary: **enough Jacobi sweeps will catch CG.** Jacobi is linear with
rate $\cos(\pi/(n+1))$; CG is a growing optimal polynomial. They are not
the same slope with a different constant.

Misconceptions: `cg-is-gradient-descent`, `need-the-inverse`,
`iterative-never-exact`, `jacobi-will-catch-up`.

## Simplest useful case

Dirichlet Laplacian, $n = 2$, mixed load so $r_0$ is not an eigenvector
(a constant load *is* the low mode, and then $K_1$ is already the whole
story). Energy ellipses in $(x_0,x_1)$; CG reaches the centre in two
steps; steepest descent zigzags; Jacobi crawls with rate $1/2$.

Same operator at $n = 16$ for the residual overlay.

## Transfer costume

Heat in a rod, or a chain of springs: same $-u''$, same SPD $A$, same
Krylov plane. The costume changes; the residual still lives in
$\mathrm{span}\{r, Ar, \ldots\}$. Do not open GMRES (nonsymmetric, long
recurrence) or preconditioners (a cheap fake inverse). Those are later.

## Numerics claims (each gets a test)

- On this SPD Dirichlet Laplacian, CG residual after $k$ steps is
  smaller than Jacobi (and than steepest descent) at the same $k$.
- Successive CG residuals are orthogonal: $r_i^\top r_j = 0$ for $i \ne j$.
- Successive search directions are $A$-orthogonal: $p_i^\top A p_j = 0$.
- Equivalently, the error is $A$-orthogonal to $K_k$: $r_k \perp K_k$.
- Exact in $n$ steps on an $n$-dimensional SPD problem (tiny $n$):
  $\|r_n\| / \|r_0\|$ at roundoff.
- $K_k = \mathrm{span}\{r_0, Ar_0, \ldots, A^{k-1}r_0\}$ contains $x_k$
  when $x_0 = 0$.
- First CG step equals steepest descent; later steps do not.
