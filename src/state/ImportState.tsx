import { useSQLiteContext } from 'expo-sqlite';
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

import { getImportLines, getMeta } from '@/db/queries';
import type { ImportedExercise } from '@/data/types';

export type ImportOrigin = 'file' | 'text';

type ImportState = {
  origin: ImportOrigin;
  /** file name or a short description of the pasted text */
  sourceLabel: string;
  pasted: string;
  detected: ImportedExercise[];
  routineName: string;
  /** client ids the routine will be published to */
  assignees: string[];
  autoOverload: boolean;

  setPasted: (text: string) => void;
  /** runs the "detection" and moves the flow to the review step */
  detectFrom: (origin: ImportOrigin) => void;
  /** answers the disambiguation question on an uncertain line */
  resolve: (id: string, optionIndex: 0 | 1) => void;
  discard: (id: string) => void;
  setRoutineName: (name: string) => void;
  toggleAssignee: (id: string) => void;
  setAutoOverload: (on: boolean) => void;
  reset: () => void;
};

const Ctx = createContext<ImportState | null>(null);

export function ImportProvider({ children }: { children: ReactNode }) {
  const db = useSQLiteContext();
  // What the parser would return, standing in for a real detection call.
  const seedLines = useMemo(() => getImportLines(db), [db]);
  const sourceFile = useMemo(() => getMeta(db, 'import_source_file'), [db]);

  const [origin, setOrigin] = useState<ImportOrigin>('file');
  const [pasted, setPasted] = useState('');
  const [detected, setDetected] = useState<ImportedExercise[]>(seedLines);
  const [routineName, setRoutineName] = useState('Empuje A · Semana 6');
  const [assignees, setAssignees] = useState<string[]>(['nadia']);
  const [autoOverload, setAutoOverload] = useState(true);

  const detectFrom = useCallback(
    (next: ImportOrigin) => {
      setOrigin(next);
      setDetected(seedLines);
    },
    [seedLines],
  );

  const resolve = useCallback((id: string, optionIndex: 0 | 1) => {
    setDetected((list) =>
      list.map((item) => {
        if (item.id !== id) return item;
        // Option 0 keeps the parsed load; option 1 says the trailing number
        // was reps all along, so the line carries no weight.
        return optionIndex === 0
          ? { ...item, uncertain: false }
          : { ...item, uncertain: false, load: null };
      }),
    );
  }, []);

  const value = useMemo<ImportState>(
    () => ({
      origin,
      sourceLabel: origin === 'file' ? sourceFile : 'texto pegado',
      pasted,
      detected,
      routineName,
      assignees,
      autoOverload,
      setPasted,
      detectFrom,
      resolve,
      discard: (id) => setDetected((list) => list.filter((item) => item.id !== id)),
      setRoutineName,
      toggleAssignee: (id) =>
        setAssignees((list) => (list.includes(id) ? list.filter((a) => a !== id) : [...list, id])),
      setAutoOverload,
      reset: () => {
        setPasted('');
        setDetected(seedLines);
        setAssignees(['nadia']);
      },
    }),
    [
      assignees,
      autoOverload,
      detectFrom,
      detected,
      origin,
      pasted,
      resolve,
      routineName,
      seedLines,
      sourceFile,
    ],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useImport(): ImportState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useImport debe usarse dentro de <ImportProvider>');
  return ctx;
}
