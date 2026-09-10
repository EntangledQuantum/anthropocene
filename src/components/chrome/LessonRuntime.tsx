import { useEffect, useState } from 'react';
import { lesson } from '../../lib/lesson-store.ts';
import { db } from '../../lib/db/client.ts';

interface Props {
  lessonId: string;
  tier: string;
  title: string;
  /** Build-time roster of graded widgets — the completion denominator. */
  widgets: { id: string; kind: string }[];
  unlocks: { title: string; url: string; blurb: string }[];
}

/**
 * Boots the shared lesson store for this page and renders the completion
 * panel underneath the content.
 *
 * Widget islands register themselves as they mount, so this component waits a
 * frame before initialising — otherwise the "0 of N" count would be computed
 * before any widget on the page had reported in.
 */
export default function LessonRuntime({ lessonId, tier, title, widgets, unlocks }: Props) {
  const [, force] = useState(0);

  useEffect(() => {
    const unsub = lesson.subscribe(() => force((n) => n + 1));
    // The roster comes from the build, so there is nothing to wait for — this
    // runs immediately rather than racing island hydration.
    void lesson.init({ id: lessonId, tier, title, widgets });
    return unsub;
  }, [lessonId, tier, title, widgets]);

  const { done, total } = lesson.counts;
  const complete = total > 0 && done >= total;
  const pct = total ? (done / total) * 100 : 0;

  return (
    <section className="hud hud-brackets" style={{ padding: '16px 18px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 16, flexWrap: 'wrap' }}>
        <span className="hud-label" style={{ color: complete ? 'var(--sig-ok)' : 'var(--color-magenta)' }}>
          {complete ? '◆ lesson complete' : '◇ progress'}
        </span>
        <span className="readout hud-label" style={{ color: 'var(--color-ink-soft)' }}>
          {done} / {total} interactions
        </span>
      </div>

      <div style={{ height: 3, background: 'var(--color-rule-bright)', marginTop: 10, position: 'relative', overflow: 'hidden' }}>
        <div style={{
          position: 'absolute', inset: 0, width: `${pct}%`,
          background: complete ? 'var(--sig-ok)' : 'var(--color-cyan)',
          boxShadow: `0 0 10px ${complete ? 'var(--sig-ok)' : 'var(--color-cyan)'}`,
          transition: 'width 400ms ease',
        }} />
      </div>

      {!db.available && (
        <p className="hud-label" style={{ marginTop: 10, color: 'var(--color-ink-ghost)', textTransform: 'none', letterSpacing: '0.04em' }}>
          Progress isn't being saved in this context — the lesson still works in full.
        </p>
      )}

      {complete && unlocks.length > 0 && (
        <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--color-rule)' }}>
          <span className="hud-label" style={{ display: 'block', marginBottom: 9 }}>this unlocks</span>
          <div style={{ display: 'grid', gap: 8 }}>
            {unlocks.map((u) => (
              <a key={u.url} href={u.url} className="hud"
                 style={{ padding: '10px 13px', textDecoration: 'none', display: 'block' }}>
                <span style={{ color: 'var(--color-cyan)', display: 'block' }}>{u.title}</span>
                <span style={{ color: 'var(--color-ink-faint)', fontSize: '0.85rem' }}>{u.blurb}</span>
              </a>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
