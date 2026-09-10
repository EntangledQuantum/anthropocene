# LEARNING-PLAN.md — the to-write queue

**This file is a queue, not an archive.** When a lesson ships, delete its entry from
here. If this file ever describes something that already exists, it is wrong.

The ordering is the learning journey: basic → advanced, top to bottom. Anything in
**Written** is already live and listed only so you can see the shape of the path.

Two other sources of truth sit alongside this file, and they are generated rather than
maintained:

- **`/graph`** and `npm run content:gaps` list concepts that a lesson *requires* but no
  lesson *teaches*. Those are hard gaps and they cannot go stale.
- This file holds the intent that no build step can infer — what should exist, in what
  order, and why.

---

## How to work this queue

```bash
npm run content:gaps          # what is structurally missing right now
```

1. Pick the topmost unwritten entry whose prerequisites are already written.
2. Scaffold it:
   ```bash
   npm run new:lesson -- --path <path> --chapter <chapter> --id <NN-slug> \
     --title "..." --teaches a,b --requires c,d --minutes 25
   ```
3. Write it against the formula in **AGENTS.md**.
4. `npm run content:check && npm test && npm run build`
5. **Delete the entry from this file** in the same commit that adds the lesson.

---

# Computational Physics

## Chapter 1 — Numerical Reality

### Written
- ✅ The numbers you do not have — floating point, machine epsilon, cancellation

### To write
- [ ] **Conditioning versus stability** *(outlined, `01-numerical-reality/02-...`)*
  Currently a stub. Needs: the condition number as a property of the question; backward
  stability; the quadratic formula as the canonical unstable-algorithm example.
  **Interactive:** a `<Classify>` sorting symptoms into *bad problem* vs *bad algorithm*,
  and a slider that perturbs the input of a nearly singular system so the learner watches
  the answer swing while the algorithm stays fixed.

---

## Chapter 2 — Derivatives Without Calculus

### Written
- ✅ Differentiating a function you can only sample — the U-curve

### To write
- [ ] **Buying an order for free** *(outlined, `02-derivatives/02-...`)*
  Richardson extrapolation and complex-step differentiation.
  **Interactive:** a Richardson tableau the learner fills by choosing which two rows to
  combine, plus the existing `<DerivativeLab>` with the complex-step curve enabled so the
  right-hand branch visibly refuses to appear.

---

## Chapter 3 — ODE Solvers, One by One

### Written
- ✅ Forward Euler, and why it is not enough
- ✅ RK4, and where the magic numbers come from

### To write
- [ ] **Stiffness, and evaluating the slope where you are going** *(outlined, `03-...`)*
  Backward Euler, A-stability, L-stability, why Newton and not fixed-point iteration.
  **Interactive:** reuse `<StabilityExplorer>` with implicit methods selected — the region
  swallowing the left half-plane is the whole lesson. Add a two-timescale system where the
  learner picks a step size and watches explicit methods die.
- [ ] **Letting the solver choose the step** *(outlined, `03-...`)*
  Embedded pairs, Dormand–Prince, the PI controller, tolerance semantics.
  **Interactive:** a step-size trace over a problem with a sharp transient; the learner
  drags a tolerance and watches step size adapt. `<RankOrder>` on which tolerance settings
  produce which cost.

---

## Chapter 4 — Structure-Preserving Integrators

### Written
- ✅ Why a worse method gives a better orbit — symplecticity, shadow Hamiltonian

### To write
- [ ] **Discretising the action instead of the equations** *(outlined, `04-...`)*
  Variational integrators, discrete Euler–Lagrange, the discrete Noether theorem.
  **Interactive:** `<PhaseFlow>` on the pendulum with the blob placed on the separatrix,
  plus a `<Predict>` on which conserved quantity survives discretisation and which does not.
- [ ] **Constrained and rigid-body motion**
  RATTLE/SHAKE, quaternion integration, staying on the manifold.
  **Interactive:** a rotating body integrated with and without renormalisation, showing the
  rotation matrix drift off SO(3).

---

## Chapter 5 — The Other Paradigms

### To write *(all outlined)*
- [ ] **Solving in frequency space** — spectral methods, Gibbs, Chebyshev.
  **Interactive:** a function the learner builds from Fourier modes, watching accuracy go
  exponential — then adding one discontinuity and watching it collapse to first order.
- [ ] **When randomness beats determinism** — Monte Carlo, MCMC, quasi-MC.
  **Interactive:** grid quadrature vs Monte Carlo as dimension climbs; the crossover is
  the lesson. `<SketchCurve>` the O(N^-1/2) error curve before seeing it.
- [ ] **Thermodynamics from mechanics** — molecular dynamics, thermostats, ergodicity.
  **Interactive:** a 2D Lennard-Jones gas on the GPU; temperature and pressure emerging
  from particle motion, with a thermostat toggle that visibly breaks symplecticity.
- [ ] **Gradients through physics** — autodiff, adjoints, neural ODEs, PINNs.
  **Interactive:** an inverse problem where the learner drags a target trajectory and
  watches gradient descent recover the parameters that produce it.

---

## Chapter 6 — Fields and Continua *(chapter does not exist yet)*

The path currently stops at ODEs and paradigms. PDEs are the obvious next continent.

- [ ] **From particles to fields** — the continuum limit, and what a PDE is.
- [ ] **Heat, waves, and the CFL condition** — explicit vs implicit in space and time.
  **Interactive:** a 1D wave/heat solver where the learner drags the CFL number across the
  stability threshold and watches the grid explode.
- [ ] **Finite differences on grids** — stencils, boundary conditions, ghost cells.
- [ ] **Finite elements, briefly** — weak forms, basis functions, why irregular geometry
  changes everything.
- [ ] **Fluids** — advection, incompressibility, the pressure projection.
  **Interactive:** GPU stable-fluids the learner can stir.
- [ ] **The Material Point Method (MPM)** — hybrid particle/grid transfer, why it handles
  large deformation, snow and sand and elastoplasticity. This is where "particles" and
  "fields" stop being separate chapters.
  **Interactive:** a GPU MPM sandbox — drop deformable blocks, change the constitutive
  model, watch the particle-to-grid transfer.

---

## Beyond computational physics

Paths worth creating once the first one is complete. Each becomes a directory under
`content/paths/` the moment its first lesson is scaffolded.

- [ ] **Linear Algebra, Computationally** — conditioning, QR/SVD, iterative solvers,
  Krylov methods. The natural prerequisite path for almost everything above.
- [ ] **Probability and Inference** — from sampling to Bayesian computation.
- [ ] **Optimisation** — convexity, gradient methods, second-order methods, constraints.
- [ ] **Signals and Transforms** — Fourier, wavelets, sampling, aliasing.
- [ ] **Information Theory** — entropy, coding, channel capacity.
- [ ] **Quantum Computing** — amplitudes, interference, the standard algorithms.

---

## Platform work

Not lessons, but things the queue depends on.

- [ ] **A `runtime: 'python'` lesson.** Pyodide is wired but nothing opts in. The
  molecular-dynamics or Monte Carlo lesson is the natural first user — real numpy where
  the learner would genuinely reach for it.
- [ ] **`<Estimate>` widget** — order-of-magnitude reasoning on a log slider, graded on
  being within a factor. Fermi estimation is a skill nothing here currently tests.
- [ ] **`<Derive>` widget** — a derivation where each step is a choice and wrong branches
  render the counterfactual algebra.
- [ ] **Per-concept mastery on `/graph`** — colour each node by FSRS stability so the
  graph doubles as a map of what you actually retain.
