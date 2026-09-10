# When A is not SPD — research notes (Agent 26)

Saad & Schultz, *GMRES: a generalized minimal residual algorithm for
solving nonsymmetric linear systems*, SIAM J. Sci. Stat. Comput. 7
(1986); Saad, *Iterative Methods for Sparse Linear Systems*, ch. 6
(Arnoldi, GMRES, restart); Trefethen & Bau, Lecture 35; Greenbaum,
*Iterative Methods for Solving Linear Systems*. Curriculum B4.4:
GMRES / FGMRES — nonsymmetric; restart. The question: *if GMRES
residual stalls, is A bad, the preconditioner bad, or the physics
singular?*

CG (previous lesson) minimises $\|e\|_A$ over $K_k$ with a short
recurrence that needs $A$ SPD. This lesson does not re-teach that.
QR of the Hessenberg is a link to the Householder lesson, not a
second QR lecture.

## Solvable chain

1. **Hook / confrontation.** Same 16-unknown Dirichlet Poisson CG
   just finished in 16 steps. Add wind: $-u''+c u'$. Predict the
   residual after 16 steps.
2. **Naive attempt.** CG still finishes ($K_n=\mathbb{R}^n$);
   or GMRES needs $A^T$; or both drop because "GMRES is CG".
3. **The world talks back.** Overlay: CG residual *climbs*; full
   GMRES cliffs to roundoff at $k=n$. Drag $c\to 0$ and both crash.
4. **Name the structure.** Same $K_k$. GMRES picks
   $\arg\min\|b-Ax\|_2$. Arnoldi + QR of a tiny Hessenberg.
5. **Tighten.** Sketch $\log_{10}\|r\|_2$ — monotone plateau then
   cliff, not CG's climb. Rank storage at $k=12$.
6. **Representation shift.** Hessenberg grows by one column per
   step. That column *is* the RAM.
7. **Near-transfer.** Hunt restart $m$ until $\|r\|_{16}<10^{-5}$
   ($m=11$). Estimate vectors stored after 40 steps of GMRES(4)
   (four, not forty). Classify CG vs GMRES.
8. **Optional edge.** Givens $|g_{k+1}|=\|r\|$ without forming $x$;
   positive-real vs SPD; $90^\circ$ rotation explodes CG; stall
   diagnosis.
9. **Close.** Tomorrow picture: $\min\|r\|_2$ over $K_k$; store the
   whole basis; restart trades optimality for RAM.

## Structure the learner must feel

CG's gift was conjugacy: two vectors, a three-term recurrence, exact
in $n$ steps — and it required an $A$-inner product. Take symmetry
away and that gift is a bug: the same loop climbs. GMRES stays in
the Krylov plane and minimises the quantity that still makes sense,
$\|r\|_2$. The Hessenberg growing on the page *is* the cost.

Tomorrow picture: a cyan residual that cliffs, a magenta residual
that climbs, and a Hessenberg that grows until you throw it away.

## Most tempting wrong belief

**CG still finishes in $n$ steps; symmetry was never the point.**
Finite termination is about $K_n=\mathbb{R}^n$, which GMRES uses.
CG's *short recurrence* is what needed SPD. On this convection–
diffusion the residual grows.

Secondary: **a nonsymmetric method needs $A^T$.** That is BiCG.
GMRES never applies $A^T$.

Tertiary: **GMRES is CG for nonsymmetric $A$, same energy.**
Different objective. $\|e\|_A$ is not a norm.

Quaternary: **restart keeps the same minimiser and just saves RAM.**
Each restart starts a new plane. Residual can stall.

Misconceptions: `cg-works-anyway`, `gmres-needs-at`,
`gmres-min-energy`, `restart-keeps-optimality`.

## Simplest useful case

1D convection–diffusion $-u''+c u'$ on the Dirichlet grid, $n=16$,
same mixed load as the Krylov lesson. $c=0$ is that SPD Poisson.
$c=48$ (cell Péclet $\approx 1.4$): CG $\|r\|_{16}\approx 164$
(grows from $1.76$); full GMRES $\|r\|_{16}\sim 10^{-15}$.

2×2 transfer: $A=R(\pi/2)\mathrm{diag}(2,1/2)$. Two CG steps send
$\|r\|$ to $10^{16}$; GMRES is exact at $k=2$. Tests, and the
advanced tier.

## Transfer costume

Heat in a rod with wind, or a linearised advection–diffusion Jacobian
inside Newton. The costume changes; $A$ is still not SPD; the
Euclidean residual is still the quantity you can minimise over $K_k$.
Do not open FGMRES, BiCGStab, or a 2D operator.

## Numerics claims (tested)

- Wind $=0$ convection matches the Dirichlet Laplacian stencil.
- Wind $\ne 0$ is nonsymmetric, not SPD; symmetric part is still SPD.
- Full GMRES $\|r\|_2$ is monotone; at $k=n$ it is roundoff.
- Givens residual equals $\|b-Ax\|_2$.
- Restarted residual is monotone and $\ge$ full GMRES at the same $k$.
- On SPD, GMRES Euclidean residual $\le$ CG at each $k$; at $k=n$
  both sit at roundoff (they match).
- On $n=16$ convection, CG residual at $k=n$ is still large; GMRES
  is not.
- 2×2 rotation: CG residual explodes; GMRES finishes in 2 steps.
- $V$ orthonormal; $AV\approx V_+ \bar H$; $\bar H$ is upper
  Hessenberg.
- Hessenberg least squares matches Householder QR from `qr.ts`.
- $r_k \perp A K_k$.
- Full GMRES stores $k$ vectors at step $k$; GMRES($m$) stores
  $\le m$. After 40 steps of GMRES(4), stored $=4$.
- Restart $m$ needed for $\|r\|_{16}\le 10^{-5}$ is $11$, near $n$,
  not $4$.
