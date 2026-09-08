import { useEffect, useState } from 'react';
import { db, type DbStatus } from '../../lib/db/client.ts';
import { summary, type ProgressSummary } from '../../lib/db/progress.ts';
import { lesson } from '../../lib/lesson-store.ts';

/** The persistent XP / streak readout in the header, plus the storage-status
 *  notice when the local database could not be opened. */
export default function XpRail() {
  const [stats, setStats] = useState<ProgressSummary | null>(null);
  const [status, setStatus] = useState<DbStatus>('idle');

  useEffect(() => {
    const off = db.onStatus(setStatus);
    void db.open().then(async () => {
      if (db.available) setStats(await summary());
    });
    // Widgets on a lesson page push updates through the shared store.
    const unsub = lesson.subscribe(() => { if (lesson.progress) setStats(lesson.progress); });
    return () => { off(); unsub(); };
  }, []);

  if (status === 'locked' || status === 'unsupported' || status === 'error') {
    const text = status === 'locked'
      ? 'open in another tab'
      : status === 'unsupported'
      ? 'storage unavailable'
      : 'storage error';
    return (
      <span
        className="hud-label"
        style={{ color: 'var(--color-amber)', whiteSpace: 'nowrap' }}
        title={
          status === 'locked'
            ? 'The progress database allows one tab at a time. Close the other tab and reload to track XP here.'
            : 'Progress cannot be saved in this browser context. Lessons still work in full.'
        }
      >
        ◇ {text}
      </span>
    );
  }

  if (!stats) return <span className="hud-label" style={{ color: 'var(--color-ink-ghost)' }}>◇ ———</span>;

  const pct = Math.min(100, (stats.todayXp / Math.max(stats.goal, 1)) * 100);
  const hit = stats.todayXp >= stats.goal;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14, whiteSpace: 'nowrap' }}>
      <span className="hud-label" title="current daily streak" style={{ color: stats.streak > 0 ? 'var(--color-magenta)' : 'var(--color-ink-ghost)' }}>
        ▲ {stats.streak}d
      </span>

      <span title={`${stats.todayXp} of ${stats.goal} XP today`} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
        <span style={{ width: 56, height: 3, background: 'var(--color-rule-bright)', position: 'relative', overflow: 'hidden' }}>
          <span style={{
            position: 'absolute', inset: 0, width: `${pct}%`,
            background: hit ? 'var(--color-acid)' : 'var(--color-cyan)',
            boxShadow: `0 0 8px ${hit ? 'var(--color-acid)' : 'var(--color-cyan)'}`,
            transition: 'width 400ms ease',
          }} />
        </span>
        <span className="readout hud-label" style={{ color: hit ? 'var(--color-acid)' : 'var(--color-ink-soft)' }}>
          {stats.todayXp}
        </span>
      </span>

      <span className="hud-label" title={`Level ${stats.level}`} style={{ color: 'var(--color-violet)' }}>
        L{stats.level}
      </span>

      {stats.dueCount > 0 && (
        <a href={`${import.meta.env.BASE_URL.replace(/\/$/, '')}/review`} className="hud-label"
           style={{ color: 'var(--color-amber)', textDecoration: 'none' }} title={`${stats.dueCount} cards due`}>
          ↺ {stats.dueCount}
        </a>
      )}
    </div>
  );
}
