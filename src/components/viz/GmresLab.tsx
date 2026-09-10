import { useMemo, useState } from 'react';
import Plot from './Plot.tsx';
import { Panel, Readout, ReadoutRow, Slider, Toggle } from './controls.tsx';
import { ACCENTS, formatValue, type Series } from './chart-core.ts';
import {
  DEMO_RESTART,
  DEMO_WIND,
  GMRES_N,
  cgAttempt,
  convectionProblem,
  gmresHistory,
  type GmresStep,
} from '../../lib/numerics/gmres.ts';

export type GmresLabView = 'history' | 'hessenberg';

export interface GmresLabProps {
  n?: number;
  wind?: number;
  lockWind?: boolean;
  view?: GmresLabView;
  lockView?: boolean;
  restart?: number;
  k0?: number;
  caption?: string;
  height?: number;
}

const logR = (v: number) => Math.log10(Math.max(v, 1e-18));

/**
 * Coupled views of one convection–diffusion solve: CG vs GMRES residual
 * against iteration, and the Arnoldi Hessenberg that is the whole cost.
 * Drag wind (c = 0 is the SPD Poisson CG already solved). One state.
 */
export default function GmresLab({
  n: n0 = GMRES_N,
  wind: wind0 = DEMO_WIND,
  lockWind = false,
  view: view0 = 'history',
  lockView = false,
  restart: restart0 = DEMO_RESTART,
  k0 = 0,
  caption,
  height = 240,
}: GmresLabProps) {
  const n = Math.max(2, Math.min(24, Math.round(n0)));
  const steps = n;

  const [view, setView] = useState<GmresLabView>(view0);
  const [wind, setWind] = useState(wind0);
  const [m, setM] = useState(() => Math.max(1, Math.min(n, Math.round(restart0))));
  const [showRestart, setShowRestart] = useState(true);
  const [k, setK] = useState(() => Math.max(0, Math.min(steps, Math.round(k0))));

  const problem = useMemo(() => convectionProblem(n, wind), [n, wind]);
  const { applyA, b, peclet } = problem;

  const gm = useMemo(() => gmresHistory(applyA, b, steps), [applyA, b, steps]);
  const cg = useMemo(() => cgAttempt(applyA, b, steps), [applyA, b, steps]);
  const rst = useMemo(
    () => gmresHistory(applyA, b, steps, m),
    [applyA, b, steps, m],
  );

  const kk = Math.max(0, Math.min(steps, Math.round(k)));
  const gmK = gm[kk] ?? gm[gm.length - 1]!;
  const cgK = cg[Math.min(kk, cg.length - 1)]!;
  const rstK = rst[kk] ?? rst[rst.length - 1]!;
  const shown: GmresStep = showRestart ? rstK : gmK;

  const historySeries: Series[] = [
    {
      key: 'cg', label: 'CG', color: 'magenta', style: 'line+dots', width: 2,
      points: cg.map((s) => [s.k, logR(s.residualNorm)] as const),
    },
    {
      key: 'gmres', label: 'GMRES', color: 'cyan', style: 'line+dots', width: 2,
      points: gm.map((s) => [s.k, logR(s.residualNorm)] as const),
    },
    ...(showRestart ? [{
      key: 'restart', label: `GMRES(${m})`, color: 'orchid' as const, style: 'line+dots' as const, width: 2,
      points: rst.map((s) => [s.k, logR(s.residualNorm)] as const),
    }] : []),
    {
      key: 'now', label: 'k', color: 'ok', style: 'dots', width: 7,
      points: [[kk, logR(gmK.residualNorm)]],
    },
  ];

  const cgGrowing = kk >= 1 && cgK.residualNorm > 2 * (cg[0]?.residualNorm ?? 1);

  return (
    <figure className="not-prose" style={{ margin: '2rem 0' }}>
      <Panel
        title={view === 'history' ? 'residual vs iteration' : 'Arnoldi Hessenberg'}
        right={
          <span className="hud-label" style={{ color: 'var(--color-cyan)' }}>
            n = {n} · Pe = {formatValue(peclet, 2)}
          </span>
        }
      >
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 12 }}>
          {!lockView && (
            <Toggle
              options={[
                { key: 'history', label: 'history', accent: 'cyan' },
                { key: 'hessenberg', label: 'Hessenberg', accent: 'magenta' },
              ]}
              value={[view]}
              onChange={(next) => setView((next[0] as GmresLabView) ?? 'history')}
            />
          )}
          <Toggle
            options={[{ key: 'rst', label: `GMRES(${m})`, accent: 'orchid' }]}
            value={showRestart ? ['rst'] : []}
            onChange={(next) => setShowRestart(next.includes('rst'))}
            multiple
          />
        </div>

        {view === 'history' ? (
          <Plot
            series={historySeries}
            x={{ label: 'iteration k', domain: [0, steps] }}
            y={{ label: 'log₁₀ ‖r‖₂', domain: [-16.5, 2.8] }}
            height={height}
            legend
            rules={[{ x: kk, color: ACCENTS.ok, label: `k = ${kk}` }]}
          />
        ) : (
          <HessenbergGrid step={shown} n={n} />
        )}

        <div style={{ marginTop: 12, display: 'grid', gap: 10 }}>
          <Slider
            spec={{
              key: 'k',
              label: 'iteration',
              symbol: 'k',
              min: 0,
              max: steps,
              step: 1,
              value: 0,
              hint: 'Full GMRES is exact at k = n. That costs n vectors.',
            }}
            value={kk}
            onChange={(v) => setK(Math.round(v))}
          />
          {!lockWind && (
            <Slider
              spec={{
                key: 'wind',
                label: 'wind',
                symbol: 'c',
                min: 0,
                max: 80,
                step: 2,
                value: DEMO_WIND,
                hint: 'c = 0 is the SPD Laplacian. Wind makes A nonsymmetric.',
              }}
              value={wind}
              onChange={setWind}
            />
          )}
          {showRestart && (
            <Slider
              spec={{
                key: 'm',
                label: 'restart length',
                symbol: 'm',
                min: 1,
                max: n,
                step: 1,
                value: DEMO_RESTART,
                hint: 'GMRES(m) discards the basis every m steps.',
              }}
              value={m}
              onChange={(v) => setM(Math.max(1, Math.round(v)))}
            />
          )}
        </div>

        <ReadoutRow>
          <Readout label="k" value={String(kk)} accent="cyan" />
          <Readout label="‖r‖ GMRES" value={formatValue(gmK.residualNorm, 3)} accent="cyan" />
          <Readout
            label="‖r‖ CG"
            value={formatValue(cgK.residualNorm, 3)}
            accent={cgGrowing ? 'warn' : 'magenta'}
          />
          {showRestart && (
            <Readout label={`‖r‖ (${m})`} value={formatValue(rstK.residualNorm, 3)} accent="orchid" />
          )}
          <Readout
            label="stored"
            value={showRestart ? `${shown.stored} / ${m}` : `${gmK.stored}`}
            accent="iris"
          />
          <Readout
            label="CG"
            value={cgGrowing ? 'climbing' : wind === 0 ? 'SPD' : 'running'}
            accent={cgGrowing ? 'warn' : 'ink'}
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

function HessenbergGrid({ step, n }: { step: GmresStep; n: number }) {
  const k = step.H[0]?.length ?? 0;
  if (k === 0) {
    return (
      <div className="hud-label" style={{ color: 'var(--color-ink-faint)', padding: '24px 0' }}>
        k = 0 — no Arnoldi basis yet. The Hessenberg grows by one column per step.
      </div>
    );
  }
  const rows = step.H.length;
  let max = 0;
  for (const row of step.H) for (const v of row) max = Math.max(max, Math.abs(v));
  const scale = max > 0 ? max : 1;

  return (
    <div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${k}, minmax(0, 1fr))`,
          gap: 2,
          maxWidth: Math.min(560, 18 * k + 8),
        }}
        aria-label={`Arnoldi Hessenberg ${rows} by ${k}`}
      >
        {step.H.flatMap((row, i) =>
          row.map((v, j) => {
            const below = i > j + 1;
            const sub = i === j + 1;
            const t = Math.abs(v) / scale;
            const accent = below ? 'transparent' : sub ? 'var(--color-magenta)' : 'var(--color-cyan)';
            return (
              <div
                key={`${i}-${j}`}
                title={`H_${i + 1}${j + 1} = ${v.toExponential(2)}`}
                style={{
                  aspectRatio: '1',
                  minHeight: 10,
                  background: below ? 'var(--color-raised)' : accent,
                  opacity: below ? 0.35 : 0.18 + 0.82 * t,
                  outline: i === rows - 1 && j === k - 1 ? '1px solid var(--color-ok)' : undefined,
                }}
              />
            );
          }),
        )}
      </div>
      <div className="hud-label" style={{ marginTop: 8, color: 'var(--color-ink-faint)', textTransform: 'none', letterSpacing: '0.04em' }}>
        {rows}×{k} upper Hessenberg. Magenta is the subdiagonal leftover. {step.stored} vectors of length {n} in RAM
        {step.restarted ? ' — just restarted.' : '.'}
      </div>
    </div>
  );
}
