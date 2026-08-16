import { readFile } from 'node:fs/promises';

import cors from '@fastify/cors';
import Fastify from 'fastify';
import { createClerkClient } from '@clerk/backend';
import pg from 'pg';

const { Pool } = pg;
const port = Number(process.env.PORT ?? 8782);
const databaseUrl = process.env.DATABASE_URL;
const clerkSecretKey = process.env.CLERK_SECRET_KEY;
const clerkPublishableKey = process.env.CLERK_PUBLISHABLE_KEY;

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

    const result = await pool.query(
      `SELECT * FROM ${quoteIdentifier(table)} ORDER BY ${orderBy[table] ?? '1'}`,
    );
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
