-- Demo fixture for coach statistics and load progression.
-- Owns only rows prefixed with stats-demo- and never touches real/test routines.

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM app_user
    WHERE lower(email) = 'coachlander.coach.test@gmail.com'
      AND role = 'coach'
  ) THEN
    RAISE EXCEPTION 'Missing coach demo account';
  END IF;

  IF (
    SELECT count(*)
    FROM client c
    JOIN app_user u ON u.clerk_user_id = c.clerk_user_id
    WHERE c.id IN ('client-lucia', 'client-mateo', 'client-valentina', 'client-joaquin', 'client-camila')
      AND u.role = 'athlete'
  ) <> 5 THEN
    RAISE EXCEPTION 'The five demo clients are not available';
  END IF;
END
$$;

-- Los clientes demo se crean desde la cuenta del coach y no pasan por el
-- formulario de onboarding del atleta. Completar sólo perfiles demo que aún
-- no tienen medidas, sin sobrescribir datos reales ya cargados.
UPDATE app_user u
SET weight_kg = COALESCE(u.weight_kg, CASE c.id
  WHEN 'client-lucia' THEN 62
  WHEN 'client-mateo' THEN 78
  WHEN 'client-valentina' THEN 58
  WHEN 'client-joaquin' THEN 84
  WHEN 'client-camila' THEN 67
END),
    height_m = COALESCE(u.height_m, CASE c.id
      WHEN 'client-lucia' THEN 1.65
      WHEN 'client-mateo' THEN 1.78
      WHEN 'client-valentina' THEN 1.62
      WHEN 'client-joaquin' THEN 1.82
      WHEN 'client-camila' THEN 1.68
    END),
    updated_at = NOW()
FROM client c
WHERE c.clerk_user_id = u.clerk_user_id
  AND c.id IN ('client-lucia', 'client-mateo', 'client-valentina', 'client-joaquin', 'client-camila')
  AND u.role = 'athlete';

CREATE TEMP TABLE seed_cleanup_routines (id TEXT PRIMARY KEY) ON COMMIT DROP;
CREATE TEMP TABLE seed_cleanup_exercises (id TEXT PRIMARY KEY) ON COMMIT DROP;

INSERT INTO seed_cleanup_routines (id)
SELECT id
FROM routine
WHERE id LIKE 'stats-demo-%'
   OR id IN (
     'routine-7fae8b24-be36-4d2b-b67e-5e263d5cbd69',
     'routine-e82ec706-7611-48b0-a653-5605787e5519',
     'routine-fa3404a0-f792-46ea-aedb-e7e0789fe2ee',
     'routine-d51ff321-ad83-435c-87bb-0b337b3c85be',
     'routine-f20ea083-bfeb-4ae6-8d4a-3251bdf25030'
   )
ON CONFLICT DO NOTHING;

INSERT INTO seed_cleanup_exercises (id)
SELECT re.exercise_id
FROM routine_exercise re
JOIN seed_cleanup_routines r ON r.id = re.routine_id
ON CONFLICT DO NOTHING;

INSERT INTO seed_cleanup_exercises (id)
SELECT id
FROM exercise
WHERE id LIKE 'stats-demo-%'
ON CONFLICT DO NOTHING;

DELETE FROM set_log
WHERE routine_id IN (SELECT id FROM seed_cleanup_routines);

DELETE FROM overload_row
WHERE exercise_id IN (SELECT id FROM seed_cleanup_exercises);

DELETE FROM routine_exercise
WHERE routine_id IN (SELECT id FROM seed_cleanup_routines);

DELETE FROM routine
WHERE id IN (SELECT id FROM seed_cleanup_routines);

DELETE FROM exercise
WHERE id IN (SELECT id FROM seed_cleanup_exercises)
  AND NOT EXISTS (SELECT 1 FROM routine_exercise WHERE routine_exercise.exercise_id = exercise.id);

DELETE FROM template
WHERE id LIKE 'stats-demo-template-%';

DELETE FROM client_exercise_goal
WHERE client_id IN ('client-lucia', 'client-mateo', 'client-valentina', 'client-joaquin', 'client-camila')
  AND exercise_key = 'press de pecho';

INSERT INTO template (id, name, meta, assigned, position, completed_at)
VALUES (
  'stats-demo-template-fuerza',
  'Fuerza equilibrada',
  '12 ejercicios · 36 series',
  '5 alumnos',
  900,
  NOW()
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  meta = EXCLUDED.meta,
  assigned = EXCLUDED.assigned,
  position = EXCLUDED.position,
  completed_at = EXCLUDED.completed_at;

INSERT INTO template_day (template_id, day, name)
VALUES
  ('stats-demo-template-fuerza', 1, 'Piernas y core'),
  ('stats-demo-template-fuerza', 2, 'Empuje y tiron'),
  ('stats-demo-template-fuerza', 3, 'Fuerza completa'),
  ('stats-demo-template-fuerza', 4, 'Cadena posterior')
ON CONFLICT (template_id, day) DO UPDATE SET name = EXCLUDED.name;

INSERT INTO template_exercise
  (template_id, day, position, name, sets, reps, load_kg, rest_seconds, note, progression_metric)
VALUES
  ('stats-demo-template-fuerza', 1, 1, 'Sentadilla goblet', 3, '8', 24, 90, 'Controla la bajada.', 'load'),
  ('stats-demo-template-fuerza', 1, 2, 'Peso muerto rumano', 3, '10', 40, 120, 'Mantene la espalda neutra.', 'load'),
  ('stats-demo-template-fuerza', 1, 3, 'Plancha', 3, '40 s', 0, 60, 'Respiracion constante.', 'seconds'),
  ('stats-demo-template-fuerza', 2, 1, 'Press de pecho', 3, '10', 36, 90, 'Escapulas apoyadas.', 'load'),
  ('stats-demo-template-fuerza', 2, 2, 'Remo sentado', 3, '8', 30, 90, 'Sin balancearte.', 'load'),
  ('stats-demo-template-fuerza', 2, 3, 'Plancha', 3, '40 s', 0, 60, 'Manten la linea del cuerpo.', 'seconds'),
  ('stats-demo-template-fuerza', 3, 1, 'Sentadilla goblet', 3, '8', 24, 90, 'Controla la bajada.', 'load'),
  ('stats-demo-template-fuerza', 3, 2, 'Press de pecho', 3, '10', 36, 90, 'Escapulas apoyadas.', 'load'),
  ('stats-demo-template-fuerza', 3, 3, 'Remo sentado', 3, '8', 30, 90, 'Sin balancearte.', 'load'),
  ('stats-demo-template-fuerza', 4, 1, 'Peso muerto rumano', 3, '10', 40, 120, 'Cadera atras.', 'load'),
  ('stats-demo-template-fuerza', 4, 2, 'Remo sentado', 3, '8', 30, 90, 'Sin balancearte.', 'load'),
  ('stats-demo-template-fuerza', 4, 3, 'Plancha', 3, '40 s', 0, 60, 'Respiracion constante.', 'seconds')
ON CONFLICT (template_id, day, position) DO UPDATE SET
  name = EXCLUDED.name,
  sets = EXCLUDED.sets,
  reps = EXCLUDED.reps,
  load_kg = EXCLUDED.load_kg,
  rest_seconds = EXCLUDED.rest_seconds,
  note = EXCLUDED.note,
  progression_metric = EXCLUDED.progression_metric;

DO $$
DECLARE
  c RECORD;
  te RECORD;
  prev RECORD;
  week_no INTEGER;
  day_no INTEGER;
  set_no INTEGER;
  client_no INTEGER;
  target_reps INTEGER;
  previous_target INTEGER;
  previous_load DOUBLE PRECISION;
  suggested DOUBLE PRECISION;
  actual_load DOUBLE PRECISION;
  actual_reps INTEGER;
  week_start DATE;
  scheduled_date DATE;
  completed_at TIMESTAMPTZ;
  routine_id TEXT;
  plan_id TEXT;
  exercise_id TEXT;
  mode TEXT;
  metric TEXT;
  reps_text TEXT;
  reason TEXT;
  should_complete BOOLEAN;
  should_log BOOLEAN;
  previous_success BOOLEAN;
  failed_session BOOLEAN;
  has_previous BOOLEAN;
BEGIN
  FOR c IN
    SELECT client_row.id, client_row.clerk_user_id AS athlete_id,
           row_number() OVER (ORDER BY client_row.position)::INTEGER AS client_no
    FROM client AS client_row
    WHERE client_row.id IN ('client-lucia', 'client-mateo', 'client-valentina', 'client-joaquin', 'client-camila')
    ORDER BY client_row.position
  LOOP
    client_no := c.client_no;

    FOR week_no IN 1..10 LOOP
      week_start := date_trunc('week', CURRENT_DATE)::DATE - ((10 - week_no) * 7);
      plan_id := format('stats-demo-plan-%s-w%s', c.id, week_no);

      FOR day_no IN 1..4 LOOP
        scheduled_date := week_start + (day_no - 1);
        should_complete := scheduled_date <= CURRENT_DATE;

        IF c.id = 'client-lucia' THEN
          should_complete := should_complete AND NOT (day_no = 4 AND week_no IN (3, 8));
        ELSIF c.id = 'client-mateo' THEN
          should_complete := should_complete AND NOT (day_no = 3 AND week_no IN (2, 6, 9));
        ELSIF c.id = 'client-valentina' THEN
          should_complete := should_complete AND (day_no IN (1, 2) OR (day_no = 4 AND mod(week_no, 3) = 0));
        ELSIF c.id = 'client-joaquin' THEN
          should_complete := should_complete AND mod(week_no + day_no, 4) <> 0;
        ELSIF c.id = 'client-camila' THEN
          should_complete := should_complete AND (week_no >= 6 AND (day_no = 1 OR (day_no = 2 AND mod(week_no, 2) = 0)));
        END IF;

        IF should_complete THEN
          completed_at := (scheduled_date + TIME '18:00')
            + CASE WHEN mod(week_no + client_no + day_no, 3) = 0 THEN INTERVAL '1 day' ELSE INTERVAL '0 day' END
            + (client_no * INTERVAL '6 minutes');
          IF completed_at::DATE > CURRENT_DATE THEN
            should_complete := FALSE;
            completed_at := NULL;
          END IF;
        ELSE
          completed_at := NULL;
        END IF;

        mode := CASE
          WHEN c.id = 'client-joaquin' AND mod(week_no, 2) = 0 THEN 'coach'
          ELSE 'ai'
        END;
        routine_id := format('stats-demo-routine-%s-w%s-d%s', c.id, week_no, day_no);

        INSERT INTO routine
          (id, plan_id, name, block, week, day, coach_id, athlete_id, estimated_minutes,
           seconds_per_set, is_today, week_start, completed_at, load_mode)
        VALUES (
          routine_id,
          plan_id,
          format('Fuerza equilibrada · Dia %s', day_no),
          'Asignacion demo',
          week_no,
          day_no,
          (SELECT id FROM coach ORDER BY id LIMIT 1),
          c.athlete_id,
          32 + (day_no * 4),
          45,
          CASE WHEN scheduled_date = CURRENT_DATE THEN 1 ELSE 0 END,
          week_start,
          completed_at,
          mode
        );

        FOR te IN
          SELECT *
          FROM template_exercise
          WHERE template_id = 'stats-demo-template-fuerza'
            AND day = day_no
          ORDER BY position
        LOOP
          metric := te.progression_metric;
          -- En rangos como 8-10, 8 es el mínimo válido para completar el objetivo.
          target_reps := COALESCE(NULLIF((regexp_match(te.reps, '([0-9]+)'))[1], '')::INTEGER, 8);
          previous_load := NULL;
          previous_target := NULL;
          previous_success := FALSE;
          reason := 'Sin historial completado: carga inicial de referencia.';
          reps_text := te.reps;

          SELECT q.target_reps, q.current_load, q.successful
          INTO prev
          FROM (
            SELECT
              e.target_reps,
              COALESCE(MAX(sl.load) FILTER (WHERE sl.load IS NOT NULL AND sl.load > 0), e.suggested) AS current_load,
              COUNT(sl.id) >= e.sets
                AND COALESCE(BOOL_AND(sl.reps >= e.target_reps) FILTER (WHERE sl.id IS NOT NULL), FALSE) AS successful,
              r.completed_at
            FROM routine r
            JOIN routine_exercise re ON re.routine_id = r.id
            JOIN exercise e ON e.id = re.exercise_id AND e.name = te.name
            LEFT JOIN set_log sl ON sl.routine_id = r.id AND sl.exercise_id = e.id
            WHERE r.athlete_id = c.athlete_id
              AND r.completed_at IS NOT NULL
            GROUP BY r.id, r.completed_at, e.target_reps, e.suggested, e.sets
            ORDER BY r.completed_at DESC
            LIMIT 1
          ) q;
          has_previous := FOUND;

          IF mode = 'coach' THEN
            suggested := COALESCE(te.load_kg, 0);
            reason := 'Carga definida por el entrenador.';
          ELSIF NOT has_previous THEN
            suggested := COALESCE(te.load_kg, 0);
          ELSE
            previous_load := COALESCE(prev.current_load, te.load_kg, 0);
            previous_target := prev.target_reps;
            previous_success := COALESCE(prev.successful, FALSE);
            IF metric = 'load' THEN
              suggested := CASE WHEN previous_success THEN previous_load + 2.5 ELSE previous_load END;
              reason := CASE
                WHEN previous_success THEN 'Aumenta 2,5 kg: completo todas las series objetivo.'
                ELSE 'Mantiene la carga: faltaron repeticiones objetivo.'
              END;
            ELSE
              suggested := 0;
              target_reps := CASE WHEN previous_success THEN previous_target + CASE WHEN metric = 'seconds' THEN 5 ELSE 2 END ELSE previous_target END;
              reps_text := CASE WHEN metric = 'seconds' THEN format('%s s', target_reps) ELSE target_reps::TEXT END;
              reason := CASE
                WHEN previous_success THEN format('Aumenta %s: completo el objetivo.', CASE WHEN metric = 'seconds' THEN '5 segundos' ELSE '2 repeticiones' END)
                ELSE 'Mantiene el objetivo: faltaron repeticiones o tiempo.'
              END;
            END IF;
          END IF;

          exercise_id := format('stats-demo-snapshot-%s-w%s-d%s-e%s', c.id, week_no, day_no, te.position);

          INSERT INTO exercise
            (id, name, scheme, suggested, sets, work, rest, focus, cues, overload,
             last_date, last_load, last_reps, last_note, muscle_groups, load_source,
             load_reason, progression_metric, target_reps)
          VALUES (
            exercise_id,
            te.name,
            format('%s × %s', te.sets, reps_text),
            suggested,
            te.sets,
            CASE WHEN metric = 'seconds' THEN target_reps ELSE 30 END,
            te.rest_seconds,
            CASE te.name
              WHEN 'Sentadilla goblet' THEN 'Piernas'
              WHEN 'Peso muerto rumano' THEN 'Cadena posterior'
              WHEN 'Press de pecho' THEN 'Pecho'
              WHEN 'Remo sentado' THEN 'Espalda'
              ELSE 'Core'
            END,
            COALESCE(te.note, 'Segui la tecnica indicada.'),
            CASE WHEN mode = 'ai' THEN 2.5 ELSE NULL END,
            NULL,
            NULL,
            NULL,
            'Fixture de progresion demo',
            CASE te.name
              WHEN 'Sentadilla goblet' THEN ARRAY['cuadriceps', 'gluteos']
              WHEN 'Peso muerto rumano' THEN ARRAY['cadena_posterior', 'gluteos', 'espalda_baja']
              WHEN 'Press de pecho' THEN ARRAY['pecho', 'hombros']
              WHEN 'Remo sentado' THEN ARRAY['espalda', 'brazos']
              ELSE ARRAY['core']
            END,
            mode,
            reason,
            metric,
            target_reps
          );

          INSERT INTO routine_exercise (routine_id, exercise_id, position)
          VALUES (routine_id, exercise_id, te.position);

          FOR set_no IN 1..te.sets LOOP
            INSERT INTO overload_row (exercise_id, set_no, last_load, last_reps, next_load, next_reps)
            VALUES (exercise_id, set_no, COALESCE(previous_load, 0), COALESCE(previous_target, 0), suggested, target_reps);
          END LOOP;

          IF should_complete THEN
            failed_session :=
              (c.id = 'client-lucia' AND te.name = 'Press de pecho' AND week_no IN (5, 6))
              OR (c.id = 'client-mateo' AND te.name = 'Press de pecho' AND week_no = 5)
              OR (c.id = 'client-valentina' AND mod(week_no, 4) = 0)
              OR (c.id = 'client-joaquin' AND mod(week_no, 3) = 0);

            FOR set_no IN 0..(te.sets - 1) LOOP
              should_log := TRUE;
              IF c.id = 'client-joaquin' AND mod(week_no + day_no, 2) = 0 AND set_no = te.sets - 1 THEN
                should_log := FALSE;
              END IF;
              IF c.id = 'client-camila' AND week_no = 7 AND day_no = 1 AND set_no > 0 THEN
                should_log := FALSE;
              END IF;

              IF should_log THEN
                actual_reps := target_reps;
                IF failed_session THEN actual_reps := GREATEST(1, target_reps - 1); END IF;
                IF metric = 'seconds' THEN
                  actual_load := NULL;
                ELSE
                  actual_load := suggested;
                  IF c.id = 'client-joaquin' AND mod(week_no, 3) = 0 THEN
                    actual_load := GREATEST(0, suggested - 2.5);
                  END IF;
                END IF;

                INSERT INTO set_log (clerk_user_id, routine_id, exercise_id, set_index, load, reps, logged_at)
                VALUES (
                  c.athlete_id,
                  routine_id,
                  exercise_id,
                  set_no,
                  actual_load,
                  actual_reps,
                  completed_at - INTERVAL '45 minutes' + (set_no * INTERVAL '5 minutes')
                );
              END IF;
            END LOOP;
          END IF;
        END LOOP;
      END LOOP;
    END LOOP;
  END LOOP;
END
$$;

DELETE FROM overload_row
WHERE exercise_id LIKE 'stats-demo-snapshot-%';

WITH exercise_stats AS (
  SELECT
    e.id,
    r.id AS routine_id,
    e.sets,
    e.target_reps,
    e.progression_metric,
    e.suggested,
    COALESCE(MAX(sl.load) FILTER (WHERE sl.load IS NOT NULL AND sl.load > 0), e.suggested, 0) AS current_load,
    COUNT(sl.id)::INTEGER AS logged_sets,
    COALESCE(BOOL_AND(sl.reps >= e.target_reps) FILTER (WHERE sl.id IS NOT NULL), FALSE) AS successful
  FROM exercise e
  JOIN routine_exercise re ON re.exercise_id = e.id
  JOIN routine r ON r.id = re.routine_id
  LEFT JOIN set_log sl ON sl.routine_id = r.id AND sl.exercise_id = e.id
  WHERE e.id LIKE 'stats-demo-snapshot-%'
  GROUP BY e.id, r.id, e.sets, e.target_reps, e.progression_metric, e.suggested
),
set_rows AS (
  SELECT
    es.*,
    gs.set_no,
    sl.load AS last_load,
    sl.reps AS last_reps
  FROM exercise_stats es
  CROSS JOIN LATERAL generate_series(1, es.sets) AS gs(set_no)
  LEFT JOIN set_log sl
    ON sl.routine_id = es.routine_id
   AND sl.exercise_id = es.id
   AND sl.set_index = gs.set_no - 1
)
INSERT INTO overload_row (exercise_id, set_no, last_load, last_reps, next_load, next_reps)
SELECT
  id,
  set_no,
  COALESCE(last_load, 0),
  COALESCE(last_reps, 0),
  CASE WHEN progression_metric = 'load' AND logged_sets >= sets AND successful THEN current_load + 2.5 ELSE current_load END,
  CASE
    WHEN progression_metric = 'load' THEN target_reps
    WHEN logged_sets >= sets AND successful THEN target_reps + CASE WHEN progression_metric = 'seconds' THEN 5 ELSE 2 END
    ELSE target_reps
  END
FROM set_rows;

INSERT INTO client_exercise_goal (
  client_id, exercise_key, exercise_name, baseline_date, baseline_load_kg, baseline_reps,
  target_date, target_load_kg, target_reps, note
)
VALUES (
  'client-mateo',
  'press de pecho',
  'Press de pecho',
  CURRENT_DATE - 63,
  36,
  10,
  CURRENT_DATE + 21,
  48,
  10,
  'Subir la carga manteniendo diez repeticiones controladas.'
)
ON CONFLICT (client_id, exercise_key) DO UPDATE SET
  exercise_name = EXCLUDED.exercise_name,
  baseline_date = EXCLUDED.baseline_date,
  baseline_load_kg = EXCLUDED.baseline_load_kg,
  baseline_reps = EXCLUDED.baseline_reps,
  target_date = EXCLUDED.target_date,
  target_load_kg = EXCLUDED.target_load_kg,
  target_reps = EXCLUDED.target_reps,
  note = EXCLUDED.note,
  updated_at = NOW();

COMMIT;

SELECT 'demo_routines' AS metric, count(*)::TEXT AS value
FROM routine
WHERE id LIKE 'stats-demo-%'
UNION ALL
SELECT 'completed_routines', count(*)::TEXT
FROM routine
WHERE id LIKE 'stats-demo-%' AND completed_at IS NOT NULL
UNION ALL
SELECT 'pending_or_future_routines', count(*)::TEXT
FROM routine
WHERE id LIKE 'stats-demo-%' AND completed_at IS NULL
UNION ALL
SELECT 'assigned_exercise_snapshots', count(*)::TEXT
FROM exercise
WHERE id LIKE 'stats-demo-snapshot-%'
UNION ALL
SELECT 'demo_set_logs', count(*)::TEXT
FROM set_log
WHERE routine_id LIKE 'stats-demo-%'
UNION ALL
SELECT 'demo_overload_rows', count(*)::TEXT
FROM overload_row
WHERE exercise_id LIKE 'stats-demo-snapshot-%'
UNION ALL
SELECT 'ai_exercises', count(*)::TEXT
FROM exercise
WHERE id LIKE 'stats-demo-snapshot-%' AND load_source = 'ai'
UNION ALL
SELECT 'coach_exercises', count(*)::TEXT
FROM exercise
WHERE id LIKE 'stats-demo-snapshot-%' AND load_source = 'coach';
