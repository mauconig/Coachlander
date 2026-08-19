import type { RemoteData } from '@/state/RemoteState';
import type {
  AthleteExerciseGoal,
  AthleteExerciseProgress,
  AthleteProgressExercise,
  AthleteProgressMuscle,
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
const stringArrayValue = (row: Row | undefined, key: string): string[] =>
  Array.isArray(row?.[key]) ? (row?.[key] as unknown[]).filter((value): value is string => typeof value === 'string') : [];

const MUSCLE_LABELS: Record<string, string> = {
  pecho: 'Pecho',
  espalda: 'Espalda',
  espalda_baja: 'Espalda baja',
  hombros: 'Hombros',
  brazos: 'Brazos',
  piernas: 'Piernas',
  core: 'Core',
  otros: 'Otros',
};
const MUSCLE_DETAIL_KEYS = new Set([
  'pecho',
  'espalda',
  'espalda_baja',
  'hombros',
  'brazos',
  'gluteos',
  'cuadriceps',
  'cadena_posterior',
  'pantorrillas',
  'core',
  'otros',
]);
const LEG_KEYS = new Set(['gluteos', 'cuadriceps', 'cadena_posterior', 'pantorrillas']);

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
  const athleteId = data.user?.id;
  const assignedRoutine =
    data.user?.role === 'athlete' && !data.user.soloTraining
      ? rows(data, 'routine')
          .filter((routine) => stringValue(routine, 'athlete_id') === athleteId && stringValue(routine, 'coach_id'))
          .sort((a, b) => Number(b.is_today) - Number(a.is_today))[0]
      : undefined;
  const assignedCoachId = stringValue(assignedRoutine, 'coach_id');
  const row = assignedCoachId
    ? rows(data, 'coach').find((coach) => stringValue(coach, 'id') === assignedCoachId)
    : data.user?.role === 'athlete' && !data.user.soloTraining
      ? undefined
      : first(data, 'coach');
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
  const athleteId = data.user?.id;
  const completedRoutines = rows(data, 'routine').filter(
    (routine) =>
      (!athleteId || stringValue(routine, 'athlete_id') === athleteId) &&
      (Boolean(stringValue(routine, 'completed_at')) || stringValue(routine, 'session_status') === 'partial'),
  );
  const totalSessions = completedRoutines.length;
  const completedWeeks = new Set(
    completedRoutines.map((routine) =>
      weekStartFromDate(dateOnly(stringValue(routine, 'completed_at') || stringValue(routine, 'session_ended_at'))),
    ),
  );
  const streakWeeks = consecutiveWeekCount(completedWeeks);
  return {
    name: data.user?.displayName ?? stringValue(row, 'name'),
    firstName: data.user?.firstName ?? stringValue(row, 'first_name'),
    goal: data.user?.goal ?? stringValue(row, 'goal'),
    weightKg: data.user?.weightKg ?? numberValue(row, 'weight_kg'),
    heightM: data.user?.heightM ?? numberValue(row, 'height_m'),
    totalSessions: totalSessions || numberValue(row, 'total_sessions'),
    streakWeeks: streakWeeks || numberValue(row, 'streak_weeks'),
  };
}

const toExercise = (row: Row): Exercise => {
  const lastDate = stringValue(row, 'last_date');
  const lastLoad = nullableNumber(row, 'last_load');
  const lastReps = stringValue(row, 'last_reps');
  const catalogFocus = stringValue(row, 'catalog_focus');
  const catalogMuscleGroups = stringArrayValue(row, 'catalog_muscle_groups');
  const catalogSteps = stringArrayValue(row, 'catalog_instruction_steps');
  return {
    id: stringValue(row, 'id'),
    catalogId: stringValue(row, 'catalog_id') || undefined,
    name: stringValue(row, 'name'),
    scheme: stringValue(row, 'scheme'),
    suggested: numberValue(row, 'suggested'),
    sets: numberValue(row, 'sets'),
    work: numberValue(row, 'work'),
    rest: numberValue(row, 'rest'),
    focus: catalogFocus || stringValue(row, 'focus'),
    muscleGroups: resolveMuscleGroups(
      stringValue(row, 'name'),
      catalogFocus || stringValue(row, 'focus'),
      catalogMuscleGroups.length ? catalogMuscleGroups : row?.muscle_groups,
    ),
    nameEn: stringValue(row, 'catalog_name_en') || undefined,
    equipment: stringValue(row, 'catalog_equipment') || undefined,
    target: stringValue(row, 'catalog_target') || undefined,
    secondaryMuscles: stringArrayValue(row, 'catalog_secondary_muscles'),
    instructions: stringValue(row, 'catalog_instructions') || undefined,
    instructionSteps: catalogSteps.length ? catalogSteps : undefined,
    imageUrl: stringValue(row, 'catalog_image_url') || undefined,
    gifUrl: stringValue(row, 'catalog_gif_url') || undefined,
    attribution: stringValue(row, 'catalog_attribution') || undefined,
    cues: stringValue(row, 'cues'),
    overload: nullableNumber(row, 'overload'),
    loadSource: stringValue(row, 'load_source') === 'ai' ? 'ai' : 'coach',
    loadReason: stringValue(row, 'load_reason'),
    progressionMetric:
      stringValue(row, 'progression_metric') === 'seconds'
        ? 'seconds'
        : stringValue(row, 'progression_metric') === 'reps'
          ? 'reps'
          : 'load',
    targetReps: numberValue(row, 'target_reps'),
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

const toCatalogExercise = (row: Row): Exercise => {
  const name = stringValue(row, 'name_es', stringValue(row, 'name_en'));
  const equipment = stringValue(row, 'equipment_es', stringValue(row, 'equipment_en'));
  const steps = stringArrayValue(row, 'instruction_steps_es');
  return {
    id: stringValue(row, 'id'),
    name,
    nameEn: stringValue(row, 'name_en'),
    scheme: '3 × 8',
    suggested: 0,
    sets: 3,
    work: 30,
    rest: 90,
    focus: stringValue(row, 'body_part_es', stringValue(row, 'category_es')),
    equipment,
    target: stringValue(row, 'target_es', stringValue(row, 'target_en')),
    secondaryMuscles: stringArrayValue(row, 'secondary_muscles_es'),
    instructions: stringValue(row, 'instructions_es'),
    instructionSteps: steps,
    imageUrl: stringValue(row, 'image_url') || undefined,
    gifUrl: stringValue(row, 'gif_url') || undefined,
    attribution: stringValue(row, 'attribution') || undefined,
    muscleGroups: resolveMuscleGroups(name, stringValue(row, 'focus'), row?.muscle_groups),
    cues: steps.join('\n') || stringValue(row, 'instructions_es'),
    overload: null,
    loadSource: 'coach',
    loadReason: 'Ejercicio de la biblioteca.',
    progressionMetric: /peso corporal|body weight/i.test(equipment) ? 'reps' : 'load',
    targetReps: 8,
  };
};

export function getExercises(data: RemoteData): Exercise[] {
  const catalog = rows(data, 'exercise_catalog');
  return catalog.length ? catalog.map(toCatalogExercise).sort((a, b) => a.name.localeCompare(b.name)) : rows(data, 'exercise').map(toExercise);
}

export function getCatalogExercises(data: RemoteData): Exercise[] {
  return getExercises(data);
}

function exerciseKey(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function catalogAliases(name: string): string[] {
  const key = exerciseKey(name);
  const aliases: Record<string, string[]> = {
    'press de pecho': ['bench press', 'chest press'],
    'remo sentado': ['seated row', 'cable row'],
    'sentadilla goblet': ['goblet squat'],
    'sentadilla con barra smith': ['smith full squat'],
    'peso muerto rumano': ['romanian deadlift'],
    plancha: ['plank'],
  };
  return aliases[key] ?? [];
}

function findCatalogMatch(catalog: Exercise[], exercise: Exercise): Exercise | undefined {
  const aliases = catalogAliases(exercise.name);
  return catalog.find(
    (item) =>
      exerciseKey(item.name) === exerciseKey(exercise.name) ||
      item.nameEn === exercise.name ||
      aliases.some((alias) => exerciseKey(item.nameEn ?? '').includes(exerciseKey(alias))),
  );
}

function resolveMuscleGroups(name: string, focus: string, storedGroups: unknown): string[] {
  const stored = Array.isArray(storedGroups)
    ? storedGroups.filter((group): group is string => typeof group === 'string' && MUSCLE_DETAIL_KEYS.has(group))
    : [];
  if (stored.length) return [...new Set(stored)];

  const text = exerciseKey(`${name} ${focus}`);
  const groups: string[] = [];
  if (/pecho|pectoral|press banca|press pecho|empuje/.test(text)) groups.push('pecho');
  if (/espalda|remo|dorsal|tiron|pull/.test(text)) groups.push('espalda');
  if (/espalda baja|lumbar|lumbares|erector/.test(text)) groups.push('espalda_baja');
  if (/hombro|deltoid|press militar|empuje/.test(text)) groups.push('hombros');
  if (/brazo|biceps|triceps|curl|extension/.test(text)) groups.push('brazos');
  if (/gluteo|glute|hip thrust|puente|sentadilla|zancada/.test(text)) groups.push('gluteos');
  if (/cuadriceps|pierna|sentadilla|zancada|prensa|extension de pierna/.test(text)) groups.push('cuadriceps');
  if (/posterior|isquio|femoral|peso muerto|rumano/.test(text)) groups.push('cadena_posterior');
  if (/pantorrilla|gemelo|talon/.test(text)) groups.push('pantorrillas');
  if (/core|plancha|abdomen|oblicuo/.test(text)) groups.push('core');
  return groups.length ? [...new Set(groups)] : ['otros'];
}

function primaryMuscleKey(group: string): string {
  return LEG_KEYS.has(group) ? 'piernas' : MUSCLE_LABELS[group] ? group : 'otros';
}

function dateOnly(value: string): string {
  if (!value) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value.slice(0, 10);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Asuncion',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(parsed);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function weekStartFromDate(value: string): string {
  if (!value) return '';
  const date = new Date(`${value}T00:00:00Z`);
  const day = date.getUTCDay();
  date.setUTCDate(date.getUTCDate() + (day === 0 ? -6 : 1 - day));
  return date.toISOString().slice(0, 10);
}

function consecutiveWeekCount(weeks: Set<string>): number {
  if (!weeks.size) return 0;
  const ordered = [...weeks].filter(Boolean).sort().reverse();
  let count = 1;
  for (let index = 1; index < ordered.length; index += 1) {
    const previous = new Date(`${ordered[index - 1]}T00:00:00Z`);
    const current = new Date(`${ordered[index]}T00:00:00Z`);
    const difference = Math.round((previous.getTime() - current.getTime()) / 86400000);
    if (difference !== 7) break;
    count += 1;
  }
  return count;
}

function progressRank(routine: Row, exercise: Row): string {
  return `${dateOnly(stringValue(routine, 'completed_at'))}-${dateOnly(stringValue(routine, 'week_start'))}-${String(numberValue(routine, 'day')).padStart(2, '0')}-${stringValue(exercise, 'id')}`;
}

/** Exercises shown in athlete progress: only worked, completed snapshots. */
export function getProgressExercises(data: RemoteData): AthleteProgressExercise[] {
  const athleteId = data.user?.id;
  if (!athleteId) return [];

  const routines = rows(data, 'routine').filter(
    (routine) => routine.athlete_id === athleteId && Boolean(stringValue(routine, 'completed_at')),
  );
  const routineById = new Map(routines.map((routine) => [stringValue(routine, 'id'), routine]));
  const exerciseById = new Map(rows(data, 'exercise').map((exercise) => [stringValue(exercise, 'id'), exercise]));
  const loggedPairs = new Set(
    rows(data, 'set_log')
      .filter((log) => routineById.has(stringValue(log, 'routine_id')))
      .map((log) => `${stringValue(log, 'routine_id')}|${stringValue(log, 'exercise_id')}`),
  );
  const routineByExercise = new Map<string, { exercise: Row; routine: Row; routineIds: Set<string> }>();

  for (const link of rows(data, 'routine_exercise')) {
    const routine = routineById.get(stringValue(link, 'routine_id'));
    if (!routine) continue;
    const exercise = exerciseById.get(stringValue(link, 'exercise_id'));
    if (!exercise) continue;
    const routineId = stringValue(routine, 'id');
    const exerciseId = stringValue(exercise, 'id');
    if (!loggedPairs.has(`${routineId}|${exerciseId}`)) continue;

    const key = exerciseKey(stringValue(exercise, 'name'));
    const current = routineByExercise.get(key);
    if (!current || progressRank(routine, exercise) > progressRank(current.routine, current.exercise)) {
      routineByExercise.set(key, { exercise, routine, routineIds: current?.routineIds ?? new Set() });
    }
    routineByExercise.get(key)?.routineIds.add(routineId);
  }

  return [...routineByExercise.entries()]
    .map(([key, { exercise, routine, routineIds }]) => ({
      ...toExercise(exercise),
      key,
      sessions: routineIds.size,
      lastDate: dateOnly(stringValue(routine, 'completed_at')),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function getProgressMuscles(data: RemoteData): AthleteProgressMuscle[] {
  const groups = new Map<string, Map<string, AthleteProgressExercise>>();
  for (const exercise of getProgressExercises(data)) {
    for (const detailGroup of exercise.muscleGroups) {
      const key = primaryMuscleKey(detailGroup);
      const exercises = groups.get(key) ?? new Map<string, AthleteProgressExercise>();
      exercises.set(exercise.key, exercise);
      groups.set(key, exercises);
    }
  }

  return [...groups.entries()]
    .map(([key, exercises]) => ({ key, label: MUSCLE_LABELS[key] ?? 'Otros', exercises: [...exercises.values()].sort((a, b) => a.name.localeCompare(b.name)) }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

export type AthleteProgressRange = '6 SEMANAS' | '3 MESES' | 'TODO';

function rangeStart(range: AthleteProgressRange, now = new Date()): string | null {
  if (range === 'TODO') return null;
  const start = new Date(now);
  if (range === '6 SEMANAS') start.setDate(start.getDate() - 41);
  else start.setMonth(start.getMonth() - 3);
  return `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-${String(start.getDate()).padStart(2, '0')}`;
}

function targetReps(row: Row | undefined): number {
  const explicit = numberValue(row, 'target_reps');
  const numbers = stringValue(row, 'scheme').match(/\d+/g) ?? [];
  // For a range such as 8-10, reaching the minimum (8) is a valid target.
  // Older snapshots stored the upper bound in target_reps, so prefer the
  // lower bound whenever the scheme explicitly contains a range.
  if (numbers.length >= 2 && /\d+\s*[-–]\s*\d+/.test(stringValue(row, 'scheme'))) return Number(numbers[0]) || explicit;
  return explicit > 0 ? explicit : Number(numbers[0]) || 0;
}

function progressionMetric(row: Row | undefined): 'load' | 'reps' | 'seconds' {
  const value = stringValue(row, 'progression_metric');
  return value === 'seconds' ? 'seconds' : value === 'reps' ? 'reps' : 'load';
}

function mapAthleteGoal(row: Row | undefined): AthleteExerciseGoal | null {
  if (!row) return null;
  return {
    baselineDate: dateOnly(stringValue(row, 'baseline_date')),
    baselineLoadKg: nullableNumber(row, 'baseline_load_kg'),
    baselineReps: numberValue(row, 'baseline_reps'),
    targetDate: dateOnly(stringValue(row, 'target_date')),
    targetLoadKg: nullableNumber(row, 'target_load_kg'),
    targetReps: numberValue(row, 'target_reps'),
    note: stringValue(row, 'note'),
  };
}

export function getAthleteExerciseProgress(
  data: RemoteData,
  selectedKey: string,
  range: AthleteProgressRange,
): AthleteExerciseProgress | null {
  const athleteId = data.user?.id;
  if (!athleteId || !selectedKey) return null;

  const routines = rows(data, 'routine').filter(
    (routine) => routine.athlete_id === athleteId && Boolean(stringValue(routine, 'completed_at')),
  );
  const routineById = new Map(routines.map((routine) => [stringValue(routine, 'id'), routine]));
  const exerciseById = new Map(rows(data, 'exercise').map((exercise) => [stringValue(exercise, 'id'), exercise]));
  const exerciseKeyById = new Map(
    [...exerciseById.entries()].map(([id, exercise]) => [id, exerciseKey(stringValue(exercise, 'name'))]),
  );
  const linkedPairs = new Set(
    rows(data, 'routine_exercise')
      .filter((link) => routineById.has(stringValue(link, 'routine_id')) && exerciseKeyById.get(stringValue(link, 'exercise_id')) === selectedKey)
      .map((link) => `${stringValue(link, 'routine_id')}|${stringValue(link, 'exercise_id')}`),
  );
  const sessions = new Map<string, { date: string; logs: Row[] }>();

  for (const log of rows(data, 'set_log')) {
    const routineId = stringValue(log, 'routine_id');
    const exerciseId = stringValue(log, 'exercise_id');
    if (!linkedPairs.has(`${routineId}|${exerciseId}`)) continue;
    const routine = routineById.get(routineId);
    if (!routine) continue;
    const current = sessions.get(routineId) ?? { date: dateOnly(stringValue(routine, 'completed_at')), logs: [] };
    current.logs.push(log);
    sessions.set(routineId, current);
  }

  const selectedExercise = getProgressExercises(data).find((exercise) => exercise.key === selectedKey);
  if (!selectedExercise || !sessions.size) return null;
  const snapshot = exerciseById.get(selectedExercise.id);
  const metric = progressionMetric(snapshot);
  const target = targetReps(snapshot) || selectedExercise.targetReps || 0;
  const allLogs = [...sessions.values()].flatMap((session) => session.logs);
  const bodyweight = metric === 'reps' || (metric === 'load' && allLogs.every((log) => (nullableNumber(log, 'load') ?? 0) <= 0));
  const from = rangeStart(range);
  const points = [...sessions.values()]
    .filter((session) => !from || session.date >= from)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((session) => {
      const bestReps = [...session.logs].sort((a, b) => numberValue(b, 'reps') - numberValue(a, 'reps'))[0];
      const validLogs = session.logs
        .filter((log) => metric === 'load' && !bodyweight ? (nullableNumber(log, 'load') ?? 0) > 0 && numberValue(log, 'reps') >= target : numberValue(log, 'reps') >= target)
        .sort((a, b) => {
          const loadDelta = (nullableNumber(b, 'load') ?? 0) - (nullableNumber(a, 'load') ?? 0);
          return metric === 'load' && !bodyweight ? loadDelta || numberValue(b, 'reps') - numberValue(a, 'reps') : numberValue(b, 'reps') - numberValue(a, 'reps');
        });
      const best = validLogs[0];
      const meetsTarget = Boolean(best);
      const bestLoad = best ? nullableNumber(best, 'load') : null;
      const bestValue = meetsTarget
        ? metric === 'load' && !bodyweight
          ? bestLoad
          : numberValue(best, 'reps')
        : null;
      return {
        date: session.date,
        label: session.date.split('-').slice(1).reverse().join('/'),
        value: bestValue,
        loadKg: metric === 'load' && !bodyweight ? bestLoad : null,
        reps: bestReps ? numberValue(bestReps, 'reps') : null,
        meetsTarget,
      };
    });

  const goalRow = rows(data, 'client_exercise_goal').find(
    (row) => exerciseKey(stringValue(row, 'exercise_key')) === selectedKey || exerciseKey(stringValue(row, 'exercise_name')) === selectedKey,
  );

  return {
    exercise: {
      key: selectedKey,
      name: selectedExercise.name,
      targetReps: target,
      progressionMetric: metric,
      bodyweight,
    },
    points,
    goal: mapAthleteGoal(goalRow),
  };
}

export function getExercise(data: RemoteData, id: string): Exercise | null {
  const row = rows(data, 'exercise').find((item) => item.id === id);
  if (row) {
    const exercise = toExercise(row);
    const catalog = findCatalogMatch(getCatalogExercises(data), exercise);
    return catalog
      ? {
          ...exercise,
          nameEn: catalog.nameEn,
          equipment: catalog.equipment,
          target: catalog.target,
          secondaryMuscles: catalog.secondaryMuscles,
          instructions: catalog.instructions,
          instructionSteps: catalog.instructionSteps,
          imageUrl: catalog.imageUrl,
          gifUrl: catalog.gifUrl,
          attribution: catalog.attribution,
          muscleGroups: exercise.muscleGroups.length ? exercise.muscleGroups : catalog.muscleGroups,
        }
      : exercise;
  }
  const catalogRow = rows(data, 'exercise_catalog').find((item) => item.id === id);
  return catalogRow ? toCatalogExercise(catalogRow) : null;
}

export function getTodayRoutine(data: RemoteData): Routine {
  const routineRows =
    data.user?.role === 'athlete'
      ? rows(data, 'routine').filter((row) => row.athlete_id === data.user?.id)
      : rows(data, 'routine');

  let routineRow: Row | undefined;
  if (data.user?.role === 'athlete' && !data.user.soloTraining) {
    // Atleta con entrenador: la rutina de la semana actual (calendario real).
    const currentWeek = getCurrentWeekStart();
    const weekRows = routineRows.filter((row) => String(stringValue(row, 'week_start')).slice(0, 10) === currentWeek);
    routineRow = weekRows.find((row) => booleanValue(row, 'is_today')) ?? weekRows[0];
  } else {
    routineRow =
      routineRows.find((row) => booleanValue(row, 'is_today')) ??
      (data.user?.role === 'athlete' ? undefined : routineRows[0]);
  }

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
    weekStart: stringValue(routineRow, 'week_start').slice(0, 10) || undefined,
    completedAt: stringValue(routineRow, 'completed_at') || undefined,
    sessionStatus: (stringValue(routineRow, 'session_status') || (stringValue(routineRow, 'completed_at') ? 'completed' : 'scheduled')) as Routine['sessionStatus'],
    sessionEndedAt: stringValue(routineRow, 'session_ended_at') || undefined,
    loadMode: stringValue(routineRow, 'load_mode') === 'ai' ? 'ai' : 'coach',
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

/** Arma un Routine completo (con ejercicios) a partir de un id de rutina. */
export function getRoutineById(data: RemoteData, routineId: string): Routine | null {
  const routineRow = rows(data, 'routine').find((row) => stringValue(row, 'id') === routineId);
  if (!routineRow) return null;
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
    weekStart: stringValue(routineRow, 'week_start').slice(0, 10) || undefined,
    completedAt: stringValue(routineRow, 'completed_at') || undefined,
    sessionStatus: (stringValue(routineRow, 'session_status') || (stringValue(routineRow, 'completed_at') ? 'completed' : 'scheduled')) as Routine['sessionStatus'],
    sessionEndedAt: stringValue(routineRow, 'session_ended_at') || undefined,
    loadMode: stringValue(routineRow, 'load_mode') === 'ai' ? 'ai' : 'coach',
    exercises,
  };
}

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
    const weekStart = stringValue(row, 'week_start').slice(0, 10);
    if (stringValue(row, 'athlete_id') === athleteId && weekStart) {
      weeks.add(weekStart);
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
    .filter(
      (row) =>
        stringValue(row, 'athlete_id') === athleteId &&
        stringValue(row, 'week_start').slice(0, 10) === weekStart,
    )
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
        weekStart: stringValue(row, 'week_start').slice(0, 10),
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
  if (data.user?.role === 'athlete') {
    const athleteId = data.user.id;
    return rows(data, 'routine')
      .filter(
        (routine) =>
          stringValue(routine, 'athlete_id') === athleteId &&
          (Boolean(stringValue(routine, 'completed_at')) || stringValue(routine, 'session_status') === 'partial'),
      )
      .sort((a, b) => {
        const dateA = stringValue(a, 'completed_at') || stringValue(a, 'session_ended_at');
        const dateB = stringValue(b, 'completed_at') || stringValue(b, 'session_ended_at');
        return dateB.localeCompare(dateA);
      })
      .map((routine) => {
        const routineId = stringValue(routine, 'id');
        const logs = rows(data, 'set_log').filter((log) => stringValue(log, 'routine_id') === routineId);
        const volume = logs.reduce(
          (total, log) => total + (nullableNumber(log, 'load') ?? 0) * numberValue(log, 'reps'),
          0,
        );
        const status = stringValue(routine, 'session_status') === 'partial' ? 'partial' : 'completed';
        const date = dateOnly(stringValue(routine, 'completed_at') || stringValue(routine, 'session_ended_at'));
        return {
          id: routineId,
          date: new Date(`${date}T12:00:00`),
          name: stringValue(routine, 'name'),
          minutes: status === 'completed' ? numberValue(routine, 'estimated_minutes') : 0,
          sets: logs.length,
          volume,
          // A completed routine is a completed session; it is not a target score.
          completion: status === 'completed' ? 100 : 0,
          status,
        };
      });
  }

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
      status: 'completed',
    }));
}

export function getHistorySummary(data: RemoteData) {
  const history = getHistory(data);
  const completed = history.filter((session) => session.status === 'completed').length;
  return {
    sessions: history.length || getMetaNumber(data, 'history_sessions'),
    totalMinutes: history.reduce((total, session) => total + session.minutes, 0) || getMetaNumber(data, 'history_minutes'),
    completion: history.length ? Math.round((completed / history.length) * 100) : getMetaNumber(data, 'history_completion'),
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

export type TemplateExercise = {
  id: string;
  day: number;
  position: number;
  name: string;
  sets: number;
  reps: string;
  loadKg: number | null;
  note: string;
  progressionMetric?: 'load' | 'reps' | 'seconds';
};

export type TemplateDay = {
  day: number;
  name: string;
  exercises: TemplateExercise[];
};

export type TemplateDetail = TemplateRow & { days: TemplateDay[] };

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

export function getTemplateById(data: RemoteData, templateId: string): TemplateDetail | null {
  const template = getTemplates(data).find((item) => item.id === templateId);
  if (!template) return null;

  const templateDays = rows(data, 'template_day')
    .filter((row) => stringValue(row, 'template_id') === templateId)
    .sort((a, b) => numberValue(a, 'day') - numberValue(b, 'day'));
  const templateExercises = rows(data, 'template_exercise');

  return {
    ...template,
    days: templateDays.map((dayRow) => {
      const day = numberValue(dayRow, 'day');
      return {
        day,
        name: stringValue(dayRow, 'name', `Día ${day}`),
        exercises: templateExercises
          .filter((row) => stringValue(row, 'template_id') === templateId && numberValue(row, 'day') === day)
          .sort((a, b) => numberValue(a, 'position') - numberValue(b, 'position'))
          .map((row) => ({
            id: `${templateId}-${day}-${numberValue(row, 'position')}`,
            day,
            position: numberValue(row, 'position'),
            name: stringValue(row, 'name'),
            sets: numberValue(row, 'sets', 3),
            reps: stringValue(row, 'reps', '8-10'),
            loadKg: nullableNumber(row, 'load_kg'),
            note: stringValue(row, 'note'),
            progressionMetric:
              stringValue(row, 'progression_metric') === 'seconds'
                ? 'seconds'
                : stringValue(row, 'progression_metric') === 'reps'
                  ? 'reps'
                  : 'load',
          })),
      };
    }),
  };
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
