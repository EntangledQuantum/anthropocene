# Variational integrators — research notes (Agent 5)

## Solvable chain

1. **Hook.** Pendulum blob on the amber separatrix. Neighbouring ICs diverge (librate vs rotate). Predict what still holds after Verlet shears the blob into a filament.
2. **Naive attempt.** Discretise Newton, then try to impose conservation afterwards. That is RK4's move, and it fails on long orbits.
3. **The world talks back.** Write a midpoint-velocity discrete Lagrangian (kinetic at `(q₁−q₀)/h`, potential averaged at the endpoints). Demand stationarity. Predict which update you get.
4. **Name the structure.** Discrete Euler–Lagrange, discrete Legendre transform. The stationary path *is* velocity Verlet. Area preservation and bounded energy are corollaries, not extra constraints.
5. **Tighten.** Discrete Noether: a symmetry of `L_d` gives a momentum exact to machine precision. Predict which continuous conserved quantity survives a fixed-`h` discretisation (spatial momenta) and which does not (energy — time-translation is broken by picking `h`).
6. **Representation shift.** The same discrete action is invariant under reversing the path, so the map satisfies `Φ_h⁻¹ = Φ_{-h}`. Predict where you land after run-forward, flip velocities, run-forward.
7. **Near-transfer.** Classify: angular momentum / linear momentum / energy / area / orbital phase — exact, bounded, or lost.
8. **Optional edge.** Constraints, collisions, Lie groups: variational is how you extend past "impose symplectic by hand".
9. **Close.** Discretise the principle, not the ODE. Spatial symmetries of `L_d` survive; time-translation does not. Verlet was this method all along.

## Structure the learner must feel

A broken path — straight segments in `q`, not a smooth curve — still has an action. Stationarity of that discrete action *is* the integrator. Conservation then comes from symmetries of the discrete action, the same way Noether works continuously, except the symmetries that survive are only those `L_d` still has.

## Tempting wrong belief

Discretise Newton's equations, then add conservation as a constraint (or hope order of accuracy is enough). Related: if the method is "structure preserving", *every* continuous invariant becomes exact. Energy is the one that does not: the discrete action lives on a fixed step `h` and is not invariant under continuous time shifts.

Misconceptions to name: `discretise-then-constrain`, `every-invariant-survives`, `verlet-is-a-hack`, `reversible-means-accurate`, `reversible-means-energy`.

## Simplest useful case

Unit-mass mechanical Lagrangian `L = ½|q̇|² − V(q)`. Symmetric discrete Lagrangian (Marsden & West 2001, §2.6.2)

```
L_d(q₀, q₁, h) = (h/2) L(q₀, (q₁−q₀)/h) + (h/2) L(q₁, (q₁−q₀)/h)
               = (1/(2h)) |q₁−q₀|² − (h/2)(V(q₀)+V(q₁))
```

Discrete EL recovers Störmer–Verlet; the discrete Legendre transform recovers velocity Verlet. Two unit masses with `V(|q_a − q_b|)` is the translation-Noether case (total linear momentum exact). Kepler is the rotation-Noether costume (angular momentum exact, energy only bounded).

## Transfer costume

Kepler: rotational symmetry of `V = −1/r` survives in `L_d`, so `x v_y − y v_x` is constant to roundoff. The same run's energy oscillates at `O(h²)`. Same idea, gravity clothing.

## Numerics claims (need tests)

- The discrete-Lagrangian map on `(q, p)` matches `velocityVerlet` from `ode.ts` to ~1e-14 (oscillator, pendulum, Kepler). Do not reimplement Verlet in the widget; compare against the existing stepper.
- Discrete EL residual along that trajectory is ~0.
- Kepler angular momentum conserved to ~1e-12 over thousands of steps; RK4's is not.
- Two-particle pairwise spring: total linear momentum to ~1e-12.
- Energy is *not* conserved to that tolerance (sits at `O(h²)`), but the envelope does not grow with time — pin this on the variational map, not a copy of the sibling's Verlet-vs-RK4 drift test.
- Time-reversibility: `Φ_{-h} ∘ Φ_h = id` and `R ∘ Φ_h ∘ R ∘ Φ_h = id` to ~1e-12 for the discrete-Lagrangian map; RK4 fails both.

## Sources

- Marsden & West, *Discrete mechanics and variational integrators*, Acta Numerica 10 (2001), §§1.3, 1.3.3 (discrete Noether), 2.6.1–2.6.2 (midpoint rule vs Störmer–Verlet). Verlet is the symmetric average of the two rectangle-rule discrete Lagrangians, *not* the midpoint quadrature of `L` (that one is implicit midpoint). The kinetic term uses the midpoint velocity `(q₁−q₀)/h`; that is the "midpoint" in the assignment.
- Hairer, Lubich, Wanner, *Geometric Numerical Integration*, ch. VI.6; Hairer/Lubich/Wanner, *GNI illustrated by the Störmer–Verlet method*, Acta Numerica 12 (2003) — reversibility, four proofs of symplecticity including the variational one.
