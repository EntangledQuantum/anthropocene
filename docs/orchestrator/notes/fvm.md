# Finite volume — research notes (Agent 17)

## Solvable chain

1. **Hook.** Two cells on a ring. One shared face, one number written into both updates. Predict: after hundreds of steps, has the sum of the two cell averages moved?
2. **Naive attempt.** Tempting: the PDE has to conserve, or dissipation eats mass, or CFL violation breaks the books. All three miss that the cancellation is algebraic.
3. **The world talks back.** Cell-average bars, a two-cell zoom of the highlighted face, and $M/M_0$ along the bottom. Leaving equals entering. The running total is a ruler.
4. **Name the structure.** $Q_i^{n+1} = Q_i^n - (\Delta t/\Delta x)(F_{i+1/2}-F_{i-1/2})$. Interior fluxes telescope. Periodic: the sum is an identity of the discrete map, not a hope about the PDE.
5. **Tighten.** On a uniform line, Rusanov for linear advection *is* first-order upwind. Same numbers as the CFL lesson; different meaning. Link CFL, do not re-teach it. Stay at $\nu = 0.4$.
6. **Representation shift.** Sketch $M/M_0$ for conservative Burgers on a jump. The shape to commit to is a flat line at 1, not a gentle numerical leak.
7. **Near-transfer.** Chain-rule Burgers $u_t + u u_x = 0$, discretized as $Q_i \leftarrow Q_i - \lambda Q_i (Q_i - Q_{i-1})$. No shared flux. Toggle: the two face numbers split, the jump freezes, the total walks off 1. Linear advection does not leak — constant $a(u)$ makes chain-rule identical to conservative upwind.
8. **Optional edge.** Rankine–Hugoniot $s = [f]/[u] = 1/2$ for Burgers $1|0$. Lax–Wendroff (1960): if a conservative consistent scheme converges, the limit is a weak solution. Hou–LeFloch (1994): non-conservative schemes converge to the wrong jump. Conservation is not stability — CFL $= 1.3$ still telescopes until overflow.
9. **Close.** One flux per face, used twice. Riemann solvers and WENO pick $F$; the telescoping does not care which $F$ you picked.

## Structure the learner must feel

The flux leaving this cell is the flux entering the next, because it is the same number. Then every interior face cancels in the global sum. Conservation is a property of the discrete map.

Cell averages, not point samples. Faces, not derivative stencils. Cartesian first-order upwind happens to be both; nonlinear flux, or a jump, is where the coincidence ends.

## Most tempting wrong belief

**If the PDE conserves, any consistent discretisation conserves.** (The chain rule says $u u_x = (u^2/2)_x$ for smooth $u$. A jump is not smooth. Discrete conservation is one flux per face, used twice.)

Secondary: **numerical dissipation destroys mass.** (Smearing rearranges the profile. The integral holds if the faces cancel.)

Tertiary: **conservation is stability.** (Telescoping does not ask CFL.)

Quaternary: **finite volume is finite difference with extra words.** (Same stencil on a uniform line. Different unknown, and a promise the FD form stops keeping once $f$ is nonlinear.)

## Simplest useful case

Two periodic cells, then $N$ cells on the unit interval.

- Conservative Rusanov / local Lax–Friedrichs on $u_t + f(u)_x = 0$, $f(u) = c u$ or $f(u) = u^2/2$. No Riemann solver.
- Non-conservative chain-rule upwind: $Q_i \leftarrow Q_i - \lambda a(Q_i)\, \Delta^- Q$ with $a = f'(u)$.
- Jump $1|0$ and a Gaussian pulse. CFL $\nu = 0.4$.

## Transfer costume

Inviscid Burgers versus linear advection, same stencil family. Linear: chain-rule *is* conservation form. Nonlinear + a jump: the books leak and the shock sits still. Rankine–Hugoniot is the same identity at a discontinuity.

## Numerics claims (need tests)

- Conservative Rusanov: $\sum Q$ conserved to roundoff for advection and Burgers, pulse and jump, including the two-cell ring.
- Face mismatch is identically zero in conservation form; $O(1)$ at a Burgers jump under chain-rule.
- Chain-rule linear advection does not leak (it *is* upwind).
- Chain-rule Burgers jump leaks by a visible fraction ($\sim 50\%$ by $t = 0.5$ on 64 cells, $\nu = 0.4$).
- A still-smooth low-amplitude sine leaks $\ll$ a jump of comparable mass.
- Rankine–Hugoniot for Burgers $1|0$ is $s = 1/2$. Conservative Rusanov matches it; chain-rule leaves the jump at speed $\approx 0$.
- Conservation form past CFL 1 still conserves while the field stays finite.

## Sources

- R. J. LeVeque, *Finite Volume Methods for Hyperbolic Problems* (Cambridge, 2002), ch. 4. Cell averages, conservation form, telescoping, Lax–Wendroff.
- P. D. Lax and B. Wendroff, “Systems of conservation laws,” *Comm. Pure Appl. Math.* **13** (1960) 217–237. Conservative + consistent + convergent $\Rightarrow$ weak solution.
- T. Y. Hou and P. G. LeFloch, “Why nonconservative schemes converge to wrong solutions: error analysis,” *Math. Comp.* **62** (1994) 497–530. Measure source at the shock; wrong shock speed.
- C. Hirsch, *Numerical Computation of Internal and External Flows*, vol. 1. Telescoping property of the conservative flux form (Roache 1972).
- R. J. LeVeque, *Numerical Methods for Conservation Laws* (Birkhäuser, 1992), ch. 12. Discrete conservation as an identity; why isolated shocks travel at the right speed.
