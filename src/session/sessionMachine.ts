import type { Exercise } from '@/data/types';

export type SessionPhase = 'countdown' | 'work' | 'overtime' | 'rest';

export type LoggedSet = {
  done: boolean;
  load: number | null;
  reps: number | null;
};

export type SessionState = {
  exIndex: number;
  elapsed: number;
  phase: SessionPhase;
  left: number;
  overtime: number;
  phaseStartedAt: number;
  updatedAt: number;
  phaseDuration: number;
  sets: LoggedSet[];
  sheet: number | null;
  keypad: boolean;
  typed: string;
  queueOpen: boolean;
  finished: boolean;
  paused: boolean;
  minimized: boolean;
  soundEnabled: boolean;
  phasePausedAt?: number;
};

export type SessionAction =
  | { type: 'tick'; work: number; now: number }
  | { type: 'cta'; work: number; now: number }
  | { type: 'goto'; index: number; exercises: Exercise[]; now: number }
  | { type: 'log'; index: number; load: number | null; reps: number; rest: number; now: number }
  | { type: 'openKeypad' }
  | { type: 'closeSheet'; now: number }
  | { type: 'press'; key: string }
  | { type: 'toggleQueue' }
  | { type: 'minimize' }
  | { type: 'restore' }
  | { type: 'togglePaused'; now: number }
  | { type: 'toggleSound' };

export const COUNTDOWN_SECONDS = 10;

const emptySets = (count: number): LoggedSet[] =>
  Array.from({ length: count }, () => ({ done: false, load: null, reps: null }));

const phaseElapsed = (state: SessionState, now: number) =>
  Math.max(0, Math.floor((now - state.phaseStartedAt) / 1000));

const beginPhase = (
  state: SessionState,
  phase: SessionPhase,
  duration: number,
  now: number,
): SessionState => ({
  ...state,
  phase,
  left: duration,
  overtime: 0,
  phaseDuration: duration,
  phaseStartedAt: now,
  updatedAt: now,
});

const resumeClock = (state: SessionState, now: number): SessionState => {
  if (state.phasePausedAt === undefined) return state;
  return {
    ...state,
    phaseStartedAt: state.phaseStartedAt + Math.max(0, now - state.phasePausedAt),
    phasePausedAt: undefined,
    updatedAt: now,
  };
};

export function createInitialSessionState(exercises: Exercise[], now = Date.now()): SessionState {
  return {
    exIndex: 0,
    elapsed: 0,
    phase: 'countdown',
    left: COUNTDOWN_SECONDS,
    overtime: 0,
    phaseStartedAt: now,
    updatedAt: now,
    phaseDuration: COUNTDOWN_SECONDS,
    sets: emptySets(exercises[0]?.sets ?? 0),
    sheet: null,
    keypad: false,
    typed: '',
    queueOpen: false,
    finished: false,
    paused: false,
    minimized: false,
    soundEnabled: true,
  };
}

export function reduceSessionState(state: SessionState, action: SessionAction): SessionState {
  switch (action.type) {
    case 'tick': {
      const elapsed = state.elapsed + Math.max(0, Math.floor((action.now - state.updatedAt) / 1000));
      const updated = { ...state, elapsed, updatedAt: action.now };
      if (state.paused || state.sheet !== null) return updated;

      const elapsedInPhase = phaseElapsed(state, action.now);
      if (state.phase === 'countdown') {
        const left = Math.max(0, COUNTDOWN_SECONDS - elapsedInPhase);
        return left > 0 ? { ...updated, left } : beginPhase(updated, 'work', action.work, action.now);
      }

      if (state.phase === 'work') {
        const left = Math.max(0, state.phaseDuration - elapsedInPhase);
        return left > 0
          ? { ...updated, left }
          : { ...updated, phase: 'overtime', left: 0, overtime: Math.max(1, elapsedInPhase - state.phaseDuration + 1), phaseStartedAt: action.now };
      }

      if (state.phase === 'overtime') {
        return { ...updated, left: 0, overtime: Math.max(1, elapsedInPhase + 1) };
      }

      const left = Math.max(0, state.phaseDuration - elapsedInPhase);
      return left > 0 ? { ...updated, left } : beginPhase(updated, 'work', action.work, action.now);
    }

    case 'cta': {
      if (state.phase === 'countdown' || state.phase === 'rest') {
        return beginPhase(state, 'work', action.work, action.now);
      }
      const pending = state.sets.findIndex((item) => !item.done);
      if (pending < 0) return state;
      return { ...state, sheet: pending, keypad: false, typed: '', phasePausedAt: action.now };
    }

    case 'goto': {
      const exercise = action.exercises[action.index];
      if (!exercise) return state;
      return {
        ...beginPhase(state, 'work', exercise.work, action.now),
        exIndex: action.index,
        sets: emptySets(exercise.sets),
        sheet: null,
        keypad: false,
        typed: '',
        queueOpen: false,
      };
    }

    case 'log': {
      const sets = state.sets.map((item, index) =>
        index === action.index ? { done: true, load: action.load, reps: action.reps } : item,
      );
      const base = resumeClock({ ...state, sets, sheet: null, keypad: false, typed: '' }, action.now);
      if (sets.every((item) => item.done)) return base;
      return {
        ...base,
        phase: 'rest',
        left: action.rest,
        overtime: 0,
        phaseDuration: action.rest,
        phaseStartedAt: action.now,
        updatedAt: action.now,
      };
    }

    case 'openKeypad':
      return { ...state, keypad: true, typed: '' };

    case 'closeSheet':
      return resumeClock({ ...state, sheet: null, keypad: false, typed: '' }, action.now);

    case 'press':
      if (action.key === 'del') return { ...state, typed: state.typed.slice(0, -1) };
      if (state.typed.length >= 6) return state;
      return { ...state, typed: state.typed + action.key };

    case 'toggleQueue':
      return { ...state, queueOpen: !state.queueOpen };

    case 'minimize':
      return { ...state, minimized: true };

    case 'restore':
      return { ...state, minimized: false };

    case 'togglePaused': {
      if (state.paused) {
        const elapsedInPhase = state.phase === 'overtime' ? Math.max(0, state.overtime - 1) : state.phase === 'countdown' ? COUNTDOWN_SECONDS - state.left : state.phaseDuration - state.left;
        return { ...state, paused: false, phaseStartedAt: action.now - elapsedInPhase * 1000, updatedAt: action.now };
      }
      return { ...state, paused: true, updatedAt: action.now };
    }

    case 'toggleSound':
      return { ...state, soundEnabled: !state.soundEnabled };

    default:
      return state;
  }
}
