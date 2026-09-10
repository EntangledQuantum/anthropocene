# Constrained integration — research notes (Agent 10)

## Solvable chain

1. **Hook.** Cartesian pendulum, constraint already in the ODE (index-reduced: differentiate \(g=0\) twice, solve for \(\lambda\)). Hand that ODE to RK4. Predict: does the particle stay on the circle?
2. **Naive attempt.** It leaves. The tempting fix: divide by \(|q|\) after every step. Predict whether that is SHAKE.
3. **The world talks back.** SHAKE solves \(g(q_{n+1})=0\) for the multiplier *inside* the Verlet step, force along \(\nabla g(q_n)\). Renormalising pulls along \(\nabla g(q_{n+1})\) *after* a different map. Same circle, two maps. Residual traces make the gap visible.
4. **Name the structure.** A constraint of the continuous flow is not a constraint of a discrete map unless the map is built to land on it. The multiplier is part of the update, not a cleanup.
5. **Tighten.** SHAKE hits \(g=0\); the hidden constraint \(\dot g = q\cdot v = 0\) is only \(O(h^2)\). RATTLE hits both — the state stays on the tangent bundle \(TM\). Sketch SHAKE's \(q\cdot v\).
6. **Representation shift.** A rotation matrix integrated entrywise by RK4 leaves \(SO(3)\). \(R^\top R \neq I\) is not a slightly wrong rotation; it stretches lengths. Lie-group step \(R \leftarrow R\exp(h\hat\omega)\) never leaves. Cube shears vs cube stays a cube.
7. **Near-transfer.** Classify maps: leave \(M\) / on \(M\) not \(TM\) / on \(TM\). Rank by how much of the constraint the discrete map actually knows.
8. **Optional edge.** Naive projection can sit on \(TM\) and still be the wrong map (not symplectic). Variational SHAKE is a constrained discrete action. Index of DAEs.
9. **Close.** The constraint is part of the discrete map, not a cleanup. A rotation that left \(SO(3)\) is a different object.

## Structure the learner must feel

The circle (or \(SO(3)\)) is not a property of the *solution* that accuracy will protect. It is a property of the *map*. If the update is not required to land on it, the next state is a different mechanical object — a free particle near a circle, a linear map near a rotation.

## Tempting wrong belief

"Put the constraint in the ODE (index reduction) and a good integrator will stay on it. If it drifts a little, divide by \(|q|\) / Gram–Schmidt — that *is* the constraint." Related: a matrix with \(R^\top R \approx I\) is still a rotation, just slightly wrong.

Misconceptions to name: `index-reduction-enough`, `renorm-is-shake`, `slightly-wrong-rotation`, `cleanup-after`.

## Simplest useful case

Unit-mass planar pendulum in Cartesian coordinates. Holonomic constraint

\[
g(q)=\tfrac12(x^2+y^2-1)=0,\qquad \nabla g = q,\qquad \dot g = q\cdot v.
\]

Gravity \(f=(0,-1)\). Index reduction: \(\lambda = |v|^2 + q\cdot f\), \(a = f - \lambda q\). That ODE's flow stays on the circle; RK4's discrete map does not.

SHAKE (Ryckaert–Ciccotti–Berendsen 1977) / RATTLE (Andersen 1983): Verlet with \(\lambda\) chosen so \(g(q_{n+1})=0\). RATTLE also chooses \(\mu\) so \(q_{n+1}\cdot v_{n+1}=0\). For this spherical constraint the velocity correction is exactly the tangent projection of the Verlet-completed velocity. One constraint, scalar Newton for \(\lambda\).

## Transfer costume

Kinematics on \(SO(3)\): \(\dot R = R\hat\omega\) with *constant* \(\omega\). No dynamics needed. RK4 on the nine entries leaves the group; \(R_{n+1}=R_n\exp(h\hat\omega)\) (Rodrigues) stays. A wireframe cube shears when \(R^\top R\neq I\). Same idea, rotation clothing.

## Numerics claims (need tests)

- Index-reduced RK4: \(|g|\) after a moderate run is many orders above roundoff (secular manifold drift). Forward Euler is worse.
- SHAKE: \(|g|\) at roundoff (\(\sim 10^{-14}\)); \(|q\cdot v|\) is \(O(h^2)\), not machine zero.
- RATTLE: both \(|g|\) and \(|q\cdot v|\) at roundoff.
- Naive RK4-then-project: on \(TM\) (\(|g|\) and \(|q\cdot v|\) tiny) but the state diverges from RATTLE — a different map.
- RATTLE energy envelope is bounded (no secular growth); this is the symplectic fact (Leimkuhler–Skeel 1994), not a re-teaching of Verlet-vs-RK4.
- RATTLE is second order against a fine constrained reference.
- Rodrigues \(\exp(\hat\omega)\in SO(3)\): \(R^\top R=I\), \(\det R=+1\).
- RK4 on \(\mathrm{vec}(R)\): \(\|R^\top R-I\|_F\) grows; Lie-group step stays at roundoff.
- Gram–Schmidt after RK4 sits on \(SO(3)\) but is not the Lie-group trajectory.

## Sources

- Ryckaert, Ciccotti, Berendsen, *Numerical integration of the cartesian equations of motion of a system with constraints: molecular dynamics of n-alkanes*, J. Comput. Phys. 23 (1977). SHAKE.
- Andersen, *Rattle: a “velocity” version of the Shake algorithm*, J. Comput. Phys. 52 (1983).
- Leimkuhler & Skeel, *Symplectic numerical integrators in constrained Hamiltonian systems*, J. Comput. Phys. 112 (1994). SHAKE ≡ RATTLE as maps on \(T^*M\) at half-steps; both symplectic.
- Hairer, Lubich, Wanner, *Geometric Numerical Integration*, §VII.1.4 and §V.5 (Shake and Rattle); Hairer, *Numerical methods for ODEs on manifolds* (poly-sde-mani). RATTLE is symmetric, symplectic, order 2.
- McLachlan, Modin, Verdier, Wilkins, *Geometric generalisations of SHAKE and RATTLE*, FoCM 14 (2014), arXiv:1207.3367.
- Munthe-Kaas, *Runge–Kutta methods on Lie groups*, BIT 38 (1998). The exponential update is the order-1 case; RKMK is the higher-order lift.
- Hairer, Lubich, Wanner, §IV / rigid body: \(R_{n+1}=R_n\exp(h\hat\omega)\) stays in \(SO(3)\) by construction.
