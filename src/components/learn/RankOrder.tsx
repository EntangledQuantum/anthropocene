import { useState } from 'react';
import { Button, Panel } from '../viz/controls.tsx';
import { useWidget } from '../../lib/use-lesson.ts';

/* Put items in order along some axis. Tests relational understanding — which
   is bigger, which comes first, which costs more — without any recall of
   syntax. Reordering is a much stronger signal than picking one option,
   because there are n! ways to be wrong. */

export interface RankItem {
  key: string;
  label: string;
  /** Shown after checking: why this item sits where it does. */
  why?: string;
}

export interface RankOrderProps {
  id: string;
  prompt: string;
  /** Ends of the axis, e.g. "least accurate" → "most accurate". */
  lowLabel: string;
  highLabel: string;
  items: RankItem[];
  /** Item keys in the correct order, low → high. */
  correct: string[];
  explanation?: string;
}

export default function RankOrder({
  id, prompt, lowLabel, highLabel, items, correct, explanation,
}: RankOrderProps) {
  const { solved, solve } = useWidget(id, 'rank');

  // Start shuffled deterministically, so the initial order is never the answer
  // but is the same for everyone.
  const [order, setOrder] = useState<string[]>(() => {
    const keys = items.map((i) => i.key);
    return [...keys].sort((a, b) => (a.charCodeAt(0) * 7 + a.length) - (b.charCodeAt(0) * 7 + b.length));
  });
  const [checked, setChecked] = useState(false);
  const [attempts, setAttempts] = useState(0);
  const [dragKey, setDragKey] = useState<string | null>(null);

  const isRight = order.every((k, i) => k === correct[i]);
  const done = checked || solved;

  const move = (key: string, delta: number) => {
    if (done) return;
    const i = order.indexOf(key);
    const j = i + delta;
    if (j < 0 || j >= order.length) return;
    const next = [...order];
    [next[i], next[j]] = [next[j], next[i]];
    setOrder(next);
    setChecked(false);
  };

  const dropOn = (targetKey: string) => {
    if (!dragKey || dragKey === targetKey || done) return;
    const next = order.filter((k) => k !== dragKey);
    next.splice(order.indexOf(targetKey), 0, dragKey);
    setOrder(next);
    setDragKey(null);
    setChecked(false);
  };

  const check = () => {
    setChecked(true);
    setAttempts((n) => n + 1);
    void solve(isRight, attempts + 1, { order }, 14);
  };

  return (
    <div className="not-prose" style={{ margin: '2.5rem 0' }}>
      <Panel
        title="put these in order"
        right={
          <span className="hud-label" style={{ color: !checked ? 'var(--color-ink-faint)' : isRight ? 'var(--sig-ok)' : 'var(--sig-warn)' }}>
            {!checked ? 'drag, or use the arrows' : isRight ? 'correct' : 'not yet'}
          </span>
        }
      >
        <p style={{ margin: '0 0 16px', color: 'var(--color-ink)', fontSize: '1.06rem', lineHeight: 1.6 }}>{prompt}</p>

        <div className="hud-label" style={{ marginBottom: 8, color: 'var(--color-magenta)' }}>↑ {lowLabel}</div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          {order.map((key, idx) => {
            const item = items.find((i) => i.key === key)!;
            const rightSpot = checked && correct[idx] === key;
            const tone = !checked ? 'var(--color-rule)' : rightSpot ? 'var(--sig-ok)' : 'var(--color-magenta)';
            return (
              <div key={key}>
                <div
                  draggable={!done}
                  onDragStart={() => setDragKey(key)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => dropOn(key)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '11px 14px',
                    border: `1px solid ${tone}`,
                    borderRadius: 'var(--radius-hud)',
                    background: checked
                      ? `color-mix(in oklab, ${tone} 10%, transparent)`
                      : 'color-mix(in oklab, var(--color-surface) 55%, transparent)',
                    cursor: done ? 'default' : 'grab',
                  }}
                >
                  <span className="readout" style={{ color: tone, fontSize: 13, minWidth: 18 }}>
                    {checked ? (rightSpot ? '✓' : '✕') : idx + 1}
                  </span>
                  <span style={{ flex: 1, fontSize: '1rem', color: 'var(--color-ink)' }}>{item.label}</span>
                  {!done && (
                    <span style={{ display: 'flex', gap: 4 }}>
                      <button type="button" className="anth-btn" onClick={() => move(key, -1)} aria-label={`move ${item.label} up`} style={{ padding: '3px 9px' }}>↑</button>
                      <button type="button" className="anth-btn" onClick={() => move(key, 1)} aria-label={`move ${item.label} down`} style={{ padding: '3px 9px' }}>↓</button>
                    </span>
                  )}
                </div>
                {checked && item.why && (
                  <p style={{ margin: '5px 0 0 44px', fontSize: '0.94rem', lineHeight: 1.55, color: 'var(--color-ink-faint)' }}>
                    {item.why}
                  </p>
                )}
              </div>
            );
          })}
        </div>

        <div className="hud-label" style={{ marginTop: 8, color: 'var(--color-cyan)' }}>↓ {highLabel}</div>

        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
          {!done && <Button onClick={check} accent="magenta">check</Button>}
          {checked && !isRight && <Button onClick={() => setChecked(false)}>keep trying</Button>}
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
