import { useSQLiteContext } from 'expo-sqlite';
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

import { getAthlete, getCoach } from '@/db/queries';
import type { Role, Unit } from '@/data/types';

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

type AppState = {
  signedIn: boolean;
  role: Role;
  unit: Unit;
  draft: OnboardingDraft;
  patchDraft: (patch: Partial<OnboardingDraft>) => void;
  /** completes onboarding and drops the user into their role's tabs */
  finishOnboarding: () => void;
  signOut: () => void;
  switchRole: (role: Role) => void;
};

const Ctx = createContext<AppState | null>(null);

export function AppStateProvider({ children }: { children: ReactNode }) {
  const db = useSQLiteContext();

  // Prefill the measurement fields from the seeded athlete so the onboarding
  // form matches the design's sample values.
  const emptyDraft = useMemo<OnboardingDraft>(() => {
    const athlete = getAthlete(db);
    return {
      name: '',
      email: '',
      password: '',
      role: 'athlete',
      coachCode: '',
      coachName: null,
      experience: '1-3 años',
      daysPerWeek: 4,
      weightKg: String(athlete.weightKg).replace('.', ','),
      heightM: String(athlete.heightM).replace('.', ','),
      place: 'Gimnasio completo',
      soloTraining: false,
    };
  }, [db]);

  const [signedIn, setSignedIn] = useState(false);
  const [role, setRole] = useState<Role>('athlete');
  const [draft, setDraft] = useState<OnboardingDraft>(emptyDraft);

  const patchDraft = useCallback(
    (patch: Partial<OnboardingDraft>) => {
      setDraft((d) => {
        const next = { ...d, ...patch };
        // A complete code resolves to a coach; anything shorter clears the match.
        if (patch.coachCode !== undefined) {
          const coach = getCoach(db);
          next.coachName =
            patch.coachCode.toUpperCase() === coach.code || patch.coachCode.length === 6
              ? coach.name
              : null;
        }
        return next;
      });
    },
    [db],
  );

  const value = useMemo<AppState>(
    () => ({
      signedIn,
      role,
      unit: 'kg',
      draft,
      patchDraft,
      finishOnboarding: () => {
        setRole(draft.role);
        setSignedIn(true);
      },
      signOut: () => {
        setSignedIn(false);
        setDraft(emptyDraft);
      },
      switchRole: setRole,
    }),
    [draft, emptyDraft, patchDraft, role, signedIn],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp(): AppState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useApp debe usarse dentro de <AppStateProvider>');
  return ctx;
}
