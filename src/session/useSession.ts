import { useCallback, useEffect, useMemo, useReducer } from 'react';

import type { Exercise, Unit } from '@/data/types';
import { mmss, num, repsOfScheme, weightLabel } from '@/lib/format';
import { color } from '@/theme/tokens';

export type Phase = 'work' | 'rest';

export type LoggedSet = {
  done: boolean;
  /** load used; null while pending, 0 for bodyweight */
  load: number | null;
  reps: number | null;
};

type State = {
  exIndex: number;
  /** seconds since the session started */
  elapsed: number;
  phase: Phase;
  /** seconds left in the current phase */
  left: number;
  sets: LoggedSet[];
  /** index of the set awaiting a load, or null when no sheet is open */
  sheet: number | null;
  keypad: boolean;
  typed: string;
  queueOpen: boolean;
  /** every set of every exercise is logged */
  finished: boolean;
};

type Action =
  | { type: 'tick'; work: number }
  | { type: 'cta'; work: number }
  | { type: 'goto'; index: number; exercises: Exercise[] }
  | { type: 'log'; index: number; load: number | null; reps: number; rest: number }
  | { type: 'openKeypad' }
  | { type: 'closeSheet' }
  | { type: 'press'; key: string }
  | { type: 'toggleQueue' };

const emptySets = (n: number): LoggedSet[] =>
  Array.from({ length: n }, () => ({ done: false, load: null, reps: null }));

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'tick': {
      const elapsed = state.elapsed + 1;
      // While the logging sheet is open the phase clock holds; only the
      // total session time keeps running.
      if (state.sheet !== null || state.finished) return { ...state, elapsed };
      if (state.left > 1) return { ...state, elapsed, left: state.left - 1 };
      // Rest rolls straight back into the next working set; a finished work
      // phase parks at zero and waits for the athlete.
      if (state.phase === 'rest') {
        return { ...state, elapsed, phase: 'work', left: action.work };
      }
      return { ...state, elapsed, left: 0 };
    }

    case 'cta': {
      if (state.phase === 'rest') return { ...state, phase: 'work', left: action.work };
      const pending = state.sets.findIndex((s) => !s.done);
      if (pending < 0) return state; // handled by the caller (advance / finish)
      return { ...state, sheet: pending, keypad: false, typed: '' };
    }

    case 'goto': {
      const next = action.exercises[action.index];
      if (!next) return state;
      return {
        ...state,
        exIndex: action.index,
        sets: emptySets(next.sets),
        phase: 'work',
        left: next.work,
        sheet: null,
        keypad: false,
        typed: '',
        queueOpen: false,
      };
    }

    case 'log': {
      const sets = state.sets.map((s, i) =>
        i === action.index ? { done: true, load: action.load, reps: action.reps } : s,
      );
      const base = { ...state, sets, sheet: null, keypad: false, typed: '' };
      // Last set of the exercise: hold still, the screen advances on its own.
      if (sets.every((s) => s.done)) return base;
      return { ...base, phase: 'rest', left: action.rest };
    }

    case 'openKeypad':
      return { ...state, keypad: true, typed: '' };

    case 'closeSheet':
      return { ...state, sheet: null, keypad: false, typed: '' };

    case 'press': {
      if (action.key === 'del') return { ...state, typed: state.typed.slice(0, -1) };
      if (state.typed.length > 5) return state;
      return { ...state, typed: state.typed + action.key };
    }

    case 'toggleQueue':
      return { ...state, queueOpen: !state.queueOpen };

    default:
      return state;
  }
}

const initial = (exercises: Exercise[]): State => ({
  exIndex: 0,
  elapsed: 0,
  phase: 'work',
  left: exercises[0]?.work ?? 45,
  sets: emptySets(exercises[0]?.sets ?? 0),
  sheet: null,
  keypad: false,
  typed: '',
  queueOpen: false,
  finished: false,
});

/**
 * Drives the live session screen: the phase clock, the per-set log and the
 * weight picker. Mirrors the state machine in the design doc — a set is
 * logged with a load, which starts the rest timer, which rolls into the next
 * working set.
 */
export function useSession(
  exercises: Exercise[],
  options: {
    unit?: Unit;
    estimatedMinutes?: number;
    /** fired once per closed set, for persistence */
    onSetLogged?: (entry: {
      exerciseId: string;
      setIndex: number;
      load: number | null;
      reps: number;
    }) => void;
  } = {},
) {
  const { unit = 'kg', estimatedMinutes = 48, onSetLogged } = options;
  const [state, dispatch] = useReducer(reducer, exercises, initial);

  const exercise = exercises[state.exIndex];
  const reps = repsOfScheme(exercise.scheme);

  useEffect(() => {
    const id = setInterval(() => dispatch({ type: 'tick', work: exercise.work }), 1000);
    return () => clearInterval(id);
  }, [exercise.work]);

  const goTo = useCallback(
    (index: number) => {
      const clamped = Math.max(0, Math.min(exercises.length - 1, index));
      if (clamped !== state.exIndex) dispatch({ type: 'goto', index: clamped, exercises });
    },
    [exercises, state.exIndex],
  );

  const logSet = useCallback(
    (index: number, load: number | null) => {
      dispatch({ type: 'log', index, load, reps, rest: exercise.rest });
      onSetLogged?.({ exerciseId: exercise.id, setIndex: index, load, reps });
    },
    [exercise.id, exercise.rest, onSetLogged, reps],
  );

  const done = state.sets.filter((s) => s.done).length;
  const pending = state.sets.findIndex((s) => !s.done);
  const exerciseComplete = pending < 0;
  const isLastExercise = state.exIndex === exercises.length - 1;
  const sessionComplete = exerciseComplete && isLastExercise;

  // Once the last set of a non-final exercise lands, slide to the next one so
  // the athlete never has to tap through.
  useEffect(() => {
    if (!exerciseComplete || isLastExercise) return;
    const id = setTimeout(() => goTo(state.exIndex + 1), 700);
    return () => clearTimeout(id);
  }, [exerciseComplete, isLastExercise, goTo, state.exIndex]);

  const resting = state.phase === 'rest';
  const total = resting ? exercise.rest : exercise.work;

  const derived = useMemo(() => {
    const phaseLabel = resting
      ? 'DESCANSO'
      : exerciseComplete
        ? 'EJERCICIO COMPLETO'
        : state.left === 0
          ? `TIEMPO CUMPLIDO · SERIE ${pending + 1}`
          : `SERIE ${pending + 1} EN CURSO`;

    const ctaLabel = resting
      ? 'Saltar descanso'
      : sessionComplete
        ? 'Terminar sesión'
        : exerciseComplete
          ? 'Siguiente ejercicio'
          : `Serie ${pending + 1} hecha`;

    const queue = exercises.map((e, i) => ({
      id: e.id,
      index: i,
      num: String(i + 1).padStart(2, '0'),
      name: e.name,
      meta: `${e.scheme} · ${weightLabel(e.suggested, unit)}`,
      current: i === state.exIndex,
      past: i < state.exIndex,
      tag: i === state.exIndex ? 'AHORA' : i < state.exIndex ? 'HECHO' : '',
    }));

    return {
      phaseLabel,
      phaseColor: resting ? color.violetSoft : color.lime,
      phaseClock: mmss(state.left),
      phaseProgress: total > 0 ? state.left / total : 0,
      setCounter: `SERIE ${Math.min(done + 1, state.sets.length)} DE ${state.sets.length}`,
      elapsedLabel: `de ${total} s`,
      remaining: `~${Math.max(1, estimatedMinutes - Math.floor(state.elapsed / 60))} MIN`,
      ctaLabel,
      queue,
      exerciseNumber: state.exIndex + 1,
      suggestedShort: weightLabel(exercise.suggested, unit),
      suggestedLabel: `${weightLabel(exercise.suggested, unit)} × ${reps}`,
      moreLabel: `${
        exercise.suggested ? `${num(exercise.suggested + 2.5)} ${unit}` : `Con lastre 5 ${unit}`
      } × ${reps}`,
      typedDisplay: (state.typed === '' ? '0' : state.typed).replace('.', ','),
    };
  }, [
    done,
    estimatedMinutes,
    exercise.suggested,
    exerciseComplete,
    exercises,
    pending,
    reps,
    resting,
    sessionComplete,
    state.elapsed,
    state.exIndex,
    state.left,
    state.sets.length,
    state.typed,
    total,
    unit,
  ]);

  return {
    ...state,
    ...derived,
    exercise,
    reps,
    resting,
    exerciseComplete,
    sessionComplete,
    totalExercises: exercises.length,

    /** primary CTA: log a set, skip rest, or advance */
    press: () => {
      if (sessionComplete && !resting) return 'finish' as const;
      if (!resting && exerciseComplete) {
        goTo(state.exIndex + 1);
        return 'advanced' as const;
      }
      dispatch({ type: 'cta', work: exercise.work });
      return 'ok' as const;
    },
    /** log with the load the plan suggested */
    useSuggested: () => state.sheet !== null && logSet(state.sheet, exercise.suggested),
    /** log 2,5 kg above the plan (or 5 kg of added load for bodyweight work) */
    useMore: () =>
      state.sheet !== null && logSet(state.sheet, exercise.suggested ? exercise.suggested + 2.5 : 5),
    /** log whatever was typed on the keypad */
    confirmTyped: () => {
      if (state.sheet === null) return;
      const parsed = state.typed === '' ? exercise.suggested : parseFloat(state.typed.replace(',', '.'));
      logSet(state.sheet, Number.isFinite(parsed) ? parsed : exercise.suggested);
    },
    openKeypad: () => dispatch({ type: 'openKeypad' }),
    closeSheet: () => dispatch({ type: 'closeSheet' }),
    pressKey: (key: string) => dispatch({ type: 'press', key }),
    toggleQueue: () => dispatch({ type: 'toggleQueue' }),
    goTo,
  };
}

export type Session = ReturnType<typeof useSession>;
