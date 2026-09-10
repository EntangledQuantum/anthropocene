import { useMemo, useState } from 'react';
import Plot from './Plot.tsx';
import { Panel, Readout, ReadoutRow, Slider, Toggle } from './controls.tsx';
import { formatValue, type Series } from './chart-core.ts';
import {
  ERROR_FLOOR, SPECTRAL_TARGETS, TWO_PI, centralDiffError, gibbsOvershoot,
  modalCoefficients, modalSweep, observedOrder, reconstruct,
} from '../../lib/numerics/spectral.ts';

export interface SpectralLabProps {
  /** Which target the lab opens on. */
  initial?: 'smooth' | 'jump';
  /** Hide the target toggle — used when a Predict reveal should lock the case. */
  lockTarget?: boolean;
  caption?: string;
  height?: number;
}

const KS = Array.from({ length: 31 }, (_, i) => i + 2); // 2..32
const BAR_MAX = 24;
const PLOT_N = 240;
const PLOT_X = Array.from({ length: PLOT_N }, (_, i) => (TWO_PI * i) / (PLOT_N - 1));

const SMOOTH = SPECTRAL_TARGETS.expSin;
const JUMP = SPECTRAL_TARGETS.sawtooth;

const smoothCoeffs = modalCoefficients(SMOOTH, BAR_MAX);
const jumpCoeffs = modalCoefficients(JUMP, BAR_MAX);
const smoothErr = modalSweep(SMOOTH, KS);
const jumpAway = modalSweep(JUMP, KS, { excludeRadius: 0.5 });
const jumpWall = modalSweep(JUMP, KS);
const fdErr = KS
  .filter((k) => k >= 4)
  .map((K) => ({ n: K, error: centralDiffError(SMOOTH, 2 * K) }));

const xTick = (v: number) => {
  if (Math.abs(v) < 1e-9) return '0';
  if (Math.abs(v - Math.PI) < 0.2) return 'π';
  if (Math.abs(v - TWO_PI) < 0.2) return '2π';
  return formatValue(v, 2);
};

/**
 * Coupled views of one Fourier truncation: the partial sum S_K, its
 * spectrum, and max error against K. Switching the target from a smooth
 * periodic function to a single jump is the whole lesson.
 */
export default function SpectralLab({
  initial = 'smooth',
  lockTarget = false,
  caption,
  height = 220,
}: SpectralLabProps) {
  const [targetKey, setTargetKey] = useState<'smooth' | 'jump'>(initial);
  const [K, setK] = useState(6);

  const jump = targetKey === 'jump';
  const target = jump ? JUMP : SMOOTH;
  const coeffs = jump ? jumpCoeffs : smoothCoeffs;

  const reconstruction = useMemo(() => reconstruct(target, K, PLOT_X), [target, K]);

  const truthPoints = useMemo(() => {
    const pts: (readonly [number, number])[] = [];
    for (let i = 0; i < PLOT_N; i++) {
      const x = PLOT_X[i];
      if (jump && (x < 0.04 || x > TWO_PI - 0.04)) {
        // Break the stroke at the discontinuity so the true sawtooth is not
        // drawn as a diagonal across the jump.
        pts.push([x, Number.NaN]);
        continue;
      }
      pts.push([x, target.f(x)]);
    }
    return pts;
  }, [jump, target]);

  const functionSeries: Series[] = [
    {
      key: 'truth', label: 'true f', color: 'ink', dash: [4, 3], width: 1.25,
      points: truthPoints,
    },
    {
      key: 'sk', label: `S_K  (K = ${K})`, color: 'cyan', width: 2,
      points: PLOT_X.map((x, i) => [x, reconstruction[i]] as const),
    },
  ];

  const errCurve = jump ? jumpAway : smoothErr;
  const here = errCurve.find((p) => p.n === K) ?? errCurve[0];
  const prev = errCurve.find((p) => p.n === K - 1);
  const local = prev && here.error > ERROR_FLOOR * 10 && prev.error > ERROR_FLOOR * 10
    ? observedOrder(prev, here)
    : null;

  const errorSeries: Series[] = [
    {
      key: 'err',
      label: jump ? 'error away from jump' : '|S_K − f|',
      color: 'cyan',
      points: errCurve.map((p) => [p.n, p.error] as const),
    },
    {
      key: 'you', label: 'this K', color: 'magenta', style: 'dots', width: 6,
      points: [[here.n, here.error]],
    },
  ];
  if (jump) {
    errorSeries.push({
      key: 'wall', label: 'max-norm (Gibbs wall)', color: 'orchid', dash: [4, 3], width: 1.25, muted: true,
      points: jumpWall.map((p) => [p.n, p.error] as const),
    });
  } else {
    errorSeries.push({
      key: 'fd', label: 'central diff, N = 2K', color: 'magenta', dash: [4, 3], width: 1.25, muted: true,
      points: fdErr.map((p) => [p.n, p.error] as const),
    });
  }

  const overshoot = useMemo(() => (jump ? gibbsOvershoot(JUMP, K) : 0), [jump, K]);
  const absErr = here.error;
  const atFloor = here.error < 1e-13;

  return (
    <figure className="not-prose" style={{ margin: '2rem 0' }}>
      <Panel
        title="build from Fourier modes"
        right={
          lockTarget ? (
            <span className="hud-label">{jump ? 'one jump' : 'smooth periodic'}</span>
          ) : (
            <Toggle
              options={[
                { key: 'smooth', label: 'smooth periodic', accent: 'cyan' },
                { key: 'jump', label: 'one jump', accent: 'magenta' },
              ]}
              value={[targetKey]}
              onChange={([k]) => setTargetKey((k as 'smooth' | 'jump') ?? targetKey)}
            />
          )
        }
      >
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.15fr) minmax(0,0.95fr)', gap: 12 }}>
          <Plot
            series={functionSeries}
            x={{ label: 'x', domain: [0, TWO_PI], format: xTick }}
            y={{
              label: 'f(x)',
              domain: jump ? [-2.2, 2.2] : [0.2, 3],
            }}
            height={height}
            legend
          />
          <Plot
            series={errorSeries}
            x={{ label: 'highest mode K', domain: [2, 32] }}
            y={{ label: '|error|', scale: 'log', domain: [1e-16, 2] }}
            height={height}
            legend
            rules={[{ x: K, label: `K = ${K}`, color: 'rgba(255,196,107,0.45)' }]}
          />
        </div>

        <div style={{ marginTop: 14 }}>
          <span className="hud-label" style={{ display: 'block', marginBottom: 6 }}>
            spectrum |ĉ_k| — click a bar to keep modes up to that k
          </span>
          <div
            style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 72 }}
            role="listbox"
            aria-label="Fourier mode cutoff"
          >
            {coeffs.map((c) => {
              const on = c.k <= K;
              const logm = Math.log10(Math.max(c.mag, 1e-8));
              const h = Math.max(6, ((logm + 8) / 8) * 100);
              return (
                <button
                  key={c.k}
                  type="button"
                  role="option"
                  aria-selected={on}
                  aria-label={`keep modes up to k = ${c.k}`}
                  onClick={() => setK(Math.max(2, c.k))}
                  title={`k = ${c.k}`}
                  style={{
                    flex: 1,
                    height: `${h}%`,
                    padding: 0,
                    border: 'none',
                    borderRadius: 2,
                    cursor: 'pointer',
                    background: on ? 'var(--color-cyan)' : 'var(--color-ink-ghost)',
                    opacity: on ? 1 : 0.45,
                    boxShadow: on ? '0 0 10px color-mix(in oklab, var(--color-cyan) 45%, transparent)' : 'none',
                  }}
                />
              );
            })}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
            <span className="hud-label">k = 0</span>
            <span className="hud-label">k = {BAR_MAX}</span>
          </div>
        </div>

        <div style={{ marginTop: 12 }}>
          <Slider
            spec={{ key: 'K', label: 'highest mode', symbol: 'K', min: 2, max: 32, step: 1, value: 6 }}
            value={K}
            onChange={setK}
          />
        </div>

        <ReadoutRow>
          <Readout label="K" value={String(K)} accent="cyan" />
          <Readout label={jump ? 'error away from jump' : 'max |error|'} value={formatValue(absErr, 3)} />
          <Readout
            label="local order"
            value={atFloor ? 'floor' : local === null ? '—' : local > 6 ? 'spectral' : formatValue(local, 2)}
            accent={!atFloor && local !== null && local > 6 ? 'ok' : 'ink'}
          />
          {jump && (
            <Readout
              label="Gibbs overshoot"
              value={`${(overshoot * 100).toFixed(1)}% of jump`}
              accent="magenta"
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
