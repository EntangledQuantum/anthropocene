import { useEffect, useState } from 'react';
import { lesson } from '../../lib/lesson-store.ts';

/** Transient XP awards, bottom-right. Deliberately small: the reward for
 *  learning should be the understanding, with XP as a quiet tally. */
export default function XpToasts() {
  const [toasts, setToasts] = useState(lesson.toasts);
  useEffect(() => lesson.subscribe(() => setToasts(lesson.toasts)), []);

  if (!toasts.length) return null;

  return (
    <div style={{
      position: 'fixed', right: 20, bottom: 20, zIndex: 60,
      display: 'flex', flexDirection: 'column-reverse', gap: 8, pointerEvents: 'none',
    }}>
      {toasts.map((t) => (
        <div key={t.id} className="hud hud-brackets glow-magenta"
          style={{ padding: '7px 13px', display: 'flex', alignItems: 'baseline', gap: 9, animation: 'anth-toast 260ms ease-out' }}>
          <span className="readout" style={{ color: 'var(--sig-ok)', fontSize: 15, fontWeight: 600 }}>+{t.amount}</span>
          <span className="hud-label">{t.label}</span>
        </div>
      ))}
    </div>
  );
}
