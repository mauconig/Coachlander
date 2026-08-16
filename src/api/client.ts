import { API_BASE_URL } from '@/config/runtime';

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
