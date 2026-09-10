import { useMemo, useState } from 'react';
import Plot from './Plot.tsx';
import { Panel, Readout, ReadoutRow, Slider, Toggle } from './controls.tsx';
import { formatValue, type Series } from './chart-core.ts';
import {
  observedOrder,
  runVv,
  vvSweep,
  type VvKind,
} from '../../lib/numerics/vv.ts';

export interface VvLabProps {
  kind?: VvKind;
  /** Hide the intended overlay and the residual plot — the pretty-picture trap. */
  pretty?: boolean;
  lockKind?: boolean;
  n?: number;
  height?: number;
  caption?: string;
}

const KIND_OPTS: { key: VvKind; label: string; accent: 'cyan' | 'magenta' | 'iris' }[] = [
  { key: 'mms', label: 'MMS heat', accent: 'cyan' },
  { key: 'half-stencil', label: 'extra /2', accent: 'magenta' },
  { key: 'advection', label: 'upwind', accent: 'iris' },
];

function kindTitle(kind: VvKind, pretty: boolean): string {
  if (pretty) return 'a field';
  if (kind === 'mms') return 'manufactured heat';
  if (kind === 'half-stencil') return 'Laplacian with an extra /2';
  return 'upwind, claiming heat';
}

/**
 * Coupled views of one run: the field you would ship, and the MMS residual
 * (or solution error) against Δx. The field is almost always pretty. The
 * log-log slope is the proof — or the confession.
 */
export default function VvLab({
  kind: kind0 = 'mms',
  pretty = false,
  lockKind = false,
  n: n0 = 32,
  height = 240,
  caption,
}: VvLabProps) {
  const [kind, setKind] = useState<VvKind>(kind0);
  const [n, setN] = useState(n0);

  const run = useMemo(() => runVv({ kind, n }), [kind, n]);
  const sweep = useMemo(() => vvSweep(kind), [kind]);
  const residualOrder = useMemo(
    () => observedOrder(sweep.map((p) => ({ dx: p.dx, error: p.residual }))),
    [sweep],
  );
  const errorOrder = useMemo(
    () => observedOrder(sweep.map((p) => ({ dx: p.dx, error: p.error }))),
    [sweep],
  );
  const implementedOrder = useMemo(
    () => observedOrder(sweep.map((p) => ({ dx: p.dx, error: p.implementedError }))),
    [sweep],
  );

  const fieldSeries: Series[] = useMemo(() => {
    const u: Series = {
      key: 'u',
      label: pretty ? 'u' : kind === 'mms' ? 'solve' : kind === 'half-stencil' ? 'extra /2' : 'upwind',
      color: kind === 'mms' ? 'cyan' : kind === 'half-stencil' ? 'magenta' : 'iris',
      width: 2,
      points: run.x.map((x, i) => [x, run.u[i]!] as const),
    };
    if (pretty) return [u];
    const series: Series[] = [
      {
        key: 'intended',
        label: kind === 'advection' ? 'heat (intended)' : 'manufactured',
        color: 'ink',
        dash: [4, 3],
        width: 1.25,
        points: run.x.map((x, i) => [x, run.intended[i]!] as const),
      },
      u,
    ];
    if (kind === 'advection') {
      series.push({
        key: 'implemented',
        label: 'exact advection',
        color: 'aqua',
        dash: [2, 2],
        width: 1.1,
        points: run.x.map((x, i) => [x, run.implemented[i]!] as const),
      });
    }
    return series;
  }, [run, kind, pretty]);

  const orderSeries: Series[] = useMemo(() => {
    const hereY = kind === 'advection' ? run.error : run.residual;
    const out: Series[] = [
      {
        key: 'residual',
        label: kind === 'advection' ? 'error vs heat' : 'MMS residual',
        color: kind === 'mms' ? 'cyan' : 'magenta',
        style: 'line+dots',
        width: 2,
        points: sweep.map((p) => [
          p.dx,
          kind === 'advection' ? p.error : p.residual,
        ] as const),
      },
      {
        key: 'here',
        label: 'this n',
        color: 'orchid',
        style: 'dots',
        width: 8,
        points: [[run.dx, hereY]],
      },
    ];
    if (kind === 'advection') {
      out.splice(1, 0, {
        key: 'vs-adv',
        label: 'error vs advection',
        color: 'aqua',
        style: 'line+dots',
        width: 2,
        points: sweep.map((p) => [p.dx, p.implementedError] as const),
      });
    } else {
      out.splice(1, 0, {
        key: 'sol-err',
        label: 'solution error',
        color: 'iris',
        style: 'line+dots',
        width: 1.6,
        points: sweep.map((p) => [p.dx, p.error] as const),
      });
    }
    return out;
  }, [sweep, run, kind]);

  const yField: [number, number] = kind === 'advection' ? [-0.15, 1.2] : [-1.25, 1.25];
  const slope = kind === 'advection' ? errorOrder : residualOrder;
  const slopeOk = kind === 'mms' && Math.abs(slope - 2) < 0.35;

  return (
    <figure className="not-prose" style={{ margin: '2rem 0' }}>
      <Panel
        title={kindTitle(kind, pretty)}
        right={
          <span className="hud-label" style={{ color: pretty ? 'var(--color-ink-faint)' : slopeOk ? 'var(--sig-ok)' : 'var(--sig-warn)' }}>
            {pretty ? 'no test' : slopeOk ? `order ${formatValue(slope, 2)}` : `order ${formatValue(slope, 2)}`}
          </span>
        }
      >
        {!lockKind && (
          <div style={{ marginBottom: 10 }}>
            <Toggle
              options={KIND_OPTS}
              value={[kind]}
              onChange={(next) => setKind((next[0] as VvKind) ?? 'mms')}
            />
          </div>
        )}

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: pretty ? 'minmax(0,1fr)' : 'minmax(0,1fr) minmax(0,1fr)',
            gap: 10,
            alignItems: 'stretch',
          }}
        >
          <Plot
            series={fieldSeries}
            x={{ label: 'x', domain: [0, 1] }}
            y={{ label: 'u', domain: yField }}
            height={height}
            legend={!pretty}
          />
          {!pretty && (
            <Plot
              series={orderSeries}
              x={{ label: 'Δx', scale: 'log' }}
              y={{ label: kind === 'advection' ? 'L² error' : 'residual / error', scale: 'log' }}
              height={height}
              legend
            />
          )}
        </div>

        <div style={{ marginTop: 12 }}>
          <Slider
            spec={{ key: 'n', label: 'cells', symbol: 'n', min: 16, max: 96, step: 8, value: n }}
            value={n}
            onChange={setN}
          />
        </div>

        <ReadoutRow>
          <Readout label="n" value={String(n)} accent="cyan" />
          <Readout label="Δx" value={formatValue(run.dx, 3)} />
          <Readout
            label={pretty ? '‖u‖∞' : 'L² vs intended'}
            value={pretty ? formatValue(run.maxAbs, 3) : formatValue(run.error, 3)}
            accent={pretty ? 'ink' : run.error < 0.05 ? 'ok' : 'warn'}
          />
          {!pretty && (
            <Readout
              label={kind === 'advection' ? 'order vs heat' : 'residual order'}
              value={formatValue(slope, 2)}
              accent={slopeOk ? 'ok' : 'warn'}
            />
          )}
          {!pretty && kind === 'advection' && (
            <Readout
              label="order vs advection"
              value={formatValue(implementedOrder, 2)}
              accent="cyan"
            />
          )}
          {!pretty && kind !== 'advection' && (
            <Readout
              label="solution order"
              value={formatValue(errorOrder, 2)}
              accent={kind === 'mms' ? 'ok' : 'warn'}
            />
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
