import { useState, type ReactNode } from 'react';
import { Button, Panel } from '../viz/controls.tsx';
import { useWidget } from '../../lib/use-lesson.ts';

export interface PredictOption {
  key: string;
  label: string;
  /** Shown after answering — why this option is right or wrong. Every option
   *  should have one: a wrong answer the learner cannot understand is a
   *  wasted interaction. */
  why: string;
  /** Id of a misconception from a concept file. When a learner picks this
   *  option, the belief gets NAMED rather than only corrected — knowing which
   *  wrong model you were running is most of the repair. */
  misconception?: string;
  /** Filled in at build time by widgets/Predict.astro. Do not author this. */
  resolved?: { name: string; correction: string; concept: string };
}

export interface PredictProps {
  id: string;
  question: string;
  options: PredictOption[];
  correct: string | string[];
  /** Revealed only after the learner commits — this is the payoff. */
  children?: ReactNode;
  multiple?: boolean;
  xp?: number;
}

/**
 * Commit to a prediction, then watch the real simulation confirm or destroy it.
 *
 * This is the highest-value pattern in the platform. Reading "RK4 conserves
 * energy poorly on long orbits" teaches almost nothing; predicting that it
 * won't, being wrong, and then seeing the drift is what actually moves
 * intuition. The reveal is gated on committing precisely so the learner cannot
 * skip the part that does the work.
 */
export default function Predict({
  id, question, options, correct, children, multiple = false, xp,
}: PredictProps) {
  const { solved, solve } = useWidget(id, 'predict');
  const answers = Array.isArray(correct) ? correct : [correct];

  const [picked, setPicked] = useState<string[]>([]);
  const [committed, setCommitted] = useState(false);
  const [attempts, setAttempts] = useState(0);

  const revealed = committed || solved;

  const matchesAnswer =
    picked.length === answers.length && picked.every((p) => answers.includes(p));

  // On a revisit the widget is `solved` from the database but `picked` is
  // empty, so the this-session comparison would report "not quite" for a
  // question the learner already got right. Trust the stored result unless
  // they have actually answered again in this session.
  const isRight = committed ? matchesAnswer : solved;

  const toggle = (key: string) => {
    if (revealed) return;
    setPicked(multiple ? (picked.includes(key) ? picked.filter((k) => k !== key) : [...picked, key]) : [key]);
  };

  const commit = () => {
    setCommitted(true);
    setAttempts((n) => n + 1);
    void solve(matchesAnswer, attempts + 1, { picked }, xp);
  };

  return (
    <div className="not-prose" style={{ margin: '2rem 0' }}>
      <Panel
        title="predict"
        right={
          <span className="hud-label" style={{ color: revealed ? (isRight ? 'var(--sig-ok)' : 'var(--sig-warn)') : 'var(--color-ink-faint)' }}>
            {revealed ? (isRight ? 'correct' : 'not quite') : multiple ? 'select all' : 'commit first'}
          </span>
        }
      >
        <p style={{ margin: '0 0 14px', color: 'var(--color-ink)', fontSize: '1rem', lineHeight: 1.6 }}>
          {question}
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {options.map((o) => {
            const chosen = picked.includes(o.key);
            const right = answers.includes(o.key);
            const tone = !revealed
              ? chosen ? 'var(--color-cyan)' : 'var(--color-rule)'
              : right ? 'var(--sig-ok)'
              : chosen ? 'var(--color-magenta)'
              : 'var(--color-rule)';

            return (
              <div key={o.key}>
                <button
                  type="button"
                  onClick={() => toggle(o.key)}
                  disabled={revealed}
                  style={{
                    width: '100%', textAlign: 'left', cursor: revealed ? 'default' : 'pointer',
                    display: 'flex', alignItems: 'flex-start', gap: 10,
                    padding: '9px 12px',
                    background: chosen ? `color-mix(in oklab, ${tone} 14%, transparent)` : 'transparent',
                    border: `1px solid ${tone}`, borderRadius: 'var(--radius-hud)',
                    color: 'var(--color-ink)', font: 'inherit', fontSize: '0.94rem', lineHeight: 1.5,
                    transition: 'border-color 120ms ease, background 120ms ease',
                  }}
                >
                  <span className="readout" style={{ color: tone, fontSize: 11, paddingTop: 3, minWidth: 14 }}>
                    {revealed ? (right ? '✓' : chosen ? '✕' : '·') : chosen ? '◆' : '◇'}
                  </span>
                  <span>{o.label}</span>
                </button>

                {revealed && (chosen || right) && (
                  <>
                    <p style={{
                      margin: '6px 0 0 38px', fontSize: '0.96rem', lineHeight: 1.6,
                      color: right ? 'var(--color-ink-soft)' : 'var(--color-ink-faint)',
                    }}>
                      {o.why}
                    </p>

                    {/* Naming the belief the learner was running, when they
                        actually ran it — not on options they did not pick. */}
                    {chosen && !right && o.resolved && (
                      <div style={{
                        margin: '9px 0 0 38px', padding: '10px 13px',
                        borderLeft: '2px solid var(--sig-warn)',
                        background: 'color-mix(in oklab, var(--sig-warn) 6%, transparent)',
                      }}>
                        <span className="hud-label" style={{ color: 'var(--sig-warn)' }}>
                          the belief underneath
                        </span>
                        <p style={{ margin: '6px 0 0', fontSize: '0.96rem', lineHeight: 1.6, color: 'var(--color-ink)' }}>
                          “{o.resolved.name}”
                        </p>
                        <p style={{ margin: '6px 0 0', fontSize: '0.94rem', lineHeight: 1.62, color: 'var(--color-ink-soft)' }}>
                          {o.resolved.correction}
                        </p>
                      </div>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>

        {!revealed && (
          <div style={{ marginTop: 14 }}>
            <Button onClick={commit} disabled={picked.length === 0} accent="magenta">
              commit prediction
            </Button>
          </div>
        )}
      </Panel>

      {revealed && children && (
        <div style={{ marginTop: 4 }}>
          <div className="hud-label" style={{ margin: '14px 0 2px', color: 'var(--color-magenta)' }}>
            ── now watch what actually happens
          </div>
          {children}
        </div>
      )}
    </div>
  );
}
