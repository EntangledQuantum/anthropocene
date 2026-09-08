import { useMemo, useState } from 'react';
import Plot from './Plot.tsx';
import { Button, Panel, Readout, ReadoutRow, Toggle } from './controls.tsx';
import { SERIES_COLORS, formatValue, type Series } from './chart-core.ts';
import { integratorByKey } from '../../lib/numerics/ode.ts';
import { convergenceStudy, stepSweep } from '../../lib/numerics/convergence.ts';
import { PROBLEMS } from '../../lib/numerics/problems.ts';

export interface ConvergenceLabProps {
  problem?: string;
  methods?: string[];
  initial?: string[];
  hMax?: number;
  count?: number;
  /** Plot error against f-evaluations instead of h — the honest comparison,
   *  because a 4th-order step costs four times a 1st-order one. */
  allowWorkAxis?: boolean;
  height?: number;
  caption?: string;
}

/**
 * Error against step size on log-log axes: the picture that turns "RK4 is
 * fourth order" from a claim into something you can read off a slope.
 *
 * Points excluded from the order fit are still drawn, dimmed — the
 * pre-asymptotic bend at coarse h and the roundoff floor at fine h are two of
 * the most important things a learner can see, so hiding them would be a
 * pedagogical loss as well as a dishonest chart.
 */
export default function ConvergenceLab({
  problem: problemKey = 'decay',
  methods = ['forward-euler', 'heun', 'rk4'],
  initial,
  hMax = 0.4,
  count = 10,
  allowWorkAxis = true,
  height = 340,
  caption,
}: ConvergenceLabProps) {
  const problem = useMemo(() => {
    const make = PROBLEMS[problemKey];
    if (!make) throw new Error(`Unknown problem "${problemKey}"`);
    return make();
  }, [problemKey]);

  const [selected, setSelected] = useState<string[]>(initial ?? methods);
  const [xAxis, setXAxis] = useState<'h' | 'work'>('h');

  const available = methods.map((k) => integratorByKey(k));
  const colorFor = (key: string) => SERIES_COLORS[available.findIndex((m) => m.key === key) % SERIES_COLORS.length];

  const sweep = useMemo(() => stepSweep(hMax, count), [hMax, count]);

  const studies = useMemo(
    () =>
      available
        .filter((m) => selected.includes(m.key))
        .map((method) => ({ method, result: convergenceStudy(method, problem, sweep) })),
    [available, selected, problem, sweep],
  );

  const series: Series[] = [];
  for (const { method, result } of studies) {
    const color = colorFor(method.key);
    const xOf = (i: number) => (xAxis === 'h' ? result.points[i].h : result.points[i].work);
    const usable = result.points
      .map((p, i) => ({ p, i }))
      .filter(({ p }) => Number.isFinite(p.error) && p.error > 0);

    // Excluded points, dimmed: the pre-asymptotic bend and the roundoff floor.
    series.push({
      key: `${method.key}-all`,
      label: `${method.label} (excluded)`,
      color, style: 'dots', muted: true, width: 3,
      points: usable.filter(({ i }) => !result.fitted.includes(i)).map(({ p, i }) => [xOf(i), p.error] as const),
    });

    // The fitted, asymptotic window.
    series.push({
      key: method.key,
      label: `${method.label} — fitted slope ${formatValue(result.observedOrder, 3)}`,
      color, style: 'line+dots', width: 2,
      points: usable.filter(({ i }) => result.fitted.includes(i)).map(({ p, i }) => [xOf(i), p.error] as const),
    });
  }

  return (
    <figure className="not-prose" style={{ margin: '2rem 0' }}>
      <Panel
        title={`convergence — ${problem.label}`}
        right={
          allowWorkAxis && (
            <div style={{ display: 'flex', gap: 6 }}>
              <Button active={xAxis === 'h'} onClick={() => setXAxis('h')} accent="magenta">vs h</Button>
              <Button active={xAxis === 'work'} onClick={() => setXAxis('work')} accent="magenta">vs work</Button>
            </div>
          )
        }
      >
        <Plot
          series={series}
          x={{ label: xAxis === 'h' ? 'step size h' : 'f-evaluations', scale: 'log' }}
          y={{ label: 'endpoint error', scale: 'log' }}
          rules={[{ y: 1e-12, label: 'roundoff floor', color: 'rgba(255,181,69,0.55)' }]}
          height={height}
          legend
        />

        <div style={{ marginTop: 12 }}>
          <span className="hud-label" style={{ display: 'block', marginBottom: 6 }}>integrators</span>
          <Toggle
            multiple
            options={available.map((m) => ({ key: m.key, label: m.label, accent: colorFor(m.key) }))}
            value={selected}
            onChange={(next) => setSelected(next.length ? next : selected)}
          />
        </div>

        <ReadoutRow>
          {studies.map(({ method, result }) => {
            const ok = Math.abs(result.observedOrder - result.claimedOrder) < 0.2;
            return (
              <Readout
                key={method.key}
                label={`${method.label} · theory ${result.claimedOrder}`}
                accent={ok ? colorFor(method.key) : 'amber'}
                value={`measured ${formatValue(result.observedOrder, 3)}`}
              />
            );
          })}
        </ReadoutRow>
      </Panel>

      {caption && (
        <figcaption className="hud-label" style={{ marginTop: 8, lineHeight: 1.6, letterSpacing: '0.06em', textTransform: 'none' }}>
          {caption}
        </figcaption>
      )}
    </figure>
  );
}
