import type { RemoteBootstrap } from '@/api/client';
import { createContext, useContext } from 'react';

export type RemoteData = {
  user: RemoteBootstrap['user'] | null;
  tables: RemoteBootstrap['tables'];
};

export type RefreshOptions = {
  force?: boolean;
  maxAgeMs?: number;
};

export const emptyRemoteData: RemoteData = { user: null, tables: {} };

export const RemoteDataContext = createContext<RemoteData | null>(null);
export const RemoteRefreshContext = createContext<((options?: RefreshOptions) => Promise<void>) | null>(null);

export function useRemoteData(): RemoteData {
  const data = useContext(RemoteDataContext);
  if (!data) throw new Error('useRemoteData debe usarse dentro de <AppStateProvider>');
  return data;
}

export function useRefreshRemoteData(): (options?: RefreshOptions) => Promise<void> {
  const refresh = useContext(RemoteRefreshContext);
  if (!refresh) throw new Error('useRefreshRemoteData debe usarse dentro de <AppStateProvider>');
  return refresh;
}
