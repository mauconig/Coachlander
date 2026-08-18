-- Demo fixture for coach statistics/history.
-- Intended for the VPS database only. It owns rows prefixed with stats-demo- and
-- removes only the previously generated demo routine/template rows listed below.

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
    WHERE c.id IN (
      'client-lucia',
      'client-mateo',
      'client-valentina',
      'client-joaquin',
      'client-camila'
    )
      AND u.role = 'athlete'
  ) <> 5 THEN
    RAISE EXCEPTION 'The five demo clients are not available';
  END IF;
END
$$;

DELETE FROM client_exercise_goal
WHERE client_id IN (
  'client-lucia',
  'client-mateo',
  'client-valentina',
  'client-joaquin',
  'client-camila'
)
  AND exercise_key = 'press de pecho';

CREATE TEMP TABLE seed_cleanup_routines (id TEXT PRIMARY KEY) ON COMMIT DROP;

INSERT INTO seed_cleanup_routines (id)
SELECT id
FROM routine
WHERE id LIKE 'routine-demo-%'
   OR id LIKE 'stats-demo-%'
   OR id IN (
     'routine-7fae8b24-be36-4d2b-b67e-5e263d5cbd69',
     'routine-e82ec706-7611-48b0-a653-5605787e5519',
     'routine-fa3404a0-f792-46ea-aedb-e7e0789fe2ee',
     'routine-d51ff321-ad83-435c-87bb-0b337b3c85be',
     'routine-f20ea083-bfeb-4ae6-8d4a-3251bdf25030'
   )
ON CONFLICT DO NOTHING;

-- These rows are generated demo assignments only. routine-test-* and the
-- imported athlete routines have different IDs and are intentionally untouched.
DELETE FROM set_log sl
USING seed_cleanup_routines r
WHERE sl.routine_id = r.id;

DELETE FROM routine_exercise re
USING seed_cleanup_routines r
WHERE re.routine_id = r.id;

DELETE FROM routine r
USING seed_cleanup_routines cleanup
WHERE r.id = cleanup.id;

DELETE FROM template
WHERE id IN (
  'template-78251aa2-1a2f-4385-8e9c-49e3f3c17eb0',
  'template-4855ef46-dbf5-4d9c-9e17-614c8a85a8ad',
  'template-92d8214c-b145-4012-bcf9-6265b1fbe0eb'
);

INSERT INTO exercise (
  id,
  name,
  scheme,
  suggested,
  sets,
  work,
  rest,
  focus,
  cues,
  overload,
  last_date,
  last_load,
  last_reps,
  last_note
)
VALUES
  ('stats-demo-exercise-1', 'Sentadilla goblet', '3 × 8', 24, 3, 8, 90, 'Piernas', 'Controlá la bajada y mantené el torso estable.', 2, NULL, NULL, NULL, 'Fixture de estadísticas'),
  ('stats-demo-exercise-2', 'Press de pecho', '3 × 10', 42, 3, 10, 90, 'Pecho', 'Escápulas apoyadas y recorrido controlado.', 2, NULL, NULL, NULL, 'Fixture de estadísticas'),
  ('stats-demo-exercise-3', 'Remo sentado', '4 × 8', 36, 4, 8, 90, 'Espalda', 'Llevá los codos hacia atrás sin balancearte.', 2, NULL, NULL, NULL, 'Fixture de estadísticas'),
  ('stats-demo-exercise-4', 'Peso muerto rumano', '3 × 10', 40, 3, 10, 120, 'Cadena posterior', 'Cadera atrás y espalda neutra.', 2, NULL, NULL, NULL, 'Fixture de estadísticas'),
  ('stats-demo-exercise-5', 'Plancha', '3 × 40 s', 0, 3, 40, 60, 'Core', 'Mantené la línea del cuerpo y respiración constante.', NULL, NULL, NULL, NULL, 'Fixture de estadísticas')
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  scheme = EXCLUDED.scheme,
  suggested = EXCLUDED.suggested,
  sets = EXCLUDED.sets,
  work = EXCLUDED.work,
  rest = EXCLUDED.rest,
  focus = EXCLUDED.focus,
  cues = EXCLUDED.cues,
  overload = EXCLUDED.overload,
  last_note = EXCLUDED.last_note;

WITH demo_clients AS (
  SELECT
    c.id,
    c.clerk_user_id AS athlete_id,
    row_number() OVER (ORDER BY c.position)::integer AS client_no
  FROM client c
  WHERE c.id IN (
    'client-lucia',
    'client-mateo',
    'client-valentina',
    'client-joaquin',
    'client-camila'
  )
),
weeks AS (
  SELECT
    week_no,
    date_trunc('week', CURRENT_DATE)::date - ((6 - week_no) * 7) AS week_start
  FROM generate_series(1, 6) AS series(week_no)
),
days AS (
  SELECT day
  FROM generate_series(1, 4) AS series(day)
),
planned AS (
  SELECT
    dc.id AS client_id,
    dc.athlete_id,
    dc.client_no,
    w.week_no,
    w.week_start,
    d.day,
    w.week_start + (d.day - 1) AS scheduled_date
  FROM demo_clients dc
  CROSS JOIN weeks w
  CROSS JOIN days d
)
INSERT INTO routine (
  id,
  plan_id,
  name,
  block,
  week,
  day,
  coach_id,
  athlete_id,
  estimated_minutes,
  seconds_per_set,
  is_today,
  week_start,
  completed_at
)
SELECT
  format('stats-demo-%s-w%s-d%s', client_id, week_no, day),
  'stats-demo-plan',
  CASE day
    WHEN 1 THEN 'Rutina demo · Día 1 — Piernas'
    WHEN 2 THEN 'Rutina demo · Día 2 — Empuje'
    WHEN 3 THEN 'Rutina demo · Día 3 — Tirón'
    ELSE 'Rutina demo · Día 4 — Full body'
  END,
  'Estadísticas demo',
  week_no,
  day,
  (SELECT id FROM coach WHERE id = 'coach-test-carlos' LIMIT 1),
  athlete_id,
  42 + ((client_no + day) % 4) * 5,
  45,
  CASE WHEN scheduled_date = CURRENT_DATE THEN 1 ELSE 0 END,
  week_start,
  CASE
    WHEN scheduled_date <= CURRENT_DATE
      AND mod(client_no + week_no + day, 4) <> 0
    THEN (
      scheduled_date
      + (mod(client_no + day, 2) * INTERVAL '1 day')
      + TIME '18:00'
      + (client_no * INTERVAL '6 minutes')
    )::timestamptz
    ELSE NULL
  END
FROM planned;

INSERT INTO routine_exercise (routine_id, exercise_id, position)
SELECT r.id, exercise.exercise_id, exercise.position
FROM routine r
CROSS JOIN (
  VALUES
    ('stats-demo-exercise-1', 1),
    ('stats-demo-exercise-2', 2),
    ('stats-demo-exercise-3', 3),
    ('stats-demo-exercise-4', 4),
    ('stats-demo-exercise-5', 5)
) AS exercise(exercise_id, position)
WHERE r.id LIKE 'stats-demo-%';

DELETE FROM set_log
WHERE routine_id LIKE 'stats-demo-%';

INSERT INTO set_log (
  clerk_user_id,
  routine_id,
  exercise_id,
  set_index,
  load,
  reps,
  logged_at
)
SELECT
  r.athlete_id,
  r.id,
  re.exercise_id,
  sets.set_index,
  CASE re.position
    WHEN 1 THEN 24 + ((r.day + sets.set_index) % 3) * 2
    WHEN 2 THEN 42 + ((r.day + sets.set_index) % 3) * 2
    WHEN 3 THEN 36 + ((r.day + sets.set_index) % 3) * 3
    WHEN 4 THEN 40 + ((r.day + sets.set_index) % 3) * 4
    ELSE 0
  END::double precision,
  CASE re.position
    WHEN 5 THEN 40
    ELSE 8 + ((r.day + sets.set_index) % 3)
  END,
  r.completed_at - INTERVAL '55 minutes' + (sets.set_index * INTERVAL '5 minutes')
FROM routine r
JOIN routine_exercise re ON re.routine_id = r.id
CROSS JOIN generate_series(0, 2) AS sets(set_index)
WHERE r.id LIKE 'stats-demo-%'
  AND r.completed_at IS NOT NULL;

-- Mateo has a deliberate progression with a short plateau so the exercise
-- detail can show both improvement and a review signal. The other demo
-- students keep the varied generic loads above.
UPDATE set_log sl
SET
  load = CASE r.week
    WHEN 1 THEN 36
    WHEN 2 THEN 38
    WHEN 3 THEN 40
    WHEN 4 THEN 40
    WHEN 5 THEN 42
    ELSE 42
  END::double precision,
  reps = 10
FROM routine r
WHERE r.id = sl.routine_id
  AND r.athlete_id = (SELECT clerk_user_id FROM client WHERE id = 'client-mateo')
  AND r.id LIKE 'stats-demo-%'
  AND sl.exercise_id = 'stats-demo-exercise-2'
  AND r.completed_at IS NOT NULL;

INSERT INTO client_exercise_goal (
  client_id,
  exercise_key,
  exercise_name,
  baseline_date,
  baseline_load_kg,
  baseline_reps,
  target_date,
  target_load_kg,
  target_reps,
  note
)
VALUES (
  'client-mateo',
  'press de pecho',
  'Press de pecho',
  CURRENT_DATE - 35,
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

SELECT 'demo_routines' AS metric, count(*)::text AS value
FROM routine
WHERE id LIKE 'stats-demo-%'
UNION ALL
SELECT 'completed_routines', count(*)::text
FROM routine
WHERE id LIKE 'stats-demo-%' AND completed_at IS NOT NULL
UNION ALL
SELECT 'demo_set_logs', count(*)::text
FROM set_log
WHERE routine_id LIKE 'stats-demo-%';
