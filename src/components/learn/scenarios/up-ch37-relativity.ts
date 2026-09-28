/** Scenario pack — University Physics, Chapter 37 (Relativity).
 *
 *  Registered automatically by the glob in `../estimate-scenarios.ts`. The truth
 *  is computed from `src/lib/physics/relativity.ts`, whose tests pin that it
 *  equals the distance the muon covers in one lifetime (about 660 m).
 */
import type { EstimateScenario } from '../estimate-scenarios.ts';
import { MUON, atmosphereForMuon, muonReachBeta } from '../../../lib/physics/relativity.ts';

export const estimate: Record<string, EstimateScenario> = {
  /* The slowest muon that reaches the ground (γ ≈ 23) sees 15 km of air
     contracted to 15 km / γ ≈ 660 m, which is exactly how far the ground
     travels toward it in 2.2 µs. */
  'up-ch37-muon-air': {
    quantity: 'the thickness of the atmosphere in the muon’s own frame',
    unit: 'm',
    logRange: [1, 5],
    logStart: 3.5,
    withinFactor: 2,
    truth: () => atmosphereForMuon(MUON.height, muonReachBeta()),
    landmarks: [
      { value: 15000, label: 'the air, measured from the ground' },
      { value: 100, label: 'a football pitch' },
    ],
  },
};
