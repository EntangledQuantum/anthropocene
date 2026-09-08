import { useMemo, useState } from 'react';
import Plot from './Plot.tsx';
import { Button, Panel, Readout, ReadoutRow, Slider, Toggle, useParams, type ParamSpec } from './controls.tsx';
import { SERIES_COLORS, formatValue, type Series } from './chart-core.ts';
import { INTEGRATORS, integratorByKey, integrate } from '../../lib/numerics/ode.ts';
import { PROBLEMS } from '../../lib/numerics/problems.ts';

type View = 'trajectory' | 'error' | 'energy' | 'phase';

export interface SolverLabProps {
  /** Problem key from `PROBLEMS`. */
  problem?: string;
  /** Integrator keys offered. Defaults to the explicit RK family. */
  methods?: string[];
  /** Integrators selected on load. */
  initial?: string[];
  /** Which views the learner may switch between. */
  views?: View[];
  view?: View;
  h?: number;
  hRange?: [number, number];
  span?: number;
  /** Show the exact solution as a reference curve where one exists. */
  exact?: boolean;
  height?: number;
  caption?: string;
}

/**
 * The workhorse of the computational-physics path: run several integrators on
 * one problem at one step size and look at the same run four ways —
 * the trajectory, the error against truth, the conserved quantity, and the
 * phase portrait.
 *
 * Every curve here is produced by the same `src/lib/numerics` code that the
 * lessons display and that the graders check against, so the picture and the
 * printed algorithm can never disagree.
 */
export default function SolverLab({
  problem: problemKey = 'oscillator',
  methods = ['forward-euler', 'heun', 'rk4'],
  initial,
  views = ['trajectory', 'error'],
  view: initialView,
  h = 0.1,
  hRange = [0.001, 1],
  span,
  exact = true,
  height = 320,
  caption,
}: SolverLabProps) {
  const problem = useMemo(() => {
    const make = PROBLEMS[problemKey];
    if (!make) throw new Error(`Unknown problem "${problemKey}"`);
    const p = make();
    return span ? { ...p, span } : p;
  }, [problemKey, span]);

  const specs: ParamSpec[] = useMemo(
    () => [{ key: 'h', label: 'step size', symbol: 'h', min: hRange[0], max: hRange[1], step: 0.001, value: h, log: true,
             hint: 'Smaller h means more accuracy and more work — until roundoff takes over.' }],
    [h, hRange],
  );
  const { values, set, reset } = useParams(specs);

  const [selected, setSelected] = useState<string[]>(initial ?? methods.slice(0, 3));
  const [view, setView] = useState<View>(initialView ?? views[0]);

  const available = methods.map((k) => integratorByKey(k));
  const active = available.filter((m) => selected.includes(m.key));

  const runs = useMemo(
    () =>
      active.map((m) => ({
        method: m,
        run: integrate(m, problem.f, problem.y0, problem.t0, problem.span, values.h),
      })),
    [active, problem, values.h],
  );

  const colorFor = (key: string) => SERIES_COLORS[available.findIndex((m) => m.key === key) % SERIES_COLORS.length];

  /* ── series per view ───────────────────────────────────────────────────── */
  const { series, axes, rules } = useMemo(() => {
    const out: Series[] = [];

    if (view === 'trajectory') {
      if (exact && problem.exact) {
        const n = 600;
        out.push({
          key: 'exact', label: 'exact', color: 'ink', dash: [3, 3], width: 1.25,
          points: Array.from({ length: n + 1 }, (_, i) => {
            const t = problem.t0 + (problem.span * i) / n;
            return [t, problem.exact!(t)[0]] as const;
          }),
        });
      }
      for (const { method, run } of runs) {
        out.push({
          key: method.key, label: method.label, color: colorFor(method.key),
          points: run.t.map((t, i) => [t, run.y[i][0]] as const),
        });
      }
      return {
        series: out,
        axes: { x: { label: 't' }, y: { label: problem.labels[0] } },
        rules: [],
      };
    }

    if (view === 'error') {
      for (const { method, run } of runs) {
        out.push({
          key: method.key, label: method.label, color: colorFor(method.key),
          points: run.t.map((t, i) => {
            const truth = problem.exact?.(t)[0] ?? NaN;
            return [t, Math.max(Math.abs(run.y[i][0] - truth), 1e-18)] as const;
          }),
        });
      }
      return {
        series: out,
        axes: { x: { label: 't' }, y: { label: '|error|', scale: 'log' as const } },
        rules: [],
      };
    }

    if (view === 'energy') {
      const e0 = problem.invariant?.(problem.y0) ?? 1;
      const scale = Math.max(Math.abs(e0), 1e-12);
      for (const { method, run } of runs) {
        out.push({
          key: method.key, label: method.label, color: colorFor(method.key),
          points: run.t.map((t, i) => [t, (problem.invariant!(run.y[i]) - e0) / scale] as const),
        });
      }
      return {
        series: out,
        axes: { x: { label: 't' }, y: { label: 'ΔE / E₀' } },
        rules: [{ y: 0, label: 'exact', color: 'rgba(242,238,247,0.4)' }],
      };
    }

    // phase
    for (const { method, run } of runs) {
      out.push({
        key: method.key, label: method.label, color: colorFor(method.key),
        points: run.y.map((s) => [s[0], s[1]] as const),
      });
    }
    return {
      series: out,
      axes: { x: { label: problem.labels[0] }, y: { label: problem.labels[1] ?? 'v' } },
      rules: [],
    };
  }, [view, runs, problem, exact]);

  /* ── summary readouts ──────────────────────────────────────────────────── */
  const summary = runs.map(({ method, run }) => {
    const end = run.y.at(-1)!;
    const truth = problem.exact?.(run.t.at(-1)!);
    const err = truth ? Math.max(...truth.map((v, i) => Math.abs(end[i] - v))) : NaN;

    let drift = NaN;
    if (problem.invariant) {
      const e0 = problem.invariant(problem.y0);
      drift = Math.abs((problem.invariant(end) - e0) / Math.max(Math.abs(e0), 1e-12));
    }
    return {
      method,
      err,
      drift,
      diverged: run.diverged,
      work: (run.t.length - 1) * method.cost,
    };
  });

  return (
    <figure className="not-prose" style={{ margin: '2rem 0' }}>
      <Panel
        title={problem.label}
        right={
          <div style={{ display: 'flex', gap: 6 }}>
            {views.length > 1 &&
              views.map((v) => (
                <Button key={v} active={view === v} onClick={() => setView(v)} accent="magenta">
                  {v}
                </Button>
              ))}
          </div>
        }
      >
        <Plot
          series={series}
          x={axes.x}
          y={axes.y}
          rules={rules}
          height={height}
          legend
        />

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(180px,1fr) 2fr', gap: 16, alignItems: 'start', marginTop: 12 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {specs.map((s) => (
              <Slider key={s.key} spec={s} value={values[s.key]} onChange={(v) => set(s.key, v)} />
            ))}
            <div>
              <span className="hud-label" style={{ display: 'block', marginBottom: 5 }}>steps</span>
              <span className="readout" style={{ fontSize: 12, color: 'var(--color-ink-soft)' }}>
                {Math.round(problem.span / values.h).toLocaleString()}
              </span>
            </div>
            <Button onClick={reset}>reset</Button>
          </div>

          <div>
            <span className="hud-label" style={{ display: 'block', marginBottom: 6 }}>integrators</span>
            <Toggle
              multiple
              options={available.map((m) => ({ key: m.key, label: m.label, accent: colorFor(m.key) }))}
              value={selected}
              onChange={(next) => setSelected(next.length ? next : selected)}
            />
          </div>
        </div>

        <ReadoutRow>
          {summary.map((s) => (
            <Readout
              key={s.method.key}
              label={s.method.label}
              accent={s.diverged ? 'magenta' : colorFor(s.method.key)}
              value={
                s.diverged ? 'diverged'
                  : view === 'energy' ? `ΔE ${formatValue(s.drift, 3)}`
                  : Number.isFinite(s.err) ? `err ${formatValue(s.err, 3)}`
                  : `${s.work.toLocaleString()} evals`
              }
            />
          ))}
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

export const ALL_METHOD_KEYS = INTEGRATORS.map((m) => m.key);
