/** Scenario pack — University Physics, Chapter 36 (Diffraction).
 *
 *  Registered automatically by the glob in `../estimate-scenarios.ts`. The truth
 *  is computed from `src/lib/physics/diffraction.ts`: the first dark bands at
 *  a sin θ = λ, whose position is pinned against a numerically summed row of
 *  Huygens sources in diffraction.test.ts.
 */
import type { EstimateScenario } from '../estimate-scenarios.ts';
import { centralWidthFar } from '../../../lib/physics/diffraction.ts';

export const estimate: Record<string, EstimateScenario> = {
  /* A red laser pointer, 650 nm, through a 0.1 mm slit onto a wall 3 m away:
     the central band is about 39 mm wide, four hundred times the slit. */
  'up-ch36-laser-band': {
    quantity: 'width of the central bright band on the wall',
    unit: 'mm',
    logRange: [-2, 3],
    logStart: -1,
    withinFactor: 2,
    truth: () => centralWidthFar(0.1e-3, 650e-9, 3) * 1000,
    landmarks: [
      { value: 0.1, label: 'the slit itself' },
      { value: 10, label: 'a fingernail' },
      { value: 100, label: 'a hand' },
    ],
  },
};
