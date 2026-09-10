import { useMemo, useState } from 'react';
import Plot from './Plot.tsx';
import { Panel, Readout, ReadoutRow, Slider, Toggle } from './controls.tsx';
import { ACCENTS, formatValue, type Series } from './chart-core.ts';
import { dirichletEigenvalues } from '../../lib/numerics/operator.ts';
import {
  cgHistory,
  dirichletKappa,
  dirichletPoisson,
  kappaFromEvals,
  pcgHistory,
  preconditionedEigenvalues,
  ssorOmega,
  type PreconditionerKind,
} from '../../lib/numerics/iterative.ts';

export interface PreconditionerLabProps {
  n?: number;
  preconditioner?: PreconditionerKind;
  lockPreconditioner?: boolean;
  omega?: number;
  lockOmega?: boolean;
  k0?: number;
  caption?: string;
  height?: number;
}

const logR = (v: number) => Math.log10(Math.max(v, 1e-18));

/**
 * Coupled views of one Dirichlet Poisson: the spectrum of A vs M⁻¹A, and
 * CG vs PCG residual against iteration. One state. Toggle the fake inverse;
 * the bunching and the drop are the same fact.
 */
export default function PreconditionerLab({
  n: n0 = 16,
  preconditioner: kind0 = 'ssor',
  lockPreconditioner = false,
  omega: omega0,
  lockOmega = false,
  k0 = 0,
  caption,
  height = 220,
}: PreconditionerLabProps) {
  const n = Math.max(4, Math.min(32, Math.round(n0)));
  const steps = n;
  const omegaDefault = omega0 ?? ssorOmega(n);

  const [kind, setKind] = useState<PreconditionerKind>(kind0);
  const [omega, setOmega] = useState(omegaDefault);
  const [k, setK] = useState(() => Math.max(0, Math.min(steps, Math.round(k0))));

  const problem = useMemo(() => dirichletPoisson(n, 'mixed'), [n]);
  const { b } = problem;

  const w = kind === 'ssor' ? omega : 1;
  const cg = useMemo(() => cgHistory(b, steps), [b, steps]);
  const pcg = useMemo(() => pcgHistory(b, steps, kind, w), [b, steps, kind, w]);
  const evA = useMemo(() => dirichletEigenvalues(n), [n]);
  const evM = useMemo(() => preconditionedEigenvalues(n, kind, w), [n, kind, w]);
  const kA = useMemo(() => dirichletKappa(n), [n]);
  const kM = kappaFromEvals(evM);

  const maxA = evA[evA.length - 1]!;
  const maxM = evM[evM.length - 1]!;
  const kk = Math.max(0, Math.min(steps, Math.round(k)));
  const cgK = cg[kk] ?? cg[cg.length - 1]!;
  const pcgK = pcg[kk] ?? pcg[pcg.length - 1]!;

  const spectrumSeries: Series[] = [
    {
      key: 'A', label: 'λ(A) / λmax', color: 'cyan', style: 'line+dots', width: 2,
      points: evA.map((l, i) => [i + 1, l / maxA] as const),
    },
    {
      key: 'MinvA', label: 'λ(M⁻¹A) / λmax', color: 'magenta', style: 'line+dots', width: 2.2,
      points: evM.map((l, i) => [i + 1, l / maxM] as const),
    },
  ];

  const historySeries: Series[] = [
    {
      key: 'cg', label: 'CG', color: 'cyan', style: 'line+dots', width: 2,
      points: cg.map((s) => [s.k, logR(s.residualNorm)] as const),
    },
    {
      key: 'pcg', label: kind === 'jacobi' ? 'Jacobi-PCG' : 'SSOR-PCG', color: 'magenta', style: 'line+dots', width: 2.2,
      points: pcg.map((s) => [s.k, logR(s.residualNorm)] as const),
    },
    {
      key: 'now', label: 'k', color: 'ok', style: 'dots', width: 7,
      points: [[kk, logR(pcgK.residualNorm)]],
    },
  ];

  return (
    <figure className="not-prose" style={{ margin: '2rem 0' }}>
      <Panel
        title="spectrum of A vs M⁻¹A · residual vs iteration"
        right={
          <span className="hud-label" style={{ color: 'var(--color-magenta)' }}>
            n = {n}
          </span>
        }
      >
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 12 }}>
          {!lockPreconditioner && (
            <Toggle
              options={[
                { key: 'jacobi', label: 'Jacobi D', accent: 'cyan' },
                { key: 'ssor', label: 'SSOR', accent: 'magenta' },
              ]}
              value={[kind]}
              onChange={(next) => setKind((next[0] as PreconditionerKind) ?? 'ssor')}
            />
          )}
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1.15fr)',
            gap: 14,
            alignItems: 'start',
          }}
        >
          <Plot
            series={spectrumSeries}
            x={{ label: 'mode index k', domain: [1, n] }}
            y={{ label: 'λ / λmax', domain: [0, 1.08] }}
            height={height}
            legend
            rules={[
              { y: 1 / kA, color: ACCENTS.cyan, label: '1/κ(A)' },
              { y: 1 / kM, color: ACCENTS.magenta, label: '1/κ(M⁻¹A)' },
            ]}
          />
          <Plot
            series={historySeries}
            x={{ label: 'iteration k', domain: [0, steps] }}
            y={{ label: 'log₁₀ ‖r‖₂', domain: [-16.5, 1.2] }}
            height={height}
            legend
            rules={[{ x: kk, color: ACCENTS.ok, label: `k = ${kk}` }]}
          />
        </div>

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
              hint: 'CG finishes at k = n. A bunched spectrum finishes earlier.',
            }}
            value={kk}
            onChange={(v) => setK(Math.round(v))}
          />
        </div>

        {kind === 'ssor' && !lockOmega && (
          <div style={{ marginTop: 8 }}>
            <Slider
              spec={{
                key: 'omega',
                label: 'SSOR weight',
                symbol: 'ω',
                min: 0.2,
                max: 1.95,
                step: 0.05,
                value: omegaDefault,
                hint: 'ω = 1 is symmetric Gauss–Seidel. The 1D-Poisson optimum sits near 1.7.',
              }}
              value={omega}
              onChange={setOmega}
            />
          </div>
        )}

        <ReadoutRow>
          <Readout label="κ(A)" value={formatValue(kA, 3)} accent="cyan" />
          <Readout label="κ(M⁻¹A)" value={formatValue(kM, 3)} accent="magenta" />
          <Readout label="‖r‖ CG" value={formatValue(cgK.residualNorm, 3)} accent="cyan" />
          <Readout
            label={kind === 'jacobi' ? '‖r‖ Jacobi-PCG' : '‖r‖ SSOR-PCG'}
            value={formatValue(pcgK.residualNorm, 3)}
            accent="magenta"
          />
          {kind === 'ssor' && <Readout label="ω" value={omega.toFixed(2)} accent="iris" />}
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
