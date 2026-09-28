/** Scenario pack — University Physics, Chapter 39 (Particles Behaving as Waves).
 *
 *  Registered automatically by the glob in `../estimate-scenarios.ts`. The truth
 *  is computed from `src/lib/physics/matterwaves.ts`, whose tests pin it.
 */
import type { EstimateScenario } from '../estimate-scenarios.ts';
import { baseballWavelength, electronWavelength } from '../../../lib/physics/matterwaves.ts';

export const estimate: Record<string, EstimateScenario> = {
  /* A 145 g ball at 40 m/s: λ = h/mv ≈ 1.1 × 10⁻³⁴ m. */
  'up-ch39-baseball-wavelength': {
    quantity: 'the de Broglie wavelength of a 145 g baseball thrown at 40 m/s',
    unit: 'm',
    logRange: [-38, 0],
    logStart: -8,
    withinFactor: 10,
    truth: () => baseballWavelength(),
    landmarks: [
      { value: 0.074, label: 'the ball itself' },
      { value: 5e-7, label: 'visible light' },
      { value: electronWavelength(54), label: 'a 54 V electron' },
      { value: 1e-15, label: 'a proton' },
    ],
  },
};
