import { useMemo, useState } from 'react';
import Plot from '../viz/Plot.tsx';
import { Button, Panel, Readout, ReadoutRow, Slider } from '../viz/controls.tsx';
import { formatValue } from '../viz/chart-core.ts';
import { useWidget } from '../../lib/use-lesson.ts';
import { TUNE_SCENARIOS } from './tune-scenarios.ts';

export interface TuneProps {
  id: string;
  prompt: string;
  /** Key into TUNE_SCENARIOS. Island props are JSON-serialised, so the
   *  computation cannot be passed in as a function — it is registered in
   *  `tune-scenarios.ts` and named here. */
  scenario: string;
  height?: number;
  /** Shown once solved — the reason the threshold sits where it does. */
  explanation?: string;
  hint?: string;
}

/**
 * Hunt for a threshold by moving a parameter until the simulation does the
 * thing being described — for instance, finding where forward Euler on
 * dy/dt = -λy stops decaying and starts exploding.
 *
 * Thresholds are exactly the kind of fact that reads as arbitrary in a
 * textbook ("stable for h < 2/λ") and becomes obvious the moment you have felt
 * the cliff edge under a slider.
 */
export default function Tune({
  id, prompt, scenario, height = 300, explanation, hint,
}: TuneProps) {
  const spec = TUNE_SCENARIOS[scenario];
  if (!spec) throw new Error(`Unknown Tune scenario "${scenario}"`);
  const { param, target, tolerance, x, y, rules, compute } = spec;

  const { solved, solve } = useWidget(id, 'tune');
  const [value, setValue] = useState(param.value);
  const [checks, setChecks] = useState(0);
  const [verdict, setVerdict] = useState<'none' | 'hit' | 'miss'>('none');
  const [showHint, setShowHint] = useState(false);

  const { series, readouts } = useMemo(() => compute(value), [compute, value]);

  const relError = Math.abs(value - target) / Math.max(Math.abs(target), 1e-12);
  const close = relError <= tolerance;

  const check = () => {
    setChecks((n) => n + 1);
    setVerdict(close ? 'hit' : 'miss');
    if (close) void solve(true, checks + 1, { value, target });
  };

  const done = solved || verdict === 'hit';

  return (
    <div className="not-prose" style={{ margin: '2rem 0' }}>
      <Panel
        title="tune"
        right={
          <span className="hud-label" style={{ color: done ? 'var(--sig-ok)' : 'var(--color-ink-faint)' }}>
            {done ? 'found it' : verdict === 'miss' ? 'not yet' : 'find the threshold'}
          </span>
        }
      >
        <p style={{ margin: '0 0 14px', color: 'var(--color-ink)', fontSize: '1rem', lineHeight: 1.6 }}>
          {prompt}
        </p>

        <Plot series={series} x={x} y={y} rules={rules} height={height} legend={series.length > 1} />

        <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: 'minmax(200px,1fr) auto', gap: 16, alignItems: 'end' }}>
          <Slider spec={param} value={value} onChange={(v) => { setValue(v); setVerdict('none'); }} />
          <div style={{ display: 'flex', gap: 6 }}>
            {hint && !done && (
              <Button onClick={() => setShowHint(true)} accent="warn">hint</Button>
            )}
            <Button onClick={check} accent="magenta" disabled={done}>
              {done ? 'solved' : 'check'}
            </Button>
          </div>
        </div>

        {showHint && !done && hint && (
          <p style={{ marginTop: 10, fontSize: '0.86rem', color: 'var(--sig-warn)', lineHeight: 1.6 }}>
            {hint}
          </p>
        )}

        {verdict === 'miss' && !done && (
          <p style={{ marginTop: 10, fontSize: '0.86rem', color: 'var(--color-ink-faint)', lineHeight: 1.6 }}>
            {/* Directional feedback only — handing over the number would skip the search. */}
            Not there yet. Try {value < target ? 'a larger' : 'a smaller'} value.
          </p>
        )}

        {done && explanation && (
          <p style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--color-rule)', fontSize: '0.9rem', color: 'var(--color-ink-soft)', lineHeight: 1.65 }}>
            {explanation}
          </p>
        )}

        {readouts && readouts.length > 0 && (
          <ReadoutRow>
            {readouts.map((r) => <Readout key={r.label} label={r.label} value={r.value} />)}
            {done && <Readout label="target" value={formatValue(target, 4)} accent="ok" />}
          </ReadoutRow>
        )}
      </Panel>
    </div>
  );
}
