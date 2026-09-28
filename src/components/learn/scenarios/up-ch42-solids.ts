/** Scenario pack — University Physics, Chapter 42 (Molecules and Condensed Matter).
 *
 *  Registered automatically by the glob in `../estimate-scenarios.ts`. The truth
 *  is computed from `src/lib/physics/solids.ts`, whose tests pin it.
 */
import type { EstimateScenario } from '../estimate-scenarios.ts';
import { DIAMOND_GAP, volumePerFreeElectron } from '../../../lib/physics/solids.ts';

export const estimate: Record<string, EstimateScenario> = {
  /* Pure diamond at 20 °C, gap 5.47 eV, every other property given
     silicon's values so only the gap differs. n ∝ e^{−E_g/2kT} makes the
     free-electron density about 2 × 10⁻²⁸ per cm³: one electron in roughly
     5 × 10²¹ m³, a diamond four times the volume of the Earth. */
  'up-ch42-diamond-one-electron': {
    quantity: 'cubic metres of pure diamond, at 20 °C, that hold one electron freed by heat',
    unit: 'm³',
    logRange: [-12, 26],
    logStart: -3,
    withinFactor: 100,
    truth: () => volumePerFreeElectron(293.15, DIAMOND_GAP),
    landmarks: [
      { value: volumePerFreeElectron(293.15), label: 'silicon: a speck 6 µm across' },
      { value: 1e-6, label: 'a sugar cube' },
      { value: 2.5e3, label: 'an Olympic pool' },
      { value: 9e10, label: 'Lake Geneva' },
      { value: 2.2e19, label: 'the Moon' },
    ],
  },
};
