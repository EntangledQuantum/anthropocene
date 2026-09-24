import { useEffect, useState } from 'react';
import { db } from '../../lib/db/client.ts';
import { lessonStates } from '../../lib/db/progress.ts';

/* ─────────────────────────────────────────────────────────────────────────
   A path rendered as a numbered table of contents with your place marked.

   Thesis §4 Layer D: the map must answer "you are here" and "what next". So
   the list stays plain and calm, and only three things carry signal: a check
   on what you finished, a "continue" marker on the one lesson to do next, and
   dimmed rows for chapters not yet written.

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

export default function PathJourney({ chapters }: PathJourneyProps) {
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
  const pct = all.length ? (completed / all.length) * 100 : 0;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 28 }}>
        <span style={{ fontSize: 14.5, color: 'var(--color-ink-soft)', whiteSpace: 'nowrap' }}>
          {completed} of {all.length} lessons complete
        </span>
        <span style={{ flex: 1, height: 4, borderRadius: 2, background: 'var(--color-rule)', overflow: 'hidden' }}>
          <span style={{
            display: 'block', height: '100%', width: `${pct}%`,
            background: 'var(--iridescent)', transition: 'width 500ms ease',
          }} />
        </span>
      </div>

      <ol className="toc">
        {chapters.map((chapter, ci) => {
          const empty = chapter.lessons.length === 0;
          return (
            <li key={chapter.id} style={{ opacity: empty ? 0.5 : 1 }}>
              <div className="toc-row" style={{ paddingBottom: empty ? 14 : 6 }}>
                <span className="toc-num">{ci + 1}.</span>
                <span>
                  {empty ? (
                    <span className="toc-title" style={{ fontFamily: 'var(--font-display)', fontSize: '1.3rem', color: 'var(--color-ink-soft)' }}>
                      {chapter.title}
                    </span>
                  ) : (
                    <a href={chapter.url} className="toc-title" style={{ fontFamily: 'var(--font-display)', fontSize: '1.4rem', textDecoration: 'none' }}>
                      {chapter.title}
                    </a>
                  )}
                  {chapter.question && !empty && (
                    <span className="toc-sub" style={{ fontFamily: 'var(--font-display)', fontStyle: 'italic', fontSize: '1.06rem' }}>
                      {chapter.question}
                    </span>
                  )}
                </span>
                <span className="toc-side">{empty ? 'Coming later' : ''}</span>
              </div>

              {!empty && (
                <ul className="lesson-list" style={{ paddingLeft: 56, marginBottom: 12 }}>
                  {chapter.lessons.map((lesson) => {
                    const isDone = done.has(lesson.id);
                    const isNext = ready && lesson.id === nextId;
                    return (
                      <li key={lesson.id}>
                        <a
                          href={lesson.url}
                          style={{
                            alignItems: 'center',
                            color: isNext ? 'var(--color-ink)' : undefined,
                          }}
                        >
                          <span
                            aria-hidden="true"
                            style={{
                              width: 16, height: 16, flexShrink: 0, borderRadius: '50%',
                              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                              fontSize: 10, lineHeight: 1,
                              border: isDone ? 'none' : `1.5px solid ${isNext ? 'var(--color-accent)' : 'var(--color-rule-bright)'}`,
                              background: isDone ? 'var(--color-accent)' : 'transparent',
                              color: '#16121f',
                            }}
                          >
                            {isDone ? '✓' : ''}
                          </span>
                          <span style={{ flex: 1, minWidth: 0 }}>
                            {lesson.title}
                            {lesson.status === 'draft' && (
                              <span style={{ marginLeft: 10, fontSize: 12.5, color: 'var(--sig-warn)' }}>Draft</span>
                            )}
                          </span>
                          {isNext && (
                            <span style={{
                              fontSize: 12.5, fontWeight: 600, color: '#16121f',
                              background: 'var(--color-accent)', borderRadius: 999, padding: '1px 9px',
                            }}>
                              {completed > 0 ? 'Continue' : 'Start here'}
                            </span>
                          )}
                          <span style={{ fontSize: 13.5, color: 'var(--color-ink-ghost)', whiteSpace: 'nowrap' }}>
                            {lesson.minutes} min
                          </span>
                        </a>
                      </li>
                    );
                  })}
                </ul>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
