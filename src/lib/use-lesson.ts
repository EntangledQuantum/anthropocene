import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { lesson } from './lesson-store.ts';

/** Subscribes a widget island to the shared lesson store. */
export function useLessonStore() {
  return useSyncExternalStore(
    useCallback((fn: () => void) => lesson.subscribe(fn), []),
    () => lesson.version,
    () => lesson.version,
  );
}

/** Registers a widget on mount and returns its solve helper + solved flag. */
export function useWidget(id: string, kind: string, optional = false) {
  useEffect(() => { lesson.register(id, kind, optional); }, [id, kind, optional]);
  useLessonStore();

  const solved = lesson.isSolved(id);
  /** `attempt` is 1-based; XP tapers to zero by the third try so a widget
   *  cannot be farmed by exhausting its options. */
  const solve = useCallback(
    (correct: boolean, attempt: number, detail?: unknown, xp?: number) =>
      lesson.solve({ id, kind, correct, attempt, detail, xp }),
    [id, kind],
  );
  return { solved, solve };
}
