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
- [ ] 09 Rotation of Rigid Bodies
- [ ] 10 Dynamics of Rotational Motion
- [ ] 11 Equilibrium and Elasticity
- [ ] 12 Fluid Mechanics
- [ ] 13 Gravitation
- [~] 14 Periodic Motion — *"A bigger swing, the same clock" integrated and browser-tested locally; second flagship still needed*

### Waves and acoustics
- [ ] 15 Mechanical Waves
- [ ] 16 Sound and Hearing

### Thermodynamics
- [ ] 17 Temperature and Heat
- [ ] 18 Thermal Properties of Matter
- [ ] 19 The First Law
- [ ] 20 The Second Law

### Electromagnetism
- [ ] 21 Electric Charge and Electric Field
- [ ] 22 Gauss's Law
- [ ] 23 Electric Potential
- [ ] 24 Capacitance and Dielectrics
- [ ] 25 Current, Resistance, and EMF
- [ ] 26 Direct-Current Circuits
- [ ] 27 Magnetic Field and Magnetic Forces
- [ ] 28 Sources of Magnetic Field
- [ ] 29 Electromagnetic Induction
- [ ] 30 Inductance
- [ ] 31 Alternating Current
- [ ] 32 Electromagnetic Waves

### Optics
- [ ] 33 The Nature and Propagation of Light
- [ ] 34 Geometric Optics
- [ ] 35 Interference
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
