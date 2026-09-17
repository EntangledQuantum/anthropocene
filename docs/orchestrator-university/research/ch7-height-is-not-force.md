# Chapter 7 research — height is not force

Research performed 2026-09-17, before implementation. Scope: one 12-minute opening lesson, not the full chapter. Read the thesis, chapter brief, curriculum Chapter 7, handoff, existing ForceFromSlope, PotentialTrack, landscapes-ch7 and tests, and the linked-graph/GPU exemplars.

## Sources actually consulted

- OpenStax, University Physics Volume 1, §8.4, [Potential Energy Diagrams and Stability](https://openstax.org/books/university-physics-volume-1/pages/8-4-potential-energy-diagrams-and-stability). Retrieved with WebFetch after a search corrected my initial erroneous §8.5 URL (404). The retrieved section confirms F = −dU/dx, the spring potential U = kx²/2, allowed regions and equilibrium. This is the physics basis: force follows local slope, not the value of U. The lesson is restricted to a smooth, time-independent one-dimensional conservative potential; it does not claim every force admits one.
- Bret Victor, [Tangle](https://worrydream.com/Tangle/). Retrieved with WebFetch. The page describes reactive documents in which adjustable inputs update derived values immediately, using initialize/update hooks. Adopt the dependency structure, not its implementation: the force panel is derived from the same potential and is not independently editable; shifting the energy reference must not change force.
- PhET, [Energy Skate Park Basics](https://phet.colorado.edu/en/simulations/energy-skate-park-basics) and its teaching-resources URL. Retrieved with WebFetch, but the extracted page only named energy/conservation topics and exposed no usable control or learning-goal details. I did NOT run the simulation and make no verified claims about its interface. It is a candidate precedent, not evidence for implementation decisions here.

## Decisions and limitations

- Recover ForceFromSlope and the existing smooth two-step potential. The high shelf has a small nonzero slope (tanh is asymptotic), not a perfectly flat top. Say “nearly flat” and “tiny force,” never exactly zero there.
- Ask which point has larger force before revealing the derived force panel; then hunt the strongest force on the right-hand step. A higher-energy shelf is an available, visible wrong choice.
- Shift the entire U curve on a fixed energy ruler; the derivative remains unchanged. Only after that experiment introduce the constant-offset notation.
- Near transfer: a spring reverses force across its minimum; a uniform-gravity potential has different heights but the same force. These are not copies of the two-step silhouette.
- Retain separate U and F plots sharing an x-axis, add numeric position ticks, a probe-linked readout and table, and unique clip IDs. The probe slider supplies keyboard access; reveal/reset controls do not autoplay.
- PotentialTrack is intentionally not embedded. Reading its code revealed shared issues: reset always sets v to zero even for supplied non-turning startX; boundary handling reflects rather than stopping an escaping marble; energy bars have zero width; axes lack numeric ticks. This lesson does not need motion or turning points, so it uses the more appropriate recovered ForceFromSlope without editing the shared component. These findings require parent follow-up, not a chapter-7 workaround fork.
- No browser or static-build verification is claimed. Parent will perform it. Targeted tests will pin the authored numbers, slope/sign and offset invariance, and scenario truth. The existing tests cover the underlying landscapes and integrator separately.
