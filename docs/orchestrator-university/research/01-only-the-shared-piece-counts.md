# Only the shared piece counts — research and design

Research read on 2026-09-16, before implementation. Scope: exactly one 12-minute Chapter 6 lesson; constant forces and net work. Variable-force integration, power, and potential energy remain later lessons.

## Public sources actually read

1. **OpenStax, University Physics Volume 1, §7.1 Work**, William Moebs, Samuel J. Ling, Jeff Sanny. https://openstax.org/books/university-physics-volume-1/pages/7-1-work
   - Retrieved through Firecrawl (HTTP 200; cookie-heavy response), then read through WebFetch's targeted main-content extraction.
   - Constant-force work is the dot product with displacement; only the parallel component counts. A stationary held briefcase and an upward supporting force during horizontal carriage distinguish mechanical work from bodily effort. Sign follows the relative directions. The joule is a newton-metre.
   - Used for the projection experiment, reverse-force case, and the lift/lower/hold transfer question. Original prose and numerical examples here; no copied figures.
2. **OpenStax, University Physics Volume 1, §7.3 Work-Energy Theorem**, same authors. https://openstax.org/books/university-physics-volume-1/pages/7-3-work-energy-theorem
   - Read the main text in the successful Firecrawl response (HTTP 200).
   - The theorem concerns the work of **all** forces on the chosen particle; positive/negative *net* work increases/decreases kinetic energy. It follows from Newton's second law, not a separate force. The workflow explicitly retains signs before adding contributions.
   - Used for the two-force slider experiment, independently integrated speed-to-energy measurement, and the warning not to identify a rope's work with the change in kinetic energy.

## Visualization precedent and retrieval limits

- OpenStax §7.3 explicitly points to **PhET The Ramp** and describes varying the pushing and frictional forces while comparing work and energy plots. This is the authoritative description read for the linked-representation precedent: keep the forces and the work-energy comparison in one adjustable world.
- Attempted https://phet.colorado.edu/en/simulations/the-ramp through WebFetch. It returned page scaffolding only, not the simulation or learning goals. Also retrieved the Forces and Motion: Basics landing page through Firecrawl; its preview supplied the simulation link and image, not enough to claim a firsthand interaction review. No claim is made that either external simulation was run or visually inspected.
- Local precedents read: `LinkedGraphs.tsx` and `01-three-graphs.mdx` (one editable cause, derived views); `StabilityExplorer.tsx` (live wrong-path consequence); `PhaseFlow.tsx` (measure rather than assume). Existing `WorkArrows.tsx`, `work.ts`, and its tests were read first and reused rather than duplicating physics.

## Design decisions

- **First decision:** rotate a real force arrow to make its work vanish without reducing its length. The parallel projection, signed force-area rectangle, and work readout are derived from `splitForWork`. Symbols follow this experiment.
- **Three signs:** presets and full-half-plane dragging retain positive, zero, and negative cases on the same fixed scale. Reset restores the initial force as well as the displacement inspection point. Native angle/magnitude sliders provide keyboard access.
- **No misleading animation:** a displacement scrubber inspects the prescribed path; it is not a clock or a claim about speed. The unfinished widget's uniform-speed sweep is removed. In the net-work mode, a separately computed Newtonian trajectory from `pushThroughField` supplies speed and kinetic energy. If the body stops before the endpoint, the inspection range ends there and the unreachable endpoint remains explicit.
- **Second decision:** add an opposing constant brake force, then make the speed remain unchanged despite positive work by the pull. Individual signed work and their sum appear together; measured ΔK comes from the integrator, not from assigning K = K₀ + W. Weight and track reaction are identified as perpendicular, zero-work forces for the horizontal constrained particle model.
- **Representation shift:** sketch kinetic energy versus distance for a changed force pair. The grading curve is computed from the same work library, not authored point values. Near transfer uses a supported box being lifted, lowered, held, or carried horizontally.
- **Dataviz:** loaded before chart changes. Use a geometry diagram plus a signed area on one force axis, then a directly labelled numeric ledger instead of extra colorful bars. Force is the single accent; projection/displacement use neutral ink with width/dash/direct-label redundancy. Signed areas use cool/warm polarity, with neutral at zero. Native sliders and a data table expose the same values without hover. Hover/focus inspection reports x, parallel force, and work. No dual axis, palette proliferation, color-only answer, or false time animation.

## Verification contract

Targeted `work.test.ts` tests cover all stated signs, perpendicular and stationary cases, individual-vs-net cancellation, measured ΔK, and the lesson's numerical cases. Baseline: 21 tests passed before edits. Run targeted tests and content check after implementation; no server, build, or commit in this agent. Parent performs browser acceptance, including hydration, drag/keyboard parity, negative arrows staying visible, net-zero speed, stopping cutoff, and Recall/graded completion.
