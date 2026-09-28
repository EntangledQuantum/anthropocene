/** Scenario pack — University Physics, Chapter 35 (Interference).
 *
 *  Registered automatically by the glob in `../estimate-scenarios.ts`. The truth
 *  is computed from `src/lib/physics/interference.ts`, whose tests pin that a
 *  632.8 nm laser through these slits really does make stripes 7.6 mm apart.
 */
import type { EstimateScenario } from '../estimate-scenarios.ts';
import { LASER, wavelengthFromFringes } from '../../../lib/physics/interference.ts';

export const estimate: Record<string, EstimateScenario> = {
  /* Young's formula read backwards: λ = Δy d / L. */
  'up-ch35-laser': {
    quantity: 'the wavelength of a laser whose stripes are 7.6 mm apart, through slits 0.25 mm apart onto a wall 3.0 m away',
    unit: 'nm',
    logRange: [1, 4],
    logStart: 3.3,
    withinFactor: 1.2,
    truth: () => wavelengthFromFringes(0.0076, LASER.d, LASER.L) * 1e9,
    landmarks: [
      { value: 400, label: 'violet light' },
      { value: 700, label: 'deep red light' },
      { value: 2000, label: 'a bacterium' },
    ],
  },
};
