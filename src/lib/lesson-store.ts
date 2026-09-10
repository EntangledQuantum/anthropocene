import { db } from './db/client.ts';
import {
  completeLesson, recordAttempt, solvedWidgets, summary, touchLesson,
  xpForAttempt, XP, type ProgressSummary,
} from './db/progress.ts';

/**
 * Page-level state shared by every island in a lesson.
 *
 * Astro renders each widget as its own React root, so React context cannot
 * reach across them. A module singleton can: all islands on a page import the
 * same module instance, so this is the one place lesson-wide state lives.
 */

export interface LessonMeta {
  id: string;
  tier: string;
  title: string;
  /** The full roster of graded widgets in this lesson, scanned from source at
   *  build time. This is the completion denominator — it must not depend on
   *  which islands have hydrated, since `client:visible` widgets below the
   *  fold have not. */
  widgets: { id: string; kind: string }[];
}

interface WidgetRecord {
  id: string;
  kind: string;
  solved: boolean;
  /** Widgets marked optional don't gate lesson completion (e.g. <Explore>). */
  optional: boolean;
}

type Listener = () => void;

class LessonStore {
  meta: LessonMeta | null = null;
  widgets = new Map<string, WidgetRecord>();
  progress: ProgressSummary | null = null;
  ready = false;
  justCompleted = false;
  /** Transient XP awards, for the toast rail. */
  toasts: { id: number; amount: number; label: string }[] = [];

  /** Bumped on every change. `useSyncExternalStore` needs a snapshot whose
   *  identity changes, and a counter is the cheapest honest one. */
  version = 0;

  private listeners = new Set<Listener>();
  private toastSeq = 0;

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit() {
    this.version += 1;
    for (const fn of this.listeners) fn();
  }

  async init(meta: LessonMeta): Promise<void> {
    this.meta = meta;
    for (const w of meta.widgets) {
      if (!this.widgets.has(w.id)) {
        this.widgets.set(w.id, { id: w.id, kind: w.kind, solved: false, optional: false });
      }
    }
    await db.open();
    if (db.available) {
      const solved = await solvedWidgets(meta.id);
      for (const [id, w] of this.widgets) {
        if (solved.has(id)) this.widgets.set(id, { ...w, solved: true });
      }
      await touchLesson(meta.id, meta.tier, this.requiredCount());
      this.progress = await summary();
    }
    this.ready = true;
    this.emit();
  }

  /** Called by a widget island when it mounts. The roster already contains it
   *  (from `init`), so this only fills in widgets authored outside the scanned
   *  set — and never changes the completion denominator after the fact. */
  register(id: string, kind: string, optional = false): void {
    if (!this.widgets.has(id)) {
      this.widgets.set(id, { id, kind, solved: false, optional });
      this.emit();
    }
  }

  isSolved(id: string): boolean {
    return this.widgets.get(id)?.solved ?? false;
  }

  private requiredCount(): number {
    return [...this.widgets.values()].filter((w) => !w.optional).length;
  }

  private solvedCount(): number {
    return [...this.widgets.values()].filter((w) => !w.optional && w.solved).length;
  }

  get counts(): { done: number; total: number } {
    return { done: this.solvedCount(), total: this.requiredCount() };
  }

  /** Records an attempt, awards XP, and completes the lesson when every
   *  required widget has been solved. */
  async solve(opts: {
    id: string;
    kind: string;
    correct: boolean;
    /** 1-based attempt number. */
    attempt: number;
    detail?: unknown;
    xp?: number;
  }): Promise<void> {
    if (!this.meta) return;
    const already = this.isSolved(opts.id);

    const w = this.widgets.get(opts.id);
    if (w && opts.correct && !already) this.widgets.set(opts.id, { ...w, solved: true });

    // Re-solving something already solved is fine, it just earns nothing.
    if (!already) {
      await recordAttempt({
        lessonId: this.meta.id,
        widgetId: opts.id,
        widgetKind: opts.kind,
        correct: opts.correct,
        attempt: opts.attempt,
        detail: opts.detail,
        xp: opts.xp,
      });
      if (opts.correct) {
        const earned = Math.round((opts.xp ?? XP.widgetFirstTry) * (xpForAttempt(opts.attempt) / XP.widgetFirstTry));
        this.toast(
          earned,
          opts.attempt <= 1 ? 'first try' : earned > 0 ? 'solved' : 'solved — no xp, too many tries',
        );
      }
    }

    const { done, total } = this.counts;
    if (opts.correct && total > 0 && done >= total) {
      const awarded = await completeLesson(this.meta.id, this.meta.tier, done);
      if (awarded) {
        this.justCompleted = true;
        this.toast(30, 'lesson complete');
      }
    }

    if (db.available) this.progress = await summary();
    this.emit();
  }

  toast(amount: number, label: string): void {
    const id = ++this.toastSeq;
    this.toasts = [...this.toasts, { id, amount, label }];
    this.emit();
    setTimeout(() => {
      this.toasts = this.toasts.filter((t) => t.id !== id);
      this.emit();
    }, 2600);
  }

  async refresh(): Promise<void> {
    if (db.available) this.progress = await summary();
    this.emit();
  }
}

export const lesson = new LessonStore();
