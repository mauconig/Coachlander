import { API_BASE_URL } from '@/config/runtime';
import type { ImportedRoutineDay } from '@/data/types';

export type TokenProvider = () => Promise<string | null>;

export type RemoteBootstrap = {
  user: {
    id: string;
    email: string | null;
    role: 'athlete' | 'coach';
    displayName: string | null;
    firstName: string | null;
    goal: string | null;
    weightKg: number | null;
    heightM: number | null;
    soloTraining: boolean;
    isAdmin: boolean;
  };
  tables: Record<string, Record<string, unknown>[]>;
};

export type SetLogInput = {
  routineId: string;
  exerciseId: string;
  setIndex: number;
  load: number | null;
  reps: number;
};

export type ParseRoutineInput = {
  text: string;
  weightKg: number | null;
  heightM: number | null;
};

export type ParseRoutineResult = {
  routineName: string;
  days: ImportedRoutineDay[];
  exercises: ImportedRoutineDay['exercises'];
};

export type SaveImportedRoutineInput = {
  routineName: string;
  days: ImportedRoutineDay[];
  autoOverload: boolean;
};

class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

async function request<T>(
  tokenProvider: TokenProvider,
  path: string,
  init?: RequestInit,
): Promise<T> {
  const token = await tokenProvider();
  if (!token) throw new ApiError(401, 'No hay una sesión de Clerk activa');

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...init?.headers,
    },
  });

  if (!response.ok) {
    let message = `API ${response.status}`;
    try {
      const body = (await response.json()) as { error?: string };
      if (body.error) message = body.error;
    } catch {
      // Keep the HTTP status when the server did not return JSON.
    }
    throw new ApiError(response.status, message);
  }

  return (await response.json()) as T;
}

async function publicRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  });

  if (!response.ok) {
    let message = `API ${response.status}`;
    try {
      const body = (await response.json()) as { error?: string };
      if (body.error) message = body.error;
    } catch {
      // Keep the HTTP status when the server did not return JSON.
    }
    throw new ApiError(response.status, message);
  }

  return (await response.json()) as T;
}

export function resetEphemeralTestAccount(email: string, password: string) {
  return publicRequest<{ ok: true }>('/v1/test-accounts/ephemeral/reset', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

export function deleteEphemeralTestAccount(tokenProvider: TokenProvider) {
  return request<{ ok: true }>(tokenProvider, '/v1/test-accounts/ephemeral', {
    method: 'DELETE',
  });
}

export function getBootstrap(tokenProvider: TokenProvider) {
  return request<RemoteBootstrap>(tokenProvider, '/v1/bootstrap');
}

export function updateProfile(
  tokenProvider: TokenProvider,
  profile: {
    name: string;
    firstName: string;
    role: 'athlete' | 'coach';
    goal?: string;
    weightKg?: number;
    heightM?: number;
    soloTraining?: boolean;
  },
) {
  return request<{ ok: true }>(tokenProvider, '/v1/profile', {
    method: 'PUT',
    body: JSON.stringify(profile),
  });
}

export function pushSetLog(tokenProvider: TokenProvider, input: SetLogInput) {
  return request<Record<string, unknown>>(tokenProvider, '/v1/set-logs', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function parseRoutine(tokenProvider: TokenProvider, input: ParseRoutineInput) {
  return request<ParseRoutineResult>(tokenProvider, '/v1/import/parse', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function saveImportedRoutine(tokenProvider: TokenProvider, input: SaveImportedRoutineInput) {
  return request<{ ok: true; planId: string; routineIds: string[] }>(tokenProvider, '/v1/import/routines', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function deleteCurrentRoutine(tokenProvider: TokenProvider) {
  return request<{ ok: true; deletedRoutines: number }>(tokenProvider, '/v1/routines/current', {
    method: 'DELETE',
  });
}

export function selectCurrentRoutine(tokenProvider: TokenProvider, routineId: string) {
  return request<{ ok: true; routineId: string }>(tokenProvider, '/v1/routines/current/selection', {
    method: 'PUT',
    body: JSON.stringify({ routineId }),
  });
}
