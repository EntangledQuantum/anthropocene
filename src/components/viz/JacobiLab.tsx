import { useMemo, useState } from 'react';
import Plot from './Plot.tsx';
import { Button, Panel, Readout, ReadoutRow, Slider, Toggle } from './controls.tsx';
import { formatValue, type Series } from './chart-core.ts';
import { laplacian1d, maxAbs } from '../../lib/numerics/operator.ts';
import { norm2 } from '../../lib/numerics/types.ts';
import {
  DEMO_N,
  JACOBI_SMOOTH_OMEGA,
  MIXED_HIGH_K,
  MIXED_LOW_K,
  demoMixed,
  dirichletMode,
  hashedField,
  modeCoeff,
  modeSpectrum,
  residual,
  stationarySweep,
  zeros,
  type StationaryMethod,
} from '../../lib/numerics/iterative.ts';

export type JacobiInitial = 'mixed' | 'low' | 'high' | 'random';

export interface JacobiLabProps {
  n?: number;
  omega?: number;
  method?: StationaryMethod;
  initial?: JacobiInitial;
  lockMethod?: boolean;
  lockOmega?: boolean;
  lockInitial?: boolean;
  caption?: string;
  height?: number;
}

const initialField = (kind: JacobiInitial, n: number): number[] => {
  if (kind === 'low') return dirichletMode(n, MIXED_LOW_K);
  if (kind === 'high') return dirichletMode(n, MIXED_HIGH_K);
  if (kind === 'random') return hashedField(n, 3);
  return demoMixed(n);
};

/**
 * Coupled views of one stationary iteration on 1D Poisson: the error field,
 * its sine-mode spectrum, and ‖e‖ / ‖r‖ against sweep. One state. Stepping
 * is a click, not a rAF loop — the stall is a number that stops changing.
 */
export default function JacobiLab({
  n = DEMO_N,
  omega: omega0 = JACOBI_SMOOTH_OMEGA,
  method: method0 = 'jacobi',
  initial: initial0 = 'mixed',
  lockMethod = false,
  lockOmega = false,
  lockInitial = false,
  caption,
  height = 170,
}: JacobiLabProps) {
  const nClamped = Math.max(7, Math.min(63, Math.round(n)));
  const [method, setMethod] = useState<StationaryMethod>(method0);
  const [omega, setOmega] = useState(omega0);
  const [kind, setKind] = useState<JacobiInitial>(initial0);
  const [field, setField] = useState(() => initialField(initial0, nClamped));
  const [sweeps, setSweeps] = useState(0);
  const [history, setHistory] = useState<{ sweep: number; err: number; res: number }[]>(() => {
    const u0 = initialField(initial0, nClamped);
    return [{ sweep: 0, err: norm2(u0), res: norm2(residual(u0, zeros(nClamped))) }];
  });

  const op = useMemo(() => laplacian1d(nClamped, 'dirichlet'), [nClamped]);
  const f = useMemo(() => zeros(nClamped), [nClamped]);

  const resetTo = (nextKind: JacobiInitial, nextMethod: StationaryMethod, nextOmega: number) => {
    const u0 = initialField(nextKind, nClamped);
    setKind(nextKind);
    setMethod(nextMethod);
    setOmega(nextOmega);
    setField(u0);
    setSweeps(0);
    setHistory([{ sweep: 0, err: norm2(u0), res: norm2(residual(u0, f)) }]);
  };

  const step = (count: number) => {
    let u = field;
    const hist = history.slice();
    for (let i = 0; i < count; i++) {
      u = stationarySweep(u, f, method, omega);
      hist.push({ sweep: sweeps + i + 1, err: norm2(u), res: norm2(residual(u, f)) });
    }
    setField(u);
    setSweeps(sweeps + count);
    setHistory(hist);
  };

  const r = residual(field, f);
  const spec = modeSpectrum(field);
  const specMax = Math.max(1e-12, ...spec);
  const e0 = history[0]?.err ?? 1;
  const r0 = history[0]?.res ?? 1;
  const eMax = Math.max(1e-9, maxAbs(initialField(kind, nClamped)));
  const cLow = Math.abs(modeCoeff(field, MIXED_LOW_K));
  const cHigh = Math.abs(modeCoeff(field, MIXED_HIGH_K));
  const split = Math.ceil(nClamped / 2);

  const fieldSeries: Series[] = [
    {
      key: 'e',
      label: 'error e(x)',
      color: 'cyan',
      style: 'line+dots',
      width: 2,
      points: op.x.map((xi, i) => [xi, field[i]!] as const),
    },
  ];
  const resSeries: Series[] = [
    {
      key: 'r',
      label: 'residual r(x)',
      color: 'magenta',
      style: 'line+dots',
      width: 2,
      points: op.x.map((xi, i) => [xi, r[i]!] as const),
    },
  ];
  const histSeries: Series[] = [
    {
      key: 'err',
      label: '‖e‖ / ‖e₀‖',
      color: 'cyan',
      points: history.map((h) => [h.sweep, h.err / e0] as const),
    },
    {
      key: 'res',
      label: '‖r‖ / ‖r₀‖',
      color: 'magenta',
      points: history.map((h) => [h.sweep, h.res / r0] as const),
    },
  ];

  const methodLabel = method === 'gauss-seidel' ? 'Gauss–Seidel' : `Jacobi, ω = ${formatValue(omega, 2)}`;

  return (
    <figure className="not-prose" style={{ margin: '2rem 0' }}>
      <Panel
        title="error field, and its spectrum"
        right={
          <span className="hud-label" style={{ color: 'var(--color-cyan)' }}>
            {methodLabel} · {sweeps} sweep{sweeps === 1 ? '' : 's'}
          </span>
        }
      >
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 12 }}>
          {!lockMethod && (
            <Toggle
              options={[
                { key: 'jacobi', label: 'Jacobi', accent: 'cyan' },
                { key: 'gauss-seidel', label: 'Gauss–Seidel', accent: 'magenta' },
              ]}
              value={[method]}
              onChange={(next) => resetTo(kind, (next[0] as StationaryMethod) ?? 'jacobi', omega)}
            />
          )}
          {!lockInitial && (
            <Toggle
              options={[
                { key: 'mixed', label: 'long + ripple', accent: 'cyan' },
                { key: 'low', label: 'k = 1', accent: 'iris' },
                { key: 'high', label: `k = ${MIXED_HIGH_K}`, accent: 'magenta' },
                { key: 'random', label: 'hashed', accent: 'orchid' },
              ]}
              value={[kind]}
              onChange={(next) => resetTo((next[0] as JacobiInitial) ?? 'mixed', method, omega)}
            />
          )}
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1.15fr) minmax(0, 0.95fr)',
            gap: 12,
            alignItems: 'start',
          }}
        >
          <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <Plot
              series={fieldSeries}
              x={{ label: 'x', domain: [0, 1] }}
              y={{ label: 'error', domain: [-1.2 * eMax, 1.2 * eMax] }}
              height={height}
              legend
            />
            <Plot
              series={resSeries}
              x={{ label: 'x', domain: [0, 1] }}
              y={{ label: 'residual' }}
              height={Math.max(120, height - 40)}
              legend
            />
          </div>

          <div style={{ minWidth: 0 }}>
            <span className="hud-label" style={{ display: 'block', marginBottom: 6 }}>
              |c_k| — cyan low-k, magenta high-k
            </span>
            <div
              style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 88 }}
              aria-label="sine-mode spectrum of the error"
            >
              {spec.map((mag, i) => {
                const k = i + 1;
                const high = k >= split;
                const h = Math.max(3, (mag / specMax) * 100);
                return (
                  <div
                    key={k}
                    title={`k = ${k}, |c| = ${formatValue(mag, 3)}`}
                    style={{
                      flex: 1,
                      height: `${h}%`,
                      borderRadius: 1,
                      background: high ? 'var(--color-magenta)' : 'var(--color-cyan)',
                      opacity: mag / specMax < 0.04 ? 0.35 : 1,
                      boxShadow: mag / specMax > 0.2
                        ? `0 0 8px color-mix(in oklab, ${high ? 'var(--color-magenta)' : 'var(--color-cyan)'} 40%, transparent)`
                        : 'none',
                    }}
                  />
                );
              })}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
              <span className="hud-label">k = 1</span>
              <span className="hud-label">k = {split}</span>
              <span className="hud-label">k = {nClamped}</span>
            </div>

            <div style={{ marginTop: 10 }}>
              <Plot
                series={histSeries}
                x={{ label: 'sweeps', domain: [0, Math.max(8, history[history.length - 1]?.sweep ?? 8)] }}
                y={{ label: 'relative', domain: [0, 1.15] }}
                height={Math.max(120, height - 40)}
                legend
              />
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12, alignItems: 'center' }}>
          <Button onClick={() => step(1)} accent="cyan">+1 sweep</Button>
          <Button onClick={() => step(5)} accent="magenta">+5</Button>
          <Button onClick={() => step(20)} accent="iris">+20</Button>
          <Button onClick={() => resetTo(kind, method, omega)} accent="warn">reset</Button>
        </div>

        {!lockOmega && method === 'jacobi' && (
          <div style={{ marginTop: 12 }}>
            <Slider
              spec={{
                key: 'omega',
                label: 'Jacobi weight',
                symbol: 'ω',
                min: 0.2,
                max: 1,
                step: 0.01,
                value: JACOBI_SMOOTH_OMEGA,
                hint: 'ω = 2/3 is the smoother. ω = 1 leaves the Nyquist mode.',
              }}
              value={omega}
              onChange={(v) => resetTo(kind, method, v)}
            />
          </div>
        )}

        <ReadoutRow>
          <Readout label="sweeps" value={String(sweeps)} accent="cyan" />
          <Readout label="‖e‖ / ‖e₀‖" value={formatValue(norm2(field) / e0, 3)} accent="cyan" />
          <Readout label="‖r‖ / ‖r₀‖" value={formatValue(norm2(r) / r0, 3)} accent="magenta" />
          <Readout label={`|c_${MIXED_LOW_K}|`} value={formatValue(cLow, 3)} accent="iris" />
          <Readout label={`|c_${MIXED_HIGH_K}|`} value={formatValue(cHigh, 3)} accent="magenta" />
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
