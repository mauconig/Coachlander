import { useCallback, useEffect, useMemo } from 'react';

import type { Exercise, Unit } from '@/data/types';
import { mmss, num, repsOfScheme, weightLabel } from '@/lib/format';
import { color } from '@/theme/tokens';
import {
  createInitialSessionState,
  reduceSessionState,
  type LoggedSet,
  type SessionPhase,
} from './sessionMachine';
import { useSessionContext } from './SessionProvider';
import { playSessionTone } from './sessionFeedback';

export type Phase = SessionPhase;
export type { LoggedSet } from './sessionMachine';

const EMPTY_EXERCISE: Exercise = {
  id: 'empty-exercise',
  name: 'Preparando sesión',
  scheme: '3 × 8',
  suggested: 0,
  sets: 0,
  work: 45,
  rest: 90,
  focus: '',
  muscleGroups: [],
  cues: '',
  overload: null,
  loadSource: 'ai',
  loadReason: '',
  progressionMetric: 'load',
  targetReps: 8,
};

export type UseSessionOptions = {
  /** Prevent the screen from recreating a runtime while it is being closed. */
  enabled?: boolean;
  unit?: Unit;
  estimatedMinutes?: number;
  routineId?: string;
  routineTitle?: string;
  onSetLogged?: (entry: {
    exerciseId: string;
    setIndex: number;
    load: number | null;
    reps: number;
  }) => void;
};

export function useSession(exercises: Exercise[], options: UseSessionOptions = {}) {
  const {
    enabled = true,
    unit = 'kg',
    estimatedMinutes = 48,
    routineId = 'local-session',
    routineTitle = 'Rutina',
    onSetLogged,
  } = options;
  const context = useSessionContext();
  const runtime = context.runtime?.routineId === routineId ? context.runtime : null;
  const sessionExercises = runtime?.exercises ?? exercises;
  const fallbackState = useMemo(() => createInitialSessionState(sessionExercises), [sessionExercises]);
  const state = runtime?.state ?? fallbackState;

  useEffect(() => {
    if (!enabled) return;
    context.ensureSession({ routineId, routineTitle, exercises, onSetLogged });
  }, [context.ensureSession, enabled, exercises, onSetLogged, routineId, routineTitle]);

  const exercise = sessionExercises[state.exIndex] ?? EMPTY_EXERCISE;
  const reps = repsOfScheme(exercise.scheme);
  const done = state.sets.filter((item) => item.done).length;
  const pending = state.sets.findIndex((item) => !item.done);
  const exerciseComplete = pending < 0;
  const isLastExercise = state.exIndex >= sessionExercises.length - 1;
  const sessionComplete = exerciseComplete && isLastExercise && sessionExercises.length > 0;
  const resting = state.phase === 'rest';
  const total = state.phase === 'countdown' ? 10 : state.phaseDuration;

  const dispatch = useCallback((action: Parameters<typeof reduceSessionState>[1]) => {
    context.dispatch(action);
  }, [context.dispatch]);

  const goTo = useCallback((index: number) => {
    const clamped = Math.max(0, Math.min(sessionExercises.length - 1, index));
    if (clamped === state.exIndex) return;
    dispatch({ type: 'goto', index: clamped, exercises: sessionExercises, now: Date.now() });
  }, [dispatch, sessionExercises, state.exIndex]);

  const logSet = useCallback((index: number, load: number | null) => {
    dispatch({ type: 'log', index, load, reps, rest: exercise.rest, now: Date.now() });
    if (state.soundEnabled) playSessionTone('set');
    onSetLogged?.({ exerciseId: exercise.id, setIndex: index, load, reps });
  }, [dispatch, exercise.id, exercise.rest, onSetLogged, reps, state.soundEnabled]);

  const toggleQueue = useCallback(() => dispatch({ type: 'toggleQueue' }), [dispatch]);
  const openQueue = useCallback(() => dispatch({ type: 'setQueue', open: true }), [dispatch]);
  const closeQueue = useCallback(() => dispatch({ type: 'setQueue', open: false }), [dispatch]);

  useEffect(() => {
    if (!runtime || !exerciseComplete || isLastExercise || state.phase === 'countdown') return;
    const id = setTimeout(() => goTo(state.exIndex + 1), 700);
    return () => clearTimeout(id);
  }, [exerciseComplete, goTo, isLastExercise, runtime, state.exIndex, state.phase]);

  const derived = useMemo(() => {
    const phaseLabel = state.phase === 'countdown'
      ? 'PREPARANDO'
      : resting
        ? 'DESCANSO'
        : exerciseComplete
          ? 'EJERCICIO COMPLETO'
          : state.phase === 'overtime'
            ? 'SOBRETIEMPO'
            : 'EN CURSO';
    const ctaLabel = state.phase === 'countdown'
      ? 'SALTAR'
      : resting
        ? 'SALTAR DESCANSO'
        : sessionComplete
          ? 'TERMINAR RUTINA'
          : exerciseComplete
            ? 'Siguiente ejercicio'
            : `Serie ${pending + 1} hecha`;
    const queue = sessionExercises.map((item, index) => ({
      id: item.id,
      index,
      num: String(index + 1).padStart(2, '0'),
      name: item.name,
      meta: `${item.scheme} · ${weightLabel(item.suggested, unit)}`,
      current: index === state.exIndex,
      past: index < state.exIndex,
      tag: index === state.exIndex ? 'AHORA' : index < state.exIndex ? 'HECHO' : '',
    }));

    return {
      phaseLabel,
      phaseColor: resting ? color.violetSoft : state.phase === 'overtime' ? '#FF5D67' : color.lime,
      phaseClock: state.phase === 'overtime' ? `+${mmss(state.overtime)}` : mmss(state.left),
      phaseProgress: state.phase === 'overtime' ? 1 : total > 0 ? state.left / total : 0,
      setCounter: `SERIE ${Math.min(done + 1, state.sets.length)} DE ${state.sets.length}`,
      elapsedLabel: state.phase === 'overtime' ? 'sobretiempo' : `de ${total} s`,
      remaining: `~${Math.max(1, estimatedMinutes - Math.floor(state.elapsed / 60))} MIN`,
      ctaLabel,
      queue,
      exerciseNumber: state.exIndex + 1,
      suggestedShort: weightLabel(exercise.suggested, unit),
      suggestedLabel: `${weightLabel(exercise.suggested, unit)} × ${reps}`,
      moreLabel: `${exercise.suggested ? `${num(exercise.suggested + 2.5)} ${unit}` : `Con lastre 5 ${unit}`} × ${reps}`,
      typedDisplay: (state.typed === '' ? '0' : state.typed).replace('.', ','),
    };
  }, [done, estimatedMinutes, exercise, exerciseComplete, pending, resting, reps, sessionComplete, sessionExercises, state.elapsed, state.exIndex, state.left, state.overtime, state.phase, state.sets.length, state.typed, total, unit]);

  return {
    ...state,
    ...derived,
    runtime,
    exercise,
    reps,
    resting,
    exerciseComplete,
    sessionComplete,
    totalExercises: sessionExercises.length,
    totalSets: sessionExercises.reduce((totalSets, item) => totalSets + item.sets, 0),
    completedSets: state.completedSets ?? done,
    isLastExercise,
    remoteStarted: runtime?.remoteStarted ?? false,
    press: () => {
      if (state.phase === 'countdown') {
        dispatch({ type: 'cta', work: exercise.work, now: Date.now() });
        return 'started' as const;
      }
      if (sessionComplete && !resting) return 'finish' as const;
      if (resting) {
        dispatch({ type: 'cta', work: exercise.work, now: Date.now() });
        return 'ok' as const;
      }
      if (exerciseComplete) {
        goTo(state.exIndex + 1);
        return 'advanced' as const;
      }
      dispatch({ type: 'cta', work: exercise.work, now: Date.now() });
      return 'ok' as const;
    },
    skipCountdown: () => dispatch({ type: 'cta', work: exercise.work, now: Date.now() }),
    useSuggested: () => state.sheet !== null && logSet(state.sheet, exercise.suggested),
    useMore: () => state.sheet !== null && logSet(state.sheet, exercise.suggested ? exercise.suggested + 2.5 : 5),
    confirmTyped: () => {
      if (state.sheet === null) return;
      const parsed = state.typed === '' ? exercise.suggested : parseFloat(state.typed.replace(',', '.'));
      logSet(state.sheet, Number.isFinite(parsed) ? parsed : exercise.suggested);
    },
    openKeypad: () => dispatch({ type: 'openKeypad' }),
    closeSheet: () => dispatch({ type: 'closeSheet', now: Date.now() }),
    pressKey: (key: string) => dispatch({ type: 'press', key }),
    toggleQueue,
    openQueue,
    closeQueue,
    goTo,
    canSkipExercise: state.phase !== 'countdown' && sessionExercises.length > 0,
    skipExercise: () => {
      if (isLastExercise) return false;
      goTo(state.exIndex + 1);
      return true;
    },
    minimize: () => dispatch({ type: 'minimize' }),
    restore: () => dispatch({ type: 'restore' }),
    togglePaused: () => dispatch({ type: 'togglePaused', now: Date.now() }),
    toggleSound: () => dispatch({ type: 'toggleSound' }),
    markRemoteStarted: context.markRemoteStarted,
    finish: context.finish,
    discard: context.discard,
  };
}

export type Session = ReturnType<typeof useSession>;
