import { useMemo, useState } from 'react';
import Plot from './Plot.tsx';
import { Panel, Readout, ReadoutRow, Toggle } from './controls.tsx';
import { formatValue, type Series } from './chart-core.ts';

/* Two algebraically identical ways to evaluate the same quantity, which behave
   completely differently in floating point. This is the cleanest possible
   demonstration that "the algorithm matters, not just the formula". */

const CASES = {
  'sqrt': {
    label: '√(x+1) − √x',
    naive: (x: number) => Math.sqrt(x + 1) - Math.sqrt(x),
    stable: (x: number) => 1 / (Math.sqrt(x + 1) + Math.sqrt(x)),
    naiveSrc: 'Math.sqrt(x + 1) - Math.sqrt(x)',
    stableSrc: '1 / (Math.sqrt(x + 1) + Math.sqrt(x))',
    note: 'Multiply by the conjugate: the subtraction disappears entirely.',
    xs: Array.from({ length: 90 }, (_, i) => 10 ** (i / 6)),
  },
  'expm1': {
    label: '(eˣ − 1) / x',
    naive: (x: number) => (Math.exp(x) - 1) / x,
    stable: (x: number) => Math.expm1(x) / x,
    naiveSrc: '(Math.exp(x) - 1) / x',
    stableSrc: 'Math.expm1(x) / x',
    note: 'expm1 computes eˣ − 1 directly, never forming the near-1 intermediate.',
    xs: Array.from({ length: 90 }, (_, i) => 10 ** (-i / 6)),
  },
} as const;

type CaseKey = keyof typeof CASES;

export default function CancellationLab({ initial = 'sqrt' as CaseKey }) {
  const [key, setKey] = useState<CaseKey>(initial);
  const c = CASES[key];

  const { series, worst } = useMemo(() => {
    // The stable form is accurate to ~machine precision, so it stands in for
    // the truth here; the naive form's departure from it IS the cancellation.
    const pts: Series[] = [
      {
        key: 'naive', label: 'naive form', color: 'magenta', style: 'line+dots', width: 2,
        points: c.xs.map((x) => {
          const rel = Math.abs((c.naive(x) - c.stable(x)) / c.stable(x));
          return [x, Math.max(rel, 1e-18)] as const;
        }),
      },
      {
        key: 'floor', label: 'machine epsilon', color: 'ink', dash: [4, 4], width: 1,
        points: [[c.xs[0], Number.EPSILON], [c.xs.at(-1)!, Number.EPSILON]],
      },
    ];
    const worst = Math.max(...pts[0].points.map((p) => p[1]));
    return { series: pts, worst };
  }, [c]);

  return (
    <div className="not-prose" style={{ margin: '2rem 0' }}>
      <Panel
        title="catastrophic cancellation"
        right={
          <Toggle
            options={(Object.keys(CASES) as CaseKey[]).map((k) => ({ key: k, label: CASES[k].label, accent: 'magenta' as const }))}
            value={[key]}
            onChange={([k]) => setKey(k as CaseKey)}
          />
        }
      >
        <Plot
          series={series}
          x={{ label: 'x', scale: 'log' }}
          y={{ label: 'relative error of naive form', scale: 'log' }}
          height={300}
          legend
        />

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))', gap: 12, marginTop: 14 }}>
          <div>
            <span className="hud-label" style={{ color: 'var(--color-magenta)', display: 'block', marginBottom: 5 }}>naive</span>
            <pre style={{ margin: 0, padding: '8px 10px', fontSize: 12, background: 'color-mix(in oklab,var(--color-abyss) 88%,transparent)', border: '1px solid var(--color-rule)', overflowX: 'auto' }}><code>{c.naiveSrc}</code></pre>
          </div>
          <div>
            <span className="hud-label" style={{ color: 'var(--sig-ok)', display: 'block', marginBottom: 5 }}>rearranged</span>
            <pre style={{ margin: 0, padding: '8px 10px', fontSize: 12, background: 'color-mix(in oklab,var(--color-abyss) 88%,transparent)', border: '1px solid var(--sig-ok)', overflowX: 'auto' }}><code>{c.stableSrc}</code></pre>
          </div>
        </div>

        <ReadoutRow>
          <Readout label="worst relative error" value={formatValue(worst, 3)} accent="magenta" />
          <Readout label="machine epsilon" value={Number.EPSILON.toExponential(2)} accent="ink" />
          <Readout label="digits lost" value={`≈ ${Math.max(0, Math.round(Math.log10(worst / Number.EPSILON)))}`} accent="warn" />
        </ReadoutRow>

        <p style={{ margin: '12px 0 0', fontSize: '0.88rem', lineHeight: 1.65, color: 'var(--color-ink-soft)' }}>
          {c.note} Both expressions are the same function on paper. They are not the same algorithm.
        </p>
      </Panel>
    </div>
  );
}
