# University Physics — Curriculum Map
## Companion to the computational-physics map
### Open-source Brilliant-class learning path (topics & journey)

**Audience:** lesson authors who will turn each topic into solvables.  
**Scope:** calculus-based university physics, following the Young & Freedman *University Physics* chapter spine the product is built on.  
**Pair file:** `computational-physics-curriculum.md` — methods live there; *this* file is the physical structure those methods wear.  
**Stance:** people do not understand an idea by being told the formula. They understand it when they can move the world the idea describes. Symbols arrive after the idea has a body.

This is not a textbook rewrite and not a problem-set index.  
Each numbered chapter below is a *cluster*. Inside it are the actual lessons — one idea each.

---

## 0. How this file relates to computational physics

Physics is the structure. Computation is a costume the structure can wear.

| Physics unlocking idea | Later computational clothing |
|---|---|
| Derivative as instantaneous rate | finite differences, automatic differentiation |
| Integral as accumulated effect | quadrature, Monte Carlo integration |
| \(F = ma\) as an ODE | time integrators, Verlet, constraints |
| Conservation laws | finite volume, symplectic maps, residual audits |
| Fields on space | FDM / FEM / spectral / PIC field solves |
| Waves and characteristics | CFL, dispersion of a scheme, Riemann solvers |
| Continuum vs particles | Eulerian / Lagrangian / MPM / MD / DEM |
| Probability of microstates | Monte Carlo, molecular dynamics ensembles |
| Maxwell on a grid | Yee / FDTD, edge elements |
| Schrödinger as a PDE | split-operator, Crank–Nicolson, exact diagonalization |

Do not teach “then we discretize.” Teach the physics until the learner can *feel* what must stay true. Only then ask what a discrete world would have to protect.

**Non-goal of this file:** coding, solver taxonomy, FEM internals. Those stay in the computational map.

---

## 1. Identity and roots

### Identity the product should protect

Not “what will be on the midterm.”  
**How far can a well-trained mind see into a physical situation?**

A learner understands an idea when they can:

- say *what kind of quantity* it is (scalar, vector, field, density, flux, invariant)
- show it two ways (picture + equation, or graph + motion)
- predict before calculating
- notice when a model is the wrong costume
- move to an unfamiliar situation without being told which formula to open

### Unlocking roots (few doors, many rooms)

1. **State vs change** — what is the configuration, what is happening to it
2. **Rate** — derivative as a local question, not a memorized slope formula
3. **Accumulation** — integral as “what piled up,” not an antiderivative ritual
4. **Vectorhood** — direction is part of the quantity
5. **Interaction** — forces come in pairs; fields are how pairs act at a distance
6. **Balance laws** — momentum, energy, charge, entropy have different jobs
7. **Invariants and symmetries** — what stays put when you change the description
8. **Fields** — a number (or vector) at every point, with flux and circulation
9. **Waves** — a pattern that travels; the medium usually does not
10. **Ensembles** — one particle is a story; \(10^{23}\) is a distribution
11. **Quanta and amplitudes** — some accounts of nature are not trajectories
12. **Models have domains** — point mass, rigid body, ideal gas, ray, photon, field

School chapter order is a convenient spine, not a sacred graph. Visual algebra of motion can precede a pile of constant-acceleration formulas. Fields can be played with before Gauss’s law is named.

---

## 2. The learning journey at a glance

```
I    Language of nature          units, vectors, what a measurement is
II   Motion as geometry          1D → 2D/3D kinematics
III  Interaction                Newton, applications, constraints
IV   Accounting                 work-energy, potential, momentum
V    Extended bodies            rotation, equilibrium, elasticity, fluids
VI   Fields of gravity          orbits, tides, escape
VII  Oscillation → waves        SHM, superposition, sound
VIII Thermal world              temperature, matter, two laws
IX   Electromagnetic world      charge → fields → circuits → Maxwell → light
X    Light as rays and waves    geometry, interference, diffraction
XI   Relativity                 spacetime as the stage
XII  Quantum world              photons, matter waves, ψ, atoms, nuclei, cosmos
```

Default product path follows I → XII. Jumping is allowed after a short diagnostic. Later courses *reuse visual worlds* (the same cart, the same field-line canvas, the same well) so the product feels like one mind.

---

## 3. How to read each chapter block

Every chapter uses the same template:

- **Structure** — what idea family this chapter actually owns
- **Lessons** — the atomic teaching units (each later becomes 5–12 min of solvables)
- **Questions the visual must pose** — if you cannot write the lesson as one of these, you have a demo
- **Misconceptions to design for** — first-class data for the coach
- **Computational bridge** — where this physics later pays rent in the other map
- **Reusable picture** — what should still be in the head tomorrow

Direct instruction is short and earned. Formulas caption a world the learner already moved.

---

# MECHANICS

## Chapter 1 — Units, Physical Quantities, and Vectors

**Structure.** Physics is a language. Quantities have dimension. Some quantities have direction. Combining them is not decoration.

### Lessons
1. What kind of thing is this number? (dimension vs unit vs magnitude)
2. SI as a social contract with nature
3. Unit algebra — why the equation must balance in dimensions
4. Conversion as multiplying by 1
5. Uncertainty is part of the measurement, not an apology
6. Significant figures as a crude error costume
7. Order-of-magnitude eyes (Fermi estimates as a sport)
8. A vector is an arrow that adds like a displacement
9. Components are a choice of costume, not a different object
10. Unit vectors as a basis you can swap
11. Dot product as “how much of this is along that”
12. Cross product as an area with a sense of rotation
13. Scalars hiding inside vector operations (\(W = \vec F\cdot\vec s\), \(\vec\tau = \vec r\times\vec F\)) — preview only

### Visual questions
- If I change the unit, which drawings stay the same?
- Can these two arrows make a closed triangle?
- What happens to the components if I rotate the axes and leave the arrow alone?
- Which combinations of \(\vec a,\vec b\) are legal: sum, product, “times a scalar”?

### Misconceptions
- Units are labels you slap on at the end
- A vector *is* its components
- Negative components mean the quantity is “less”
- Dot product is “multiplication of vectors”
- Significant figures *are* uncertainty

### Computational bridge
Dimensional audit of a residual; floating-point is a different kind of unit error. Vectors as arrays are a representation, not the geometry.

### Reusable picture
An arrow that does not move when the grid under it rotates.

---

## Chapter 2 — Motion Along a Straight Line

**Structure.** Kinematics is geometry of a worldline. Velocity and acceleration are questions about that curve, not extra substances.

### Lessons
1. Position is not the same as distance traveled
2. Displacement as a directed change
3. Average velocity is a chord
4. Instantaneous velocity is a tangent — the derivative’s first body
5. Speed is not velocity
6. Average vs instantaneous acceleration
7. Sign is a direction, not a mood
8. The \(x(t)\), \(v(t)\), \(a(t)\) trio as linked representations
9. Constant acceleration as the simplest useful case
10. Free fall as constant \(a\), not “the force of gravity” yet
11. Area under \(v(t)\) is displacement — integral as accumulation
12. When acceleration is *not* constant: read the graph, do not grab \(v^2 = v_0^2 + 2as\)
13. Turning points: \(v=0\) is not “no motion exists,” it is a crossing

### Visual questions
- If I only give you \(v(t)\), can you recover \(x(t)\)? What is missing?
- Where is the object instantaneously at rest but not staying put?
- Which of these three graphs cannot describe the same motion?

### Misconceptions
- Zero velocity means zero acceleration
- Acceleration is “how fast you go”
- Negative velocity means slowing down
- The kinematic equations always apply
- The slope of \(x(t)\) is acceleration

### Computational bridge
This *is* Course A/B of the computational map: sampling a trajectory, finite differences for \(v\) and \(a\), integrating \(a\) to get \(v\). Euler vs better integrators can wait; the physics is the linked graphs.

### Reusable picture
A stack of three plots that must agree with one another.

---

## Chapter 3 — Motion in Two or Three Dimensions

**Structure.** Motion is a path in space. Velocity is tangent to the path. Acceleration can change speed, direction, or both.

### Lessons
1. \(\vec r(t)\) as a moving point
2. \(\vec v = d\vec r/dt\) points along the path
3. \(\vec a = d\vec v/dt\) does *not* have to point along the path
4. Decomposing \(\vec a\) into tangent (speed change) and normal (steering)
5. Projectile as two 1D costumes sharing time
6. Independence of horizontal and vertical — a shock if you have only Aristotle
7. Range, height, time of flight as *derived* pictures, not new laws
8. When air resistance wrecks the parabola (preview)
9. Uniform circular motion: speed constant, velocity not
10. Centripetal acceleration is toward the center because the velocity’s *direction* is changing
11. Period, frequency, angular speed as clocks on a circle
12. Non-uniform circular motion: both \(a_t\) and \(a_n\)
13. Relative velocity as a change of narrator
14. Galilean addition; why “the train and the ball” keeps confusing people

### Visual questions
- Can this object be speeding up while \(\vec a\) points left?
- If I freeze the velocity arrow and wait \(dt\), where does the tip move?
- Who measures which velocity — ground, train, rain?

### Misconceptions
- Acceleration is in the direction of motion
- Circular motion needs a force “outward”
- Projectiles “run out of force” at the top
- Horizontal velocity dies off
- Relative velocity is a trick, not a change of frame

### Computational bridge
2D integrators; projectile with drag as the first “computer analysis” in Young & Freedman for a reason. Circular motion as a constrained ODE.

### Reusable picture
A velocity arrow whose tip is being dragged by an acceleration arrow.

---

## Chapter 4 — Newton’s Laws of Motion

**Structure.** Motion changes when interactions happen. Mass is resistance to that change. Forces come in pairs.

### Lessons
1. Force as an interaction, not a stuff inside the object
2. Inertia: the first law is not a special case of the second — it picks the frames
3. Inertial vs non-inertial frames as a choice of stage
4. \(\vec F_{\text{net}} = m\vec a\) as a vector budget
5. Mass is not weight
6. Weight as a gravitational *force*, scale reading as a normal force
7. The third law: two bodies, two forces, same line, opposite
8. Action-reaction pairs never act on the *same* free-body diagram
9. Free-body diagrams as the real language of this chapter
10. Internal vs external for a system you chose
11. Superposition of forces
12. What Newton does *not* say (origin of forces — later chapters)

### Visual questions
- If I hide the motion and show only the FBD, can you still say \(\vec a\)?
- These two arrows: pair, or just two forces on one body?
- If the table is not accelerating, why is \(N\) allowed to equal \(mg\) — and when must it not?

### Misconceptions
- Motion requires a force (the #1 FCI item)
- Force is energy / force is momentum / force is “impetus”
- Bigger objects exert bigger forces automatically
- The third law fails when one mass is larger
- Net force is in the direction of velocity
- Weightlessness means no gravity

### Computational bridge
The right-hand side of every mechanical ODE. Constraint forces as what integrators like SHAKE later protect. Choice of system = choice of what is “external.”

### Reusable picture
One object, a few force arrows, an acceleration arrow that *must* match their sum.

---

## Chapter 5 — Applying Newton’s Laws

**Structure.** The laws do not change. The costumes do: friction, strings, circles, drag, ramps.

### Lessons
1. Equilibrium is \(\vec a = 0\), not “no forces”
2. Ramps: rotate the axes to the geometry
3. Strings, tension, ideal-massless-rope as a model
4. Pulleys as direction-changers for tension
5. Connected objects: one system or two — and when each choice is cheaper
6. Static vs kinetic friction as two different models
7. Friction can be up the ramp
8. Rolling-without-slipping preview (full treatment in Ch. 10)
9. Drag: linear and quadratic; terminal speed as a balance
10. Uniform circular motion is Newton + kinematics, not a new force
11. Banked curves, unbanked curves
12. Vertical circles: the “just makes it” condition is a force budget at the top
13. Apparent weight in elevators and loops
14. The fundamental interactions as a classified list (grav, EM, strong, weak) — map, not mechanism yet

### Visual questions
- If I slowly raise the ramp, when does the block decide to move, and which force changed?
- Can friction do work here? (seed for Ch. 6)
- Where is the third-law partner of the centripetal force?

### Misconceptions
- Friction always opposes “the motion of the object” rather than the slipping that would occur
- Tension is \(mg\) or \(ma\) by slogan
- Centrifugal force is a real interaction in an inertial frame
- Static friction has a single value \(\mu_s N\)

### Computational bridge
Constraint stabilization; contact models; quadratic drag as a nonlinear ODE; events (slip starts) as discontinuities later methods must handle.

### Reusable picture
A free-body diagram that changes costume without changing Newton.

---

## Chapter 6 — Work and Kinetic Energy

**Structure.** A different accounting system for the same Newton. Work is how a force feeds a change in motion along a path.

### Lessons
1. Kinetic energy as “how much motion-energy this mass-speed pair holds”
2. Work as \(F_\parallel\) times displacement — a scalar born from two vectors
3. Positive, negative, zero work as three different stories
4. Variable force: work is the area under \(F_x(x)\)
5. Work–energy theorem: net work *is* \(\Delta K\), not an extra law
6. Power as a rate of doing work
7. Why a force perpendicular to \(\vec v\) does no work (circular motion payoff)
8. Work by gravity vs work by a hand vs work by friction
9. Path matters for some forces — cliffhanger into potential energy

### Visual questions
- Can a force be large and still do no work?
- If I push a crate at constant speed, why is \(\Delta K = 0\) while I am sweating?
- Which area on this \(F(x)\) graph is the work?

### Misconceptions
- Work is “effort”
- Negative work means the formula broke
- Energy is a force
- The person doing the holding is doing work
- Kinetic energy is a vector

### Computational bridge
Work as a line integral; energy as a check on an integrator; why symplectic methods exist (Ch. 7 completes this).

### Reusable picture
A force arrow and a displacement arrow, with only the shared piece counting.

---

## Chapter 7 — Potential Energy and Energy Conservation

**Structure.** Some forces are cheap to account as a landscape. Mechanical energy is conserved only when the landscape is the whole story.

### Lessons
1. Conservative force: work depends only on endpoints
2. The closed-loop test
3. Potential energy as a height-function of that landscape
4. \(U\) is defined only up to a constant — you choose the floor
5. \(F = -dU/dx\) in 1D; \(\vec F = -\nabla U\) as the 3D costume
6. Gravity near Earth as a straight slope
7. Springs as a parabolic valley
8. Mechanical energy \(E = K + U\)
9. When friction or drag is in the room, \(E_{\text{mech}}\) is not the whole ledger
10. Energy diagrams: turning points, allowed regions, equilibrium
11. Stable vs unstable vs neutral from the shape of \(U\)
12. Small oscillations near a minimum (seed of Ch. 14)
13. Force from slope; motion from rolling a marble on \(U(x)\)

### Visual questions
- If I slide the zero of \(U\), what stays true?
- Can the particle be at a place where \(E < U\)?
- Which of these \(U(x)\) shapes trap, bounce, or run away?

### Misconceptions
- Potential energy “is in the object”
- Conservative means “doesn’t use up energy” in the everyday sense
- Energy is conserved only in “elastic” everyday collisions (category error with Ch. 8)
- A higher \(U\) always means a larger force

### Computational bridge
Energy drift of an integrator; potential landscapes in MD; Monte Carlo samples \(e^{-U/kT}\); steepest descent vs Newtonian motion on the same \(U\).

### Reusable picture
A marble on a potential track, with a dashed total-\(E\) line.

---

## Chapter 8 — Momentum, Impulse, and Collisions

**Structure.** Another ledger. Momentum is the quantity Newton actually conserves when forces are internal.

### Lessons
1. Momentum \(\vec p = m\vec v\) as a different bookkeeping of motion
2. Impulse as the area under \(\vec F(t)\)
3. Impulse–momentum theorem is Newton in integral clothes
4. Isolated system: internal forces cancel in the *total* \(\vec P\)
5. Center of mass as the point that moves as if all mass sat there
6. CM motion vs relative motion
7. 1D collisions: what two numbers can two conservation laws give you?
8. Elastic, inelastic, perfectly inelastic — energy and momentum have different jobs
9. Coefficient of restitution as a model, not a law
10. 2D collisions and the extra unknown
11. Explosions as collisions run backward
12. Variable mass: rockets as “who is the system this second”
13. Why impulse is the right language for a bat hitting a ball

### Visual questions
- Two carts stick. Who decides the final speed — mass, speed, or both?
- If kinetic energy dropped, where did it go, and did momentum still add?
- Can both energy and momentum be conserved if the objects are not “hard”?

### Misconceptions
- Momentum is conserved only if the collision is elastic
- Soft collisions “lose momentum”
- The heavier object exerts a bigger collision force (third-law relapse)
- Center of mass is “the heaviest point”
- Rockets need air to push

### Computational bridge
Collision detection in DEM; inelasticity as a contact model; momentum-conserving PIC transfers; variable-mass ODE; event-driven vs penalty contacts.

### Reusable picture
Two momentum arrows that must still add to the same total after the flash.

---

## Chapter 9 — Rotation of Rigid Bodies

**Structure.** A rigid body is many particles locked together. Rotation is their shared angle.

### Lessons
1. The rigid-body model and when it dies
2. Angular displacement, velocity, acceleration as 1D kinematics in costume
3. Relating \(s\), \(v\), \(a_t\) to \(\theta\), \(\omega\), \(\alpha\)
4. Vector \(\vec\omega\) and the right-hand rule
5. Moment of inertia as “rotational mass” — and it depends on the *axis*
6. Parallel-axis theorem as a shift of the axis, not a new object
7. Perpendicular-axis theorem (planar)
8. Integration for \(I\): the same accumulation idea as mass
9. Rotational kinetic energy \(\tfrac12 I\omega^2\)
10. Rolling without slipping as a *constraint* linking \(v\) and \(\omega\)
11. Rolling kinetic energy = translation of CM + rotation about CM
12. Angular momentum preview: \(L = I\omega\) for fixed axis

### Visual questions
- If I move the axis, does \(I\) grow or shrink, and why?
- A hoop and a disk race down a ramp. Who wins, and which energy locker did the hoop fill?
- Can a body have zero \(v_{\text{CM}}\) and nonzero \(K_{\text{rot}}\)?

### Misconceptions
- Heavier means harder to spin (ignores *where* the mass is)
- Rolling objects go slower because friction “steals” energy (sometimes friction does no work)
- \(\omega\) is “how many meters per second around”

### Computational bridge
Rigid-body integrators; inertia tensors; quaternion / rotation-matrix state; constraints of rolling as DAEs.

### Reusable picture
The same mass painted in two places on a bar, and the bar’s stubbornness changing.

---

## Chapter 10 — Dynamics of Rotational Motion

**Structure.** Torque is the rotational costume of force. Angular momentum is the rotational costume of momentum.

### Lessons
1. Torque as \(\vec r\times\vec F\) — lever arm as a picture
2. Sign of torque as a sense of twist
3. \(\tau_{\text{net}} = I\alpha\) for a fixed axis
4. Combined translation + rotation: two Newton laws, one body
5. Rolling with and without slipping: friction’s two jobs
6. Work and power in rotation
7. Angular momentum of a particle \(\vec r\times\vec p\)
8. Angular momentum of a rigid body
9. Conservation of angular momentum when \(\tau_{\text{ext}}=0\)
10. Ice-skater / collapsing-star problem as \(I\) changing
11. Gyroscopes at a qualitative level: \(\vec\tau = d\vec L/dt\)
12. Precession as “\(L\) is being steered,” not magic

### Visual questions
- Can a force be nonzero and still produce zero torque?
- If the skater pulls in her arms, what stayed constant — \(I\), \(\omega\), \(L\), or \(K\)?
- Why does a spinning wheel refuse to fall over the way a still one does?

### Misconceptions
- Torque is a force
- Angular momentum conservation requires “no friction” in every sense
- Kinetic energy is conserved when \(L\) is
- Gyroscopes violate Newton

### Computational bridge
Rigid-body time stepping; geometric integrators on \(SO(3)\); impulsive collisions with rotation; gyroscope stability as an ODE on \(\vec L\).

### Reusable picture
An \(L\) arrow being tipped by a torque arrow, sweeping a cone.

---

## Chapter 11 — Equilibrium and Elasticity

**Structure.** Statics is Newton with \(\vec a=0\) and \(\alpha=0\). Elasticity is what happens when “rigid” was a lie.

### Lessons
1. Two conditions of equilibrium: forces and torques
2. Choosing the pivot as a weapon
3. Center of gravity vs center of mass
4. Stability of a block on a tilt
5. Stress as force per area; strain as fractional deformation
6. Hooke’s law as the linear costume of a material
7. Young’s modulus, shear modulus, bulk modulus as three different squeezes
8. Elastic vs plastic vs fracture
9. Energy stored in a springy material
10. Why a hollow bone can be smart

### Visual questions
- If I move the pivot, which torque numbers change and which balance stays?
- Same force, thinner rod: what exploded — stress or strain?
- Which modulus answers “how much does this column shorten?”

### Misconceptions
- Equilibrium means no forces
- The pivot is a special physical point the object “rotates about” even at rest
- Strong and stiff are the same word

### Computational bridge
Linear elasticity FEM; constitutive laws; geometric vs material nonlinearity later; buckling as an eigenvalue.

### Reusable picture
A beam, a few force arrows, and a pivot you can drag until the arithmetic becomes kind.

---

## Chapter 12 — Fluid Mechanics

**Structure.** A fluid is a continuum that cannot hold shear at rest. Pressure is how it pushes.

### Lessons
1. Density and pressure as field-like quantities
2. Pascal: pressure at a depth, pressure transmitted
3. Gauges vs absolute pressure
4. Buoyancy as a pressure *difference*, not a new substance
5. Archimedes as “weight of displaced fluid”
6. Floating, sinking, hovering as a force budget
7. Steady flow and streamlines
8. Continuity: what is conserved is volume-rate (incompressible) or mass-rate
9. Bernoulli as energy accounting along a streamline
10. When Bernoulli lies (viscosity, unsteadiness, compressibility)
11. Viscosity and laminar vs turbulent as a preview of a dimensionless world (Re)
12. Why the equal-transit-time wing story is the wrong costume

### Visual questions
- If I punch a hole deeper in the tank, what changes — speed out, or just the height of the jet?
- A rock on a scale in a beaker: who lost weight, and where did that force go?
- Narrow the pipe: what rises, what falls, and which conservation said so?

### Misconceptions
- Heavier objects always sink
- Pressure is “the force downward”
- Bernoulli means “faster air has lower pressure” as a universal slogan with no streamline
- Lift is equal-transit-time

### Computational bridge
This is the physics under CFD: pressure Poisson, incompressible constraint, Bernoulli as an energy integral of Euler, viscosity as the term that makes Navier–Stokes parabolic, Re as the resolution budget.

### Reusable picture
A tube that pinches, with speed and pressure sliders forced to trade.

---

## Chapter 13 — Gravitation

**Structure.** The same inverse-square law on Earth and in the sky. A field is a way to talk about “the influence is already there.”

### Lessons
1. Newton’s law of gravitation as a two-body interaction
2. Superposition of gravitational forces
3. The gravitational field \(\vec g(\vec r)\) as “force per unit mass already waiting”
4. Spherical shells: inside vs outside (the calculation that makes planets pointlike)
5. Gauss for gravity as a preview of Ch. 22
6. Gravitational potential energy for \(1/r\), and why \(U=0\) at infinity is a kind choice
7. Escape speed as “\(E=0\)”
8. Circular orbits as Newton + centripetal
9. Kepler’s laws as geometry of inverse-square bound motion
10. Energy of orbits: bound vs unbound
11. Reduced mass and the two-body problem
12. Tides as a *gradient* of \(\vec g\), not as “the Moon pulls the ocean”
13. Apparent weight, rotation of the Earth
14. The idea of a black hole as “escape speed hits \(c\)” — a classical costume only

### Visual questions
- Stand inside a uniform shell. Which way does \(\vec g\) point?
- If I raise an orbit, what happens to speed, period, and total \(E\)?
- Why are there two tides?

### Misconceptions
- Astronauts float because “there is no gravity in space”
- Gravity shuts off at the atmosphere
- Heavier planets pull harder on you than you pull on them
- Tides are the Moon lifting water like a blanket

### Computational bridge
N-body, symplectic orbit integration, tree/FMM gravity, Poisson solvers for \(\nabla^2\Phi = 4\pi G\rho\). This chapter is the physics under Track A of the computational map.

### Reusable picture
A field-line or potential well around a sphere, plus a test mass you can drop into an orbit.

---

## Chapter 14 — Periodic Motion

**Structure.** Anything near a minimum of \(U\) ticks. The harmonic oscillator is the universal small-tick.

### Lessons
1. What makes a motion periodic
2. The defining equation \(\ddot x = -\omega^2 x\)
3. Why springs and small pendulums share a costume
4. Amplitude, period, frequency, phase as coordinates on a sinusoid
5. \(x(t)\), \(v(t)\), \(a(t)\) for SHM — linked graphs again
6. Energy sloshing between \(K\) and \(U\), \(E\) fixed
7. The phase portrait: ellipses
8. Simple pendulum: exact vs small-angle
9. Physical pendulum
10. Damping as a slow leak of \(E\); under / critical / over
11. Driving and resonance as “the world matches the tick”
12. Power at resonance; phase between drive and response
13. Superposition of two SHMs — beat preview, Lissajous, and the door to waves

### Visual questions
- If I double the amplitude, what happens to \(T\)? Why is that shocking?
- Where is \(|a|\) biggest? Where is \(|v|\)?
- Drag the driving frequency past \(\omega_0\). What peaks, and what lags?

### Misconceptions
- Period depends on amplitude for a spring (it does for a real pendulum)
- Resonance means “the amplitude is infinite”
- Damping changes the idea of \(\omega_0\) in a way students cannot track

### Computational bridge
Stiff vs oscillatory ODEs; resonance as a frequency-response experiment; Verlet on oscillators; Fourier as the language of ticks; later, modes of strings and of meshes.

### Reusable picture
A mass on a spring next to its circling shadow — projection as SHM.

---

# WAVES / ACOUSTICS

## Chapter 15 — Mechanical Waves

**Structure.** A wave is a pattern that can leave its source. The medium’s bits mostly stay.

### Lessons
1. Pulse vs periodic wave
2. Transverse vs longitudinal as two costumes of the same idea
3. Snapshot \(y(x)\) vs history \(y(t)\) vs the traveling form \(y(x\pm vt)\)
4. Wavelength, period, frequency, wave speed — only two are independent
5. What sets \(v\): inertia of the medium and its restoring stiffness
6. Speed on a string \(\sqrt{F/\mu}\) as a derived picture
7. Energy and power a wave carries
8. Superposition as the real law of this chapter
9. Reflection with a free vs fixed end — the flip
10. Standing waves as two travelers
11. Harmonics and boundary conditions as *which patterns fit*
12. Normal modes as the reusable skeleton of later quantum wells

### Visual questions
- If I freeze the string, can I tell which way the wave is going?
- Double the tension. What happens to \(v\), to \(\lambda\) at fixed \(f\), to \(f\) of the fundamental?
- Which points on a standing wave never move, and who decided that — the wave or the wall?

### Misconceptions
- Waves carry the medium from A to B
- Frequency is a property of the string rather than of the source
- Standing waves do not involve motion
- Interference means the waves bounce back to their sources

### Computational bridge
The 1D wave equation; CFL on a string; modal vs marching solvers; numerical dispersion as a *false* medium.

### Reusable picture
A moving pulse, and separately two pulses walking through each other unchanged.

---

## Chapter 16 — Sound and Hearing

**Structure.** Sound is a longitudinal pressure-and-density wave in a material.

### Lessons
1. Pressure wave vs displacement wave — they are out of step
2. Speed of sound and what it depends on
3. Intensity, inverse square, decibels as a log costume
4. Standing sound waves in pipes: open vs closed as different boundary costumes
5. Resonance of air columns
6. Interference in space: two speakers
7. Beats as two nearby frequencies
8. Doppler: source vs listener, the medium as the stage
9. Shock waves when the source outruns its own waves

### Visual questions
- In a closed pipe, where is the pressure node?
- If both you and the source move, who owns which Doppler factor?
- Why can you hear around a doorway better than you can see around it? (seed of diffraction)

### Misconceptions
- Sound needs “air” specifically, not a medium
- Decibels add like ordinary numbers
- Doppler depends on the distance, not the velocity component
- Sonic booms are a single bang because “the sound piles up at one point” (too crude)

### Computational bridge
Acoustics FEM/BEM; Doppler as a moving source on a grid; shocks as the nonlinear wave costume.

### Reusable picture
A slinky or a row of pendula passing a compression, not a traveling blob of air.

---

# THERMODYNAMICS

## Chapter 17 — Temperature and Heat

**Structure.** Temperature is what two systems share when they stop net-exchanging energy that way. Heat is the energy in transit because of a temperature difference.

### Lessons
1. Thermal equilibrium and the zeroth law
2. Temperature as an ordering of equilibria, then a number
3. Scales: Celsius, Fahrenheit, Kelvin — only Kelvin is an absolute costume
4. Heat vs temperature vs internal energy — three different objects
5. Heat capacity and specific heat
6. Calorimetry as an energy budget
7. Phase changes: temperature can sit still while energy moves
8. Latent heat
9. Heat transfer: conduction, convection, radiation as three mechanisms
10. Thermal expansion as a kinematic consequence

### Visual questions
- Two objects touch. What equalizes — heat, temperature, or energy?
- Why does melting ice not get warmer as you add energy?
- If I double the Kelvin temperature of a blackbody, what happens to the radiated power?

### Misconceptions
- Heat is a fluid inside the object
- Temperature measures heat
- Cold is a substance
- Insulation “warms things”

### Computational bridge
Heat equation as the model parabolic PDE; radiation as a nonlinear boundary; phase change as a Stefan problem / enthalpy method.

### Reusable picture
Two blocks and an energy pipe between them that shuts when \(T\) matches.

---

## Chapter 18 — Thermal Properties of Matter

**Structure.** Matter’s thermal behavior is many particles sharing energy. Ideal gas is the simplest useful gas.

### Lessons
1. Equations of state as “the variables are not independent”
2. Ideal-gas law as a model with a domain
3. Mole, Avogadro, \(k_B\) vs \(R\)
4. Kinetic theory: pressure as momentum rain on a wall
5. Temperature as a measure of average translational \(K\)
6. rms speed vs average speed vs most probable speed
7. Maxwell–Boltzmann distribution as the reusable picture
8. Degrees of freedom and heat capacities (\(C_V\), \(C_P\))
9. Equipartition — and when quantum physics evicts it
10. Phases and coexistence curves
11. Vapor pressure, humidity (lightly)
12. van der Waals as “ideal gas with friends and volume”

### Visual questions
- If I raise \(T\) at fixed \(V\), why does \(P\) rise — faster hits, more hits, or both?
- Why is \(C_P > C_V\)?
- Which part of the speed distribution grows when I heat the gas?

### Misconceptions
- Heat is the kinetic energy of molecules (loose talk that wrecks Ch. 19)
- All molecules in a gas have speed \(v_{\text{rms}}\)
- Ideal gas is “a perfect substance,” not a limit

### Computational bridge
MD of a dilute gas; MC sampling of MB; histogram of speeds as a living diagnostic; later, DSMC.

### Reusable picture
A histogram of molecular speeds that fattens as you drag \(T\).

---

## Chapter 19 — The First Law of Thermodynamics

**Structure.** Energy of a *system* has a ledger. Heat and work are how the ledger talks to the outside, and they are path-dependent. \(U\) is not.

### Lessons
1. What counts as the system
2. Work in a \(P\)–\(V\) diagram is an area — and the path *is* the work
3. Why \(W\) is not a state function
4. Heat is not a state function either
5. Internal energy \(U\) *is* a state function
6. First law: \(\Delta U = Q - W\) (watch the sign convention and state it once, clearly)
7. Cyclic processes: \(\Delta U = 0\), so \(Q = W\)
8. Isochoric, isobaric, isothermal, adiabatic as four named paths
9. Heat capacities from the first law
10. Adiabatic \(PV^\gamma\) as a derived costume
11. Molar heat capacities of an ideal gas, again, now earned

### Visual questions
- Two paths from A to B. Which areas differ, and which \(\Delta U\) cannot?
- Can I have \(Q=0\) and still change \(T\)?
- A cycle: which enclosed area is the net work?

### Misconceptions
- Heat and work are properties of the gas
- Adiabatic means “slow” or “insulated” used interchangeably without care
- First law is “energy is conserved” with no system boundary

### Computational bridge
Thermodynamic integrators; constraints of process type; equation-of-state closures in CFD.

### Reusable picture
A \(P\)–\(V\) plane with two paths and a highlighter on the area.

---

## Chapter 20 — The Second Law of Thermodynamics

**Structure.** Not every energy-conserving story happens. Heat has a preferred direction. Entropy is the bookkeeping of that fact.

### Lessons
1. Engines must dump heat — Kelvin and Clausius statements
2. Carnot as the best possible cycle between two \(T\)s
3. Efficiency limits as a theorem, not an engineering disappointment
4. Refrigerators and heat pumps as engines run with intent reversed
5. Entropy as \(dS = dQ_{\text{rev}}/T\)
6. \(\Delta S\) of the universe for reversible vs irreversible
7. Entropy of an ideal gas (computed)
8. Entropy as counting: \(S = k\ln W\) — the statistical costume
9. Why mixing, free expansion, and friction raise \(S_{\text{universe}}\)
10. Arrow of time as a boundary-condition-plus-counting story, not a new force
11. Available work / degradation of energy

### Visual questions
- If I run a perfect Carnot cycle, what is \(\Delta S_{\text{universe}}\)?
- Free expansion: \(Q=0\), \(W=0\), \(\Delta U=0\). What rose?
- Two rooms at different \(T\). Why can I not extract all of \(U\) as work?

### Misconceptions
- Entropy *is* disorder (the metaphor that eats the concept)
- Second law is “things get messy”
- A refrigerator violates the second law
- Reversible means “the movie can be played backward in the room” without the surroundings

### Computational bridge
Why MD of a few particles looks reversible and a million does not; Monte Carlo detailed balance; heat death as a computational-physics-adjacent cultural object, not a lesson goal.

### Reusable picture
Two heat baths and an engine between them, with a mandatory dump arrow.

---

# ELECTROMAGNETISM

## Chapter 21 — Electric Charge and Electric Field

**Structure.** Charge is a source. The field is the influence already filling space.

### Lessons
1. Two kinds of charge; conservation; quantization
2. Conductors vs insulators vs polarization
3. Charging by contact and induction
4. Coulomb’s law as the electrical inverse-square
5. Superposition of forces
6. The electric field as \(\vec F/q\) on a silent test charge
7. Field of a point, a dipole, a ring, a line, a plane — a ladder of useful cases
8. Field lines as a picture of direction and crowding, not a substance
9. Dipole in a uniform field: net force zero, torque not
10. Continuous distributions as integrals of Coulomb
11. Motion of a charge in a uniform \(\vec E\)

### Visual questions
- If I hide the source charges and show only arrows on space, can you guess the sources?
- Why do field lines never cross?
- A dipole in a uniform field: why does it turn but not fly?

### Misconceptions
- Field lines are streams of charge
- A field exists only when a test charge is present
- Neutral objects cannot feel electric forces
- Coulomb’s law always applies inside matter as if vacuum

### Computational bridge
Particle–field coupling; PIC charge deposit; Poisson solvers; N-body electrostatics and why you need FMM.

### Reusable picture
Arrows on empty space that change when you drag a source charge.

---

## Chapter 22 — Gauss’s Law

**Structure.** Flux counts field through a surface. For inverse-square fields, flux counts the enclosed source. Symmetry decides whether this is a tool or a tautology.

### Lessons
1. Area as a vector
2. Flux as “how many field arrows pierce”
3. Gauss’s law as a statement about \(\oint\vec E\cdot d\vec A\) and \(q_{\text{enc}}\)
4. What Gauss does *not* say (\(\vec E\) is not \(q_{\text{enc}}/\epsilon_0 A\) in general)
5. Choosing a Gaussian surface so \(\vec E\) is constant or perpendicular or zero
6. Point charge, sphere, line, plane — the catalog earned by symmetry
7. Conductors: \(\vec E=0\) inside the metal, charge on the surface
8. Cavity arguments
9. Gauss for gravity as the same skeleton

### Visual questions
- If I squash the Gaussian surface without changing \(q_{\text{enc}}\), what stays equal — flux or \(E\)?
- A charge outside a closed surface: flux is zero. Is \(E\) zero?
- Why is the field of an infinite plane independent of distance?

### Misconceptions
- Gauss’s law is only for symmetric cases (it is always true; it is only *useful* then)
- Flux is “the field”
- Charge outside contributes no field, only no flux

### Computational bridge
Discrete divergence theorems; finite-volume Gauss; why Yee grids store \(E\) on edges and flux on faces.

### Reusable picture
A balloon around charges, with a flux meter that only cares what is inside.

---

## Chapter 23 — Electric Potential

**Structure.** \(\vec E\) is a slope. \(V\) is the height. Conservative electrostatics means a height function exists.

### Lessons
1. Potential energy of a charge in a field
2. Potential as \(U/q\) — a property of the field
3. \(V\) is a scalar; superposition is easier here than on \(\vec E\)
4. \(\vec E = -\nabla V\)
5. Equipotentials meet field lines at right angles
6. Potential of point, sphere, dipole
7. Potential and conductors: a conductor is an equipotential volume
8. Finding \(V\) from \(E\) and \(E\) from \(V\)
9. Electron-volts as a unit of energy
10. A potential can be zero where the field is not, and vice versa

### Visual questions
- Can I walk a closed loop and come back to a different \(V\)? (electrostatics: no)
- Where is \(V=0\) for a dipole? Where is \(E=0\)?
- Why does a sharp conductor leak charge? (equipotentials crowd)

### Misconceptions
- Potential is potential energy
- Voltage is a substance that flows
- High potential means strong field

### Computational bridge
Poisson / Laplace solvers; potential as the unknown in FEM electrostatics; path independence as a test.

### Reusable picture
A contour map of \(V\) with arrows of \(\vec E\) skiing downhill.

---

## Chapter 24 — Capacitance and Dielectrics

**Structure.** A capacitor is a device that stores separated charge, hence energy, in a field.

### Lessons
1. Capacitance as \(Q = CV\) — a geometry-plus-material number
2. Parallel-plate as the simplest useful case
3. Combinations: series vs parallel — what is shared, \(Q\) or \(V\)
4. Energy in a capacitor as energy in the field \(\tfrac12\epsilon_0 E^2\)
5. Dielectrics: polarization as tiny dipoles lining up
6. Why \(C\) rises when you slide in a dielectric
7. Dielectric breakdown
8. Capacitors as short-time batteries in later circuits

### Visual questions
- Disconnect the battery, slide in a dielectric: what stays put — \(Q\) or \(V\)?
- Where is the energy, if I say “on the plates”?
- Series: why is the equivalent smaller than any piece?

### Misconceptions
- Capacitors store charge the way buckets store water (net charge of the device is zero)
- Dielectrics “make more charge”

### Computational bridge
Electrostatic energy minimization; dielectric interfaces in FEM; circuit-level DAEs.

### Reusable picture
Two plates, a \(Q\) slider and a \(V\) slider that refuse to be independent once \(C\) is set.

---

## Chapter 25 — Current, Resistance, and Electromotive Force

**Structure.** Current is charge in motion. Resistance is how the material taxes that motion. A battery is a charge escalator.

### Lessons
1. Current as \(I = dq/dt\) through a surface
2. Current density \(\vec J\) and the microscopic view (\(n,q,\vec v_d\))
3. Drift speed is crawling; the signal is not
4. Ohm’s law as a *material model*, not a commandment
5. Resistivity vs resistance
6. Temperature dependence
7. Microscopic model: collisions reset drift
8. EMF as work-per-charge done by a non-electrostatic agency
9. Terminal voltage vs EMF; internal resistance
10. Power: \(P=IV\), \(I^2R\), \(V^2/R\) — same money, different costumes
11. What actually flows where, and what is *used up* (energy, not current)

### Visual questions
- If current is a crawl, why does the bulb light immediately?
- Series resistors: what is the same through each?
- A battery in an open circuit: what is \(V_{\text{terminal}}\)?

### Misconceptions
- Current is used up in the bulb
- Voltage flows
- Electrons move at the speed of light in the wire
- EMF is a force

### Computational bridge
Circuit DAEs; drift-diffusion; Joule heating as a source term.

### Reusable picture
A thin pipe of charges creeping, while a switch-on ripple is a different object.

---

## Chapter 26 — Direct-Current Circuits

**Structure.** Kirchhoff is charge conservation and energy conservation wearing wire.

### Lessons
1. Kirchhoff junction rule (charge)
2. Kirchhoff loop rule (energy / potential)
3. Series and parallel resistors, earned again from Kirchhoff
4. Measuring: ideal vs real ammeters and voltmeters
5. RC circuits: charging and discharging as the first *time-dependent* circuit
6. Time constant \(\tau=RC\) as the lesson’s reusable number
7. Energy accounting in RC
8. Multi-loop networks as linear systems \(A I = b\)

### Visual questions
- Can I assign loop currents so Kirchhoff is almost automatic?
- In an RC discharge, where is the energy going as \(V\) falls?
- Add a resistor in parallel to one branch: what happens to total \(I\), and to that branch’s \(I\)?

### Misconceptions
- Current takes the shortest path
- The first resistor “gets” the current first
- Kirchhoff fails on capacitors (it does not; \(I=C dV/dt\) sits inside it)

### Computational bridge
This is a linear-algebra gym: sparse \(A I = b\). RC is an ODE. Later, implicit time stepping on circuits.

### Reusable picture
A loop with heights of potential marked like a hike that must return to the same altitude.

---

## Chapter 27 — Magnetic Field and Magnetic Forces

**Structure.** Magnetism is the velocity-dependent cousin of the electric force. \(\vec B\) is defined by what it does to a moving charge.

### Lessons
1. \(\vec F = q\vec v\times\vec B\) as the definition-in-practice
2. Right-hand rule as geometry, not magic
3. Magnetic force does no work
4. Helical motion in \(\vec B\)
5. \(p = qBR\) for a perpendicular kick
6. Velocity selectors, mass spectrometers as applied costumes
7. Force on a current: \(I\vec\ell\times\vec B\)
8. Torque on a loop; magnetic dipole moment \(\vec\mu\)
9. Motors as continuous torque
10. Hall effect as moving charges piled to one side
11. Crossed \(\vec E\) and \(\vec B\)

### Visual questions
- A charge moves parallel to \(\vec B\). What happens?
- Why can \(\vec B\) steer but never speed up a charge?
- A loop in \(\vec B\): when is the torque maximum?

### Misconceptions
- Magnetic force does work (relapse every year)
- Field lines pull
- North poles are “positive magnet charge”
- A magnet at rest feels a force from a constant \(\vec B\)

### Computational bridge
Boris pusher in PIC; Lorentz force ODE; magnetostatics vs electrodynamics.

### Reusable picture
A velocity arrow being twisted perpendicular to itself and to \(\vec B\), speed unchanged.

---

## Chapter 28 — Sources of Magnetic Field

**Structure.** Currents make \(\vec B\). Superposition and symmetry again. Ampère is Gauss’s circulation cousin.

### Lessons
1. Biot–Savart as the Coulomb of magnetostatics
2. Field of a long wire, a loop, a solenoid — the useful catalog
3. Force between two wires (the SI definition of the ampere, historically)
4. Ampère’s law: \(\oint\vec B\cdot d\vec\ell = \mu_0 I_{\text{enc}}\)
5. When Ampère is a tool (symmetry) vs a truth
6. Solenoid and toroid as Ampère showpieces
7. Magnetic materials: moments lining up; \(\mu_0\) vs \(\mu\)
8. There are no magnetic monopoles — Gauss for \(\vec B\)

### Visual questions
- Inside a long solenoid, if I double the turns-per-length, what happens to \(B\)?
- A wire through a loop that is *not* circular: can Ampère still give \(B\)?
- Why does \(\oint\vec B\cdot d\vec A = 0\)?

### Misconceptions
- Ampère’s law requires a circular path
- Magnetic field lines begin at north poles the way electric lines begin on charges (they close)

### Computational bridge
Magnetostatic FEM with edge elements; Biot–Savart integration; \(\nabla\cdot B=0\) as a constraint in MHD (constrained transport).

### Reusable picture
A right-hand grip around a wire, and a circulation integral that only cares what pierces the loop.

---

## Chapter 29 — Electromagnetic Induction

**Structure.** A changing magnetic world makes an electric circulation. Nature keeps \(\vec B\) reluctant to change.

### Lessons
1. Magnetic flux
2. Faraday: \(\mathcal{E} = -d\Phi_B/dt\)
3. The minus is Lenz: the induced current fights the change
4. Motional EMF as charges in a moving bar feeling \(q\vec v\times\vec B\)
5. Eddy currents as Lenz distributed through a lump
6. Generators
7. Induced \(\vec E\) from a changing \(\vec B\) even with no wire
8. Faraday in differential form as a Maxwell equation

### Visual questions
- Slide a loop into \(\vec B\). When is there current — entering, sitting, leaving?
- If I deform the loop but keep \(\Phi\) constant, is there an EMF?
- A superconducting loop: what does Lenz refuse to let change?

### Misconceptions
- There must be a “physical magnetic force on charges” in every induction problem
- Flux is field
- Lenz is optional bookkeeping

### Computational bridge
The heart of FDTD time-stepping: Faraday on a Yee face. Moving conductors as ALE / sliding meshes.

### Reusable picture
A flux-through-a-loop meter and a current that only exists while the meter is moving.

---

## Chapter 30 — Inductance

**Structure.** A circuit element that stores energy in \(\vec B\) and resists changes in \(I\).

### Lessons
1. Mutual inductance
2. Self-inductance; \(L\) as geometry
3. \(\mathcal{E} = -L dI/dt\)
4. RL circuits: the magnetic twin of RC
5. Time constant \(\tau = L/R\)
6. Energy in an inductor as energy in \(\vec B\)
7. LC oscillation as SHM in costume
8. LRC as a damped oscillator

### Visual questions
- At the instant an RL circuit is closed, what is \(I\), and why is that Lenz?
- Where is the energy when \(I\) is maximum in an LC loop?
- Drag \(R\) up in an LRC. What happens to the ringing?

### Misconceptions
- Inductors “block current” rather than block *change*
- LC energy vanishes at the zero-current moment

### Computational bridge
Circuit ODE stiff systems; implicit integrators; LC as a symplectic test problem.

### Reusable picture
An LC loop with energy sloshing between the capacitor’s \(E\) and the inductor’s \(B\).

---

## Chapter 31 — Alternating Current

**Structure.** Driven LRC is resonance wearing wires. RMS is how you talk about oscillating power.

### Lessons
1. Phasors as rotating arrows that add like vectors
2. Resistive, inductive, capacitive current–voltage phase
3. Reactance vs resistance
4. Impedance as the AC generalization
5. Driven LRC: amplitude and phase vs frequency
6. Resonance, again
7. Power factor; average power
8. RMS
9. Transformers as induction plus energy accounting
10. Why high voltage for long-distance lines

### Visual questions
- At resonance, which phasors cancel?
- If \(V\) and \(I\) are 90° apart, what is the average power?
- Step-up transformer: what is conserved — \(V\), \(I\), or (ideally) power?

### Misconceptions
- Current is used up in the transformer
- Higher voltage is “more electricity”
- Resonance in AC is a different phenomenon from Ch. 14

### Computational bridge
Frequency-domain linear algebra; harmonic balance; phasors as complex arithmetic.

### Reusable picture
Three phasor arrows on a rotating canvas, one of them \(V_L\) standing opposite \(V_C\).

---

## Chapter 32 — Electromagnetic Waves

**Structure.** Maxwell’s missing piece makes light a solution, not a substance.

### Lessons
1. The displacement current as the patch that saves charge conservation
2. Maxwell’s four equations as a complete set
3. Why a changing \(\vec E\) makes \(\vec B\) and a changing \(\vec B\) makes \(\vec E\)
4. The wave equation and \(c = 1/\sqrt{\mu_0\epsilon_0}\)
5. Plane EM waves: \(\vec E\perp\vec B\perp\vec k\)
6. \(E/B = c\)
7. Energy flux: Poynting vector
8. Radiation pressure
9. Spectrum as the same object at different \(f\)
10. Polarization
11. Production: accelerating charges (qualitative)

### Visual questions
- If I freeze an EM wave, what is in phase with what?
- What does a polarizer remove — energy, a component of \(\vec E\), or “the magnetic part”?
- Why can light travel where there is no medium, unlike sound?

### Misconceptions
- EM waves need a medium (the 19th-century hangover)
- The electric and magnetic parts take turns
- Radio, light, and X-rays are different kinds of thing

### Computational bridge
FDTD Yee cell is this chapter on a grid. CFL becomes “light must not jump a cell.” PML is the open-boundary costume.

### Reusable picture
Two transverse arrows, \(E\) and \(B\), skating forward together.

---

# OPTICS

## Chapter 33 — The Nature and Propagation of Light

**Structure.** Light is an EM wave that also has a ray costume when \(\lambda\) is small compared with the scenery.

### Lessons
1. Wave vs ray vs photon as three levels of description
2. Index of refraction as “\(c\) is slower here”
3. Huygens’ principle as a construction
4. Reflection
5. Refraction and Snell
6. Total internal reflection
7. Dispersion as \(n(f)\)
8. Polarization by reflection (Brewster) and by polarizers
9. Intensity after a polarizer: Malus

### Visual questions
- Why does a stick look bent, and which way?
- If I raise \(n\), what happens to \(\lambda\) inside the material? To \(f\)?
- Two polarizers at 90°. A third in the middle at 45° — why does light return?

### Misconceptions
- Frequency changes in the medium
- Light “takes the shortest path” as a slogan without the optical-path idea
- Polarization is “the magnetic direction”

### Computational bridge
Ray tracing vs full-wave FDTD vs beam propagation. When each level of description is legal.

### Reusable picture
A wavefront hitting an interface, with rays drawn as the local normals.

---

## Chapter 34 — Geometric Optics

**Structure.** Rays through mirrors and lenses. Images are places where rays *think* they meet.

### Lessons
1. Plane mirrors and virtual images
2. Spherical mirrors: real vs virtual, sign conventions as a language
3. Ray diagrams as the visual world that the formula captions
4. Thin lenses: converging vs diverging
5. The lens equation and magnification
6. Optical instruments: eye, camera, microscope, telescope as stacked costumes
7. Aberrations as “the thin-lens world was a model”

### Visual questions
- Which three rays are enough to locate the image?
- If I cover half the lens, what happens to the image — half of it missing, or dimmer?
- Object inside the focal point of a converging lens: where is the image?

### Misconceptions
- The image lives on the mirror surface
- Covering the lens cuts the image in half
- Virtual means “not real so not useful”

### Computational bridge
Sequential ray tracing; later, wave optics when geometric optics dies (Ch. 35–36).

### Reusable picture
A three-ray diagram that still works if you hide the formula.

---

## Chapter 35 — Interference

**Structure.** Two coherent waves add. Bright and dark are geometry plus phase.

### Lessons
1. Superposition of harmonic waves
2. Coherence: why two lamps do not make a clean pattern
3. Double slit: path difference as the whole game
4. Young’s formula
5. Intensity pattern, not just peak locations
6. Thin films: extra phase flips on reflection
7. Michelson interferometer
8. Interference as a measurement tool

### Visual questions
- Move one slit a little. Which way does the pattern shift?
- Why is the center of a soap film dark when it is thinnest?
- What does “constructive” look like on the actual \(E(t)\) traces?

### Misconceptions
- Interference destroys energy
- Path difference of \(\lambda\) is dark
- Phase change on reflection is optional flavor

### Computational bridge
Two-source superposition on a grid; optical path as a line integral of \(n\).

### Reusable picture
Two circular ripples and a screen whose brightness is their sum.

---

## Chapter 36 — Diffraction

**Structure.** Finite apertures interfere with themselves. The limit of “ray” is visible.

### Lessons
1. Single-slit diffraction as interference of many Huygens sources
2. Minima locations
3. Circular apertures and angular resolution
4. Rayleigh criterion
5. Diffraction gratings as many-slit interference
6. Resolving power of a grating
7. X-ray diffraction as a crystal grating (bridge to Ch. 42)
8. When to use ray, interference, or diffraction language

### Visual questions
- Narrow the slit: what happens to the central width — and why is that backward from “small hole, small spot”?
- Two stars: drag their angular separation across the Rayleigh line
- Grating vs double slit: what got sharper, and what paid for that?

### Misconceptions
- Diffraction is a different phenomenon from interference
- Light going through a hole just makes a hole-shaped bright spot
- Telescopes are limited by “how much they magnify”

### Computational bridge
Fourier optics: the far field *is* a Fourier transform. Spectral methods wearing light.

### Reusable picture
A slit whose narrowing fattens the central blob.

---

# MODERN PHYSICS

## Chapter 37 — Relativity

**Structure.** The stage is spacetime. \(c\) is a conversion factor and a speed limit. Simultaneous is a dialect.

### Lessons
1. Why Galilean addition dies at high speed
2. The two postulates
3. Relativity of simultaneity as the first shock
4. Time dilation
5. Length contraction — of which length?
6. Lorentz transformation as the rotation-cousin of spacetime
7. Velocity addition
8. Doppler for light
9. Spacetime diagrams that make paradoxes ordinary
10. Twin paradox as unequal proper time, not a logic bug
11. \(E^2 = (pc)^2 + (mc^2)^2\)
12. Rest energy; kinetic energy at high \(v\)
13. Mass is invariant; “relativistic mass” is a costume this product should not sell
14. Force and acceleration are no longer parallel in general
15. A taste of GR: gravity as geometry, tides as curvature — not the course, a door

### Visual questions
- Two lightning strikes and a moving observer: who calls them simultaneous?
- If I fly past a moving clock, whose proper time is the tick it shows?
- A particle with \(v=0.8c\): what fraction of its energy is rest energy?

### Misconceptions
- Everything is relative, including \(c\)
- Objects *gain mass*
- Twins paradox is unresolved
- Time dilation is an optical illusion
- Relativity applies only to “high-tech” objects, not to muons and GPS

### Computational bridge
Relativistic particle pushers; special-relativistic hydro; GR as a later field theory with constraints.

### Reusable picture
A spacetime diagram with two worldlines and a dashed line of simultaneity you can tilt.

---

## Chapter 38 — Photons: Light Waves Behaving as Particles

**Structure.** Some experiments count lumps of light. The lumps have \(E=hf\) and \(p=h/\lambda\).

### Lessons
1. Blackbody spectrum and why classical physics burned (ultraviolet catastrophe)
2. Planck’s quantum as an accounting trick that worked
3. Photoelectric effect: the data that a wave cannot cheaply wear
4. Work function, cutoff frequency, \(K_{\max}=hf-\phi\)
5. Why intensity does not buy you kinetic energy
6. Photons as the particle costume of the EM wave
7. Compton scattering as a collision with a particle of momentum \(h/\lambda\)
8. Pair production as energy-to-matter with a partner (nucleus) for momentum
9. Wave–particle duality as “which experiment, which costume,” not a mood

### Visual questions
- Raise intensity below cutoff. What happens — more electrons, faster electrons, or neither?
- Compton: if \(\lambda'-\lambda\) is independent of the target electron’s binding, what kind of collision was this?
- How can a wave model fail the photoelectric timing?

### Misconceptions
- Photons are little billiard balls of light traveling on rays
- Higher intensity means higher photon energy
- Duality means “both at once in the everyday sense”

### Computational bridge
Monte Carlo photon transport; discrete absorption events.

### Reusable picture
A threshold on a frequency axis that intensity cannot buy its way across.

---

## Chapter 39 — Particles Behaving as Waves

**Structure.** Matter has a wavelength. Bound waves come in standing patterns. That is already half of quantum mechanics.

### Lessons
1. de Broglie \(\lambda = h/p\)
2. Davisson–Germer / electron diffraction
3. Bohr model as a *historical standing-wave costume* — useful, then retired
4. Quantized angular momentum in Bohr, and why the real theory replaces it
5. Energy levels and spectra as evidence of standing patterns
6. Uncertainty principle as a wave-packet fact, not a clumsy measurement
7. Why “particle in a box” is the next chapter’s simplest useful case
8. Correspondence: big \(n\) should look classical

### Visual questions
- Slower electron: fatter or thinner diffraction rings?
- If \(\Delta x\) shrinks, what must happen to \(\Delta p\), and why is that a wave story?
- Which Bohr orbits are allowed if you demand an integer number of \(\lambda\) on the ring — and why is that not the final theory?

### Misconceptions
- Uncertainty is equipment error
- Electrons travel on Bohr circles
- Particles “turn into waves”

### Computational bridge
Dispersion of a free particle; spectral methods for a wave packet.

### Reusable picture
A wave packet whose squeeze in \(x\) forces a spread in \(k\).

---

## Chapter 40 — Quantum Mechanics I: Wave Functions

**Structure.** The state is \(\psi\). \(|\psi|^2\) is where you find the particle. The Schrödinger equation is the dynamics.

### Lessons
1. \(\psi(x,t)\) as the new state variable
2. Born rule; normalization
3. Why phase matters even if \(|\psi|^2\) hides it
4. Operators, expectation values
5. Time-dependent Schrödinger equation
6. Stationary states as standing patterns with a ticking phase
7. Time-independent Schrödinger as an eigenvalue problem
8. Infinite square well: the string’s normal modes in a new costume
9. Finite well; tunneling as a standing-pattern leak
10. Barrier tunneling and scanning-tunneling intuition
11. Harmonic oscillator: even spacing, zero-point energy
12. Superposition and time dependence of \(|\psi|^2\) when several \(n\) are in play
13. Measurement as “which question did you ask the state” — lightly, carefully

### Visual questions
- If \(\psi\) is real and positive everywhere in the ground well, where is the particle “moving”?
- Raise the barrier. What happens to the tail next door?
- Superpose \(n=1\) and \(n=2\). What sloshes?

### Misconceptions
- Only energy eigenstates exist
- \(|\psi|^2\) *is* the state
- \(\psi\) is a wave in physical 3-space for many particles (it is on configuration space)
- Tunneling is walking through a hill with leftover kinetic energy
- Zero-point energy is a rounding error

### Computational bridge
This *is* Track Q: spatial discretizations of Schrödinger, split-operator FFT, imaginary-time relaxation to the ground state, matrix eigenvalue problems.

### Reusable picture
A well with a standing \(|\psi|^2\), and a second picture where a packet hits a barrier and a ghost appears on the other side.

---

## Chapter 41 — Quantum Mechanics II: Atomic Structure

**Structure.** Hydrogen is a 3D standing wave with quantum numbers. Spin and exclusion build the periodic table.

### Lessons
1. Hydrogen: separation in spherical coordinates
2. \(n, \ell, m_\ell\) as labels of standing waves
3. Radial probability vs \(|\psi|^2\) in 3D
4. Angular shapes: s, p, d
5. Spin as an extra two-valued degree of freedom (Stern–Gerlach)
6. Selection rules as “which jumps the EM field will buy”
7. Pauli exclusion
8. Building the periodic table as filling standing-wave slots
9. Screening and why chemistry is not just hydrogen copies
10. X-rays and inner-shell jumps
11. A first look at identical particles and why it matters

### Visual questions
- Why is the radial probability peak of 1s not at the nucleus, while \(|\psi|^2\) is largest there?
- If I do not measure \(L_z\), is the electron “in a p orbital spinning around z”?
- Why can two electrons share \(n\ell m_\ell\)?

### Misconceptions
- Electrons orbit
- Orbitals are balloons the electron rides on
- Spin is a little spinning ball
- Exclusion is “electrons hate each other electrically”

### Computational bridge
Self-consistent field loops (HF/DFT structure); basis sets; configuration interaction as a bigger eigenvalue problem.

### Reusable picture
A hydrogen probability cloud with sliders on \(n,\ell,m\), plus a filling diagram for multi-electron atoms.

---

## Chapter 42 — Molecules and Condensed Matter

**Structure.** Binding is a quantum energy-budget. Solids are enormous molecules with bands.

### Lessons
1. Covalent, ionic, metallic as three binding costumes
2. Molecular orbitals as standing waves on two centers
3. Rotation and vibration spectra
4. Bonding vs antibonding
5. Crystals as periodic potentials
6. Bands from overlapping levels
7. Metals, insulators, semiconductors as “where the Fermi level sits”
8. Holes as a bookkeeping costume
9. Doping
10. Devices at the cartoon level: diode, LED, solar cell
11. Superconductivity as a named phenomenon with a later theory
12. Diffraction from crystals (Bragg) tying back to Ch. 36

### Visual questions
- Pull two hydrogen wells apart. What happens to the split levels?
- Why does a full band refuse to carry current?
- Bragg: which planes “look like a grating”?

### Misconceptions
- Electrons in a metal sit still until voltage is applied
- Holes are actual positive particles living in the lattice
- Semiconductors are “half-conductors”

### Computational bridge
Band-structure solvers; plane-wave DFT; tight-binding as a discrete Hamiltonian on a lattice — the same eigenproblem as Course B4.7.

### Reusable picture
Two wells becoming a split pair, then a lattice becoming a band.

---

## Chapter 43 — Nuclear Physics

**Structure.** The nucleus is a quantum drop with two charges of baryon. Binding, decay, and reactions are energy ledgers with a new force.

### Lessons
1. Nuclide notation; isotopes
2. Size and density as nearly constant — the drop
3. Binding energy curve as the most important graph in the chapter
4. Why fusion on the left and fission on the right both pay
5. Radioactivity: \(\alpha,\beta,\gamma\) as three different ejections
6. Decay law as a constant-probability-per-time process
7. Activity, half-life, dating
8. Nuclear reactions and Q-value
9. Fission chain as a multiplication factor
10. Fusion conditions
11. Biological dose, lightly and precisely
12. The neutrino as “missing energy and missing spin” done right

### Visual questions
- Where on the binding curve is iron, and why does that matter to stars?
- A decay chain: which clock is the half-life of the sample?
- Why does \(\beta\) decay change the element and \(\gamma\) does not?

### Misconceptions
- All radiation is the same
- Half-life means the sample is gone in two half-lives
- Fission and fusion are opposite in every sense rather than both “move toward \(^{56}\)Fe”

### Computational bridge
Stochastic decay (Poisson process); Monte Carlo radiation transport; two-body kinematics of reactions.

### Reusable picture
The binding-energy-per-nucleon curve with a ball that can roll toward iron from either side.

---

## Chapter 44 — Particle Physics and Cosmology

**Structure.** A classified list of what the world is made of, the forces as exchange, and the universe as a dynamical system with a beginning we can still see.

### Lessons
1. What “fundamental” means in this era
2. Leptons and quarks
3. Antiparticles
4. Four interactions as a table: what they act on, range, carrier
5. Feynman diagrams as bookkeeping cartoons, not maps of tiny billiard paths
6. Conservation rules that decide if a reaction is allowed
7. The Standard Model as a *successful effective theory*, not a personality
8. What it does not include (gravity, dark matter, neutrino masses as open edges)
9. Hubble expansion as kinematics of space
10. CMB as leftover light
11. Nucleosynthesis as the binding-curve’s cosmological costume
12. Dark matter and dark energy as named discrepancies, not finished objects
13. The map of epochs as a story the product should keep honest and short

### Visual questions
- Which conservation law forbids this cartoon decay?
- If space stretches wavelengths, what happens to a photon’s energy over cosmic time?
- Why is the night sky dark in an expanding universe? (Olbers as a door)

### Misconceptions
- Particles are little balls with exchange-balls flying between them
- The Standard Model is “finished physics”
- The Big Bang is an explosion *into* space
- Quantum mechanics and relativity are optional flavor at this scale

### Computational bridge
Event generators; N-body cosmology; Boltzmann solvers for the CMB — advanced clothing, not intro lessons.

### Reusable picture
A tidy interaction table plus an expanding grid with wavelengths stretching on it.

---

## 4. Cross-cutting questions (recurring solvables)

These should return in new clothes across chapters.

**What kind of quantity?**
- Scalar, vector, pseudovector, tensor, density, flux, field, invariant

**What is conserved, and under what deal?**
- Momentum if no external impulse
- Mechanical energy if no nonconservative work
- Charge always (in this curriculum)
- Entropy of the universe in spontaneous processes
- Probability \(\int|\psi|^2\)

**Which level of description?**
- Point mass / rigid body / elastic continuum / fluid / ray / wave / photon / field / distribution

**Which representation?**
- Motion graphs ↔ worldline ↔ energy diagram
- \(\vec E\) arrows ↔ \(V\) contours ↔ field lines
- Snapshot of a wave ↔ history at a point ↔ \(k\)–\(\omega\)

**Is the model in its domain?**
- No drag? Really?
- Infinite plane? Really?
- Ideal gas at this density?
- Ray optics at this aperture?

---

## 5. Misconception library (coach data, by family)

Design lessons so the wrong move is possible and visible.

| Family | Signature wrong move |
|---|---|
| Force & motion | force belongs to velocity, not to acceleration |
| Energy | energy is a stuff that runs out; heat is a fluid |
| Momentum | only elastic collisions conserve \(\vec P\) |
| Rotation | centripetal / centrifugal confusion; \(I\) ignores axis |
| Fluids | Bernoulli as a slogan; buoyancy as a magic upward fluid |
| Gravity | no gravity in space; tides as a single lift |
| Waves | the medium travels; frequency is of the string |
| Thermo | \(Q\) and \(W\) are properties of the gas; entropy is mess |
| Circuits | current is used up; voltage flows |
| Fields | fields exist only when a test object is present |
| Induction | something must physically hit the charges |
| Light | frequency changes in a medium; covering a lens cuts the image |
| Relativity | mass grows; simultaneity is universal |
| Quanta | intensity raises photon energy; \(\psi\) is a trajectory smear |
| Nuclei | radiation is one thing; half-life empties the sample in two steps |

---

## 6. Recommended sequences

### Path U — standard university spine
Ch. 1–14, 15–16, 17–20, 21–32, 33–36, 37–44.  
Use when pairing with a conventional course.

### Path V — visual-first (product default)
1. Vectors and rates (Ch. 1–2)
2. Motion in space (Ch. 3)
3. Interaction (Ch. 4–5)
4. Two ledgers: energy and momentum (Ch. 6–8)
5. Fields first with gravity (Ch. 13 selected) then oscillation (Ch. 14)
6. Waves (Ch. 15–16, 32 as EM wave)
7. Thermal ledgers (Ch. 17–20)
8. Charge and field (Ch. 21–23) before circuits (Ch. 25–26)
9. Magnetism and induction (Ch. 27–30) then Maxwell (Ch. 32)
10. Light (Ch. 33–36)
11. Relativity then quanta (Ch. 37–41)
12. Matter, nuclei, cosmos (Ch. 42–44)

Rotation and fluids can sit after energy/momentum without blocking fields.

### Path C — “needed for computational physics”
The minimum physics so the other map is not empty clothing.

- Ch. 2–3 kinematics as ODEs
- Ch. 4–5 forces, constraints, drag
- Ch. 6–8 conservation audits
- Ch. 9–10 rigid body
- Ch. 12 continuum + Bernoulli + viscosity
- Ch. 14 oscillators and resonance
- Ch. 15 wave equation
- Ch. 18–20 kinetic theory + thermo constraints
- Ch. 21–23, 27–29, 32 fields and Maxwell
- Ch. 40 Schrödinger
- Ch. 13 gravity / Poisson

Elasticity (11), circuits (25–31), optics (33–36), nuclear/particle (43–44) are domain tracks, not blockers.

### Placement diagnostic (interactive, short)
- Read \(v\) from an \(x(t)\) graph
- Draw an FBD that is not a motion diagram
- Decide whether \(K\) or \(\vec P\) is conserved in a sticky collision
- Point \(\vec E\) on a \(V\) map
- Predict photoelectric \(K_{\max}\) when intensity doubles below cutoff

---

## 7. Lesson anatomy (physics-specific)

Use the product thesis beats.

1. **Hook** — a situation that is slightly too interesting: a scale in an elevator, two pulses meeting, a loop entering \(\vec B\), a well with a tail next door
2. **Naive attempt** — let Aristotelian or slogan-physics try
3. **World talks back** — the meter, the trace, the field arrow, the histogram
4. **Name the structure** — one or two sentences; formula as caption
5. **Tighten** — same world, one new constraint
6. **Representation shift** — graphs ↔ arrows ↔ energy bar ↔ equation
7. **Near transfer** — new costume (spring → pendulum → LC → finite well)
8. **Edge** — drag, finite well, off-axis field, inelastic, damping
9. **Reusable picture**

**Solvable primitives that matter here**
- locators on worldlines and rays
- force-arrow drawers (FBD builder)
- sliders on \(m,k,q,B,T,n,\ell\)
- linked graphs
- field-line / equipotential canvases
- phasor rotators
- potential-landscape marbles
- two-source ripple tanks
- estimate-then-run

**Silence test.** If the first sentence is a definition, rewrite. If 30% of the words can go, they go.

---

## 8. Product packaging (courses the studio can ship)

Each item is a Brilliant-style course made of many tiny lessons, not a textbook chapter dump.

**Motion**
1. What a measurement is
2. Graphs that must agree
3. Arrows in space
4. Projectiles and circles
5. Relative motion

**Interaction**
6. Inertia and mass
7. Free-body language
8. Ramps, strings, friction
9. Going in circles with Newton

**Ledgers**
10. Work as a shared piece of two arrows
11. Landscapes of \(U\)
12. Impulse and the CM story
13. Collisions

**Extended matter**
14. Spinning
15. Torque and \(L\)
16. Statics
17. Stress and strain
18. Pressure and buoyancy
19. Flow and Bernoulli

**Gravity and ticks**
20. Inverse square and shells
21. Orbits
22. Harmonic motion
23. Resonance

**Waves**
24. Traveling patterns
25. Standing patterns
26. Sound
27. Superposition

**Heat**
28. Temperature is not heat
29. Gases as particles
30. The first law on a \(P\)–\(V\) page
31. Why not everything that conserves energy happens

**Fields**
32. Charge and \(\vec E\)
33. Flux and Gauss
34. Potential landscapes
35. Capacitors
36. Current and energy in wires
37. Kirchhoff
38. \(\vec B\) steers
39. Currents make \(\vec B\)
40. Faraday and Lenz
41. Inductors and LC
42. AC resonance
43. Light is a Maxwell solution

**Optics**
44. Rays
45. Images
46. Two-source interference
47. Apertures and resolution

**Modern**
48. Spacetime
49. Photons
50. Matter waves
51. \(\psi\) and wells
52. Atoms
53. Bonds and bands
54. Nuclei
55. What the world is made of

Depth beats catalog. Twenty good solvables on free-body diagrams beat a new “chapter” with four screens.

---

## 9. Quality bar (same as the thesis, specialized)

- **Eight-minute test.** A rusty adult gets one genuine “oh.”
- **Mute test.** Interactives still teach with the coach off.
- **Transfer test.** New story, same structure (spring energy → gravity well → LC).
- **Representation test.** At least two costumes.
- **Struggle test.** The Aristotelian move is available and visibly wrong.
- **Silence test.** Cut words.
- **Tomorrow test.** A picture remains (linked graphs, FBD, \(U(x)\) track, flux balloon, phasors, well + tail).
- **Pride test.** A serious person would send the lesson because the idea is beautiful.

Fail two → rewrite.

---

## 10. Closing brief for lesson authors

Do not start with “explain Chapter 22.”

Start with:

1. What structure? (a flux, a ledger, a standing pattern, a pair of forces…)
2. What object can the learner move?
3. What question is unanswerable without moving it?
4. What wrong move is most likely, and how does the world show it?
5. Simplest useful case?
6. Same idea, different clothes?
7. What picture remains tomorrow?

Then write the solvables. Only then write the sentences that name what they already did.

University physics is not 44 chapters.  
It is a small set of structures — rate, accumulation, interaction, ledger, field, wave, ensemble, quantum amplitude — wearing many costumes.

That is the whole map.
