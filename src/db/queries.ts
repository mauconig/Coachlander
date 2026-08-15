import type { SQLiteDatabase } from 'expo-sqlite';

import type { DayMark } from '@/data/mock';
import type {
  Client,
  Exercise,
  ImportedExercise,
  OverloadRow,
  Routine,
  SessionRecord,
} from '@/data/types';

/* ------------------------------------------------------------------ rows */

type ExerciseRow = {
  id: string;
  name: string;
  scheme: string;
  suggested: number;
  sets: number;
  work: number;
  rest: number;
  focus: string;
  cues: string;
  overload: number | null;
  last_date: string | null;
  last_load: number | null;
  last_reps: string | null;
  last_note: string | null;
};

const toExercise = (r: ExerciseRow): Exercise => ({
  id: r.id,
  name: r.name,
  scheme: r.scheme,
  suggested: r.suggested,
  sets: r.sets,
  work: r.work,
  rest: r.rest,
  focus: r.focus,
  cues: r.cues,
  overload: r.overload,
  lastTime:
    r.last_date && r.last_load !== null && r.last_reps
      ? {
          date: r.last_date,
          load: r.last_load,
          reps: r.last_reps.split(',').map(Number),
          note: r.last_note ?? '',
        }
      : undefined,
});

/* ------------------------------------------------------------------ meta */

export function getMeta(db: SQLiteDatabase, key: string): string {
  return db.getFirstSync<{ value: string }>('SELECT value FROM app_meta WHERE key = ?', [key])
    ?.value ?? '';
}

export function getMetaNumber(db: SQLiteDatabase, key: string): number {
  return Number(getMeta(db, key)) || 0;
}

/* ---------------------------------------------------------------- people */

export type CoachRecord = {
  name: string;
  shortName: string;
  firstName: string;
  specialty: string;
  code: string;
};

export function getCoach(db: SQLiteDatabase): CoachRecord {
  const row = db.getFirstSync<{
    name: string;
    short_name: string;
    first_name: string;
    specialty: string;
    code: string;
  }>('SELECT name, short_name, first_name, specialty, code FROM coach LIMIT 1');

  return {
    name: row?.name ?? '',
    shortName: row?.short_name ?? '',
    firstName: row?.first_name ?? '',
    specialty: row?.specialty ?? '',
    code: row?.code ?? '',
  };
}

export type AthleteRecord = {
  name: string;
  firstName: string;
  goal: string;
  weightKg: number;
  heightM: number;
  totalSessions: number;
  streakWeeks: number;
};

export function getAthlete(db: SQLiteDatabase): AthleteRecord {
  const row = db.getFirstSync<{
    name: string;
    first_name: string;
    goal: string;
    weight_kg: number;
    height_m: number;
    total_sessions: number;
    streak_weeks: number;
  }>(
    `SELECT name, first_name, goal, weight_kg, height_m, total_sessions, streak_weeks
     FROM athlete LIMIT 1`,
  );

  return {
    name: row?.name ?? '',
    firstName: row?.first_name ?? '',
    goal: row?.goal ?? '',
    weightKg: row?.weight_kg ?? 0,
    heightM: row?.height_m ?? 0,
    totalSessions: row?.total_sessions ?? 0,
    streakWeeks: row?.streak_weeks ?? 0,
  };
}

/* -------------------------------------------------------------- routines */

export function getExercises(db: SQLiteDatabase): Exercise[] {
  return db.getAllSync<ExerciseRow>('SELECT * FROM exercise').map(toExercise);
}

export function getExercise(db: SQLiteDatabase, id: string): Exercise | null {
  const row = db.getFirstSync<ExerciseRow>('SELECT * FROM exercise WHERE id = ?', [id]);
  return row ? toExercise(row) : null;
}

export function getTodayRoutine(db: SQLiteDatabase): Routine {
  const row = db.getFirstSync<{
    id: string;
    name: string;
    block: string;
    week: number;
    day: number;
    athlete_id: string;
    estimated_minutes: number;
    seconds_per_set: number;
    coach_short: string;
  }>(
    `SELECT r.*, c.short_name AS coach_short
     FROM routine r LEFT JOIN coach c ON c.id = r.coach_id
     WHERE r.is_today = 1 LIMIT 1`,
  );

  const exercises = db
    .getAllSync<ExerciseRow>(
      `SELECT e.* FROM routine_exercise re
       JOIN exercise e ON e.id = re.exercise_id
       WHERE re.routine_id = ?
       ORDER BY re.position`,
      [row?.id ?? ''],
    )
    .map(toExercise);

  return {
    id: row?.id ?? '',
    name: row?.name ?? '',
    block: row?.block ?? '',
    week: row?.week ?? 0,
    day: row?.day ?? 0,
    coach: row?.coach_short ?? '',
    athleteId: row?.athlete_id ?? '',
    estimatedMinutes: row?.estimated_minutes ?? 0,
    secondsPerSet: row?.seconds_per_set ?? 0,
    exercises,
  };
}

export function getRoutineSetCount(db: SQLiteDatabase): number {
  return (
    db.getFirstSync<{ total: number }>(
      `SELECT COALESCE(SUM(e.sets), 0) AS total
       FROM routine_exercise re
       JOIN exercise e ON e.id = re.exercise_id
       JOIN routine r ON r.id = re.routine_id
       WHERE r.is_today = 1`,
    )?.total ?? 0
  );
}

/* --------------------------------------------------------------- clients */

export function getClients(db: SQLiteDatabase): Client[] {
  return db
    .getAllSync<{
      id: string;
      name: string;
      status: string;
      attention: number;
      done: number;
      live_routine: string | null;
      live_set_index: number | null;
      live_total_sets: number | null;
      live_elapsed: string | null;
    }>('SELECT * FROM client ORDER BY position')
    .map((r) => ({
      id: r.id,
      name: r.name,
      status: r.status,
      attention: !!r.attention,
      done: !!r.done,
      live: r.live_routine
        ? {
            routine: r.live_routine,
            setIndex: r.live_set_index ?? 0,
            totalSets: r.live_total_sets ?? 0,
            elapsed: r.live_elapsed ?? '',
          }
        : undefined,
    }));
}

export function getClient(db: SQLiteDatabase, id: string): Client | null {
  return getClients(db).find((c) => c.id === id) ?? null;
}

/* --------------------------------------------------------------- history */

export function getHistory(db: SQLiteDatabase): SessionRecord[] {
  return db
    .getAllSync<{
      id: string;
      date: string;
      name: string;
      minutes: number;
      sets: number;
      volume: number;
      completion: number;
    }>('SELECT * FROM session ORDER BY date DESC')
    .map((r) => ({ ...r, date: new Date(r.date) }));
}

export function getHistorySummary(db: SQLiteDatabase) {
  return {
    sessions: getMetaNumber(db, 'history_sessions'),
    totalMinutes: getMetaNumber(db, 'history_minutes'),
    completion: getMetaNumber(db, 'history_completion'),
  };
}

export function getMonthGrid(db: SQLiteDatabase): DayMark[] {
  return db
    .getAllSync<{ mark: string }>('SELECT mark FROM month_day ORDER BY day_index')
    .map((r) => r.mark as DayMark);
}

/* -------------------------------------------------------------- progress */

export function getOverloadRows(db: SQLiteDatabase, exerciseId: string): OverloadRow[] {
  return db
    .getAllSync<{
      set_no: number;
      last_load: number;
      last_reps: number;
      next_load: number;
      next_reps: number;
    }>('SELECT * FROM overload_row WHERE exercise_id = ? ORDER BY set_no', [exerciseId])
    .map((r) => ({
      set: r.set_no,
      lastLoad: r.last_load,
      lastReps: r.last_reps,
      nextLoad: r.next_load,
      nextReps: r.next_reps,
    }));
}

export function getWeeklyVolume(db: SQLiteDatabase): number[] {
  return db
    .getAllSync<{ volume: number }>('SELECT volume FROM weekly_volume ORDER BY week')
    .map((r) => r.volume);
}

export function getProgressSummary(db: SQLiteDatabase) {
  return {
    topLoad: getMetaNumber(db, 'progress_top_load'),
    windowLabel: getMeta(db, 'progress_window'),
    growth: getMeta(db, 'progress_growth'),
  };
}

/* -------------------------------------------------------------- settings */

export type SettingRow = { id: string; label: string; value: string; accent: boolean };

export function getSettings(db: SQLiteDatabase, role: 'athlete' | 'coach'): SettingRow[] {
  return db
    .getAllSync<{ id: string; label: string; value: string; accent: number }>(
      'SELECT id, label, value, accent FROM setting WHERE role = ? ORDER BY position',
      [role],
    )
    .map((r) => ({ ...r, accent: !!r.accent }));
}

export type TemplateRow = { id: string; name: string; meta: string; assigned: string | null };

export function getTemplates(db: SQLiteDatabase): TemplateRow[] {
  return db.getAllSync<TemplateRow>('SELECT * FROM template ORDER BY position');
}

export type ThreadRow = {
  clientId: string;
  name: string;
  preview: string;
  when: string;
  unread: boolean;
};

export function getThreads(db: SQLiteDatabase): ThreadRow[] {
  return db
    .getAllSync<{
      client_id: string;
      name: string;
      preview: string;
      when_label: string;
      unread: number;
    }>(
      `SELECT t.client_id, c.name, t.preview, t.when_label, t.unread
       FROM thread t JOIN client c ON c.id = t.client_id
       ORDER BY t.position`,
    )
    .map((r) => ({
      clientId: r.client_id,
      name: r.name,
      preview: r.preview,
      when: r.when_label,
      unread: !!r.unread,
    }));
}

/* ---------------------------------------------------------------- import */

export function getImportLines(db: SQLiteDatabase): ImportedExercise[] {
  return db
    .getAllSync<{
      id: string;
      name: string;
      sets: number;
      reps: number;
      load: number | null;
      rest: number;
      uncertain: number;
      raw: string | null;
      question: string | null;
      option_a: string | null;
      option_b: string | null;
    }>('SELECT * FROM import_line ORDER BY position')
    .map((r) => ({
      id: r.id,
      name: r.name,
      sets: r.sets,
      reps: r.reps,
      load: r.load,
      rest: r.rest,
      uncertain: !!r.uncertain,
      raw: r.raw ?? undefined,
      question: r.question ?? undefined,
      options:
        r.option_a && r.option_b ? ([r.option_a, r.option_b] as [string, string]) : undefined,
    }));
}

/* ------------------------------------------------------------- set logs */

export type SetLog = {
  id: number;
  exerciseId: string;
  setIndex: number;
  load: number | null;
  reps: number;
  loggedAt: string;
};

/** Called by the live session every time a set is closed. */
export function insertSetLog(
  db: SQLiteDatabase,
  entry: { routineId: string; exerciseId: string; setIndex: number; load: number | null; reps: number },
) {
  db.runSync(
    `INSERT INTO set_log (routine_id, exercise_id, set_index, load, reps, logged_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      entry.routineId,
      entry.exerciseId,
      entry.setIndex,
      entry.load,
      entry.reps,
      new Date().toISOString(),
    ],
  );
}

export function getRecentSetLogs(db: SQLiteDatabase, exerciseId: string, limit = 8): SetLog[] {
  return db
    .getAllSync<{
      id: number;
      exercise_id: string;
      set_index: number;
      load: number | null;
      reps: number;
      logged_at: string;
    }>('SELECT * FROM set_log WHERE exercise_id = ? ORDER BY logged_at DESC LIMIT ?', [
      exerciseId,
      limit,
    ])
    .map((r) => ({
      id: r.id,
      exerciseId: r.exercise_id,
      setIndex: r.set_index,
      load: r.load,
      reps: r.reps,
      loggedAt: r.logged_at,
    }));
}

export function getSetLogCount(db: SQLiteDatabase): number {
  return db.getFirstSync<{ n: number }>('SELECT COUNT(*) AS n FROM set_log')?.n ?? 0;
}
