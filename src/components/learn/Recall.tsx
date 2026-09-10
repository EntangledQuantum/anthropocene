import { useEffect, useState, type ReactNode } from 'react';
import { Button, Panel } from '../viz/controls.tsx';
import { lesson } from '../../lib/lesson-store.ts';
import { ensureCard } from '../../lib/srs/scheduler.ts';

export interface RecallProps {
  /** Stable id — changing it creates a NEW card and loses its schedule. */
  id: string;
  /** The concept this card interrogates, for mastery roll-ups. */
  concept?: string;
  /** Supplied by Astro's named `front` slot — see widgets/Recall.astro.
   *  Optional in the type because MDX authors write it as a slot, not a prop. */
  front?: ReactNode;
  children: ReactNode;
}

/**
 * A spaced-repetition card authored inline, at the exact point in the lesson
 * where the idea appears.
 *
 * Writing cards in context produces better cards than harvesting them
 * afterwards: the question can lean on the diagram just above it, and the
 * author is still holding the thought. Reviews are scheduled by FSRS-6 and
 * surfaced on /review.
 */
export default function Recall({ id, concept, front, children }: RecallProps) {
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    // Registering here (rather than on the review page) means a card starts
    // its schedule the moment the learner first meets the idea.
    const lessonId = lesson.meta?.id;
    if (lessonId) void ensureCard(id, lessonId, concept);
  }, [id, concept]);

  return (
    <div className="not-prose" style={{ margin: '1.75rem 0' }}>
      <Panel
        title="recall"
        right={<span className="hud-label" style={{ color: 'var(--color-iris)' }}>scheduled for review</span>}
      >
        <div style={{ color: 'var(--color-ink)', fontSize: '1rem', lineHeight: 1.6 }}>{front}</div>

        {revealed ? (
          <div
            className="prose-anth"
            style={{
              marginTop: 12, paddingTop: 12,
              borderTop: '1px solid var(--color-rule)', maxWidth: 'none',
            }}
          >
            {children}
          </div>
        ) : (
          <div style={{ marginTop: 12 }}>
            <Button onClick={() => setRevealed(true)} accent="iris">reveal</Button>
          </div>
        )}
      </Panel>
    </div>
  );
}
