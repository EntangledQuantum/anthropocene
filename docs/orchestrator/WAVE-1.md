# Wave 1 assignments — one topic per agent

Orchestrator owns merge, `LEARNING-PLAN.md`, and `PLATFORM-GAPS.md`.
Agents work in isolated worktrees and commit there.

General notes: `docs/orchestrator/AGENT-BRIEFING.md`.
Curriculum file: `docs/computational-physics-curriculum.md`.

---

## Agent 1 — Conditioning versus stability

- **Curriculum:** lines **106–113** (A2 remainder) and **115–124** (error kinds, as clothing). Identity line **80**.
- **Lesson file:** `content/paths/computational-physics/01-numerical-reality/02-conditioning-vs-stability.mdx`
- **Concepts to own:** `conditioning`, `numerical-stability`
- **Requires (already taught):** `floating-point`, `catastrophic-cancellation`
- **Owned files:** that MDX; `content/concepts/conditioning.yaml`; `content/concepts/numerical-stability.yaml`; new numerics helpers + tests you add (prefer `src/lib/numerics/linalg.ts` append, or a new `conditioning.ts`); scenario registry entries you add.
- **Required interactives (LEARNING-PLAN):**
  - `<Classify>` sorting symptoms into *bad problem* vs *bad algorithm*
  - A slider / `<Tune>` that perturbs the input of a nearly singular 2×2 so the answer swings while the algorithm stays fixed
  - Canonical worked case: naive vs rearranged quadratic formula (cancellation as unstable *algorithm*)
- **Tomorrow picture:** κ as a stretch of the input disk; a stable algorithm hits a nearby problem, an unstable one does not.
- **Research seeds:** Trefethen & Bau *Numerical Linear Algebra* (conditioning vs stability); Higham *Accuracy and Stability*; the quadratic formula rearrangement.

---

## Agent 2 — Richardson + complex-step

- **Curriculum:** lines **126**, **195–204** (B2).
- **Lesson file:** `content/paths/computational-physics/02-derivatives/02-richardson-and-complex-step.mdx`
- **Concepts to own:** `richardson-extrapolation`, `complex-step-differentiation`
- **Requires:** `central-difference`, `order-of-accuracy`, `truncation-roundoff-tradeoff`
- **Owned files:** that MDX; those two concept YAMLs; append to `src/lib/numerics/diff.ts` if Richardson is not already there; tests; scenario entries.
- **Required interactives (LEARNING-PLAN):**
  - A Richardson tableau the learner fills by choosing which two rows to combine (use `<Classify>` / `<RankOrder>` / a small custom if needed — no code writing)
  - `<DerivativeLab>` with the complex-step curve enabled so the right-hand (roundoff) branch **refuses to appear**
- **Tomorrow picture:** two wrong answers, algebraically combined, cancel the leading error; complex-step never subtracts.
- **Research seeds:** Richardson 1911 / Romberg; Squire & Trapp 1998 complex-step; Martins, Sturdza, Alonso.

---

## Agent 3 — Stiffness and implicit methods

- **Curriculum:** lines **336–345** (B5.3). A-stability slogan line **80**.
- **Lesson file:** `content/paths/computational-physics/03-ode-solvers/03-implicit-and-stiffness.mdx`
- **Concepts to own:** `backward-euler`, `a-stability`, `stiffness`
- **Requires:** `forward-euler`, `rk4`
- **Owned files:** that MDX; those three concept YAMLs; `src/lib/numerics/ode.ts` append only if a method is missing (backward Euler / trapezoid already exist); tests; scenarios.
- **Required interactives (LEARNING-PLAN):**
  - `<StabilityExplorer>` with implicit methods — the region swallowing the left half-plane **is** the lesson
  - A two-timescale system where the learner picks a step size and watches explicit methods die (`<SolverLab>` / `<Tune>` / `<Predict>`)
- **Reuse:** `vanDerPol` in `problems.ts` is a stiff-ish oscillator; you may add a linear two-rate `y' = -λ y` pair. `newtonSolve` is already why implicit steps work — show it, do not hide it.
- **Tomorrow picture:** stability region covering the left half-plane; explicit methods dying on the fast transient they do not care about.
- **Research seeds:** Hairer & Wanner *Solving Ordinary Differential Equations II*; Dahlquist A-stability; L-stability vs A-stability (implicit trapezoid rings, backward Euler damps).

---

## Agent 4 — Adaptive stepping / embedded pairs

- **Curriculum:** lines **327–334** (B5.2 adaptive).
- **Lesson file:** `content/paths/computational-physics/03-ode-solvers/04-adaptive-stepping.mdx`
- **Concepts to own:** `adaptive-stepping`, `embedded-pairs`
- **Requires:** `rk4`, `butcher-tableau`, `local-truncation-error`
- **Owned files:** that MDX; those two concept YAMLs; new `src/lib/numerics/` embedded-pair stepper + tests (do not break existing RK4); scenarios.
- **Required interactives (LEARNING-PLAN):**
  - Step-size trace over a sharp transient; learner drags a tolerance and watches h adapt
  - `<RankOrder>` on which tolerance settings produce which cost
- **Tomorrow picture:** two weight rows on the same stages; a step-size sawtooth that tightens at the transient and relaxes after.
- **Research seeds:** Dormand & Prince 1980; Hairer/Nørsett/Wanner I; PI step-size control (Gustafsson); SciPy RK45 / ode45 semantics of atol/rtol.

---

## Agent 5 — Variational integrators

- **Curriculum:** lines **355–364** (B5.5 remainder). Discrete Noether.
- **Lesson file:** `content/paths/computational-physics/04-structure-preserving/02-variational-view.mdx`
- **Concepts to own:** `variational-integrators`, `time-reversibility`
- **Requires:** `velocity-verlet`, `hamiltonian-systems`, `shadow-hamiltonian`
- **Owned files:** that MDX; those two concept YAMLs; tests that a discrete Lagrangian recovers Verlet and conserves a Noether momentum; scenarios.
- **Required interactives (LEARNING-PLAN):**
  - `<PhaseFlow>` on the pendulum with the blob on the separatrix
  - `<Predict>` which conserved quantity survives discretisation and which does not
- **Tomorrow picture:** least action on a broken path → discrete Euler–Lagrange; Verlet was variational all along.
- **Research seeds:** Marsden & West 2001; Hairer/Lubich/Wanner *Geometric Numerical Integration*.

---

## Agent 6 — Spectral methods

- **Curriculum:** lines **595–606** (C5) and **383–391** (B6, fingerprints only).
- **Lesson file:** `content/paths/computational-physics/05-other-paradigms/01-spectral-methods.mdx`
- **Concepts to own:** `spectral-methods`
- **Requires:** `central-difference`, `order-of-accuracy`
- **Owned files:** that MDX; `content/concepts/spectral-methods.yaml`; new numerics for Fourier/Chebyshev diff + tests; scenarios / a lab if needed.
- **Required interactives (LEARNING-PLAN):**
  - Learner builds a function from Fourier modes, watches exponential accuracy
  - Then adds one discontinuity and watches the rate collapse to first order (Gibbs)
- **Tomorrow picture:** error falling off a cliff until a kink, then a wall.
- **Research seeds:** Trefethen *Spectral Methods in MATLAB*; Gibbs phenomenon visuals.

---

## Agent 7 — Monte Carlo integration

- **Curriculum:** lines **394–402** (B7) and **707–713** (D4.1). Do **not** also write Metropolis/Ising (D4.2) — that is a later lesson.
- **Lesson file:** `content/paths/computational-physics/05-other-paradigms/02-monte-carlo.mdx`
- **Concepts to own:** `monte-carlo-integration`
- **Requires:** `floating-point`
- **Owned files:** that MDX; that concept YAML; MC estimator + tests for the 1/√N rate and the dimension crossover vs grid quadrature; scenarios.
- **Required interactives (LEARNING-PLAN):**
  - Grid quadrature vs Monte Carlo as dimension climbs; the crossover **is** the lesson
  - `<SketchCurve>` the O(N^{-1/2}) error curve before seeing it
- **Tomorrow picture:** a log-log slope of −1/2 that does not care about dimension; a grid that dies.
- **Research seeds:** Caflisch Monte Carlo; curse of dimensionality; quasi-MC as optional `<Tier frontier>` only.

---

## Agent 8 — Molecular dynamics

- **Curriculum:** lines **679–691** (D2).
- **Lesson file:** `content/paths/computational-physics/05-other-paradigms/03-molecular-dynamics.mdx`
- **Concepts to own:** `molecular-dynamics`
- **Requires:** `velocity-verlet`, `energy-drift`
- **Owned files:** that MDX; that concept YAML; a small 2D LJ gas (canvas or GPU) driven from numerics; tests that Verlet bounds energy and a thermostat that is not symplectic visibly changes the energy story; scenarios.
- **Required interactives (LEARNING-PLAN):**
  - 2D Lennard-Jones gas; temperature/pressure emerging from particles
  - Thermostat toggle that **visibly breaks** symplecticity
- **Pyodide:** do not enable `runtime: 'python'` in this wave unless the lesson genuinely cannot run without numpy. Prefer JS numerics.
- **Tomorrow picture:** thermodynamics as a time average of a symplectic map; a thermostat as a modification of the dynamics.
- **Research seeds:** Frenkel & Smit; Verlet 1967; Nosé–Hoover as the thermostat that breaks the shadow Hamiltonian.

---

## Agent 9 — Gradients through physics (Wave 1c — DO NOT LAUNCH until Agent 2 has merged)

Blocked: `requires: complex-step-differentiation`, which Agent 2 owns.

- **Curriculum:** lines **989–995** (E6), **1028–1034** (E9). Thesis principle: do not lift the residual.
- **Lesson file:** `content/paths/computational-physics/05-other-paradigms/04-differentiable-simulation.mdx`
- **Concepts:** `automatic-differentiation`, `differentiable-simulation`, `physics-informed-nn`
- **Interactive (LEARNING-PLAN):** inverse problem — drag a target trajectory, watch gradient descent recover parameters. PINNs as a `<Tier frontier>` that still checks a residual.

---

## Merge order (orchestrator)

1. Agent 1 (conditioning)
2. Agent 2 (Richardson) — unblocks Agent 9
3. Agent 3 (stiffness)
4. Agent 4 (adaptive)
5. Agent 5 (variational)
6. Agent 6 (spectral)
7. Agent 7 (Monte Carlo)
8. Agent 8 (MD)
9. Agent 9 (diffsim) after 2

Conflicts expected on `src/lib/numerics/ode.ts`, scenario registries, and tests. Orchestrator resolves; agents append.
