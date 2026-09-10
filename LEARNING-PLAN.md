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
- ✅ Staying on the manifold — SHAKE/RATTLE, SO(3), the constraint is the map

### To write
*(none — chapter 4 first pass is live. Contacts / non-smooth mechanics wait.)*

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

## Chapter 6 — Fields and Continua

### Written
- ✅ From particles to fields — continuum limit; elliptic / parabolic / hyperbolic
- ✅ When the grid explodes — CFL triangle, FTCS, upwind smear, heat r = 1/2
- ✅ Boundaries are different animals — ghost points encode the BC
- ✅ Your first finite element — 1D hats, assembly, irregular vs skip-neighbour
- ✅ Making a velocity field incompressible — Helmholtz / pressure Poisson
- ✅ Particles that borrow a grid — MPM P2G/G2P, the mesh is thrown away

### To write
- ✅ What is conserved, cell by cell — telescoping fluxes, Rankine–Hugoniot
- [ ] **Fluids beyond projection** — advection schemes, MAC details as gym variants.

---

## Beyond computational physics

Paths worth creating once the first one is complete. Each becomes a directory under
`content/paths/` the moment its first lesson is scaffolded.

- ✅ **Linear Algebra, Computationally** — first lesson live: a matrix is a discrete operator.
- [ ] Jacobi smoothing and Krylov/CG (Wave 5). Then QR/SVD, preconditioners.
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
