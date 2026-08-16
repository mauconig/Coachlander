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
    await clerk.users.deleteUser(request.userId);
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
    return await interpretRoutine({
      text,
      weightKg: Number.isFinite(weightKg) && weightKg > 0 ? weightKg : null,
      heightM: Number.isFinite(heightM) && heightM > 0 ? heightM : null,
    });
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
