# From particles to fields — research notes (Agent 11)

LeVeque, *Finite Difference Methods for ODEs and PDEs* (SIAM, 2007), ch. 1–2, 10.
Evans, *Partial Differential Equations* (AMS, 2010), ch. 2 (Laplace, heat, wave).
Courant–Friedrichs–Lewy, *Math. Ann.* 100 (1928); English: *IBM J. Res. Dev.* 11 (1967).
Classification $B^2-AC$ is the algebraic costume; the structure is the domain of dependence.

## Structure the learner must feel

The same list of numbers is a chain of particles *and* a sample of a field. Refine
it and the list becomes $u(x)$. A PDE is an equation for that field.

The type of the PDE is not a discriminant. It is **what information must enter
through the boundary**, equivalently the shape of the domain of dependence:

- Hyperbolic: a characteristic triangle (finite speed).
- Parabolic: a one-sided fill of the whole past (infinite speed, exponential tails).
- Elliptic: the whole interval, always (no time; both ends).

Tomorrow picture: triangle / one-sided fill / whole interval.

## Tempting wrong belief

A PDE is an ODE with more components, so it needs the same data as an IVP.
False. Interior $D^2$ has a two-dimensional kernel (constants and ramps). Poisson
does not pick a field until you pin a boundary. Right-going advection does not
want the outflow wall.

Misconceptions: `pde-is-long-ode`, `all-pdes-need-same-data`, `heat-is-finite-speed`,
`outflow-needs-data`, `n-equations-n-unknowns`, `particles-are-not-a-field`,
`more-particles-more-physics`.

## Simplest useful case

Five samples, three interior second differences all zero. Kernel = any line.
Dirichlet at both ends → unique. Periodic → singular unless $\sum f = 0$.

1D only. Wave $u_{tt}=c^2 u_{xx}$, heat $u_t=\kappa u_{xx}$, Poisson $u_{xx}=f$,
plus advection $u_t+u_x=0$ as the "which wall" costume.

## Transfer costume

Particles ↔ samples of one bump (continuum limit). Then advection as a
first-order hyperbolic wearing different clothes from the wave triangle.

## Numerics claims (each gets a test)

1. Interior $D^2$ annihilates constants and ramps; recovers $2$ on a quadratic.
2. Dirichlet Laplacian is invertible; changing either endpoint moves the interior.
3. Periodic Laplacian annihilates constants and is singular; inconsistent unless
   the load sums to zero.
4. Poisson Green's function is positive in $(0,1)$, zero at both ends.
5. Discrete $D^2$ of $\sin(\pi x)$ converges to $u''$ at measured order 2.
6. Particles and samples of the bump are the same list.
7. Dirichlet fundamental eigenvalue $\to \pi^2$ as $n$ grows.
8. Wave DoD at $(0.5, 0.2)$ is $[0.3, 0.7]$; d'Alembert ignores data outside it.
9. Heat kernel $> 0$ everywhere for $t>0$; $G(0,0.05)/G(1,0.05)=\exp(5)$.
10. Elliptic DoD is the whole interval, always.
11. Right-going advection at $(0.2, 0.5)$ has already left the interval.

CFL (stencil vs PDE triangle) is the next lesson. Preview only; do not own
`cfl-condition`. Do not add `pde1d.ts` (Agent 12).

## Solvable chain

1. Hook — Predict: refine 8→16, what multiplied? (two costumes)
2. Naive attempt — ContinuumLab: beads vs stems, same numbers
3. World talks back — Predict: vanishing second differences, how many fields?
4. Name the structure — a PDE stores a field; type = boundary data
5. Tighten — DependenceLab + Classify the three shapes
6. Representation shift — SketchCurve the triangle's width vs t
7. Near-transfer — Predict: which wall for $u_t+u_x=0$
8. Optional edge — Estimate the heat tail (infinite speed, not equal influence);
   Tier: periodic compatibility
9. Close — three pictures. Next: if the stencil's triangle is smaller, it explodes.
