# University Physics — build queue

The map is [`docs/university-physics-curriculum.md`](docs/university-physics-curriculum.md).
The authoring contract is [`docs/university-physics-brief.md`](docs/university-physics-brief.md).

All 44 chapters exist as `chapter.yaml` from day one, so the shape of the path is visible
before it is full. A chapter is `status: 'draft'` until it has real lessons, then `'live'`.

**Working rule.** One agent owns one chapter and writes its two flagship lessons — the
ones carrying the chapter's core structure and its reusable picture. Depth passes come
later; a chapter with two excellent lessons beats four thin ones. Ship the lesson, tick the
row, same commit.

## How lessons are built now

Every lesson is a sequence of `<Step>`s with one decision each, built on small
self-checking scenes from `src/components/viz/scene.tsx` (`AGENTS.md` §2a). The old
shared "worlds" (FbdBuilder, LinkedGraphs, PotentialTrack, FieldCanvas and the rest)
were deleted in the rewrite: reuse the kit and `src/lib/physics/`, not a lab.

Chapters are written by one agent each, from
[`docs/orchestrator-university/AGENT-BRIEF.md`](docs/orchestrator-university/AGENT-BRIEF.md).

## Chapters

Tick when the chapter has its two flagship lessons live.

### Mechanics
- [x] 01 Language of Nature — dimension, vectorhood
- [x] 02 Motion Along a Line
- [x] 03 Motion in Two and Three Dimensions
- [x] 04 Newton's Laws
- [x] 05 Applying Newton's Laws
- [x] 06 Work and Kinetic Energy
- [x] 07 Potential Energy and Conservation
- [x] 08 Momentum, Impulse, and Collisions
- [x] 09 Rotation of Rigid Bodies
- [x] 10 Dynamics of Rotational Motion
- [x] 11 Equilibrium and Elasticity
- [x] 12 Fluid Mechanics
- [x] 13 Gravitation
- [x] 14 Periodic Motion

### Waves and acoustics
- [x] 15 Mechanical Waves
- [x] 16 Sound and Hearing

### Thermodynamics
- [x] 17 Temperature and Heat
- [x] 18 Thermal Properties of Matter
- [x] 19 The First Law
- [x] 20 The Second Law

### Electromagnetism
- [x] 21 Electric Charge and Electric Field
- [x] 22 Gauss's Law
- [x] 23 Electric Potential
- [x] 24 Capacitance and Dielectrics
- [x] 25 Current, Resistance, and EMF
- [x] 26 Direct-Current Circuits
- [x] 27 Magnetic Field and Magnetic Forces
- [x] 28 Sources of Magnetic Field
- [x] 29 Electromagnetic Induction
- [x] 30 Inductance
- [x] 31 Alternating Current
- [x] 32 Electromagnetic Waves

### Optics
- [x] 33 The Nature and Propagation of Light
- [x] 34 Geometric Optics
- [x] 35 Interference
- [ ] 36 Diffraction

### Modern
- [ ] 37 Relativity
- [ ] 38 Photons
- [ ] 39 Particles Behaving as Waves
- [ ] 40 Quantum Mechanics I: Wave Functions
- [ ] 41 Quantum Mechanics II: Atomic Structure
- [ ] 42 Molecules and Condensed Matter
- [ ] 43 Nuclear Physics
- [ ] 44 Particle Physics and Cosmology
