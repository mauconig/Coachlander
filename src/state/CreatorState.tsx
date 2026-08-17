import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

export type CreatorExercise = {
  id: string;
  name: string;
  sets: number;
  reps: string;
  loadKg: number | null;
  restSeconds: number;
  note: string;
};

export type CreatorDay = {
  day: number;
  name: string;
  exercises: CreatorExercise[];
};

type CreatorState = {
  routineName: string;
  days: CreatorDay[];
  assignees: string[];
  autoOverload: boolean;
  setRoutineName: (name: string) => void;
  setDayCount: (count: number) => void;
  addExercise: (day: number, exercise: Omit<CreatorExercise, 'id'>) => void;
  updateExercise: (day: number, id: string, changes: Partial<CreatorExercise>) => void;
  removeExercise: (day: number, id: string) => void;
  moveExercise: (day: number, id: string, direction: -1 | 1) => void;
  replaceExercises: (day: number, exercises: CreatorExercise[]) => void;
  renameDay: (day: number, name: string) => void;
  toggleAssignee: (id: string) => void;
  setAutoOverload: (on: boolean) => void;
  reset: () => void;
};

const Ctx = createContext<CreatorState | null>(null);

let counter = 0;
const nextId = () => `creator-exercise-${Date.now()}-${counter++}`;

export function CreatorProvider({ children }: { children: ReactNode }) {
  const [routineName, setRoutineName] = useState('');
  const [dayCount, setDayCount] = useState(1);
  const [days, setDays] = useState<CreatorDay[]>([]);
  const [assignees, setAssignees] = useState<string[]>([]);
  const [autoOverload, setAutoOverload] = useState(true);

  const setCount = useCallback((count: number) => {
    setDayCount(count);
    setDays((current) => {
      const next = [...current];
      while (next.length < count) next.push({ day: next.length + 1, name: `Día ${next.length + 1}`, exercises: [] });
      return next.slice(0, count);
    });
  }, []);

  const value = useMemo<CreatorState>(
    () => ({
      routineName,
      days,
      assignees,
      autoOverload,
      setRoutineName,
      setDayCount: setCount,
      addExercise: (day, exercise) =>
        setDays((current) =>
          current.map((d) =>
            d.day === day ? { ...d, exercises: [...d.exercises, { ...exercise, id: nextId() }] } : d,
          ),
        ),
      updateExercise: (day, id, changes) =>
        setDays((current) =>
          current.map((d) =>
            d.day === day
              ? { ...d, exercises: d.exercises.map((e) => (e.id === id ? { ...e, ...changes } : e)) }
              : d,
          ),
        ),
      removeExercise: (day, id) =>
        setDays((current) =>
          current.map((d) => (d.day === day ? { ...d, exercises: d.exercises.filter((e) => e.id !== id) } : d)),
        ),
      moveExercise: (day, id, direction) =>
        setDays((current) =>
          current.map((d) => {
            if (d.day !== day) return d;
            const index = d.exercises.findIndex((e) => e.id === id);
            const target = index + direction;
            if (index < 0 || target < 0 || target >= d.exercises.length) return d;
            const next = [...d.exercises];
            [next[index], next[target]] = [next[target], next[index]];
            return { ...d, exercises: next };
          }),
        ),
      replaceExercises: (day, exercises) =>
        setDays((current) => current.map((d) => (d.day === day ? { ...d, exercises } : d))),
      renameDay: (day, name) =>
        setDays((current) => current.map((d) => (d.day === day ? { ...d, name } : d))),
      toggleAssignee: (id) =>
        setAssignees((list) => (list.includes(id) ? list.filter((item) => item !== id) : [...list, id])),
      setAutoOverload,
      reset: () => {
        setRoutineName('');
        setDayCount(1);
        setDays([]);
        setAssignees([]);
        setAutoOverload(true);
      },
    }),
    [assignees, autoOverload, days, routineName, setCount],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useCreator(): CreatorState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useCreator debe usarse dentro de <CreatorProvider>');
  return ctx;
}