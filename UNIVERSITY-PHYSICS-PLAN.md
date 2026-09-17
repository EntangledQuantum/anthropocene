# University Physics — build queue

The map is [`docs/university-physics-curriculum.md`](docs/university-physics-curriculum.md).
The authoring contract is [`docs/university-physics-brief.md`](docs/university-physics-brief.md).

All 44 chapters exist as `chapter.yaml` from day one, so the shape of the path is visible
before it is full. A chapter is `status: 'draft'` until it has real lessons, then `'live'`.

**Working rule.** One agent owns one chapter and writes its two flagship lessons — the
ones carrying the chapter's core structure and its reusable picture. Depth passes come
later; a chapter with two excellent lessons beats four thin ones. Ship the lesson, tick the
row, same commit.

## Shared visual worlds

The curriculum asks for worlds that come back in new clothes. Build these general, reuse
them rather than duplicating.

| World | Component | Chapters | Status |
|---|---|---|---|
| Linked x/v/a graphs | `LinkedGraphs` | 2, 3, 14 | **built** |
| Free-body diagram builder | `FbdBuilder` | 4, 5, 11 | **built** |
| Potential track + total-E line | `PotentialTrack` | 7, 14, 30, 40 | **built** |
| Field arrows + equipotentials | `FieldCanvas` | 13, 21, 22, 23, 27, 28 | **built** |
| Two-source ripple tank | `RippleTank` | 15, 16, 35, 36 | to build |
| Phasor stage | `PhasorStage` | 31, 35 | to build |

## Chapters

Tick when the chapter has its two flagship lessons live.

### Mechanics
- [ ] 01 Language of Nature — dimension, vectorhood
- [~] 02 Motion Along a Line — *"Three graphs that must agree" live*
- [ ] 03 Motion in Two and Three Dimensions
- [x] 04 Newton's Laws — *"Nothing has to keep it going" and "Two bodies, two forces, one interaction" live*
- [ ] 05 Applying Newton's Laws
- [~] 06 Work and Kinetic Energy — *"Only the shared piece counts" integrated and browser-tested locally; second flagship still needed*
- [~] 07 Potential Energy and Conservation — *"Height is not force" integrated and browser-tested locally; second flagship still needed*
- [ ] 08 Momentum, Impulse, and Collisions
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
