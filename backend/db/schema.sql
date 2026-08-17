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

CREATE INDEX IF NOT EXISTS idx_routine_athlete_plan
  ON routine (athlete_id, plan_id);

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
  position INTEGER NOT NULL
);

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
  exercise_id TEXT NOT NULL,
  set_index INTEGER NOT NULL,
  load DOUBLE PRECISION,
  reps INTEGER NOT NULL,
  logged_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_set_log_user_exercise
  ON set_log (clerk_user_id, exercise_id, logged_at);
