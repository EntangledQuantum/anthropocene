import type { Series } from '../viz/chart-core.ts';
import type { AxisSpec } from '../viz/chart-core.ts';
import type { ParamSpec } from '../viz/controls.tsx';
import { SCHEMES, TARGETS, diffSweep, hSweep } from '../../lib/numerics/diff.ts';
import { integrate } from '../../lib/numerics/ode.ts';
import { decay } from '../../lib/numerics/problems.ts';
import { forwardEuler } from '../../lib/numerics/ode.ts';

/**
 * Named scenarios for `<Tune>`.
 *
 * Astro serialises island props as JSON, so a lesson cannot hand a widget a
 * `compute` function. Instead a lesson names a scenario and the computation
 * lives here, in client code. Adding a `<Tune>` interaction means adding an
 * entry to this registry — see AGENTS.md.
 */

export interface TuneScenario {
  param: ParamSpec;
  target: number;
  tolerance: number;
  x: AxisSpec;
  y: AxisSpec;
  rules?: { x?: number; y?: number; label?: string; color?: string }[];
  compute: (value: number) => { series: Series[]; readouts?: { label: string; value: string }[] };
}

/* ── the finite-difference U-curve ─────────────────────────────────────── */

const fdSweep = hSweep(1e-1, 1e-16, 6);
const forwardScheme = SCHEMES.find((s) => s.key === 'forward')!;

const fdOptimum: TuneScenario = {
  param: { key: 'logh', label: 'step size', symbol: 'log₁₀ h', min: -16, max: -1, step: 0.25, value: -2 },
  target: -7.8,          // log10(sqrt(eps)) ≈ -7.83
  tolerance: 0.075,      // ±0.6 in log10 — a decade-scale hunt, not a pixel hunt
  x: { label: 'log₁₀ h' },
  y: { label: 'log₁₀ |error|' },
  compute: (logh: number) => {
    const curve = diffSweep(forwardScheme, TARGETS.sin, fdSweep);
    const h = 10 ** logh;
    const err = diffSweep(forwardScheme, TARGETS.sin, [h])[0].error;

    return {
      series: [
        {
          key: 'curve', label: 'forward difference', color: 'cyan',
          points: curve.map((p) => [Math.log10(p.h), Math.log10(p.error)] as const),
        },
        {
          key: 'you', label: 'your h', color: 'magenta', style: 'dots', width: 5,
          points: [[logh, Math.log10(err)]],
        },
      ],
      readouts: [
        { label: 'h', value: h.toExponential(2) },
        { label: '|error|', value: err.toExponential(3) },
      ],
    };
  },
};

/* ── the forward-Euler stability cliff ─────────────────────────────────── */

const eulerStability: TuneScenario = {
  param: { key: 'h', label: 'step size', symbol: 'h', min: 0.005, max: 0.12, step: 0.001, value: 0.01 },
  target: 2 / 50,        // forward Euler on y' = -50y is stable iff h < 2/λ
  tolerance: 0.06,
  x: { label: 't' },
  y: { label: 'y' },
  rules: [{ y: 0, color: 'rgba(242,238,247,0.35)' }],
  compute: (h: number) => {
    const problem = decay(50);
    const run = integrate(forwardEuler, problem.f, problem.y0, 0, 2, h);
    const peak = Math.max(...run.y.map((s) => Math.abs(s[0])));

    return {
      series: [
        {
          key: 'euler', label: `forward Euler, h = ${h.toFixed(3)}`, color: peak > 1.001 ? 'magenta' : 'cyan',
          points: run.t.map((t, i) => [t, run.y[i][0]] as const),
        },
        {
          key: 'exact', label: 'exact', color: 'ink', dash: [3, 3], width: 1,
          points: Array.from({ length: 200 }, (_, i) => {
            const t = (2 * i) / 199;
            return [t, Math.exp(-50 * t)] as const;
          }),
        },
      ],
      readouts: [
        { label: 'hλ', value: (h * 50).toFixed(3) },
        { label: 'peak |y|', value: peak.toExponential(2) },
        { label: 'behaviour', value: peak > 1.001 ? 'growing' : 'decaying' },
      ],
    };
  },
};

export const TUNE_SCENARIOS: Record<string, TuneScenario> = {
  'fd-optimum': fdOptimum,
  'euler-stability': eulerStability,
};
