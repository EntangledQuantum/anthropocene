import { useState } from 'react';
import { Button, Panel } from '../viz/controls.tsx';
import { useWidget } from '../../lib/use-lesson.ts';

/* Sort items into buckets. Good for the distinctions that carry the most
   weight and get blurred the most often — stable vs unstable, symplectic vs
   not, property-of-the-problem vs property-of-the-algorithm. */

export interface ClassifyProps {
  id: string;
  prompt: string;
  buckets: { key: string; label: string; accent?: 'cyan' | 'magenta' | 'ok' | 'iris' | 'warn' }[];
  items: { key: string; label: string; bucket: string; why?: string }[];
  explanation?: string;
}

export default function Classify({ id, prompt, buckets, items, explanation }: ClassifyProps) {
  const { solved, solve } = useWidget(id, 'classify');

  const [placed, setPlaced] = useState<Record<string, string>>({});
  const [checked, setChecked] = useState(false);
  const [attempts, setAttempts] = useState(0);
  const [held, setHeld] = useState<string | null>(null);

  const unplaced = items.filter((i) => !placed[i.key]);
  const allPlaced = unplaced.length === 0;
  const isRight = items.every((i) => placed[i.key] === i.bucket);
  const done = (checked && isRight) || solved;

  const put = (bucketKey: string) => {
    if (!held || done) return;
    setPlaced({ ...placed, [held]: bucketKey });
    setHeld(null);
    setChecked(false);
  };

  const check = () => {
    setChecked(true);
    setAttempts((n) => n + 1);
    void solve(isRight, attempts + 1, { placed }, 14);
  };

  return (
    <div className="not-prose" style={{ margin: '2.5rem 0' }}>
      <Panel
        title="sort these"
        right={
          <span className="hud-label" style={{ color: !checked ? 'var(--color-ink-faint)' : isRight ? 'var(--sig-ok)' : 'var(--sig-warn)' }}>
            {!checked ? `${unplaced.length} left` : isRight ? 'all correct' : 'some are misplaced'}
          </span>
        }
      >
        <p style={{ margin: '0 0 16px', color: 'var(--color-ink)', fontSize: '1.06rem', lineHeight: 1.6 }}>{prompt}</p>

        {unplaced.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 18 }}>
            {unplaced.map((i) => (
              <button
                key={i.key}
                type="button"
                onClick={() => setHeld(held === i.key ? null : i.key)}
                className="anth-btn"
                data-active={held === i.key ? 'true' : undefined}
                style={{ fontSize: '0.98rem', padding: '9px 14px', textTransform: 'none', letterSpacing: 0, fontFamily: 'var(--font-sans)' }}
              >
                {i.label}
              </button>
            ))}
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fit,minmax(220px,1fr))`, gap: 12 }}>
          {buckets.map((b) => {
            const mine = items.filter((i) => placed[i.key] === b.key);
            const accent = `var(--color-${b.accent ?? 'cyan'})`;
            return (
              <div
                key={b.key}
                onClick={() => put(b.key)}
                style={{
                  minHeight: 130, padding: '12px 14px',
                  border: `1px dashed ${held ? accent : 'var(--color-rule)'}`,
                  borderRadius: 'var(--radius-hud)',
                  background: held ? `color-mix(in oklab, ${accent} 7%, transparent)` : 'transparent',
                  cursor: held ? 'pointer' : 'default',
                  transition: 'border-color 140ms ease, background 140ms ease',
                }}
              >
                <div className="hud-label" style={{ color: accent, marginBottom: 10 }}>{b.label}</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {mine.map((i) => {
                    const ok = checked && i.bucket === b.key;
                    const bad = checked && i.bucket !== b.key;
                    return (
                      <div key={i.key}>
                        <div
                          onClick={(e) => { e.stopPropagation(); if (!done) { const n = { ...placed }; delete n[i.key]; setPlaced(n); setChecked(false); } }}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 8,
                            padding: '7px 10px', fontSize: '0.96rem',
                            border: `1px solid ${bad ? 'var(--color-magenta)' : ok ? 'var(--sig-ok)' : 'var(--color-rule-bright)'}`,
                            borderRadius: 'var(--radius-hud)',
                            background: 'color-mix(in oklab, var(--color-surface) 62%, transparent)',
                            color: 'var(--color-ink)',
                            cursor: done ? 'default' : 'pointer',
                          }}
                        >
                          {checked && <span style={{ color: ok ? 'var(--sig-ok)' : 'var(--color-magenta)' }}>{ok ? '✓' : '✕'}</span>}
                          {i.label}
                        </div>
                        {bad && i.why && (
                          <p style={{ margin: '4px 0 0 4px', fontSize: '0.9rem', lineHeight: 1.5, color: 'var(--color-ink-faint)' }}>{i.why}</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 16, alignItems: 'center' }}>
          {!done && <Button onClick={check} accent="magenta" disabled={!allPlaced}>{allPlaced ? 'check' : 'place them all first'}</Button>}
          {held && <span className="hud-label">now click a bucket</span>}
        </div>

        {checked && isRight && explanation && (
          <p style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--color-rule)', fontSize: '1rem', color: 'var(--color-ink-soft)', lineHeight: 1.68 }}>
            {explanation}
          </p>
        )}
      </Panel>
    </div>
  );
}
