import { useMemo, useState } from 'react';
import Plot from './Plot.tsx';
import { Panel, Readout, ReadoutRow, Slider, Toggle } from './controls.tsx';
import { ACCENTS, formatValue, type Series } from './chart-core.ts';
import { denseLaplacian, dot, maxAbs } from '../../lib/numerics/operator.ts';
import { norm2, sub } from '../../lib/numerics/types.ts';
import {
  aInner,
  cgHistory,
  dirichletPoisson,
  energyNormSq,
  jacobiResidualHistory,
  poissonExact,
  spdEllipse,
  steepestDescentHistory,
  type CgStep,
  type IterStep,
} from '../../lib/numerics/iterative.ts';

export interface KrylovLabProps {
  n?: number;
  view?: 'history' | 'plane';
  lockView?: boolean;
  metric?: 'residual' | 'energy';
  lockMetric?: boolean;
  k0?: number;
  maxK?: number;
  caption?: string;
  height?: number;
}

type View = 'history' | 'plane';
type Metric = 'residual' | 'energy';

const logR = (v: number) => Math.log10(Math.max(v, 1e-18));

function onb(r: number[], v: number[]): { e1: number[]; e2: number[]; degenerate: boolean } {
  const n1 = norm2(r);
  if (n1 < 1e-18) return { e1: r.map(() => 0), e2: r.map(() => 0), degenerate: true };
  const e1 = r.map((x) => x / n1);
  const proj = v.map((x, i) => x - dot(v, e1) * e1[i]!);
  const n2 = norm2(proj);
  if (n2 < 1e-14 * Math.max(1, norm2(v))) {
    return { e1, e2: e1.map(() => 0), degenerate: true };
  }
  return { e1, e2: proj.map((x) => x / n2), degenerate: false };
}

function coord(e1: number[], e2: number[], v: number[]): [number, number] {
  return [dot(v, e1), dot(v, e2)];
}

function arrowSeries(key: string, label: string, color: Series['color'], tip: [number, number]): Series[] {
  return [
    {
      key, label, color, style: 'line+dots', width: 2,
      points: [[0, 0], tip],
    },
  ];
}

/**
 * Coupled views of one Dirichlet Poisson solve: Jacobi vs CG residual
 * against iteration, the residual field, and the Krylov plane where the
 * next residual stands perpendicular to the last. One state. Slider is k.
 */
export default function KrylovLab({
  n: n0 = 16,
  view: view0 = 'history',
  lockView = false,
  metric: metric0 = 'residual',
  lockMetric = false,
  k0 = 0,
  maxK,
  caption,
  height = 240,
}: KrylovLabProps) {
  const n = Math.max(2, Math.min(32, Math.round(n0)));
  const steps = maxK ?? Math.max(n + 4, 12);

  const [view, setView] = useState<View>(view0);
  const [metric, setMetric] = useState<Metric>(metric0);
  const [showSd, setShowSd] = useState(view0 === 'plane' && n === 2);
  const [k, setK] = useState(() => Math.max(0, Math.min(steps, Math.round(k0))));

  const problem = useMemo(() => dirichletPoisson(n, 'mixed'), [n]);
  const { b, x, applyA } = problem;

  const cg = useMemo(() => cgHistory(b, steps), [b, steps]);
  const jac = useMemo(() => jacobiResidualHistory(b, steps), [b, steps]);
  const sd = useMemo(() => steepestDescentHistory(applyA, b, steps), [applyA, b, steps]);
  const xStar = useMemo(() => poissonExact(b), [b]);

  const energyOf = (step: IterStep) => Math.sqrt(Math.max(0, energyNormSq(applyA, sub(xStar, step.x))));

  const kk = Math.max(0, Math.min(steps, Math.round(k)));
  const cgK = cg[kk] ?? cg[cg.length - 1]!;
  const jacK = jac[kk] ?? jac[jac.length - 1]!;
  const sdK = sd[Math.min(kk, sd.length - 1)]!;
  const prev = kk > 0 ? cg[kk - 1] : null;

  const rDot = prev ? dot(cgK.r, prev.r) : 0;
  const pAp = prev ? aInner(applyA, cgK.p, prev.p) : 0;
  const rScale = (cgK.residualNorm * (prev?.residualNorm ?? 1)) + 1e-18;
  const pScale = (norm2(cgK.p) * norm2(applyA(prev?.p ?? cgK.p))) + 1e-18;

  const yOf = (step: IterStep) => (metric === 'residual' ? logR(step.residualNorm) : logR(energyOf(step)));

  const historySeries: Series[] = [
    {
      key: 'jacobi', label: 'Jacobi', color: 'cyan', style: 'line+dots', width: 2,
      points: jac.map((s) => [s.k, yOf(s)] as const),
    },
    {
      key: 'cg', label: 'CG', color: 'magenta', style: 'line+dots', width: 2,
      points: cg.map((s) => [s.k, yOf(s)] as const),
    },
    ...(showSd ? [{
      key: 'sd', label: 'steepest descent', color: 'iris' as const, style: 'line+dots' as const, width: 2,
      points: sd.map((s) => [s.k, yOf(s)] as const),
    }] : []),
    {
      key: 'now', label: 'k', color: 'ok', style: 'dots', width: 7,
      points: [[kk, yOf(cgK)]],
    },
  ];

  const rMax = Math.max(1e-12, maxAbs(cgK.r), maxAbs(jacK.r), showSd ? maxAbs(sdK.r) : 0);
  const fieldSeries: Series[] = [
    {
      key: 'rJ', label: 'Jacobi r', color: 'cyan', style: 'line+dots', width: 2,
      points: x.map((xi, i) => [xi, jacK.r[i]!] as const),
    },
    {
      key: 'rC', label: 'CG r', color: 'magenta', style: 'line+dots', width: 2,
      points: x.map((xi, i) => [xi, cgK.r[i]!] as const),
    },
  ];

  const planeSeries = n === 2 ? energyPlaneSeries(xStar, cg, jac, sd, kk, showSd) : krylovPlaneSeries(cgK, prev, applyA);

  const yLabel = metric === 'residual' ? 'log₁₀ ‖r‖₂' : 'log₁₀ ‖e‖_A';
  const yDomain: [number, number] = metric === 'residual' ? [-16.5, 1.2] : [-16.5, 0.5];

  return (
    <figure className="not-prose" style={{ margin: '2rem 0' }}>
      <Panel
        title={view === 'history' ? 'residual vs iteration' : n === 2 ? 'energy ellipses in two unknowns' : 'the Krylov plane'}
        right={
          <span className="hud-label" style={{ color: 'var(--color-magenta)' }}>
            n = {n}
          </span>
        }
      >
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 12 }}>
          {!lockView && (
            <Toggle
              options={[
                { key: 'history', label: 'history', accent: 'cyan' },
                { key: 'plane', label: 'plane', accent: 'magenta' },
              ]}
              value={[view]}
              onChange={(next) => setView((next[0] as View) ?? 'history')}
            />
          )}
          {!lockMetric && view === 'history' && (
            <Toggle
              options={[
                { key: 'residual', label: '‖r‖₂', accent: 'cyan' },
                { key: 'energy', label: '‖e‖_A', accent: 'orchid' },
              ]}
              value={[metric]}
              onChange={(next) => setMetric((next[0] as Metric) ?? 'residual')}
            />
          )}
          <Toggle
            options={[{ key: 'sd', label: 'steepest descent', accent: 'iris' }]}
            value={showSd ? ['sd'] : []}
            onChange={(next) => setShowSd(next.includes('sd'))}
            multiple
          />
        </div>

        {view === 'history' ? (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1.15fr)',
              gap: 14,
              alignItems: 'start',
            }}
          >
            <Plot
              series={fieldSeries}
              x={{ label: 'x', domain: [0, 1] }}
              y={{ label: 'residual r', domain: [-1.2 * rMax, 1.2 * rMax] }}
              height={height}
              legend
            />
            <Plot
              series={historySeries}
              x={{ label: 'iteration k', domain: [0, steps] }}
              y={{ label: yLabel, domain: yDomain }}
              height={height}
              legend
              rules={[{ x: kk, color: ACCENTS.ok, label: `k = ${kk}` }]}
            />
          </div>
        ) : (
          <Plot
            series={planeSeries}
            x={{ label: n === 2 ? 'x₀' : 'along r' }}
            y={{ label: n === 2 ? 'x₁' : 'A-orthogonal to r' }}
            height={Math.max(280, height + 40)}
            legend
            notes={n === 2 ? [{ x: xStar[0]!, y: xStar[1]!, text: 'x*', color: ACCENTS.ok }] : []}
          />
        )}

        <div style={{ marginTop: 12 }}>
          <Slider
            spec={{
              key: 'k',
              label: 'iteration',
              symbol: 'k',
              min: 0,
              max: steps,
              step: 1,
              value: 0,
              hint: 'CG is exact at k = n. Jacobi is still walking.',
            }}
            value={kk}
            onChange={(v) => setK(Math.round(v))}
          />
        </div>

        <ReadoutRow>
          <Readout label="k" value={String(kk)} accent="cyan" />
          <Readout label="‖r‖ CG" value={formatValue(cgK.residualNorm, 3)} accent="magenta" />
          <Readout label="‖r‖ Jacobi" value={formatValue(jacK.residualNorm, 3)} accent="cyan" />
          {showSd && <Readout label="‖r‖ SD" value={formatValue(sdK.residualNorm, 3)} accent="iris" />}
          <Readout
            label="rₖ · rₖ₋₁"
            value={kk === 0 ? '—' : formatValue(rDot / rScale, 3)}
            accent={kk === 0 ? 'ink' : Math.abs(rDot / rScale) < 1e-6 ? 'ok' : 'magenta'}
          />
          <Readout
            label="pₖᵀ A pₖ₋₁"
            value={kk === 0 ? '—' : formatValue(pAp / pScale, 3)}
            accent={kk === 0 ? 'ink' : Math.abs(pAp / pScale) < 1e-6 ? 'ok' : 'magenta'}
          />
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

function energyPlaneSeries(
  xStar: number[],
  cg: CgStep[],
  jac: IterStep[],
  sd: IterStep[],
  k: number,
  showSd: boolean,
): Series[] {
  const A = denseLaplacian(2, 'dirichlet');
  const e0 = energyNormSq((u) => [A[0]![0]! * u[0]! + A[0]![1]! * u[1]!, A[1]![0]! * u[0]! + A[1]![1]! * u[1]!], sub(xStar, [0, 0]));
  const levels = [1, 0.45, 0.18, 0.06].map((f) => f * e0).filter((lv) => lv > 1e-16);
  const series: Series[] = levels.map((lv, i) => ({
    key: `ell-${i}`,
    label: i === 0 ? 'energy' : undefined,
    color: 'iris',
    style: 'line',
    width: 1,
    muted: true,
    points: spdEllipse(A, xStar, lv, 80),
  }));
  series.push({
    key: 'jacobi', label: 'Jacobi', color: 'cyan', style: 'line+dots', width: 2,
    points: jac.slice(0, k + 1).map((s) => [s.x[0]!, s.x[1]!] as const),
  });
  if (showSd) {
    series.push({
      key: 'sd', label: 'steepest descent', color: 'iris', style: 'line+dots', width: 2,
      points: sd.slice(0, k + 1).map((s) => [s.x[0]!, s.x[1]!] as const),
    });
  }
  series.push({
    key: 'cg', label: 'CG', color: 'magenta', style: 'line+dots', width: 2.4,
    points: cg.slice(0, k + 1).map((s) => [s.x[0]!, s.x[1]!] as const),
  });
  series.push({
    key: 'star', label: 'x*', color: 'ok', style: 'dots', width: 8,
    points: [[xStar[0]!, xStar[1]!]],
  });
  return series;
}

function krylovPlaneSeries(
  step: CgStep,
  prev: CgStep | null,
  applyA: (u: number[]) => number[],
): Series[] {
  const r = step.r;
  const p = step.p;
  const Ap = applyA(p);
  const { e1, e2, degenerate } = onb(r, Ap);
  const r2 = coord(e1, e2, r);
  const Ap2 = coord(e1, e2, Ap);
  const rr = dot(r, r);
  const pAp = dot(p, Ap);
  const alpha = pAp > 0 && rr > 0 ? rr / pAp : 0;
  const rNext = r.map((ri, i) => ri - alpha * Ap[i]!);
  const rN2 = coord(e1, e2, rNext);

  const series: Series[] = [
    ...arrowSeries('r', 'r', 'cyan', r2),
    ...arrowSeries('Ap', 'Ap', 'iris', Ap2),
    ...arrowSeries('rnext', 'next r', 'magenta', rN2),
  ];

  if (!degenerate && prev) {
    const pPrev2 = coord(e1, e2, prev.p);
    series.push({
      key: 'pprev', label: 'pₖ₋₁', color: 'orchid', style: 'line+dots', width: 1.6,
      points: [[0, 0], pPrev2],
    });
  }

  series.push({
    key: 'origin', label: undefined, color: 'ok', style: 'dots', width: 6,
    points: [[0, 0]],
  });
  return series;
}
