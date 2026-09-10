import { useMemo, useState } from 'react';
import { Button, Panel, Readout, ReadoutRow } from '../viz/controls.tsx';
import { formatValue } from '../viz/chart-core.ts';
import { useWidget } from '../../lib/use-lesson.ts';
import { ESTIMATE_SCENARIOS } from './estimate-scenarios.ts';

/* ─────────────────────────────────────────────────────────────────────────
   Commit to an order of magnitude before seeing the answer.

   Thesis §5.5 and §8: estimates are first-class, and a guess can be wrong and
   still productive. The value is not the number — it is that committing turns
   the reveal into information about your own model. Someone who guesses a
   thousand and learns it is a billion has learned something specific about
   how expensive first-order methods are. Someone who read the same figure in
   a table has not.

   Graded generously, on a multiplicative factor rather than a percentage:
   the skill being tested is landing on the right power of ten.
   ───────────────────────────────────────────────────────────────────────── */

export interface EstimateProps {
  id: string;
  prompt: string;
  /** Key into ESTIMATE_SCENARIOS. */
  scenario: string;
  /** Shown after committing, right or wrong. */
  explanation?: string;
}

export default function Estimate({ id, prompt, scenario, explanation }: EstimateProps) {
  const spec = ESTIMATE_SCENARIOS[scenario];
  if (!spec) throw new Error(`Unknown Estimate scenario "${scenario}"`);

  const { solved, solve } = useWidget(id, 'estimate');
  const [logGuess, setLogGuess] = useState(spec.logStart);
  const [committed, setCommitted] = useState(false);
  const [attempts, setAttempts] = useState(0);

  const truth = useMemo(() => spec.truth(), [spec]);
  const guess = 10 ** logGuess;

  const factor = guess > truth ? guess / truth : truth / guess;
  const close = factor <= spec.withinFactor;
  const revealed = committed || solved;

  const commit = () => {
    setCommitted(true);
    setAttempts((n) => n + 1);
    void solve(close, attempts + 1, { guess, truth, factor }, 14);
  };

  const pct = (v: number) =>
    ((Math.log10(v) - spec.logRange[0]) / (spec.logRange[1] - spec.logRange[0])) * 100;

  return (
    <div className="not-prose" style={{ margin: '2.5rem 0' }}>
      <Panel
        title="estimate first"
        right={
          <span className="hud-label" style={{ color: !revealed ? 'var(--color-ink-faint)' : close ? 'var(--sig-ok)' : 'var(--sig-warn)' }}>
            {!revealed ? 'commit to an order of magnitude' : close ? `within ${formatValue(factor, 2)}×` : `off by ${formatValue(factor, 2)}×`}
          </span>
        }
      >
        <p style={{ margin: '0 0 6px', color: 'var(--color-ink)', fontSize: '1.06rem', lineHeight: 1.6 }}>{prompt}</p>
        <p style={{ margin: '0 0 22px', color: 'var(--color-ink-faint)', fontSize: '0.98rem', lineHeight: 1.55 }}>
          {spec.quantity}
        </p>

        {/* the scale */}
        <div style={{ position: 'relative', height: 62, marginBottom: 8 }}>
          <div style={{ position: 'absolute', left: 0, right: 0, top: 26, height: 3, background: 'var(--color-rule-bright)', borderRadius: 2 }} />

          {(spec.landmarks ?? []).map((l) => (
            <div key={l.label + l.value} style={{ position: 'absolute', left: `${pct(l.value)}%`, top: 14, transform: 'translateX(-50%)' }}>
              <div style={{ width: 1, height: 26, background: 'var(--color-ink-ghost)', margin: '0 auto' }} />
              <span className="hud-label" style={{ display: 'block', marginTop: 4, whiteSpace: 'nowrap', transform: 'translateX(-50%)', marginLeft: '50%' }}>
                {l.label}
              </span>
            </div>
          ))}

          {/* the guess */}
          <div style={{ position: 'absolute', left: `${pct(guess)}%`, top: 20, transform: 'translateX(-50%)', transition: 'left 120ms ease' }}>
            <span style={{
              display: 'block', width: 15, height: 15, borderRadius: '50%',
              background: 'var(--sig-you)', boxShadow: '0 0 16px var(--sig-you)',
            }} />
          </div>

          {/* the truth, once committed */}
          {revealed && (
            <div style={{ position: 'absolute', left: `${pct(truth)}%`, top: 12, transform: 'translateX(-50%)' }}>
              <div style={{ width: 2, height: 32, background: 'var(--sig-truth)', boxShadow: '0 0 14px var(--sig-truth)', margin: '0 auto' }} />
              <span className="hud-label" style={{ display: 'block', marginTop: 3, color: 'var(--sig-truth)', whiteSpace: 'nowrap', transform: 'translateX(-50%)', marginLeft: '50%' }}>
                actual
              </span>
            </div>
          )}
        </div>

        <input
          type="range"
          className="anth-slider"
          min={spec.logRange[0]}
          max={spec.logRange[1]}
          step={0.05}
          value={logGuess}
          disabled={revealed}
          onChange={(e) => setLogGuess(+e.target.value)}
          aria-label={spec.quantity}
        />

        <div style={{ display: 'flex', gap: 10, marginTop: 14, alignItems: 'center', flexWrap: 'wrap' }}>
          {!revealed && <Button onClick={commit} accent="magenta">commit</Button>}
          {revealed && !close && <Button onClick={() => setCommitted(false)}>try again</Button>}
        </div>

        <ReadoutRow>
          <Readout label="your estimate" value={guess >= 1e4 ? guess.toExponential(1) : formatValue(guess, 3)} accent="cyan" />
          {revealed && (
            <Readout label="actual" value={truth >= 1e4 ? truth.toExponential(1) : formatValue(truth, 3)} accent="magenta" />
          )}
          {revealed && (
            <Readout label="off by" value={`${formatValue(factor, 2)}×`} accent={close ? 'ok' : 'warn'} />
          )}
          <Readout label="counts as close" value={`within ${spec.withinFactor}×`} />
        </ReadoutRow>

        {revealed && explanation && (
          <p style={{
            marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--color-rule)',
            fontSize: '1rem', color: 'var(--color-ink-soft)', lineHeight: 1.68,
          }}>
            {explanation}
          </p>
        )}
      </Panel>
    </div>
  );
}
