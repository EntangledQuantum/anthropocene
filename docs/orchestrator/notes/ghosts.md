# Ghosts — research notes (Agent 13)

## Solvable chain

1. **Hook / confrontation.** The centred 3-point stencil for $u''$ at the left wall of Poisson is missing a neighbour. Neumann wall, one-sided flux $(u_1-u_0)/h=\sigma$. Predict the global order.
2. **Naive attempt.** It is first order. Interior stencils staying second-order does not save the solve. GhostLab, naive Neumann, field vs exact.
3. **The world talks back.** Hunt the ghost value. Residual of the centred wall stencil on the exact field collapses only when $u_{-1}$ encodes the Neumann condition.
4. **Name the structure.** $u_{-1}=u_1-2h\sigma$. The ghost is the BC, written as a neighbour, so the interior stencil can stay.
5. **Tighten.** Sketch $\log$-$\log$ max-error vs $h$ for the one-sided wall. Slope 1, not 2.
6. **Representation shift.** Switch the wall to Dirichlet. The missing neighbour is sitting on the wall and is known — no fictitious point. Skipping it solves a different BVP.
7. **Near-transfer.** Classify how each wall is filled (skip / one-sided / ghost / wall-value). Estimate the naive/ghost error ratio at $n=32$. Insulated heat is Neumann with $\sigma=0$: $u_{-1}=u_1$. Do not re-teach CFL.
8. **Optional edge.** Method of lines: ghosts live in the spatial operator; time is an ODE. Gustafsson: ghost Neumann has $O(h)$ LTE at the wall and still $O(h^2)$ globally.
9. **Close.** The missing neighbour is a fictitious value that *is* the boundary condition.

## Structure the learner must feel

The interior stencil wants a neighbour on both sides. A wall does not have one. Two answers: become a different (one-sided) animal, or invent a fictitious sample whose value *is* the boundary condition. Only the second keeps the order.

## Most tempting wrong belief

**One first-order equation at the wall cannot spoil a second-order grid.** (Global max-error follows the worst node. Naive one-sided Neumann is first-order globally.)

Secondary: **a ghost is a real sample just outside.** (Nothing is measured at $x=-h$. The number is the BC.)

Tertiary: **if a neighbour is missing, drop that arm.** (That throws away the boundary data. Dirichlet's missing neighbour *is* the wall value.)

## Simplest useful case

1D Poisson $u''=e^x$ on $[0,1]$, node-centered, $x_i=ih$, $i=0..n$, $h=1/n$. Right wall Dirichlet $u(1)=e$. Left wall either Dirichlet $u(0)=1$ or Neumann $u'(0)=1$.

- Ghost Neumann: $u_{-1}=u_1-2h\sigma$ into $(u_{-1}-2u_0+u_1)/h^2=f_0$. Observed order $2$.
- Naive Neumann: $(u_1-u_0)/h=\sigma$ as the wall equation. Observed order $1$.
- Dirichlet: $u_0=\alpha$ is the missing neighbour of $i=1$. Observed order $2$. Skipping it ($u_0=0$) is the wrong BVP.

## Transfer costume

Heat at an insulated wall: Neumann $\sigma=0$, so $u_{-1}=u_1$ (even reflection). Same ghost, different physics. Time-step limits belong to [When the grid explodes](../../../../content/paths/computational-physics/06-fields-and-continua/02-cfl.mdx); this lesson does not re-teach them.

## Numerics claims (need tests)

- Ghost Neumann on $e^x$: observed order $\approx 2$. Naive one-sided Neumann: observed order $\approx 1$. At $n=32$, naive max-error is $\sim 70\times$ the ghost error.
- Dirichlet with the wall value: order $2$. Skipping the wall value does not converge (error stays $1$ for $u=e^x$).
- The discrete Neumann ghost $u_1-2h\sigma$ sits close to the analytic extension $e^{-h}$. A wrong ghost leaves a huge wall residual on the exact field.

## Sources

- R. J. LeVeque, *Finite Difference Methods for Ordinary and Partial Differential Equations* (SIAM, 2007), ch. 2 and §2.12. Ghost-point Neumann; centred $(U_1-U_{-1})/(2h)=\sigma$.
- J. C. Strikwerda, *Finite Difference Schemes and Partial Differential Equations*, ch. 3. One-sided vs ghost at boundaries.
- B. Gustafsson (1975), “The convergence rate for difference approximations to mixed initial boundary value problems,” *Math. Comp.* **29**:396–406. Boundary accuracy may be one order lower than interior for IVPs; Poisson is less forgiving of a *naive* one-sided wall, while the ghost still yields global order 2.
- M. C. Pugh, MAT1062 notes (2009). Ghost points $U_{-1}$, $U_{N+1}$ as artifices to keep $u_{xx}$ at the endpoints.
