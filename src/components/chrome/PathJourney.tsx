import { useEffect, useState } from 'react';
import { db } from '../../lib/db/client.ts';
import { lessonStates } from '../../lib/db/progress.ts';

/* ─────────────────────────────────────────────────────────────────────────
   A path rendered as a route you travel, not a table of contents.

   Thesis §4 Layer D: the map must answer "you are here" and "what next".
   A flat list of links answers neither — every row looks identical, nothing
   indicates position, and completing one changes nothing visible. The spine
   makes progress a place: the thread lights up behind you, the next stop is
   the only one ringed, and everything ahead stays quiet.

   Progress is read from the local database, so this is a client island. It
   degrades to "nothing completed yet" when storage is unavailable, which is
   the correct reading of an empty database anyway.
   ───────────────────────────────────────────────────────────────────────── */

export interface JourneyLesson {
  id: string;
  title: string;
  blurb: string;
  url: string;
  minutes: number;
  tier: string;
  status: string;
}

export interface JourneyChapter {
  id: string;
  title: string;
  question?: string;
  url: string;
  lessons: JourneyLesson[];
}

export interface PathJourneyProps {
  chapters: JourneyChapter[];
  accent: string;
}

const TIER_LABEL: Record<string, string> = {
  foundation: 'foundation',
  core: 'core',
  advanced: 'advanced',
  frontier: 'frontier',
};

export default function PathJourney({ chapters, accent }: PathJourneyProps) {
  const [done, setDone] = useState<Set<string>>(new Set());
  const [ready, setReady] = useState(false);

  useEffect(() => {
    void (async () => {
      await db.open();
      if (db.available) {
        const states = await lessonStates();
        const complete = new Set<string>();
        for (const [lessonId, tiers] of states) {
          if (tiers.some((t) => t.state === 'complete')) complete.add(lessonId);
        }
        setDone(complete);
      }
      setReady(true);
    })();
  }, []);

  const all = chapters.flatMap((c) => c.lessons);
  // The next stop is the first unfinished lesson in reading order — the one
  // question a returning learner actually has.
  const nextId = all.find((l) => !done.has(l.id))?.id ?? null;
  const completed = all.filter((l) => done.has(l.id)).length;

  const tone = `var(--color-${accent})`;

  return (
    <div style={{ position: 'relative' }}>
      {/* progress summary */}
      <div
        style={{
          display: 'flex', alignItems: 'baseline', gap: 16, flexWrap: 'wrap',
          marginBottom: 40, paddingBottom: 18, borderBottom: '1px solid var(--color-rule)',
        }}
      >
        <span className="readout" style={{ fontSize: '2rem', color: tone, lineHeight: 1 }}>
          {completed}
          <span style={{ color: 'var(--color-ink-ghost)', fontSize: '1.2rem' }}>/{all.length}</span>
        </span>
        <span className="hud-label">lessons complete</span>
        <span style={{ flex: 1, minWidth: 120, height: 2, background: 'var(--color-rule-bright)', position: 'relative', overflow: 'hidden' }}>
          <span style={{
            position: 'absolute', inset: 0,
            width: `${all.length ? (completed / all.length) * 100 : 0}%`,
            background: 'var(--iridescent)',
            boxShadow: `0 0 14px ${tone}`,
            transition: 'width 500ms ease',
          }} />
        </span>
      </div>

      {chapters.map((chapter, ci) => (
        <section key={chapter.id} style={{ position: 'relative', marginBottom: 8 }}>
          {/* chapter marker */}
          <div style={{ display: 'flex', gap: 26, alignItems: 'flex-start', marginBottom: 26 }}>
            <div style={{ position: 'relative', width: 22, flexShrink: 0, display: 'flex', justifyContent: 'center', paddingTop: 4 }}>
              <span style={{
                width: 11, height: 11, transform: 'rotate(45deg)',
                background: tone, boxShadow: `0 0 18px ${tone}`, flexShrink: 0,
              }} />
              {/* thread continuing down through this chapter's stops */}
              <span style={{
                position: 'absolute', top: 20, bottom: -30, left: '50%', width: 1,
                background: 'var(--color-rule-bright)', transform: 'translateX(-50%)',
              }} />
            </div>
            <div style={{ flex: 1, minWidth: 0, paddingBottom: 4 }}>
              <span className="hud-label" style={{ color: tone }}>
                chapter {String(ci + 1).padStart(2, '0')}
              </span>
              <h2 style={{ margin: '7px 0 0', fontSize: '1.5rem' }}>
                <a href={chapter.url} style={{ color: 'var(--color-ink)', textDecoration: 'none' }}>{chapter.title}</a>
              </h2>
              {chapter.question && (
                <p style={{
                  margin: '9px 0 0', fontFamily: 'var(--font-display)', fontSize: '1.05rem',
                  color: 'var(--color-ink-soft)', lineHeight: 1.5, maxWidth: '54ch',
                }}>
                  {chapter.question}
                </p>
              )}
            </div>
          </div>

          {/* stops */}
          {chapter.lessons.length === 0 ? (
            <div style={{ display: 'flex', gap: 26, alignItems: 'center', paddingBottom: 34 }}>
              <div style={{ width: 22, display: 'flex', justifyContent: 'center', position: 'relative', flexShrink: 0 }}>
                <span style={{ position: 'absolute', top: -30, bottom: -34, left: '50%', width: 1, background: 'var(--color-rule)', transform: 'translateX(-50%)' }} />
                <span style={{ width: 7, height: 7, borderRadius: '50%', border: '1px dashed var(--color-ink-ghost)', background: 'var(--color-void)', zIndex: 1 }} />
              </div>
              <span className="hud-label" style={{ color: 'var(--color-ink-ghost)' }}>outlined — not yet written</span>
            </div>
          ) : chapter.lessons.map((lesson, li) => {
            const isDone = done.has(lesson.id);
            const isNext = lesson.id === nextId;
            const last = ci === chapters.length - 1 && li === chapter.lessons.length - 1;

            return (
              <a
                key={lesson.id}
                href={lesson.url}
                style={{
                  display: 'flex', gap: 26, alignItems: 'stretch',
                  textDecoration: 'none', position: 'relative',
                }}
              >
                {/* the thread + this stop's node */}
                <div style={{ width: 22, flexShrink: 0, display: 'flex', justifyContent: 'center', position: 'relative' }}>
                  <span style={{
                    position: 'absolute', top: 0, bottom: last ? '50%' : 0, left: '50%', width: 1,
                    transform: 'translateX(-50%)',
                    background: isDone ? tone : 'var(--color-rule-bright)',
                    opacity: isDone ? 0.7 : 1,
                  }} />
                  <span style={{
                    position: 'absolute', top: 28, width: isDone || isNext ? 13 : 9, height: isDone || isNext ? 13 : 9,
                    borderRadius: '50%', zIndex: 1,
                    background: isDone ? tone : 'var(--color-void)',
                    border: isDone ? 'none' : `1px solid ${isNext ? tone : 'var(--color-rule-bright)'}`,
                    boxShadow: isDone ? `0 0 16px ${tone}` : isNext ? `0 0 0 4px color-mix(in oklab, ${tone} 18%, transparent)` : 'none',
                    transition: 'all 260ms ease',
                  }} />
                </div>

                <div
                  className="hud"
                  style={{
                    flex: 1, minWidth: 0, padding: '18px 22px', marginBottom: 18,
                    borderColor: isNext ? tone : 'var(--color-rule)',
                    background: isNext
                      ? `color-mix(in oklab, ${tone} 6%, var(--glass))`
                      : 'var(--glass)',
                    opacity: isDone ? 0.78 : 1,
                  }}
                >
                  <div style={{ display: 'flex', gap: 12, alignItems: 'baseline', flexWrap: 'wrap', marginBottom: 7 }}>
                    {isNext && ready && (
                      <span className="hud-label" style={{ color: tone }}>start here</span>
                    )}
                    {isDone && <span className="hud-label" style={{ color: 'var(--sig-ok)' }}>done</span>}
                    <span style={{
                      fontFamily: 'var(--font-display)', fontWeight: 600,
                      fontSize: '1.18rem', color: 'var(--color-ink)',
                    }}>
                      {lesson.title}
                    </span>
                  </div>

                  <p style={{
                    margin: '0 0 12px', color: 'var(--color-ink-soft)',
                    fontSize: '1rem', lineHeight: 1.6, maxWidth: '58ch',
                  }}>
                    {lesson.blurb}
                  </p>

                  <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'baseline' }}>
                    <span className="hud-label">{TIER_LABEL[lesson.tier] ?? lesson.tier}</span>
                    <span className="hud-label">{lesson.minutes} min</span>
                    {lesson.status === 'draft' && (
                      <span className="hud-label" style={{ color: 'var(--sig-warn)' }}>draft</span>
                    )}
                  </div>
                </div>
              </a>
            );
          })}
        </section>
      ))}

      {/* the end of the road */}
      <div style={{ display: 'flex', gap: 26, alignItems: 'center', marginTop: -8 }}>
        <div style={{ width: 22, display: 'flex', justifyContent: 'center', flexShrink: 0 }}>
          <span style={{
            width: 9, height: 9, transform: 'rotate(45deg)',
            border: `1px solid var(--color-ink-ghost)`, background: 'var(--color-void)',
          }} />
        </div>
        <span className="hud-label" style={{ color: 'var(--color-ink-ghost)' }}>
          end of the written path — more in LEARNING-PLAN.md
        </span>
      </div>
    </div>
  );
}
