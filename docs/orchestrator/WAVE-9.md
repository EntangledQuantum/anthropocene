# Wave 9 — reconstruction and Riemann

FVM conservation is live. Append-only. JSX contractions in double quotes. Misconception ids lowercase-hyphenated.

---

## Agent 27 — The slope inside the cell

- **Curriculum:** lines **478–490** (C2.3 reconstruction / TVD / limiters).
- **Lesson:** `content/paths/computational-physics/06-fields-and-continua/08-reconstruction.mdx`
- **Owns:** `reconstruction`, `slope-limiters`
- **Requires:** `finite-volume`, `cfl-condition`
- **Interactive:** 1D advection of a square pulse. Unlimited linear reconstruction rings; minmod/superbee does not. Couple the cell averages, the reconstructed slopes, and a TV readout. Godunov’s theorem is the hook: linear >1st order + monotone is impossible.
- **Tomorrow picture:** a limited slope; TV cannot increase.
- Widget ids `rec-`. Numerics append `fvm1d.ts` or `src/lib/numerics/reconstruction.ts`. Tests: unlimited MUSCL rings on a jump; minmod TV is nonincreasing; smooth-sine order >1.

---

## Agent 28 — What two cells agree to send

- **Curriculum:** lines **491–504** (C2.4 Riemann / Godunov). Exact 1D Burgers or linear advection + a shock-tube costume. Stop before HLLC encyclopaedia.
- **Lesson:** `content/paths/computational-physics/06-fields-and-continua/09-riemann.mdx`
- **Owns:** `riemann-problem`, `godunov`
- **Requires:** `finite-volume`, `conservation-form`
- **Interactive:** left and right states on a face. The star state / flux is unique. Drag UL, UR; watch the wave pattern and the flux. Then drop that flux into Godunov and watch a shock stay sharp vs a centred flux ringing.
- **Tomorrow picture:** the Riemann fan; Godunov flux is the face value of that solution.
- Widget ids `rie-`. Numerics `src/lib/numerics/riemann.ts`. Tests: Burgers RH speed; Godunov conservative; a centred flux that oscillates at a jump.
