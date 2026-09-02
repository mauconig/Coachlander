import { useAuth } from '@clerk/expo';
import { useSQLiteContext, type SQLiteDatabase } from 'expo-sqlite';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { AppState, type AppStateStatus } from 'react-native';
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import { syncSessionSets, type SessionSetInput } from '@/api/client';
import type { Exercise } from '@/data/types';
import { mmss } from '@/lib/format';
import {
  createInitialSessionState,
  reduceSessionState,
  type SessionAction,
  type SessionState,
} from './sessionMachine';
import { playSessionBeeps, playSessionTone } from './sessionFeedback';
import {
  clearSessionNotification,
  configureSessionNotifications,
  presentSessionNotification,
  SESSION_NOTIFICATION_ACTIONS,
} from './sessionNotifications';

export type SessionRuntime = {
  sessionId: string;
  routineId: string;
  routineTitle: string;
  exercises: Exercise[];
  state: SessionState;
  remoteStarted: boolean;
};

type SessionSyncPayload = {
  sessionId: string;
  routineId: string;
  sets: SessionSetInput[];
};

type PendingSessionEventRow = {
  event_id: string;
  session_id: string;
  event_type: string;
  payload_json: string;
  attempts: number;
  synced: number;
};

type SessionContextValue = {
  runtime: SessionRuntime | null;
  hydrated: boolean;
  ensureSession: (input: {
    routineId: string;
    routineTitle: string;
    exercises: Exercise[];
  }) => void;
  dispatch: (action: SessionAction) => void;
  markRemoteStarted: () => void;
  stageSessionSync: (payload: SessionSyncPayload) => Promise<string>;
  retryPendingSessionSync: (sessionId: string) => Promise<void>;
  finish: () => void;
  discard: () => void;
};

const SessionContext = createContext<SessionContextValue | null>(null);

export async function initializeSessionDatabase(db: SQLiteDatabase) {
  await db.execAsync(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS active_session (
      session_id TEXT PRIMARY KEY NOT NULL,
      routine_id TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS pending_session_events (
      event_id TEXT PRIMARY KEY NOT NULL,
      session_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      synced INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_pending_session_events_retry
      ON pending_session_events (session_id, event_type, synced);
    CREATE TABLE IF NOT EXISTS bootstrap_cache (
      user_id TEXT PRIMARY KEY NOT NULL,
      schema_version INTEGER NOT NULL,
      payload_json TEXT NOT NULL,
      cached_at INTEGER NOT NULL
    );
  `);
}

async function saveRuntime(db: SQLiteDatabase, runtime: SessionRuntime) {
  await db.runAsync(
    `INSERT OR REPLACE INTO active_session (session_id, routine_id, payload_json, updated_at)
     VALUES (?, ?, ?, ?)`,
    runtime.sessionId,
    runtime.routineId,
    JSON.stringify(runtime),
    Date.now(),
  );
}

async function clearRuntime(db: SQLiteDatabase) {
  await db.runAsync('DELETE FROM active_session');
  await db.runAsync('DELETE FROM pending_session_events');
}

function announceTransition(previous: SessionState, next: SessionState) {
  if (!next.soundEnabled) return;
  if (
    (previous.phase === 'countdown' || previous.phase === 'work' || previous.phase === 'rest') &&
    next.phase === previous.phase &&
    next.left !== previous.left &&
    next.left <= 3
  ) {
    playSessionTone('countdown');
  }
  if (previous.phase === 'countdown' && next.phase === 'work') playSessionTone('start');
  if (previous.phase === 'work' && next.phase === 'overtime') playSessionTone('overtime');
  if (previous.phase === 'work' && next.phase === 'rest') playSessionTone('restStart');
  if (previous.phase === 'rest' && next.phase === 'work') playSessionTone('restEnd');
  if (previous.exIndex !== next.exIndex) playSessionTone('exercise');
  if (next.phase === 'overtime' && next.overtime > previous.overtime && next.overtime % 10 === 0) {
    playSessionTone('overtimePulse');
  }
}

function notificationPhaseLabel(state: SessionState) {
  if (state.phase === 'countdown') return 'Preparando sesión';
  if (state.phase === 'rest') return 'Descanso';
  if (state.phase === 'overtime') return 'Tiempo cumplido';
  return 'Serie en curso';
}

function notificationClock(state: SessionState) {
  return state.phase === 'overtime' ? `+${mmss(state.overtime)}` : mmss(state.left);
}

function isClosedDatabaseError(error: unknown) {
  return String(error).toLowerCase().includes('access to closed resource');
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const db = useSQLiteContext();
  const [runtime, setRuntime] = useState<SessionRuntime | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [notificationsReady, setNotificationsReady] = useState(false);
  const runtimeRef = useRef<SessionRuntime | null>(null);
  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);
  const dbReadyRef = useRef(false);
  const dbQueueRef = useRef<Promise<unknown>>(Promise.resolve());
  const lastPersistAtRef = useRef(0);
  const pendingSyncRef = useRef<Promise<void> | null>(null);
  const { getToken } = useAuth();
  runtimeRef.current = runtime;

  const enqueueDb = useCallback(<T,>(operation: (database: SQLiteDatabase) => Promise<T>) => {
    if (!mountedRef.current || !dbReadyRef.current) return Promise.resolve(undefined as T);
    const next = dbQueueRef.current
      .catch(() => undefined)
      .then(async () => {
        if (!mountedRef.current || !dbReadyRef.current) return;
        return operation(db);
      });
    dbQueueRef.current = next.then(() => undefined, () => undefined);
    return next;
  }, [db]);

  useEffect(() => () => {
    mountedRef.current = false;
    dbReadyRef.current = false;
    if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
  }, []);

  useEffect(() => {
    void configureSessionNotifications().finally(() => setNotificationsReady(true));
  }, []);

  useEffect(() => {
    let cancelled = false;
    dbReadyRef.current = true;
    void db
      .getFirstAsync<{ payload_json: string }>('SELECT payload_json FROM active_session LIMIT 1')
      .then((row) => {
        if (cancelled || !row?.payload_json) return;
        try {
          const saved = JSON.parse(row.payload_json) as SessionRuntime;
          if (saved.sessionId && saved.routineId && saved.exercises?.length) setRuntime(saved);
        } catch (error) {
          console.warn('[Coachlander] No se pudo restaurar la sesión local', error);
          void enqueueDb(clearRuntime).catch(() => undefined);
        }
      })
      .catch((error: unknown) => {
        if (!cancelled && !isClosedDatabaseError(error)) {
          console.warn('[Coachlander] SQLite no pudo leer la sesión', error);
        }
      })
      .finally(() => {
        if (!cancelled) setHydrated(true);
      });
    return () => {
      cancelled = true;
    };
  }, [db, enqueueDb]);

  useEffect(() => {
    if (!runtime || !hydrated) return;
    if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
    // Persist at most once per second. A debounce would never fire while the
    // 250 ms timer is ticking, leaving the local set list vulnerable to a
    // process kill during an active session.
    const waitMs = Math.max(0, 1000 - (Date.now() - lastPersistAtRef.current));
    persistTimerRef.current = setTimeout(() => {
      lastPersistAtRef.current = Date.now();
      void enqueueDb((database) => saveRuntime(database, runtime)).catch((error: unknown) =>
        console.warn('[Coachlander] SQLite no pudo guardar la sesión', error),
      );
    }, waitMs);
    return () => {
      if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
    };
  }, [enqueueDb, hydrated, runtime]);

  useEffect(() => {
    if (!runtime || runtime.state.paused || runtime.state.finished) return;
    const id = setInterval(() => {
      setRuntime((current) => {
        if (!current) return current;
        const exercise = current.exercises[current.state.exIndex];
        const nextState = reduceSessionState(current.state, {
          type: 'tick',
          work: exercise?.work ?? 45,
          now: Date.now(),
        });
        announceTransition(current.state, nextState);
        return {
          ...current,
          state: nextState,
        };
      });
    }, 250);
    return () => clearInterval(id);
  }, [runtime?.state.finished, runtime?.state.paused, runtime?.state.exIndex]);

  const ensureSession = useCallback<SessionContextValue['ensureSession']>((input) => {
    if (!hydrated) return;
    setRuntime((current) => {
      if (current?.routineId === input.routineId) return current;
      if (current) return current;
      return {
        sessionId: `session-${input.routineId}-${Date.now()}`,
        routineId: input.routineId,
        routineTitle: input.routineTitle,
        exercises: input.exercises,
        state: createInitialSessionState(input.exercises),
        remoteStarted: false,
      };
    });
  }, [hydrated]);

  const dispatch = useCallback((action: SessionAction) => {
    setRuntime((current) => {
      if (!current) return current;
      const nextState = reduceSessionState(current.state, action);
      announceTransition(current.state, nextState);
      return { ...current, state: nextState };
    });
  }, []);

  const clearLocal = useCallback(() => {
    setRuntime(null);
    void enqueueDb(clearRuntime).catch((error: unknown) => console.warn('[Coachlander] SQLite no pudo limpiar la sesión', error));
  }, [enqueueDb]);
  const finish = useCallback(() => {
    playSessionBeeps('finish', 2, 220);
    clearLocal();
  }, [clearLocal]);
  const markRemoteStarted = useCallback(() => {
    setRuntime((current) => current ? { ...current, remoteStarted: true } : current);
  }, []);

  const stageSessionSync = useCallback<SessionContextValue['stageSessionSync']>(async (payload) => {
    const eventId = `session-sync:${payload.sessionId}`;
    const payloadJson = JSON.stringify(payload);
    await enqueueDb((database) => database.runAsync(
      `INSERT OR IGNORE INTO pending_session_events
        (event_id, session_id, event_type, payload_json, attempts, synced)
       VALUES (?, ?, 'sync_sets', ?, 0, 0)`,
      eventId,
      payload.sessionId,
      payloadJson,
    ));
    // Preserve a batch that already reached the API. If the close request
    // failed afterwards, retrying the close must not create another sync
    // request unnecessarily; the unique server key makes it safe either way.
    await enqueueDb((database) => database.runAsync(
      `UPDATE pending_session_events
          SET payload_json = ?
        WHERE event_id = ? AND synced = 0`,
      payloadJson,
      eventId,
    ));
    return eventId;
  }, [enqueueDb]);

  const retryPendingSessionSync = useCallback<SessionContextValue['retryPendingSessionSync']>(async (sessionId) => {
    if (pendingSyncRef.current) return pendingSyncRef.current;

    const task = (async () => {
      const events = (await enqueueDb((database) => database.getAllAsync<PendingSessionEventRow>(
        `SELECT event_id, session_id, event_type, payload_json, attempts, synced
           FROM pending_session_events
          WHERE session_id = ? AND event_type = 'sync_sets' AND synced = 0
          ORDER BY event_id`,
        sessionId,
      ))) ?? [];

      for (const event of events) {
        let payload: SessionSyncPayload;
        try {
          payload = JSON.parse(event.payload_json) as SessionSyncPayload;
        } catch {
          throw new Error('La sesión local tiene un lote inválido para sincronizar');
        }

        await enqueueDb((database) => database.runAsync(
          `UPDATE pending_session_events
              SET attempts = attempts + 1
            WHERE event_id = ?`,
          event.event_id,
        ));

        // A retry is safe because the API identifies every series by
        // session + routine + exercise + set index.
        await syncSessionSets(() => getToken(), payload);
        await enqueueDb((database) => database.runAsync(
          `UPDATE pending_session_events
              SET synced = 1
            WHERE event_id = ?`,
          event.event_id,
        ));
      }
    })();

    pendingSyncRef.current = task;
    try {
      await task;
    } finally {
      if (pendingSyncRef.current === task) pendingSyncRef.current = null;
    }
  }, [enqueueDb, getToken]);

  useEffect(() => {
    if (!hydrated || !runtime?.sessionId) return;
    let cancelled = false;
    const retry = () => {
      if (cancelled) return;
      void retryPendingSessionSync(runtime.sessionId).catch((error: unknown) => {
        // Keep the event and the active snapshot. The next foreground event,
        // interval or manual close will retry it again.
        if (!isClosedDatabaseError(error)) {
          console.warn('[Coachlander] No se pudo reintentar la sincronización local', error);
        }
      });
    };
    retry();
    const subscription = AppState.addEventListener('change', (status: AppStateStatus) => {
      if (status === 'active') retry();
    });
    const interval = setInterval(retry, 15_000);
    return () => {
      cancelled = true;
      subscription.remove();
      clearInterval(interval);
    };
  }, [hydrated, retryPendingSessionSync, runtime?.sessionId]);

  useEffect(() => {
    if (!notificationsReady || !runtime) {
      if (!runtime) clearSessionNotification();
      return;
    }
    const exercise = runtime.exercises[runtime.state.exIndex];
    if (!exercise) return;
    const completedSets = runtime.state.sets.filter((item) => item.done).length;
    presentSessionNotification({
      routineTitle: runtime.routineTitle,
      exerciseName: exercise.name,
      phaseLabel: notificationPhaseLabel(runtime.state),
      clock: notificationClock(runtime.state),
      setLabel: `Serie ${Math.min(completedSets + 1, runtime.state.sets.length)} de ${runtime.state.sets.length}`,
      paused: runtime.state.paused,
    });
  }, [notificationsReady, runtime]);

  useEffect(() => {
    if (!notificationsReady) return;
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const currentRuntime = runtimeRef.current;
      const action = response.actionIdentifier;
      if (action === SESSION_NOTIFICATION_ACTIONS.pause) {
        dispatch({ type: 'togglePaused', now: Date.now() });
        return;
      }
      if (action === SESSION_NOTIFICATION_ACTIONS.skip) {
        if (currentRuntime?.state.phase === 'countdown' || currentRuntime?.state.phase === 'rest') {
          const exercise = currentRuntime.exercises[currentRuntime.state.exIndex];
          dispatch({ type: 'cta', work: exercise?.work ?? 45, now: Date.now() });
        }
        return;
      }
      if (action === SESSION_NOTIFICATION_ACTIONS.open || action === Notifications.DEFAULT_ACTION_IDENTIFIER) {
        if (currentRuntime) {
          dispatch({ type: 'restore' });
          router.push('/sesion');
        }
      }
    });
    return () => subscription.remove();
  }, [dispatch, notificationsReady]);

  const value = useMemo<SessionContextValue>(() => ({
    runtime,
    hydrated,
    ensureSession,
    dispatch,
    markRemoteStarted,
    stageSessionSync,
    retryPendingSessionSync,
    finish,
    discard: clearLocal,
  }), [clearLocal, dispatch, ensureSession, finish, hydrated, markRemoteStarted, retryPendingSessionSync, runtime, stageSessionSync]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useActiveSession() {
  const context = useContext(SessionContext);
  if (!context) throw new Error('useActiveSession debe estar dentro de SessionProvider');
  return {
    runtime: context.runtime,
    hydrated: context.hydrated,
    restore: () => context.dispatch({ type: 'restore' }),
    minimize: () => context.dispatch({ type: 'minimize' }),
    togglePaused: () => context.dispatch({ type: 'togglePaused', now: Date.now() }),
    discard: context.discard,
  };
}

export function useSessionContext() {
  const context = useContext(SessionContext);
  if (!context) throw new Error('useSession debe estar dentro de SessionProvider');
  return context;
}
