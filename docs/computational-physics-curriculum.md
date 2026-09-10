# Computational Physics — Curriculum Map
## Open-source Brilliant-class learning path (topics & journey only)

**Audience:** product thinkers and lesson authors who will later turn each topic into solvables.  
**Scope:** computational physics — the *methods*, *solvers*, *discretizations*, and *decision structure*. University physics content is a later document.  
**Stance:** follow the product thesis. The visualization is the question. A method is understood when the learner can *move the discrete world it describes* and watch consistency, stability, conservation, and cost appear.  
**What this file is:** the full topic / subtopic map and learning journey from scratch to advanced. Not implementations. Not physics chapters.

---

## 0. How this map is meant to be taught

Do not start a lesson with “explain FEM.” Start with:

1. What structure is being approximated? (a derivative, a flux, a weak form, a path integral, a contact, a spectrum…)
2. What object can a human move that makes that structure visible? (a stencil, a mesh node, a particle, a time step, a CFL slider, a residual, a condition number…)
3. What question is unanswerable without moving it?
4. What wrong move is most likely, and how does the discrete world show it?
5. What is the simplest useful case?
6. What is the same idea in different clothes?
7. What picture should still be in their head tomorrow?

Every method family below is an unlocking idea, not a catalog entry. Depth beats coverage. Target later: **20+ interactive problems per unlocking concept**.

### Identity of this path

Not “how do I run a solver.”  
**How do I choose, build, break, and trust a discrete model of a physical world.**

### Layers this curriculum must eventually own

| Layer | In this subject |
|---|---|
| Studio | Living diagrams of grids, particles, residuals, spectra, conservation tallies |
| Coach | Misconception-aware prompts (“you conserved mass but not momentum”; “your scheme is consistent but unstable”) |
| Gym | Same method, new equation type / new mesh / new stiffness / new geometry |
| Map | Paths below; jump allowed after a short diagnostic |
| Habit | Short daily solvables: one stencil, one CFL experiment, one residual drop |
| Culture | Adult, precise, no mascot clutter. Pride is a clean conservation plot, not a badge |

### Physics is clothing, methods are structure

A heat equation, a beam, a Schrödinger packet, and a traffic density can wear the *same* discrete idea. Teach the structure first. Hang physics on it later. This file therefore names *which physics later attaches*, but does not teach the physics.

---

## 1. The learning journey at a glance

Five altitudes. A learner can enter at A after a short interactive diagnostic. Advanced tracks C–E reuse visual worlds from A–B so the product feels like one mind.

```
A  Discrete thinking          numbers, error, grids, time steps
B  Classical numerical core   roots, linear systems, ODE, quadrature, Fourier
C  Continuum discretizations  FDM → FVM → FEM → spectral → DG
D  Particle & hybrid worlds   MD, MC, PIC, SPH, MPM, DEM, LBM, peridynamics
E  Production computational physics
   solvers at scale, V&V, UQ, HPC, multiphysics, modern surrogates
```

**Suggested default path (not sacred):**

1. Why computers lie (error)  
2. A derivative is a question about nearby values  
3. Marching in time  
4. When marching explodes (stability / CFL)  
5. Linear systems as the tax every method pays  
6. Three PDE types, three personalities  
7. Conservation as a design law  
8. Weak form as a different way to ask the same PDE  
9. Elements, then particles, then hybrids  
10. The solver stack behind every serious code  
11. Trust: verification, validation, uncertainty  
12. Scale and coupling  

**Unlocking roots (few doors, many rooms):**

- Error has structure (truncation, roundoff, statistical, modeling)
- A scheme is an operator on a discrete world
- Consistency + stability ⇒ convergence (and when that slogan fails)
- Explicit vs implicit is a *trade*, not a moral
- Conservation is a discrete choice
- Strong form / weak form / integral form are three costumes of one idea
- Mesh vs particles vs hybrid is a representation choice
- Every discretization eventually becomes “solve \(Au=b\) or \(F(u)=0\)”
- Preconditioning is the real algorithm
- Trust is a separate discipline from “got a picture”

---

## 2. Course A — Discrete thinking (beginner)

*Goal:* the learner can look at any later method and ask “what is stored, what is varied, what is conserved, what can blow up.”

### A1. What computational physics even is

- Simulation vs theory vs experiment as three ways of asking nature
- A model, a discretization, an algorithm, a computer, an observation — five different objects
- Direct simulation vs reduced model vs surrogate
- What a “solver” is, in one sentence: a procedure that turns a discrete residual into a discrete state
- Forward problem / inverse problem / design problem
- Deterministic vs stochastic computation
- Continuum vs particles vs kinetic vs quantum as *levels of description*
- The question: *which level of description is this code actually solving?*

### A2. Numbers the machine actually has

- Floating point as a finite grid on the reals
- Machine epsilon, underflow, overflow
- Cancellation and loss of significance
- Conditioning of a problem vs stability of an algorithm
- Forward error, backward error
- Why “more digits” is not the same as “more truth”
- Visual world: zoom a parabola near a root; watch digits vanish

### A3. Error is not one thing

- Roundoff error
- Truncation / discretization error
- Iteration error (stopped too early)
- Statistical error (Monte Carlo)
- Modeling error (wrong physics)
- Implementation error (a bug that looks like physics)
- Error vs residual vs uncertainty
- How these errors *add, cancel, or hide each other*
- Order of accuracy as a slope on a log-log plot
- Richardson extrapolation as “use two resolutions to see the error”
- The question: *if I refine the mesh and the answer does not move, what kind of error am I looking at?*

### A4. Discrete worlds: what is stored where

- Point values on a grid (finite difference instinct)
- Cell averages (finite volume instinct)
- Coefficients of basis functions (finite element / spectral instinct)
- Particle states (position, mass, velocity, stress)
- Samples from a distribution (Monte Carlo instinct)
- Modal coefficients (Fourier / polynomial instinct)
- The same smooth function in all five costumes
- Structured vs unstructured vs meshfree vs background-grid+particles
- Degrees of freedom: counting what you actually solve for
- The question: *if I refine, what object multiplies — points, cells, elements, particles, or modes?*

### A5. The first living diagram: a 1D field on a line

- Sample a function
- Finite differences: forward, backward, central
- Truncation error made visible by Taylor leftover terms
- First vs second derivative stencils
- Boundary nodes are different animals
- Interpolation vs differentiation vs integration as three operations on the same samples
- The mute test: with no text, can the learner see that central differences cancel the even error?

### A6. Time as a second discrete direction

- State now → state later
- A step size \(\Delta t\) is a resolution, not a “speed setting”
- Marching as a map \(U^{n} \mapsto U^{n+1}\)
- Local truncation error vs global error
- The idea of an *update rule*
- Conservation in time: does the map preserve a discrete energy, mass, or symplectic area?

### A7. The first explosion: instability as a visible object

- A scheme that looks reasonable and then explodes
- Amplification factor
- A slider on \(\Delta t / \Delta x\) that turns a wave into noise
- CFL number as “how far does information travel in one step, in mesh units”
- Stable-looking plots that are still wrong (dissipation pretending to be physics)
- The question: *is this wiggle the PDE or the scheme?*

### A8. Computational experiments as a craft

- A minimal reproducible experiment: one equation, one scheme, one plot that can lie
- Controls: grid, step, tolerance, seed, precision
- What to plot instead of a pretty field: residual history, conservation drift, spectra of the update operator, error vs \(h\)
- Method of manufactured solutions as a preview of later V&V
- Start-over without shame; a failed run is data

---

## 3. Course B — Classical numerical core

*Goal:* the shared toolbox every later method calls. Teach as questions attached to diagrams, not as a numerical-analysis textbook dump.

### B1. Approximation of functions

- Interpolation: polynomial, piecewise, spline
- Runge phenomenon as a visual warning
- Least squares as “best in a norm”
- Orthogonal polynomials (Legendre, Chebyshev) as a better basis
- Piecewise polynomials as the seed of FEM
- Global high-order polynomials as the seed of spectral methods
- Radial basis functions as a seed of meshfree methods
- The question: *what happens to the interpolant if I move one node?*

### B2. Differentiation and integration

- Finite-difference tables; order vs stencil width
- Automatic differentiation as exact derivatives of *the code*, not of nature
- Newton–Cotes (trapezoid, Simpson)
- Gaussian quadrature and why nodes are not equally spaced
- Singular and unbounded integrals
- Adaptive quadrature as “refine where the integrand misbehaves”
- Monte Carlo integration as the high-dimensional costume of the same idea
- The question: *where does the error live if I refine — at the nodes, in the gaps, or in the dimension count?*

### B3. Roots, minima, and constraints

- Bisection, secant, Newton, Halley
- Basin of attraction of Newton as a picture
- Residual vs error in nonlinear solves
- Line search and trust region as “don’t take the full Newton step”
- Unconstrained vs constrained optimization
- Gradient descent vs Newton vs quasi-Newton (BFGS)
- Least-squares / Gauss–Newton / Levenberg–Marquardt
- Global search: simulated annealing, genetic algorithms — when local solvers lie
- Inverse problems as “the residual is data misfit”
- The question: *is this a hard function, a bad guess, or a flat valley?*

### B4. Linear algebra the physicist actually meets

This is an unlocking course of its own. Almost every later method collapses to it.

#### B4.1 Matrices as discrete operators

- A matrix as a linear map on a grid / basis
- Sparse vs dense; why PDE matrices are sparse
- Structure: symmetric, SPD, indefinite, singular, nonnormal
- Eigenvalues of a discrete Laplacian vs the continuous one
- Condition number as sensitivity of \(Au=b\)
- Null space: what the discrete operator cannot see (e.g. pure gauge, rigid motion)
- The question: *what physical mode is this eigenvector?*

#### B4.2 Direct solvers

- What “direct” means: finite arithmetic steps, exact in exact arithmetic
- GE / LU with pivoting
- Cholesky for SPD
- QR
- Why fill-in happens; sparse direct methods (AMD, nested dissection)
- When direct methods win (small-to-medium, many right-hand sides, ill-conditioned)
- When they die (3D PDE at scale)
- The question: *if I reorder the unknowns, why does the factorization get cheaper?*

#### B4.3 Stationary iterative solvers

- Splitting \(A = M - N\)
- Richardson, Jacobi, Gauss–Seidel, SOR
- Smoothing: they kill high-frequency error, leave the smooth error
- Spectral radius of the iteration matrix
- Why they are slow alone and useful as *smoothers*
- The visual: error field after 1, 5, 50 Jacobi sweeps

#### B4.4 Krylov solvers

- A Krylov space as “the span of what matvecs can tell you from one residual”
- Why we never form \(A^{-1}\)
- Matrix-free operators: you only need \(v \mapsto Av\)
- CG — SPD, short recurrence, energy minimization
- MINRES — symmetric indefinite
- GMRES / FGMRES — nonsymmetric; restart
- BiCGStab, QMR, TFQMR, IDR
- What each method assumes and what it minimizes
- Breakdown, stalling, restart
- The question: *if GMRES residual stalls, is A bad, the preconditioner bad, or the physics singular?*

#### B4.5 Preconditioners

- Left / right / split preconditioning
- A preconditioner as “a cheap fake inverse”
- Jacobi / block Jacobi / ILU / SPAI
- Domain decomposition: Schwarz, additive/multiplicative, FETI, BDDC
- Multigrid as both a solver and a preconditioner (preview of B4.6)
- Physics-based preconditioners (e.g. approximate Schur complements, block solvers for saddle-point systems)
- The hard truth: *the preconditioner is the algorithm; Krylov is the accelerator*

#### B4.6 Multigrid

- Why low-frequency error is invisible to local smoothers
- Hierarchy of grids
- Restriction and prolongation
- V-cycle, W-cycle, FMG
- Geometric multigrid vs algebraic multigrid (AMG)
- Smoother choice
- Coarse-grid correction as the actual idea
- Multigrid for Helmholtz (why it is harder)
- The visual: error spectrum before/after a V-cycle

#### B4.7 Eigenvalue solvers

- Power iteration, inverse iteration, Rayleigh quotient
- QR algorithm
- Lanczos / Arnoldi
- Shift-invert, spectral slicing
- Generalized eigenproblems \(Au = \lambda Bu\)
- Applications later: modes of structures, quantum bound states, stability of flows, photonic bands
- The question: *which end of the spectrum do I actually need?*

#### B4.8 Nonlinear algebraic solvers

- Picard / fixed-point
- Newton
- Inexact Newton
- Jacobian-free Newton–Krylov (JFNK)
- Newton–multigrid
- Continuation / pseudo-transient continuation when Newton’s basin is tiny
- Globalization: line search, trust region
- Saddle-point and constrained systems (KKT, Lagrange multipliers)
- The question: *did the linear solve fail, or did Newton walk off a cliff?*

#### B4.9 Fast transforms and structured solvers

- FFT as a structured dense solve
- Cyclic reduction, fast Poisson solvers
- Hierarchical matrices, \(\mathcal{H}\)-matrices, FMM as “dense but data-sparse”
- Why some integral-equation methods become cheap

### B5. Ordinary differential equations

#### B5.1 The ODE as a vector field

- Autonomous vs non-autonomous
- Phase portrait as the visual world
- Existence / uniqueness as “when is marching even a well-posed job”
- Reduction of higher-order systems to first order
- Conservative vs dissipative vector fields

#### B5.2 One-step explicit methods

- Forward Euler
- Midpoint / Heun
- Classical RK4
- Embedded pairs and adaptive stepping (RK45 instinct)
- Local error estimate as a second solution on the same step
- The question: *if I double the step, what should the local error do?*

#### B5.3 Implicit methods and stiffness

- What stiffness *feels like*: stability, not accuracy, sets \(\Delta t\)
- Backward Euler
- Trapezoid / Crank–Nicolson
- BDF family
- DIRK / SDIRK / IRK / Gauss–Radau / Radau IIA
- A-stability, L-stability
- The nonlinear solve hiding inside every implicit step
- The question: *is my step small because the physics is fast, or because the scheme is explicit?*

#### B5.4 Multistep methods

- Adams–Bashforth, Adams–Moulton
- Predictor–corrector
- Starting values
- Zero-stability vs absolute stability
- Why high-order linear multistep methods fight Dahlquist barriers

#### B5.5 Geometric / structure-preserving integrators

- Why energy drifts under RK4 on a Hamiltonian
- Symplectic Euler, leapfrog, velocity Verlet
- Higher-order symplectic methods
- Shadow Hamiltonian
- Variational integrators
- Lie-group / rigid-body integrators
- SHAKE / RATTLE for constraints
- The question: *what invariant should still be true after a million steps?*

#### B5.6 Special ODE settings

- IMEX splitting: treat stiff pieces implicit, nonstiff explicit
- Operator splitting (Lie–Trotter, Strang) and splitting error
- Stochastic ODEs / Langevin / Brownian (preview of Course D)
- Delay equations (preview only)
- Sensitivity / adjoints of ODE trajectories (preview of inverse problems)

#### B5.7 Boundary-value problems for ODEs

- Shooting
- Relaxation / finite-difference BVP
- Collocation
- Eigenvalue ODEs (Sturm–Liouville, 1D Schrödinger) as “the number you solve for is \(\lambda\)”
- Two-point vs multipoint constraints

### B6. Fourier and spectral analysis as a computational tool

- DFT / FFT
- Aliasing and the Nyquist limit
- Convolution theorem
- Spectral differentiation
- Windowing, filters, power spectra
- Dispersion relation of a *scheme* vs of the PDE
- Numerical dissipation and dispersion as fingerprints
- Wavelets as localized spectral language
- The question: *is this wiggle a physical frequency or an aliased ghost?*

### B7. Randomness as a computational primitive

- What a PRNG is and why seed matters
- Uniform → other distributions (inverse CDF, rejection, Box–Muller)
- Sampling vs quadrature
- Law of large numbers made visible
- Variance as the real cost of Monte Carlo
- Error \(\sim 1/\sqrt{N}\) and why dimension does not kill you the same way
- Preview of Markov chains

---

## 4. Course C — Continuum discretizations

*Goal:* the learner can look at a PDE and say which discrete language fits, why, and what it will cost.

### C0. The PDE before the method

- What is stored: field \(u(x,t)\)
- Classification of second-order linear PDEs: elliptic, parabolic, hyperbolic
- Characteristics and domains of dependence
- Boundary conditions: Dirichlet, Neumann, Robin, periodic, radiation / open
- Initial conditions vs boundary conditions vs constraints
- Conservation form vs nonconservation form
- Well-posedness as a prerequisite the scheme cannot invent
- Nondimensional numbers that later set resolution (Re, Pe, CFL, Kn, Da…)
- The question: *what information must enter through the boundary for this PDE type?*

### C1. Finite difference methods (FDM)

#### C1.1 Construction

- Replace derivatives by stencils
- Cartesian and mapped structured grids
- Compact schemes
- One-sided stencils at boundaries
- Ghost points
- Method of lines: discretize space, get a huge ODE

#### C1.2 Analysis tools (teach as experiments)

- Local truncation error
- Modified equation analysis (“the scheme really solves a nearby PDE”)
- Von Neumann / Fourier stability
- CFL condition
- Lax–Richtmyer equivalence theorem: consistency + stability ⇒ convergence *for linear well-posed IVPs*
- Where the slogan fails (nonlinear, inconsistent dissipation, wrong weak solution)
- Lax–Wendroff theorem for conservation laws
- Godunov’s theorem: linear high-order schemes vs monotonicity

#### C1.3 Model equations every scheme must meet

- Linear advection
- Diffusion / heat
- Poisson / Laplace
- Wave equation
- Burgers
- Linear systems (acoustics)
- The same stencil family on each, so costumes change and the idea stays

#### C1.4 Time discretizations on grids

- FTCS, BTCS, Crank–Nicolson
- Lax–Friedrichs, Lax–Wendroff, MacCormack
- Leapfrog
- Implicit vs explicit diffusion
- Numerical dispersion and dissipation plots as the lesson’s reusable picture

### C2. Finite volume methods (FVM)

#### C2.1 The idea

- Integrate the conservation law over a cell
- Cell averages as the unknowns
- Fluxes on faces; telescoping sums
- Discrete conservation as an *identity*, not a hope
- Finite volume vs finite difference: same on Cartesian, different in meaning

#### C2.2 Reconstruction and limiting

- Piecewise constant (Godunov)
- Piecewise linear (MUSCL)
- Higher-order reconstruction
- Slope limiters; TVD
- WENO
- Why unlimited high-order schemes ring near discontinuities

#### C2.3 Riemann problems and numerical fluxes

- The Riemann problem as the local question a face asks
- Exact vs approximate Riemann solvers (Roe, HLL, HLLC, Rusanov)
- Upwinding as “information has a direction”
- Entropy fixes
- Contact, shock, rarefaction as three answers the flux must respect

#### C2.4 Unstructured FVM

- Cell-centered vs vertex-centered
- Face geometry, non-orthogonality
- Gradient reconstruction
- Conservation on arbitrary polyhedra

#### C2.5 What FVM is the default language for

- Compressible and incompressible flow
- Astrophysics hydro
- Conservation laws with shocks
- Later clothing: Euler, Navier–Stokes, MHD, traffic, shallow water

### C3. Weighted residuals and the weak form

This is the intellectual doorway to FEM, DG, spectral, BEM.

- Strong form of a PDE
- Residual of an approximate field
- Make the residual small in a chosen sense
- Collocation
- Subdomain
- Least squares
- Galerkin
- Petrov–Galerkin
- Test space vs trial space
- Integration by parts and natural boundary conditions
- The question: *which inner product am I declaring “small”?*

### C4. Finite element methods (FEM)

Treat FEM as a *family*, not a single algorithm.

#### C4.1 The minimal 1D element

- Piecewise-linear hat functions
- Weak form of \(-u''=f\)
- Element matrix, assembly, global sparse matrix
- Essential vs natural BCs
- The picture that must survive: a hat function overlapping neighbors

#### C4.2 The method, piece by piece

- Mesh: nodes, elements, connectivity
- Reference element and mapping
- Shape / basis functions: Lagrange, hierarchical, serendipity
- Quadrature on the reference element
- Assembly as scattering local matrices into a global operator
- Applying constraints
- Solve \(Au=b\)
- Postprocess: gradients, stresses, derived fields (they converge slower)

#### C4.3 Approximation theory the product should make felt

- \(h\)-refinement vs \(p\)-refinement vs \(hp\)
- Rate vs smoothness
- Pollution / pollution-free estimates (preview of Helmholtz)
- A-priori vs a-posteriori error estimates
- Adaptivity driven by a local indicator
- The question: *if I raise \(p\) on a function with a kink, why does the rate stall?*

#### C4.4 Element types and geometric fidelity

- 1D bars; 2D triangles / quads; 3D tets / hexes / prisms / pyramids
- Isoparametric maps
- Mesh quality: aspect ratio, Jacobians, inverted elements
- Why sliver tets destroy solves

#### C4.5 Varieties of FEM (each is a later lesson cluster)

- Conforming vs nonconforming
- Mixed FEM (two fields; inf-sup / LBB)
- Hybrid FEM
- Discontinuous Galerkin as a cousin (own section)
- Extended FEM / GFEM / PUM (cracks, interfaces)
- CutFEM / immersed boundary FEM
- Isogeometric analysis (NURBS / splines as basis)
- Mortar methods and nonconforming interfaces
- Structural elements: bars, beams, shells (kinematics as constraints)
- Vector / edge / face elements (Nédélec, Raviart–Thomas) — needed for EM and mixed formulations

#### C4.6 Time-dependent FEM

- Semi-discrete ODE on coefficients
- Mass matrix: consistent vs lumped
- Newmark, HHT-\(\alpha\), generalized-\(\alpha\) in structural dynamics
- Energy behavior of the integrator
- Explicit FEM and critical time step from mesh

#### C4.7 Nonlinear continuum FEM (preview of solids)

- Geometric nonlinearity
- Material nonlinearity
- Consistent tangent
- Load stepping / arc-length
- Contact as a constrained problem

#### C4.8 What FEM is the default language for

- Solid mechanics, structures
- Diffusion, electrostatics
- Incompressible flow (with care)
- Eigenmodes
- Coupled multiphysics on shared meshes

### C5. Spectral and spectral-element methods

- Global polynomial / Fourier expansion
- Exponential convergence for smooth solutions
- Aliasing and dealiasing
- Tau, Galerkin, collocation / pseudospectral
- Chebyshev vs Legendre vs Fourier
- Gibbs phenomenon
- Spectral elements: high-order on a coarse mesh of elements
- GLL nodes and mass lumping
- When spectral methods die: discontinuities, complex geometry
- The question: *if I double the modes, does the error fall off a cliff or hit a wall?*

### C6. Discontinuous Galerkin (DG) and related high-order hybrids

- Broken function spaces
- Numerical flux as the glue
- Interior penalty / LDG / BR2 / HDG
- DG for hyperbolic conservation laws
- DG for elliptic problems
- Compact stencil vs wider FEM stencil
- \(hp\)-adaptivity
- Connection to flux reconstruction / SEM
- Why DG is popular for unsteady CFD on unstructured meshes

### C7. Boundary element / integral methods

- Reduce a linear homogeneous PDE to an integral on the boundary
- Green’s functions
- Method of moments (MoM) as the EM name for the same idea
- Dense matrices; why FMM / \(\mathcal{H}\)-matrices / ACA appear
- Interior vs exterior problems; radiation condition
- Coupling BEM–FEM
- What it is the default for: exterior acoustics, EM scattering, some fracture problems

### C8. Mesh generation and adaptivity (a first-class subject)

- Why the mesh *is* part of the method
- Structured, block-structured, overset / Chimera
- Unstructured simplex / hex
- Cartesian embedded boundary, cut cells
- Body-fitted vs immersed
- Mesh motion, remeshing, ALE (preview of C9)
- Quality metrics
- Adaptive mesh refinement (AMR): quad/octree, hanging nodes
- Error indicators vs goal-oriented (adjoint) adaptivity
- The question: *am I refining the pretty region or the region that controls the quantity I care about?*

### C9. Who moves with the material?

- Eulerian frame
- Lagrangian frame
- ALE
- Mesh tangling as a visible failure mode
- Why this question births particle and hybrid methods in Course D

### C10. Choosing a continuum language (decision lesson)

A capstone of Course C, taught as a table the learner can *break*.

| Situation | First language | Why it fails | Upgrade |
|---|---|---|---|
| Smooth field, box geometry | FDM / spectral | geometry, shocks | FEM / DG / FVM |
| Conservation + shocks | FVM | high-order on smooth regions | WENO / DG |
| Complex solid geometry, elliptic | FEM | large deformation tangling | remesh / MPM / meshfree |
| Exterior wave radiation | BEM / PML+volume | dense cost | FMM, high-order volume + PML |
| Very smooth periodic | spectral | Gibbs, geometry | spectral element |
| Need both conservation and geometry | FVM or DG | implementation cost | — |

---

## 5. Course D — Particles, kinetics, and hybrids

*Goal:* methods whose degrees of freedom live on moving points, samples, or a background grid plus points.

### D1. Why leave the mesh

- Large deformation
- Fragmentation, contact, free surfaces
- N-body gravity / electrostatics
- Kinetic theory (a distribution, not a field)
- Stochastic physics
- The cost: neighbors, stability, boundary conditions, conservation

### D2. Molecular dynamics and classical N-body

- State: positions and velocities of \(N\) particles
- Force as \(-\nabla V\); pair potentials, many-body potentials
- Neighbor lists, cell lists, cutoff
- Periodic boxes; minimum-image
- Integrators: Verlet family, symplectic requirement
- Thermostats and barostats as *modifications of the dynamics*
- Long-range forces: Ewald, PPPM, FMM, tree codes (Barnes–Hut)
- Constraints
- Time-scale separation and why MD is stiff in spirit
- From MD to coarse-grained MD
- The question: *what is the conserved energy of the discrete map, not of nature?*

### D3. Collisionless particles and PIC

- Particle-in-cell idea: particles carry charge/mass; fields live on a grid
- Deposit / gather
- Field solve on the grid (usually Poisson / Maxwell)
- Push particles
- Self-force, grid heating, aliasing
- PIC in plasma physics
- PIC / MAC heritage in fluids
- Conservation and gauge issues
- The question: *if I refine particles but not the grid, what error falls and what error stays?*

### D4. Monte Carlo methods in physics

#### D4.1 Integration and transport

- Direct simulation Monte Carlo (DSMC) instinct
- Neutral particle transport / radiation MC
- Analog vs non-analog games
- Variance reduction: importance sampling, splitting/roulette, control variates, antithetic
- When MC beats grids: high dimension, complex geometry, rare events

#### D4.2 Statistical mechanics MC

- Boltzmann weight as a target distribution
- Markov chains, detailed balance, ergodicity
- Metropolis–Hastings
- Gibbs sampling
- Autocorrelation time as the real cost
- Critical slowing down
- Cluster algorithms (Swendsen–Wang, Wolff)
- Histogram reweighting
- Ising / lattice models as the visual gym
- Molecular MC vs MD: sampling vs dynamics

#### D4.3 Quantum Monte Carlo (method topics only)

- Variational MC
- Diffusion / Green’s function MC
- Path-integral MC
- Sign problem as a structural barrier
- What QMC is for, vs exact diagonalization vs tensor networks

### D5. Kinetic and lattice methods

- Boltzmann equation as the level of description
- BGK collision model
- Discrete velocities
- Lattice Boltzmann method (LBM)
  - lattices (D2Q9, D3Q19, …)
  - streaming + collision
  - Chapman–Enskog as “why this looks like Navier–Stokes”
  - boundary bounce-back
  - stability and Mach limits
- Lattice gas heritage
- Discrete-velocity and discrete-ordinate methods
- When LBM is a good CFD engine and when it is a costume

### D6. Smoothed particle hydrodynamics (SPH)

- Kernel estimate of a field from disordered points
- Gradient of a kernel as a discrete derivative
- Consistency / completeness of the kernel
- Tensile instability, pairing instability
- Boundary treatments
- Weakly compressible vs incompressible SPH
- Artificial viscosity
- SPH for fluids, solids, astrophysics
- The question: *if I shrink the smoothing length, what should converge — and what neighbor-count problem appears?*

### D7. Meshfree Galerkin cousins

- Moving least squares
- Element-free Galerkin (EFG)
- Reproducing kernel particle method (RKPM)
- Radial-basis collocation / RBF-FD
- Partition of unity
- Essential boundary conditions are the hard part
- What is gained vs FEM, what is paid

### D8. Material point method (MPM) and PIC-for-solids

Treat MPM as a first-class track. It is the hybrid the thesis-world will want interactives for.

#### D8.1 The hybrid idea

- Lagrangian *material points* carry state (mass, momentum, stress, history)
- Eulerian *background grid* is used to compute derivatives and solve momentum
- Transfer: particles → grid → particles
- Why mesh tangling disappears
- Why the grid can be reset every step

#### D8.2 The standard algorithm, beat by beat

- P2G (particle to grid)
- Grid momentum solve
- G2P (grid to particle)
- Particle advection
- Constitutive update on particles
- Boundary conditions: on grid or on particles

#### D8.3 Variants (each a lesson)

- FLIP / PIC blending (noise vs dissipation)
- Generalized interpolation MPM (GIMP)
- Convected particle domain interpolation (CPDI / CPDI2)
- B-spline / BSMPM
- Total-Lagrangian MPM
- Affine PIC / APIC / PolyPIC
- Dual-grid / staggered MPM
- Implicit MPM vs explicit MPM

#### D8.4 Known failure modes (teach as solvables)

- Cell-crossing noise
- Quadrature error as particles move
- Exact conservation vs exact interpolation — you do not get both for free
- Hourglassing / locking cousins
- Contact is “free” only until it isn’t
- Grid-resolution vs particle-resolution mismatch

#### D8.5 What MPM is for

- Large-deformation solids
- Granular collapse, landslides, snow
- Fluid–solid interaction with a single framework
- Contact-rich problems
- When FEM + remesh is simpler; when SPH is simpler; when DEM is the real model

### D9. Discrete element method (DEM) and discontinuum

- Bodies (usually grains) with contacts
- Soft-sphere vs hard-sphere
- Contact detection as the algorithm
- Friction, rolling resistance, cohesion
- Time step from contact stiffness
- Periodic and wall boundaries
- Coarse-graining DEM into continuum fields
- Coupling DEM–FEM, DEM–MPM, DEM–SPH
- The question: *is this a material law, or a pile of contacts?*

### D10. Peridynamics and other nonlocal continua

- Replace \(\nabla\cdot\sigma\) with an integral of bond forces
- Horizon as a new resolution parameter
- Bond-based vs state-based
- Fracture without a predefined crack path
- Surface effects, volume correction
- Relation to nonlocal damage and to SPH-like kernels
- Cost: neighbors again
- When phase-field fracture is the competing costume

### D11. Phase field, level sets, and interfaces

- Diffuse vs sharp interfaces
- Level-set advection and reinitialization
- VOF / SLIC / PLIC
- Phase-field models (Allen–Cahn, Cahn–Hilliard)
- Phase-field fracture
- Conserved vs nonconserved order parameters
- Coupling to mechanics or fluids
- The question: *is the interface width physical or numerical — and can I tell?*

### D12. Vortex methods and other specialized particles

- Lagrangian vorticity particles
- Vortex-in-cell
- Boundary integral vortex sheet methods
- When they beat grid CFD (some incompressible, some 2D)

### D13. Choosing a particle / hybrid language

| Situation | First language | Failure mode | Upgrade |
|---|---|---|---|
| Molecules / atomistics | MD | long-range, rare events | enhanced sampling, CG |
| Collisionless plasma | PIC | grid heating, noise | more particles, better deposit, implicit PIC |
| Free-surface fluids, astrophysical gases | SPH | boundaries, incompressibility | ISPH, or grid FVM |
| Large-deformation continuum + history variables | MPM | cell-crossing, quadrature | GIMP/CPDI, implicit, better transfers |
| Granular contact physics | DEM | tiny \(\Delta t\), contact cost | coarse grains, coupling |
| Spontaneous fracture | peridynamics / phase field | horizon / length-scale sensitivity | — |
| High-dimensional expectation | MC | variance | importance sampling |

---

## 6. Course E — Production computational physics

*Goal:* the difference between a working homework solver and a trustworthy scientific instrument.

### E1. The full solver stack

A serious code is a sandwich. Teach the sandwich.

1. **Question** — what quantity, to what tolerance, with what physics
2. **Continuum / kinetic / particle model**
3. **Geometry and discretization**
4. **Discrete operators** (residual, Jacobian, fluxes, forces)
5. **Time integrator or nonlinear iterator**
6. **Linear solver + preconditioner**
7. **Adaptivity / load balance**
8. **Postprocess and reduce**
9. **Verify, validate, bound uncertainty**

The question: *which layer is currently the bottleneck — physics, discrete error, algebraic solver, or the human?*

### E2. Types of solvers, named and compared

Keep this as a reusable map. Later lessons keep returning here.

#### E2.1 By mathematical object

- Linear solver — \(Au=b\)
- Nonlinear solver — \(F(u)=0\)
- Eigen solver — \(Au=\lambda Bu\)
- ODE/DAE integrator — \(u'=f(u,t)\) or \(F(u,u',t)=0\)
- Optimization / inverse solver — \(\min J(u,p)\)
- Sampler — draw from \(\pi\)
- Time-periodic / shooting / continuation solver

#### E2.2 By how they use the operator

- Direct vs iterative
- Matrix-explicit vs matrix-free
- Stationary vs Krylov vs multigrid vs Fast transform vs hierarchical
- Exact factorization vs approximate inverse vs subspace projection

#### E2.3 By time treatment

- Steady
- Transient explicit
- Transient implicit
- IMEX / partitioned
- Space-time

#### E2.4 By coupling treatment (multiphysics)

- Monolithic
- Partitioned / staggered
- Strong vs weak coupling
- Operator-split
- Co-simulation

#### E2.5 By description level

- Continuum field solver
- Particle solver
- Kinetic / lattice solver
- Hybrid
- Reduced-order / surrogate

#### E2.6 Decision questions a lesson must force

- Is the operator linear this step?
- Is it SPD, indefinite, or nonsymmetric?
- How many unknowns — \(10^3\), \(10^6\), \(10^9\)?
- How many times will I solve with the same \(A\)?
- Is a Jacobian available? Cheap? Accurate?
- Is the spectrum clustered?
- Do I need conservation to machine precision?
- Do I need a transient or only a steady attractor?
- Is the mesh changing every step?
- Is the problem constrained / saddle-point?
- Can I afford implicit?

### E3. Verification

- Code verification vs solution verification vs validation (they are not synonyms)
- Order-of-accuracy tests
- Method of manufactured solutions (MMS)
- Method of exact solutions
- Residual and conservation audits
- Grid / particle / mode convergence
- Independent discretization cross-check (two methods, one answer)
- Software verification: regression tests, conservation unit tests
- The question: *am I testing the math, the code, or the model?*

### E4. Validation and predictive use

- Validation against experiment or a higher-fidelity model
- What “agreement” means (which norm, which QoI)
- Calibration vs prediction
- Domain of applicability
- Expert judgment as a named (and dangerous) input
- The question: *if I change one material number, does the story survive?*

### E5. Uncertainty quantification

- Sources: parametric, model-form, numerical, experimental
- Forward UQ: how uncertainty in inputs becomes uncertainty in outputs
- Inverse UQ / Bayesian calibration
- Sampling: MC, QMC, multilevel MC
- Surrogates: polynomials, Gaussian processes, reduced bases
- Polynomial chaos / stochastic Galerkin / stochastic collocation
- Sensitivity: local derivatives, adjoints, Sobol indices
- The question: *which uncertain input actually owns the error bar on the QoI?*

### E6. Adjoints, sensitivities, and inverse problems

- Why a second solve can give every derivative
- Discrete vs continuous adjoint
- Inverse problems are ill-posed; regularization is a method
- 4D-Var instinct
- Topology / shape optimization as “the mesh is the unknown”
- Differentiable simulation as the modern costume of the same idea

### E7. High-performance computational physics

- Complexity of the algorithm vs constants
- Memory wall, flop/byte
- Data layout (SoA / AoS), cache, vectorization
- Shared memory vs distributed memory
- Domain decomposition as both a solver and a parallel strategy
- MPI + threads + GPU
- Strong vs weak scaling; Amdahl / Gustafson
- Load balance on AMR and particles
- I/O and in-situ visualization as part of the method
- Reproducibility on parallel reductions
- The question: *if I double the cores, which layer fails first?*

### E8. Multiphysics and multi-scale coupling

- Conjugate heat transfer
- Fluid–structure interaction (FSI)
- Electro-thermo-mechanical
- Plasma–neutral–photon
- Atomistic-to-continuum
- Heterogeneous discretizations on different subdomains
- Stability of partitioned coupling (added-mass)
- Conservation at interfaces
- Time-scale and length-scale bridging
- The question: *who owns the interface residual?*

### E9. Reduced-order models and learned surrogates

- POD / reduced-basis
- Nonlinear model reduction
- Operator inference
- Gaussian-process emulators
- Physics-informed neural nets (PINNs) — what they actually optimize
- Neural operators
- Differentiable solvers vs replacing the solver
- When a surrogate is a tool and when it is cognitive offloading theater
- The product principle from the thesis still applies: *do not lift the weights for the learner, and do not lift the residual for the physicist unless the residual is still checked*

### E10. Scientific software as part of the discipline

- Units and dimensional consistency
- Configuration vs code
- Tests as first-class
- Versioned inputs and seeds
- Provenance
- What an open lesson object should look like: inspectable residual, inspectable discretization, forkable experiment

---

## 7. Domain tracks (the same methods in new clothes)

These are *application paths*, not a second curriculum. Each track reuses Courses A–E and adds only the discrete structures that are native to that domain. Physics depth lives in the future physics document.

### Track F — Computational fluid dynamics

- Incompressible vs compressible vs rarefied
- Pressure Poisson / projection / SIMPLE / PISO / fractional step
- Artificial compressibility
- Riemann-solver CFD vs artificial-viscosity CFD vs residual-distribution
- Turbulence as a modeling layer on a discretization (RANS, LES, DNS — method consequences only)
- Preconditioning for low-Mach
- Shock capturing vs shock fitting
- Immersed boundary methods for flow
- Overset grids
- Output-based AMR
- LBM as an alternative engine
- FSI coupling points
- Canonical gym: linear advection, Burgers, shock tube, lid-driven cavity, bluff body, channel

### Track S — Computational solid / structural mechanics

- Small-strain FEM review
- Finite strain: total vs updated Lagrangian
- Hyperelasticity, plasticity (return mapping as a local solver)
- Mixed formulations for incompressibility
- Locking (volumetric, shear) and how elements fail
- Contact, friction, mortar
- Fracture: XFEM, cohesive zones, phase field, peridynamics
- Explicit dynamics vs implicit statics
- Beams / shells as constrained 3D
- IGA
- MPM / SPH solids as large-deformation alternatives
- Canonical gym: patch test, Cook’s membrane, necking, Taylor bar, granular column

### Track M — Computational electromagnetics and waves

- Yee grid / FDTD
- CFL in Maxwell
- Numerical dispersion of Yee
- PML and other truncations
- FDFD
- FEM with edge elements (why nodal elements leak)
- Frequency-domain driven vs eigenmode
- Method of moments / EFIE / MFIE / CFIE
- High-frequency asymptotics (ray, PO, UTD) as different level of description
- PIC-EM for charged particles + Maxwell
- Acoustics as the scalar cousin
- Canonical gym: 1D Maxwell, cavity modes, scattering cylinder, waveguide

### Track Q — Computational quantum and electronic structure (methods)

- Exact diagonalization and why it dies
- Variational principle as a solver strategy
- Hartree–Fock as a nonlinear eigenvalue problem
- DFT as a different self-consistent field loop (method structure, not functional zoo)
- Basis sets: Gaussians, plane waves, real-space grids, finite elements
- Time-dependent: Crank–Nicolson, split-operator FFT, TDDFT structure
- Many-body: CI, coupled cluster as truncated solvers
- DMRG / MPS / tensor networks
- Quantum Monte Carlo variants
- Dynamical mean-field as an embedding solver
- The question: *which correlation is being approximated by which truncation?*

### Track K — Computational statistical physics

- Lattice models
- Critical phenomena numerically
- Finite-size scaling
- Renormalization as an algorithm (Monte Carlo RG, DMRG as RG)
- Kinetic Monte Carlo
- Rare-event methods (transition path sampling, umbrella, metadynamics — as sampling solvers)

### Track A — N-body, gravitation, astrophysical fluids

- Direct \(N^2\) vs tree vs FMM vs particle-mesh vs P3M
- Softening
- Individual timesteps
- SPH vs grid hydro in astrophysics
- Radiative transfer coupling
- Special relativity / GR hydro as constraint-and-form problems (method issues)

### Track P — Computational plasma physics

- Fluid / MHD discretizations (constrained transport for \(\nabla\cdot B=0\))
- Kinetic Vlasov: Eulerian phase-space vs PIC
- Gyrokinetic reductions as model-order choices
- Collisional vs collisionless algorithms
- Implicit PIC, energy-conserving PIC

### Track O — Optimization, control, and design in physical systems

- PDE-constrained optimization
- Topology optimization and SIMP / level-set / phase-field design
- Optimal control of time-dependent PDEs
- Calibration of constitutive laws

---

## 8. Cross-cutting “fundamental question” catalog

These are not extra courses. They are recurring solvables that should appear inside many lessons. If a lesson cannot pose one of them, it is probably a demo.

### About models

- Which level of description is this?
- What is assumed smooth enough to differentiate?
- What is a material law vs a balance law vs a constraint?
- What is resolved vs closed (subgrid)?

### About discretization

- What is stored, and where?
- What is the stencil / support / horizon / kernel?
- What happens at a boundary?
- What happens at a discontinuity?
- What is conserved *identically*?
- What is the formal order, and on which solutions is that order real?
- If I refine only space, only time, only particles — what converges?

### About time

- Explicit, implicit, or IMEX — and why?
- What limits \(\Delta t\): accuracy, stability, or nonlinear solver?
- Is the integrator structure-preserving?
- Is the splitting error bigger than the scheme error?

### About algebra

- What matrix (or matvec) did this discretization produce?
- SPD, indefinite, nonsymmetric, singular?
- Direct, Krylov, or multilevel?
- What is the preconditioner pretending to be?
- What does the residual history mean?

### About failure

- Is this instability, dissipation, dispersion, locking, or a bug?
- Is the residual small but the answer wrong?
- Is the answer pretty but the QoI unconverged?
- Did I verify a code or validate a model?

### About cost

- Cost vs accuracy curve, not a single run
- Memory vs flops
- Setup cost vs solve cost
- When is a “better” method more expensive at the tolerance I need?

---

## 9. Recommended sequences

### Path 1 — Default (scientist who will write and read solvers)

1. A1–A8 Discrete thinking  
2. B2 + B5 Time and derivatives  
3. B4.1–B4.4 Linear systems and Krylov  
4. C0–C1 PDE types + FDM + stability  
5. C2 FVM and conservation  
6. C3–C4 Weak form + FEM  
7. B4.5–B4.8 Preconditioners, multigrid, Newton  
8. D2 or D4 (MD or MC — pick one particle language early)  
9. E1–E5 Solver stack + V&V + UQ  
10. One domain track (F, S, or M)  
11. D8 MPM or D6 SPH as the hybrid exam  
12. E7–E9 Scale and surrogates  

### Path 2 — Continuum mechanician

A → B5 → B4 → C0 C1 C4 C8 C9 → Track S → D8 D9 D10 → E

### Path 3 — Fluids / astrophysics

A → B5 B6 → C0 C1 C2 C6 → Track F → D5 D6 D3 → E

### Path 4 — Computational statistical / quantum

A → B3 B4 B7 → D4 D2 → Track K / Track Q → E3 E5

### Path 5 — After a first university computational-physics course

Skip A2–A6 if diagnostic passes. Start at A7 + B5 + C0. Do not skip B4 or E3.

### Placement diagnostic (short, interactive)

- Differentiate a sampled function two ways; spot cancellation  
- Step an oscillator with Euler vs Verlet; watch energy  
- Change CFL on advection until it breaks  
- Recognize \(Au=b\) hiding in a 1D Poisson solve  
- Tell whether a plot failure is instability or a shock  

Pass → enter at C. Fail specific stations → drop into the matching A/B module.

---

## 10. Lesson anatomy for this subject

Use the thesis beat structure. A computational-physics lesson is usually 5–12 minutes and owns **one** idea.

**Default beats**

1. Hook — a picture that is already failing or surprising (a scheme exploding, a shock ringing, a residual stalling, a beam locking)
2. Naive attempt — let them pick a stencil / step / solver with whatever they have
3. The world talks back — conservation tally, spectrum, residual, mesh quality, particle emptiness
4. Name the structure — one or two sentences. The equation is a caption.
5. Tighten — same world, one new constraint (implicit, limiter, preconditioner, kernel correction)
6. Representation shift — same idea as a matrix, a stencil, a flux, a weak form
7. Near transfer — new PDE costume or new mesh
8. Optional edge — the case that breaks the sloppy version
9. Close on a reusable picture — modified-equation term, V-cycle cartoon, P2G/G2P diagram, CFL triangle

**Solvable primitives that matter here**

- sliders on \(h\), \(\Delta t\), CFL, penalty, kernel width, horizon, restart length  
- locators for nodes / particles / shocks  
- stencil painters  
- residual and conservation meters  
- spectrum viewers of update operators  
- drag-to-assemble a mesh or a transfer  
- choose-the-flux / choose-the-solver as *competing interpretations of the same picture*  
- estimate-then-run (prediction is first-class)  
- start-over always available  

**Misconception library starters (first-class data)**

- Smaller \(\Delta t\) always means more accuracy  
- A pretty field is a verified field  
- High-order always beats low-order  
- Implicit is unconditionally accurate  
- Conservation of mass implies a correct shock speed  
- FEM is just a fancy finite difference  
- Particles remove the CFL limit  
- More particles fix a coarse PIC grid  
- Residual small ⇒ error small  
- AMG is fire-and-forget  
- A neural surrogate replaces V&V  
- Energy drift of RK4 on orbits is “physics”

**Quality bar (from the thesis, specialized)**

- Eight-minute test: a rusty STEM adult gets one genuine “oh”  
- Mute test: the interactive still teaches if the coach is off  
- Transfer test: new equation, same method idea  
- Representation test: stencil ↔ matrix ↔ residual plot  
- Struggle test: an unstable or nonconservative choice is possible and visible  
- Silence test: cut 30% of the words  
- Tomorrow test: a picture remains (CFL triangle, hat function, V-cycle, P2G)  
- Koji test: the coach points at the same canvas  
- Pride test: a serious person would send the lesson because the *idea* is beautiful  

Fail two → rewrite. Do not ship a demo with sliders.

---

## 11. What is deliberately not in this file

- University physics content (mechanics, EM, QM, stat mech as physics). Next document.  
- Language / framework choices (Python, Julia, C++, PETSc, FEniCS, …). Implementation layer.  
- Full catalogs of turbulence models, exchange-correlation functionals, plasticity yield surfaces. Those are physics/model clothing.  
- Certificate sequences and LMS features.  
- “500 methods” sprawl. If a method does not change what the learner can *move*, it waits.

---

## 12. Suggested course packaging for the product

Short names, each a Brilliant-style course of many tiny lessons. One idea per lesson, many costumes per course.

**Foundation**

1. When numbers lie  
2. Fields on a line  
3. Time stepping  
4. When schemes explode  
5. The matrix hiding in a grid  

**Core methods**

6. ODE worlds  
7. Stiff problems  
8. Structure-preserving integrators  
9. Elliptic, parabolic, hyperbolic  
10. Finite differences  
11. Conservation and finite volumes  
12. Shocks, fluxes, limiters  
13. The weak form  
14. Your first finite element  
15. Elements, assembly, adaptivity  
16. Spectral accuracy and Gibbs  
17. Discontinuous Galerkin  

**Algebraic engine**

18. Iterative linear solvers  
19. Krylov methods  
20. Preconditioners  
21. Multigrid  
22. Newton and friends  
23. Eigenmodes as solvers  

**Particles and hybrids**

24. Randomness and Monte Carlo  
25. Metropolis and detailed balance  
26. Molecular dynamics  
27. Particle-in-cell  
28. Smoothed particles  
29. Material point method  
30. Discrete elements  
31. Nonlocal fracture (peridynamics / phase field)  

**Trust and scale**

32. Verification  
33. Validation and UQ  
34. Adjoints and inverse problems  
35. Multiphysics coupling  
36. Parallel solvers  
37. Surrogates that do not steal the residual  

**Domain studios** (after the method is known)

38. A compressible flow studio  
39. A large-deformation solid studio  
40. A Maxwell studio  
41. A quantum-solver studio  

Each studio is *the same ideas in new clothes*, plus the few native structures listed in §7.

---

## 13. Closing brief for lesson authors

When you design a computational-physics lesson, do not start with “explain MPM” or “explain GMRES.”

Start with:

1. What structure? (a transfer, a subspace, a flux, a weak residual, an invariant…)
2. What object can the learner move?
3. What question is unanswerable without moving it?
4. What wrong move is most likely, and how does the discrete world show it?
5. Simplest useful case? (1D, linear, two particles, two cells, two frequencies)
6. Same idea, different clothes?
7. What picture remains tomorrow?

Then write the sequence of solvables. Only then write the few sentences that name what they already did.

That is how this subject becomes Brilliant-class rather than a pretty encyclopedia of methods.

---

## Appendix — Method family cheat sheet (for authors)

| Family | Unknowns live on | Native strength | Native weakness | Hidden algebraic object |
|---|---|---|---|---|
| FDM | point values | simple, analysis-friendly | geometry, conservation care | sparse structured \(A\) |
| FVM | cell averages | conservation, shocks | high-order + geometry | residual of fluxes |
| FEM | coefficients of basis | geometry, elliptic, solids | shocks, large tangling | assembled sparse \(A\) |
| SEM / spectral | modal / GLL coeffs | smooth accuracy | discontinuities, complex domains | dense or block-structured \(A\) |
| DG | element-local coeffs + flux | high-order + conservation + unstruct. | cost, parameters | block-sparse \(A\) |
| BEM / MoM | boundary densities | exterior waves | dense \(A\), nonlinear media | dense / H-matrix |
| MD | particle phase space | atomistic dynamics | scale, rare events | force eval + tiny ODE |
| MC | samples | dimension, complex geometry | variance | estimator |
| PIC | particles + grid fields | kinetic plasma / charged flow | noise, grid heating | Poisson/Maxwell + push |
| LBM | discrete-velocity populations | simple parallel CFD | high-Ma, some BC | collide-stream map |
| SPH | kernel-smoothed particles | free surfaces, astrophysics | boundaries, consistency | neighbor sums |
| MPM | particles + reset grid | large-deformation continuum | cell-crossing, quadrature | grid \(A\) each step |
| DEM | rigid/soft bodies + contacts | granular contact | tiny \(\Delta t\), detection | contact network |
| Peridynamics | nodal bonds / states | spontaneous fracture | horizon, cost | nonlocal operator |
| Phase field | extra continuum field | interfaces, fracture | length-scale, stiffness | coupled PDE system |
| FDTD | staggered Yee fields | broadband EM | geometry staircasing, CFL | explicit leapfrog |
| QMC / DMRG | samples or tensors | correlated quantum | sign problem / bond dim | sampler or eigen-sweep |
| PINN / operator net | network weights | flexible domains, fast eval | verification, extrapolation | nonlinear opt |

Use the table as a *near-transfer engine*, not as a slide.
