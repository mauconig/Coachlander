import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

import { getImportLines, getMeta } from '@/db/queries';
import type { ImportedExercise } from '@/data/types';
import { useRemoteData } from '@/state/RemoteState';

export type ImportOrigin = 'file' | 'text';

type ImportState = {
  origin: ImportOrigin;
  sourceLabel: string;
  pasted: string;
  detected: ImportedExercise[];
  routineName: string;
  assignees: string[];
  autoOverload: boolean;
  setPasted: (text: string) => void;
  detectFrom: (origin: ImportOrigin) => void;
  setDetected: (lines: ImportedExercise[]) => void;
  resolve: (id: string, optionIndex: 0 | 1) => void;
  discard: (id: string) => void;
  setLoad: (id: string, load: number | null) => void;
  setRoutineName: (name: string) => void;
  toggleAssignee: (id: string) => void;
  setAutoOverload: (on: boolean) => void;
  reset: () => void;
};

const Ctx = createContext<ImportState | null>(null);

export function ImportProvider({ children }: { children: ReactNode }) {
  const remoteData = useRemoteData();
  const detectedLines = useMemo(() => getImportLines(remoteData), [remoteData]);
  const sourceFile = useMemo(() => getMeta(remoteData, 'import_source_file'), [remoteData]);

  const [origin, setOrigin] = useState<ImportOrigin>('file');
  const [pasted, setPasted] = useState('');
  const [detected, setDetected] = useState<ImportedExercise[]>(detectedLines);
  const [routineName, setRoutineName] = useState('');
  const [assignees, setAssignees] = useState<string[]>([]);
  const [autoOverload, setAutoOverload] = useState(true);

  const detectFrom = useCallback(
    (next: ImportOrigin) => {
      setOrigin(next);
      setDetected(detectedLines);
    },
    [detectedLines],
  );

  const resolve = useCallback((id: string, optionIndex: 0 | 1) => {
    setDetected((list) =>
      list.map((item) => {
        if (item.id !== id) return item;
        return optionIndex === 0
          ? { ...item, uncertain: false }
          : { ...item, uncertain: false, load: null };
      }),
    );
  }, []);

  const setLoad = useCallback((id: string, load: number | null) => {
    setDetected((list) => list.map((item) => (item.id === id ? { ...item, load } : item)));
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
      setDetected,
      resolve,
      discard: (id) => setDetected((list) => list.filter((item) => item.id !== id)),
      setLoad,
      setRoutineName,
      toggleAssignee: (id) =>
        setAssignees((list) => (list.includes(id) ? list.filter((item) => item !== id) : [...list, id])),
      setAutoOverload,
      reset: () => {
        setPasted('');
        setDetected(detectedLines);
        setRoutineName('');
        setAssignees([]);
      },
    }),
    [assignees, autoOverload, detectFrom, detected, detectedLines, origin, pasted, resolve, routineName, sourceFile],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useImport(): ImportState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useImport debe usarse dentro de <ImportProvider>');
  return ctx;
}
