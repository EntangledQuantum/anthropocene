-- anthropocene local progress store.
--
-- Everything here lives in the learner's browser (OPFS) and never leaves it.
-- `xp_events` is append-only: streaks, levels, daily totals and per-path
-- mastery are all DERIVED from it, so no aggregate can silently disagree with
-- the history that produced it.

PRAGMA journal_mode = MEMORY;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS xp_events (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  ts          INTEGER NOT NULL,             -- epoch ms
  day         TEXT    NOT NULL,             -- local YYYY-MM-DD, for streaks
  lesson_id   TEXT,
  widget_id   TEXT,
  kind        TEXT    NOT NULL,             -- widget | lesson | review | explore
  amount      INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS xp_events_day    ON xp_events(day);
CREATE INDEX IF NOT EXISTS xp_events_lesson ON xp_events(lesson_id);

-- One row per (lesson, tier). A lesson can be core-complete and
-- advanced-untouched at the same time; a single boolean would lose that.
CREATE TABLE IF NOT EXISTS lesson_progress (
  lesson_id    TEXT NOT NULL,
  tier         TEXT NOT NULL,
  state        TEXT NOT NULL DEFAULT 'started',  -- started | complete
  widgets_done INTEGER NOT NULL DEFAULT 0,
  widgets_total INTEGER NOT NULL DEFAULT 0,
  first_seen   INTEGER NOT NULL,
  last_seen    INTEGER NOT NULL,
  completed_at INTEGER,
  PRIMARY KEY (lesson_id, tier)
);

-- Every widget interaction. Kept in full so a learner can look back at what
-- they actually got wrong, and so review scheduling can use real evidence.
CREATE TABLE IF NOT EXISTS attempts (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  ts         INTEGER NOT NULL,
  lesson_id  TEXT NOT NULL,
  widget_id  TEXT NOT NULL,
  widget_kind TEXT NOT NULL,
  correct    INTEGER NOT NULL,             -- 0/1
  detail     TEXT                          -- JSON blob, widget-specific
);
CREATE INDEX IF NOT EXISTS attempts_widget ON attempts(lesson_id, widget_id);

-- FSRS scheduling state. `card_id` is the stable authored id of a <Recall>.
CREATE TABLE IF NOT EXISTS review_cards (
  card_id     TEXT PRIMARY KEY,
  lesson_id   TEXT NOT NULL,
  concept_id  TEXT,
  due         INTEGER NOT NULL,
  stability   REAL    NOT NULL,
  difficulty  REAL    NOT NULL,
  elapsed_days REAL   NOT NULL DEFAULT 0,
  scheduled_days REAL NOT NULL DEFAULT 0,
  learning_steps INTEGER NOT NULL DEFAULT 0,
  reps        INTEGER NOT NULL DEFAULT 0,
  lapses      INTEGER NOT NULL DEFAULT 0,
  state       INTEGER NOT NULL DEFAULT 0,  -- ts-fsrs State enum
  last_review INTEGER
);
CREATE INDEX IF NOT EXISTS review_cards_due ON review_cards(due);

CREATE TABLE IF NOT EXISTS review_log (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  card_id   TEXT NOT NULL,
  ts        INTEGER NOT NULL,
  rating    INTEGER NOT NULL,
  state     INTEGER NOT NULL,
  due       INTEGER NOT NULL,
  stability REAL NOT NULL,
  difficulty REAL NOT NULL,
  elapsed_days REAL NOT NULL,
  last_elapsed_days REAL NOT NULL,
  scheduled_days REAL NOT NULL
);

-- Small key/value bag for settings (daily goal, tier preference, …).
CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
