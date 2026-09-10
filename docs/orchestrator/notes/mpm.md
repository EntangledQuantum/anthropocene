# MPM — research notes (Agent 16)

## Solvable chain

1. **Hook.** A Lagrangian mesh follows the material. That is the honest description of a solid, and after enough deformation the elements invert. A jelly hits the floor. Predict: if you throw the computational mesh away every step, do you lose the material?
2. **Naive attempt.** "Discarding the mesh discards the deformation. History has to live on the mesh, or the solid forgets it is a solid."
3. **The world talks back.** Toggle keep-the-mesh vs reset-grid. Keep: occupied nodes follow the drop, empty nodes stay, cells invert at the free surface. Reset: the same particles, a fresh Cartesian grid every step, no tangling.
4. **Name the structure.** History lives on particles (mass, velocity, $F$). Derivatives live on a disposable background grid. P2G → grid momentum update → G2P → discard. The mesh cannot tangle because it is not the same mesh tomorrow.
5. **Tighten.** Two particles, one cell, linear hats. $\sum_i N_i(x_p) = 1$, so grid mass equals particle mass after P2G. PIC scatter-gather of two particles shooting toward each other in that cell: kinetic energy collapses. Transfers conserve mass and momentum; they do not conserve energy.
6. **Representation shift.** Three coupled views of one step: particles, grid momentum, the four hat weights of one particle. Moving any of them is the same state.
7. **Near-transfer.** Same P2G, different G2P. PIC overwrites particle velocity with the interpolated grid field (stable, dissipative). FLIP adds only the grid increment (energetic, noisy). Hunt the blend where half the opposing-pair kinetic energy survives.
8. **Optional edge.** Cell-crossing: bilinear $\nabla N$ jumps when a particle crosses a node, so the internal force jumps. You do not get exact interpolation and exact conservation from the same transfer. APIC stores an affine $C_p$ so angular momentum survives a lumped-mass P2G.
9. **Close.** Tomorrow picture: particles carry history; the grid is borrowed, used for derivatives, and returned.

## Structure the learner must feel

A continuum solid wants two contradictory things from its mesh. The mesh must **follow the material** (so history — plastic strain, $F$, damage — has an owner). The mesh must **stay nice** (so derivatives, which live on $\nabla N_i$, stay well-defined). FEM picks the first and remeshes when the second fails. Eulerian methods pick the second and smear the first across cells.

MPM refuses the choice. Material points are Lagrangian and never lose their state. A background Cartesian grid is Eulerian, used for one momentum solve, and thrown away. The transfer (P2G / G2P) is the whole method. Mesh tangling is not "handled." It is undefined, because there is no persistent computational mesh.

## Most tempting wrong belief

**Throwing the mesh away throws the material away.** (The material is the particles. The mesh is a scratchpad for $\nabla\cdot\sigma$. Resetting it is the feature.)

Secondary: **the background grid stores the solid.** (After G2P the grid is discarded. A node with mass this step may be empty next step.)

Tertiary: **PIC transfers conserve energy, because they conserve mass and momentum.** (Partition of unity gives $\sum_i m_i = \sum_p m_p$ and $\sum_i m_i v_i = \sum_p m_p v_p$. Energy is $\tfrac12 m v^2$, a different projector, and PIC is a low-pass filter on velocity.)

## Simplest useful case

1D, one cell, two nodes, linear hats $N_i(x) = 1 - |x - x_i|/h$ on a support of $h$. Two particles of mass 1 in that cell, velocities $+1$ and $-1$:

```
h = 1, nodes at 0 and 1
pA at 0.25, v = +1     →  N0 = 0.75, N1 = 0.25
pB at 0.75, v = −1     →  N0 = 0.25, N1 = 0.75
```

P2G: $m_0 = m_1 = 1$, $v_0 = +1/2$, $v_1 = -1/2$. Grid mass equals particle mass. Grid momentum equals particle momentum.

PIC G2P: $v_A = +1/4$, $v_B = -1/4$. $K$ drops from $1$ to $1/16$. FLIP with no grid forces keeps $v_p$, so $K$ stays $1$. The blend $\alpha$ interpolates.

2D teaching sim: bilinear hats (four nodes), neo-Hookean $P = \mu(F - F^{-T}) + \lambda\log(J)\,F^{-T}$, explicit grid momentum with gravity, sticky walls. One constitutive model. Reset vs keep is the same P2G/G2P; keep advects occupied nodes and interpolates isoparametrically on the deformed quads.

## Transfer costume

A PIC plasma (Harlow 1957) already scattered charge to a grid, solved Maxwell, and interpolated $E$ back. FLIP (Brackbill & Ruppel 1986) kept the particle increment so the plasma stopped cooling. Sulsky, Chen, Schreyer (1994) put $F$ and $\sigma$ on the particles and called it MPM — PIC for solids. Same costume, different physics: the grid is still the place derivatives are cheap, and still disposable.

## Numerics claims (need tests)

- Partition of unity: after P2G, $\sum_i m_i = \sum_p m_p$ and $\sum_i (mv)_i = \sum_p m_p v_p$. Particle mass is unchanged by G2P.
- Particle sitting on a node: all mass to that node; PIC recovers $v$ exactly.
- Two-particle opposing pair (above): PIC remaining $K = 1/16$; FLIP remaining $K = 1$; mass conserved.
- Neo-Hookean: $F = I$ gives $P = 0$.
- Reset-grid drop: after many steps the state stays finite and mass is conserved. Keep-mesh: a sheared / inverted quad has $\det J \le 0$.

## Sources

- D. Sulsky, Z. Chen, H. L. Schreyer (1994), "A particle method for history-dependent materials," *Comput. Methods Appl. Mech. Engrg.* **118**:179–196. Original MPM: particles carry state, grid is reset.
- D. Sulsky, Z. Zhou, H. L. Schreyer (1995), "Application of a particle-in-cell method to solid mechanics," *Comput. Phys. Commun.* **87**:236–252.
- F. H. Harlow (1957), Particle-in-Cell, Los Alamos. The transfer costume.
- J. U. Brackbill, H. M. Ruppel (1986), FLIP: a method for adaptively zoned, PIC calculations of fluid flow.
- C. Jiang, C. Schroeder, J. Teran (2016), "An angular momentum conserving affine-particle-in-cell method," *J. Comput. Phys.* **338**:137–164. APIC.
- A. Stomakhin, C. Schroeder, L. Chai, J. Teran, A. Selle (2013), "A material point method for snow simulation," *ACM Trans. Graph.* 32(4). The constitutive-model cousin (elastic–plastic snow); this lesson uses the elastic piece only.
- A. de Vaucorbeil, V. P. Nguyen, S. Sinaie, J. Y. Wu (2020), "Material point method after 25 years: theory, implementation, and applications," *Adv. Appl. Mech.*
