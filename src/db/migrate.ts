import type { SQLiteDatabase } from 'expo-sqlite';

import { SCHEMA_SQL, SCHEMA_VERSION } from './schema';
import { seed } from './seed';

/**
 * Runs on every app start via `SQLiteProvider onInit`.
 *
 * Locally logged sets survive an app restart but not a schema bump — while the
 * database is seed content plus a training log, reseeding on version change is
 * simpler and safer than writing migrations for data nobody owns yet.
 */
export async function migrate(db: SQLiteDatabase) {
  await db.execAsync(SCHEMA_SQL);

  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  const current = row?.user_version ?? 0;
  if (current >= SCHEMA_VERSION) return;

  seed(db);
  await db.execAsync(`PRAGMA user_version = ${SCHEMA_VERSION}`);
}

/** Wipes the training log and restores the seed content. Exposed in Perfil. */
export function resetToSeed(db: SQLiteDatabase) {
  db.runSync('DELETE FROM set_log');
  seed(db);
}
