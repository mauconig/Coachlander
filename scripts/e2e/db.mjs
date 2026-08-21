import { fileURLToPath } from 'node:url';
import { saveArtifact, loadFixture, queryRows, requireEnv, requireRunId, sqlArray, sqlString, remotePsql } from './common.mjs';

const counts = ['app_user', 'routine', 'routine_exercise', 'exercise', 'set_log', 'overload_row'];

function idsForFixture() {
  const prefix = `E2E-${requireRunId()}`;
  return {
    prefix,
    coachId: requireEnv('E2E_COACH_CLERK_ID'),
    athleteId: requireEnv('E2E_ATHLETE_CLERK_ID'),
    clientId: `${prefix}-client`,
    shortRoutineId: `${prefix}-routine-short`,
    multiRoutineId: `${prefix}-routine-multi`,
    cancelRoutineId: `${prefix}-routine-cancel`,
    shortExerciseId: `${prefix}-exercise-short`,
    multiExerciseAId: `${prefix}-exercise-a`,
    multiExerciseBId: `${prefix}-exercise-b`,
  };
}

export async function snapshot(name) {
  const values = {};
  for (const table of counts) {
    const rows = await queryRows(`SELECT count(*)::int FROM ${table};`);
    values[table] = Number(rows[0]?.[0] ?? 0);
  }
  return saveArtifact(name, { runId: requireRunId(), capturedAt: new Date().toISOString(), counts: values });
}

export async function prepare() {
  const ids = idsForFixture();
  const exerciseIds = [ids.shortExerciseId, ids.multiExerciseAId, ids.multiExerciseBId];
  const routineIds = [ids.shortRoutineId, ids.multiRoutineId, ids.cancelRoutineId];
  await remotePsql(`
BEGIN;
DELETE FROM set_log WHERE routine_id = ANY(${sqlArray(routineIds)});
DELETE FROM routine_exercise WHERE routine_id = ANY(${sqlArray(routineIds)});
DELETE FROM overload_row WHERE exercise_id = ANY(${sqlArray(exerciseIds)});
DELETE FROM routine WHERE id = ANY(${sqlArray(routineIds)});
DELETE FROM exercise WHERE id = ANY(${sqlArray(exerciseIds)});
DELETE FROM client WHERE id = ${sqlString(ids.clientId)};
DELETE FROM app_user WHERE clerk_user_id IN (${sqlString(ids.coachId)}, ${sqlString(ids.athleteId)});
COMMIT;
`);
  await snapshot('before.json');
  const sql = `
BEGIN;
INSERT INTO app_user (clerk_user_id, email, role, display_name, first_name, solo_training)
VALUES
  (${sqlString(ids.coachId)}, ${sqlString(process.env.E2E_COACH_EMAIL ?? 'e2e-coach@invalid.test')}, 'coach', 'E2E Coach', 'E2E', FALSE),
  (${sqlString(ids.athleteId)}, ${sqlString(process.env.E2E_ATHLETE_EMAIL ?? 'e2e-athlete@invalid.test')}, 'athlete', 'E2E Athlete', 'E2E', FALSE)
ON CONFLICT (clerk_user_id) DO UPDATE SET
  email = EXCLUDED.email,
  role = EXCLUDED.role,
  display_name = EXCLUDED.display_name,
  first_name = EXCLUDED.first_name,
  solo_training = EXCLUDED.solo_training,
  updated_at = NOW();

INSERT INTO client (id, name, status, position, clerk_user_id)
VALUES (${sqlString(ids.clientId)}, 'E2E Athlete', 'Activo', 9999, ${sqlString(ids.athleteId)});

INSERT INTO exercise (id, name, scheme, suggested, sets, work, rest, focus, cues, overload, load_source, load_reason, progression_metric, target_reps)
VALUES
  (${sqlString(ids.shortExerciseId)}, 'E2E Press corto', '2 x 8', 20, 2, 1, 1, 'Pecho', 'Controlado', 2.5, 'coach', 'E2E fixture', 'load', 8),
  (${sqlString(ids.multiExerciseAId)}, 'E2E Ejercicio A', '1 x 8', 15, 1, 1, 1, 'Pecho', 'Controlado', 2.5, 'coach', 'E2E fixture', 'load', 8),
  (${sqlString(ids.multiExerciseBId)}, 'E2E Ejercicio B', '1 x 8', 15, 1, 1, 1, 'Espalda', 'Controlado', 2.5, 'coach', 'E2E fixture', 'load', 8);

INSERT INTO routine (id, plan_id, name, block, week, day, athlete_id, estimated_minutes, seconds_per_set, is_today, week_start, load_mode, session_status)
VALUES
  (${sqlString(ids.shortRoutineId)}, ${sqlString(ids.prefix)}, ${sqlString(`${ids.prefix} Rutina corta`)}, 'E2E', 1, 1, ${sqlString(ids.athleteId)}, 1, 1, 1, CURRENT_DATE, 'coach', 'scheduled'),
  (${sqlString(ids.multiRoutineId)}, ${sqlString(ids.prefix)}, ${sqlString(`${ids.prefix} Rutina multi`)}, 'E2E', 1, 2, ${sqlString(ids.athleteId)}, 1, 1, 0, CURRENT_DATE, 'coach', 'scheduled'),
  (${sqlString(ids.cancelRoutineId)}, ${sqlString(ids.prefix)}, ${sqlString(`${ids.prefix} Rutina cancelar`)}, 'E2E', 1, 3, ${sqlString(ids.athleteId)}, 1, 1, 0, CURRENT_DATE, 'coach', 'scheduled');

INSERT INTO routine_exercise (routine_id, exercise_id, position)
VALUES
  (${sqlString(ids.shortRoutineId)}, ${sqlString(ids.shortExerciseId)}, 0),
  (${sqlString(ids.multiRoutineId)}, ${sqlString(ids.multiExerciseAId)}, 0),
  (${sqlString(ids.multiRoutineId)}, ${sqlString(ids.multiExerciseBId)}, 1),
  (${sqlString(ids.cancelRoutineId)}, ${sqlString(ids.shortExerciseId)}, 0);

INSERT INTO set_log (clerk_user_id, routine_id, exercise_id, set_index, load, reps, logged_at)
VALUES (${sqlString(ids.athleteId)}, ${sqlString(ids.cancelRoutineId)}, ${sqlString(ids.shortExerciseId)}, 0, 10, 8, NOW() - INTERVAL '1 day');
COMMIT;
`;
  await remotePsql(sql);
  const fixture = { runId: requireRunId(), ...ids, preparedAt: new Date().toISOString() };
  await saveArtifact('fixture.json', fixture);
  return fixture;
}

export async function assertFixture() {
  const fixture = await loadFixture();
  const rows = await queryRows(`
SELECT r.id, r.session_status, r.completed_at IS NOT NULL, r.session_ended_at IS NOT NULL
FROM routine r
WHERE r.id = ANY(${sqlArray([fixture.shortRoutineId, fixture.multiRoutineId, fixture.cancelRoutineId])})
ORDER BY r.id;
`);
  await saveArtifact('fixture-state.tsv', rows.map((row) => row.join('\t')).join('\n'));
  return rows;
}

export async function cleanup() {
  const fixture = await loadFixture();
  const exerciseIds = [fixture.shortExerciseId, fixture.multiExerciseAId, fixture.multiExerciseBId];
  const routineIds = [fixture.shortRoutineId, fixture.multiRoutineId, fixture.cancelRoutineId];
  await remotePsql(`
BEGIN;
DELETE FROM set_log WHERE routine_id = ANY(${sqlArray(routineIds)});
DELETE FROM routine_exercise WHERE routine_id = ANY(${sqlArray(routineIds)});
DELETE FROM overload_row WHERE exercise_id = ANY(${sqlArray(exerciseIds)});
DELETE FROM routine WHERE id = ANY(${sqlArray(routineIds)});
DELETE FROM exercise WHERE id = ANY(${sqlArray(exerciseIds)});
DELETE FROM client WHERE id = ${sqlString(fixture.clientId)};
DELETE FROM app_user WHERE clerk_user_id IN (${sqlString(fixture.coachId)}, ${sqlString(fixture.athleteId)});
COMMIT;
`);
  await snapshot('after.json');
}

const command = process.argv[2];
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    if (command === 'snapshot') await snapshot(process.argv[3] ?? 'snapshot.json');
    else if (command === 'prepare') await prepare();
    else if (command === 'assert') await assertFixture();
    else if (command === 'cleanup') await cleanup();
    else throw new Error('Uso: node scripts/e2e/db.mjs snapshot|prepare|assert|cleanup');
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  }
}
