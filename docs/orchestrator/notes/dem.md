# DEM — research notes (Agent 34)

Cundall & Strack 1979, Géotechnique 29 (BALL; spring–dashpot + Coulomb on 2D discs).
Silbert et al. 2001 PRE (linear spring–dashpot, $k_t = 2/7\,k_n$, granular heaps).
Luding 2008, Granular Matter (intro; contact as the constitutive law).
Brilliantov, Spahn, Hertzsch, Pöschel 1996 Physica A (viscoelastic collisions; $e(\zeta)$).

## Solvable chain

1. **Hook.** Two grains in a sandpile look like they touch. You never wrote Mohr–Coulomb. What is the force? (`dem-when-force`)
2. **Naive attempt.** A bulk yield surface. A Lennard-Jones well. A rigid constraint (they never overlap).
3. **The world talks back.** $F_n = k_n\delta - \gamma_n v_n$, and only while $\delta>0$. Coupled discs + $F(\delta)$. (`<DemLab mode="contact">`)
4. **Name the structure.** Contact is the constitutive law. Overlap is a penalty for rigidity, not continuum strain.
5. **Tighten.** Sketch the hockey-stick $F(\delta)$. (`dem-force-overlap`) Damping sets restitution $e=\exp(-\zeta\pi/\sqrt{1-\zeta^2})$. (`dem-restitution`) Rest overlap $\delta=mg/k_n\to 0$ as $k\to\infty$, and that is why $\Delta t$ dies. (`dem-rest-overlap`)
6. **Representation shift.** Frictionless discs spread; the slope is $\mu$ and rolling resistance, not a $\varphi$ you typed. (`dem-frictionless-pile`, `<DemLab mode="pile">`)
7. **Near-transfer.** Same contacts, a hopper. (`<DemLab mode="hopper">`) MD is a stored $V(r)$ at every distance; a hard constraint is SHAKE / event-driven; DEM is the penalty in between. (`dem-which-law`)
8. **Close.** Overlap → force. The pile’s slope is the contact law, once. (`dem-one-line`)

## Structure the learner must feel

A grain is a rigid body that is allowed a tiny overlap so a spring can stand in for rigidity. The bulk has no $\sigma(\varepsilon)$. Angle of repose, hopper discharge, a bounce — all of them are the same local law, counted out over a contact network. Soft-sphere DEM is a penalty method for the non-overlap constraint; take $k\to\infty$ and you recover rigidity and lose the explicit time step.

Contrast: [MD](../../../../content/paths/computational-physics/05-other-paradigms/03-molecular-dynamics.mdx) stores $V(r)$ at every $r$ (until a cutoff). [Constrained integration](../../../../content/paths/computational-physics/04-structure-preserving/03-constraints.mdx) puts $\delta=0$ inside the map. DEM is the middle: force only in overlap, and the overlap is the penalty.

## Tempting wrong belief

**DEM is MD with a different pair potential.** Secondary: **grains never overlap** (hard-sphere / continuum). Tertiary: **the angle of repose is a bulk parameter you prescribe.** Quaternary: **frictionless discs still make a sandpile.** Quinary: **$\Delta t$ is set by the pile’s free-fall.**

Misconceptions: `dem-is-md`, `dem-hard-no-overlap`, `dem-repose-is-written`, `dem-frictionless-slopes`, `dem-dt-from-free-fall`.

## Simplest useful case

Two equal discs, linear spring–dashpot, no friction. Overlap $\delta=2R-|x_i-x_j|$. $m^*=m/2$. Underdamped $\zeta=\gamma_n/(2\sqrt{k_n m^*})<1$:

$$
e = \exp\bigl(-\zeta\pi/\sqrt{1-\zeta^2}\bigr), \qquad t_c = \pi\big/\sqrt{k_n/m^*-(\gamma_n/2m^*)^2}.
$$

A grain on a floor at rest: $\delta=mg/k_n$. A small 2D pile: $\mu=\mu_r=0$ slumps; $\mu>0$ with rolling resistance holds a finite slope.

## Transfer costume

Hopper discharge (same contacts, a silo). Rotating drum. Particle–fluid coupling. DEM–FEM / DEM–MPM at a wall. Coarse-graining the contact network into a continuum stress (the inverse of this lesson).

## Numerics claims (each tested)

- $F_n=0$ for $\delta\le 0$; $F_n=k_n\delta$ at $v_n=0$, $\delta>0$.
- Two-particle bounce: measured $e$ matches $\exp(-\zeta\pi/\sqrt{1-\zeta^2})$ for underdamped linear spring–dashpot.
- Two-particle stack at rest: $\max\delta \approx \mathcal{O}(mg/k_n)$; raising $k_n$ by $100\times$ drops overlap by $\sim 100\times$.
- A small frictional pile’s angle of repose is finite and larger than the frictionless slump of the same seed.

## Sources

- P. A. Cundall & O. D. L. Strack, *Géotechnique* **29** 47 (1979).
- L. E. Silbert, D. Ertaş, G. S. Grest, T. C. Halsey, D. Levine, S. J. Plimpton, *Phys. Rev. E* **64** 051302 (2001).
- S. Luding, *Granular Matter* **10** 235 (2008).
- N. V. Brilliantov, F. Spahn, J.-M. Hertzsch, T. Pöschel, *Physica A* **231** 417 (1996).
- J. Ai, J.-F. Chen, J. M. Rotter, J. Y. Ooi, *Powder Technol.* **206** 269 (2011). Rolling resistance.

## Tomorrow picture

Overlap → force. The pile’s slope is the constitutive law.
