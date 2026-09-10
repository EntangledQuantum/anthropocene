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
- ✅ Conditioning versus stability — κ of the problem vs stability of the algorithm

### To write
*(none — chapter 1 is live)*

---

## Chapter 2 — Derivatives Without Calculus

### Written
- ✅ Differentiating a function you can only sample — the U-curve
- ✅ Buying an order for free — Richardson tableau + complex-step (no roundoff branch)

### To write
*(none — chapter 2 is live)*

---

## Chapter 3 — ODE Solvers, One by One

### Written
- ✅ Forward Euler, and why it is not enough
- ✅ RK4, and where the magic numbers come from
- ✅ Stiffness — backward Euler, A-stability, L-stability, two-rate blow-up
- ✅ Letting the solver choose the step — embedded pairs, Dormand–Prince, PI control

### To write
*(none — chapter 3 is live)*

---

## Chapter 4 — Structure-Preserving Integrators

### Written
- ✅ Why a worse method gives a better orbit — symplecticity, shadow Hamiltonian
- ✅ Discretising the action instead of the equations — discrete EL, Noether, Verlet recovered

### To write
- [ ] **Constrained and rigid-body motion**
  RATTLE/SHAKE, quaternion integration, staying on the manifold.
  **Interactive:** a rotating body integrated with and without renormalisation, showing the
  rotation matrix drift off SO(3).

---

## Chapter 5 — The Other Paradigms

### Written
- ✅ Solving in frequency space — spectral accuracy vs Gibbs
- ✅ When randomness beats determinism — MC vs grid, 1/√N (Metropolis is later)
- ✅ Thermodynamics from mechanics — 2D LJ gas, thermostat breaks symplecticity
- ✅ Gradients through physics — adjoint inverse problem; PINN still checks a residual

### To write
*(none — chapter 5 first pass is live. Metropolis / QMC / neural-ODE depth wait for gym variants.)*

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
- [ ] **`<Derive>` widget** — a derivation where each step is a choice and wrong branches
  render the counterfactual algebra.
- [ ] **Per-concept mastery on `/graph`** — colour each node by FSRS stability so the
  graph doubles as a map of what you actually retain.
