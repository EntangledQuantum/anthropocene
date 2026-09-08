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
  const solve = useCallback(
    (correct: boolean, firstTry: boolean, detail?: unknown, xp?: number) =>
      lesson.solve({ id, kind, correct, firstTry, detail, xp }),
    [id, kind],
  );
  return { solved, solve };
}
