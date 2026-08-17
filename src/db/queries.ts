import type { RemoteData } from '@/state/RemoteState';
import type {
  Client,
  DayMark,
  Exercise,
  ImportedExercise,
  OverloadRow,
  Routine,
  SessionRecord,
} from '@/data/types';

type Row = Record<string, unknown>;

const rows = (data: RemoteData, table: string): Row[] => data.tables[table] ?? [];
const first = (data: RemoteData, table: string): Row | undefined => rows(data, table)[0];
const stringValue = (row: Row | undefined, key: string, fallback = '') =>
  typeof row?.[key] === 'string' ? (row[key] as string) : fallback;
const numberValue = (row: Row | undefined, key: string, fallback = 0) => {
  const value = row?.[key];
  return typeof value === 'number' ? value : Number(value ?? fallback) || fallback;
};
const nullableNumber = (row: Row | undefined, key: string): number | null => {
  const value = row?.[key];
  if (value === null || value === undefined || value === '') return null;
  return Number.isFinite(Number(value)) ? Number(value) : null;
};
const booleanValue = (row: Row | undefined, key: string) => row?.[key] === true || row?.[key] === 1;

export function getMeta(data: RemoteData, key: string): string {
  return stringValue(rows(data, 'app_meta').find((row) => row.key === key), 'value');
}

export function getMetaNumber(data: RemoteData, key: string): number {
  return Number(getMeta(data, key)) || 0;
}

export type CoachRecord = {
  name: string;
  shortName: string;
  firstName: string;
  specialty: string;
  code: string;
};

export function getCoach(data: RemoteData): CoachRecord {
  const row = first(data, 'coach');
  return {
    name: stringValue(row, 'name'),
    shortName: stringValue(row, 'short_name'),
    firstName: stringValue(row, 'first_name'),
    specialty: stringValue(row, 'specialty'),
    code: stringValue(row, 'code'),
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

export function getAthlete(data: RemoteData): AthleteRecord {
  const row = first(data, 'athlete');
  return {
    name: data.user?.displayName ?? stringValue(row, 'name'),
    firstName: data.user?.firstName ?? stringValue(row, 'first_name'),
    goal: data.user?.goal ?? stringValue(row, 'goal'),
    weightKg: data.user?.weightKg ?? numberValue(row, 'weight_kg'),
    heightM: data.user?.heightM ?? numberValue(row, 'height_m'),
    totalSessions: numberValue(row, 'total_sessions'),
    streakWeeks: numberValue(row, 'streak_weeks'),
  };
}

const toExercise = (row: Row): Exercise => {
  const lastDate = stringValue(row, 'last_date');
  const lastLoad = nullableNumber(row, 'last_load');
  const lastReps = stringValue(row, 'last_reps');
  return {
    id: stringValue(row, 'id'),
    name: stringValue(row, 'name'),
    scheme: stringValue(row, 'scheme'),
    suggested: numberValue(row, 'suggested'),
    sets: numberValue(row, 'sets'),
    work: numberValue(row, 'work'),
    rest: numberValue(row, 'rest'),
    focus: stringValue(row, 'focus'),
    cues: stringValue(row, 'cues'),
    overload: nullableNumber(row, 'overload'),
    lastTime:
      lastDate && lastLoad !== null && lastReps
        ? {
            date: lastDate,
            load: lastLoad,
            reps: lastReps.split(',').map(Number),
            note: stringValue(row, 'last_note'),
          }
        : undefined,
  };
};

export function getExercises(data: RemoteData): Exercise[] {
  return rows(data, 'exercise').map(toExercise);
}

export function getExercise(data: RemoteData, id: string): Exercise | null {
  const row = rows(data, 'exercise').find((item) => item.id === id);
  return row ? toExercise(row) : null;
}

export function getTodayRoutine(data: RemoteData): Routine {
  const routineRows =
    data.user?.role === 'athlete'
      ? rows(data, 'routine').filter((row) => row.athlete_id === data.user?.id)
      : rows(data, 'routine');
  const routineRow =
    routineRows.find((row) => booleanValue(row, 'is_today')) ??
    (data.user?.role === 'athlete' ? undefined : routineRows[0]);
  const routineId = stringValue(routineRow, 'id');
  const coachId = stringValue(routineRow, 'coach_id');
  const exerciseRows = rows(data, 'routine_exercise')
    .filter((row) => row.routine_id === routineId)
    .sort((a, b) => numberValue(a, 'position') - numberValue(b, 'position'));
  const exercises = exerciseRows
    .map((link) => getExercise(data, stringValue(link, 'exercise_id')))
    .filter((exercise): exercise is Exercise => exercise !== null);
  const coach = rows(data, 'coach').find((row) => row.id === coachId) ?? first(data, 'coach');

  return {
    id: routineId,
    name: stringValue(routineRow, 'name'),
    block: stringValue(routineRow, 'block'),
    week: numberValue(routineRow, 'week'),
    day: numberValue(routineRow, 'day'),
    coach: stringValue(coach, 'short_name'),
    athleteId: stringValue(routineRow, 'athlete_id'),
    estimatedMinutes: numberValue(routineRow, 'estimated_minutes'),
    secondsPerSet: numberValue(routineRow, 'seconds_per_set'),
    exercises,
  };
}

export type RoutineOption = {
  id: string;
  day: number;
  name: string;
  exerciseCount: number;
  selected: boolean;
};

export function getRoutineOptions(data: RemoteData): RoutineOption[] {
  const routineRows =
    data.user?.role === 'athlete'
      ? rows(data, 'routine').filter((row) => row.athlete_id === data.user?.id)
      : rows(data, 'routine');
  const selectedRow = routineRows.find((row) => booleanValue(row, 'is_today'));
  const planId = selectedRow?.plan_id;
  const planRows = planId
    ? routineRows.filter((row) => row.plan_id === planId)
    : selectedRow
      ? routineRows.filter((row) => row.day === selectedRow.day)
      : [];

  return [...planRows]
    .sort((a, b) => numberValue(a, 'day') - numberValue(b, 'day'))
    .map((row) => {
      const fullName = stringValue(row, 'name');
      const separator = fullName.indexOf(' · ');
      const name = separator >= 0 ? fullName.slice(separator + 3) : fullName;
      const routineId = stringValue(row, 'id');
      return {
        id: routineId,
        day: numberValue(row, 'day'),
        name,
        exerciseCount: rows(data, 'routine_exercise').filter((link) => link.routine_id === routineId).length,
        selected: booleanValue(row, 'is_today'),
      };
    });
}

export function getRoutineSetCount(data: RemoteData): number {
  return getTodayRoutine(data).exercises.reduce((total, exercise) => total + exercise.sets, 0);
}

export function getClients(data: RemoteData): Client[] {
  return [...rows(data, 'client')]
    .sort((a, b) => numberValue(a, 'position') - numberValue(b, 'position'))
    .map((row) => ({
      id: stringValue(row, 'id'),
      name: stringValue(row, 'name'),
      status: stringValue(row, 'status'),
      clerkUserId: stringValue(row, 'clerk_user_id') || undefined,
      attention: booleanValue(row, 'attention'),
      done: booleanValue(row, 'done'),
      live: stringValue(row, 'live_routine')
        ? {
            routine: stringValue(row, 'live_routine'),
            setIndex: numberValue(row, 'live_set_index'),
            totalSets: numberValue(row, 'live_total_sets'),
            elapsed: stringValue(row, 'live_elapsed'),
          }
        : undefined,
    }));
}

export function getClient(data: RemoteData, id: string): Client | null {
  return getClients(data).find((client) => client.id === id) ?? null;
}

/** Semanas (week_start) en las que un alumno tiene rutinas, ordenadas. */
export function getClientWeeks(data: RemoteData, athleteId: string): string[] {
  const weeks = new Set<string>();
  for (const row of rows(data, 'routine')) {
    if (stringValue(row, 'athlete_id') === athleteId && stringValue(row, 'week_start')) {
      weeks.add(stringValue(row, 'week_start'));
    }
  }
  return [...weeks].sort();
}

export type ClientRoutineDay = {
  id: string;
  day: number;
  name: string;
  week: number;
  weekStart: string;
  completed: boolean;
  exerciseCount: number;
  totalSets: number;
  estimatedMinutes: number;
};

export function getClientWeekRoutines(data: RemoteData, athleteId: string, weekStart: string): ClientRoutineDay[] {
  return [...rows(data, 'routine')]
    .filter((row) => stringValue(row, 'athlete_id') === athleteId && stringValue(row, 'week_start') === weekStart)
    .sort((a, b) => numberValue(a, 'day') - numberValue(b, 'day'))
    .map((row) => {
      const routineId = stringValue(row, 'id');
      const links = rows(data, 'routine_exercise').filter((link) => stringValue(link, 'routine_id') === routineId);
      const totalSets = links.reduce((sum, link) => {
        const exercise = rows(data, 'exercise').find((e) => stringValue(e, 'id') === stringValue(link, 'exercise_id'));
        return sum + (exercise ? numberValue(exercise, 'sets') : 0);
      }, 0);
      return {
        id: routineId,
        day: numberValue(row, 'day'),
        name: stringValue(row, 'name'),
        week: numberValue(row, 'week'),
        weekStart: stringValue(row, 'week_start'),
        completed: booleanValue(row, 'completed_at'),
        exerciseCount: links.length,
        totalSets,
        estimatedMinutes: numberValue(row, 'estimated_minutes'),
      };
    });
}

/** ¿El alumno tiene rutinas para la semana que arranca en `weekStart`? */
export function hasPlanForWeek(data: RemoteData, athleteId: string, weekStart: string): boolean {
  return rows(data, 'routine').some(
    (row) =>
      stringValue(row, 'athlete_id') === athleteId &&
      String(stringValue(row, 'week_start')).slice(0, 10) === weekStart,
  );
}

/** Lunes siguiente a hoy, en formato YYYY-MM-DD. */
export function getNextWeekStart(now = new Date()): string {
  const date = new Date(now);
  const day = date.getDay();
  const diff = day === 0 ? 1 : 8 - day;
  date.setDate(date.getDate() + diff);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/** Lunes de la semana actual, en formato YYYY-MM-DD. */
export function getCurrentWeekStart(now = new Date()): string {
  const date = new Date(now);
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/** Número de semana (1-5) del mes para una fecha YYYY-MM-DD (cuenta los lunes del mes). */
export function weekIndexOf(weekStart: string): number {
  const [year, month, day] = weekStart.split('-').map(Number);
  const target = new Date(year, month - 1, day);
  const mondays: Date[] = [];
  const daysInMonth = new Date(year, month, 0).getDate();
  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(year, month - 1, d);
    if (date.getDay() === 1) mondays.push(date);
  }
  const index = mondays.findIndex((m) => m.getTime() === target.getTime());
  return index >= 0 ? index + 1 : 1;
}

/** Última sesión completada del alumno (máximo routine.completed_at), o null. */
export function getClientLastSession(data: RemoteData, athleteId: string): string | null {
  let latest: string | null = null;
  for (const row of rows(data, 'routine')) {
    if (stringValue(row, 'athlete_id') !== athleteId) continue;
    const completedAt = stringValue(row, 'completed_at');
    if (!completedAt) continue;
    if (!latest || completedAt > latest) latest = completedAt;
  }
  return latest;
}

export function getHistory(data: RemoteData): SessionRecord[] {
  return [...rows(data, 'session')]
    .sort((a, b) => stringValue(b, 'date').localeCompare(stringValue(a, 'date')))
    .map((row) => ({
      id: stringValue(row, 'id'),
      date: new Date(stringValue(row, 'date')),
      name: stringValue(row, 'name'),
      minutes: numberValue(row, 'minutes'),
      sets: numberValue(row, 'sets'),
      volume: numberValue(row, 'volume'),
      completion: numberValue(row, 'completion'),
    }));
}

export function getHistorySummary(data: RemoteData) {
  return {
    sessions: getMetaNumber(data, 'history_sessions'),
    totalMinutes: getMetaNumber(data, 'history_minutes'),
    completion: getMetaNumber(data, 'history_completion'),
  };
}

export function getMonthGrid(data: RemoteData): DayMark[] {
  return [...rows(data, 'month_day')]
    .sort((a, b) => numberValue(a, 'day_index') - numberValue(b, 'day_index'))
    .map((row) => stringValue(row, 'mark') as DayMark);
}

export function getOverloadRows(data: RemoteData, exerciseId: string): OverloadRow[] {
  return [...rows(data, 'overload_row')]
    .filter((row) => row.exercise_id === exerciseId)
    .sort((a, b) => numberValue(a, 'set_no') - numberValue(b, 'set_no'))
    .map((row) => ({
      set: numberValue(row, 'set_no'),
      lastLoad: numberValue(row, 'last_load'),
      lastReps: numberValue(row, 'last_reps'),
      nextLoad: numberValue(row, 'next_load'),
      nextReps: numberValue(row, 'next_reps'),
    }));
}

export function getWeeklyVolume(data: RemoteData): number[] {
  return [...rows(data, 'weekly_volume')]
    .sort((a, b) => numberValue(a, 'week') - numberValue(b, 'week'))
    .map((row) => numberValue(row, 'volume'));
}

export function getProgressSummary(data: RemoteData) {
  return {
    topLoad: getMetaNumber(data, 'progress_top_load'),
    windowLabel: getMeta(data, 'progress_window'),
    growth: getMeta(data, 'progress_growth'),
  };
}

export type SettingRow = { id: string; label: string; value: string; accent: boolean };

export function getSettings(data: RemoteData, role: 'athlete' | 'coach'): SettingRow[] {
  return [...rows(data, 'setting')]
    .filter((row) => row.role === role)
    .sort((a, b) => numberValue(a, 'position') - numberValue(b, 'position'))
    .map((row) => ({
      id: stringValue(row, 'id'),
      label: stringValue(row, 'label'),
      value: stringValue(row, 'value'),
      accent: booleanValue(row, 'accent'),
    }));
}

export type TemplateRow = { id: string; name: string; meta: string; assigned: string | null };

export function getTemplates(data: RemoteData): TemplateRow[] {
  return [...rows(data, 'template')]
    .sort((a, b) => numberValue(a, 'position') - numberValue(b, 'position'))
    .map((row) => ({
      id: stringValue(row, 'id'),
      name: stringValue(row, 'name'),
      meta: stringValue(row, 'meta'),
      assigned: row.assigned === null || row.assigned === undefined ? null : stringValue(row, 'assigned'),
    }));
}

export type ThreadRow = {
  clientId: string;
  name: string;
  preview: string;
  when: string;
  unread: boolean;
};

export function getThreads(data: RemoteData): ThreadRow[] {
  return [...rows(data, 'thread')]
    .sort((a, b) => numberValue(a, 'position') - numberValue(b, 'position'))
    .map((row) => ({
      clientId: stringValue(row, 'client_id'),
      name: getClient(data, stringValue(row, 'client_id'))?.name ?? '',
      preview: stringValue(row, 'preview'),
      when: stringValue(row, 'when_label'),
      unread: booleanValue(row, 'unread'),
    }));
}

export function getImportLines(data: RemoteData): ImportedExercise[] {
  return [...rows(data, 'import_line')]
    .sort((a, b) => numberValue(a, 'position') - numberValue(b, 'position'))
    .map((row) => ({
      id: stringValue(row, 'id'),
      name: stringValue(row, 'name'),
      sets: numberValue(row, 'sets'),
      reps: String(numberValue(row, 'reps')),
      load: nullableNumber(row, 'load'),
      rest: numberValue(row, 'rest'),
      day: numberValue(row, 'day', 1),
      uncertain: booleanValue(row, 'uncertain'),
      raw: row.raw === null || row.raw === undefined ? undefined : stringValue(row, 'raw'),
      question: row.question === null || row.question === undefined ? undefined : stringValue(row, 'question'),
      options:
        row.option_a !== null && row.option_a !== undefined && row.option_b !== null && row.option_b !== undefined
          ? [stringValue(row, 'option_a'), stringValue(row, 'option_b')]
          : undefined,
    }));
}

export type SetLog = {
  id: number;
  exerciseId: string;
  setIndex: number;
  load: number | null;
  reps: number;
  loggedAt: string;
};

export function getRecentSetLogs(data: RemoteData, exerciseId: string, limit = 8): SetLog[] {
  return [...rows(data, 'set_log')]
    .filter((row) => row.exercise_id === exerciseId)
    .sort((a, b) => stringValue(b, 'logged_at').localeCompare(stringValue(a, 'logged_at')))
    .slice(0, limit)
    .map((row) => ({
      id: numberValue(row, 'id'),
      exerciseId: stringValue(row, 'exercise_id'),
      setIndex: numberValue(row, 'set_index'),
      load: nullableNumber(row, 'load'),
      reps: numberValue(row, 'reps'),
      loggedAt: stringValue(row, 'logged_at'),
    }));
}

export function getSetLogCount(data: RemoteData): number {
  return rows(data, 'set_log').length;
}
