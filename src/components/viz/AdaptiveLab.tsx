import { useMemo, useState } from 'react';
import Plot from './Plot.tsx';
import { Panel, Readout, ReadoutRow, Slider } from './controls.tsx';
import { formatValue, type Series } from './chart-core.ts';
import { integrateAdaptive } from '../../lib/numerics/ode.ts';
import { PROBLEMS } from '../../lib/numerics/problems.ts';

export interface AdaptiveLabProps {
  /** Problem key from `PROBLEMS`. Default is the sech pulse. */
  problem?: string;
  height?: number;
  caption?: string;
  /** Independent atol / rtol sliders. Default is one shared tolerance. */
  splitTol?: boolean;
}

/**
 * Coupled views of one adaptive run: the solution, and the step-size
 * trace that produced it. Drag the tolerance and h becomes a curve —
 * tight at the transient, loose on the flats. Rejected attempts stay on
 * the chart as magenta dots; they are the failure mode, not a glitch.
 */
export default function AdaptiveLab({
  problem: problemKey = 'sech-pulse',
  height = 200,
  caption,
  splitTol = false,
}: AdaptiveLabProps) {
  const problem = useMemo(() => {
    const make = PROBLEMS[problemKey];
    if (!make) throw new Error(`Unknown problem "${problemKey}"`);
    return make();
  }, [problemKey]);

  const [logTol, setLogTol] = useState(-5);
  const [logAtol, setLogAtol] = useState(-6);
  const [logRtol, setLogRtol] = useState(-5);

  const atol = splitTol ? 10 ** logAtol : 10 ** logTol;
  const rtol = splitTol ? 10 ** logRtol : 10 ** logTol;

  const run = useMemo(
    () =>
      integrateAdaptive(problem.f, problem.y0, problem.t0, problem.span, {
        atol,
        rtol,
        h0: 0.2,
      }),
    [problem, atol, rtol],
  );

  const tEnd = problem.t0 + problem.span;
  // Drop the leftover clip that lands on t_end — that h is small for
  // bookkeeping, not because the vector field is bending.
  const dropLeftover = run.t.at(-1)! >= tEnd - 1e-12 && run.h.length > 2;
  const interiorH = run.h.slice(1, dropLeftover ? -1 : undefined);
  const hMin = interiorH.length > 0 ? Math.min(...interiorH) : NaN;
  const nFixed = Number.isFinite(hMin) ? Math.max(1, Math.round(problem.span / hMin)) : 0;

  const truth = problem.exact?.(run.t.at(-1)!);
  const endErr = truth
    ? Math.max(...truth.map((v, i) => Math.abs(run.y.at(-1)![i] - v)))
    : NaN;

  const solutionSeries: Series[] = useMemo(() => {
    const out: Series[] = [];
    if (problem.exact) {
      const n = 400;
      out.push({
        key: 'exact',
        label: 'exact',
        color: 'ink',
        dash: [3, 3],
        width: 1.25,
        points: Array.from({ length: n + 1 }, (_, i) => {
          const t = problem.t0 + (problem.span * i) / n;
          return [t, problem.exact!(t)[0]] as const;
        }),
      });
    }
    out.push({
      key: 'adapt',
      label: 'adaptive DP5(4)',
      color: 'cyan',
      style: 'line+dots',
      width: 1.6,
      points: run.t.map((t, i) => [t, run.y[i][0]] as const),
    });
    return out;
  }, [problem, run]);

  const stepSeries: Series[] = useMemo(() => {
    const last = run.h.length - 1;
    const accepted: Series['points'] = [];
    for (let i = 1; i < run.h.length; i++) {
      // The leftover clip that lands on t_end is bookkeeping, not a feature.
      if (i === last && run.t[i] >= tEnd - 1e-12) continue;
      accepted.push([run.t[i] - run.h[i], run.h[i]]);
    }
    const out: Series[] = [
      {
        key: 'h',
        label: 'accepted h',
        color: 'cyan',
        style: 'line+dots',
        width: 1.6,
        points: accepted,
      },
    ];
    if (run.rejected.length > 0) {
      out.push({
        key: 'rej',
        label: 'rejected',
        color: 'magenta',
        style: 'dots',
        width: 5,
        points: run.rejected.map((r) => [r.t, r.h] as const),
      });
    }
    return out;
  }, [run, tEnd]);

  const xAxis = { label: 't', domain: [problem.t0, tEnd] as [number, number] };

  return (
    <figure className="not-prose" style={{ margin: '2rem 0' }}>
      <Panel
        title={problem.label}
        right={
          <span className="hud-label" style={{ color: 'var(--color-ink-faint)' }}>
            Dormand–Prince 5(4)
          </span>
        }
      >
        <Plot
          series={solutionSeries}
          x={xAxis}
          y={{ label: problem.labels[0] }}
          height={height}
          legend
        />

        <div style={{ marginTop: 10 }}>
          <Plot
            series={stepSeries}
            x={xAxis}
            y={{ label: 'h', scale: 'log' }}
            height={height}
            legend
            rules={
              Number.isFinite(hMin)
                ? [{ y: hMin, label: 'min h', color: 'rgba(242,238,247,0.35)' }]
                : []
            }
          />
        </div>

        <div style={{ marginTop: 14, display: 'grid', gap: 12 }}>
          {splitTol ? (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <Slider
                spec={{
                  key: 'atol', label: 'absolute tolerance', symbol: 'atol',
                  min: 1e-9, max: 1e-2, step: 1, value: atol, log: true,
                }}
                value={atol}
                onChange={(v) => setLogAtol(Math.log10(v))}
              />
              <Slider
                spec={{
                  key: 'rtol', label: 'relative tolerance', symbol: 'rtol',
                  min: 1e-9, max: 1e-2, step: 1, value: rtol, log: true,
                }}
                value={rtol}
                onChange={(v) => setLogRtol(Math.log10(v))}
              />
            </div>
          ) : (
            <Slider
              spec={{
                key: 'tol', label: 'tolerance (atol = rtol)', symbol: 'tol',
                min: 1e-8, max: 1e-2, step: 1, value: 10 ** logTol, log: true,
                hint: 'Local error is held near this number. Tightening it shrinks h, mostly at the pulse.',
              }}
              value={10 ** logTol}
              onChange={(v) => setLogTol(Math.log10(v))}
            />
          )}
        </div>

        <ReadoutRow>
          <Readout label="accepted" value={String(run.nAccepted)} accent="cyan" />
          <Readout label="rejected" value={String(run.nRejected)} accent={run.nRejected > 0 ? 'magenta' : 'ink'} />
          <Readout label="f-evals" value={run.nEvals.toLocaleString()} />
          <Readout label="min h" value={formatValue(hMin, 3)} />
          <Readout
            label="fixed at min h"
            value={`${nFixed.toLocaleString()} steps`}
            accent="iris"
          />
          {Number.isFinite(endErr) && (
            <Readout label="endpoint |error|" value={formatValue(endErr, 3)} />
          )}
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
