# SPH — research notes (Agent 31)

Gingold & Monaghan 1977, MNRAS 181; Lucy 1977, AJ 82. Monaghan 1992 ARA&A review. Swegle, Hicks, Attaway 1995 JCP 116 (tensile). Monaghan 2005 Rep. Prog. Phys. Dehnen & Aly 2012 (Wendland / pairing).

## Solvable chain

1. **Hook.** Cup of water. Lagrangian mesh tangles; Eulerian mesh needs a tracker. Particles *are* the water. How is density computed with no cell? (`sph-how-density`)
2. **Naive attempt.** Deposit onto a PIC grid. Count neighbours in a ball. Read it off a pair potential like MD.
3. **The world talks back.** $\rho_i = \sum_j m_j W(|x_i-x_j|,h)$, including self. Kernel drawn on a tracked particle; the same sum evaluated everywhere is the field. (`<SphLab mode="kernel">`)
4. **Name the structure.** The kernel is the cell. $h$ is the resolution. No connectivity.
5. **Tighten.** Completeness: on a 1D lattice the cubic spline recovers $\rho_0$ exactly at $h=\Delta x$ (self $2/3$ + two neighbours at $q=1$). (`sph-complete-h`) A free surface returns $5/6$, not $1$ — missing neighbours, not missing mass. (`sph-surface-rho`)
6. **Representation shift.** Pairwise force from $\nabla W$. EOS $P=c_0^2(\rho-\rho_0)$. Four beats: density, pressure, force, Verlet. (`sph-step-order`) Dam-break: no mesh to invert. (`<SphLab mode="dambreak">`) Sketch $w(q)$. (`sph-cubic-w`)
7. **Near-transfer / edge.** Tension, $P<0$, viscosity off: particles clump. Swegle: $\sigma W''$ is a negative modulus. (`sph-tensile`, `<SphLab mode="tensile">`)
8. **Close.** $\rho_i=\sum m_j W$. No mesh, so nothing to tangle and nothing to guarantee completeness. The kernel that estimates $\rho$ is the kernel that clumps. (`sph-one-line`)

## Structure the learner must feel

A continuum field estimated from disordered points by a compact kernel. Completeness is a neighbourhood property, not a conservation property. The discrete gradient is $\nabla W$, pairwise, so momentum is an identity. The same $W''$ that is harmless in compression is a pairing instability in tension.

Contrast: [MD](../../../../content/paths/computational-physics/05-other-paradigms/03-molecular-dynamics.mdx) has a stored $V(r)$. A [PDE](../../../../content/paths/computational-physics/06-fields-and-continua/01-from-particles-to-fields.mdx) stores the field on a mesh. SPH stores particles and *estimates* the field.

## Tempting wrong belief

**SPH still needs a background grid** (the PIC costume). Secondary: **density is a neighbour count**. Tertiary: **a surface particle is physically thinner**. Quaternary: **the kernel that is stable in compression is stable in tension**. Quinary: **SPH is MD with a different potential**.

Misconceptions: `sph-needs-mesh`, `sph-count-neighbours`, `sph-surface-is-thinner`, `sph-tension-is-stable`, `sph-is-md`.

## Simplest useful case

1D cubic spline, $W(r,h)=w(|r|/h)/h$, $w(0)=2/3$, $w(1)=1/6$, support $2h$. Lattice spacing $\Delta x$, $h=\Delta x$: $\rho/\rho_0=1$ exactly. Free-surface particle: $5/6$.

Force: $a_i=-\sum_j m_j(P_i/\rho_i^2+P_j/\rho_j^2)\nabla_i W_{ij}$. Linear EOS, so $P<0$ whenever $\rho<\rho_0$.

## Transfer costume

Astrophysical gas (the origin), free-surface engineering fluids, fragmentation of brittle solids. RKPM / Shepard filtering restore completeness. MPM borrows a disposable grid so it never has to take $\nabla W$. ISPH replaces the EOS with a pressure Poisson solve — elliptic, halfway back to a mesh.

## Numerics claims (each tested)

- 1D cubic spline integrates to 1; $\nabla W$ is odd; $w(0)=2/3$, $w(1)=1/6$, $w(q\ge 2)=0$.
- Infinite 1D lattice, $\eta=h/\Delta x=1$: $\rho/\rho_0=1$ exactly. $\eta=1/2$: only self, $\rho/\rho_0=4/3$.
- Free surface, $\eta=1$: $\rho/\rho_0=5/6$.
- Periodic lattice, no gravity: internal force sums to 0; rest stays at rest; mass and momentum conserved.
- Free-surface column under gravity is *not* at rest (incomplete top kernel).
- Unchecked tension: min spacing collapses below $0.45\,\Delta x$. Same seed in compression does not pair.
- 2D dam-break: mass conserved, blob moves into the empty tank.

## Sources

- R. A. Gingold & J. J. Monaghan, *MNRAS* **181** 375 (1977).
- L. B. Lucy, *Astron. J.* **82** 1013 (1977).
- J. J. Monaghan & J. C. Lattanzio, *A&A* **149** 135 (1985). Cubic spline.
- J. J. Monaghan, *ARA&A* **30** 543 (1992).
- J. W. Swegle, D. L. Hicks, S. W. Attaway, *J. Comput. Phys.* **116** 123 (1995). Tensile instability.
- J. J. Monaghan, *Rep. Prog. Phys.* **68** 1703 (2005).
- W. Dehnen & H. Aly, *MNRAS* **425** 1068 (2012). Wendland kernels, pairing.

## Tomorrow picture

$\rho_i=\sum_j m_j W(|x_i-x_j|,h)$. A kernel instead of a mesh. Completeness fails at a free surface. Tension clumps.
