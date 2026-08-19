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
const expectedExerciseCatalogSize = 1324;
const exerciseCatalogRequiredFields = [
  'id',
  'name_en',
  'name_es',
  'category_en',
  'category_es',
  'body_part_en',
  'body_part_es',
  'equipment_en',
  'equipment_es',
  'target_en',
  'target_es',
  'muscle_group_en',
  'muscle_group_es',
  'instructions_es',
  'image_url',
  'gif_url',
];

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
  'client_exercise_goal',
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
  await ensureExerciseCatalog();
  await normalizeLegacyExerciseTargets();
}

async function normalizeLegacyExerciseTargets() {
  // Older snapshots used the upper bound for ranges such as 8-10. The
  // minimum of the range is the valid completion target used by the athlete
  // and by the progression engine.
  await pool.query(`
    UPDATE exercise
       SET target_reps = (regexp_match(scheme, '([0-9]+)[[:space:]]*[-–][[:space:]]*[0-9]+'))[1]::integer
     WHERE scheme ~ '[0-9]+[[:space:]]*[-–][[:space:]]*[0-9]+'
       AND target_reps <> (regexp_match(scheme, '([0-9]+)[[:space:]]*[-–][[:space:]]*[0-9]+'))[1]::integer
  `);
}

async function ensureExerciseCatalog() {
  let catalog;
  try {
    catalog = JSON.parse(await readFile(new URL('../db/exercise-catalog.json', import.meta.url), 'utf8'));
  } catch (error) {
    throw new Error(`Exercise catalog data file is unavailable: ${error instanceof Error ? error.message : String(error)}`);
  }

  if (!Array.isArray(catalog) || catalog.length !== expectedExerciseCatalogSize) {
    throw new Error(
      `Exercise catalog must contain exactly ${expectedExerciseCatalogSize} records; received ${Array.isArray(catalog) ? catalog.length : 'invalid data'}`,
    );
  }

  const ids = new Set();
  for (const [index, item] of catalog.entries()) {
    if (!item || typeof item !== 'object') {
      throw new Error(`Exercise catalog record ${index} is invalid`);
    }
    for (const field of exerciseCatalogRequiredFields) {
      if (typeof item[field] !== 'string' || !item[field].trim()) {
        throw new Error(`Exercise catalog record ${index} is missing ${field}`);
      }
    }
    if (ids.has(item.id)) throw new Error(`Exercise catalog contains duplicate id ${item.id}`);
    ids.add(item.id);
    if (!Array.isArray(item.secondary_muscles_en) || !Array.isArray(item.secondary_muscles_es)) {
      throw new Error(`Exercise catalog record ${index} has invalid secondary muscles`);
    }
    if (!Array.isArray(item.muscle_groups) || !Array.isArray(item.instruction_steps_es)) {
      throw new Error(`Exercise catalog record ${index} has invalid exercise metadata arrays`);
    }
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM exercise_catalog');
    await client.query(
      `INSERT INTO exercise_catalog (
       id, name_en, name_es, category_en, category_es, body_part_en, body_part_es,
       equipment_en, equipment_es, target_en, target_es, muscle_group_en, muscle_group_es,
       secondary_muscles_en, secondary_muscles_es, muscle_groups, instructions_es,
       instruction_steps_es, image_url, gif_url, attribution, source, updated_at
     )
     SELECT
       item.id, item.name_en, item.name_es, item.category_en, item.category_es,
       item.body_part_en, item.body_part_es, item.equipment_en, item.equipment_es,
       item.target_en, item.target_es, item.muscle_group_en, item.muscle_group_es,
       item.secondary_muscles_en, item.secondary_muscles_es, item.muscle_groups,
       item.instructions_es, item.instruction_steps_es, item.image_url, item.gif_url,
       item.attribution, item.source, NOW()
     FROM jsonb_to_recordset($1::jsonb) AS item(
       id TEXT,
       name_en TEXT,
       name_es TEXT,
       category_en TEXT,
       category_es TEXT,
       body_part_en TEXT,
       body_part_es TEXT,
       equipment_en TEXT,
       equipment_es TEXT,
       target_en TEXT,
       target_es TEXT,
       muscle_group_en TEXT,
       muscle_group_es TEXT,
       secondary_muscles_en TEXT[],
       secondary_muscles_es TEXT[],
       muscle_groups TEXT[],
       instructions_es TEXT,
       instruction_steps_es TEXT[],
       image_url TEXT,
       gif_url TEXT,
       attribution TEXT,
       source TEXT
     )
     ON CONFLICT (id) DO UPDATE SET
       name_en = EXCLUDED.name_en,
       name_es = EXCLUDED.name_es,
       category_en = EXCLUDED.category_en,
       category_es = EXCLUDED.category_es,
       body_part_en = EXCLUDED.body_part_en,
       body_part_es = EXCLUDED.body_part_es,
       equipment_en = EXCLUDED.equipment_en,
       equipment_es = EXCLUDED.equipment_es,
       target_en = EXCLUDED.target_en,
       target_es = EXCLUDED.target_es,
       muscle_group_en = EXCLUDED.muscle_group_en,
       muscle_group_es = EXCLUDED.muscle_group_es,
       secondary_muscles_en = EXCLUDED.secondary_muscles_en,
       secondary_muscles_es = EXCLUDED.secondary_muscles_es,
       muscle_groups = EXCLUDED.muscle_groups,
       instructions_es = EXCLUDED.instructions_es,
       instruction_steps_es = EXCLUDED.instruction_steps_es,
       image_url = EXCLUDED.image_url,
       gif_url = EXCLUDED.gif_url,
       attribution = EXCLUDED.attribution,
       source = EXCLUDED.source,
       updated_at = NOW()`,
      [JSON.stringify(catalog)],
    );
    await client.query('COMMIT');
    app.log.info({ count: catalog.length }, 'Exercise catalog replaced');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
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

const catalogAliasMap = {
  'press de pecho': ['bench press', 'chest press'],
  'remo sentado': ['seated row', 'cable row'],
  'sentadilla goblet': ['goblet squat'],
  'sentadilla con barra smith': ['smith full squat', 'smith squat'],
  'peso muerto rumano': ['romanian deadlift'],
  plancha: ['plank'],
};

// Los nombres del catálogo provienen de una traducción automática y no siempre
// coinciden con el nombre que usa un gimnasio. Estas equivalencias son sólo
// para importar texto: la rutina sigue mostrando el nombre español del catálogo
// una vez encontrada la coincidencia, por lo que también conserva su GIF.
const importedCatalogIdAliases = {
  'sentadilla con barra smith': '0770',
  'smith squat': '0770',
  'prensa 45': '0739',
  'prensa 45 grados': '0739',
  'silla para cuadriceps unilateral': '0585',
  'silla para cuadriceps': '0585',
  'camilla para isquios': '0586',
  'camilla de isquios': '0586',
  aductor: '0598',
  aductores: '0598',
  pantorrillas: '1373',
  pantorillas: '1373',
  'press en maquina': '0577',
  'press en maquina de pecho': '0577',
  'press inclinado articulado': '1299',
  'dominada asistida': '0017',
  'remo en maquina': '1350',
  'vuelos laterales': '0334',
  'press militar con mancuernas o maquina': '0405',
  'press militar con mancuernas': '0405',
  'press militar en maquina': '0603',
  'peso muerto rumano': '0085',
  bulgara: '0410',
  bulgaro: '0410',
  'sentadilla bulgara': '0410',
  'hip trust maquina': '2286',
  'hip thrust maquina': '2286',
  'maquina de isquios vertical': '0599',
  'silla de extensiones': '0585',
  'silla de extension': '0585',
  'cierre en maquina': '0596',
  'cierre maquina': '0596',
  'jalon abierto al pecho': '0818',
  'jalon abierto pecho': '0818',
  'fondo en maquina asistida': '0009',
  'fondos en maquina asistida': '0009',
  'remo abierto articulado': '1350',
  'extensiones de triceps en polea': '0241',
  'extension de triceps en polea': '0241',
  'extensions de triceps en polea': '0241',
  'curl de biceps en polea': '0868',
};

const importedSearchReplacements = [
  [/vuelos? laterales?/g, 'lateral raise'],
  [/press militar/g, 'shoulder press'],
  [/peso muerto rumano/g, 'romanian deadlift'],
  [/sentadillas? bulgaras?/g, 'split squat'],
  [/\bbulgar[ao]?\b/g, 'split squat'],
  [/hip trusts?/g, 'hip thrust'],
  [/hip thrusts?/g, 'hip thrust'],
  [/prensas?(?: de piernas?)?/g, 'leg press'],
  [/sentadillas?/g, 'squat'],
  [/cuadriceps?/g, 'quads'],
  [/(?:isquios|femorales?)/g, 'hamstrings'],
  [/pantorillas?/g, 'calf'],
  [/aductores?/g, 'adduction'],
  [/dominadas?/g, 'pull up'],
  [/jalones?/g, 'pulldown'],
  [/remos?/g, 'row'],
  [/fondos?/g, 'dip'],
  [/extensiones? de triceps?/g, 'triceps extension'],
  [/extensiones?/g, 'extension'],
  [/triceps?/g, 'triceps'],
  [/biceps?/g, 'biceps'],
  [/mancuernas?/g, 'dumbbell'],
  [/barras?/g, 'barbell'],
  [/poleas?/g, 'cable'],
  [/maquinas?|articulados?|articuladas?/g, 'machine'],
  [/camillas?/g, 'lying'],
  [/sillas?/g, 'machine'],
  [/cierres?/g, 'fly'],
];

const importedSearchStopWords = new Set([
  'a', 'al', 'de', 'del', 'el', 'en', 'la', 'las', 'los', 'o', 'para', 'por', 'con',
  'un', 'una', 'y', 'y/o', 'the', 'on', 'of', 'and', 'to', 'with', 'v', 'bar', 'machine',
]);

function importedSearchTokens(value) {
  let normalized = normalizeName(value);
  for (const [pattern, replacement] of importedSearchReplacements) normalized = normalized.replace(pattern, replacement);
  return new Set(
    normalized
      .split(/\s+/)
      .map((token) => token.trim())
      .filter((token) => token.length > 1 && !importedSearchStopWords.has(token)),
  );
}

function catalogSearchText(row) {
  return [
    row.name_en,
    row.name_es,
    row.target_en,
    row.target_es,
    row.equipment_en,
    row.equipment_es,
    row.muscle_group_en,
    row.muscle_group_es,
  ]
    .filter(Boolean)
    .join(' ');
}

function findFuzzyCatalogMatch(catalogRows, name) {
  const inputTokens = importedSearchTokens(name);
  if (!inputTokens.size) return null;

  const scored = catalogRows
    .map((row) => {
      const rowTokens = importedSearchTokens(catalogSearchText(row));
      const overlap = [...inputTokens].filter((token) => rowTokens.has(token));
      const nameTokens = new Set([
        ...importedSearchTokens(row.name_en),
        ...importedSearchTokens(row.name_es),
      ]);
      const nameOverlap = overlap.filter((token) => nameTokens.has(token));
      const score = overlap.length + (nameOverlap.length * 0.75);
      return { row, score, overlap: overlap.length, nameOverlap: nameOverlap.length };
    })
    .filter((item) => item.overlap > 0)
    .sort((a, b) => b.score - a.score || b.nameOverlap - a.nameOverlap);

  if (!scored.length) return null;
  const best = scored[0];
  const second = scored[1];
  // Sólo usamos el fallback cuando hay una señal semántica real. Las frases
  // conocidas de arriba tienen prioridad y no pasan por esta heurística.
  if (best.score < 2 || (second && best.score === second.score && best.nameOverlap === second.nameOverlap)) return null;
  return best.row;
}

function findCatalogMatchByName(catalogRows, name, { allowFuzzy = false } = {}) {
  const normalized = normalizeName(name);
  if (!normalized) return null;
  const exact = catalogRows.find(
    (row) => normalizeName(row.name_es) === normalized || normalizeName(row.name_en) === normalized,
  );
  if (exact) return exact;

  const directId = importedCatalogIdAliases[normalized];
  if (directId) {
    const direct = catalogRows.find((row) => String(row.id) === directId);
    if (direct) return direct;
  }

  const aliases = catalogAliasMap[normalized] ?? [];
  const aliasMatches = catalogRows.filter((row) =>
    aliases.some((alias) => {
      const normalizedAlias = normalizeName(alias);
      const nameEn = normalizeName(row.name_en);
      const nameEs = normalizeName(row.name_es);
      return (
        nameEn === normalizedAlias ||
        nameEs === normalizedAlias ||
        nameEn.includes(normalizedAlias) ||
        nameEs.includes(normalizedAlias)
      );
    }),
  );
  if (aliasMatches.length === 1) return aliasMatches[0];
  return allowFuzzy ? findFuzzyCatalogMatch(catalogRows, name) : null;
}

async function resolveImportedCatalogExercises(queryable, days) {
  const result = await queryable.query(
    `SELECT id, name_en, name_es, body_part_es, equipment_es, target_es,
            secondary_muscles_es, muscle_groups, instructions_es,
            instruction_steps_es, image_url, gif_url, attribution
       FROM exercise_catalog`,
  );
  if (!result.rows.length) return days;

  return days.map((day) => ({
    ...day,
    exercises: day.exercises.map((exercise) => {
      const catalog = findCatalogMatchByName(result.rows, exercise.name, { allowFuzzy: true });
      if (!catalog) return { ...exercise, catalogMatched: false };
      return {
        ...exercise,
        name: catalog.name_es,
        catalogId: catalog.id,
        catalogName: catalog.name_es,
        catalogFocus: catalog.body_part_es,
        catalogMatched: true,
      };
    }),
  }));
}

async function enrichBootstrapExercises(exercises) {
  if (!exercises.length) return exercises;
  const result = await pool.query(
    `SELECT id, name_en, name_es, body_part_es, equipment_es, target_es,
            secondary_muscles_es, muscle_groups, instructions_es,
            instruction_steps_es, image_url, gif_url, attribution
       FROM exercise_catalog`,
  );
  if (!result.rows.length) return exercises;

  return exercises.map((exercise) => {
    const catalog = findCatalogMatchByName(result.rows, exercise.name);
    if (!catalog) return exercise;
    return {
      ...exercise,
      catalog_id: catalog.id,
      catalog_name_en: catalog.name_en,
      catalog_name_es: catalog.name_es,
      catalog_focus: catalog.body_part_es,
      catalog_equipment: catalog.equipment_es,
      catalog_target: catalog.target_es,
      catalog_secondary_muscles: catalog.secondary_muscles_es,
      catalog_muscle_groups: catalog.muscle_groups,
      catalog_instructions: catalog.instructions_es,
      catalog_instruction_steps: catalog.instruction_steps_es,
      catalog_image_url: catalog.image_url,
      catalog_gif_url: catalog.gif_url,
      catalog_attribution: catalog.attribution,
    };
  });
}

async function requireCatalogAccess(request, reply) {
  const profile = await ensureUser(request.userId);
  if (profile.role === 'coach' || (profile.role === 'athlete' && profile.solo_training)) return profile;
  reply.code(403).send({ error: 'Esta biblioteca sólo está disponible para entrenadores y atletas independientes' });
  return null;
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

    if (table === 'client_exercise_goal') {
      const result = await pool.query(
        `SELECT goal.*
         FROM client_exercise_goal goal
         JOIN client c ON c.id = goal.client_id
         WHERE c.clerk_user_id = $1
         ORDER BY goal.exercise_key`,
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
    tables[table] = table === 'exercise' ? await enrichBootstrapExercises(result.rows) : result.rows;
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

app.get('/v1/exercise-catalog/muscles', { preHandler: authenticate }, async (request, reply) => {
  if (!(await requireCatalogAccess(request, reply))) return;
  const result = await pool.query(
    `SELECT body_part_es AS label, COUNT(*)::int AS count
       FROM exercise_catalog
      WHERE body_part_es IS NOT NULL AND body_part_es <> ''
      GROUP BY body_part_es
      ORDER BY body_part_es`,
  );
  return {
    items: result.rows.map((row) => ({
      key: normalizeName(row.label),
      label: row.label,
      count: Number(row.count) || 0,
    })),
  };
});

app.get('/v1/exercise-catalog', { preHandler: authenticate }, async (request, reply) => {
  if (!(await requireCatalogAccess(request, reply))) return;
  const query = request.query ?? {};
  const muscleKey = normalizeName(textValue(query.muscle));
  const search = textValue(query.search);
  const page = normalizedInteger(query.page, 1, 1, 100000);
  const limit = normalizedInteger(query.limit, 24, 1, 50);
  if (!muscleKey) return reply.code(400).send({ error: 'Elegí un músculo antes de consultar el catálogo' });

  const muscleResult = await pool.query(
    `SELECT DISTINCT body_part_es AS label
       FROM exercise_catalog
      WHERE body_part_es IS NOT NULL AND body_part_es <> ''`,
  );
  const muscle = muscleResult.rows.find((row) => normalizeName(row.label) === muscleKey)?.label;
  if (!muscle) return reply.code(400).send({ error: 'El músculo solicitado no existe en el catálogo' });

  const values = [muscle];
  const filters = ['body_part_es = $1'];
  if (search) {
    values.push(`%${search}%`);
    filters.push('(name_es ILIKE $2 OR name_en ILIKE $2 OR equipment_es ILIKE $2 OR target_es ILIKE $2)');
  }
  const where = filters.join(' AND ');
  const countResult = await pool.query(`SELECT COUNT(*)::int AS total FROM exercise_catalog WHERE ${where}`, values);
  const total = Number(countResult.rows[0]?.total) || 0;
  const offset = (page - 1) * limit;
  const rowsResult = await pool.query(
    `SELECT id, name_es AS name, body_part_es AS focus, equipment_es AS equipment,
            target_es AS target, image_url, gif_url, muscle_groups
       FROM exercise_catalog
      WHERE ${where}
      ORDER BY name_es, id
      LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
    [...values, limit, offset],
  );

  return {
    items: rowsResult.rows.map((row) => ({
      id: row.id,
      name: row.name,
      focus: row.focus,
      equipment: row.equipment,
      target: row.target,
      imageUrl: row.image_url,
      gifUrl: row.gif_url,
      muscleGroups: Array.isArray(row.muscle_groups) ? row.muscle_groups : [],
    })),
    page,
    limit,
    total,
    hasMore: offset + rowsResult.rows.length < total,
  };
});

app.get('/v1/exercise-catalog/item/:id', { preHandler: authenticate }, async (request, reply) => {
  if (!(await requireCatalogAccess(request, reply))) return;
  const id = textValue(request.params?.id);
  const result = await pool.query('SELECT * FROM exercise_catalog WHERE id = $1 LIMIT 1', [id]);
  const row = result.rows[0];
  if (!row) return reply.code(404).send({ error: 'No encontramos ese ejercicio en el catálogo' });
  return {
    id: row.id,
    name: row.name_es,
    nameEn: row.name_en,
    focus: row.body_part_es,
    equipment: row.equipment_es,
    target: row.target_es,
    secondaryMuscles: row.secondary_muscles_es ?? [],
    muscleGroups: row.muscle_groups ?? [],
    instructions: row.instructions_es,
    instructionSteps: row.instruction_steps_es ?? [],
    imageUrl: row.image_url,
    gifUrl: row.gif_url,
    attribution: row.attribution,
  };
});

function isoDateValue(date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

function databaseDateValue(value) {
  const text = String(value ?? '');
  if (value instanceof Date || /\d{4}-\d{2}-\d{2}[T ]/.test(text)) {
    const date = value instanceof Date ? value : new Date(text);
    if (!Number.isNaN(date.getTime())) {
      const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Asuncion',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).formatToParts(date);
      const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
      return `${values.year}-${values.month}-${values.day}`;
    }
  }
  return text.slice(0, 10);
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

function validIsoMonth(value) {
  if (!/^\d{4}-\d{2}$/.test(value)) return false;
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  return year >= 2000 && month >= 1 && month <= 12;
}

function monthRange(month) {
  const year = Number(month.slice(0, 4));
  const monthNumber = Number(month.slice(5, 7));
  return {
    from: `${month}-01`,
    to: isoDateValue(new Date(Date.UTC(year, monthNumber, 0))),
  };
}

function readHistoryQuery(request, reply) {
  const query = request.query ?? {};
  const clientId = query.clientId && query.clientId !== 'all' ? textValue(query.clientId) : null;
  const requestedMonth = textValue(query.month);
  if (requestedMonth) {
    if (!validIsoMonth(requestedMonth)) {
      reply.code(400).send({ error: 'El mes solicitado no es válido' });
      return null;
    }
    return { clientId, ...monthRange(requestedMonth) };
  }

  const range = readStatsQuery(request, reply);
  return range ? { clientId, from: range.from, to: range.to } : null;
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
    r.session_status,
    r.session_ended_at,
    r.estimated_minutes,
    c.id AS client_id,
    c.name AS client_name,
    COALESCE(c.clerk_user_id, c.id) AS athlete_id,
    COALESCE(
      CASE
        WHEN r.week_start IS NOT NULL
        THEN (r.week_start + ((r.day - 1) * INTERVAL '1 day'))::date
      END,
      (COALESCE(r.completed_at, r.session_ended_at) AT TIME ZONE 'America/Asuncion')::date
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
    status: row.session_status === 'partial' ? 'partial' : 'completed',
  };
}

async function fetchCoachHistory({ clientId, from, to, limit, offset }) {
  const result = await pool.query(
    `WITH scoped_routines AS (${coachScopedRoutines}),
      routine_sets AS (
        SELECT sl.routine_id, COUNT(*)::integer AS sets
        FROM set_log sl
        JOIN scoped_routines sr ON sr.id = sl.routine_id
        GROUP BY sl.routine_id
      ),
      routine_volume AS (
        SELECT sl.routine_id, SUM(COALESCE(sl.load, 0) * sl.reps)::double precision AS volume_kg
        FROM set_log sl
        JOIN scoped_routines sr ON sr.id = sl.routine_id
        WHERE sr.session_status IN ('completed', 'partial')
        GROUP BY sl.routine_id
      ),
      history_total AS (
        SELECT COUNT(*)::integer AS total
        FROM scoped_routines
        WHERE session_status IN ('completed', 'partial')
          AND (COALESCE(completed_at, session_ended_at) AT TIME ZONE 'America/Asuncion')::date BETWEEN $2::date AND $3::date
      )
      SELECT
        sr.id,
        sr.client_id,
        sr.client_name,
        (COALESCE(sr.completed_at, sr.session_ended_at) AT TIME ZONE 'America/Asuncion')::date AS training_date,
        sr.name,
        CASE WHEN sr.session_status = 'completed' THEN sr.estimated_minutes ELSE 0 END AS minutes,
        COALESCE(rs.sets, 0) AS sets,
        COALESCE(rv.volume_kg, 0) AS volume_kg,
        CASE WHEN sr.session_status = 'completed' THEN 100 ELSE 0 END AS completion,
        sr.session_status,
        ht.total AS total_count
      FROM scoped_routines sr
      CROSS JOIN history_total ht
      LEFT JOIN routine_sets rs ON rs.routine_id = sr.id
      LEFT JOIN routine_volume rv ON rv.routine_id = sr.id
      WHERE sr.session_status IN ('completed', 'partial')
        AND (COALESCE(sr.completed_at, sr.session_ended_at) AT TIME ZONE 'America/Asuncion')::date BETWEEN $2::date AND $3::date
      ORDER BY (COALESCE(sr.completed_at, sr.session_ended_at) AT TIME ZONE 'America/Asuncion')::date DESC, sr.id DESC
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
       r.session_status,
       r.session_ended_at,
       r.estimated_minutes AS minutes,
       r.load_mode,
       c.id AS client_id,
       c.name AS client_name
     FROM routine r
     JOIN client c ON r.athlete_id = COALESCE(c.clerk_user_id, c.id)
     WHERE r.id = $1
       AND r.session_status IN ('completed', 'partial')`,
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
       e.suggested,
       e.load_source,
       e.load_reason,
       e.progression_metric,
       e.target_reps,
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
        suggested: Number(row.suggested) || 0,
        loadSource: row.load_source === 'ai' ? 'ai' : 'coach',
        loadReason: row.load_reason ?? '',
        progressionMetric: row.progression_metric === 'seconds' ? 'seconds' : row.progression_metric === 'reps' ? 'reps' : 'load',
        targetReps: targetValueFromExercise(row.target_reps, row.scheme),
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
    date: databaseDateValue(routine.completed_at ?? routine.session_ended_at),
    name: routine.name,
    minutes: routine.session_status === 'completed' ? Number(routine.minutes) || 0 : 0,
    loadMode: routine.load_mode === 'ai' ? 'ai' : 'coach',
    status: routine.session_status === 'partial' ? 'partial' : 'completed',
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

function addIsoDays(value, days) {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return isoDateValue(date);
}

function statsWeekWindows(from, to) {
  const windows = [];
  for (let cursor = isoWeekStart(from); cursor <= to; cursor = addIsoDays(cursor, 7)) {
    const weekEnd = addIsoDays(cursor, 6);
    const includedFrom = cursor < from ? from : cursor;
    const includedTo = weekEnd > to ? to : weekEnd;
    windows.push({
      weekStart: cursor,
      daysIncluded: statsRangeDays(includedFrom, includedTo),
    });
  }
  return windows;
}

function normalizedWeeklyValue(value, daysIncluded) {
  return daysIncluded ? Math.round((value / daysIncluded) * 7 * 100) / 100 : 0;
}

function repsFromScheme(scheme) {
  const match = String(scheme ?? '').match(/[x×]\s*(\d+)/i);
  return match ? Number(match[1]) : 8;
}

async function fetchCoachActivity({ clientId, from, to }) {
  const result = await pool.query(
    `SELECT
       date_trunc('week', COALESCE(completed_at, session_ended_at) AT TIME ZONE 'America/Asuncion')::date AS week_start,
       COUNT(*)::integer AS sessions,
       COALESCE(SUM(CASE WHEN session_status = 'completed' THEN estimated_minutes ELSE 0 END), 0)::integer AS minutes
     FROM (${coachScopedRoutines}) scoped_routines
     WHERE session_status IN ('completed', 'partial')
       AND (COALESCE(completed_at, session_ended_at) AT TIME ZONE 'America/Asuncion')::date BETWEEN $2::date AND $3::date
     GROUP BY date_trunc('week', COALESCE(completed_at, session_ended_at) AT TIME ZONE 'America/Asuncion')::date
     ORDER BY week_start`,
    [clientId, from, to],
  );

  const byWeek = new Map(result.rows.map((row) => [databaseDateValue(row.week_start), {
    sessions: Number(row.sessions) || 0,
    minutes: Number(row.minutes) || 0,
  }]));

  return {
    granularity: 'week',
    buckets: statsWeekWindows(from, to).map((window) => {
      const totals = byWeek.get(window.weekStart) ?? { sessions: 0, minutes: 0 };
      return {
        start: window.weekStart,
        label: statsBucketLabel(window.weekStart),
        sessions: totals.sessions,
        minutes: totals.minutes,
        daysIncluded: window.daysIncluded,
        normalizedSessions: normalizedWeeklyValue(totals.sessions, window.daysIncluded),
        normalizedMinutes: normalizedWeeklyValue(totals.minutes, window.daysIncluded),
      };
    }),
  };
}

async function fetchCoachHeatmap({ clientId, from, to }) {
  const result = await pool.query(
    `WITH days AS (
        SELECT generate_series($2::date, $3::date, INTERVAL '1 day')::date AS date
      ),
      completed AS (
        SELECT
          (COALESCE(completed_at, session_ended_at) AT TIME ZONE 'America/Asuncion')::date AS date,
          COUNT(*)::integer AS sessions,
          COALESCE(SUM(CASE WHEN session_status = 'completed' THEN estimated_minutes ELSE 0 END), 0)::integer AS minutes
        FROM (${coachScopedRoutines}) scoped_routines
        WHERE session_status IN ('completed', 'partial')
          AND (COALESCE(completed_at, session_ended_at) AT TIME ZONE 'America/Asuncion')::date BETWEEN $2::date AND $3::date
        GROUP BY (COALESCE(completed_at, session_ended_at) AT TIME ZONE 'America/Asuncion')::date
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

const WEEKDAY_LABELS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

function rangeWeekdayOccurrences(from, to) {
  const occurrences = Array.from({ length: 7 }, () => 0);
  for (let date = from; date <= to; date = addIsoDays(date, 1)) {
    const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
    occurrences[weekday === 0 ? 6 : weekday - 1] += 1;
  }
  return occurrences;
}

async function fetchCoachWeekdayActivity({ clientId, from, to }) {
  const result = await pool.query(
    `SELECT
       EXTRACT(ISODOW FROM (COALESCE(completed_at, session_ended_at) AT TIME ZONE 'America/Asuncion'))::integer AS weekday,
       COUNT(*)::integer AS sessions,
       COUNT(DISTINCT date_trunc('week', COALESCE(completed_at, session_ended_at) AT TIME ZONE 'America/Asuncion')::date)::integer AS active_weeks
     FROM (${coachScopedRoutines}) scoped_routines
     WHERE session_status IN ('completed', 'partial')
       AND (COALESCE(completed_at, session_ended_at) AT TIME ZONE 'America/Asuncion')::date BETWEEN $2::date AND $3::date
     GROUP BY EXTRACT(ISODOW FROM (COALESCE(completed_at, session_ended_at) AT TIME ZONE 'America/Asuncion'))
     ORDER BY weekday`,
    [clientId, from, to],
  );

  const occurrences = rangeWeekdayOccurrences(from, to);
  const totals = new Map(result.rows.map((row) => [Number(row.weekday), {
    sessions: Number(row.sessions) || 0,
    activeWeeks: Number(row.active_weeks) || 0,
  }]));

  return {
    items: Array.from({ length: 7 }, (_, index) => {
      const weekday = index + 1;
      const current = totals.get(weekday) ?? { sessions: 0, activeWeeks: 0 };
      const representedWeeks = occurrences[index];
      return {
        weekday,
        label: WEEKDAY_LABELS[index],
        sessions: current.sessions,
        averagePerWeek: representedWeeks ? Math.round((current.sessions / representedWeeks) * 100) / 100 : 0,
        activeWeeks: current.activeWeeks,
        percentageOfWeeks: representedWeeks ? Math.round((current.activeWeeks / representedWeeks) * 100) : 0,
      };
    }),
  };
}

const MUSCLE_DETAIL_LABELS = {
  pecho: 'Pecho',
  espalda: 'Espalda',
  espalda_baja: 'Espalda baja',
  hombros: 'Hombros',
  brazos: 'Brazos',
  gluteos: 'Glúteos',
  cuadriceps: 'Cuádriceps',
  cadena_posterior: 'Cadena posterior',
  pantorrillas: 'Pantorrillas',
  core: 'Core',
  otros: 'Otros',
};

const MUSCLE_DETAIL_KEYS = Object.keys(MUSCLE_DETAIL_LABELS);
const MUSCLE_PRIMARY_LABELS = {
  pecho: 'Pecho',
  espalda: 'Espalda',
  espalda_baja: 'Espalda baja',
  hombros: 'Hombros',
  brazos: 'Brazos',
  piernas: 'Piernas',
  core: 'Core',
  otros: 'Otros',
};
const MUSCLE_PRIMARY_KEYS = Object.keys(MUSCLE_PRIMARY_LABELS);
const MUSCLE_LEG_KEYS = ['cuadriceps', 'gluteos', 'cadena_posterior', 'pantorrillas'];

function resolveMuscleGroups(name, focus, storedGroups) {
  const stored = Array.isArray(storedGroups)
    ? storedGroups.filter((group) => MUSCLE_DETAIL_KEYS.includes(group))
    : [];
  if (stored.length) return [...new Set(stored)];

  const text = normalizeName(`${name} ${focus}`);
  const groups = [];
  if (/pecho|pectoral|press banca|press pecho|empuje/.test(text)) groups.push('pecho');
  if (/espalda|remo|dorsal|tiron|pull/.test(text)) groups.push('espalda');
  if (/espalda baja|lumbar|lumbares|erector/.test(text)) groups.push('espalda_baja');
  if (/hombro|deltoid|press militar|empuje/.test(text)) groups.push('hombros');
  if (/brazo|biceps|triceps|curl|extension/.test(text)) groups.push('brazos');
  if (/gluteo|glute|hip thrust|puente|sentadilla|zancada/.test(text)) groups.push('gluteos');
  if (/cuadriceps|pierna|sentadilla|zancada|prensa|extension de pierna/.test(text)) groups.push('cuadriceps');
  if (/posterior|isquio|femoral|peso muerto|rumano/.test(text)) groups.push('cadena_posterior');
  if (/pantorrilla|gemelo|talon/.test(text)) groups.push('pantorrillas');
  if (/core|plancha|abdomen|oblicuo/.test(text)) groups.push('core');
  return groups.length ? [...new Set(groups)] : ['otros'];
}

async function fetchCoachMuscleBalance({ clientId, from, to }) {
  const result = await pool.query(
    `SELECT
       r.id AS routine_id,
       (r.completed_at AT TIME ZONE 'America/Asuncion')::date AS training_date,
       re.exercise_id,
       e.name,
       e.focus,
       e.muscle_groups,
       sl.id AS set_log_id
     FROM routine r
     JOIN client c ON r.athlete_id = COALESCE(c.clerk_user_id, c.id)
     LEFT JOIN routine_exercise re ON re.routine_id = r.id
     LEFT JOIN exercise e ON e.id = re.exercise_id
     LEFT JOIN set_log sl
       ON sl.routine_id = r.id
      AND sl.exercise_id = re.exercise_id
     WHERE ($1::text IS NULL OR c.id = $1)
       AND r.completed_at IS NOT NULL
       AND (r.completed_at AT TIME ZONE 'America/Asuncion')::date BETWEEN $2::date AND $3::date
     ORDER BY (r.completed_at AT TIME ZONE 'America/Asuncion')::date, r.id, re.position`,
    [clientId, from, to],
  );

  const sessions = new Map();
  for (const row of result.rows) {
    const session = sessions.get(row.routine_id) ?? {
      date: databaseDateValue(row.training_date),
      exercises: new Map(),
    };
    if (row.set_log_id && row.exercise_id) {
      const exerciseKey = String(row.exercise_id);
      if (!session.exercises.has(exerciseKey)) {
        session.exercises.set(exerciseKey, resolveMuscleGroups(row.name, row.focus, row.muscle_groups));
      }
    }
    sessions.set(row.routine_id, session);
  }

  const weekly = statsWeekWindows(from, to).map((window) => ({
    weekStart: window.weekStart,
    daysIncluded: window.daysIncluded,
    sessions: 0,
    normalizedSessions: 0,
    exerciseCount: 0,
    groups: new Map(),
    details: new Map(),
  }));
  const windowFor = (date) => weekly.find((window) => date >= window.weekStart && date <= addIsoDays(window.weekStart, 6));

  for (const session of sessions.values()) {
    const window = windowFor(session.date);
    if (!window) continue;
    window.sessions += 1;
    for (const groups of session.exercises.values()) {
      window.exerciseCount += 1;
      const primaryGroups = new Set(groups.map((group) => MUSCLE_LEG_KEYS.includes(group) ? 'piernas' : group));
      for (const primary of primaryGroups) {
        window.groups.set(primary, (window.groups.get(primary) ?? 0) + 1);
      }
      for (const group of groups) {
        window.details.set(group, (window.details.get(group) ?? 0) + 1);
      }
    }
  }

  for (const window of weekly) window.normalizedSessions = normalizedWeeklyValue(window.sessions, window.daysIncluded);

  const totalExercises = weekly.reduce((total, week) => total + week.exerciseCount, 0);
  const averageWeeklyExercises = (key, source = 'groups') => weekly.length
    ? Math.round(weekly.reduce((total, week) => total + normalizedWeeklyValue(week[source].get(key) ?? 0, week.daysIncluded), 0) / weekly.length * 100) / 100
    : 0;
  const percentageFor = (count) => totalExercises ? Math.round((count / totalExercises) * 100) : 0;
  const makeItem = (key, source = 'groups') => {
    const exercises = weekly.reduce((total, week) => total + (week[source].get(key) ?? 0), 0);
    return {
      key,
      label: source === 'details' ? MUSCLE_DETAIL_LABELS[key] : MUSCLE_PRIMARY_LABELS[key],
      exercises,
      exercisesPerWeek: averageWeeklyExercises(key, source),
      percentage: percentageFor(exercises),
      sessions: exercises,
      sessionsPerWeek: averageWeeklyExercises(key, source),
    };
  };

  const items = MUSCLE_PRIMARY_KEYS.map((key) => {
    const item = makeItem(key);
    if (key === 'piernas') {
      item.details = MUSCLE_LEG_KEYS.map((detailKey) => makeItem(detailKey, 'details'));
    }
    return item;
  });

  return {
    totalSessions: sessions.size,
    totalExercises,
    weeks: weekly.map(({ weekStart, daysIncluded, sessions: count, normalizedSessions }) => ({
      weekStart,
      daysIncluded,
      sessions: count,
      normalizedSessions,
    })),
    items,
  };
}

async function fetchCoachExerciseLibrary({ clientId, from, to }) {
  const result = await pool.query(
    `SELECT
       e.name,
       COUNT(DISTINCT r.id)::integer AS sessions,
       MAX((r.completed_at AT TIME ZONE 'America/Asuncion')::date) AS last_date,
       ((ARRAY_AGG(sl.load ORDER BY sl.logged_at DESC) FILTER (WHERE sl.load IS NOT NULL)))[1] AS last_load,
       (ARRAY_AGG(sl.reps ORDER BY sl.logged_at DESC))[1] AS last_reps,
       ARRAY_AGG(DISTINCT r.id) AS session_ids
     FROM set_log sl
     JOIN routine r ON r.id = sl.routine_id
     JOIN client c ON r.athlete_id = COALESCE(c.clerk_user_id, c.id)
     JOIN exercise e ON e.id = sl.exercise_id
     WHERE c.id = $1
       AND r.completed_at IS NOT NULL
       AND (r.completed_at AT TIME ZONE 'America/Asuncion')::date BETWEEN $2::date AND $3::date
     GROUP BY e.id, e.name
     ORDER BY MAX((r.completed_at AT TIME ZONE 'America/Asuncion')::date) DESC, e.name`,
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
       (r.completed_at AT TIME ZONE 'America/Asuncion')::date AS training_date,
       sl.load,
       sl.reps
     FROM set_log sl
     JOIN routine r ON r.id = sl.routine_id
     JOIN client c ON r.athlete_id = COALESCE(c.clerk_user_id, c.id)
     JOIN exercise e ON e.id = sl.exercise_id
     WHERE c.id = $1
       AND r.completed_at IS NOT NULL
       AND (r.completed_at AT TIME ZONE 'America/Asuncion')::date BETWEEN $2::date AND $3::date
     ORDER BY (r.completed_at AT TIME ZONE 'America/Asuncion')::date, sl.logged_at`,
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
  const [clientCountResult, activeResult, summaryResult, volumeResult, weeklyResult, history, activity, heatmap, weekdayActivity, muscleBalance] = await Promise.all([
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
         COUNT(*) FILTER (WHERE scheduled_date BETWEEN $2::date AND $3::date)::integer AS scheduled,
         COUNT(*) FILTER (WHERE completed_at IS NOT NULL AND (completed_at AT TIME ZONE 'America/Asuncion')::date BETWEEN $2::date AND $3::date)::integer AS completed,
         COUNT(*) FILTER (WHERE session_status IN ('completed', 'partial') AND (COALESCE(completed_at, session_ended_at) AT TIME ZONE 'America/Asuncion')::date BETWEEN $2::date AND $3::date)::integer AS sessions,
         COUNT(*) FILTER (WHERE scheduled_date BETWEEN $2::date AND $3::date AND completed_at IS NOT NULL AND (completed_at AT TIME ZONE 'America/Asuncion')::date BETWEEN $2::date AND $3::date)::integer AS completed_scheduled,
         COALESCE(SUM(CASE WHEN completed_at IS NOT NULL AND (completed_at AT TIME ZONE 'America/Asuncion')::date BETWEEN $2::date AND $3::date THEN estimated_minutes ELSE 0 END), 0)::integer AS minutes
       FROM scoped_routines`,
      [clientId, from, to],
    ),
    pool.query(
      `SELECT COALESCE(SUM(COALESCE(sl.load, 0) * sl.reps), 0)::double precision AS volume_kg
       FROM set_log sl
       JOIN routine r ON r.id = sl.routine_id
       JOIN client c ON r.athlete_id = COALESCE(c.clerk_user_id, c.id)
       WHERE ($1::text IS NULL OR c.id = $1)
         AND r.session_status IN ('completed', 'partial')
         AND (COALESCE(r.completed_at, r.session_ended_at) AT TIME ZONE 'America/Asuncion')::date BETWEEN $2::date AND $3::date`,
      [clientId, from, to],
    ),
    pool.query(
      `SELECT
         date_trunc('week', COALESCE(r.completed_at, r.session_ended_at) AT TIME ZONE 'America/Asuncion')::date AS week_start,
         SUM(COALESCE(sl.load, 0) * sl.reps)::double precision AS volume_kg
       FROM set_log sl
       JOIN routine r ON r.id = sl.routine_id
       JOIN client c ON r.athlete_id = COALESCE(c.clerk_user_id, c.id)
       WHERE ($1::text IS NULL OR c.id = $1)
         AND r.session_status IN ('completed', 'partial')
         AND (COALESCE(r.completed_at, r.session_ended_at) AT TIME ZONE 'America/Asuncion')::date BETWEEN $2::date AND $3::date
       GROUP BY date_trunc('week', COALESCE(r.completed_at, r.session_ended_at) AT TIME ZONE 'America/Asuncion')::date
       ORDER BY week_start`,
      [clientId, from, to],
    ),
    fetchCoachHistory({ clientId, from, to, limit: 5, offset: 0 }),
    fetchCoachActivity({ clientId, from, to }),
    fetchCoachHeatmap({ clientId, from, to }),
    fetchCoachWeekdayActivity({ clientId, from, to }),
    fetchCoachMuscleBalance({ clientId, from, to }),
  ]);

  const summaryRow = summaryResult.rows[0] ?? {};
  const scheduledRoutines = Number(summaryRow.scheduled) || 0;
  const completedRoutines = Number(summaryRow.completed) || 0;
  const sessionCount = Number(summaryRow.sessions) || 0;
  const completedScheduledRoutines = Number(summaryRow.completed_scheduled) || 0;
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
      completionRate: scheduledRoutines ? Math.round((completedScheduledRoutines / scheduledRoutines) * 100) : 0,
      sessions: sessionCount,
      totalMinutes: Number(summaryRow.minutes) || 0,
      volumeKg: Number(volumeResult.rows[0]?.volume_kg) || 0,
    },
    weeklyVolume,
    activity,
    heatmap: { items: heatmap, weeks: activity.buckets },
    weekdayActivity,
    muscleBalance,
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
  const params = readHistoryQuery(request, reply);
  if (!params) return;
  if (!(await validateCoachClient(params.clientId, reply))) return;

  const query = request.query ?? {};
  const limit = Math.min(100, Math.max(1, Number.parseInt(query.limit, 10) || 25));
  const offset = Math.max(0, Number.parseInt(query.offset, 10) || 0);
  const [page, activity, heatmap] = await Promise.all([
    fetchCoachHistory({ ...params, limit, offset }),
    fetchCoachActivity(params),
    fetchCoachHeatmap(params),
  ]);
  return {
    ...page,
    weeklyAverages: activity.buckets,
    calendarActivity: { items: heatmap, weeks: activity.buckets },
  };
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

function coachLoadKey(clientId, day, position) {
  return `${clientId}:${day}:${position}`;
}

function parseCoachLoads(rawLoads, clientIds, days) {
  if (!Array.isArray(rawLoads)) {
    throw new Error('Faltan las cargas definidas por el entrenador');
  }

  const selectedClients = new Set(clientIds);
  const expected = new Set();
  for (const day of days) {
    for (const exercise of day.exercises) {
      for (const clientId of selectedClients) expected.add(coachLoadKey(clientId, day.day, exercise.position));
    }
  }

  const loads = new Map();
  for (const entry of rawLoads) {
    const clientId = textValue(entry?.clientId);
    const day = Number(entry?.day);
    const position = Number(entry?.position);
    const rawLoad = entry?.loadKg;
    const numericLoad = Number(rawLoad);
    const loadKg = normalizedLoad(rawLoad);
    const key = coachLoadKey(clientId, day, position);

    if (!selectedClients.has(clientId) || !Number.isInteger(day) || !Number.isInteger(position) || !expected.has(key)) {
      throw new Error('La carga referencia un ejercicio o alumno inválido');
    }
    if (loadKg === null || Math.abs(numericLoad * 2 - Math.round(numericLoad * 2)) > 1e-9) {
      throw new Error('Las cargas deben ser números entre 0 y 500 kg, en pasos de 0,5 kg');
    }
    if (loads.has(key)) throw new Error('Hay cargas repetidas para el mismo ejercicio');
    loads.set(key, loadKg);
  }

  for (const key of expected) {
    if (!loads.has(key)) throw new Error('Completá todas las cargas antes de asignar la rutina');
  }
  return loads;
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

function targetValueFromReps(value, fallback = 8) {
  const numbers = String(value ?? '').match(/\d+/g)?.map(Number).filter(Number.isFinite) ?? [];
  // In a range such as 8-10, reaching the minimum (8) completes the target.
  return numbers.length ? numbers[0] : fallback;
}

function targetValueFromExercise(explicit, scheme) {
  const text = String(scheme ?? '');
  const range = text.match(/(\d+)\s*[-–]\s*(\d+)/);
  if (range) return Number(range[1]) || targetValueFromReps(text);
  return Number(explicit) || targetValueFromReps(text);
}

function isBodyweightName(name) {
  return /\b(plancha|flexiones?|dominadas?|fondos|burpees?)\b/.test(normalizeName(name));
}

function progressionMetricFor(name, reps, load, explicitMetric) {
  if (explicitMetric === 'seconds' || explicitMetric === 'reps' || explicitMetric === 'load') return explicitMetric;
  if (/\b(?:s|seg|segundos?)\b/.test(String(reps ?? '').toLowerCase())) return 'seconds';
  if (isBodyweightName(name) || load === null || load === undefined) return 'reps';
  return 'load';
}

function incrementForMetric(metric) {
  return metric === 'seconds' ? 5 : 2;
}

function replaceTargetInReps(reps, target) {
  const raw = String(reps ?? '').trim() || String(target);
  const matches = [...raw.matchAll(/\d+/g)];
  if (!matches.length) return String(target);
  const last = matches[matches.length - 1];
  return `${raw.slice(0, last.index)}${target}${raw.slice(last.index + last[0].length)}`;
}

async function findLatestCompletedPerformance(client, athleteId, exerciseName) {
  const normalized = normalizeName(exerciseName);
  if (!normalized) return null;
  const result = await client.query(
    `SELECT r.id AS routine_id, r.completed_at, e.name, e.sets, e.scheme,
            e.target_reps, e.progression_metric, sl.set_index, sl.load, sl.reps
       FROM routine r
       JOIN set_log sl ON sl.routine_id = r.id AND sl.clerk_user_id = r.athlete_id
       JOIN exercise e ON e.id = sl.exercise_id
      WHERE r.athlete_id = $1
        AND r.completed_at IS NOT NULL
      ORDER BY r.completed_at DESC, sl.set_index ASC, sl.id DESC
      LIMIT 2000`,
    [athleteId],
  );

  let current = null;
  for (const row of result.rows) {
    if (normalizeName(row.name) !== normalized) continue;
    if (!current || current.routineId !== row.routine_id) {
      if (current) break;
      current = {
        routineId: row.routine_id,
        completedAt: row.completed_at,
        sets: Number(row.sets) || 1,
        scheme: row.scheme ?? '',
        targetReps: targetValueFromExercise(row.target_reps, row.scheme),
        metric: progressionMetricFor(row.name, row.scheme, row.load, row.progression_metric),
        logs: [],
      };
    }
    current.logs.push({
      setIndex: Number(row.set_index) || 0,
      load: row.load === null ? null : Number(row.load),
      reps: Number(row.reps) || 0,
    });
  }
  return current;
}

async function calculateAiLoadDecision(client, {
  athleteId,
  exerciseName,
  reps,
  sets,
  fallbackLoad,
  weightKg,
  progressionMetric,
}) {
  const metric = progressionMetricFor(exerciseName, reps, fallbackLoad, progressionMetric);
  const targetReps = targetValueFromReps(reps);
  const latest = await findLatestCompletedPerformance(client, athleteId, exerciseName);

  if (!latest) {
    const initialLoad = metric === 'load'
      ? await predictLoad(client, athleteId, exerciseName, weightKg)
      : 0;
    return {
      loadKg: initialLoad ?? (metric === 'load' ? fallbackLoad ?? 0 : 0),
      reps: String(reps),
      targetReps,
      metric,
      previousLoad: null,
      previousReps: null,
      reason: 'Sin historial completado: carga inicial de referencia.',
    };
  }

  const latestLoad = latest.logs
    .map((log) => log.load)
    .filter((load) => load !== null && Number.isFinite(load) && load > 0)
    .reduce((max, load) => Math.max(max, load), 0);
  const currentLoad = latestLoad || (metric === 'load' ? fallbackLoad ?? 0 : 0);
  const bestReps = latest.logs.reduce((max, log) => Math.max(max, log.reps), 0);
  const completedAllSets = latest.logs.length >= (Number(sets) || latest.sets)
    && latest.logs.every((log) => log.reps >= targetReps);

  if (metric === 'load') {
    return {
      loadKg: roundLoad(completedAllSets ? currentLoad + 2.5 : currentLoad) ?? 0,
      reps: String(reps),
      targetReps,
      metric,
      previousLoad: roundLoad(currentLoad),
      previousReps: bestReps || null,
      reason: completedAllSets
        ? 'Aumenta 2,5 kg: completó todas las series objetivo.'
        : 'Mantiene la carga: faltaron repeticiones objetivo.',
    };
  }

  const nextTarget = completedAllSets ? targetReps + incrementForMetric(metric) : targetReps;
  return {
    loadKg: 0,
    reps: replaceTargetInReps(reps, nextTarget),
    targetReps: nextTarget,
    metric,
    previousLoad: 0,
    previousReps: bestReps || null,
    reason: completedAllSets
      ? `Aumenta ${incrementForMetric(metric)} ${metric === 'seconds' ? 'segundos' : 'repeticiones'}: completó el objetivo.`
      : 'Mantiene el objetivo: faltaron repeticiones o tiempo.',
  };
}

async function refreshOverloadRows(client, routineId) {
  const result = await client.query(
    `SELECT e.id, e.name, e.scheme, e.sets, e.suggested, e.target_reps,
            e.progression_metric, sl.set_index, sl.load, sl.reps
       FROM routine_exercise re
       JOIN exercise e ON e.id = re.exercise_id
       LEFT JOIN set_log sl
         ON sl.routine_id = re.routine_id
        AND sl.exercise_id = re.exercise_id
      WHERE re.routine_id = $1
      ORDER BY re.position, sl.set_index`,
    [routineId],
  );

  const byExercise = new Map();
  for (const row of result.rows) {
    const current = byExercise.get(row.id) ?? {
      id: row.id,
      name: row.name,
      scheme: row.scheme,
      sets: Number(row.sets) || 1,
      suggested: Number(row.suggested) || 0,
      targetReps: targetValueFromExercise(row.target_reps, row.scheme),
      metric: progressionMetricFor(row.name, row.scheme, row.suggested, row.progression_metric),
      logs: [],
    };
    if (row.set_index !== null && row.set_index !== undefined) {
      current.logs.push({
        setIndex: Number(row.set_index) || 0,
        load: row.load === null ? null : Number(row.load),
        reps: Number(row.reps) || 0,
      });
    }
    byExercise.set(row.id, current);
  }

  for (const exercise of byExercise.values()) {
    const successful = exercise.logs.length >= exercise.sets
      && exercise.logs.every((log) => log.reps >= exercise.targetReps);
    const maxLoad = exercise.logs
      .map((log) => log.load)
      .filter((load) => load !== null && Number.isFinite(load) && load > 0)
      .reduce((max, load) => Math.max(max, load), 0);
    const currentLoad = exercise.metric === 'load' ? maxLoad || exercise.suggested : 0;
    const nextLoad = exercise.metric === 'load' && successful ? (roundLoad(currentLoad + 2.5) ?? currentLoad) : currentLoad;
    const nextReps = exercise.metric === 'load'
      ? exercise.targetReps
      : successful
        ? exercise.targetReps + incrementForMetric(exercise.metric)
        : exercise.targetReps;

    for (let setNo = 1; setNo <= exercise.sets; setNo += 1) {
      const log = exercise.logs.find((item) => item.setIndex === setNo - 1);
      await client.query(
        `INSERT INTO overload_row
          (exercise_id, set_no, last_load, last_reps, next_load, next_reps)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (exercise_id, set_no) DO UPDATE SET
           last_load = EXCLUDED.last_load,
           last_reps = EXCLUDED.last_reps,
           next_load = EXCLUDED.next_load,
           next_reps = EXCLUDED.next_reps`,
        [
          exercise.id,
          setNo,
          log?.load === null || log?.load === undefined ? 0 : roundLoad(log.load) ?? 0,
          log?.reps ?? 0,
          nextLoad,
          nextReps,
        ],
      );
    }
  }
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
       JOIN routine r ON r.id = sl.routine_id
      WHERE sl.clerk_user_id = $1
        AND r.athlete_id = $1
        AND r.completed_at IS NOT NULL
        AND sl.load IS NOT NULL
        AND sl.load > 0
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
        progressionMetric:
          rawExercise?.progressionMetric === 'seconds' || rawExercise?.progressionMetric === 'reps'
            ? rawExercise.progressionMetric
            : 'load',
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
    const parsedDays = normalizeImportedDays(parsed.days);
    const days = await resolveImportedCatalogExercises(pool, parsedDays);
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

  const profile = await ensureUser(request.userId);
  if (profile.role === 'athlete' && !profile.solo_training) {
    return reply.code(403).send({
      error: 'Tu rutina fue asignada por un entrenador y no se puede reemplazar desde el perfil del alumno',
    });
  }

  const client = await pool.connect();
  const routineIds = [];
  const planId = `plan-${randomUUID()}`;
  try {
    await client.query('BEGIN');
    days = await resolveImportedCatalogExercises(client, days);
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
             last_date, last_load, last_reps, last_note, catalog_id)
           VALUES ($1, $2, $3, $4, $5, 30, $6, $7, $8, $9, NULL, NULL, NULL, NULL, $10)`,
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
            exercise.catalogId ?? null,
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
        `INSERT INTO template_exercise
           (template_id, day, position, name, sets, reps, load_kg, rest_seconds, note, progression_metric)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [templateId, day.day, index, exercise.name, exercise.sets, exercise.reps, null, exercise.rest, exercise.note || null, exercise.progressionMetric],
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
      'SELECT day, position, rest_seconds, progression_metric FROM template_exercise WHERE template_id = $1',
      [templateId],
    );
    const restByPosition = new Map(
      restResult.rows.map((row) => [
        `${Number(row.day)}:${Number(row.position)}`,
        {
          rest: Number(row.rest_seconds) || 90,
          metric: row.progression_metric === 'seconds' || row.progression_metric === 'reps' ? row.progression_metric : 'load',
        },
      ]),
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
        `INSERT INTO template_exercise
           (template_id, day, position, name, sets, reps, load_kg, rest_seconds, note, progression_metric)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [
            templateId,
            day.day,
            index,
            exercise.name,
            exercise.sets,
            exercise.reps,
            null,
            restByPosition.get(`${day.day}:${index}`)?.rest ?? 90,
            exercise.note || null,
            restByPosition.get(`${day.day}:${index}`)?.metric ?? exercise.progressionMetric,
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
  const requestedClientIds = Array.isArray(request.body?.clientIds)
    ? request.body.clientIds.filter((id) => typeof id === 'string')
    : [];
  const clientIds = [...new Set(requestedClientIds)];
  if (!templateId) return reply.code(400).send({ error: 'Falta la plantilla a asignar' });
  if (!clientIds.length) return reply.code(400).send({ error: 'Elegí al menos un alumno' });

  const weekStart = textValue(request.body?.weekStart);
  if (!weekStart) return reply.code(400).send({ error: 'Falta la semana a asignar' });
  const week = Number(request.body?.week) > 0 ? Number(request.body?.week) : weekOfMonth(weekStart);
  const replace = request.body?.replace === true;
  const loadMode = request.body?.loadMode === 'coach' ? 'coach' : 'ai';

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const coachResult = await client.query(
      `SELECT c.id
         FROM coach c
         JOIN app_user u ON u.clerk_user_id = $1
        WHERE u.role = 'coach'
          AND LOWER(c.name) = LOWER(u.display_name)
        LIMIT 1`,
      [request.userId],
    );
    const coachId = coachResult.rows[0]?.id ?? null;
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
      'SELECT day, position, name, sets, reps, load_kg, rest_seconds, note, progression_metric FROM template_exercise WHERE template_id = $1 ORDER BY day, position',
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

    let coachLoads = new Map();
    if (loadMode === 'coach') {
      try {
        coachLoads = parseCoachLoads(request.body?.coachLoads, clientIds, days);
      } catch (error) {
        await client.query('ROLLBACK');
        return reply.code(400).send({ error: error.message });
      }
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
            (id, plan_id, name, block, week, week_start, day, coach_id, athlete_id, estimated_minutes, seconds_per_set, is_today, load_mode)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 45, $11, $12)`,
          [
            routineId,
            planId,
            `${templateRow.name} · ${day.name}`,
            'Plantilla',
            week,
            weekStart,
            day.day,
            coachId,
            athleteId,
            Math.max(10, Math.ceil(totalSets * 2.25 + day.exercises.length * 1.5)),
            dayIndex === 0 ? 1 : 0,
            loadMode,
          ],
        );

        for (const [position, exercise] of day.exercises.entries()) {
          const exerciseId = `exercise-${randomUUID()}`;
          const note = typeof exercise.note === 'string' && exercise.note.trim() ? exercise.note.trim() : '';
          const coachLoad = loadMode === 'coach'
            ? coachLoads.get(coachLoadKey(clientId, day.day, exercise.position))
            : null;
          const metric = progressionMetricFor(
            exercise.name,
            exercise.reps,
            loadMode === 'coach' ? coachLoad : exercise.load_kg,
            exercise.progression_metric,
          );
          const decision = loadMode === 'ai'
            ? await calculateAiLoadDecision(client, {
                athleteId,
                exerciseName: exercise.name,
                reps: exercise.reps,
                sets: exercise.sets,
                fallbackLoad: exercise.load_kg,
                weightKg,
                progressionMetric: metric,
            })
            : {
                loadKg: coachLoad,
                reps: exercise.reps,
                targetReps: targetValueFromReps(exercise.reps),
                metric,
                previousLoad: null,
                previousReps: null,
                reason: 'Carga definida por el entrenador al asignar.',
              };
          const suggested = decision.loadKg ?? 0;
          await client.query(
            `INSERT INTO exercise
              (id, name, scheme, suggested, sets, work, rest, focus, cues, overload,
               last_date, last_load, last_reps, last_note, load_source, load_reason,
               progression_metric, target_reps)
             VALUES ($1, $2, $3, $4, $5, 30, $6, $7, $8, $9, NULL, NULL, NULL, NULL, $10, $11, $12, $13)`,
            [
              exerciseId,
              exercise.name,
              `${exercise.sets} × ${decision.reps}`,
              suggested,
              exercise.sets,
              exercise.rest_seconds,
              day.name,
              note || 'Cargá la plantilla del entrenador y confirmá la técnica antes de comenzar.',
              request.body?.autoOverload === true ? 2.5 : null,
              loadMode,
              decision.reason,
              decision.metric,
              decision.targetReps,
            ],
          );
          await client.query(
            `INSERT INTO routine_exercise (routine_id, exercise_id, position)
             VALUES ($1, $2, $3)`,
            [routineId, exerciseId, position],
          );

          for (let setNo = 1; setNo <= exercise.sets; setNo += 1) {
            await client.query(
              `INSERT INTO overload_row
                (exercise_id, set_no, last_load, last_reps, next_load, next_reps)
               VALUES ($1, $2, $3, $4, $5, $6)
               ON CONFLICT (exercise_id, set_no) DO UPDATE SET
                 last_load = EXCLUDED.last_load,
                 last_reps = EXCLUDED.last_reps,
                 next_load = EXCLUDED.next_load,
                 next_reps = EXCLUDED.next_reps`,
              [
                exerciseId,
                setNo,
                decision.previousLoad ?? 0,
                decision.previousReps ?? 0,
                suggested,
                decision.targetReps,
              ],
            );
          }
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
  const isSoloAthlete = profile.role === 'athlete' && profile.solo_training === true;
  if (profile.role !== 'coach' && !isSoloAthlete) {
    return reply.code(403).send({ error: 'Sólo un coach o un atleta independiente puede editar rutinas' });
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
      catalogId: textValue(item?.catalogId) || null,
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
      'SELECT id, athlete_id, coach_id, block FROM routine WHERE id = $1 AND athlete_id IS NOT NULL FOR UPDATE',
      [routineId],
    );
    const routineRow = routineResult.rows[0];
    if (!routineRow) return reject(404, 'No encontramos esa rutina asignada');

    if (isSoloAthlete && (routineRow.athlete_id !== request.userId || routineRow.coach_id)) {
      return reject(403, 'Sólo podés editar tus propias rutinas independientes');
    }

    await client.query("UPDATE routine SET load_mode = 'coach' WHERE id = $1", [routineId]);

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
            (id, name, scheme, suggested, sets, work, rest, focus, cues, overload, catalog_id,
             last_date, last_load, last_reps, last_note, load_source, load_reason,
             progression_metric, target_reps)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, 'coach', 'Carga ajustada por el entrenador.', $16, $17)`,
          [
            exerciseId,
            ...values,
            item.catalogId ?? null,
            previous?.last_date ?? null,
            previous?.last_load ?? null,
            previous?.last_reps ?? null,
            previous?.last_note ?? null,
            progressionMetricFor(item.name, item.reps, item.suggested),
            targetValueFromReps(item.reps),
          ],
        );
      } else {
        await client.query(
          `UPDATE exercise
           SET name = $1, scheme = $2, suggested = $3, sets = $4, work = $5,
               focus = $6, cues = $7, overload = $8,
               load_source = 'coach',
               load_reason = 'Carga ajustada por el entrenador.',
               progression_metric = $9,
               target_reps = $10
           WHERE id = $11`,
          [item.name, `${item.sets} \u00d7 ${item.reps}`, item.suggested, item.sets, item.work, item.focus, item.cues, item.overload, progressionMetricFor(item.name, item.reps, item.suggested), targetValueFromReps(item.reps), exerciseId],
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

  const scheme = `${sets} \u00d7 ${reps}`;
  const result = await pool.query(
    `UPDATE exercise
     SET scheme = $1,
         suggested = $2,
         sets = $3,
         overload = $4,
         load_source = 'coach',
         load_reason = 'Carga ajustada por el entrenador.',
         progression_metric = $5,
         target_reps = $6
     WHERE id = $7
     RETURNING *`,
    [scheme, suggested, sets, overload, progressionMetricFor('', reps, suggested), targetValueFromReps(reps), exerciseId],
  );
  if (!result.rows[0]) return reply.code(404).send({ error: 'No encontramos ese ejercicio' });
  return reply.send({ ok: true, exercise: result.rows[0] });
});

async function completeRoutine(client, routineId, athleteId) {
  const result = await client.query(
    `UPDATE routine
        SET completed_at = COALESCE(completed_at, NOW()),
            session_status = 'completed',
            session_ended_at = NULL
      WHERE id = $1 AND athlete_id = $2
      RETURNING id, completed_at, session_status`,
    [routineId, athleteId],
  );
  if (!result.rows[0]) return null;
  await refreshOverloadRows(client, routineId);
  return result.rows[0];
}

app.post('/v1/routines/:id/complete', { preHandler: authenticate }, async (request, reply) => {
  const routineId = textValue(request.params?.id);
  if (!routineId) return reply.code(400).send({ error: 'Falta la rutina a completar' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await completeRoutine(client, routineId, request.userId);
    if (!result) {
      await client.query('ROLLBACK');
      return reply.code(404).send({ error: 'No encontramos esa rutina' });
    }
    await client.query('COMMIT');
    return reply.send({ ok: true, id: result.id, completedAt: result.completed_at });
  } catch (error) {
    await client.query('ROLLBACK');
    request.log.error({ error, routineId }, 'Routine completion failed');
    return reply.code(500).send({ error: 'No pudimos completar la rutina' });
  } finally {
    client.release();
  }
});

app.post('/v1/session/start', { preHandler: authenticate }, async (request, reply) => {
  const routineId = textValue(request.body?.routineId);
  if (!routineId) return reply.code(400).send({ error: 'Falta la rutina a iniciar' });

  const routineResult = await pool.query(
    `SELECT id, name, completed_at, session_status
       FROM routine
      WHERE id = $1 AND athlete_id = $2`,
    [routineId, request.userId],
  );
  if (!routineResult.rows[0]) return reply.code(404).send({ error: 'No encontramos esa rutina' });
  if (routineResult.rows[0].completed_at) {
    return reply.code(409).send({ error: 'Esta rutina ya fue completada' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `UPDATE routine
          SET session_status = 'active', session_ended_at = NULL
        WHERE id = $1 AND athlete_id = $2`,
      [routineId, request.userId],
    );
    await client.query(
      `UPDATE client SET
       live_routine = $1,
       live_set_index = 0,
       live_total_sets = NULL,
       live_elapsed = '0:00',
       live_session_started_at = CASE
         WHEN live_routine = $1 THEN COALESCE(live_session_started_at, NOW())
         ELSE NOW()
       END
       WHERE clerk_user_id = $2`,
      [routineResult.rows[0].name, request.userId],
    );
    await client.query('COMMIT');
    return reply.send({ ok: true, routineId, status: 'active' });
  } catch (error) {
    await client.query('ROLLBACK');
    request.log.error({ error, routineId }, 'Session start failed');
    return reply.code(500).send({ error: 'No pudimos iniciar la sesiÃ³n' });
  } finally {
    client.release();
  }
});

app.post('/v1/session/end', { preHandler: authenticate }, async (request, reply) => {
  const routineId = textValue(request.body?.routineId);
  if (!routineId) return reply.code(400).send({ error: 'Falta la rutina a finalizar' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const updated = await completeRoutine(client, routineId, request.userId);
    if (!updated) {
      await client.query('ROLLBACK');
      return reply.code(404).send({ error: 'No encontramos esa rutina' });
    }
    await client.query(
      `UPDATE client SET
         live_routine = NULL,
         live_set_index = NULL,
         live_total_sets = NULL,
         live_elapsed = NULL,
         live_session_started_at = NULL,
         status = 'Última sesión: hoy'
       WHERE clerk_user_id = $1`,
      [request.userId],
    );
    await client.query('COMMIT');
    return reply.send({ ok: true, routineId, status: 'completed' });
  } catch (error) {
    await client.query('ROLLBACK');
    request.log.error({ error }, 'Session end failed');
    return reply.code(500).send({ error: 'No pudimos finalizar la sesión' });
  } finally {
    client.release();
  }
});

async function clearLiveSession(client, athleteId) {
  await client.query(
    `UPDATE client SET
       live_routine = NULL,
       live_set_index = NULL,
       live_total_sets = NULL,
       live_elapsed = NULL,
       live_session_started_at = NULL
     WHERE clerk_user_id = $1`,
    [athleteId],
  );
}

async function findOwnedRoutine(client, routineId, athleteId) {
  const result = await client.query(
    `SELECT id, completed_at, session_status, session_ended_at
       FROM routine
      WHERE id = $1 AND athlete_id = $2`,
    [routineId, athleteId],
  );
  return result.rows[0] ?? null;
}

app.post('/v1/session/stop', { preHandler: authenticate }, async (request, reply) => {
  const routineId = textValue(request.body?.routineId);
  if (!routineId) return reply.code(400).send({ error: 'Falta la rutina a detener' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const routine = await findOwnedRoutine(client, routineId, request.userId);
    if (!routine) {
      await client.query('ROLLBACK');
      return reply.code(404).send({ error: 'No encontramos esa rutina' });
    }
    if (routine.completed_at) {
      await client.query('ROLLBACK');
      return reply.code(409).send({ error: 'Esta rutina ya fue completada' });
    }
    const ended = await client.query(
      `UPDATE routine
          SET session_status = 'partial', session_ended_at = COALESCE(session_ended_at, NOW())
        WHERE id = $1 AND athlete_id = $2
        RETURNING session_ended_at`,
      [routineId, request.userId],
    );
    await clearLiveSession(client, request.userId);
    await client.query('COMMIT');
    return reply.send({
      ok: true,
      routineId,
      status: 'partial',
      endedAt: ended.rows[0]?.session_ended_at ?? new Date().toISOString(),
    });
  } catch (error) {
    await client.query('ROLLBACK');
    request.log.error({ error, routineId }, 'Session stop failed');
    return reply.code(500).send({ error: 'No pudimos detener la sesion' });
  } finally {
    client.release();
  }
});

app.post('/v1/session/cancel', { preHandler: authenticate }, async (request, reply) => {
  const routineId = textValue(request.body?.routineId);
  if (!routineId) return reply.code(400).send({ error: 'Falta la rutina a cancelar' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const routine = await findOwnedRoutine(client, routineId, request.userId);
    if (!routine) {
      await client.query('ROLLBACK');
      return reply.code(404).send({ error: 'No encontramos esa rutina' });
    }
    if (routine.completed_at) {
      await client.query('ROLLBACK');
      return reply.code(409).send({ error: 'Esta rutina ya fue completada' });
    }
    await client.query(
      `DELETE FROM set_log
        WHERE clerk_user_id = $1
          AND routine_id = $2
          AND logged_at >= (
            SELECT live_session_started_at
              FROM client
             WHERE clerk_user_id = $1
               AND live_session_started_at IS NOT NULL
          )`,
      [request.userId, routineId],
    );
    await client.query(
      `UPDATE routine
          SET session_status = 'scheduled', session_ended_at = NULL
        WHERE id = $1 AND athlete_id = $2`,
      [routineId, request.userId],
    );
    await clearLiveSession(client, request.userId);
    await client.query('COMMIT');
    return reply.send({ ok: true, routineId, status: 'scheduled' });
  } catch (error) {
    await client.query('ROLLBACK');
    request.log.error({ error, routineId }, 'Session cancel failed');
    return reply.code(500).send({ error: 'No pudimos cancelar la sesion' });
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

  await client.query('DELETE FROM set_log WHERE routine_id = ANY($1::text[])', [routineIds]);
  await client.query('DELETE FROM routine_exercise WHERE routine_id = ANY($1::text[])', [routineIds]);
  await client.query('DELETE FROM routine WHERE id = ANY($1::text[])', [routineIds]);

  if (exerciseIds.length) {
    await client.query('DELETE FROM overload_row WHERE exercise_id = ANY($1::text[])', [exerciseIds]);
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

  await client.query('DELETE FROM set_log WHERE routine_id = ANY($1::text[])', [routineIds]);
  await client.query('DELETE FROM routine_exercise WHERE routine_id = ANY($1::text[])', [routineIds]);
  await client.query('DELETE FROM routine WHERE athlete_id = $1', [userId]);

  if (exerciseIds.length) {
    await client.query('DELETE FROM overload_row WHERE exercise_id = ANY($1::text[])', [exerciseIds]);
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
  const profile = await pool.query(
    'SELECT role, solo_training FROM app_user WHERE clerk_user_id = $1 LIMIT 1',
    [request.userId],
  );
  const user = profile.rows[0];
  if (user?.role !== 'athlete' || !user.solo_training) {
    return reply.code(403).send({
      error: 'Las rutinas asignadas por un entrenador no se pueden eliminar desde el perfil del alumno',
    });
  }

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

  const ownership = await pool.query(
    `SELECT 1
       FROM routine r
       JOIN routine_exercise re ON re.routine_id = r.id AND re.exercise_id = $2
      WHERE r.id = $1 AND r.athlete_id = $3
      LIMIT 1`,
    [routineId, exerciseId, request.userId],
  );
  if (!ownership.rows[0]) return reply.code(404).send({ error: 'El ejercicio no pertenece a esa rutina' });

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
