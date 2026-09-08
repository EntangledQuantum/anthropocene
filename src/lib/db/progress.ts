import { db, localDay } from './client.ts';

/* ── change signal ─────────────────────────────────────────────────────────
   Any surface showing derived stats (the header rail, the review page) needs
   to know when something was written. Writes happen from several unrelated
   places — lesson widgets, the review queue — so a single module-level signal
   is what keeps them in sync without coupling those places to each other.
   ──────────────────────────────────────────────────────────────────────── */
const progressListeners = new Set<() => void>();

export function onProgressChange(fn: () => void): () => void {
  progressListeners.add(fn);
  return () => progressListeners.delete(fn);
}

export function notifyProgressChange(): void {
  for (const fn of progressListeners) fn();
}

/* ── XP economy ────────────────────────────────────────────────────────────
   Deliberately modest and non-inflationary: XP tracks focused effort, not
   clicks. Getting something right on the first try is worth more than
   grinding a widget until it passes, and review is worth as much as new
   material because retention is the actual goal.
   ──────────────────────────────────────────────────────────────────────── */
export const XP = {
  widgetFirstTry: 12,
  widgetAfterRetry: 6,
  widgetExplore: 4,
  lessonComplete: 30,
  reviewCard: 8,
  reviewCardLapse: 3,
} as const;

export const DEFAULT_DAILY_GOAL = 60;

export interface DailyStat { day: string; xp: number }

export interface ProgressSummary {
  totalXp: number;
  todayXp: number;
  goal: number;
  streak: number;
  longestStreak: number;
  level: number;
  levelXp: number;
  nextLevelXp: number;
  recent: DailyStat[];
  lessonsComplete: number;
  dueCount: number;
}

/** Level curve: each level costs ~15% more than the last. Slow enough that
 *  level is a real signal, fast enough to be visible in week one. */
export function levelFor(totalXp: number): { level: number; into: number; next: number } {
  let level = 1;
  let cost = 120;
  let remaining = totalXp;
  while (remaining >= cost) {
    remaining -= cost;
    level += 1;
    cost = Math.round(cost * 1.15);
  }
  return { level, into: remaining, next: cost };
}

export async function awardXp(
  amount: number,
  kind: 'widget' | 'lesson' | 'review' | 'explore',
  lessonId?: string,
  widgetId?: string,
): Promise<void> {
  const ts = Date.now();
  await db.exec(
    `INSERT INTO xp_events (ts, day, lesson_id, widget_id, kind, amount) VALUES (?,?,?,?,?,?)`,
    [ts, localDay(ts), lessonId ?? null, widgetId ?? null, kind, amount],
  );
  notifyProgressChange();
}

/** Records one widget interaction and its XP in a single transaction, so a
 *  half-write can never award XP for an attempt that was not stored. */
export async function recordAttempt(opts: {
  lessonId: string;
  widgetId: string;
  widgetKind: string;
  correct: boolean;
  firstTry: boolean;
  detail?: unknown;
  xp?: number;
}): Promise<void> {
  const ts = Date.now();
  const amount = opts.correct
    ? opts.xp ?? (opts.firstTry ? XP.widgetFirstTry : XP.widgetAfterRetry)
    : 0;

  const batch: { sql: string; params?: unknown[] }[] = [
    {
      sql: `INSERT INTO attempts (ts, lesson_id, widget_id, widget_kind, correct, detail) VALUES (?,?,?,?,?,?)`,
      params: [ts, opts.lessonId, opts.widgetId, opts.widgetKind, opts.correct ? 1 : 0, opts.detail ? JSON.stringify(opts.detail) : null],
    },
  ];

  if (amount > 0) {
    batch.push({
      sql: `INSERT INTO xp_events (ts, day, lesson_id, widget_id, kind, amount) VALUES (?,?,?,?,?,?)`,
      params: [ts, localDay(ts), opts.lessonId, opts.widgetId, 'widget', amount],
    });
  }
  await db.batch(batch);
  notifyProgressChange();
}

/** Has this widget already been solved? Used to render a completed widget as
 *  solved on revisit, and to stop XP being awarded twice for the same thing. */
export async function solvedWidgets(lessonId: string): Promise<Set<string>> {
  const rows = await db.query<{ widget_id: string }>(
    `SELECT DISTINCT widget_id FROM attempts WHERE lesson_id = ? AND correct = 1`,
    [lessonId],
  );
  return new Set(rows.map((r) => r.widget_id));
}

export async function touchLesson(lessonId: string, tier: string, widgetsTotal: number): Promise<void> {
  const ts = Date.now();
  await db.exec(
    `INSERT INTO lesson_progress (lesson_id, tier, state, widgets_total, first_seen, last_seen)
     VALUES (?,?,'started',?,?,?)
     ON CONFLICT(lesson_id, tier) DO UPDATE SET last_seen = excluded.last_seen,
                                                widgets_total = excluded.widgets_total`,
    [lessonId, tier, widgetsTotal, ts, ts],
  );
}

export async function completeLesson(lessonId: string, tier: string, widgetsDone: number): Promise<boolean> {
  const existing = await db.query<{ state: string }>(
    `SELECT state FROM lesson_progress WHERE lesson_id = ? AND tier = ?`,
    [lessonId, tier],
  );
  if (existing[0]?.state === 'complete') return false;   // no double-award

  const ts = Date.now();
  await db.batch([
    {
      sql: `INSERT INTO lesson_progress (lesson_id, tier, state, widgets_done, first_seen, last_seen, completed_at)
            VALUES (?,?,'complete',?,?,?,?)
            ON CONFLICT(lesson_id, tier) DO UPDATE SET state='complete', widgets_done=excluded.widgets_done,
                                                       last_seen=excluded.last_seen, completed_at=excluded.completed_at`,
      params: [lessonId, tier, widgetsDone, ts, ts, ts],
    },
    {
      sql: `INSERT INTO xp_events (ts, day, lesson_id, kind, amount) VALUES (?,?,?,'lesson',?)`,
      params: [ts, localDay(ts), lessonId, XP.lessonComplete],
    },
  ]);
  notifyProgressChange();
  return true;
}

export async function lessonStates(): Promise<Map<string, { tier: string; state: string }[]>> {
  const rows = await db.query<{ lesson_id: string; tier: string; state: string }>(
    `SELECT lesson_id, tier, state FROM lesson_progress`,
  );
  const out = new Map<string, { tier: string; state: string }[]>();
  for (const r of rows) {
    const list = out.get(r.lesson_id) ?? [];
    list.push({ tier: r.tier, state: r.state });
    out.set(r.lesson_id, list);
  }
  return out;
}

/* ── streaks ───────────────────────────────────────────────────────────────
   Computed from the day column of xp_events rather than stored, so it can
   never drift out of sync with the history. A day counts once the learner has
   earned any XP at all; the daily GOAL is a separate, softer target.
   ──────────────────────────────────────────────────────────────────────── */

export function streakFrom(days: string[], today = localDay()): { current: number; longest: number } {
  if (days.length === 0) return { current: 0, longest: 0 };

  const set = new Set(days);
  const sorted = [...set].sort();

  const dayMs = 86_400_000;
  const parse = (s: string) => {
    const [y, m, d] = s.split('-').map(Number);
    return new Date(y, m - 1, d).getTime();
  };
  const fmt = (ms: number) => localDay(ms);

  // Current streak counts back from today, or from yesterday if today is
  // still empty — an unfinished day should not read as a broken streak.
  let cursor = set.has(today) ? parse(today) : parse(today) - dayMs;
  let current = 0;
  while (set.has(fmt(cursor))) {
    current += 1;
    cursor -= dayMs;
  }

  let longest = 1;
  let run = 1;
  for (let i = 1; i < sorted.length; i++) {
    run = parse(sorted[i]) - parse(sorted[i - 1]) === dayMs ? run + 1 : 1;
    longest = Math.max(longest, run);
  }
  return { current, longest: Math.max(longest, current) };
}

export async function summary(): Promise<ProgressSummary> {
  const [totals, byDay, lessons, due, goalRow] = await Promise.all([
    db.query<{ total: number }>(`SELECT COALESCE(SUM(amount),0) AS total FROM xp_events`),
    db.query<{ day: string; xp: number }>(
      `SELECT day, SUM(amount) AS xp FROM xp_events GROUP BY day ORDER BY day`,
    ),
    db.query<{ n: number }>(`SELECT COUNT(*) AS n FROM lesson_progress WHERE state='complete'`),
    db.query<{ n: number }>(`SELECT COUNT(*) AS n FROM review_cards WHERE due <= ?`, [Date.now()]),
    db.query<{ value: string }>(`SELECT value FROM settings WHERE key='daily_goal'`),
  ]);

  const today = localDay();
  const totalXp = Number(totals[0]?.total ?? 0);
  const { level, into, next } = levelFor(totalXp);
  const { current, longest } = streakFrom(byDay.map((r) => r.day), today);

  return {
    totalXp,
    todayXp: Number(byDay.find((r) => r.day === today)?.xp ?? 0),
    goal: Number(goalRow[0]?.value ?? DEFAULT_DAILY_GOAL),
    streak: current,
    longestStreak: longest,
    level,
    levelXp: into,
    nextLevelXp: next,
    recent: byDay.slice(-90).map((r) => ({ day: r.day, xp: Number(r.xp) })),
    lessonsComplete: Number(lessons[0]?.n ?? 0),
    dueCount: Number(due[0]?.n ?? 0),
  };
}

export async function setDailyGoal(goal: number): Promise<void> {
  await db.exec(
    `INSERT INTO settings (key, value) VALUES ('daily_goal', ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [String(goal)],
  );
}
