import { useSQLiteContext, type SQLiteDatabase } from 'expo-sqlite';
import { useCallback, useMemo, useSyncExternalStore } from 'react';

/**
 * Minimal reactivity for the database: writes bump a counter and every live
 * query re-runs. Reads are synchronous, so screens get their data on first
 * render with no loading state — the dataset is small and local.
 */
let revision = 0;
const listeners = new Set<() => void>();

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

const getRevision = () => revision;

/** Call after any write so mounted queries pick the change up. */
export function notifyDbChanged() {
  revision += 1;
  for (const listener of listeners) listener();
}

/**
 * Runs `select` against the database and re-runs it whenever the data changes
 * or a dependency moves.
 *
 *     const routine = useQuery(getTodayRoutine);
 *     const exercise = useQuery((db) => getExercise(db, id), [id]);
 */
export function useQuery<T>(select: (db: SQLiteDatabase) => T, deps: unknown[] = []): T {
  const db = useSQLiteContext();
  const version = useSyncExternalStore(subscribe, getRevision, getRevision);

  // `select` is typically an inline arrow, so deps carry the identity instead.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => select(db), [db, version, ...deps]);
}

/** Returns a writer that notifies queries once the write finishes. */
export function useMutation<A extends unknown[]>(
  write: (db: SQLiteDatabase, ...args: A) => void,
): (...args: A) => void {
  const db = useSQLiteContext();
  return useCallback(
    (...args: A) => {
      write(db, ...args);
      notifyDbChanged();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [db],
  );
}
