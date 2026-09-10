# Molecular dynamics — research notes (Agent 8)

## Solvable chain

1. **Hook.** Thirty-six particles, a pair potential, a long run. RK4 is fourth order; Verlet is second. Which method, and why? (`md-why-verlet`)
2. **Naive attempt.** Pick RK4 because it is more accurate, or because a gas has no "orbit" to conserve.
3. **The world talks back.** A 2D Lennard-Jones gas: T and P emerge as noisy time averages of a symplectic map. Energy is a band, not a number. (`<LJGas>`)
4. **Name the structure.** Temperature is mean kinetic energy. Pressure is kinetic plus virial. Thermodynamics is what the map conserves, averaged.
5. **Tighten.** Hunt the density where attractions cancel the kinetic pressure — P = 0. (`md-density-pressure`)
6. **Representation shift.** Same state, two views: particles (colour = speed) and the E / T traces. Thermostat on: T pins, the energy band walks.
7. **Near-transfer.** Predict what the thermostat does to the conserved quantity, then toggle it. (`md-thermostat-energy`)
8. **Edge.** Sort integrator vs thermostat vs the potential. (`md-thermostat-vs-integrator`) Nosé–Hoover as the honest extended-Hamiltonian case (`<Tier frontier>`).
9. **Close.** Thermodynamics is a time average of a symplectic map; a thermostat is a modification of the dynamics. (`md-thermostat-modifies-dynamics`)

## Structure the learner must feel

A gas has no temperature knob. You integrate Newton's laws with a pair potential. After enough steps, the kinetic energy fluctuates around a number — that number *is* T. The virial of the forces plus the kinetic pressure *is* P. Macroscopic thermodynamics is a time average of a symplectic discrete map.

Turn on a thermostat and you have changed the map. The band Verlet was protecting is no longer a conserved quantity of the dynamics you are running.

## Tempting wrong belief

- Higher-order RK4 is the better integrator for MD (order ≠ long-term structure; also 4× force evaluations).
- A gas has no orbit, so energy conservation is optional.
- A thermostat that holds T also holds E.
- The thermostat *is* the integrator.

Misconceptions: `md-order-beats-structure`, `md-thermostat-conserves-energy`, `md-temperature-is-an-input`.

## Simplest useful case

Two particles in a periodic square. Minimum-image distance, not the naive one, decides the force. A 4-particle LJ cluster in a large box is the NVE energy test. 36 particles is the picture.

## Transfer costume

A planetary N-body (same symplectic map, gravity instead of LJ) and a Langevin colloid (a different thermostat: stochastic, not extended-Hamiltonian). Same moral: the ensemble is a property of the *dynamics you chose*, not a post-processing of the trajectory.

## Numerics claims (each tested)

- Pair LJ force/energy match the analytic 12-6 formula.
- Periodic minimum-image: two particles across a seam feel the short image, not the long one.
- NVE velocity Verlet on a tiny LJ cluster: mechanical energy is bounded (late peak matches early peak).
- The same run with a velocity-rescaling thermostat targeting a different T: mechanical energy is *not* similarly bounded — it walks.
- Nosé–Hoover: the mechanical energy fluctuates (canonical); if we track the extended quantity it is a *different* conserved object. Be honest: velocity rescaling has no shadow Hamiltonian at all.

## Sources

- Daan Frenkel & Berend Smit, *Understanding Molecular Simulation* (Academic Press). Ch. 4 Verlet / why symplectic; Ch. 6 thermostats (Andersen, Nosé–Hoover, chains). Appendix B: Nosé–Hoover is non-Hamiltonian in the original variables.
- Loup Verlet, *Computer "experiments" on classical fluids. I. Thermodynamical properties of Lennard-Jones molecules*, Phys. Rev. **159** 98 (1967).
- S. Nosé, *A unified formulation of the constant temperature molecular dynamics methods*, J. Chem. Phys. **81** 511 (1984); W. G. Hoover, *Canonical dynamics: Equilibrium phase-space distributions*, Phys. Rev. A **31** 1695 (1985).
- The original energy is not conserved under a thermostat *on purpose*: NVT is a different ensemble. Nosé–Hoover conserves an extended Hamiltonian H + Qξ²/2 + g kT ln s, not H. Velocity rescaling (Berendsen) conserves neither.

## Tomorrow picture

Thermodynamics as a time average of a symplectic map; a thermostat as a modification of the dynamics. Particles buzzing, a flat energy band, then the band walking the moment T is pinned.
