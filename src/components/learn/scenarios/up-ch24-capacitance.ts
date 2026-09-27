/** Scenario pack — University Physics, Chapter 24 (Capacitance and Dielectrics).
 *
 *  Registered automatically by the glob in `../estimate-scenarios.ts`. The truth
 *  is computed from `src/lib/physics/capacitor.ts`, whose tests pin it.
 */
import type { EstimateScenario } from '../estimate-scenarios.ts';
import { storedEnergy } from '../../../lib/physics/capacitor.ts';

export const estimate: Record<string, EstimateScenario> = {
  /* A monophasic defibrillator: a 32 µF capacitor charged to 5 kV holds 400 J,
     and dumps it through the chest in a few milliseconds. */
  'up-ch24-defibrillator': {
    quantity: 'the energy in a 32 µF defibrillator capacitor charged to 5,000 V',
    unit: 'J',
    logRange: [-3, 5],
    logStart: 0,
    withinFactor: 2.5,
    truth: () => storedEnergy(32e-6, 5000),
    landmarks: [
      { value: 0.022, label: 'the glass capacitor, full' },
      { value: 9.8, label: 'lifting 1 kg by 1 m' },
      { value: 10000, label: 'an AA battery' },
    ],
  },
};
