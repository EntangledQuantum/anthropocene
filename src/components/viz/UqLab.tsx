import { useMemo, useState } from 'react';
import Plot from './Plot.tsx';
import { Panel, Readout, ReadoutRow, Slider, Toggle } from './controls.tsx';
import { formatValue, type Series } from './chart-core.ts';
import { mulberry32 } from '../../lib/numerics/monte-carlo.ts';
import {
  UQ_A0,
  UQ_LAMBDA,
  UQ_LAMBDA_MAX,
  UQ_LAMBDA_MEAN,
  UQ_LAMBDA_MIN,
  UQ_N,
  UQ_SEED,
  UQ_T_DEFAULT,
  defaultLambdaSample,
  envelopes,
  exactExpMean,
  exactPointEstimate,
  histogram,
  histPolyline,
  jensenRatio,
  jointSquare,
  mean,
  oatCross,
  pairPush,
  pushRemaining,
  remaining,
} from '../../lib/numerics/uq.ts';

export type UqKind = 'curve' | 'push' | 'oat';

export interface UqLabProps {
  kind?: UqKind;
  T?: number;
  lockKind?: boolean;
  lockT?: boolean;
  height?: number;
  caption?: string;
}

const KIND_OPTS: { key: UqKind; label: string; accent: 'cyan' | 'magenta' | 'iris' }[] = [
  { key: 'curve', label: 'one run', accent: 'iris' },
  { key: 'push', label: 'push λ', accent: 'cyan' },
  { key: 'oat', label: 'OAT vs joint', accent: 'magenta' },
];

function kindTitle(kind: UqKind): string {
  if (kind === 'curve') return 'the number you would print';
  if (kind === 'push') return 'the cloud, pushed';
  return 'a cross, then the square';
}

function histSeries(
  xs: number[],
  lo: number,
  hi: number,
  bins: number,
  key: string,
  label: string,
  color: Series['color'],
): Series {
  const { edges, density } = histogram(xs, lo, hi, bins);
  const poly = histPolyline(edges, density);
  return {
    key,
    label,
    color,
    style: 'area',
    width: 1.6,
    points: poly.map((p) => [p.x, p.y] as const),
  };
}

/**
 * Coupled views of one cheap model: q = A₀ exp(−λ T).
 *
 * curve — the single run at mean λ, the plot a paper would ship.
 * push  — input histogram of λ, output smear of q. Two vertical rules:
 *         q(μ) and E[q]. They coincide at T = 0 and peel apart.
 * oat   — the (A₀, λ) plane as a cross or a filled square, and the
 *         output smear of each. The corners live outside the cross.
 */
export default function UqLab({
  kind: kind0 = 'push',
  T: T0 = UQ_T_DEFAULT,
  lockKind = false,
  lockT = false,
  height = 220,
  caption,
}: UqLabProps) {
  const [kind, setKind] = useState<UqKind>(kind0);
  const [T, setT] = useState(T0);
  const [design, setDesign] = useState<'oat' | 'joint' | 'both'>('both');

  const lambdas = useMemo(() => defaultLambdaSample(UQ_N, UQ_SEED), []);
  const oat = useMemo(() => oatCross(48), []);
  const joint = useMemo(() => jointSquare(500, mulberry32(UQ_SEED + 1)), []);

  const q = useMemo(() => pushRemaining(lambdas, T), [lambdas, T]);
  const qPoint = exactPointEstimate(UQ_LAMBDA_MEAN, T);
  const qMean = exactExpMean(UQ_LAMBDA_MIN, UQ_LAMBDA_MAX, T);
  const qSampleMean = mean(q);
  const ratio = jensenRatio(T);
  const env = useMemo(() => envelopes(T), [T]);
  const oatQ = useMemo(() => pairPush(oat, T), [oat, T]);
  const jointQ = useMemo(() => pairPush(joint, T), [joint, T]);

  const tGrid = useMemo(() => {
    const n = 80;
    const pts: { t: number; point: number; expected: number }[] = [];
    for (let i = 0; i <= n; i++) {
      const t = (5 * i) / n;
      pts.push({
        t,
        point: remaining(1, UQ_LAMBDA_MEAN, t),
        expected: exactExpMean(UQ_LAMBDA_MIN, UQ_LAMBDA_MAX, t),
      });
    }
    return pts;
  }, []);

  const curveSeries: Series[] = useMemo(() => [
    {
      key: 'point',
      label: 'run at λ = 1',
      color: 'iris',
      width: 2,
      points: tGrid.map((p) => [p.t, p.point] as const),
    },
    {
      key: 'here',
      label: `T = ${formatValue(T, 2)}`,
      color: 'magenta',
      style: 'dots',
      width: 7,
      points: [[T, remaining(1, UQ_LAMBDA_MEAN, T)]],
    },
  ], [tGrid, T]);

  const lambdaSeries: Series[] = useMemo(() => [
    histSeries(lambdas, 0.35, 1.65, 18, 'lam', 'λ samples', 'iris'),
  ], [lambdas]);

  const qSeries: Series[] = useMemo(() => [
    histSeries(q, 0, 1.05, 24, 'q', 'q = e^{−λ T}', 'cyan'),
  ], [q]);

  const oatScatter: Series[] = useMemo(() => {
    const square: Series = {
      key: 'square',
      label: 'joint support',
      color: 'ink',
      dash: [3, 3],
      width: 1.1,
      points: [
        [UQ_A0.min, UQ_LAMBDA.min],
        [UQ_A0.max, UQ_LAMBDA.min],
        [UQ_A0.max, UQ_LAMBDA.max],
        [UQ_A0.min, UQ_LAMBDA.max],
        [UQ_A0.min, UQ_LAMBDA.min],
      ],
    };
    const oatDots: Series = {
      key: 'oat',
      label: 'OAT cross',
      color: 'magenta',
      style: 'dots',
      width: 2.6,
      points: oat.map((s) => [s.A0, s.lambda] as const),
    };
    const jointDots: Series = {
      key: 'joint',
      label: 'joint sample',
      color: 'cyan',
      style: 'dots',
      width: 1.6,
      points: joint.map((s) => [s.A0, s.lambda] as const),
    };
    if (design === 'oat') return [square, oatDots];
    if (design === 'joint') return [square, jointDots];
    return [square, jointDots, oatDots];
  }, [oat, joint, design]);

  const oatOutSeries: Series[] = useMemo(() => {
    const series: Series[] = [];
    if (design !== 'oat') {
      series.push(histSeries(jointQ, 0, 1.05, 22, 'joint-q', 'joint q', 'cyan'));
    }
    if (design !== 'joint') {
      series.push(histSeries(oatQ, 0, 1.05, 22, 'oat-q', 'OAT q', 'magenta'));
    }
    return series;
  }, [oatQ, jointQ, design]);

  const qMax = Math.max(0.12, ...qSeries[0]!.points.map((p) => p[1]));
  const oatOutMax = Math.max(0.12, ...oatOutSeries.flatMap((s) => s.points.map((p) => p[1])));

  const peeled = ratio > 1.08;

  return (
    <figure className="not-prose" style={{ margin: '2rem 0' }}>
      <Panel
        title={kindTitle(kind)}
        right={
          <span className="hud-label" style={{ color: kind === 'curve' ? 'var(--color-ink-faint)' : peeled ? 'var(--sig-warn)' : 'var(--sig-ok)' }}>
            {kind === 'curve'
              ? `q(1) = ${formatValue(qPoint, 3)}`
              : kind === 'push'
                ? `E[q] / q(μ) = ${formatValue(ratio, 2)}`
                : `joint floor / OAT = ${formatValue(env.jointMin / env.oatMin, 2)}`}
          </span>
        }
      >
        {!lockKind && (
          <div style={{ marginBottom: 10 }}>
            <Toggle
              options={KIND_OPTS}
              value={[kind]}
              onChange={(next) => setKind((next[0] as UqKind) ?? 'push')}
            />
          </div>
        )}

        {kind === 'curve' && (
          <Plot
            series={curveSeries}
            x={{ label: 'T', domain: [0, 5] }}
            y={{ label: 'q', domain: [-0.02, 1.15] }}
            height={height}
            legend
            rules={[{ x: T, label: 'T', color: 'magenta' }]}
          />
        )}

        {kind === 'push' && (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)',
              gap: 10,
              alignItems: 'stretch',
            }}
          >
            <Plot
              series={lambdaSeries}
              x={{ label: 'λ', domain: [0.35, 1.65] }}
              y={{ label: 'density', domain: [0, 2.4] }}
              height={height}
              legend={false}
              rules={[{ x: UQ_LAMBDA_MEAN, label: 'μ', color: 'iris' }]}
            />
            <Plot
              series={qSeries}
              x={{ label: 'q', domain: [0, 1.05] }}
              y={{ label: 'density', domain: [0, Math.max(2.2, qMax * 1.15)] }}
              height={height}
              legend={false}
              rules={[
                { x: qPoint, label: 'q(μ)', color: 'magenta' },
                { x: qMean, label: 'E[q]', color: 'cyan' },
              ]}
            />
          </div>
        )}

        {kind === 'oat' && (
          <>
            <div style={{ marginBottom: 10 }}>
              <Toggle
                options={[
                  { key: 'oat', label: 'OAT cross', accent: 'magenta' },
                  { key: 'joint', label: 'joint square', accent: 'cyan' },
                  { key: 'both', label: 'both', accent: 'iris' },
                ]}
                value={[design]}
                onChange={(next) => setDesign((next[0] as 'oat' | 'joint' | 'both') ?? 'both')}
              />
            </div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)',
                gap: 10,
                alignItems: 'stretch',
              }}
            >
              <Plot
                series={oatScatter}
                x={{ label: 'A₀', domain: [0.35, 1.65] }}
                y={{ label: 'λ', domain: [0.35, 1.65] }}
                height={height}
                legend
              />
              <Plot
                series={oatOutSeries}
                x={{ label: 'q', domain: [0, 1.05] }}
                y={{ label: 'density', domain: [0, Math.max(2.2, oatOutMax * 1.15)] }}
                height={height}
                legend
                rules={[
                  { x: env.oatMin, label: 'OAT floor', color: 'magenta' },
                  { x: env.jointMin, label: 'joint floor', color: 'cyan' },
                ]}
              />
            </div>
          </>
        )}

        {!lockT && (
          <div style={{ marginTop: 12 }}>
            <Slider
              spec={{ key: 'T', label: 'time', symbol: 'T', min: 0.05, max: 5, step: 0.05, value: T }}
              value={T}
              onChange={setT}
            />
          </div>
        )}

        <ReadoutRow>
          <Readout label="T" value={formatValue(T, 2)} accent="cyan" />
          {kind !== 'oat' && (
            <>
              <Readout label="q(μ)" value={formatValue(qPoint, 3)} accent="magenta" />
              <Readout
                label="E[q]"
                value={kind === 'curve' ? '—' : formatValue(qSampleMean, 3)}
                accent={kind === 'curve' ? 'ink' : 'cyan'}
              />
              <Readout
                label="E[q] / q(μ)"
                value={kind === 'curve' ? '1' : formatValue(ratio, 2)}
                accent={kind === 'curve' ? 'ink' : peeled ? 'warn' : 'ok'}
              />
            </>
          )}
          {kind === 'oat' && (
            <>
              <Readout label="OAT floor" value={formatValue(env.oatMin, 3)} accent="magenta" />
              <Readout label="joint floor" value={formatValue(env.jointMin, 3)} accent="cyan" />
              <Readout
                label="joint / OAT"
                value={formatValue(env.jointMin / env.oatMin, 2)}
                accent="warn"
              />
            </>
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
