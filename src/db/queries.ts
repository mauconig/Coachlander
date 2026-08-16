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
