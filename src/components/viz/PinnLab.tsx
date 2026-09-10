import { useMemo, useState } from 'react';
import Plot from './Plot.tsx';
import { Button, Panel, Readout, ReadoutRow } from './controls.tsx';
import { formatValue, type Series } from './chart-core.ts';
import {
  collocation, interpolantNodes, interpolantResidualRms, lagrangeEval,
  mlpEval, residualRms, seedMlp, trainOnData, trainOnResidual,
} from '../../lib/numerics/pinn.ts';

export interface PinnLabProps {
  caption?: string;
}

const SPAN = 2.5;
const DENSE = collocation(120, SPAN);
const COLLOC = collocation(40, SPAN);
const DATA_T = [0, 0.6, 1.2, 1.8, 2.4];
const DATA_Y = DATA_T.map((t) => Math.exp(-t));
const NODES = interpolantNodes(SPAN);

/**
 * Two fits of e^{−t}, one residual. The interpolant (and a data-only net)
 * can look close in value and still fail y′ + y = 0. The residual-trained
 * net is the one whose loss is that residual — which is the whole point.
 */
export default function PinnLab({ caption }: PinnLabProps) {
  const start = useMemo(() => seedMlp(3), []);
  const [physSteps, setPhysSteps] = useState(180);
  const [mode, setMode] = useState<'interpolant' | 'data' | 'residual'>('interpolant');

  const trained = useMemo(() => {
    const residual = trainOnResidual(start, { steps: physSteps, lr: 0.08, ts: COLLOC });
    const data = trainOnData(start, DATA_T, DATA_Y, { steps: 450, lr: 0.15 });
    return { residual: residual.params, data: data.params };
  }, [start, physSteps]);

  const interpR = interpolantResidualRms(NODES, DENSE);
  const dataR = residualRms(trained.data, DENSE);
  const physR = residualRms(trained.residual, DENSE);

  const valueOf = (t: number): number => {
    if (mode === 'interpolant') return lagrangeEval(NODES, t).y;
    if (mode === 'data') return mlpEval(trained.data, t).y;
    return mlpEval(trained.residual, t).y;
  };
  const residOf = (t: number): number => {
    if (mode === 'interpolant') {
      const { y, dy } = lagrangeEval(NODES, t);
      return dy + y;
    }
    const p = mode === 'data' ? trained.data : trained.residual;
    const { y, yt } = mlpEval(p, t);
    return yt + y;
  };

  const sol: Series[] = [
    {
      key: 'true', label: 'e^{−t}', color: 'ink', dash: [3, 3], width: 1.3,
      points: DENSE.map((t) => [t, Math.exp(-t)] as const),
    },
    {
      key: 'fit', label: mode, color: mode === 'residual' ? 'cyan' : 'magenta', width: 2,
      points: DENSE.map((t) => [t, valueOf(t)] as const),
    },
  ];
  const res: Series[] = [
    {
      key: 'r', label: 'ŷ′ + ŷ', color: mode === 'residual' ? 'cyan' : 'magenta', width: 1.8,
      points: DENSE.map((t) => [t, residOf(t)] as const),
    },
  ];

  const activeR = mode === 'interpolant' ? interpR : mode === 'data' ? dataR : physR;

  return (
    <div className="not-prose" style={{ margin: '2rem 0' }}>
      <Panel
        title="residual check"
        right={
          <span className="hud-label" style={{ color: activeR < 0.04 ? 'var(--sig-ok)' : 'var(--sig-warn)' }}>
            {activeR < 0.04 ? 'residual small' : 'pretty ≠ solved'}
          </span>
        }
      >
        <p style={{ margin: '0 0 12px', color: 'var(--color-ink)', fontSize: '1rem', lineHeight: 1.55 }}>
          Same exponential. Three fits. Only one of them was asked to satisfy the ODE.
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
          <Button accent="magenta" active={mode === 'interpolant'} onClick={() => setMode('interpolant')}>interpolant</Button>
          <Button accent="orchid" active={mode === 'data'} onClick={() => setMode('data')}>data-only net</Button>
          <Button accent="cyan" active={mode === 'residual'} onClick={() => setMode('residual')}>residual-trained</Button>
          <Button accent="iris" onClick={() => setPhysSteps((n) => n + 80)}>train residual +80</Button>
        </div>

        <Plot
          series={sol}
          x={{ label: 't', domain: [0, SPAN] }}
          y={{ label: 'ŷ', domain: [-0.15, 1.15] }}
          height={200}
          legend
        />
        <Plot
          series={res}
          x={{ label: 't', domain: [0, SPAN] }}
          y={{ label: 'ŷ′ + ŷ' }}
          height={180}
          legend={false}
          rules={[{ y: 0, label: 'ODE holds' }]}
        />

        <ReadoutRow>
          <Readout label="interpolant RMS r" value={formatValue(interpR, 3)} accent="magenta" />
          <Readout label="data-only RMS r" value={formatValue(dataR, 3)} accent="orchid" />
          <Readout label="residual-net RMS r" value={formatValue(physR, 3)} accent="cyan" />
          <Readout label="residual steps" value={String(physSteps)} />
        </ReadoutRow>
      </Panel>
      {caption && (
        <p style={{ margin: '8px 4px 0', color: 'var(--color-ink-faint)', fontSize: '0.92rem', lineHeight: 1.5 }}>{caption}</p>
      )}
    </div>
  );
}
