import { useMemo, useState } from 'react';
import Plot from './Plot.tsx';
import { Button, Panel, Readout, ReadoutRow, Toggle } from './controls.tsx';
import { formatValue, type Series } from './chart-core.ts';
import { laplacian1d, maxAbs } from '../../lib/numerics/operator.ts';
import { add, norm2 } from '../../lib/numerics/types.ts';
import {
  DEMO_N,
  JACOBI_SMOOTH_OMEGA,
  MIXED_HIGH_K,
  MIXED_LOW_K,
  applySweeps,
  demoMixed,
  dirichletMode,
  hashedField,
  jacobiSweep,
  mixedError,
  modeCoeff,
  modeSpectrum,
  residual,
  zeros,
} from '../../lib/numerics/iterative.ts';
import {
  coarseGrid,
  coarseSolve,
  prolong,
  restrict,
  twoGridCycle,
} from '../../lib/numerics/multigrid.ts';

export type TwoGridInitial = 'mixed' | 'low' | 'high' | 'random';
export type TwoGridStage = 'smooth' | 'restrict' | 'solve' | 'correct';

export interface TwoGridLabProps {
  n?: number;
  pre?: number;
  post?: number;
  initial?: TwoGridInitial;
  /** Jacobi sweeps applied before the first click, so the leftover sine is waiting. */
  preloadSweeps?: number;
  lockInitial?: boolean;
  lockPre?: boolean;
  caption?: string;
  height?: number;
}

const highKOf = (n: number) => (n === DEMO_N ? MIXED_HIGH_K : Math.max(1, Math.floor(n / 2)));

const initialField = (kind: TwoGridInitial, n: number): number[] => {
  if (kind === 'low') return dirichletMode(n, MIXED_LOW_K);
  if (kind === 'high') return dirichletMode(n, highKOf(n));
  if (kind === 'random') return hashedField(n, 3);
  if (n === DEMO_N) return demoMixed(n);
  return mixedError(n, [
    { k: MIXED_LOW_K, amp: 1 },
    { k: highKOf(n), amp: 0.45 },
  ]);
};

const startField = (kind: TwoGridInitial, n: number, preload: number): number[] =>
  applySweeps(initialField(kind, n), zeros(n), preload, 'jacobi', JACOBI_SMOOTH_OMEGA);

const STAGE_LABEL: Record<TwoGridStage, string> = {
  smooth: 'smooth',
  restrict: 'restricted',
  solve: 'coarse solved',
  correct: 'corrected',
};

/**
 * Coupled views of one two-grid cycle on 1D Poisson: the fine error, the
 * restricted residual on the coarse grid, and the sine-mode spectrum.
 * Stepping is a click. After restrict → solve, the prolonged correction
 * overlays the leftover wave; correct subtracts it.
 */
export default function TwoGridLab({
  n: n0 = DEMO_N,
  pre: pre0 = 2,
  post: post0 = 1,
  initial: initial0 = 'mixed',
  preloadSweeps = 0,
  lockInitial = false,
  lockPre = false,
  caption,
  height = 170,
}: TwoGridLabProps) {
  const n = n0 === 7 || n0 === 15 || n0 === 31 || n0 === 63 ? n0 : DEMO_N;
  const highK = highKOf(n);

  const [kind, setKind] = useState<TwoGridInitial>(initial0);
  const [pre, setPre] = useState(pre0);
  const [field, setField] = useState(() => startField(initial0, n, preloadSweeps));
  const [stage, setStage] = useState<TwoGridStage>('smooth');
  const [cycles, setCycles] = useState(0);
  const [sweeps, setSweeps] = useState(preloadSweeps);
  const [rCoarse, setRCoarse] = useState<number[] | null>(null);
  const [eCoarse, setECoarse] = useState<number[] | null>(null);
  const [history, setHistory] = useState<{ cycle: number; err: number; res: number }[]>(() => {
    const u0 = startField(initial0, n, preloadSweeps);
    return [{ cycle: 0, err: norm2(u0), res: norm2(residual(u0, zeros(n))) }];
  });

  const op = useMemo(() => laplacian1d(n, 'dirichlet'), [n]);
  const coarse = useMemo(() => coarseGrid(n), [n]);
  const f = useMemo(() => zeros(n), [n]);
  const e0scale = useMemo(
    () => Math.max(1e-9, maxAbs(initialField(kind, n))),
    [kind, n],
  );

  const resetTo = (nextKind: TwoGridInitial, nextPre: number) => {
    const u0 = startField(nextKind, n, preloadSweeps);
    setKind(nextKind);
    setPre(nextPre);
    setField(u0);
    setStage('smooth');
    setCycles(0);
    setSweeps(preloadSweeps);
    setRCoarse(null);
    setECoarse(null);
    setHistory([{ cycle: 0, err: norm2(u0), res: norm2(residual(u0, f)) }]);
  };

  const rFine = residual(field, f);
  const rLive = restrict(rFine);

  const sweep = (count: number) => {
    let u = field;
    for (let i = 0; i < count; i++) u = jacobiSweep(u, f, JACOBI_SMOOTH_OMEGA);
    setField(u);
    setSweeps(sweeps + count);
    setStage('smooth');
    setRCoarse(null);
    setECoarse(null);
  };

  const doRestrict = () => {
    setRCoarse(restrict(residual(field, f)));
    setECoarse(null);
    setStage('restrict');
  };

  const doSolve = () => {
    const rc = rCoarse ?? restrict(residual(field, f));
    setRCoarse(rc);
    setECoarse(coarseSolve(rc));
    setStage('solve');
  };

  const doCorrect = () => {
    const rc = rCoarse ?? restrict(residual(field, f));
    const ec = eCoarse ?? coarseSolve(rc);
    const u = add(field, prolong(ec));
    setField(u);
    setRCoarse(rc);
    setECoarse(ec);
    setStage('correct');
    setCycles(cycles + 1);
    setHistory([...history, { cycle: cycles + 1, err: norm2(u), res: norm2(residual(u, f)) }]);
  };

  const doCycle = () => {
    const u = twoGridCycle(field, f, { pre, post: post0, omega: JACOBI_SMOOTH_OMEGA });
    setField(u);
    setStage('correct');
    setRCoarse(null);
    setECoarse(null);
    setSweeps(sweeps + pre + post0);
    setCycles(cycles + 1);
    setHistory([...history, { cycle: cycles + 1, err: norm2(u), res: norm2(residual(u, f)) }]);
  };

  const spec = modeSpectrum(field);
  const specMax = Math.max(1e-12, ...spec);
  const split = Math.ceil(n / 2);
  const e0 = history[0]?.err ?? 1;
  const r0 = history[0]?.res ?? 1;
  const cLow = Math.abs(modeCoeff(field, MIXED_LOW_K));
  const cHigh = Math.abs(modeCoeff(field, highK));
  const correction = eCoarse ? prolong(eCoarse) : null;
  const cMax = Math.max(1e-12, maxAbs(rLive), rCoarse ? maxAbs(rCoarse) : 0);

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
  if (correction && stage === 'solve') {
    fieldSeries.push({
      key: 'corr',
      label: 'P e_c',
      color: 'magenta',
      style: 'line+dots',
      width: 2,
      dash: [5, 4],
      points: op.x.map((xi, i) => [xi, correction[i]!] as const),
    });
  }

  const coarseSeries: Series[] = [
    {
      key: 'rc',
      label: 'R r',
      color: 'magenta',
      style: 'line+dots',
      width: 2,
      points: coarse.x.map((xi, i) => [xi, rLive[i]!] as const),
    },
  ];
  if (eCoarse) {
    const eScale = maxAbs(eCoarse);
    const rScale = Math.max(cMax, 1e-18);
    const shown = eCoarse.map((v) => v * (rScale / Math.max(eScale, 1e-18)));
    coarseSeries.push({
      key: 'ec',
      label: 'e_c (scaled)',
      color: 'iris',
      style: 'line+dots',
      width: 2,
      dash: [4, 3],
      points: coarse.x.map((xi, i) => [xi, shown[i]!] as const),
    });
  }

  const histSeries: Series[] = [
    {
      key: 'err',
      label: '‖e‖ / ‖e₀‖',
      color: 'cyan',
      points: history.map((h) => [h.cycle, h.err / e0] as const),
    },
    {
      key: 'res',
      label: '‖r‖ / ‖r₀‖',
      color: 'magenta',
      points: history.map((h) => [h.cycle, h.res / r0] as const),
    },
  ];

  return (
    <figure className="not-prose" style={{ margin: '2rem 0' }}>
      <Panel
        title="fine error, coarse residual"
        right={
          <span className="hud-label" style={{ color: 'var(--color-cyan)' }}>
            {STAGE_LABEL[stage]} · {cycles} cycle{cycles === 1 ? '' : 's'}
          </span>
        }
      >
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 12 }}>
          {!lockInitial && (
            <Toggle
              options={[
                { key: 'mixed', label: 'long + ripple', accent: 'cyan' },
                { key: 'low', label: 'k = 1', accent: 'iris' },
                { key: 'high', label: `k = ${highK}`, accent: 'magenta' },
                { key: 'random', label: 'hashed', accent: 'orchid' },
              ]}
              value={[kind]}
              onChange={(next) => resetTo((next[0] as TwoGridInitial) ?? 'mixed', pre)}
            />
          )}
          {!lockPre && (
            <Toggle
              options={[
                { key: '0', label: 'pre = 0', accent: 'warn' },
                { key: '2', label: 'pre = 2', accent: 'cyan' },
                { key: '5', label: 'pre = 5', accent: 'magenta' },
              ]}
              value={[String(pre)]}
              onChange={(next) => resetTo(kind, Number(next[0] ?? 2))}
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
              y={{ label: 'fine error', domain: [-1.2 * e0scale, 1.2 * e0scale] }}
              height={height}
              legend
            />
            <Plot
              series={coarseSeries}
              x={{ label: 'X (coarse)', domain: [0, 1] }}
              y={{ label: 'R r', domain: [-1.3 * cMax, 1.3 * cMax] }}
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
              <span className="hud-label">k = {n}</span>
            </div>

            <div style={{ marginTop: 10 }}>
              <Plot
                series={histSeries}
                x={{ label: 'V-cycles', domain: [0, Math.max(4, history[history.length - 1]?.cycle ?? 4)] }}
                y={{ label: 'relative', domain: [0, 1.15] }}
                height={Math.max(120, height - 40)}
                legend
              />
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12, alignItems: 'center' }}>
          <Button onClick={() => sweep(1)} accent="cyan">+1 sweep</Button>
          <Button onClick={doRestrict} accent="magenta" active={stage === 'restrict'}>restrict</Button>
          <Button onClick={doSolve} accent="iris" active={stage === 'solve'}>solve coarse</Button>
          <Button onClick={doCorrect} accent="orchid" active={stage === 'correct'}>prolong + correct</Button>
          <Button onClick={doCycle} accent="ok">one V-cycle</Button>
          <Button onClick={() => resetTo(kind, pre)} accent="warn">reset</Button>
        </div>

        <ReadoutRow>
          <Readout label="sweeps" value={String(sweeps)} accent="cyan" />
          <Readout label="cycles" value={String(cycles)} accent="iris" />
          <Readout label="‖e‖ / ‖e₀‖" value={formatValue(norm2(field) / e0, 3)} accent="cyan" />
          <Readout label="‖r‖ / ‖r₀‖" value={formatValue(norm2(rFine) / r0, 3)} accent="magenta" />
          <Readout label={`|c_1|`} value={formatValue(cLow, 3)} accent="iris" />
          <Readout label={`|c_${highK}|`} value={formatValue(cHigh, 3)} accent="magenta" />
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
