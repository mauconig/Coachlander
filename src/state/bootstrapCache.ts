import type { RemoteBootstrap } from '@/api/client';
import type { SQLiteDatabase } from 'expo-sqlite';

export const BOOTSTRAP_CACHE_SCHEMA_VERSION = 1;

type BootstrapCacheRow = {
  schema_version: number;
  payload_json: string;
  cached_at: number;
};

function isBootstrapPayload(value: unknown): value is RemoteBootstrap {
  if (!value || typeof value !== 'object') return false;
  const payload = value as Partial<RemoteBootstrap>;
  return Boolean(payload.user && typeof payload.user === 'object' && payload.tables && typeof payload.tables === 'object');
}

export async function readBootstrapCache(
  db: SQLiteDatabase,
  userId: string,
): Promise<RemoteBootstrap | null> {
  try {
    const row = await db.getFirstAsync<BootstrapCacheRow>(
      `SELECT schema_version, payload_json, cached_at
       FROM bootstrap_cache
       WHERE user_id = ?
       LIMIT 1`,
      userId,
    );
    if (!row || row.schema_version !== BOOTSTRAP_CACHE_SCHEMA_VERSION) return null;
    const payload: unknown = JSON.parse(row.payload_json);
    return isBootstrapPayload(payload) ? payload : null;
  } catch (error) {
    // A damaged cache must never prevent a fresh bootstrap. The database
    // remains the source of truth for the active session, not this cache.
    console.warn('[Coachlander] Se ignoró la caché de bootstrap', error);
    return null;
  }
}

export async function writeBootstrapCache(
  db: SQLiteDatabase,
  userId: string,
  payload: RemoteBootstrap,
): Promise<void> {
  await db.runAsync(
    `INSERT INTO bootstrap_cache (user_id, schema_version, payload_json, cached_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET
       schema_version = excluded.schema_version,
       payload_json = excluded.payload_json,
       cached_at = excluded.cached_at`,
    userId,
    BOOTSTRAP_CACHE_SCHEMA_VERSION,
    JSON.stringify(payload),
    Date.now(),
  );
}

export async function deleteBootstrapCache(db: SQLiteDatabase, userId: string): Promise<void> {
  try {
    await db.runAsync('DELETE FROM bootstrap_cache WHERE user_id = ?', userId);
  } catch (error) {
    console.warn('[Coachlander] No se pudo limpiar la caché de bootstrap', error);
  }
}
