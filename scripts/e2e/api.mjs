import { assert, assertEqual, apiRequest, dbTarget, loadFixture, queryRows, requireEnv, requireRunId, runProcess, saveArtifact } from './common.mjs';

const athleteToken = () => requireEnv('E2E_ATHLETE_TOKEN');
const coachToken = () => requireEnv('E2E_COACH_TOKEN');

async function countRows(routineId, sessionId = null) {
  const sessionFilter = sessionId === null ? '' : ` AND session_id = '${sessionId.replaceAll("'", "''")}'`;
  const rows = await queryRows(`SELECT count(*)::int FROM set_log WHERE routine_id = '${routineId.replaceAll("'", "''")}'${sessionFilter};`);
  return Number(rows[0]?.[0] ?? 0);
}

async function routineState(routineId) {
  const rows = await queryRows(`
SELECT session_status, completed_at IS NOT NULL, session_ended_at IS NOT NULL
FROM routine WHERE id = '${routineId.replaceAll("'", "''")}';
`);
  return rows[0] ?? [];
}

async function run() {
  requireRunId();
  const fixture = await loadFixture();
  const athlete = athleteToken();
  const coach = coachToken();
  const results = [];
  const record = (name, status, detail = '') => results.push({ name, status, detail });

  const health = await apiRequest('/healthz', { expected: 200 });
  assertEqual(health.body?.database, 'ok', 'healthz debe confirmar PostgreSQL');
  record('healthz', 'passed');

  await apiRequest('/v1/bootstrap', { expected: 401 });
  await apiRequest('/v1/session/start', { method: 'POST', body: { routineId: fixture.shortRoutineId }, expected: 401 });
  await apiRequest('/v1/session/sync', { method: 'POST', body: { routineId: fixture.shortRoutineId, sets: [] }, expected: 401 });
  await apiRequest('/v1/set-logs', { method: 'POST', body: { routineId: fixture.shortRoutineId }, expected: 401 });
  record('authentication', 'passed');

  const baselineShort = await countRows(fixture.shortRoutineId);
  const startShort = await apiRequest('/v1/session/start', {
    token: athlete,
    method: 'POST',
    body: { routineId: fixture.shortRoutineId },
    expected: 200,
  });
  assertEqual(startShort.body?.status, 'active', 'start debe activar la rutina');
  assertEqual(await countRows(fixture.shortRoutineId), baselineShort, 'start no debe crear set_logs');
  record('session start without logs', 'passed');

  const invalidBatch = await apiRequest('/v1/session/sync', {
    token: athlete,
    method: 'POST',
    body: {
      sessionId: `${requireRunId()}-invalid`,
      routineId: fixture.shortRoutineId,
      sets: [
        { exerciseId: fixture.shortExerciseId, setIndex: 0, load: 20, reps: 8 },
        { exerciseId: fixture.shortExerciseId, setIndex: 0, load: 22.5, reps: 8 },
      ],
    },
    expected: 400,
  });
  assert(invalidBatch.status === 400, 'un lote duplicado debe rechazarse');
  assertEqual(await countRows(fixture.shortRoutineId), baselineShort, 'un lote inválido debe ser atómico');
  record('sync validation and atomicity', 'passed');

  await apiRequest('/v1/session/sync', {
    token: athlete,
    method: 'POST',
    body: { sessionId: `${requireRunId()}-empty`, routineId: fixture.shortRoutineId, sets: [] },
    expected: 200,
  });
  await apiRequest('/v1/session/sync', {
    token: athlete,
    method: 'POST',
    body: {
      sessionId: `${requireRunId()}-invalid-reps`,
      routineId: fixture.shortRoutineId,
      sets: [{ exerciseId: fixture.shortExerciseId, setIndex: 0, load: 20, reps: 0 }],
    },
    expected: 400,
  });
  await apiRequest('/v1/session/sync', {
    token: athlete,
    method: 'POST',
    body: {
      sessionId: `${requireRunId()}-invalid-load`,
      routineId: fixture.shortRoutineId,
      sets: [{ exerciseId: fixture.shortExerciseId, setIndex: 0, load: 'nan', reps: 8 }],
    },
    expected: 400,
  });
  await apiRequest('/v1/session/sync', {
    token: athlete,
    method: 'POST',
    body: {
      sessionId: `${requireRunId()}-wrong-exercise`,
      routineId: fixture.shortRoutineId,
      sets: [{ exerciseId: fixture.multiExerciseAId, setIndex: 0, load: 20, reps: 8 }],
    },
    expected: 404,
  });
  assertEqual(await countRows(fixture.shortRoutineId), baselineShort, 'los lotes inválidos no deben dejar filas');

  const shortSessionId = `${requireRunId()}-complete-session`;
  const shortSets = [
    { exerciseId: fixture.shortExerciseId, setIndex: 0, load: 20, reps: 8 },
    { exerciseId: fixture.shortExerciseId, setIndex: 1, load: 20, reps: 8 },
  ];
  const syncShort = await apiRequest('/v1/session/sync', {
    token: athlete,
    method: 'POST',
    body: { sessionId: shortSessionId, routineId: fixture.shortRoutineId, sets: shortSets },
    expected: 200,
  });
  assertEqual(syncShort.body?.synced, shortSets.length, 'sync debe informar todas las series');
  assertEqual(await countRows(fixture.shortRoutineId, shortSessionId), shortSets.length, 'sync debe crear una fila por serie');
  await apiRequest('/v1/session/sync', {
    token: athlete,
    method: 'POST',
    body: { sessionId: shortSessionId, routineId: fixture.shortRoutineId, sets: shortSets },
    expected: 200,
  });
  assertEqual(await countRows(fixture.shortRoutineId, shortSessionId), shortSets.length, 'reintentar sync no debe duplicar');
  record('session batch and idempotency', 'passed', `${shortSets.length} rows`);

  const endShort = await apiRequest('/v1/session/end', {
    token: athlete,
    method: 'POST',
    body: { routineId: fixture.shortRoutineId },
    expected: 200,
  });
  assertEqual(endShort.body?.status, 'completed', 'end debe completar la rutina');
  const completedState = await routineState(fixture.shortRoutineId);
  assertEqual(completedState[0], 'completed', 'la rutina debe quedar completed');
  assertEqual(completedState[1], 't', 'completed_at debe existir');
  const afterEndSync = await apiRequest('/v1/session/sync', {
    token: athlete,
    method: 'POST',
    body: { sessionId: `${requireRunId()}-late`, routineId: fixture.shortRoutineId, sets: shortSets },
    expected: 409,
  });
  assertEqual(afterEndSync.status, 409, 'una rutina completada no acepta series');
  await apiRequest('/v1/session/end', {
    token: athlete,
    method: 'POST',
    body: { routineId: fixture.shortRoutineId },
    expected: 200,
  });
  record('complete session', 'passed');

  const partialSessionId = `${requireRunId()}-partial-session`;
  await apiRequest('/v1/session/start', { token: athlete, method: 'POST', body: { routineId: fixture.multiRoutineId }, expected: 200 });
  await apiRequest('/v1/session/sync', {
    token: athlete,
    method: 'POST',
    body: {
      sessionId: partialSessionId,
      routineId: fixture.multiRoutineId,
      sets: [{ exerciseId: fixture.multiExerciseAId, setIndex: 0, load: 15, reps: 8 }],
    },
    expected: 200,
  });
  await apiRequest('/v1/session/stop', { token: athlete, method: 'POST', body: { routineId: fixture.multiRoutineId }, expected: 200 });
  const partialState = await routineState(fixture.multiRoutineId);
  assertEqual(partialState[0], 'partial', 'stop debe dejar la rutina partial');
  assertEqual(partialState[1], 'f', 'partial no debe tener completed_at');
  assertEqual(await countRows(fixture.multiRoutineId, partialSessionId), 1, 'partial debe conservar sus series');
  await apiRequest('/v1/session/stop', { token: athlete, method: 'POST', body: { routineId: fixture.multiRoutineId }, expected: 200 });
  record('partial session', 'passed');

  const historicalBeforeCancel = await countRows(fixture.cancelRoutineId);
  const cancelSessionId = `${requireRunId()}-cancel-session`;
  await apiRequest('/v1/session/start', { token: athlete, method: 'POST', body: { routineId: fixture.cancelRoutineId }, expected: 200 });
  await apiRequest('/v1/session/sync', {
    token: athlete,
    method: 'POST',
    body: {
      sessionId: cancelSessionId,
      routineId: fixture.cancelRoutineId,
      sets: [{ exerciseId: fixture.shortExerciseId, setIndex: 0, load: 20, reps: 8 }],
    },
    expected: 200,
  });
  await apiRequest('/v1/session/cancel', { token: athlete, method: 'POST', body: { routineId: fixture.cancelRoutineId }, expected: 200 });
  assertEqual(await countRows(fixture.cancelRoutineId, cancelSessionId), 0, 'cancel debe borrar sólo la sesión actual');
  assertEqual(await countRows(fixture.cancelRoutineId), historicalBeforeCancel, 'cancel debe conservar históricos');
  assertEqual((await routineState(fixture.cancelRoutineId))[0], 'scheduled', 'cancel debe restaurar scheduled');
  await apiRequest('/v1/session/cancel', { token: athlete, method: 'POST', body: { routineId: fixture.cancelRoutineId }, expected: 200 });
  record('cancel session isolation', 'passed');

  await apiRequest('/v1/session/start', { token: coach, method: 'POST', body: { routineId: fixture.multiRoutineId }, expected: 404 });
  await apiRequest('/v1/session/sync', {
    token: coach,
    method: 'POST',
    body: { sessionId: `${requireRunId()}-forbidden`, routineId: fixture.multiRoutineId, sets: [] },
    expected: 404,
  });
  record('ownership protection', 'passed');

  let apiTrace = '';
  try {
    const traceRunId = `E2E-${requireRunId()}`;
    const logs = await runProcess('ssh', [dbTarget, `docker logs --since 30m coachlander-api 2>&1 | grep -F ${traceRunId} || true`]);
    apiTrace = `${logs.stdout}\n${logs.stderr}`.trim();
  } catch (error) {
    apiTrace = `No pudimos leer los logs E2E: ${String(error)}`;
  }
  await saveArtifact('api-trace.log', apiTrace);
  assert(!apiTrace.includes('/v1/set-logs'), 'La suite API no debe registrar llamadas a /v1/set-logs');

  await saveArtifact('api-results.json', {
    runId: requireRunId(),
    finishedAt: new Date().toISOString(),
    passed: results.filter((item) => item.status === 'passed').length,
    results,
  });
  console.log(`E2E API passed: ${results.length} suites`);
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
