import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
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

  // The server always renders "unsolved". If the stored progress has loaded
  // before this island hydrates, reading it on the first client render would
  // disagree with that HTML (React #418). So report solved only once mounted.
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  const solved = hydrated && lesson.isSolved(id);
  /** `attempt` is 1-based; XP tapers to zero by the third try so a widget
   *  cannot be farmed by exhausting its options. */
  const solve = useCallback(
    (correct: boolean, attempt: number, detail?: unknown, xp?: number) =>
      lesson.solve({ id, kind, correct, attempt, detail, xp }),
    [id, kind],
  );
  return { solved, solve };
}
