export type Role = 'athlete' | 'coach';

export type Unit = 'kg' | 'lb';

export type DayMark = 'done' | 'today' | 'rest' | 'planned';

export type Exercise = {
  id: string;
  catalogId?: string;
  name: string;
  /** "4 × 8" */
  scheme: string;
  /** suggested load; 0 means bodyweight */
  suggested: number;
  sets: number;
  /** seconds of work per set — drives the session clock */
  work: number;
  /** seconds of rest between sets */
  rest: number;
  /** muscle groups, shown as the eyebrow on the detail screen */
  focus: string;
  /** canonical detail groups resolved from stored groups, focus and name */
  muscleGroups: string[];
  /** Optional metadata supplied by the external exercise catalog. */
  nameEn?: string;
  equipment?: string;
  target?: string;
  secondaryMuscles?: string[];
  instructions?: string;
  instructionSteps?: string[];
  imageUrl?: string;
  gifUrl?: string;
  attribution?: string;
  cues: string;
  /** week-over-week auto progression in kg */
  overload: number | null;
  loadSource: 'ai' | 'coach';
  loadReason: string;
  progressionMetric: 'load' | 'reps' | 'seconds';
  targetReps: number;
  lastTime?: {
    date: string;
    load: number;
    reps: number[];
    note: string;
  };
};

export type AthleteProgressExercise = Exercise & {
  key: string;
  sessions: number;
  lastDate: string;
};

export type AthleteProgressMuscle = {
  key: string;
  label: string;
  exercises: AthleteProgressExercise[];
};

export type AthleteExerciseGoal = {
  baselineDate: string;
  baselineLoadKg: number | null;
  baselineReps: number;
  targetDate: string;
  targetLoadKg: number | null;
  targetReps: number;
  note?: string;
};

export type AthleteProgressPoint = {
  date: string;
  label: string;
  value: number | null;
  loadKg: number | null;
  reps: number | null;
  meetsTarget: boolean;
};

export type AthleteExerciseProgress = {
  exercise: {
    key: string;
    name: string;
    targetReps: number;
    progressionMetric: 'load' | 'reps' | 'seconds';
    bodyweight: boolean;
  };
  points: AthleteProgressPoint[];
  goal: AthleteExerciseGoal | null;
};

export type Routine = {
  id: string;
  name: string;
  block: string;
  week: number;
  day: number;
  coach: string;
  athleteId: string;
  estimatedMinutes: number;
  secondsPerSet: number;
  weekStart?: string;
  completedAt?: string;
  sessionStatus: 'scheduled' | 'active' | 'partial' | 'completed';
  sessionEndedAt?: string;
  loadMode: 'ai' | 'coach';
  exercises: Exercise[];
};

export type Client = {
  id: string;
  name: string;
  status: string;
  /** clerk user id of the linked account, when the client has one */
  clerkUserId?: string;
  /** highlights the row when the client needs attention */
  attention?: boolean;
  done?: boolean;
  live?: {
    routine: string;
    setIndex: number;
    totalSets: number;
    elapsed: string;
  };
};

export type SessionRecord = {
  id: string;
  date: Date;
  name: string;
  minutes: number;
  sets: number;
  volume: number;
  completion: number;
  status: 'completed' | 'partial';
};

/** One row of the progressive-overload table. */
export type OverloadRow = {
  set: number;
  lastLoad: number;
  lastReps: number;
  nextLoad: number;
  nextReps: number;
};

/** A line the importer parsed out of a spreadsheet or pasted text. */
export type ImportedExercise = {
  id: string;
  name: string;
  catalogId?: string;
  catalogName?: string;
  catalogFocus?: string;
  catalogMatched?: boolean;
  sets: number;
  reps: string;
  load: number | null;
  rest: number;
  day: number;
  dayName?: string;
  /** true when the AI could not disambiguate the line */
  uncertain?: boolean;
  raw?: string;
  question?: string;
  options?: [string, string];
  progressionMetric?: 'load' | 'reps' | 'seconds';
  note?: string;
};

export type ImportedRoutineDay = {
  day: number;
  name: string;
  exercises: ImportedExercise[];
};
