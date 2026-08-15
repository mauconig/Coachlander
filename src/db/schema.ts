/**
 * SQLite schema. Bump SCHEMA_VERSION whenever the shape changes — `migrate`
 * drops and reseeds below that version, which is the right trade-off while the
 * database only ever holds seed content plus locally logged sets.
 */
export const DATABASE_NAME = 'tempo.db';

export const SCHEMA_VERSION = 1;

export const SCHEMA_SQL = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS coach (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  short_name  TEXT NOT NULL,
  first_name  TEXT NOT NULL,
  specialty   TEXT NOT NULL,
  code        TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS athlete (
  id             TEXT PRIMARY KEY,
  name           TEXT NOT NULL,
  first_name     TEXT NOT NULL,
  goal           TEXT NOT NULL,
  weight_kg      REAL NOT NULL,
  height_m       REAL NOT NULL,
  total_sessions INTEGER NOT NULL,
  streak_weeks   INTEGER NOT NULL,
  coach_id       TEXT REFERENCES coach(id)
);

CREATE TABLE IF NOT EXISTS exercise (
  id        TEXT PRIMARY KEY,
  name      TEXT NOT NULL,
  scheme    TEXT NOT NULL,
  suggested REAL NOT NULL DEFAULT 0,
  sets      INTEGER NOT NULL,
  work      INTEGER NOT NULL,
  rest      INTEGER NOT NULL,
  focus     TEXT NOT NULL,
  cues      TEXT NOT NULL,
  overload  REAL,
  last_date TEXT,
  last_load REAL,
  last_reps TEXT,
  last_note TEXT
);

CREATE TABLE IF NOT EXISTS routine (
  id                TEXT PRIMARY KEY,
  name              TEXT NOT NULL,
  block             TEXT NOT NULL,
  week              INTEGER NOT NULL,
  day               INTEGER NOT NULL,
  coach_id          TEXT REFERENCES coach(id),
  athlete_id        TEXT,
  estimated_minutes INTEGER NOT NULL,
  seconds_per_set   INTEGER NOT NULL,
  is_today          INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS routine_exercise (
  routine_id  TEXT NOT NULL REFERENCES routine(id),
  exercise_id TEXT NOT NULL REFERENCES exercise(id),
  position    INTEGER NOT NULL,
  PRIMARY KEY (routine_id, exercise_id)
);

CREATE TABLE IF NOT EXISTS client (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  status          TEXT NOT NULL,
  attention       INTEGER NOT NULL DEFAULT 0,
  done            INTEGER NOT NULL DEFAULT 0,
  live_routine    TEXT,
  live_set_index  INTEGER,
  live_total_sets INTEGER,
  live_elapsed    TEXT,
  position        INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS session (
  id         TEXT PRIMARY KEY,
  date       TEXT NOT NULL,
  name       TEXT NOT NULL,
  minutes    INTEGER NOT NULL,
  sets       INTEGER NOT NULL,
  volume     INTEGER NOT NULL,
  completion INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS overload_row (
  exercise_id TEXT NOT NULL REFERENCES exercise(id),
  set_no      INTEGER NOT NULL,
  last_load   REAL NOT NULL,
  last_reps   INTEGER NOT NULL,
  next_load   REAL NOT NULL,
  next_reps   INTEGER NOT NULL,
  PRIMARY KEY (exercise_id, set_no)
);

CREATE TABLE IF NOT EXISTS weekly_volume (
  week   INTEGER PRIMARY KEY,
  volume INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS month_day (
  day_index INTEGER PRIMARY KEY,
  mark      TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS setting (
  id       TEXT NOT NULL,
  role     TEXT NOT NULL,
  label    TEXT NOT NULL,
  value    TEXT NOT NULL DEFAULT '',
  accent   INTEGER NOT NULL DEFAULT 0,
  position INTEGER NOT NULL,
  PRIMARY KEY (id, role)
);

CREATE TABLE IF NOT EXISTS template (
  id       TEXT PRIMARY KEY,
  name     TEXT NOT NULL,
  meta     TEXT NOT NULL,
  assigned TEXT,
  position INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS thread (
  client_id TEXT PRIMARY KEY REFERENCES client(id),
  preview   TEXT NOT NULL,
  when_label TEXT NOT NULL,
  unread    INTEGER NOT NULL DEFAULT 0,
  position  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS import_line (
  id        TEXT PRIMARY KEY,
  name      TEXT NOT NULL,
  sets      INTEGER NOT NULL,
  reps      INTEGER NOT NULL,
  load      REAL,
  rest      INTEGER NOT NULL,
  uncertain INTEGER NOT NULL DEFAULT 0,
  raw       TEXT,
  question  TEXT,
  option_a  TEXT,
  option_b  TEXT,
  position  INTEGER NOT NULL
);

-- Written by the live session player, not by the seed.
CREATE TABLE IF NOT EXISTS set_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  routine_id  TEXT NOT NULL,
  exercise_id TEXT NOT NULL,
  set_index   INTEGER NOT NULL,
  load        REAL,
  reps        INTEGER NOT NULL,
  logged_at   TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_set_log_exercise ON set_log (exercise_id, logged_at);

-- Scalar values that have no natural home in a table.
CREATE TABLE IF NOT EXISTS app_meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;

/** Tables cleared before a reseed, in dependency order. */
export const SEEDED_TABLES = [
  'routine_exercise',
  'overload_row',
  'thread',
  'template',
  'setting',
  'import_line',
  'month_day',
  'weekly_volume',
  'session',
  'client',
  'routine',
  'exercise',
  'athlete',
  'coach',
  'app_meta',
] as const;
