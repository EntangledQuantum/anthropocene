# A fake inverse that clusters the spectrum — research notes (Agent 21)

Trefethen & Bau, *Numerical Linear Algebra*, Lecture 40; Saad, *Iterative
Methods for Sparse Linear Systems*, ch. 10; Barrett et al., *Templates for
the Solution of Linear Systems*, §3; Hestenes & Stiefel PCG form as in
Shewchuk. SSOR splitting
$M = \frac{1}{\omega(2-\omega)}(D+\omega L)D^{-1}(D+\omega U)$.

On constant-coefficient Poisson, diagonal scaling does not change κ
(Gershgorin / obvious: $D = (2/h^2)I$). SSOR with the 1D-Poisson SOR
optimum $\omega = 2/(1+\sin(\pi/(n+1)))$ does.

## Solvable chain

1. **Hook / confrontation.** Same $n=16$ Dirichlet Poisson. CG finished
   at $k=n$. Predict what 8 steps of Jacobi-PCG (left-multiply by $D^{-1}$)
   do to the residual.
2. **Naive attempt.** Any fake inverse helps; the diagonal is the stiff
   part; or Jacobi-the-smoother already inverted the high modes.
3. **The world talks back.** Overlay: Jacobi-PCG sits on CG. Spectra
   identical. $\kappa(D^{-1}A)=\kappa(A)\approx 116$. $D$ is a scale.
4. **Name the structure.** $M$ is a cheap fake inverse. You want the
   *spectrum of $M^{-1}A$ bunched*, not $M=A^{-1}$ and not a smoother.
   Krylov did not change; the operator did. PCG is CG with $z=M^{-1}r$.
5. **Tighten.** Switch to SSOR. Magenta eigenvalues pile near 0.3;
   $\kappa$ drops to ~6. Sketch the residual: floor by $k=8$, not $k=n$.
6. **Representation shift.** Rank leftover residual after 8 steps
   (SSOR-PCG / CG / Jacobi sweeps). Estimate steps to $10^{-8}$. Hunt
   $\omega$ that minimises $\kappa(M^{-1}A)$.
7. **Near-transfer.** Classify Jacobi $M$, SSOR $M$, and Krylov by what
   each actually is. The algorithm is $M^{-1}A$; Krylov is the accelerator.
8. **Optional edge.** Left / right / split; ILU(0) is exact on this
   tridiagonal $A$ (costume too kind); Jacobi wakes up when $D$ varies;
   multigrid as $M$ is next.
9. **Close.** Tomorrow picture: Krylov is an accelerator; the algorithm
   is $M^{-1}A$.

## Structure the learner must feel

A preconditioner is an *operator* $M\approx A$, cheap to apply, whose
inverse bunches the eigenvalues of $M^{-1}A$. CG then runs unchanged on
that operator. On this Laplacian the cheapest $M$ (the diagonal) is a
scale and does nothing — that is the confrontation. SSOR (forward sweep,
diagonal, backward sweep) is the $M$ that actually bunches.

Tomorrow picture: the spectrum of $A$ spread out, the spectrum of
$M^{-1}A$ in a clump, and CG finishing because of the clump, not because
Krylov got smarter.

## Most tempting wrong belief

**The diagonal of $A$ is already a good fake inverse; any $M$ helps.**
On constant-coefficient Poisson $D=(2/h^2)I$, so Jacobi-PCG is CG.

Secondary: **a smoother is a preconditioner.** Jacobi-the-smoother kills
high-$k$ and leaves the long wave. $A^{-1}$ is large on the long wave.
Opposite jobs.

Tertiary: **CG is the solver; $M$ is optional speedup / a different
method.** Krylov is the accelerator. The algorithm is $M^{-1}A$.

Quaternary: **$M$ has to be $A^{-1}$ or it does not help.** Clustering,
not exactness. ILU(0) happens to be exact on this 1D tridiagonal — a
costume the problem is too kind to give you.

Misconceptions: `jacobi-always-preconditions`, `smoother-is-preconditioner`,
`krylov-is-the-algorithm`, `need-exact-M`.

## Simplest useful case

Dirichlet Laplacian, $n=16$, mixed load (same as the Krylov lesson).
Point Jacobi $M=D$ vs SSOR $M$ with $\omega=2/(1+\sin(\pi/17))\approx 1.69$.
Spectrum overlay and residual overlay, one state.

$n=2$ is too small: CG is done in two steps either way. The clustering
payoff needs $k\ll n$.

## Transfer costume

Heat in a two-material rod: now $D$ varies across the jump and Jacobi
suddenly *does* change $\kappa$. Same idea, different clothing. Mentioned
in the advanced tier; the live lab stays on the constant-coefficient
Poisson so the no-op is visible.

## Numerics claims (each gets a test)

- On this Dirichlet Laplacian, $\kappa(D^{-1}A)=\kappa(A)$ (Jacobi is a
  scale). Measured: $n=16$, both $\approx 116.46$.
- $\kappa(M_{\mathrm{SSOR}}^{-1}A)<\kappa(A)$. Measured: $n=16$,
  $\kappa\approx 5.75$ vs $116$; $n=8$, $3.21$ vs $32$; $n=31$, $10.5$ vs $414$.
- Jacobi-PCG residual history matches CG (scale invariance of PCG).
- SSOR-PCG reaches $\|r\|_2\le 10^{-8}$ in fewer steps than CG.
  Measured: $n=16$ mixed load, PCG at $k=7$, CG at $k=16$.
- At every $k\ge 1$ on $n=16$, SSOR-PCG residual is below CG.
- SSOR $\omega$ that minimises $\kappa$ sits near the SOR optimum
  $2/(1+\sin(\pi/(n+1)))$.
- $M^{-1}M=I$ for both operators; SSOR $M$ is SPD for $\omega\in(0,2)$.
