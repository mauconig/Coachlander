export type Role = 'athlete' | 'coach';

export type Unit = 'kg' | 'lb';

export type DayMark = 'done' | 'today' | 'rest' | 'planned';

export type Exercise = {
  id: string;
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
  cues: string;
  /** week-over-week auto progression in kg */
  overload: number | null;
  lastTime?: {
    date: string;
    load: number;
    reps: number[];
    note: string;
  };
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
  exercises: Exercise[];
};

export type Client = {
  id: string;
  name: string;
  status: string;
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
  sets: number;
  reps: number;
  load: number | null;
  rest: number;
  /** true when the AI could not disambiguate the line */
  uncertain?: boolean;
  raw?: string;
  question?: string;
  options?: [string, string];
};
