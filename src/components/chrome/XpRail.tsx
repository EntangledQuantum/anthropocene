import { useEffect, useState } from 'react';
import { db, type DbStatus } from '../../lib/db/client.ts';
import { onProgressChange, summary, type ProgressSummary } from '../../lib/db/progress.ts';
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
    // Lesson widgets push through the shared store; the review queue and any
    // other writer go through the global progress signal.
    const unsubLesson = lesson.subscribe(() => { if (lesson.progress) setStats(lesson.progress); });
    const unsubProgress = onProgressChange(async () => {
      if (db.available) setStats(await summary());
    });
    return () => { off(); unsubLesson(); unsubProgress(); };
  }, []);

  if (status === 'locked' || status === 'unsupported' || status === 'error') {
    const text = status === 'locked'
      ? 'open in another tab'
      : status === 'unsupported'
      ? 'storage unavailable'
      : 'storage error';
    return (
      <span
        style={{ color: 'var(--sig-warn)', whiteSpace: 'nowrap', fontSize: 13.5 }}
        title={
          status === 'locked'
            ? 'The progress database allows one tab at a time. Close the other tab and reload to track XP here.'
            : 'Progress cannot be saved in this browser context. Lessons still work in full.'
        }
      >
        {text.charAt(0).toUpperCase() + text.slice(1)}
      </span>
    );
  }

  if (!stats) return <span style={{ display: 'inline-block', width: 120 }} />;

  const pct = Math.min(100, (stats.todayXp / Math.max(stats.goal, 1)) * 100);
  const hit = stats.todayXp >= stats.goal;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16, whiteSpace: 'nowrap', fontSize: 13.5, color: 'var(--color-ink-faint)' }}>
      {stats.dueCount > 0 && (
        <a href={`${import.meta.env.BASE_URL.replace(/\/$/, '')}/review/`}
           style={{ color: 'var(--sig-warn)', textDecoration: 'none' }} title={`${stats.dueCount} cards due`}>
          {stats.dueCount} to review
        </a>
      )}

      <span title={`${stats.todayXp} of ${stats.goal} XP today · level ${stats.level} · ${stats.streak}-day streak`}
            style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ width: 48, height: 4, borderRadius: 2, background: 'var(--color-rule-bright)', position: 'relative', overflow: 'hidden' }}>
          <span style={{
            position: 'absolute', inset: 0, width: `${pct}%`,
            background: hit ? 'var(--sig-ok)' : 'var(--iridescent)',
            transition: 'width 400ms ease',
          }} />
        </span>
        <span className="readout" style={{ color: hit ? 'var(--sig-ok)' : 'var(--color-ink-soft)' }}>
          {stats.todayXp} XP
        </span>
      </span>

      {stats.streak > 0 && <span title="current daily streak">{stats.streak}-day streak</span>}
    </div>
  );
}
