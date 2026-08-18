import { readFile } from 'node:fs/promises';
import { randomUUID, timingSafeEqual } from 'node:crypto';

import cors from '@fastify/cors';
import Fastify from 'fastify';
import { createClerkClient } from '@clerk/backend';
import pg from 'pg';

const { Pool } = pg;
const port = Number(process.env.PORT ?? 8782);
const databaseUrl = process.env.DATABASE_URL;
const clerkSecretKey = process.env.CLERK_SECRET_KEY;
const clerkPublishableKey = process.env.CLERK_PUBLISHABLE_KEY;
const deepseekApiKey = process.env.DEEPSEEK_API_KEY;
const deepseekBaseUrl = process.env.DEEPSEEK_BASE_URL ?? 'https://api.deepseek.com';
const deepseekModel = process.env.DEEPSEEK_MODEL ?? 'deepseek-v4-flash';
const adminClerkUserId = process.env.ADMIN_CLERK_USER_ID?.trim() ?? '';
const ephemeralTestEnabled = process.env.ENABLE_EPHEMERAL_TEST_ACCOUNT === 'true';
const ephemeralTestEmail = process.env.EPHEMERAL_TEST_EMAIL?.trim().toLowerCase() ?? '';
const ephemeralTestPassword = process.env.EPHEMERAL_TEST_PASSWORD ?? '';

if (!databaseUrl) throw new Error('DATABASE_URL is required');
if (!clerkSecretKey) throw new Error('CLERK_SECRET_KEY is required');

const app = Fastify({ logger: true });
const pool = new Pool({ connectionString: databaseUrl, max: 10 });
const clerk = createClerkClient({
  secretKey: clerkSecretKey,
  ...(clerkPublishableKey ? { publishableKey: clerkPublishableKey } : {}),
});

const bootstrapTables = [
  'coach',
  'athlete',
  'exercise',
  'routine',
  'routine_exercise',
  'client',
  'session',
  'overload_row',
  'weekly_volume',
  'month_day',
  'setting',
  'template',
  'template_day',
  'template_exercise',
  'thread',
  'import_line',
  'app_meta',
  'set_log',
];
const orderBy = {
  coach: 'id',
  athlete: 'id',
  exercise: 'id',
  routine: 'id',
  routine_exercise: 'position',
  client: 'position',
  session: 'date DESC',
  overload_row: 'exercise_id, set_no',
  weekly_volume: 'week',
  month_day: 'day_index',
  setting: 'position, id',
  template: 'position',
  template_day: 'template_id, day',
  template_exercise: 'template_id, day, position',
  thread: 'position',
  import_line: 'position',
  app_meta: 'key',
};

function quoteIdentifier(identifier) {
  return `"${identifier.replaceAll('"', '""')}"`;
}

async function initializeDatabase() {
  const schema = await readFile(new URL('../db/schema.sql', import.meta.url), 'utf8');
  await pool.query(schema);
}

async function authenticate(request, reply) {
  const authorization = request.headers.authorization;
  if (!authorization?.startsWith('Bearer ')) {
    return reply.code(401).send({ error: 'Missing bearer token' });
  }

  try {
    const clerkRequest = new Request('http://coachlander.local', {
      headers: { authorization },
    });
    const requestState = await clerk.authenticateRequest(clerkRequest, {
      ...(clerkPublishableKey ? { publishableKey: clerkPublishableKey } : {}),
    });
    const auth = requestState.toAuth();
    if (!auth.isAuthenticated) return reply.code(401).send({ error: 'Invalid session' });
    request.userId = auth.userId;
  } catch (error) {
    request.log.warn({ error }, 'Clerk authentication failed');
    return reply.code(401).send({ error: 'Invalid session' });
  }
}

async function ensureUser(userId) {
  let email = null;
  let displayName = null;
  let firstName = null;

  try {
    const clerkUser = await clerk.users.getUser(userId);
    email = clerkUser.primaryEmailAddress?.emailAddress ?? clerkUser.emailAddresses?.[0]?.emailAddress ?? null;
    const metadataDisplayName =
      typeof clerkUser.unsafeMetadata?.displayName === 'string'
        ? clerkUser.unsafeMetadata.displayName.trim() || null
        : null;
    firstName = clerkUser.firstName?.trim() || metadataDisplayName?.split(/\s+/)[0] || null;
    const lastName = clerkUser.lastName?.trim() || null;
    displayName = [clerkUser.firstName?.trim(), lastName].filter(Boolean).join(' ') || metadataDisplayName;
  } catch (error) {
    app.log.warn({ error, userId }, 'Could not load Clerk user profile');
  }

  const result = await pool.query(
    `INSERT INTO app_user (clerk_user_id, email, display_name, first_name)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (clerk_user_id) DO UPDATE SET
       email = COALESCE(EXCLUDED.email, app_user.email),
       display_name = COALESCE(app_user.display_name, EXCLUDED.display_name),
       first_name = COALESCE(app_user.first_name, EXCLUDED.first_name),
       updated_at = NOW()
     RETURNING clerk_user_id, email, role, display_name, first_name, goal, weight_kg, height_m, solo_training`,
    [userId, email, displayName, firstName],
  );
  return result.rows[0];
}

async function readBootstrap(userId) {
  const user = await ensureUser(userId);
  const tables = {};

  for (const table of bootstrapTables) {
    if (table === 'set_log') {
      const result = await pool.query(
        `SELECT id, routine_id, exercise_id, set_index, load, reps, logged_at
         FROM set_log WHERE clerk_user_id = $1 ORDER BY logged_at DESC, id DESC`,
        [userId],
      );
      tables[table] = result.rows;
      continue;
    }

    const result =
      table === 'template'
        ? await pool.query(
            `SELECT t.*
             FROM template t
             WHERE EXISTS (SELECT 1 FROM template_day td WHERE td.template_id = t.id)
               AND EXISTS (SELECT 1 FROM template_exercise te WHERE te.template_id = t.id)
             ORDER BY t.position`,
          )
        : await pool.query(`SELECT * FROM ${quoteIdentifier(table)} ORDER BY ${orderBy[table] ?? '1'}`);
    tables[table] = result.rows;
  }

  return {
    user: {
      id: user.clerk_user_id,
      email: user.email,
      role: user.role,
      displayName: user.display_name,
      firstName: user.first_name,
      goal: user.goal,
      weightKg: user.weight_kg,
      heightM: user.height_m,
      soloTraining: user.solo_training,
      isAdmin: Boolean(adminClerkUserId && user.clerk_user_id === adminClerkUserId),
    },
    tables,
  };
}

app.register(cors, { origin: true });

app.get('/healthz', async () => {
  await pool.query('SELECT 1');
  return { status: 'ok', database: 'ok' };
});

app.get('/v1/bootstrap', { preHandler: authenticate }, async (request) => {
  return readBootstrap(request.userId);
});

function isoDateValue(date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

function databaseDateValue(value) {
  return value instanceof Date ? isoDateValue(value) : String(value ?? '').slice(0, 10);
}

function validIsoDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && isoDateValue(date) === value;
}

function defaultStatsRange() {
  const today = new Date();
  const to = isoDateValue(today);
  return {
    from: `${today.getUTCFullYear()}-${String(today.getUTCMonth() + 1).padStart(2, '0')}-01`,
    to,
  };
}

function readStatsQuery(request, reply) {
  const query = request.query ?? {};
  const defaults = defaultStatsRange();
  const clientId = query.clientId && query.clientId !== 'all' ? textValue(query.clientId) : null;
  const from = textValue(query.from, defaults.from);
  const to = textValue(query.to, defaults.to);

  if (!validIsoDate(from) || !validIsoDate(to)) {
    reply.code(400).send({ error: 'El rango de fechas no es válido' });
    return null;
  }
  if (from > to) {
    reply.code(400).send({ error: 'La fecha inicial no puede ser posterior a la final' });
    return null;
  }

  return { clientId, from, to };
}

function readStatsExerciseQuery(request, reply) {
  const params = readStatsQuery(request, reply);
  if (!params) return null;
  if (!params.clientId) {
    reply.code(400).send({ error: 'Necesitamos seleccionar un alumno' });
    return null;
  }

  const exerciseKey = normalizeName(textValue(request.query?.exerciseKey));
  if (!exerciseKey) {
    reply.code(400).send({ error: 'Falta el ejercicio a consultar' });
    return null;
  }
  return { ...params, exerciseKey };
}

async function requireCoach(request, reply) {
  const profile = await ensureUser(request.userId);
  if (profile.role !== 'coach') {
    reply.code(403).send({ error: 'Solo un entrenador puede consultar estadísticas' });
    return null;
  }
  return profile;
}

async function validateCoachClient(clientId, reply) {
  if (!clientId) return true;
  const result = await pool.query('SELECT id FROM client WHERE id = $1 LIMIT 1', [clientId]);
  if (!result.rows[0]) {
    reply.code(404).send({ error: 'No encontramos ese alumno' });
    return false;
  }
  return true;
}

const coachScopedRoutines = `
  SELECT
    r.id,
    r.name,
    r.day,
    r.week_start,
    r.completed_at,
    r.estimated_minutes,
    c.id AS client_id,
    c.name AS client_name,
    COALESCE(c.clerk_user_id, c.id) AS athlete_id,
    COALESCE(
      CASE
        WHEN r.week_start IS NOT NULL
        THEN (r.week_start + ((r.day - 1) * INTERVAL '1 day'))::date
      END,
      r.completed_at::date
    ) AS scheduled_date
  FROM routine r
  JOIN client c ON r.athlete_id = COALESCE(c.clerk_user_id, c.id)
  WHERE ($1::text IS NULL OR c.id = $1)
`;

function mapCoachHistoryRow(row) {
  return {
    id: row.id,
    clientId: row.client_id,
    clientName: row.client_name,
    date: databaseDateValue(row.training_date),
    name: row.name,
    minutes: Number(row.minutes) || 0,
    sets: Number(row.sets) || 0,
    volumeKg: Number(row.volume_kg) || 0,
    completion: Number(row.completion) || 0,
  };
}

async function fetchCoachHistory({ clientId, from, to, limit, offset }) {
  const result = await pool.query(
    `WITH scoped_routines AS (${coachScopedRoutines}),
      routine_sets AS (
        SELECT re.routine_id, SUM(e.sets)::integer AS sets
        FROM routine_exercise re
        JOIN exercise e ON e.id = re.exercise_id
        GROUP BY re.routine_id
      ),
      routine_volume AS (
        SELECT sl.routine_id, SUM(COALESCE(sl.load, 0) * sl.reps)::double precision AS volume_kg
        FROM set_log sl
        JOIN scoped_routines sr ON sr.id = sl.routine_id
        WHERE sl.logged_at::date BETWEEN $2::date AND $3::date
        GROUP BY sl.routine_id
      ),
      completed_total AS (
        SELECT COUNT(*)::integer AS total
        FROM scoped_routines
        WHERE completed_at IS NOT NULL
          AND completed_at::date BETWEEN $2::date AND $3::date
      )
      SELECT
        sr.id,
        sr.client_id,
        sr.client_name,
        COALESCE(sr.completed_at::date, sr.scheduled_date) AS training_date,
        sr.name,
        sr.estimated_minutes AS minutes,
        COALESCE(rs.sets, 0) AS sets,
        COALESCE(rv.volume_kg, 0) AS volume_kg,
        CASE WHEN sr.completed_at IS NOT NULL THEN 100 ELSE 0 END AS completion,
        ct.total AS total_count
      FROM scoped_routines sr
      CROSS JOIN completed_total ct
      LEFT JOIN routine_sets rs ON rs.routine_id = sr.id
      LEFT JOIN routine_volume rv ON rv.routine_id = sr.id
      WHERE sr.completed_at IS NOT NULL
        AND sr.completed_at::date BETWEEN $2::date AND $3::date
      ORDER BY COALESCE(sr.completed_at::date, sr.scheduled_date) DESC, sr.id DESC
      LIMIT $4 OFFSET $5`,
    [clientId, from, to, limit, offset],
  );

  const total = Number(result.rows[0]?.total_count) || 0;
  return {
    items: result.rows.map(mapCoachHistoryRow),
    total,
    hasMore: offset + result.rows.length < total,
  };
}

async function fetchCoachHistoryDetail(routineId) {
  const routineResult = await pool.query(
    `SELECT
       r.id,
       r.name,
       r.completed_at,
       r.estimated_minutes AS minutes,
       c.id AS client_id,
       c.name AS client_name
     FROM routine r
     JOIN client c ON r.athlete_id = COALESCE(c.clerk_user_id, c.id)
     WHERE r.id = $1
       AND r.completed_at IS NOT NULL`,
    [routineId],
  );
  const routine = routineResult.rows[0];
  if (!routine) return null;

  const exerciseResult = await pool.query(
    `SELECT
       re.exercise_id,
       re.position,
       e.name,
       e.sets AS planned_sets,
       e.scheme,
       sl.set_index,
       sl.load,
       sl.reps
     FROM routine_exercise re
     JOIN exercise e ON e.id = re.exercise_id
     LEFT JOIN set_log sl
       ON sl.routine_id = re.routine_id
      AND sl.exercise_id = re.exercise_id
     WHERE re.routine_id = $1
     ORDER BY re.position, sl.set_index NULLS LAST`,
    [routineId],
  );

  const exercises = [];
  const byId = new Map();
  for (const row of exerciseResult.rows) {
    let exercise = byId.get(row.exercise_id);
    if (!exercise) {
      exercise = {
        id: row.exercise_id,
        name: row.name,
        plannedSets: Number(row.planned_sets) || 0,
        scheme: row.scheme ?? '',
        sets: [],
      };
      byId.set(row.exercise_id, exercise);
      exercises.push(exercise);
    }
    if (row.set_index !== null && row.set_index !== undefined) {
      exercise.sets.push({
        setIndex: (Number(row.set_index) || 0) + 1,
        load: row.load === null || row.load === undefined ? null : Number(row.load),
        reps: Number(row.reps) || 0,
      });
    }
  }

  return {
    id: routine.id,
    clientId: routine.client_id,
    clientName: routine.client_name,
    date: databaseDateValue(routine.completed_at),
    name: routine.name,
    minutes: Number(routine.minutes) || 0,
    exercises,
  };
}

function statsRangeDays(from, to) {
  const start = Date.parse(`${from}T00:00:00Z`);
  const end = Date.parse(`${to}T00:00:00Z`);
  return Math.floor((end - start) / 86400000) + 1;
}

function statsGranularity(from, to) {
  return statsRangeDays(from, to) <= 14 ? 'day' : 'week';
}

function isoWeekStart(dateValue) {
  const date = new Date(`${dateValue}T00:00:00Z`);
  const day = date.getUTCDay();
  date.setUTCDate(date.getUTCDate() + (day === 0 ? -6 : 1 - day));
  return isoDateValue(date);
}

function statsBucketLabel(bucketStart) {
  const [, month, day] = bucketStart.split('-');
  return `${day}/${month}`;
}

function repsFromScheme(scheme) {
  const match = String(scheme ?? '').match(/[x×]\s*(\d+)/i);
  return match ? Number(match[1]) : 8;
}

async function fetchCoachActivity({ clientId, from, to }) {
  const granularity = statsGranularity(from, to);
  const bucketExpression = granularity === 'day'
    ? 'completed_at::date'
    : 'date_trunc(\'week\', completed_at)::date';
  const seriesStart = granularity === 'day'
    ? '$2::date'
    : 'date_trunc(\'week\', $2::date)::date';
  const seriesEnd = granularity === 'day'
    ? '$3::date'
    : 'date_trunc(\'week\', $3::date)::date';
  const seriesStep = granularity === 'day' ? '1 day' : '7 days';

  const result = await pool.query(
    `WITH scoped_routines AS (${coachScopedRoutines}),
      buckets AS (
        SELECT generate_series(${seriesStart}, ${seriesEnd}, INTERVAL '${seriesStep}')::date AS bucket_start
      ),
      activity AS (
        SELECT
          ${bucketExpression} AS bucket_start,
          COUNT(*)::integer AS sessions,
          COALESCE(SUM(estimated_minutes), 0)::integer AS minutes
        FROM scoped_routines
        WHERE completed_at IS NOT NULL
          AND completed_at::date BETWEEN $2::date AND $3::date
        GROUP BY ${bucketExpression}
      )
      SELECT
        buckets.bucket_start,
        COALESCE(activity.sessions, 0)::integer AS sessions,
        COALESCE(activity.minutes, 0)::integer AS minutes
      FROM buckets
      LEFT JOIN activity ON activity.bucket_start = buckets.bucket_start
      ORDER BY buckets.bucket_start`,
    [clientId, from, to],
  );

  return {
    granularity,
    buckets: result.rows.map((row) => ({
      start: databaseDateValue(row.bucket_start),
      label: statsBucketLabel(databaseDateValue(row.bucket_start)),
      sessions: Number(row.sessions) || 0,
      minutes: Number(row.minutes) || 0,
    })),
  };
}

async function fetchCoachHeatmap({ clientId, from, to }) {
  const result = await pool.query(
    `WITH days AS (
        SELECT generate_series($2::date, $3::date, INTERVAL '1 day')::date AS date
      ),
      completed AS (
        SELECT
          completed_at::date AS date,
          COUNT(*)::integer AS sessions,
          COALESCE(SUM(estimated_minutes), 0)::integer AS minutes
        FROM (${coachScopedRoutines}) scoped_routines
        WHERE completed_at IS NOT NULL
          AND completed_at::date BETWEEN $2::date AND $3::date
        GROUP BY completed_at::date
      )
      SELECT
        days.date,
        COALESCE(completed.sessions, 0)::integer AS sessions,
        COALESCE(completed.minutes, 0)::integer AS minutes
      FROM days
      LEFT JOIN completed ON completed.date = days.date
      ORDER BY days.date`,
    [clientId, from, to],
  );

  return result.rows.map((row) => ({
    date: databaseDateValue(row.date),
    sessions: Number(row.sessions) || 0,
    minutes: Number(row.minutes) || 0,
  }));
}

async function fetchCoachExerciseLibrary({ clientId, from, to }) {
  const result = await pool.query(
    `SELECT
       e.name,
       COUNT(DISTINCT r.id)::integer AS sessions,
       MAX(r.completed_at::date) AS last_date,
       ((ARRAY_AGG(sl.load ORDER BY sl.logged_at DESC) FILTER (WHERE sl.load IS NOT NULL)))[1] AS last_load,
       (ARRAY_AGG(sl.reps ORDER BY sl.logged_at DESC))[1] AS last_reps,
       ARRAY_AGG(DISTINCT r.id) AS session_ids
     FROM set_log sl
     JOIN routine r ON r.id = sl.routine_id
     JOIN client c ON r.athlete_id = COALESCE(c.clerk_user_id, c.id)
     JOIN exercise e ON e.id = sl.exercise_id
     WHERE c.id = $1
       AND r.completed_at IS NOT NULL
       AND r.completed_at::date BETWEEN $2::date AND $3::date
     GROUP BY e.id, e.name
     ORDER BY MAX(r.completed_at::date) DESC, e.name`,
    [clientId, from, to],
  );

  const grouped = new Map();
  for (const row of result.rows) {
    const key = normalizeName(row.name);
    if (!key) continue;
    const current = grouped.get(key) ?? {
      key,
      name: row.name,
      sessions: new Set(),
      lastDate: databaseDateValue(row.last_date),
      lastLoad: row.last_load === null || row.last_load === undefined || Number(row.last_load) <= 0 ? null : Number(row.last_load),
      lastReps: Number(row.last_reps) || 0,
    };
    for (const sessionId of row.session_ids ?? []) current.sessions.add(sessionId);
    if (databaseDateValue(row.last_date) >= current.lastDate) {
      current.name = row.name;
      current.lastDate = databaseDateValue(row.last_date);
      current.lastLoad = row.last_load === null || row.last_load === undefined || Number(row.last_load) <= 0 ? null : Number(row.last_load);
      current.lastReps = Number(row.last_reps) || 0;
    }
    grouped.set(key, current);
  }

  return [...grouped.values()]
    .map((item) => ({
      key: item.key,
      name: item.name,
      sessions: item.sessions.size,
      lastDate: item.lastDate,
      lastLoad: item.lastLoad,
      lastReps: item.lastReps,
    }))
    .sort((a, b) => b.lastDate.localeCompare(a.lastDate) || a.name.localeCompare(b.name));
}

async function findCoachExerciseRows({ clientId, exerciseKey, from, to }) {
  const result = await pool.query(
    `SELECT
       e.name,
       e.scheme,
       r.completed_at::date AS training_date,
       sl.load,
       sl.reps
     FROM set_log sl
     JOIN routine r ON r.id = sl.routine_id
     JOIN client c ON r.athlete_id = COALESCE(c.clerk_user_id, c.id)
     JOIN exercise e ON e.id = sl.exercise_id
     WHERE c.id = $1
       AND r.completed_at IS NOT NULL
       AND r.completed_at::date BETWEEN $2::date AND $3::date
     ORDER BY r.completed_at::date, sl.logged_at`,
    [clientId, from, to],
  );
  return result.rows.filter((row) => normalizeName(row.name) === exerciseKey);
}

function mapCoachExerciseGoal(row) {
  if (!row) return null;
  return {
    baselineDate: databaseDateValue(row.baseline_date),
    baselineLoadKg: row.baseline_load_kg === null ? null : Number(row.baseline_load_kg),
    baselineReps: Number(row.baseline_reps) || 0,
    targetDate: databaseDateValue(row.target_date),
    targetLoadKg: row.target_load_kg === null ? null : Number(row.target_load_kg),
    targetReps: Number(row.target_reps) || 0,
    note: row.note ?? '',
  };
}

async function fetchCoachExerciseProgress({ clientId, exerciseKey, from, to }) {
  const [rows, goalResult] = await Promise.all([
    findCoachExerciseRows({ clientId, exerciseKey, from, to }),
    pool.query(
      `SELECT baseline_date, baseline_load_kg, baseline_reps, target_date, target_load_kg, target_reps, note
       FROM client_exercise_goal
       WHERE client_id = $1 AND exercise_key = $2`,
      [clientId, exerciseKey],
    ),
  ]);
  if (!rows.length) return null;

  const goal = mapCoachExerciseGoal(goalResult.rows[0]);
  const latestScheme = [...rows].reverse().find((row) => row.scheme)?.scheme;
  const targetReps = goal?.targetReps || repsFromScheme(latestScheme);
  const bodyweight = rows.every((row) => row.load === null || Number(row.load) <= 0);
  const granularity = statsGranularity(from, to);
  const buckets = new Map();

  for (const row of rows) {
    const date = databaseDateValue(row.training_date);
    const bucketStart = granularity === 'day' ? date : isoWeekStart(date);
    const bucket = buckets.get(bucketStart) ?? [];
    bucket.push(row);
    buckets.set(bucketStart, bucket);
  }

  const points = [...buckets.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([bucketStart, bucketRows]) => {
    const validRows = bodyweight
      ? bucketRows.filter((row) => Number(row.reps) > 0).sort((a, b) => Number(b.reps) - Number(a.reps))
      : bucketRows
        .filter((row) => Number(row.load) > 0 && Number(row.reps) >= targetReps)
        .sort((a, b) => Number(b.load) - Number(a.load) || Number(b.reps) - Number(a.reps));
    const bestAttempt = validRows[0] ?? [...bucketRows].sort((a, b) => Number(b.reps) - Number(a.reps))[0];
    const meetsTarget = bodyweight
      ? Number(bestAttempt?.reps) >= targetReps
      : Boolean(validRows[0]);
    return {
      bucketStart,
      label: statsBucketLabel(bucketStart),
      loadKg: bodyweight || !meetsTarget ? null : Number(bestAttempt.load),
      reps: bestAttempt ? Number(bestAttempt.reps) || 0 : null,
      meetsTarget,
    };
  });

  return {
    exercise: {
      key: exerciseKey,
      name: rows[0].name,
      targetReps,
      bodyweight,
    },
    points,
    goal,
  };
}

async function fetchCoachStatistics({ clientId, from, to }) {
  const [clientCountResult, activeResult, summaryResult, volumeResult, weeklyResult, history, activity, heatmap] = await Promise.all([
    pool.query('SELECT COUNT(*)::integer AS count FROM client WHERE ($1::text IS NULL OR id = $1)', [clientId]),
    pool.query(
      `SELECT COUNT(*)::integer AS count
       FROM client
       WHERE ($1::text IS NULL OR id = $1)
         AND NULLIF(live_routine, '') IS NOT NULL`,
      [clientId],
    ),
    pool.query(
      `WITH scoped_routines AS (${coachScopedRoutines})
       SELECT
         COUNT(*)::integer AS scheduled,
         COUNT(*) FILTER (WHERE completed_at IS NOT NULL)::integer AS completed,
         COALESCE(SUM(CASE WHEN completed_at IS NOT NULL THEN estimated_minutes ELSE 0 END), 0)::integer AS minutes
       FROM scoped_routines
       WHERE scheduled_date BETWEEN $2::date AND $3::date`,
      [clientId, from, to],
    ),
    pool.query(
      `SELECT COALESCE(SUM(COALESCE(sl.load, 0) * sl.reps), 0)::double precision AS volume_kg
       FROM set_log sl
       JOIN routine r ON r.id = sl.routine_id
       JOIN client c ON r.athlete_id = COALESCE(c.clerk_user_id, c.id)
       WHERE ($1::text IS NULL OR c.id = $1)
         AND sl.logged_at::date BETWEEN $2::date AND $3::date`,
      [clientId, from, to],
    ),
    pool.query(
      `SELECT
         date_trunc('week', sl.logged_at)::date AS week_start,
         SUM(COALESCE(sl.load, 0) * sl.reps)::double precision AS volume_kg
       FROM set_log sl
       JOIN routine r ON r.id = sl.routine_id
       JOIN client c ON r.athlete_id = COALESCE(c.clerk_user_id, c.id)
       WHERE ($1::text IS NULL OR c.id = $1)
         AND sl.logged_at::date BETWEEN $2::date AND $3::date
       GROUP BY date_trunc('week', sl.logged_at)::date
       ORDER BY week_start`,
      [clientId, from, to],
    ),
    fetchCoachHistory({ clientId, from, to, limit: 5, offset: 0 }),
    fetchCoachActivity({ clientId, from, to }),
    fetchCoachHeatmap({ clientId, from, to }),
  ]);

  const summaryRow = summaryResult.rows[0] ?? {};
  const scheduledRoutines = Number(summaryRow.scheduled) || 0;
  const completedRoutines = Number(summaryRow.completed) || 0;
  const weeklyVolume = weeklyResult.rows.map((row) => {
    const weekStart = databaseDateValue(row.week_start);
    const [, month, day] = weekStart.split('-');
    return {
      weekStart,
      label: `${day}/${month}`,
      volumeKg: Number(row.volume_kg) || 0,
    };
  });

  return {
    scope: { clientId, from, to },
    summary: {
      clientCount: Number(clientCountResult.rows[0]?.count) || 0,
      activeNow: Number(activeResult.rows[0]?.count) || 0,
      scheduledRoutines,
      completedRoutines,
      completionRate: scheduledRoutines ? Math.round((completedRoutines / scheduledRoutines) * 100) : 0,
      sessions: completedRoutines,
      totalMinutes: Number(summaryRow.minutes) || 0,
      volumeKg: Number(volumeResult.rows[0]?.volume_kg) || 0,
    },
    weeklyVolume,
    activity,
    heatmap,
    recentSessions: history.items,
  };
}

app.get('/v1/coach/statistics', { preHandler: authenticate }, async (request, reply) => {
  const profile = await requireCoach(request, reply);
  if (!profile) return;
  const params = readStatsQuery(request, reply);
  if (!params) return;
  if (!(await validateCoachClient(params.clientId, reply))) return;
  return fetchCoachStatistics(params);
});

app.get('/v1/coach/statistics/exercises', { preHandler: authenticate }, async (request, reply) => {
  const profile = await requireCoach(request, reply);
  if (!profile) return;
  const params = readStatsQuery(request, reply);
  if (!params) return;
  if (!params.clientId) {
    return reply.code(400).send({ error: 'Necesitamos seleccionar un alumno' });
  }
  if (!(await validateCoachClient(params.clientId, reply))) return;
  return { items: await fetchCoachExerciseLibrary(params) };
});

app.get('/v1/coach/statistics/exercises/progress', { preHandler: authenticate }, async (request, reply) => {
  const profile = await requireCoach(request, reply);
  if (!profile) return;
  const params = readStatsExerciseQuery(request, reply);
  if (!params) return;
  if (!(await validateCoachClient(params.clientId, reply))) return;
  const progress = await fetchCoachExerciseProgress(params);
  if (!progress) return reply.code(404).send({ error: 'No encontramos registros para ese ejercicio en el período' });
  return progress;
});

app.put('/v1/coach/statistics/exercises/goal', { preHandler: authenticate }, async (request, reply) => {
  const profile = await requireCoach(request, reply);
  if (!profile) return;

  const body = request.body ?? {};
  const clientId = textValue(body.clientId);
  const exerciseKey = normalizeName(textValue(body.exerciseKey));
  const exerciseName = textValue(body.exerciseName).slice(0, 120);
  const baselineDate = textValue(body.baselineDate);
  const targetDate = textValue(body.targetDate);
  const baselineReps = Number(body.baselineReps);
  const targetReps = Number(body.targetReps);
  const baselineLoadKg = body.baselineLoadKg === null || body.baselineLoadKg === undefined || body.baselineLoadKg === ''
    ? null
    : Number(body.baselineLoadKg);
  const targetLoadKg = body.targetLoadKg === null || body.targetLoadKg === undefined || body.targetLoadKg === ''
    ? null
    : Number(body.targetLoadKg);
  const note = textValue(body.note).slice(0, 500);

  if (!clientId || !(await validateCoachClient(clientId, reply))) return;
  if (!exerciseKey || !exerciseName) return reply.code(400).send({ error: 'Falta el ejercicio del objetivo' });
  if (!validIsoDate(baselineDate) || !validIsoDate(targetDate) || baselineDate > targetDate) {
    return reply.code(400).send({ error: 'Las fechas del objetivo no son válidas' });
  }
  if (!Number.isInteger(baselineReps) || baselineReps < 1 || baselineReps > 100 || !Number.isInteger(targetReps) || targetReps < 1 || targetReps > 100) {
    return reply.code(400).send({ error: 'Las repeticiones deben ser números enteros entre 1 y 100' });
  }
  for (const load of [baselineLoadKg, targetLoadKg]) {
    if (load !== null && (!Number.isFinite(load) || load < 0 || load > 1000)) {
      return reply.code(400).send({ error: 'La carga debe ser un número entre 0 y 1000 kg' });
    }
  }

  const available = await pool.query(
    `SELECT DISTINCT e.name
       FROM set_log sl
       JOIN routine r ON r.id = sl.routine_id
       JOIN client c ON r.athlete_id = COALESCE(c.clerk_user_id, c.id)
       JOIN exercise e ON e.id = sl.exercise_id
      WHERE c.id = $1`,
    [clientId],
  );
  if (!available.rows.some((row) => normalizeName(row.name) === exerciseKey)) {
    return reply.code(404).send({ error: 'Ese ejercicio todavía no tiene registros del alumno' });
  }

  const result = await pool.query(
    `INSERT INTO client_exercise_goal (
       client_id, exercise_key, exercise_name, baseline_date, baseline_load_kg, baseline_reps,
       target_date, target_load_kg, target_reps, note
     ) VALUES ($1, $2, $3, $4::date, $5, $6, $7::date, $8, $9, $10)
     ON CONFLICT (client_id, exercise_key) DO UPDATE SET
       exercise_name = EXCLUDED.exercise_name,
       baseline_date = EXCLUDED.baseline_date,
       baseline_load_kg = EXCLUDED.baseline_load_kg,
       baseline_reps = EXCLUDED.baseline_reps,
       target_date = EXCLUDED.target_date,
       target_load_kg = EXCLUDED.target_load_kg,
       target_reps = EXCLUDED.target_reps,
       note = EXCLUDED.note,
       updated_at = NOW()
     RETURNING baseline_date, baseline_load_kg, baseline_reps, target_date, target_load_kg, target_reps, note`,
    [clientId, exerciseKey, exerciseName, baselineDate, baselineLoadKg, baselineReps, targetDate, targetLoadKg, targetReps, note],
  );
  return { ok: true, goal: mapCoachExerciseGoal(result.rows[0]) };
});

app.get('/v1/coach/statistics/history', { preHandler: authenticate }, async (request, reply) => {
  const profile = await requireCoach(request, reply);
  if (!profile) return;
  const params = readStatsQuery(request, reply);
  if (!params) return;
  if (!(await validateCoachClient(params.clientId, reply))) return;

  const query = request.query ?? {};
  const limit = Math.min(100, Math.max(1, Number.parseInt(query.limit, 10) || 25));
  const offset = Math.max(0, Number.parseInt(query.offset, 10) || 0);
  return fetchCoachHistory({ ...params, limit, offset });
});

app.get('/v1/coach/statistics/history/:id', { preHandler: authenticate }, async (request, reply) => {
  const profile = await requireCoach(request, reply);
  if (!profile) return;

  const routineId = textValue(request.params?.id);
  if (!routineId) return reply.code(400).send({ error: 'Falta la rutina del historial' });

  const detail = await fetchCoachHistoryDetail(routineId);
  if (!detail) return reply.code(404).send({ error: 'No encontramos esa sesión' });
  return detail;
});

function secretMatches(received, expected) {
  const receivedBuffer = Buffer.from(received);
  const expectedBuffer = Buffer.from(expected);
  return receivedBuffer.length === expectedBuffer.length && timingSafeEqual(receivedBuffer, expectedBuffer);
}

async function exactClerkUsersByEmail(email) {
  const result = await clerk.users.getUserList({ emailAddress: [email], limit: 10 });
  return result.data.filter((user) =>
    user.emailAddresses.some((address) => address.emailAddress.trim().toLowerCase() === email),
  );
}

async function removeUserData(userId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await removeAthleteRoutines(client, userId);
    await client.query('DELETE FROM app_user WHERE clerk_user_id = $1', [userId]);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

let ephemeralResetInProgress = false;

app.post('/v1/test-accounts/ephemeral/reset', async (request, reply) => {
  if (!ephemeralTestEnabled || !ephemeralTestEmail || !ephemeralTestPassword) {
    return reply.code(404).send({ error: 'La cuenta temporal no estÃ¡ habilitada' });
  }

  const email = typeof request.body?.email === 'string' ? request.body.email.trim().toLowerCase() : '';
  const password = typeof request.body?.password === 'string' ? request.body.password : '';
  if (email !== ephemeralTestEmail || !secretMatches(password, ephemeralTestPassword)) {
    return reply.code(403).send({ error: 'Credenciales temporales incorrectas' });
  }
  if (ephemeralResetInProgress) {
    return reply.code(409).send({ error: 'La cuenta temporal se estÃ¡ reiniciando; probÃ¡ de nuevo' });
  }

  ephemeralResetInProgress = true;
  try {
    const existingUsers = await exactClerkUsersByEmail(email);
    for (const user of existingUsers) {
      await removeUserData(user.id);
      await clerk.users.deleteUser(user.id);
    }

    await clerk.users.createUser({
      emailAddress: [email],
      password,
      firstName: 'Ejemplo',
      lastName: 'Temporal',
      unsafeMetadata: { displayName: 'Ejemplo Temporal', ephemeralTest: true },
      skipPasswordChecks: true,
    });
    return reply.code(201).send({ ok: true });
  } catch (error) {
    request.log.error({ error }, 'Ephemeral test account reset failed');
    return reply.code(500).send({ error: 'No pudimos preparar la cuenta temporal' });
  } finally {
    ephemeralResetInProgress = false;
  }
});

app.delete('/v1/test-accounts/ephemeral', { preHandler: authenticate }, async (request, reply) => {
  if (!ephemeralTestEnabled || !ephemeralTestEmail) {
    return reply.code(404).send({ error: 'La cuenta temporal no estÃ¡ habilitada' });
  }

  const user = await ensureUser(request.userId);
  if (user.email?.trim().toLowerCase() !== ephemeralTestEmail) {
    return reply.code(403).send({ error: 'Esta cuenta no es temporal' });
  }

  try {
    await removeUserData(request.userId);
    // Keep the Clerk user alive until the native client has ended its
    // session. Deleting it here first makes Clerk reject `signOut()` and
    // leaves the device with a stale local session. The next temporary
    // registration uses the reset endpoint above, which deletes and
    // recreates this disposable Clerk account from scratch.
    return reply.send({ ok: true });
  } catch (error) {
    request.log.error({ error, userId: request.userId }, 'Ephemeral test account deletion failed');
    return reply.code(500).send({ error: 'No pudimos borrar la cuenta temporal' });
  }
});

const importSystemPrompt = `
Sos el parser de rutinas de Coachlander. Recibís texto libre en español con una rutina de gimnasio.
Devolvé únicamente JSON válido, sin markdown ni explicaciones fuera del JSON.

Reglas obligatorias:
- Detectá cuántos días tiene la rutina: puede tener entre 1 y 7 días.
- Separá la rutina en esa cantidad de días respetando el orden y los bloques del texto.
- No agregues días vacíos ni completes hasta siete si el texto tiene menos.
- Conservá los nombres de los ejercicios tal como aparecen, corrigiendo sólo errores obvios de escritura.
- "reps" debe ser un string corto: "8", "8-10" o "al fallo".
- "sets" debe ser un entero positivo.
- Sugerí "loadKg" como carga inicial externa conservadora en kg, redondeada a 0,5 kg. Usá 0 para peso corporal.
- El peso y la altura son sólo referencias generales: no inventes una precisión falsa. Si no podés estimar una carga de forma razonable, usá null y marcá "uncertain": true.
- Para cada día devolvé entre 1 y 12 ejercicios. No agregues ejercicios que no estén en el texto.
- Marcá "uncertain": true si el nombre es ambiguo o la carga necesita confirmación.

Formato exacto:
{
  "routineName": "string",
  "days": [
    {
      "name": "Día 1 — nombre corto",
      "exercises": [
        {
          "name": "string",
          "sets": 3,
          "reps": "8-10",
          "loadKg": 20,
          "restSeconds": 90,
          "uncertain": false,
          "raw": "línea original",
          "question": "string opcional"
        }
      ]
    }
  ]
}
`.trim();

function textValue(value, fallback = '') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function normalizedReps(value) {
  const raw = textValue(value, '8').toLowerCase().replace(/repeticiones?|reps?/g, '').trim();
  const match = raw.match(/\d+(?:\s*[-–]\s*\d+)?|al fallo|fallo/);
  return (match?.[0] ?? '8').replace(/\s*[-–]\s*/g, '-');
}

function normalizedLoad(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0 || number > 500) return null;
  return Math.round(number * 2) / 2;
}

function normalizedInteger(value, fallback, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, Math.round(number)));
}

/** Número de semana (1-5) del mes para una fecha YYYY-MM-DD (cuenta los lunes). */
function weekOfMonth(dateStr) {
  const date = new Date(`${dateStr}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return 1;
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  let week = 1;
  for (let day = 1; day <= daysInMonth; day++) {
    const d = new Date(Date.UTC(year, month, day));
    if (d.getUTCDay() !== 1) continue;
    if (d.getTime() <= date.getTime()) week++;
  }
  return week;
}

/** Normaliza un nombre para matcheo: minúsculas y sin acentos. */
function normalizeName(value) {
  return String(value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Redondea a 0,5 kg. */
function roundLoad(value) {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  return Math.round(Math.max(0, value) * 2) / 2;
}

/**
 * Predice la carga sugerida para un alumno y un ejercicio:
 * 1) Historial del alumno (set_log por nombre normalizado): lo respeta tal cual.
 * 2) Sin historial: catálogo load_reference (peso libre % peso corporal, máquina
 *    base_load escalada por el peso del alumno).
 * 3) Sin match: null (a confirmar).
 */
async function predictLoad(client, athleteId, exerciseName, weightKg) {
  const normalized = normalizeName(exerciseName);
  if (!normalized) return null;

  const history = await client.query(
    `SELECT e.name, sl.load, sl.reps, sl.logged_at
       FROM set_log sl
       JOIN exercise e ON e.id = sl.exercise_id
      WHERE sl.clerk_user_id = $1 AND sl.load IS NOT NULL AND sl.load > 0
      ORDER BY sl.logged_at DESC
      LIMIT 500`,
    [athleteId],
  );
  for (const row of history.rows) {
    if (normalizeName(row.name) === normalized) {
      return roundLoad(row.load);
    }
  }

  const ref = await client.query(
    'SELECT pct_bodyweight, base_load FROM load_reference WHERE name = $1 LIMIT 1',
    [normalized],
  );
  const reference = ref.rows[0];
  if (!reference) return null;

  if (reference.pct_bodyweight != null && Number.isFinite(Number(reference.pct_bodyweight))) {
    const weight = Number(weightKg);
    if (Number.isFinite(weight) && weight > 0) {
      return roundLoad(reference.pct_bodyweight * weight);
    }
    return roundLoad(reference.base_load ?? null);
  }
  if (reference.base_load != null && Number.isFinite(Number(reference.base_load))) {
    const weight = Number(weightKg);
    if (Number.isFinite(weight) && weight > 0) {
      const factor = Math.min(1.5, Math.max(0.5, weight / 70));
      return roundLoad(reference.base_load * factor);
    }
    return roundLoad(reference.base_load);
  }
  return null;
}

function normalizeImportedDays(rawDays) {
  if (!Array.isArray(rawDays) || rawDays.length < 1 || rawDays.length > 7) {
    throw new Error('DeepSeek debe devolver entre uno y siete días');
  }

  return rawDays.map((rawDay, dayIndex) => {
    const dayName = textValue(rawDay?.name, `Día ${dayIndex + 1}`).slice(0, 80);
    const rawExercises = Array.isArray(rawDay?.exercises) ? rawDay.exercises : [];
    if (!rawExercises.length) throw new Error(`El día ${dayIndex + 1} no tiene ejercicios`);

    return {
      day: dayIndex + 1,
      name: dayName,
      exercises: rawExercises.slice(0, 12).map((rawExercise, exerciseIndex) => ({
        id: `import-${dayIndex + 1}-${exerciseIndex + 1}-${randomUUID()}`,
        name: textValue(rawExercise?.name, `Ejercicio ${exerciseIndex + 1}`).slice(0, 120),
        sets: normalizedInteger(rawExercise?.sets, 3, 1, 20),
        reps: normalizedReps(rawExercise?.reps),
        load: normalizedLoad(rawExercise?.loadKg),
        rest: normalizedInteger(rawExercise?.restSeconds, 90, 20, 300),
        day: dayIndex + 1,
        dayName,
        uncertain: rawExercise?.uncertain === true || normalizedLoad(rawExercise?.loadKg) === null,
        raw: textValue(rawExercise?.raw, textValue(rawExercise?.name, '')),
        question: textValue(rawExercise?.question, 'Confirmá la carga inicial antes de guardar.'),
        note: textValue(rawExercise?.note, '').slice(0, 300),
      })),
    };
  });
}

function jsonFromModel(content) {
  const cleaned = String(content ?? '')
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '');
  return JSON.parse(cleaned);
}

async function interpretRoutine({ text, weightKg, heightM }) {
  if (!deepseekApiKey) {
    const error = new Error('DeepSeek no está configurado en el backend');
    error.code = 'DEEPSEEK_NOT_CONFIGURED';
    throw error;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 90_000);
  try {
    const response = await fetch(`${deepseekBaseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: `Bearer ${deepseekApiKey}`,
      },
      body: JSON.stringify({
        model: deepseekModel,
        messages: [
          { role: 'system', content: importSystemPrompt },
          {
            role: 'user',
            content: JSON.stringify({
              profile: {
                weightKg: Number.isFinite(weightKg) ? weightKg : null,
                heightM: Number.isFinite(heightM) ? heightM : null,
              },
              routineText: text,
              instruction: 'Detectá la cantidad real de días, entre 1 y 7, y devolvé JSON sin agregar días.',
            }),
          },
        ],
        response_format: { type: 'json_object' },
        thinking: { type: 'disabled' },
        max_tokens: 12_000,
      }),
      signal: controller.signal,
    });

    const body = await response.text();
    if (!response.ok) {
      throw new Error(`DeepSeek respondió ${response.status}: ${body.slice(0, 240)}`);
    }

    const payload = JSON.parse(body);
    const content = payload?.choices?.[0]?.message?.content;
    const parsed = jsonFromModel(content);
    const days = normalizeImportedDays(parsed.days);
    return {
      routineName: textValue(parsed.routineName, 'Rutina importada').slice(0, 120),
      days,
      exercises: days.flatMap((day) => day.exercises),
    };
  } finally {
    clearTimeout(timeout);
  }
}

app.post('/v1/import/parse', { preHandler: authenticate }, async (request, reply) => {
  const body = request.body ?? {};
  const text = typeof body.text === 'string' ? body.text.trim().slice(0, 30_000) : '';
  if (!text) return reply.code(400).send({ error: 'Pegá una rutina para interpretar' });

  const profile = await ensureUser(request.userId);
  const storedWeightKg = Number(profile.weight_kg);
  const storedHeightM = Number(profile.height_m);
  const weightKg = Number.isFinite(storedWeightKg) ? storedWeightKg : Number(body.weightKg);
  const heightM = Number.isFinite(storedHeightM) ? storedHeightM : Number(body.heightM);
  try {
    const result = await interpretRoutine({
      text,
      weightKg: Number.isFinite(weightKg) && weightKg > 0 ? weightKg : null,
      heightM: Number.isFinite(heightM) && heightM > 0 ? heightM : null,
    });

    // Recalcula las cargas con el predictor del atleta (historial + catálogo).
    const client = await pool.connect();
    try {
      const predictedLoads = new Map();
      for (const exercise of result.exercises) {
        const load = await predictLoad(client, request.userId, exercise.name, weightKg);
        predictedLoads.set(exercise.id, load);
      }
      result.exercises = result.exercises.map((exercise) => ({
        ...exercise,
        load: predictedLoads.get(exercise.id) ?? exercise.load,
        uncertain: predictedLoads.get(exercise.id) === null ? exercise.uncertain : exercise.uncertain,
      }));
      for (const day of result.days) {
        day.exercises = day.exercises.map((exercise) => ({
          ...exercise,
          load: predictedLoads.get(exercise.id) ?? exercise.load,
        }));
      }
    } finally {
      client.release();
    }

    return result;
  } catch (error) {
    if (error?.code === 'DEEPSEEK_NOT_CONFIGURED') {
      return reply.code(503).send({ error: error.message });
    }
    request.log.error({ error }, 'Routine interpretation failed');
    return reply.code(502).send({ error: 'No pudimos interpretar la rutina con DeepSeek' });
  }
});

app.post('/v1/import/routines', { preHandler: authenticate }, async (request, reply) => {
  const body = request.body ?? {};
  const routineName = textValue(body.routineName, 'Rutina importada').slice(0, 120);
  let days;
  try {
    days = normalizeImportedDays(body.days);
  } catch (error) {
    return reply.code(400).send({ error: error.message });
  }

  await ensureUser(request.userId);
  const client = await pool.connect();
  const routineIds = [];
  const planId = `plan-${randomUUID()}`;
  try {
    await client.query('BEGIN');
    await removeAthleteRoutines(client, request.userId);

    for (const [dayIndex, day] of days.entries()) {
      const routineId = `routine-${randomUUID()}`;
      routineIds.push(routineId);
      const totalSets = day.exercises.reduce((sum, exercise) => sum + exercise.sets, 0);
      await client.query(
        `INSERT INTO routine
          (id, plan_id, name, block, week, day, coach_id, athlete_id, estimated_minutes, seconds_per_set, is_today)
         VALUES ($1, $2, $3, $4, 1, $5, NULL, $6, $7, 45, $8)`,
        [
          routineId,
          planId,
          `${routineName} · ${day.name}`,
          'Importada',
          dayIndex + 1,
          request.userId,
          Math.max(10, Math.ceil((totalSets * 2.25) + (day.exercises.length * 1.5))),
          dayIndex === 0 ? 1 : 0,
        ],
      );

      for (const [position, exercise] of day.exercises.entries()) {
        const exerciseId = `exercise-${randomUUID()}`;
        await client.query(
          `INSERT INTO exercise
            (id, name, scheme, suggested, sets, work, rest, focus, cues, overload,
             last_date, last_load, last_reps, last_note)
           VALUES ($1, $2, $3, $4, $5, 30, $6, $7, $8, $9, NULL, NULL, NULL, NULL)`,
          [
            exerciseId,
            exercise.name,
            `${exercise.sets} × ${exercise.reps}`,
            exercise.load ?? 0,
            exercise.sets,
            exercise.rest,
            day.name,
            'Confirmá la carga y la técnica antes de comenzar.',
            body.autoOverload === true ? 2.5 : null,
          ],
        );
        await client.query(
          `INSERT INTO routine_exercise (routine_id, exercise_id, position)
           VALUES ($1, $2, $3)`,
          [routineId, exerciseId, position],
        );
      }
    }

    await client.query('COMMIT');
    return reply.code(201).send({ ok: true, planId, routineIds });
  } catch (error) {
    await client.query('ROLLBACK');
    request.log.error({ error }, 'Imported routine save failed');
    return reply.code(500).send({ error: 'No pudimos guardar la rutina' });
  } finally {
    client.release();
  }
});

app.post('/v1/templates', { preHandler: authenticate }, async (request, reply) => {
  const body = request.body ?? {};
  const name = textValue(body.name, 'Rutina creada').slice(0, 120);
  let days;
  try {
    days = normalizeImportedDays(body.days);
  } catch (error) {
    return reply.code(400).send({ error: error.message });
  }
  if (days.length < 1 || days.length > 7) {
    return reply.code(400).send({ error: 'La rutina debe tener entre 1 y 7 días' });
  }

  const profile = await ensureUser(request.userId);
  if (profile.role !== 'coach') return reply.code(403).send({ error: 'Solo un entrenador puede crear plantillas' });
  const templateId = `template-${randomUUID()}`;
  const totalExercises = days.reduce((sum, day) => sum + day.exercises.length, 0);
  const totalSets = days.reduce((sum, day) => sum + day.exercises.reduce((s, exercise) => s + exercise.sets, 0), 0);
  const meta = `${totalExercises} ejercicios · ${totalSets} series`;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const positionResult = await client.query('SELECT COALESCE(MAX(position), 0) + 1 AS next FROM template');
    const position = Number(positionResult.rows[0]?.next ?? 0);
    const completedAt = body.completed === true ? new Date().toISOString() : null;
    await client.query(
      `INSERT INTO template (id, name, meta, assigned, position, completed_at) VALUES ($1, $2, $3, NULL, $4, $5)`,
      [templateId, name, meta, position, completedAt],
    );
    for (const day of days) {
      await client.query(
        `INSERT INTO template_day (template_id, day, name) VALUES ($1, $2, $3)`,
        [templateId, day.day, day.name],
      );
      for (const [index, exercise] of day.exercises.entries()) {
        await client.query(
          `INSERT INTO template_exercise (template_id, day, position, name, sets, reps, load_kg, rest_seconds, note)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [templateId, day.day, index, exercise.name, exercise.sets, exercise.reps, exercise.load, exercise.rest, exercise.note || null],
        );
      }
    }
    await client.query('COMMIT');
    return reply.code(201).send({ ok: true, id: templateId });
  } catch (error) {
    await client.query('ROLLBACK');
    request.log.error({ error }, 'Template create failed');
    return reply.code(500).send({ error: 'No pudimos guardar la plantilla' });
  } finally {
    client.release();
  }
});

app.patch('/v1/templates/:id', { preHandler: authenticate }, async (request, reply) => {
  const profile = await ensureUser(request.userId);
  if (profile.role !== 'coach') return reply.code(403).send({ error: 'Solo un entrenador puede editar plantillas' });

  const templateId = textValue(request.params?.id);
  if (!templateId) return reply.code(400).send({ error: 'Falta la plantilla a editar' });

  let days;
  try {
    days = normalizeImportedDays(request.body?.days);
  } catch (error) {
    return reply.code(400).send({ error: error.message });
  }

  const name = textValue(request.body?.name, 'Rutina creada').slice(0, 120);
  const totalExercises = days.reduce((sum, day) => sum + day.exercises.length, 0);
  const totalSets = days.reduce((sum, day) => sum + day.exercises.reduce((s, exercise) => s + exercise.sets, 0), 0);
  const meta = `${totalExercises} ejercicios · ${totalSets} series`;
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    const templateResult = await client.query('SELECT id FROM template WHERE id = $1 FOR UPDATE', [templateId]);
    if (!templateResult.rows[0]) {
      await client.query('ROLLBACK');
      return reply.code(404).send({ error: 'No encontramos esa plantilla' });
    }

    // El descanso no forma parte del payload del entrenador. Conservamos el
    // valor técnico existente por posición y usamos 90 s para ejercicios nuevos.
    const restResult = await client.query(
      'SELECT day, position, rest_seconds FROM template_exercise WHERE template_id = $1',
      [templateId],
    );
    const restByPosition = new Map(
      restResult.rows.map((row) => [`${Number(row.day)}:${Number(row.position)}`, Number(row.rest_seconds) || 90]),
    );

    await client.query('DELETE FROM template_exercise WHERE template_id = $1', [templateId]);
    await client.query('DELETE FROM template_day WHERE template_id = $1', [templateId]);
    for (const day of days) {
      await client.query(
        `INSERT INTO template_day (template_id, day, name) VALUES ($1, $2, $3)`,
        [templateId, day.day, day.name],
      );
      for (const [index, exercise] of day.exercises.entries()) {
        await client.query(
          `INSERT INTO template_exercise (template_id, day, position, name, sets, reps, load_kg, rest_seconds, note)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [
            templateId,
            day.day,
            index,
            exercise.name,
            exercise.sets,
            exercise.reps,
            exercise.load,
            restByPosition.get(`${day.day}:${index}`) ?? 90,
            exercise.note || null,
          ],
        );
      }
    }
    await client.query('UPDATE template SET name = $1, meta = $2 WHERE id = $3', [name, meta, templateId]);
    await client.query('COMMIT');
    return reply.send({ ok: true, id: templateId });
  } catch (error) {
    await client.query('ROLLBACK');
    request.log.error({ error }, 'Template update failed');
    return reply.code(500).send({ error: 'No pudimos actualizar la plantilla' });
  } finally {
    client.release();
  }
});

app.delete('/v1/templates/:id', { preHandler: authenticate }, async (request, reply) => {
  const profile = await ensureUser(request.userId);
  if (profile.role !== 'coach') return reply.code(403).send({ error: 'Solo un entrenador puede eliminar plantillas' });

  const templateId = textValue(request.params?.id);
  if (!templateId) return reply.code(400).send({ error: 'Falta la plantilla a eliminar' });

  const result = await pool.query('DELETE FROM template WHERE id = $1 RETURNING id', [templateId]);
  if (!result.rows[0]) return reply.code(404).send({ error: 'No encontramos esa plantilla' });
  return reply.send({ ok: true, id: templateId });
});

app.post('/v1/templates/:id/assign', { preHandler: authenticate }, async (request, reply) => {
  const profile = await ensureUser(request.userId);
  if (profile.role !== 'coach') return reply.code(403).send({ error: 'Solo un entrenador puede asignar plantillas' });

  const templateId = textValue(request.params?.id);
  const clientIds = Array.isArray(request.body?.clientIds)
    ? request.body.clientIds.filter((id) => typeof id === 'string')
    : [];
  if (!templateId) return reply.code(400).send({ error: 'Falta la plantilla a asignar' });
  if (!clientIds.length) return reply.code(400).send({ error: 'Elegí al menos un alumno' });

  const weekStart = textValue(request.body?.weekStart);
  if (!weekStart) return reply.code(400).send({ error: 'Falta la semana a asignar' });
  const week = Number(request.body?.week) > 0 ? Number(request.body?.week) : weekOfMonth(weekStart);
  const replace = request.body?.replace === true;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const templateResult = await client.query('SELECT id, name FROM template WHERE id = $1', [templateId]);
    const templateRow = templateResult.rows[0];
    if (!templateRow) {
      await client.query('ROLLBACK');
      return reply.code(404).send({ error: 'No encontramos esa plantilla' });
    }

    const dayRows = await client.query(
      'SELECT day, name FROM template_day WHERE template_id = $1 ORDER BY day',
      [templateId],
    );
    const exerciseRows = await client.query(
      'SELECT day, position, name, sets, reps, load_kg, rest_seconds, note FROM template_exercise WHERE template_id = $1 ORDER BY day, position',
      [templateId],
    );
    const days = dayRows.rows.map((row) => ({
      day: row.day,
      name: row.name,
      exercises: exerciseRows.rows.filter((exercise) => exercise.day === row.day),
    }));
    if (!days.length) {
      await client.query('ROLLBACK');
      return reply.code(404).send({ error: 'La plantilla no tiene ejercicios' });
    }

    const results = [];
    for (const clientId of clientIds) {
      const clientRow = await client.query('SELECT clerk_user_id FROM client WHERE id = $1', [clientId]);
      const athleteId = clientRow.rows[0]?.clerk_user_id || clientId;
      const profile = await client.query(
        'SELECT weight_kg, height_m FROM app_user WHERE clerk_user_id = $1 LIMIT 1',
        [athleteId],
      );
      const weightKg = Number(profile.rows[0]?.weight_kg);
      if (replace) {
        await removeWeekRoutines(client, athleteId, weekStart);
      }
      const planId = `plan-${randomUUID()}`;
      const routineIds = [];
      for (const [dayIndex, day] of days.entries()) {
        const routineId = `routine-${randomUUID()}`;
        routineIds.push(routineId);
        const totalSets = day.exercises.reduce((sum, exercise) => sum + exercise.sets, 0);
        await client.query(
          `INSERT INTO routine
            (id, plan_id, name, block, week, week_start, day, coach_id, athlete_id, estimated_minutes, seconds_per_set, is_today)
           VALUES ($1, $2, $3, $4, $5, $6, $7, NULL, $8, $9, 45, $10)`,
          [
            routineId,
            planId,
            `${templateRow.name} · ${day.name}`,
            'Plantilla',
            week,
            weekStart,
            day.day,
            athleteId,
            Math.max(10, Math.ceil(totalSets * 2.25 + day.exercises.length * 1.5)),
            dayIndex === 0 ? 1 : 0,
          ],
        );

        for (const [position, exercise] of day.exercises.entries()) {
          const exerciseId = `exercise-${randomUUID()}`;
          const note = typeof exercise.note === 'string' && exercise.note.trim() ? exercise.note.trim() : '';
          const predicted = await predictLoad(client, athleteId, exercise.name, weightKg);
          const suggested = predicted ?? exercise.load_kg ?? 0;
          await client.query(
            `INSERT INTO exercise
              (id, name, scheme, suggested, sets, work, rest, focus, cues, overload,
               last_date, last_load, last_reps, last_note)
             VALUES ($1, $2, $3, $4, $5, 30, $6, $7, $8, $9, NULL, NULL, NULL, NULL)`,
            [
              exerciseId,
              exercise.name,
              `${exercise.sets} × ${exercise.reps}`,
              suggested,
              exercise.sets,
              exercise.rest_seconds,
              day.name,
              note || 'Cargá la plantilla del entrenador y confirmá la técnica antes de comenzar.',
              request.body?.autoOverload === true ? 2.5 : null,
            ],
          );
          await client.query(
            `INSERT INTO routine_exercise (routine_id, exercise_id, position)
             VALUES ($1, $2, $3)`,
            [routineId, exerciseId, position],
          );
        }
      }
      results.push({ clientId, planId, routineIds });
    }

    await client.query(
      'UPDATE template SET assigned = $2 WHERE id = $1',
      [templateId, `${clientIds.length} ${clientIds.length === 1 ? 'alumno' : 'alumnos'}`],
    );

    await client.query('COMMIT');
    return reply.code(201).send({ ok: true, results });
  } catch (error) {
    await client.query('ROLLBACK');
    request.log.error({ err: error }, 'Template assign failed');
    return reply.code(500).send({ error: error?.message ?? 'No pudimos asignar la plantilla' });
  } finally {
    client.release();
  }
});

app.patch('/v1/routines/:id', { preHandler: authenticate }, async (request, reply) => {
  const routineId = textValue(request.params?.id);
  if (!routineId) return reply.code(400).send({ error: 'Falta la rutina a actualizar' });

  const profile = await ensureUser(request.userId);
  if (profile.role !== 'coach') {
    return reply.code(403).send({ error: 'Solo un coach puede editar rutinas' });
  }

  const rawExercises = request.body?.exercises;
  if (!Array.isArray(rawExercises) || rawExercises.length < 1 || rawExercises.length > 50) {
    return reply.code(400).send({ error: 'La rutina debe tener entre 1 y 50 ejercicios' });
  }

  const seenIds = new Set();
  const inputExercises = [];
  for (const item of rawExercises) {
    const id = textValue(item?.id) || null;
    if (id) {
      if (seenIds.has(id)) return reply.code(400).send({ error: 'Hay ejercicios repetidos en la rutina' });
      seenIds.add(id);
    }

    const name = textValue(item?.name).slice(0, 160);
    if (!name) return reply.code(400).send({ error: 'Cada ejercicio necesita un nombre' });

    const sets = Number(item?.sets);
    if (!Number.isInteger(sets) || sets < 1 || sets > 20) {
      return reply.code(400).send({ error: 'Las series deben ser un entero entre 1 y 20' });
    }

    const suggested = normalizedLoad(item?.suggested);
    if (suggested === null) return reply.code(400).send({ error: 'La carga sugerida no es válida' });

    let overload = null;
    if (item?.overload !== null && item?.overload !== undefined && item?.overload !== '') {
      overload = normalizedLoad(item.overload);
      if (overload === null) return reply.code(400).send({ error: 'El overload no es válido' });
    }

    inputExercises.push({
      id,
      name,
      sets,
      reps: normalizedReps(item?.reps),
      suggested,
      overload,
      work: normalizedInteger(item?.work, 30, 0, 600),
      focus: textValue(item?.focus).slice(0, 120),
      cues: textValue(item?.cues).slice(0, 1000),
    });
  }

  const client = await pool.connect();
  let transactionStarted = false;
  const reject = async (status, message) => {
    if (transactionStarted) await client.query('ROLLBACK');
    return reply.code(status).send({ error: message });
  };

  try {
    await client.query('BEGIN');
    transactionStarted = true;

    const routineResult = await client.query(
      'SELECT id, athlete_id, block FROM routine WHERE id = $1 AND athlete_id IS NOT NULL FOR UPDATE',
      [routineId],
    );
    const routineRow = routineResult.rows[0];
    if (!routineRow) return reject(404, 'No encontramos esa rutina asignada');

    const currentResult = await client.query(
      `SELECT re.exercise_id, e.*
       FROM routine_exercise re
       JOIN exercise e ON e.id = re.exercise_id
       WHERE re.routine_id = $1
       ORDER BY re.position`,
      [routineId],
    );
    const currentById = new Map(currentResult.rows.map((row) => [row.exercise_id, row]));
    const currentIds = currentResult.rows.map((row) => row.exercise_id);
    const usageById = new Map();
    if (currentIds.length) {
      const usageResult = await client.query(
        `SELECT exercise_id, COUNT(*)::int AS usage_count
         FROM routine_exercise
         WHERE exercise_id = ANY($1::text[])
         GROUP BY exercise_id`,
        [currentIds],
      );
      for (const row of usageResult.rows) usageById.set(row.exercise_id, row.usage_count);
    }

    for (const item of inputExercises) {
      if (item.id && !currentById.has(item.id)) {
        return reject(400, 'Uno de los ejercicios no pertenece a esta rutina');
      }
      if (!item.focus) item.focus = routineRow.block || 'Rutina';
    }

    await client.query('DELETE FROM routine_exercise WHERE routine_id = $1', [routineId]);
    const exerciseIds = [];

    for (const [position, item] of inputExercises.entries()) {
      const previous = item.id ? currentById.get(item.id) : null;
      let exerciseId = item.id;
      const rest = previous?.rest ?? 90;
      const values = [
        item.name,
        `${item.sets} \u00d7 ${item.reps}`,
        item.suggested,
        item.sets,
        item.work,
        rest,
        item.focus,
        item.cues,
        item.overload,
      ];

      if (!previous || (item.id && usageById.get(item.id) > 1)) {
        exerciseId = `exercise-${randomUUID()}`;
        await client.query(
          `INSERT INTO exercise
            (id, name, scheme, suggested, sets, work, rest, focus, cues, overload,
             last_date, last_load, last_reps, last_note)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
          [
            exerciseId,
            ...values,
            previous?.last_date ?? null,
            previous?.last_load ?? null,
            previous?.last_reps ?? null,
            previous?.last_note ?? null,
          ],
        );
      } else {
        await client.query(
          `UPDATE exercise
           SET name = $1, scheme = $2, suggested = $3, sets = $4, work = $5,
               focus = $6, cues = $7, overload = $8
           WHERE id = $9`,
          [item.name, `${item.sets} \u00d7 ${item.reps}`, item.suggested, item.sets, item.work, item.focus, item.cues, item.overload, exerciseId],
        );
      }

      exerciseIds.push(exerciseId);
      await client.query(
        `INSERT INTO routine_exercise (routine_id, exercise_id, position)
         VALUES ($1, $2, $3)`,
        [routineId, exerciseId, position],
      );
    }

    if (currentIds.length) {
      await client.query(
        `DELETE FROM overload_row
         WHERE exercise_id = ANY($1::text[])
           AND NOT EXISTS (SELECT 1 FROM routine_exercise WHERE exercise_id = overload_row.exercise_id)`,
        [currentIds],
      );
      await client.query(
        `DELETE FROM exercise
         WHERE id = ANY($1::text[])
           AND NOT EXISTS (SELECT 1 FROM routine_exercise WHERE exercise_id = exercise.id)
           AND NOT EXISTS (SELECT 1 FROM overload_row WHERE exercise_id = exercise.id)`,
        [currentIds],
      );
    }

    await client.query('COMMIT');
    transactionStarted = false;
    return reply.send({ ok: true, routineId, exerciseIds });
  } catch (error) {
    if (transactionStarted) await client.query('ROLLBACK');
    request.log.error({ error, routineId }, 'Routine update failed');
    return reply.code(500).send({ error: 'No pudimos guardar la rutina' });
  } finally {
    client.release();
  }
});

app.patch('/v1/exercises/:id', { preHandler: authenticate }, async (request, reply) => {
  const exerciseId = textValue(request.params?.id);
  if (!exerciseId) return reply.code(400).send({ error: 'Falta el ejercicio a actualizar' });

  const profile = await ensureUser(request.userId);
  if (profile.role !== 'coach') {
    return reply.code(403).send({ error: 'Solo un coach puede editar ejercicios' });
  }

  const sets = Number(request.body?.sets);
  const reps = normalizedReps(request.body?.reps);
  const suggested = normalizedLoad(request.body?.suggested);
  const overload =
    request.body?.overload === null || request.body?.overload === undefined
      ? null
      : normalizedLoad(request.body.overload);

  if (!Number.isInteger(sets) || sets < 1 || sets > 20) {
    return reply.code(400).send({ error: 'Las series deben ser un entero entre 1 y 20' });
  }
  if (suggested === null) {
    return reply.code(400).send({ error: 'La carga sugerida no es válida' });
  }
  if (request.body?.overload !== null && request.body?.overload !== undefined && overload === null) {
    return reply.code(400).send({ error: 'El overload no es válido' });
  }

  const result = await pool.query(
    `UPDATE exercise
     SET scheme = $1, suggested = $2, sets = $3, overload = $4
     WHERE id = $5
     RETURNING *`,
    [`${sets} \u00d7 ${reps}`, suggested, sets, overload, exerciseId],
  );
  if (!result.rows[0]) return reply.code(404).send({ error: 'No encontramos ese ejercicio' });
  return reply.send({ ok: true, exercise: result.rows[0] });
});

app.post('/v1/routines/:id/complete', { preHandler: authenticate }, async (request, reply) => {
  const routineId = textValue(request.params?.id);
  if (!routineId) return reply.code(400).send({ error: 'Falta la rutina a completar' });

  const result = await pool.query(
    'UPDATE routine SET completed_at = NOW() WHERE id = $1 AND athlete_id = $2 RETURNING id, completed_at',
    [routineId, request.userId],
  );
  if (!result.rows[0]) return reply.code(404).send({ error: 'No encontramos esa rutina' });
  return reply.send({ ok: true, id: result.rows[0].id, completedAt: result.rows[0].completed_at });
});

app.post('/v1/session/start', { preHandler: authenticate }, async (request, reply) => {
  const routineId = textValue(request.body?.routineId);
  if (!routineId) return reply.code(400).send({ error: 'Falta la rutina a iniciar' });

  const routineResult = await pool.query(
    'SELECT id, name FROM routine WHERE id = $1 AND athlete_id = $2',
    [routineId, request.userId],
  );
  if (!routineResult.rows[0]) return reply.code(404).send({ error: 'No encontramos esa rutina' });

  await pool.query(
    `UPDATE client SET
       live_routine = $1,
       live_set_index = 0,
       live_total_sets = NULL,
       live_elapsed = '0:00'
     WHERE clerk_user_id = $2`,
    [routineResult.rows[0].name, request.userId],
  );
  return reply.send({ ok: true, routineId });
});

app.post('/v1/session/end', { preHandler: authenticate }, async (request, reply) => {
  const routineId = textValue(request.body?.routineId);
  if (!routineId) return reply.code(400).send({ error: 'Falta la rutina a finalizar' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const updated = await client.query(
      'UPDATE routine SET completed_at = NOW() WHERE id = $1 AND athlete_id = $2 RETURNING id',
      [routineId, request.userId],
    );
    await client.query(
      `UPDATE client SET
         live_routine = NULL,
         live_set_index = NULL,
         live_total_sets = NULL,
         live_elapsed = NULL,
         status = 'Última sesión: hoy'
       WHERE clerk_user_id = $1`,
      [request.userId],
    );
    await client.query('COMMIT');
    if (!updated.rows[0]) return reply.code(404).send({ error: 'No encontramos esa rutina' });
    return reply.send({ ok: true, routineId });
  } catch (error) {
    await client.query('ROLLBACK');
    request.log.error({ error }, 'Session end failed');
    return reply.code(500).send({ error: 'No pudimos finalizar la sesión' });
  } finally {
    client.release();
  }
});

async function removeWeekRoutines(client, athleteId, weekStart) {
  const routines = await client.query(
    'SELECT id FROM routine WHERE athlete_id = $1 AND week_start = $2',
    [athleteId, weekStart],
  );
  const routineIds = routines.rows.map((row) => row.id);
  if (!routineIds.length) return 0;

  const exerciseLinks = await client.query(
    'SELECT exercise_id FROM routine_exercise WHERE routine_id = ANY($1::text[])',
    [routineIds],
  );
  const exerciseIds = [...new Set(exerciseLinks.rows.map((row) => row.exercise_id))];

  await client.query('DELETE FROM routine_exercise WHERE routine_id = ANY($1::text[])', [routineIds]);
  await client.query('DELETE FROM routine WHERE id = ANY($1::text[])', [routineIds]);

  if (exerciseIds.length) {
    await client.query(
      `DELETE FROM exercise
       WHERE id = ANY($1::text[])
         AND NOT EXISTS (SELECT 1 FROM routine_exercise WHERE exercise_id = exercise.id)`,
      [exerciseIds],
    );
  }

  return routineIds.length;
}

async function removeAthleteRoutines(client, userId) {
  const routines = await client.query('SELECT id FROM routine WHERE athlete_id = $1', [userId]);
  const routineIds = routines.rows.map((row) => row.id);
  if (!routineIds.length) return 0;

  const exerciseLinks = await client.query(
    'SELECT exercise_id FROM routine_exercise WHERE routine_id = ANY($1::text[])',
    [routineIds],
  );
  const exerciseIds = [...new Set(exerciseLinks.rows.map((row) => row.exercise_id))];

  await client.query('DELETE FROM routine_exercise WHERE routine_id = ANY($1::text[])', [routineIds]);
  await client.query('DELETE FROM routine WHERE athlete_id = $1', [userId]);

  if (exerciseIds.length) {
    await client.query(
      `DELETE FROM exercise
       WHERE id = ANY($1::text[])
         AND NOT EXISTS (SELECT 1 FROM routine_exercise WHERE exercise_id = exercise.id)`,
      [exerciseIds],
    );
  }

  return routineIds.length;
}

app.delete('/v1/routines/current', { preHandler: authenticate }, async (request, reply) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const deletedRoutines = await removeAthleteRoutines(client, request.userId);
    await client.query('COMMIT');
    return reply.send({ ok: true, deletedRoutines });
  } catch (error) {
    await client.query('ROLLBACK');
    request.log.error({ error }, 'Routine deletion failed');
    return reply.code(500).send({ error: 'No pudimos eliminar la rutina' });
  } finally {
    client.release();
  }
});

app.put('/v1/routines/current/selection', { preHandler: authenticate }, async (request, reply) => {
  if (!adminClerkUserId || request.userId !== adminClerkUserId) {
    return reply.code(403).send({ error: 'No tenés permiso para elegir rutinas' });
  }

  const routineId = textValue(request.body?.routineId);
  if (!routineId) return reply.code(400).send({ error: 'Falta la rutina a seleccionar' });

  const selected = await pool.query(
    'SELECT id, plan_id FROM routine WHERE id = $1 AND athlete_id = $2 LIMIT 1',
    [routineId, request.userId],
  );
  const row = selected.rows[0];
  if (!row) return reply.code(404).send({ error: 'No encontramos esa rutina en tu plan' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `UPDATE routine
       SET is_today = 0
       WHERE athlete_id = $1
         AND (plan_id = $2 OR ($2 IS NULL AND plan_id IS NULL))`,
      [request.userId, row.plan_id],
    );
    await client.query('UPDATE routine SET is_today = 1 WHERE id = $1', [row.id]);
    await client.query('COMMIT');
    return reply.send({ ok: true, routineId: row.id });
  } catch (error) {
    await client.query('ROLLBACK');
    request.log.error({ error }, 'Routine selection failed');
    return reply.code(500).send({ error: 'No pudimos seleccionar la rutina' });
  } finally {
    client.release();
  }
});

app.put('/v1/profile', { preHandler: authenticate }, async (request, reply) => {
  const body = request.body ?? {};
  const role = body.role === 'coach' ? 'coach' : 'athlete';
  const displayName = typeof body.name === 'string' ? body.name.trim().slice(0, 120) : null;
  const firstName = typeof body.firstName === 'string' ? body.firstName.trim().slice(0, 60) : null;
  const goal = typeof body.goal === 'string' ? body.goal.trim().slice(0, 160) : null;
  const weightKg = Number.isFinite(Number(body.weightKg)) ? Number(body.weightKg) : null;
  const heightM = Number.isFinite(Number(body.heightM)) ? Number(body.heightM) : null;

  await pool.query(
    `INSERT INTO app_user (clerk_user_id, role, display_name, first_name, goal, weight_kg, height_m, solo_training)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (clerk_user_id) DO UPDATE SET
       role = EXCLUDED.role,
       display_name = COALESCE(EXCLUDED.display_name, app_user.display_name),
       first_name = COALESCE(EXCLUDED.first_name, app_user.first_name),
       goal = COALESCE(EXCLUDED.goal, app_user.goal),
       weight_kg = COALESCE(EXCLUDED.weight_kg, app_user.weight_kg),
       height_m = COALESCE(EXCLUDED.height_m, app_user.height_m),
       solo_training = EXCLUDED.solo_training,
       updated_at = NOW()`,
    [request.userId, role, displayName, firstName, goal, weightKg, heightM, body.soloTraining === true],
  );

  return reply.send({ ok: true });
});

app.post('/v1/set-logs', { preHandler: authenticate }, async (request, reply) => {
  const body = request.body ?? {};
  const routineId = typeof body.routineId === 'string' ? body.routineId : '';
  const exerciseId = typeof body.exerciseId === 'string' ? body.exerciseId : '';
  const setIndex = Number(body.setIndex);
  const reps = Number(body.reps);
  const load = body.load == null || body.load === '' ? null : Number(body.load);

  if (!routineId || !exerciseId || !Number.isInteger(setIndex) || setIndex < 0 || !Number.isInteger(reps) || reps <= 0 || (load !== null && !Number.isFinite(load))) {
    return reply.code(400).send({ error: 'Invalid set log' });
  }

  const result = await pool.query(
    `INSERT INTO set_log (clerk_user_id, routine_id, exercise_id, set_index, load, reps)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, routine_id, exercise_id, set_index, load, reps, logged_at`,
    [request.userId, routineId, exerciseId, setIndex, load, reps],
  );
  return reply.code(201).send(result.rows[0]);
});

async function start() {
  await initializeDatabase();
  await app.listen({ host: '0.0.0.0', port });
}

start().catch(async (error) => {
  app.log.error(error);
  await pool.end();
  process.exit(1);
});
