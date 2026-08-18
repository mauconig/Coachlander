import { API_BASE_URL } from '@/config/runtime';
import type { ImportedRoutineDay } from '@/data/types';

export type TokenProvider = () => Promise<string | null>;

export type RemoteBootstrap = {
  user: {
    id: string;
    email: string | null;
    role: 'athlete' | 'coach';
    displayName: string | null;
    firstName: string | null;
    goal: string | null;
    weightKg: number | null;
    heightM: number | null;
    soloTraining: boolean;
    isAdmin: boolean;
  };
  tables: Record<string, Record<string, unknown>[]>;
};

export type SetLogInput = {
  routineId: string;
  exerciseId: string;
  setIndex: number;
  load: number | null;
  reps: number;
};

export type ParseRoutineInput = {
  text: string;
  weightKg: number | null;
  heightM: number | null;
};

export type ParseRoutineResult = {
  routineName: string;
  days: ImportedRoutineDay[];
  exercises: ImportedRoutineDay['exercises'];
};

export type SaveImportedRoutineInput = {
  routineName: string;
  days: ImportedRoutineDay[];
  autoOverload: boolean;
};

class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

async function request<T>(
  tokenProvider: TokenProvider,
  path: string,
  init?: RequestInit,
): Promise<T> {
  const token = await tokenProvider();
  if (!token) throw new ApiError(401, 'No hay una sesión de Clerk activa');

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...init?.headers,
    },
  });

  if (!response.ok) {
    let message = `API ${response.status}`;
    try {
      const body = (await response.json()) as { error?: string };
      if (body.error) message = body.error;
    } catch {
      // Keep the HTTP status when the server did not return JSON.
    }
    throw new ApiError(response.status, message);
  }

  return (await response.json()) as T;
}

async function publicRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  });

  if (!response.ok) {
    let message = `API ${response.status}`;
    try {
      const body = (await response.json()) as { error?: string };
      if (body.error) message = body.error;
    } catch {
      // Keep the HTTP status when the server did not return JSON.
    }
    throw new ApiError(response.status, message);
  }

  return (await response.json()) as T;
}

export function resetEphemeralTestAccount(email: string, password: string) {
  return publicRequest<{ ok: true }>('/v1/test-accounts/ephemeral/reset', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

export function deleteEphemeralTestAccount(tokenProvider: TokenProvider) {
  return request<{ ok: true }>(tokenProvider, '/v1/test-accounts/ephemeral', {
    method: 'DELETE',
  });
}

export function getBootstrap(tokenProvider: TokenProvider) {
  return request<RemoteBootstrap>(tokenProvider, '/v1/bootstrap');
}

export type CoachHistorySession = {
  id: string;
  clientId: string;
  clientName: string;
  date: string;
  name: string;
  minutes: number;
  sets: number;
  volumeKg: number;
  completion: number;
};

export type CoachHistorySet = {
  setIndex: number;
  load: number | null;
  reps: number;
};

export type CoachHistoryExercise = {
  id: string;
  name: string;
  plannedSets: number;
  scheme: string;
  suggested: number;
  loadSource: 'ai' | 'coach';
  loadReason: string;
  progressionMetric: 'load' | 'reps' | 'seconds';
  targetReps: number;
  sets: CoachHistorySet[];
};

export type CoachHistoryDetail = {
  id: string;
  clientId: string;
  clientName: string;
  date: string;
  name: string;
  minutes: number;
  loadMode: 'ai' | 'coach';
  exercises: CoachHistoryExercise[];
};

export type CoachStatistics = {
  scope: {
    clientId: string | null;
    from: string;
    to: string;
  };
  summary: {
    clientCount: number;
    activeNow: number;
    scheduledRoutines: number;
    completedRoutines: number;
    completionRate: number;
    sessions: number;
    totalMinutes: number;
    volumeKg: number;
  };
  weeklyVolume: Array<{ weekStart: string; label: string; volumeKg: number }>;
  activity: {
    granularity: 'week';
    buckets: CoachWeeklyActivity[];
  };
  heatmap: {
    items: CoachHeatmapItem[];
    weeks: CoachWeeklyActivity[];
  };
  weekdayActivity?: {
    items: CoachWeekdayActivityItem[];
  };
  muscleBalance: CoachMuscleBalance;
  recentSessions: CoachHistorySession[];
};

export type CoachHeatmapItem = {
  date: string;
  sessions: number;
  minutes: number;
};

export type CoachWeeklyActivity = {
  start: string;
  label: string;
  sessions: number;
  minutes: number;
  daysIncluded: number;
  normalizedSessions: number;
  normalizedMinutes: number;
};

export type CoachWeekdayActivityItem = {
  weekday: 1 | 2 | 3 | 4 | 5 | 6 | 7;
  label: string;
  sessions: number;
  averagePerWeek: number;
  activeWeeks: number;
  percentageOfWeeks: number;
};

export type CoachMuscleBalance = {
  totalSessions: number;
  totalExercises: number;
  weeks: Array<{
    weekStart: string;
    daysIncluded: number;
    sessions: number;
    normalizedSessions: number;
  }>;
  items: Array<CoachMuscleBalanceItem>;
};

export type CoachMuscleBalanceDetail = {
  key: string;
  label: string;
  exercises: number;
  exercisesPerWeek: number;
  percentage: number;
  sessions?: number;
  sessionsPerWeek?: number;
};

export type CoachMuscleBalanceItem = {
    key: string;
    label: string;
    exercises: number;
    exercisesPerWeek: number;
    percentage: number;
    details?: CoachMuscleBalanceDetail[];
    sessions?: number;
    sessionsPerWeek?: number;
};

export type CoachExerciseLibraryItem = {
  key: string;
  name: string;
  sessions: number;
  lastDate: string;
  lastLoad: number | null;
  lastReps: number | null;
};

export type CoachExerciseGoal = {
  baselineDate: string;
  baselineLoadKg: number | null;
  baselineReps: number;
  targetDate: string;
  targetLoadKg: number | null;
  targetReps: number;
  note?: string;
};

export type CoachExerciseProgress = {
  exercise: {
    key: string;
    name: string;
    targetReps: number;
    bodyweight: boolean;
  };
  points: Array<{
    bucketStart: string;
    label: string;
    loadKg: number | null;
    reps: number | null;
    meetsTarget: boolean;
  }>;
  goal: CoachExerciseGoal | null;
};

export type CoachHistoryPage = {
  items: CoachHistorySession[];
  total: number;
  hasMore: boolean;
  weeklyAverages: CoachWeeklyActivity[];
  calendarActivity: {
    items: CoachHeatmapItem[];
    weeks: CoachWeeklyActivity[];
  };
};

function coachStatsQuery(params: { clientId: string | null; from: string; to: string; limit?: number; offset?: number }) {
  const query = new URLSearchParams({
    clientId: params.clientId ?? 'all',
    from: params.from,
    to: params.to,
  });
  if (params.limit !== undefined) query.set('limit', String(params.limit));
  if (params.offset !== undefined) query.set('offset', String(params.offset));
  return query.toString();
}

const PRIMARY_MUSCLE_KEYS = ['pecho', 'espalda', 'espalda_baja', 'hombros', 'brazos', 'piernas', 'core', 'otros'] as const;
const LEG_MUSCLE_KEYS = ['cuadriceps', 'gluteos', 'cadena_posterior', 'pantorrillas'] as const;
const PRIMARY_MUSCLE_LABELS: Record<(typeof PRIMARY_MUSCLE_KEYS)[number], string> = {
  pecho: 'Pecho',
  espalda: 'Espalda',
  espalda_baja: 'Espalda baja',
  hombros: 'Hombros',
  brazos: 'Brazos',
  piernas: 'Piernas',
  core: 'Core',
  otros: 'Otros',
};

function normalizeCoachMuscleBalance(balance: CoachMuscleBalance): CoachMuscleBalance {
  const sourceItems = Array.isArray(balance?.items) ? balance.items : [];
  const byKey = new Map(sourceItems.map((item) => [item.key, item]));
  const metric = (item: Partial<CoachMuscleBalanceItem> | undefined) => Number(item?.exercises ?? item?.sessions) || 0;
  const weeklyMetric = (item: Partial<CoachMuscleBalanceItem> | undefined) => Number(item?.exercisesPerWeek ?? item?.sessionsPerWeek) || 0;
  const fallbackTotal = sourceItems.reduce((total, item) => total + metric(item), 0);
  const totalExercises = Number.isFinite(Number(balance?.totalExercises))
    ? Number(balance.totalExercises)
    : fallbackTotal;
  const percentageFor = (count: number) => totalExercises ? Math.round((count / totalExercises) * 100) : 0;

  const makeDetail = (key: string, raw?: Partial<CoachMuscleBalanceDetail>): CoachMuscleBalanceDetail => {
    const exercises = metric(raw);
    return {
      key,
      label: raw?.label ?? key,
      exercises,
      exercisesPerWeek: weeklyMetric(raw),
      percentage: percentageFor(exercises),
      sessions: exercises,
      sessionsPerWeek: weeklyMetric(raw),
    };
  };

  const rawLegs = byKey.get('piernas');
  const rawDetails = rawLegs?.details?.length
    ? rawLegs.details
    : LEG_MUSCLE_KEYS.map((key) => byKey.get(key)).filter(Boolean) as CoachMuscleBalanceDetail[];
  const generatedLegExercises = rawDetails.reduce((total, item) => total + metric(item), 0);
  const generatedLegs: CoachMuscleBalanceItem = {
    key: 'piernas',
    label: PRIMARY_MUSCLE_LABELS.piernas,
    exercises: metric(rawLegs) || generatedLegExercises,
    exercisesPerWeek: weeklyMetric(rawLegs) || rawDetails.reduce((total, item) => total + weeklyMetric(item), 0),
    percentage: percentageFor(metric(rawLegs) || generatedLegExercises),
    details: rawDetails.map((item) => makeDetail(item.key, item)),
    sessions: metric(rawLegs) || generatedLegExercises,
    sessionsPerWeek: weeklyMetric(rawLegs) || rawDetails.reduce((total, item) => total + weeklyMetric(item), 0),
  };

  return {
    totalSessions: Number(balance?.totalSessions) || 0,
    totalExercises,
    weeks: Array.isArray(balance?.weeks) ? balance.weeks : [],
    items: PRIMARY_MUSCLE_KEYS.map((key) => {
      if (key === 'piernas') return generatedLegs;
      const raw = byKey.get(key);
      const exercises = metric(raw);
      const exercisesPerWeek = weeklyMetric(raw);
      return {
        key,
        label: raw?.label ?? PRIMARY_MUSCLE_LABELS[key],
        exercises,
        exercisesPerWeek,
        percentage: percentageFor(exercises),
        sessions: exercises,
        sessionsPerWeek: exercisesPerWeek,
      };
    }),
  };
}

export function getCoachStatistics(
  tokenProvider: TokenProvider,
  params: { clientId: string | null; from: string; to: string },
) {
  return request<CoachStatistics>(tokenProvider, `/v1/coach/statistics?${coachStatsQuery(params)}`)
    .then((stats) => ({ ...stats, muscleBalance: normalizeCoachMuscleBalance(stats.muscleBalance) }));
}

export function getCoachExerciseLibrary(
  tokenProvider: TokenProvider,
  params: { clientId: string; from: string; to: string },
) {
  return request<{ items: CoachExerciseLibraryItem[] }>(
    tokenProvider,
    `/v1/coach/statistics/exercises?${coachStatsQuery(params)}`,
  );
}

export function getCoachExerciseProgress(
  tokenProvider: TokenProvider,
  params: { clientId: string; exerciseKey: string; from: string; to: string },
) {
  const query = new URLSearchParams(coachStatsQuery(params));
  query.set('exerciseKey', params.exerciseKey);
  return request<CoachExerciseProgress>(tokenProvider, `/v1/coach/statistics/exercises/progress?${query.toString()}`);
}

export function saveCoachExerciseGoal(
  tokenProvider: TokenProvider,
  input: {
    clientId: string;
    exerciseKey: string;
    exerciseName: string;
    baselineDate: string;
    baselineLoadKg: number | null;
    baselineReps: number;
    targetDate: string;
    targetLoadKg: number | null;
    targetReps: number;
    note?: string;
  },
) {
  return request<{ ok: true; goal: CoachExerciseGoal }>(tokenProvider, '/v1/coach/statistics/exercises/goal', {
    method: 'PUT',
    body: JSON.stringify(input),
  });
}

export function getCoachStatisticsHistory(
  tokenProvider: TokenProvider,
  params: { clientId: string | null; month: string; limit?: number; offset?: number },
) {
  const [year, monthValue] = params.month.split('-').map(Number);
  const monthEnd = new Date(year, monthValue, 0);
  const pad = (value: number) => String(value).padStart(2, '0');
  const from = `${year}-${pad(monthValue)}-01`;
  const to = `${year}-${pad(monthValue)}-${pad(monthEnd.getDate())}`;
  const query = new URLSearchParams({ clientId: params.clientId ?? 'all', month: params.month, from, to });
  if (params.limit !== undefined) query.set('limit', String(params.limit));
  if (params.offset !== undefined) query.set('offset', String(params.offset));
  return request<CoachHistoryPage>(tokenProvider, `/v1/coach/statistics/history?${query.toString()}`);
}

export function getCoachStatisticsHistoryDetail(tokenProvider: TokenProvider, routineId: string) {
  return request<CoachHistoryDetail>(
    tokenProvider,
    `/v1/coach/statistics/history/${encodeURIComponent(routineId)}`,
  );
}

export function updateProfile(
  tokenProvider: TokenProvider,
  profile: {
    name: string;
    firstName: string;
    role: 'athlete' | 'coach';
    goal?: string;
    weightKg?: number;
    heightM?: number;
    soloTraining?: boolean;
  },
) {
  return request<{ ok: true }>(tokenProvider, '/v1/profile', {
    method: 'PUT',
    body: JSON.stringify(profile),
  });
}

export function pushSetLog(tokenProvider: TokenProvider, input: SetLogInput) {
  return request<Record<string, unknown>>(tokenProvider, '/v1/set-logs', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function parseRoutine(tokenProvider: TokenProvider, input: ParseRoutineInput) {
  return request<ParseRoutineResult>(tokenProvider, '/v1/import/parse', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function saveImportedRoutine(tokenProvider: TokenProvider, input: SaveImportedRoutineInput) {
  return request<{ ok: true; planId: string; routineIds: string[] }>(tokenProvider, '/v1/import/routines', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function deleteCurrentRoutine(tokenProvider: TokenProvider) {
  return request<{ ok: true; deletedRoutines: number }>(tokenProvider, '/v1/routines/current', {
    method: 'DELETE',
  });
}

export function selectCurrentRoutine(tokenProvider: TokenProvider, routineId: string) {
  return request<{ ok: true; routineId: string }>(tokenProvider, '/v1/routines/current/selection', {
    method: 'PUT',
    body: JSON.stringify({ routineId }),
  });
}

export type TemplateExerciseInput = {
  name: string;
  sets: number;
  reps: string;
  loadKg: number | null;
  progressionMetric?: 'load' | 'reps' | 'seconds';
  /** Kept for the importer/legacy create flow; coach-facing template editing omits it. */
  restSeconds?: number;
  note?: string;
};

export type TemplateDayInput = {
  day: number;
  name: string;
  exercises: TemplateExerciseInput[];
};

export function createTemplate(
  tokenProvider: TokenProvider,
  input: { name: string; days: TemplateDayInput[]; autoOverload: boolean; completed?: boolean },
) {
  return request<{ ok: true; id: string }>(tokenProvider, '/v1/templates', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export type UpdateTemplateExerciseInput = {
  position: number;
  name: string;
  sets: number;
  reps: string;
  loadKg: number | null;
  note?: string;
};

export type UpdateTemplateDayInput = {
  day: number;
  name: string;
  exercises: UpdateTemplateExerciseInput[];
};

export function updateTemplate(
  tokenProvider: TokenProvider,
  templateId: string,
  input: { name: string; days: UpdateTemplateDayInput[] },
) {
  return request<{ ok: true; id: string }>(tokenProvider, `/v1/templates/${templateId}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export function deleteTemplate(tokenProvider: TokenProvider, templateId: string) {
  return request<{ ok: true; id: string }>(tokenProvider, `/v1/templates/${templateId}`, {
    method: 'DELETE',
  });
}

export function assignTemplate(
  tokenProvider: TokenProvider,
  templateId: string,
  input: {
    clientIds: string[];
    autoOverload: boolean;
    loadMode: 'coach' | 'ai';
    coachLoads?: CoachAssignmentLoad[];
    week: number;
    weekStart: string;
    replace?: boolean;
  },
) {
  return request<{ ok: true; results: { clientId: string; planId: string; routineIds: string[] }[] }>(
    tokenProvider,
    `/v1/templates/${templateId}/assign`,
    { method: 'POST', body: JSON.stringify(input) },
  );
}

export type CoachAssignmentLoad = {
  clientId: string;
  day: number;
  position: number;
  loadKg: number;
};

export type UpdateExerciseInput = {
  suggested: number;
  sets: number;
  reps: string;
  overload: number | null;
};

export type RoutineExerciseInput = {
  id?: string;
  name: string;
  sets: number;
  reps: string;
  suggested: number;
  overload: number | null;
  work: number;
  focus: string;
  cues: string;
};

export type UpdateRoutineInput = {
  exercises: RoutineExerciseInput[];
};

export function updateRoutine(tokenProvider: TokenProvider, routineId: string, input: UpdateRoutineInput) {
  return request<{ ok: true; routineId: string; exerciseIds: string[] }>(
    tokenProvider,
    `/v1/routines/${routineId}`,
    { method: 'PATCH', body: JSON.stringify(input) },
  );
}

export function updateExercise(tokenProvider: TokenProvider, exerciseId: string, input: UpdateExerciseInput) {
  return request<{ ok: true; exercise: Record<string, unknown> }>(
    tokenProvider,
    `/v1/exercises/${exerciseId}`,
    { method: 'PATCH', body: JSON.stringify(input) },
  );
}

export function completeRoutine(tokenProvider: TokenProvider, routineId: string) {
  return request<{ ok: true; id: string; completedAt: string }>(
    tokenProvider,
    `/v1/routines/${routineId}/complete`,
    { method: 'POST' },
  );
}

export function startSession(tokenProvider: TokenProvider, routineId: string) {
  return request<{ ok: true; routineId: string }>(tokenProvider, '/v1/session/start', {
    method: 'POST',
    body: JSON.stringify({ routineId }),
  });
}

export function endSession(tokenProvider: TokenProvider, routineId: string) {
  return request<{ ok: true; routineId: string }>(tokenProvider, '/v1/session/end', {
    method: 'POST',
    body: JSON.stringify({ routineId }),
  });
}
