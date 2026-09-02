import { useAuth } from '@clerk/expo';
import { useSQLiteContext } from 'expo-sqlite';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { deleteEphemeralTestAccount, getBootstrap, updateProfile, type RemoteBootstrap } from '@/api/client';
import { EPHEMERAL_TEST_EMAIL } from '@/config/runtime';
import type { Role, Unit } from '@/data/types';
import { deleteBootstrapCache, readBootstrapCache, writeBootstrapCache } from '@/state/bootstrapCache';
import {
  emptyRemoteData,
  RemoteDataContext,
  RemoteRefreshContext,
  type RemoteData,
  type RefreshOptions,
} from '@/state/RemoteState';

export type Experience = 'Empiezo' | '1-3 años' | '+3 años';
export type TrainingPlace = 'Gimnasio completo' | 'Casa' | 'Aire libre';

/** Everything the onboarding flow collects before the account exists. */
export type OnboardingDraft = {
  name: string;
  email: string;
  password: string;
  role: Role;
  coachCode: string;
  /** the coach matched by `coachCode`, once found */
  coachName: string | null;
  experience: Experience;
  daysPerWeek: number;
  weightKg: string;
  heightM: string;
  place: TrainingPlace;
  soloTraining: boolean;
};

export type RemoteStatus = 'idle' | 'loading' | 'ready' | 'error';

type AppState = {
  authReady: boolean;
  signedIn: boolean;
  remoteStatus: RemoteStatus;
  remoteRefreshing: boolean;
  retryRemoteData: (options?: RefreshOptions) => Promise<void>;
  role: Role;
  unit: Unit;
  draft: OnboardingDraft;
  patchDraft: (patch: Partial<OnboardingDraft>) => void;
  /** completes onboarding and drops the user into their role's tabs */
  finishOnboarding: () => void;
  signOut: () => Promise<void>;
  switchRole: (role: Role) => void;
};

const Ctx = createContext<AppState | null>(null);

export function AppStateProvider({ children }: { children: ReactNode }) {
  const { getToken, isLoaded, isSignedIn, signOut: clerkSignOut, userId } = useAuth();
  const db = useSQLiteContext();
  const emptyDraft = useMemo<OnboardingDraft>(
    () => ({
      name: '',
      email: '',
      password: '',
      role: 'athlete',
      coachCode: '',
      coachName: null,
      experience: '1-3 años',
      daysPerWeek: 4,
      weightKg: '',
      heightM: '',
      place: 'Gimnasio completo',
      soloTraining: false,
    }),
    [],
  );

  const [remoteData, setRemoteData] = useState<RemoteData>(emptyRemoteData);
  const [remoteStatus, setRemoteStatus] = useState<RemoteStatus>('idle');
  const [remoteRefreshing, setRemoteRefreshing] = useState(false);
  const [role, setRole] = useState<Role>('athlete');
  const [draft, setDraft] = useState<OnboardingDraft>(emptyDraft);
  const initializedUserRef = useRef<string | null>(null);
  const hasSnapshotRef = useRef(false);
  const lastRefreshAtRef = useRef(0);
  const refreshInFlightRef = useRef<Promise<void> | null>(null);

  const applySnapshot = useCallback((snapshot: RemoteBootstrap) => {
    setRemoteData({ user: snapshot.user, tables: snapshot.tables });
    setRole(snapshot.user.role);
    setDraft((current) => ({
      ...current,
      role: snapshot.user.role,
      name: snapshot.user.displayName ?? current.name,
      email: snapshot.user.email ?? current.email,
      soloTraining: snapshot.user.soloTraining,
    }));
    hasSnapshotRef.current = true;
    setRemoteStatus('ready');
  }, []);

  const refreshRemoteData = useCallback(async (options: RefreshOptions = {}) => {
    if (!isSignedIn || !userId) return;
    if (refreshInFlightRef.current) return refreshInFlightRef.current;

    const maxAgeMs = options.maxAgeMs ?? 60_000;
    if (!options.force && Date.now() - lastRefreshAtRef.current < maxAgeMs) return;

    const requestPromise = (async () => {
      setRemoteRefreshing(true);
      if (!hasSnapshotRef.current) setRemoteStatus('loading');
      try {
        const snapshot = await getBootstrap(getToken);
        applySnapshot(snapshot);
        lastRefreshAtRef.current = Date.now();
        try {
          await writeBootstrapCache(db, userId, snapshot);
        } catch (error) {
          console.warn('[Coachlander] No se pudo guardar la caché de bootstrap', error);
        }
      } catch (error) {
        if (!hasSnapshotRef.current) setRemoteStatus('error');
        throw error;
      } finally {
        setRemoteRefreshing(false);
      }
    })();

    refreshInFlightRef.current = requestPromise;
    try {
      await requestPromise;
    } finally {
      if (refreshInFlightRef.current === requestPromise) refreshInFlightRef.current = null;
    }
  }, [applySnapshot, db, getToken, isSignedIn, userId]);

  useEffect(() => {
    if (!isLoaded) return;

    if (!isSignedIn || !userId) {
      const previousUserId = initializedUserRef.current;
      initializedUserRef.current = null;
      hasSnapshotRef.current = false;
      lastRefreshAtRef.current = 0;
      if (previousUserId) void deleteBootstrapCache(db, previousUserId);
      setRemoteData(emptyRemoteData);
      setRemoteStatus('idle');
      setRemoteRefreshing(false);
      setRole('athlete');
      return;
    }

    if (initializedUserRef.current === userId) return;
    initializedUserRef.current = userId;
    hasSnapshotRef.current = false;
    lastRefreshAtRef.current = 0;
    setRemoteData(emptyRemoteData);
    setRemoteStatus('idle');

    void (async () => {
      const cached = await readBootstrapCache(db, userId);
      if (cached && initializedUserRef.current === userId) applySnapshot(cached);
      try {
        await refreshRemoteData({ force: true });
      } catch (error: unknown) {
        console.warn('[Coachlander] No se pudo actualizar el backend', error);
      }
    })();
  }, [applySnapshot, db, isLoaded, isSignedIn, refreshRemoteData, userId]);

  const patchDraft = useCallback(
    (patch: Partial<OnboardingDraft>) => {
      setDraft((current) => {
        const next = { ...current, ...patch };
        if (patch.coachCode !== undefined) {
          const code = patch.coachCode.toUpperCase();
          const coachRows = remoteData.tables.coach ?? [];
          const coach = coachRows.find((row) => row.code === code);
          next.coachName = coach && code.length === 6 && typeof coach.name === 'string' ? coach.name : null;
        }
        return next;
      });
    },
    [remoteData],
  );

  const signOut = useCallback(async () => {
    const currentEmail = remoteData.user?.email?.trim().toLowerCase() ?? '';
    const currentUserId = initializedUserRef.current;
    try {
      if (EPHEMERAL_TEST_EMAIL && currentEmail === EPHEMERAL_TEST_EMAIL) {
        try {
          await deleteEphemeralTestAccount(getToken);
        } catch (error) {
          // Never leave someone trapped in the temporary account because its
          // disposable-data cleanup failed. The next registration resets it.
          console.warn('[Coachlander] No se pudo borrar la cuenta temporal', error);
        }
      }

      try {
        await clerkSignOut();
      } catch (error) {
        // Clerk can reject a local sign-out after the temporary user was
        // deleted remotely. Clear the local app state either way.
        console.warn('[Coachlander] Clerk no pudo cerrar la sesi\u00f3n', error);
      }
    } finally {
      if (currentUserId) await deleteBootstrapCache(db, currentUserId);
      initializedUserRef.current = null;
      hasSnapshotRef.current = false;
      lastRefreshAtRef.current = 0;
      setRemoteData(emptyRemoteData);
      setRemoteStatus('idle');
      setRemoteRefreshing(false);
      setDraft(emptyDraft);
      setRole('athlete');
    }
  }, [clerkSignOut, db, emptyDraft, getToken, remoteData.user?.email]);

  const value = useMemo<AppState>(
    () => ({
      authReady: isLoaded,
      signedIn: isLoaded && !!isSignedIn,
      remoteStatus,
      remoteRefreshing,
      retryRemoteData: refreshRemoteData,
      role,
      unit: 'kg',
      draft,
      patchDraft,
      finishOnboarding: () => {
        setRole(draft.role);
        const name = draft.name.trim();
        const firstName = name.split(/\s+/)[0] ?? '';
        const weightKg = Number(draft.weightKg.replace(',', '.')) || null;
        const heightM = Number(draft.heightM.replace(',', '.')) || null;
        setRemoteData((current) =>
          current.user
            ? {
                ...current,
                user: {
                  ...current.user,
                  role: draft.role,
                  displayName: name || null,
                  firstName: firstName || null,
                  weightKg,
                  heightM,
                  soloTraining: draft.soloTraining,
                },
              }
            : current,
        );
        void updateProfile(getToken, {
          name,
          firstName,
          role: draft.role,
          weightKg: weightKg ?? undefined,
          heightM: heightM ?? undefined,
          soloTraining: draft.soloTraining,
        }).catch((error: unknown) => {
          console.warn('[Coachlander] No se pudo guardar el perfil', error);
        });
      },
      signOut,
      switchRole: (nextRole) => {
        setRole(nextRole);
        setRemoteData((current) =>
          current.user ? { ...current, user: { ...current.user, role: nextRole } } : current,
        );
        void updateProfile(getToken, {
          name: draft.name.trim(),
          firstName: draft.name.trim().split(/\s+/)[0] ?? '',
          role: nextRole,
          soloTraining: draft.soloTraining,
        }).catch((error: unknown) => {
          console.warn('[Coachlander] No se pudo cambiar el rol', error);
        });
      },
    }),
    [draft, getToken, isLoaded, isSignedIn, patchDraft, refreshRemoteData, remoteRefreshing, remoteStatus, role, signOut],
  );

  return (
    <RemoteDataContext.Provider value={remoteData}>
      <RemoteRefreshContext.Provider value={refreshRemoteData}>
        <Ctx.Provider value={value}>{children}</Ctx.Provider>
      </RemoteRefreshContext.Provider>
    </RemoteDataContext.Provider>
  );
}

export function useApp(): AppState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useApp debe usarse dentro de <AppStateProvider>');
  return ctx;
}
