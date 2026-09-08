import {
  createEmptyCard, fsrs, generatorParameters, Rating, State,
  type Card, type Grade,
} from 'ts-fsrs';
import { db, localDay } from '../db/client.ts';
import { notifyProgressChange, XP } from '../db/progress.ts';

/**
 * Spaced repetition over FSRS-6.
 *
 * The cards are not flashcards in the Anki sense: a review item can be any
 * `<Recall>` authored inline in a lesson, including an interactive one. What
 * FSRS schedules is the *concept*, and the widget is just how we ask about it.
 */

const params = generatorParameters({
  enable_fuzz: true,
  enable_short_term: true,
  request_retention: 0.9,
});

const scheduler = fsrs(params);

export interface StoredCard {
  cardId: string;
  lessonId: string;
  conceptId: string | null;
  card: Card;
}

type Row = {
  card_id: string; lesson_id: string; concept_id: string | null;
  due: number; stability: number; difficulty: number;
  elapsed_days: number; scheduled_days: number; learning_steps: number;
  reps: number; lapses: number; state: number; last_review: number | null;
};

const toCard = (r: Row): Card => ({
  due: new Date(r.due),
  stability: r.stability,
  difficulty: r.difficulty,
  elapsed_days: r.elapsed_days,
  scheduled_days: r.scheduled_days,
  learning_steps: r.learning_steps,
  reps: r.reps,
  lapses: r.lapses,
  state: r.state as State,
  last_review: r.last_review ? new Date(r.last_review) : undefined,
});

const fromRow = (r: Row): StoredCard => ({
  cardId: r.card_id,
  lessonId: r.lesson_id,
  conceptId: r.concept_id,
  card: toCard(r),
});

async function upsert(cardId: string, lessonId: string, conceptId: string | null, card: Card): Promise<void> {
  await db.exec(
    `INSERT INTO review_cards
       (card_id, lesson_id, concept_id, due, stability, difficulty, elapsed_days,
        scheduled_days, learning_steps, reps, lapses, state, last_review)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
     ON CONFLICT(card_id) DO UPDATE SET
       due=excluded.due, stability=excluded.stability, difficulty=excluded.difficulty,
       elapsed_days=excluded.elapsed_days, scheduled_days=excluded.scheduled_days,
       learning_steps=excluded.learning_steps, reps=excluded.reps, lapses=excluded.lapses,
       state=excluded.state, last_review=excluded.last_review`,
    [
      cardId, lessonId, conceptId, card.due.getTime(), card.stability, card.difficulty,
      card.elapsed_days, card.scheduled_days, card.learning_steps, card.reps, card.lapses,
      card.state, card.last_review ? card.last_review.getTime() : null,
    ],
  );
}

/** Registers a card the first time its lesson is opened. Existing scheduling
 *  is never clobbered — re-reading a lesson must not reset your intervals. */
export async function ensureCard(cardId: string, lessonId: string, conceptId?: string): Promise<void> {
  const existing = await db.query<{ card_id: string }>(
    `SELECT card_id FROM review_cards WHERE card_id = ?`, [cardId],
  );
  if (existing.length) return;
  await upsert(cardId, lessonId, conceptId ?? null, createEmptyCard(new Date()));
}

export async function dueCards(limit = 60, now = Date.now()): Promise<StoredCard[]> {
  const rows = await db.query<Row>(
    `SELECT * FROM review_cards WHERE due <= ? ORDER BY due ASC LIMIT ?`, [now, limit],
  );
  return rows.map(fromRow);
}

export async function allCards(): Promise<StoredCard[]> {
  return (await db.query<Row>(`SELECT * FROM review_cards ORDER BY due ASC`)).map(fromRow);
}

export interface GradeResult { nextDue: Date; scheduledDays: number; awarded: number }

/** Applies a grade, persists the new schedule and the log, and awards XP. */
export async function grade(cardId: string, rating: Grade, now = new Date()): Promise<GradeResult | null> {
  const rows = await db.query<Row>(`SELECT * FROM review_cards WHERE card_id = ?`, [cardId]);
  if (!rows.length) return null;

  const row = rows[0];
  const { card, log } = scheduler.next(toCard(row), now, rating);

  const amount = rating === Rating.Again ? XP.reviewCardLapse : XP.reviewCard;
  const ts = now.getTime();

  await db.batch([
    {
      sql: `UPDATE review_cards SET due=?, stability=?, difficulty=?, elapsed_days=?,
              scheduled_days=?, learning_steps=?, reps=?, lapses=?, state=?, last_review=?
            WHERE card_id=?`,
      params: [
        card.due.getTime(), card.stability, card.difficulty, card.elapsed_days,
        card.scheduled_days, card.learning_steps, card.reps, card.lapses, card.state,
        card.last_review ? card.last_review.getTime() : ts, cardId,
      ],
    },
    {
      sql: `INSERT INTO review_log (card_id, ts, rating, state, due, stability, difficulty,
              elapsed_days, last_elapsed_days, scheduled_days)
            VALUES (?,?,?,?,?,?,?,?,?,?)`,
      params: [
        cardId, ts, log.rating, log.state, log.due.getTime(), log.stability, log.difficulty,
        log.elapsed_days, log.last_elapsed_days, log.scheduled_days,
      ],
    },
    {
      sql: `INSERT INTO xp_events (ts, day, lesson_id, widget_id, kind, amount) VALUES (?,?,?,?,'review',?)`,
      params: [ts, localDay(ts), row.lesson_id, cardId, amount],
    },
  ]);

  notifyProgressChange();
  return { nextDue: card.due, scheduledDays: card.scheduled_days, awarded: amount };
}

/** What each button would do, so the UI can show real intervals rather than
 *  "Again / Hard / Good / Easy" with no consequence attached. */
export function preview(card: Card, now = new Date()) {
  const log = scheduler.repeat(card, now);
  return ([Rating.Again, Rating.Hard, Rating.Good, Rating.Easy] as Grade[]).map((r) => ({
    rating: r,
    label: Rating[r],
    due: log[r].card.due,
    days: log[r].card.scheduled_days,
  }));
}

export { Rating, State };
export type { Card, Grade };

/** Human interval, e.g. "3 d", "2 mo". */
export function humanInterval(from: Date, to: Date): string {
  const mins = Math.max(0, (to.getTime() - from.getTime()) / 60000);
  if (mins < 60) return `${Math.round(mins)} min`;
  const hours = mins / 60;
  if (hours < 24) return `${Math.round(hours)} h`;
  const days = hours / 24;
  if (days < 30) return `${Math.round(days)} d`;
  const months = days / 30.44;
  return months < 12 ? `${months.toFixed(1)} mo` : `${(months / 12).toFixed(1)} y`;
}
