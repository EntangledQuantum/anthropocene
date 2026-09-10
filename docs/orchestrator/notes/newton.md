# Linearise, solve, repeat — research notes (Agent 24)

Kelley, *Iterative Methods for Linear and Nonlinear Equations* (SIAM, 1995),
ch. 5 (Newton, quadratic catch, basin); Deuflhard, *Newton Methods for
Nonlinear Problems* (Springer, 2011); Dennis & Schnabel, *Numerical Methods
for Unconstrained Optimization and Nonlinear Equations*; Ortega & Rheinboldt,
*Iterative Solution of Nonlinear Equations in Several Variables*; Dembo,
Eisenstat & Steihaug, *Inexact Newton methods*, SIAM J. Numer. Anal. 19
(1982); Knoll & Keyes, *Jacobian-free Newton–Krylov methods*, J. Comput.
Phys. 193 (2004); Trefethen & Bau, lecture context for the inner linear
solve. Curriculum B4.8: Picard / Newton / inexact Newton / JFNK /
continuation when the basin is tiny. The question: *did the linear solve
fail, or did Newton walk off a cliff?*

## Solvable chain

1. **Hook / confrontation.** $F(x)=\arctan x-1/2$. Unique real root,
   $F'>0$ everywhere. Start at $x_0=3$. Predict $|F|$ after eight Newton
   steps.
2. **Naive attempt.** Unique + $F'\ne 0$ ⇒ always catches. Or: residual
   slides linearly, like Jacobi. Or: the folklore 2-cycle.
3. **The world talks back.** Iterates fly (3 → −4.5 → 35 → thousands).
   Coupled lab: residual history and a basin strip. Cyan catches;
   magenta diverges. Drag $x_0$.
4. **Name the structure.** One step is $J(x)\delta=-F(x)$, then
   $x\leftarrow x+\delta$. Linearise, solve, repeat. Inner solve is CG
   when $J$ is SPD (link, do not re-teach).
5. **Tighten.** Sketch $\log_{10}|F|$ from a start inside: accelerating
   drop, then a roundoff floor. Hunt the right-hand basin edge (~2.05).
6. **Representation shift.** Estimate steps from $x_0=0.2$ to $10^{-12}$
   (four, not a dozen). Classify exploded-residual / inner-solve-stall /
   $\kappa(J)$ as basin vs linear solve vs conditioning.
7. **Near-transfer.** Picard ($J=I$) from $x_0=3$ *catches*, linearly.
   Same $F$, different operator, different basin. A bad Jacobian is not
   a worse step length.
8. **Optional edge.** Inexact Newton forcing term $\eta$; JFNK as
   $Jv\approx(F(x+\varepsilon v)-F(x))/\varepsilon$; continuation when
   the basin is a speck.
9. **Close.** Tomorrow picture: the basin; quadratic once you are in it;
   a bad Jacobian is a different operator.

## Structure the learner must feel

Newton is not a formula that finds roots. It is a map $x\mapsto x+\delta$
whose $\delta$ comes from a linear operator $J(x)$. That map has a basin.
Inside, error squares. Outside, the same map throws you to infinity.
$F'$ never zero does not make the basin the whole line.

Tomorrow picture: a cyan interval around the root, a magenta exterior,
and a residual that either cliffs to roundoff or flies.

## Most tempting wrong belief

**Unique root and $F'\ne 0$ means Newton always converges.** The
quadratic theorem is local. This $F$ is the counterexample you can
drag: $F'>0$ everywhere, one root, and $x_0=3$ diverges.

Secondary: **Newton residual drops at a constant rate**, the Jacobi
reflex transferred to a nonlinear residual.

Tertiary: **the Jacobian is a step length.** Picard ($J=I$) is a
different iteration: globally convergent here, only linear. Frozen or
inexact $J$ likewise.

Quaternary: **if it exploded, the linear solver failed.** On this $F$
the $1\times 1$ Jacobian at $x=3$ is $0.1$, perfectly inverted. Newton
left the basin.

Misconceptions: `newton-always-catches`, `newton-is-linear`,
`jacobian-is-a-scale`.

## Simplest useful case

1D, $F(x)=\arctan x-1/2$. Unique root $x^*=\tan\tfrac12$, $F''(x^*)\ne 0$
so the catch is genuinely quadratic (plain $\arctan$ is odd, hence
cubic). Basin $\approx(-1.17, 2.05)$. $x_0=0.2$ catches in four steps
to $10^{-12}$; $x_0=3$ diverges in four. Analytic ratio
$|r_{n+1}|/|r_n|^2\to\tan\tfrac12$.

2×2 transfer for the linear solve: $F(x,y)=(e^x+0.3y-1,\,0.3x+e^y-1)$,
root at the origin, $J(0,0)$ SPD so one Newton step is CG on
$J\delta=-F$. Tests only; the lesson drags the 1D basin.

## Transfer costume

Nonlinear Poisson, or a backward-Euler stage: the implicit residual is
$F(y)=y-y_n-hf(t_{n+1},y)$, and each time step is Newton on that $F$.
A start outside the basin is an implicit step that "exploded", which
people misread as stiffness. Same operator, different clothing.

## Numerics claims (tested)

- One Newton step: $J\delta+F=0$ (1D analytic $\delta=-F/F'$; 2D dense
  LU and CG agree).
- Near the root, $|r_{k+1}|/|r_k|^2$ matches $\tan\tfrac12$ to 5%.
- $x_0=0.2$ reaches $|F|<10^{-12}$ in 4 steps; drop accelerates.
- $x_0=3$ diverges; $|x|$ exceeds 1000 within four steps.
- Basin right edge $\in(2.0, 2.2)$; $x_0=2$ still catches.
- Picard from $x_0=3$ catches (different operator, not a bad $F$).
