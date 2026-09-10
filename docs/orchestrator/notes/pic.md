# PIC — research notes (Agent 29)

Birdsall & Langdon, *Plasma Physics via Computer Simulation* (1991), ch. 2–5, 8–9.
Birdsall & Fuss (1969), clouds-in-cells. Harlow (1957/1964), particle-in-cell for fluids.
Hockney & Eastwood, *Computer Simulation Using Particles*.

## Solvable chain

1. **Hook.** A hundred electrons. MD already taught the pair loop. Coulomb is a pair potential. Do you write N²? (`pic-why-grid`)
2. **Naive attempt.** Sum 1/r², or carry E on the particles, or cut off like Lennard-Jones.
3. **The world talks back.** Charge clouds on a mesh; ρ and φ breathe with the particles. The field is a Poisson solve, not a sum over pairs. (`<PicLab>`)
4. **Name the structure.** Charge lives on particles. The field lives on the grid. PIC is the transfer both ways, with the same linear hats.
5. **Tighten.** One particle, one cell, CIC. Drag until the left node holds three quarters of the charge. (`pic-deposit-split`)
6. **Representation shift.** Four beats of one step, in order. (`pic-cycle-order`) Particles and ρ/φ are one state.
7. **Near-transfer.** Cold electron sea, small k=1 displacement. The density rings at ω_p. (`pic-plasma-period`) Two-stream is the same field, bunching instead of ringing.
8. **Edge.** Refine particles, hold the grid. Shot noise falls; k > π/Δx stays unrepresentable. (`pic-refine-particles`) Self-force if gather ≠ deposit; 1D Coulomb is a prefix sum (honesty).
9. **Close.** Tomorrow picture: charge clouds on a mesh; the field is a Poisson solve, not a sum over pairs.

## Structure the learner must feel

A particle method that wants a long-range field does not loop over pairs. It makes a density on a mesh, solves an elliptic [PDE](../../fields-and-continua/from-particles-to-fields/) for that density, and interpolates the field back. Deposit and gather use the same hats so the scatter is the adjoint of the gather: Σ q_p φ_p = Σ ρ_i φ_i h. That identity is why a lone particle on a uniform mesh does not accelerate itself.

## Tempting wrong belief

**PIC still sums pairs; the grid is bookkeeping.** (The Poisson solve *is* the interaction. There is no pair loop.)

Secondary: **E lives on the particles, like an MD force.** (E is a grid field. Particles own q, m, x, v.)

Tertiary: **More particles refine the field.** (They kill shot noise. Modes the grid cannot see stay gone.)

Misconceptions: `pic-still-pairs`, `pic-field-on-particles`, `pic-particles-refine-grid`.

## Simplest useful case

One particle, charge 1, in a cell of width 1. CIC: node i gets 1 − x, node i+1 gets x. At x = 1/4 the left node holds 3/4. Two nodes, periodic Poisson, gather with the same weights. Σ q φ_p = ρ · φ h is then a two-entry dot product.

Plasma: N particles, q_p = −1/N, m_p = 1/N, L = 1, so ω_p = 1. A k=1 displacement rings with period 2π.

## Transfer costume

Harlow's PIC for fluids scattered mass, not charge. MPM (later in this path) is the same transfer with stress on the particles and a disposable grid. The costume changes; deposit / solve / gather does not.

N² Coulomb is the contrast, not a second method. In 1D the exact electrostatic field is a prefix sum after a sort — say so in the edge, then return to the 3D algorithm you are actually practising.

## Numerics claims (each tested)

- CIC deposit conserves charge: Σ_i ρ_i h = Σ_p q_p.
- Gather is the adjoint of scatter: Σ_p q_p φ_p = Σ_i ρ_i φ_i h.
- Two-particle identity: total force Σ q_p E_p vanishes on a periodic mesh (momentum).
- Discrete Poisson: φ'' = −ρ on a sine, recovered at second order.
- Small Langmuir oscillation: measured period of the k=1 density mode sits within ~10% of 2π/ω_p with ω_p = 1.

## Sources

- C. K. Birdsall & A. B. Langdon, *Plasma Physics via Computer Simulation*, McGraw-Hill / IOP, 1991. The ES1 cycle.
- C. K. Birdsall & D. Fuss, "Clouds-in-clouds, clouds-in-cells physics for many-body plasma simulation," *J. Comput. Phys.* **3** 494 (1969).
- F. H. Harlow, "The particle-in-cell computing method for fluid dynamics," *Methods Comput. Phys.* **3** 319 (1964).
- R. W. Hockney & J. W. Eastwood, *Computer Simulation Using Particles* (IOP, 1988).

## Tomorrow picture

Charge as clouds on a mesh. The field is a Poisson solve, not a sum over pairs.
