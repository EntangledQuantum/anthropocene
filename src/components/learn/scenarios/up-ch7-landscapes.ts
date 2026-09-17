import type { TuneScenario } from '../tune-scenarios.ts';
import type { SketchScenario } from '../sketch-scenarios.ts';
import { CH7_LANDSCAPES, forceAt, slopeProfile, steepestPoint } from '../../../lib/physics/landscapes-ch7.ts';
import { LANDSCAPES } from '../../../lib/physics/landscape.ts';

// Restrict the hunt to one riser: the full staircase has two equally strong ones.
const rightStep = { ...CH7_LANDSCAPES.staircase, domain: [-0.6, 2.6] as [number, number] };
export const tune: Record<string, TuneScenario> = {
  'up-ch7-strongest-right-step': {
    param: { key: 'x', label: 'probe position', min: -0.6, max: 2.6, step: 0.01, value: 2.6, unit: 'm' },
    target: steepestPoint(rightStep).x,
    tolerance: 0.15,
    x: { label: 'position (m)', domain: [-0.6, 2.6] },
    y: { label: 'potential U (J)', domain: [-0.2, 3.3] },
    compute: x => ({
      series: [
        { key: 'U', label: 'potential U', color: 'orchid', points: slopeProfile(rightStep, 200).map(p => [p.x, p.U] as const) },
        { key: 'probe', label: 'your probe', color: 'cyan', style: 'dots', width: 6, points: [[x, rightStep.U(x)]] },
      ],
      readouts: [{ label: 'force magnitude', value: `${Math.abs(forceAt(rightStep, x)).toFixed(3)} N` }],
    }),
  },
};
export const sketch: Record<string, SketchScenario> = {
  'up-ch7-spring-force': {
    xLabel: 'displacement x (m)', yLabel: 'force F (N)',
    xRange: [-2, 2], yRange: [-9, 9], tolerance: 0.9,
    anchors: [{ x: 0, y: forceAt(LANDSCAPES.spring, 0), label: 'flat bottom: zero force' }],
    truth: () => slopeProfile({ ...LANDSCAPES.spring, domain: [-2, 2] }, 81).map(p => ({ x: p.x, y: p.F })),
  },
};
