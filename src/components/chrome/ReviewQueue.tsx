import { useCallback, useEffect, useState } from 'react';
import { Button, Panel, Readout, ReadoutRow } from '../viz/controls.tsx';
import { db } from '../../lib/db/client.ts';
import { summary, type ProgressSummary } from '../../lib/db/progress.ts';
import { allCards, dueCards, grade, humanInterval, preview, Rating, State, type Grade, type StoredCard } from '../../lib/srs/scheduler.ts';

interface CardMeta {
  cardId: string;
  lessonTitle: string;
  lessonUrl: string;
  conceptTitle?: string;
  conceptBlurb?: string;
}

/**
 * The review session.
 *
 * Cards are authored inline in lessons, so the queue does not hold their text —
 * it holds the schedule. Reviewing sends you to the idea in its original
 * context, which is where it will actually be re-understood rather than
 * re-memorised.
 */
export default function ReviewQueue({ meta }: { meta: Record<string, CardMeta> }) {
  const [queue, setQueue] = useState<StoredCard[] | null>(null);
  const [all, setAll] = useState<StoredCard[]>([]);
  const [i, setI] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [stats, setStats] = useState<ProgressSummary | null>(null);
  const [done, setDone] = useState(0);

  const load = useCallback(async () => {
    await db.open();
    if (!db.available) { setQueue([]); return; }
    const [d, a, s] = await Promise.all([dueCards(), allCards(), summary()]);
    setQueue(d); setAll(a); setStats(s); setI(0); setRevealed(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  if (queue === null) {
    return <Panel title="review"><span className="hud-label">loading…</span></Panel>;
  }

  if (!db.available) {
    // Distinguish the causes: the single-tab lock is recoverable in one click,
    // whereas "unavailable" reads as permanent and sends people away.
    const locked = db.status === 'locked';
    return (
      <Panel title="review">
        <p style={{ margin: '0 0 8px', color: 'var(--sig-warn)', fontSize: '1.02rem', lineHeight: 1.6 }}>
          {locked
            ? 'Your progress database is open in another tab.'
            : 'This browser context cannot store progress.'}
        </p>
        <p style={{ margin: 0, color: 'var(--color-ink-soft)', fontSize: '0.98rem', lineHeight: 1.6 }}>
          {locked
            ? 'Only one tab can hold it at a time. Close the other tab and reload this one.'
            : 'Private windows and blocked site data both do this. Lessons still work in full — only progress tracking needs the database.'}
        </p>
        {locked && (
          <div style={{ marginTop: 14 }}>
            <Button accent="magenta" onClick={() => location.reload()}>reload</Button>
          </div>
        )}
      </Panel>
    );
  }

  const card = queue[i];
  const upcoming = all.filter((c) => c.card.due.getTime() > Date.now()).length;

  const rate = async (r: Grade) => {
    if (!card) return;
    await grade(card.cardId, r);
    setDone((n) => n + 1);
    setRevealed(false);
    if (i + 1 < queue.length) setI(i + 1);
    else await load();
    setStats(await summary());
  };

  if (!card) {
    return (
      <>
        <Panel title="review">
          <p style={{ margin: '0 0 6px', fontSize: '1.1rem', color: 'var(--sig-ok)' }}>
            {done > 0 ? `Queue cleared — ${done} card${done === 1 ? '' : 's'} reviewed.` : 'Nothing due right now.'}
          </p>
          <p style={{ margin: 0, color: 'var(--color-ink-faint)', fontSize: '0.94rem' }}>
            {all.length === 0
              ? 'Cards are created as you meet them in lessons. Read a lesson and they will appear here.'
              : `${upcoming} card${upcoming === 1 ? '' : 's'} scheduled for later.`}
          </p>
        </Panel>
        {stats && <Stats stats={stats} total={all.length} />}
      </>
    );
  }

  const m = meta[card.cardId];
  const options = preview(card.card);
  const stateLabel = State[card.card.state];

  return (
    <>
      <Panel
        title={`review — ${i + 1} of ${queue.length}`}
        right={<span className="hud-label" style={{ color: 'var(--color-iris)' }}>{stateLabel.toLowerCase()}</span>}
      >
        {m ? (
          <>
            <span className="hud-label" style={{ display: 'block', marginBottom: 8 }}>{m.lessonTitle}</span>
            <h2 style={{ margin: '0 0 10px', fontSize: '1.35rem', color: 'var(--color-ink)' }}>
              {m.conceptTitle ?? card.cardId}
            </h2>

            {revealed ? (
              <>
                <p style={{ margin: '0 0 14px', color: 'var(--color-ink-soft)', lineHeight: 1.65 }}>
                  {m.conceptBlurb}
                </p>
                <a href={m.lessonUrl} className="anth-btn hud-label" style={{ textDecoration: 'none', display: 'inline-block' }}>
                  open the lesson →
                </a>
              </>
            ) : (
              <p style={{ margin: '0 0 14px', color: 'var(--color-ink-faint)', lineHeight: 1.65 }}>
                Recall what this means and why it matters, then reveal.
              </p>
            )}
          </>
        ) : (
          <p style={{ margin: 0, color: 'var(--color-ink-faint)' }}>
            {card.cardId} — this card's lesson is no longer in the content.
          </p>
        )}

        <div style={{ marginTop: 18, paddingTop: 14, borderTop: '1px solid var(--color-rule)' }}>
          {!revealed ? (
            <Button accent="iris" onClick={() => setRevealed(true)}>reveal</Button>
          ) : (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {options.map((o) => (
                <Button
                  key={o.rating}
                  accent={o.rating === Rating.Again ? 'magenta' : o.rating === Rating.Hard ? 'warn' : o.rating === Rating.Good ? 'cyan' : 'ok'}
                  onClick={() => void rate(o.rating)}
                  title={`next review in ${humanInterval(new Date(), o.due)}`}
                >
                  {o.label.toLowerCase()} · {humanInterval(new Date(), o.due)}
                </Button>
              ))}
            </div>
          )}
        </div>
      </Panel>
      {stats && <Stats stats={stats} total={all.length} />}
    </>
  );
}

function Stats({ stats, total }: { stats: ProgressSummary; total: number }) {
  return (
    <div style={{ marginTop: 16 }}>
      <Panel title="you">
        <ReadoutRow>
          <Readout label="streak" value={`${stats.streak} d`} accent="magenta" />
          <Readout label="today" value={`${stats.todayXp} / ${stats.goal} xp`} accent={stats.todayXp >= stats.goal ? 'ok' : 'cyan'} />
          <Readout label="total xp" value={stats.totalXp.toLocaleString()} />
          <Readout label="level" value={`${stats.level} · ${stats.levelXp}/${stats.nextLevelXp}`} accent="iris" />
          <Readout label="lessons done" value={String(stats.lessonsComplete)} />
          <Readout label="cards" value={String(total)} />
          <Readout label="longest streak" value={`${stats.longestStreak} d`} />
        </ReadoutRow>
      </Panel>
    </div>
  );
}
