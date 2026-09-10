# Lattice Boltzmann — research notes (Agent 30)

## Solvable chain

1. **Hook.** Three populations on a site, ratio 1:4:1, net velocity zero. Stream only — do not collide. What happens to the bump? (`lbm-stream-only`)
2. **Naive attempt.** Rest means nothing is moving, so the bump sits. Or the three velocities mix like heat. Or it translates as a fluid blob at the sound speed.
3. **The world talks back.** The bump splits into three copies that fly at −1, 0, +1. Rest was a cancellation, not a freeze. (`<LbmLab mode="d1q3">`)
4. **Name the structure.** Stream shifts each $f_i$ along $e_i$. Collide relaxes toward $f^{eq}(\rho,u)$. $\rho$ and $u$ are moments, not the state. A [PDE](../../../../content/paths/computational-physics/06-fields-and-continua/01-from-particles-to-fields.mdx) for a fluid is an equation for those moments; LBM never discretises it.
5. **Tighten.** Sort stream / collide / moment. Bounce-back is a streaming boundary. $\tau$ is collision. $\rho=\sum f_i$ is a readout. (`lbm-which-operator`)
6. **Representation shift.** Same kinetic gas, now D2Q9 in a channel: bounce-back walls, a body force. The moments recover a parabola — Navier–Stokes Poiseuille. (`lbm-poiseuille-sketch`, `<LbmLab mode="poiseuille">`)
7. **Near-transfer.** Drag $\tau$. Viscosity is $\nu=c_s^2(\tau-1/2)$; the parabola flattens as $\tau$ grows. Hunt the $\tau$ that halves the mid-channel speed. (`lbm-tau-umax`) How fast is that midplane, in lattice units? (`lbm-umax`)
8. **Edge.** [CFL](../../../../content/paths/computational-physics/06-fields-and-continua/02-cfl.mdx) is identically 1 for the discrete velocities — you stream one link. What still blows up is $\tau\to\tfrac12$ and Mach. (`lbm-tau-half`) Chapman–Enskog, MRT, high-Ma costume (`<Tier advanced>`).
9. **Close.** $f_i$ stream along lattice links; collide toward $f^{eq}$; $\rho,u$ are moments. (`lbm-stream-collide-moments`)

## Structure the learner must feel

A gas of discrete-velocity populations, not a stored velocity field. Stream is a shift along lattice links. Collide is a local relaxation toward an equilibrium built from the moments of those same populations. Navier–Stokes is what the moments look like after enough of those maps — recovered, not discretised.

Halfway bounce-back: the no-slip wall lives on the link, not on a node.

## Tempting wrong belief

- Rest means the populations do not move. (They cancel. Stream un-cancels them.)
- LBM is a finite-difference scheme for Navier–Stokes. (The state is $f_i$.)
- LBM is molecular dynamics on a lattice. (Populations are continuum densities, not particles.)
- $\tau$ is a CFL / time-step knob. (Streaming is always one link. $\tau$ is viscosity.)
- Collision is a numerical trick; streaming is the physics. (Both are the map. Drop either and you do not have a fluid.)

Misconceptions: `lbm-rest-means-still`, `lbm-is-navier-stokes-fd`, `lbm-is-molecular-dynamics`, `lbm-tau-is-cfl`, `lbm-collide-is-numerical`.

## Simplest useful case

D1Q3, one site, three numbers. $e\in\{-1,0,+1\}$, $w=\{1/6,2/3,1/6\}$, $c_s^2=1/3$. A rest bump is $f_i=w_i\rho$. Stream-only: three copies fly apart. Collide restores the conversation.

D2Q9 channel, $n_x=1$ (x-invariant), bounce-back at $j=0$ and $j=n_y-1$, Guo body force. The midplane speed scales as $1/(\tau-1/2)$.

## Transfer costume

Radiative transfer / discrete ordinates: the same stream–collide split, different equilibrium, different moments. Lattice-gas automata (HHP, FHP) are the discrete-particle ancestor; LBM is what you get when you promote occupation numbers to real populations and linearise the collision.

## Numerics claims (each tested)

- D1Q3 / D2Q9 weights: $\sum w=1$, $\sum w e=0$, $\sum w e_\alpha e_\beta = c_s^2\delta_{\alpha\beta}$ with $c_s^2=1/3$.
- BGK collide conserves $\rho$ and $\rho u$ (to roundoff). Stream on a periodic lattice conserves total mass (and, without walls, total momentum).
- Stream-only rest bump splits: $f_{+1}$ shifts $+1$ per step, $f_0$ stays, $f_{-1}$ shifts $-1$.
- D2Q9 channel with halfway bounce-back: mass conserved; $u_x(y)$ is a parabola; $u=0$ at the link midpoints.
- $\nu=c_s^2(\tau-1/2)$: doubling $(\tau-1/2)$ halves mid-channel $u$ (force-driven Poiseuille).
- $\tau\to\tfrac12$ is the inviscid limit and the stability wall, not a CFL number.

## Sources

- T. Krüger et al., *The Lattice Boltzmann Method* (Springer, 2017). Streaming + BGK, D2Q9, $\nu=c_s^2(\tau-\Delta t/2)$, halfway bounce-back, Guo forcing.
- Y. H. Qian, D. d'Humières, P. Lallemand, *Lattice BGK models for Navier–Stokes equation*, Europhys. Lett. **17** 479 (1992).
- S. Chen & G. D. Doolen, *Lattice Boltzmann method for fluid flows*, Annu. Rev. Fluid Mech. **30** 329 (1998).
- Z. Guo, C. Zheng, B. Shi, *Discrete lattice effects on the forcing term in the lattice Boltzmann method*, Phys. Rev. E **65** 046308 (2002).
- Q. Zou & X. He, *On pressure and velocity boundary conditions for the lattice Boltzmann BGK model*, Phys. Fluids **9** 1591 (1997). Halfway bounce-back is second-order for Poiseuille with forcing.

## Tomorrow picture

$f_i$ as arrows along lattice links; a collide that pulls them toward $f^{eq}$; $\rho$ and $u$ as the two numbers you get by summing. A channel whose velocity is a parabola you never stored.
