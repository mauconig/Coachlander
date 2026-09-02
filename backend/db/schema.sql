CREATE TABLE IF NOT EXISTS coach (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  short_name TEXT NOT NULL,
  first_name TEXT NOT NULL,
  specialty TEXT NOT NULL,
  code TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS athlete (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  first_name TEXT NOT NULL,
  goal TEXT NOT NULL,
  weight_kg DOUBLE PRECISION NOT NULL,
  height_m DOUBLE PRECISION NOT NULL,
  total_sessions INTEGER NOT NULL,
  streak_weeks INTEGER NOT NULL,
  coach_id TEXT REFERENCES coach(id)
);

CREATE TABLE IF NOT EXISTS exercise (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  scheme TEXT NOT NULL,
  suggested DOUBLE PRECISION NOT NULL DEFAULT 0,
  sets INTEGER NOT NULL,
  work INTEGER NOT NULL,
  rest INTEGER NOT NULL,
  focus TEXT NOT NULL,
  cues TEXT NOT NULL,
  overload DOUBLE PRECISION,
  last_date TEXT,
  last_load DOUBLE PRECISION,
  last_reps TEXT,
  last_note TEXT
);

ALTER TABLE exercise
  ADD COLUMN IF NOT EXISTS muscle_groups TEXT[] NOT NULL DEFAULT '{}';

ALTER TABLE exercise
  ADD COLUMN IF NOT EXISTS load_source TEXT NOT NULL DEFAULT 'coach';

ALTER TABLE exercise
  ADD COLUMN IF NOT EXISTS load_reason TEXT NOT NULL DEFAULT '';

ALTER TABLE exercise
  ADD COLUMN IF NOT EXISTS progression_metric TEXT NOT NULL DEFAULT 'load';

ALTER TABLE exercise
  ADD COLUMN IF NOT EXISTS target_reps INTEGER NOT NULL DEFAULT 0;

ALTER TABLE exercise
  ADD COLUMN IF NOT EXISTS catalog_id TEXT;

CREATE INDEX IF NOT EXISTS idx_exercise_catalog_id
  ON exercise (catalog_id);

CREATE TABLE IF NOT EXISTS exercise_catalog (
  id TEXT PRIMARY KEY,
  name_en TEXT NOT NULL,
  name_es TEXT NOT NULL,
  category_en TEXT NOT NULL,
  category_es TEXT NOT NULL,
  body_part_en TEXT NOT NULL,
  body_part_es TEXT NOT NULL,
  equipment_en TEXT NOT NULL,
  equipment_es TEXT NOT NULL,
  target_en TEXT NOT NULL,
  target_es TEXT NOT NULL,
  muscle_group_en TEXT NOT NULL,
  muscle_group_es TEXT NOT NULL,
  secondary_muscles_en TEXT[] NOT NULL DEFAULT '{}',
  secondary_muscles_es TEXT[] NOT NULL DEFAULT '{}',
  muscle_groups TEXT[] NOT NULL DEFAULT '{}',
  instructions_es TEXT NOT NULL DEFAULT '',
  instruction_steps_es TEXT[] NOT NULL DEFAULT '{}',
  image_url TEXT,
  gif_url TEXT,
  attribution TEXT NOT NULL DEFAULT '© Gym visual — https://gymvisual.com/',
  source TEXT NOT NULL DEFAULT 'hasaneyldrm/exercises-dataset',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_exercise_catalog_name_es
  ON exercise_catalog (name_es);

CREATE INDEX IF NOT EXISTS idx_exercise_catalog_body_part_es
  ON exercise_catalog (body_part_es);

CREATE TABLE IF NOT EXISTS routine (
  id TEXT PRIMARY KEY,
  plan_id TEXT,
  name TEXT NOT NULL,
  block TEXT NOT NULL,
  week INTEGER NOT NULL,
  day INTEGER NOT NULL,
  coach_id TEXT REFERENCES coach(id),
  athlete_id TEXT,
  estimated_minutes INTEGER NOT NULL,
  seconds_per_set INTEGER NOT NULL,
  is_today INTEGER NOT NULL DEFAULT 0
);

ALTER TABLE routine
  ADD COLUMN IF NOT EXISTS plan_id TEXT;

ALTER TABLE routine
  ADD COLUMN IF NOT EXISTS week_start DATE;

ALTER TABLE routine
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

ALTER TABLE routine
  ADD COLUMN IF NOT EXISTS load_mode TEXT NOT NULL DEFAULT 'coach';

ALTER TABLE routine
  ADD COLUMN IF NOT EXISTS session_status TEXT NOT NULL DEFAULT 'scheduled';

ALTER TABLE routine
  ADD COLUMN IF NOT EXISTS session_ended_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_routine_coach_id
  ON routine (coach_id);

UPDATE routine
   SET session_status = 'completed'
 WHERE completed_at IS NOT NULL
   AND session_status = 'scheduled';

CREATE INDEX IF NOT EXISTS idx_routine_session_status
  ON routine (athlete_id, session_status, session_ended_at);

CREATE INDEX IF NOT EXISTS idx_routine_athlete_plan
  ON routine (athlete_id, plan_id);

CREATE INDEX IF NOT EXISTS idx_routine_athlete_week
  ON routine (athlete_id, week_start);

CREATE TABLE IF NOT EXISTS routine_exercise (
  routine_id TEXT NOT NULL REFERENCES routine(id),
  exercise_id TEXT NOT NULL REFERENCES exercise(id),
  position INTEGER NOT NULL,
  PRIMARY KEY (routine_id, exercise_id)
);

CREATE TABLE IF NOT EXISTS client (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  status TEXT NOT NULL,
  attention INTEGER NOT NULL DEFAULT 0,
  done INTEGER NOT NULL DEFAULT 0,
  live_routine TEXT,
  live_set_index INTEGER,
  live_total_sets INTEGER,
  live_elapsed TEXT,
  live_session_started_at TIMESTAMPTZ,
  position INTEGER NOT NULL
);

ALTER TABLE client
  ADD COLUMN IF NOT EXISTS live_session_started_at TIMESTAMPTZ;

ALTER TABLE client
  ADD COLUMN IF NOT EXISTS clerk_user_id TEXT;

CREATE INDEX IF NOT EXISTS idx_client_clerk_user_id
  ON client (clerk_user_id);

CREATE TABLE IF NOT EXISTS session (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  name TEXT NOT NULL,
  minutes INTEGER NOT NULL,
  sets INTEGER NOT NULL,
  volume INTEGER NOT NULL,
  completion INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS overload_row (
  exercise_id TEXT NOT NULL REFERENCES exercise(id),
  set_no INTEGER NOT NULL,
  last_load DOUBLE PRECISION NOT NULL,
  last_reps INTEGER NOT NULL,
  next_load DOUBLE PRECISION NOT NULL,
  next_reps INTEGER NOT NULL,
  PRIMARY KEY (exercise_id, set_no)
);

CREATE TABLE IF NOT EXISTS weekly_volume (
  week INTEGER PRIMARY KEY,
  volume INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS month_day (
  day_index INTEGER PRIMARY KEY,
  mark TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS setting (
  id TEXT NOT NULL,
  role TEXT NOT NULL,
  label TEXT NOT NULL,
  value TEXT NOT NULL DEFAULT '',
  accent INTEGER NOT NULL DEFAULT 0,
  position INTEGER NOT NULL,
  PRIMARY KEY (id, role)
);

CREATE TABLE IF NOT EXISTS template (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  meta TEXT NOT NULL,
  assigned TEXT,
  position INTEGER NOT NULL
);

ALTER TABLE template
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS template_day (
  template_id TEXT NOT NULL REFERENCES template(id) ON DELETE CASCADE,
  day INTEGER NOT NULL,
  name TEXT NOT NULL,
  PRIMARY KEY (template_id, day)
);

CREATE TABLE IF NOT EXISTS template_exercise (
  template_id TEXT NOT NULL REFERENCES template(id) ON DELETE CASCADE,
  day INTEGER NOT NULL,
  position INTEGER NOT NULL,
  name TEXT NOT NULL,
  sets INTEGER NOT NULL,
  reps TEXT NOT NULL,
  load_kg DOUBLE PRECISION,
  rest_seconds INTEGER NOT NULL,
  note TEXT,
  PRIMARY KEY (template_id, day, position)
);

ALTER TABLE template_exercise
  ADD COLUMN IF NOT EXISTS note TEXT;

ALTER TABLE template_exercise
  ADD COLUMN IF NOT EXISTS progression_metric TEXT NOT NULL DEFAULT 'load';

CREATE TABLE IF NOT EXISTS thread (
  client_id TEXT PRIMARY KEY REFERENCES client(id),
  preview TEXT NOT NULL,
  when_label TEXT NOT NULL,
  unread INTEGER NOT NULL DEFAULT 0,
  position INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS import_line (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  sets INTEGER NOT NULL,
  reps INTEGER NOT NULL,
  load DOUBLE PRECISION,
  rest INTEGER NOT NULL,
  uncertain INTEGER NOT NULL DEFAULT 0,
  raw TEXT,
  question TEXT,
  option_a TEXT,
  option_b TEXT,
  position INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS app_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS app_user (
  clerk_user_id TEXT PRIMARY KEY,
  email TEXT,
  role TEXT NOT NULL DEFAULT 'athlete' CHECK (role IN ('athlete', 'coach')),
  display_name TEXT,
  first_name TEXT,
  goal TEXT,
  weight_kg DOUBLE PRECISION,
  height_m DOUBLE PRECISION,
  solo_training BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE app_user
  ADD COLUMN IF NOT EXISTS solo_training BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS set_log (
  id BIGSERIAL PRIMARY KEY,
  clerk_user_id TEXT NOT NULL REFERENCES app_user(clerk_user_id) ON DELETE CASCADE,
  routine_id TEXT NOT NULL,
  session_id TEXT,
  exercise_id TEXT NOT NULL,
  set_index INTEGER NOT NULL,
  load DOUBLE PRECISION,
  reps INTEGER NOT NULL,
  logged_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE set_log
  ADD COLUMN IF NOT EXISTS session_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_set_log_session_set
  ON set_log (clerk_user_id, session_id, routine_id, exercise_id, set_index)
  WHERE session_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_set_log_user_exercise
  ON set_log (clerk_user_id, exercise_id, logged_at);

CREATE INDEX IF NOT EXISTS idx_set_log_routine
  ON set_log (routine_id, logged_at);

CREATE TABLE IF NOT EXISTS client_exercise_goal (
  client_id TEXT NOT NULL REFERENCES client(id) ON DELETE CASCADE,
  exercise_key TEXT NOT NULL,
  exercise_name TEXT NOT NULL,
  baseline_date DATE NOT NULL,
  baseline_load_kg DOUBLE PRECISION,
  baseline_reps INTEGER NOT NULL CHECK (baseline_reps > 0 AND baseline_reps <= 100),
  target_date DATE NOT NULL,
  target_load_kg DOUBLE PRECISION,
  target_reps INTEGER NOT NULL CHECK (target_reps > 0 AND target_reps <= 100),
  note TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (client_id, exercise_key),
  CHECK (target_date >= baseline_date),
  CHECK (baseline_load_kg IS NULL OR baseline_load_kg >= 0),
  CHECK (target_load_kg IS NULL OR target_load_kg >= 0)
);

CREATE INDEX IF NOT EXISTS idx_client_exercise_goal_client
  ON client_exercise_goal (client_id, exercise_key);

CREATE TABLE IF NOT EXISTS load_reference (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  pct_bodyweight DOUBLE PRECISION,
  base_load DOUBLE PRECISION
);
