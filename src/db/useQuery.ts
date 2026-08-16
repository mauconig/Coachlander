import { useMemo } from 'react';

import { useRemoteData, type RemoteData } from '@/state/RemoteState';

/** Runs a pure selector against the latest in-memory snapshot from PostgreSQL. */
export function useQuery<T>(select: (data: RemoteData) => T, deps: unknown[] = []): T {
  const data = useRemoteData();

  // Inline selectors use deps for their identity, while the snapshot itself
  // changes whenever the authenticated user's remote data is refreshed.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => select(data), [data, ...deps]);
}
