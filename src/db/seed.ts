import type { SQLiteDatabase } from 'expo-sqlite';

import {
  ATHLETE,
  ATHLETE_SETTINGS,
  CLIENTS,
  CLIENT_COUNT,
  COACH,
  COACH_SETTINGS,
  EXERCISES,
  HISTORY,
  HISTORY_SUMMARY,
  IMPORT_ESTIMATE_MINUTES,
  IMPORT_RESULT,
  IMPORT_SAMPLE_TEXT,
  IMPORT_SOURCE_FILE,
  MONTH_GRID,
  OVERLOAD_ROWS,
  PROGRESS_SUMMARY,
  TEMPLATES,
  THREADS,
  TODAY_ROUTINE,
  WEEKLY_VOLUME,
} from '@/data/mock';
import { SEEDED_TABLES } from './schema';

const bool = (v: unknown) => (v ? 1 : 0);

/**
 * Loads the design's sample content into the database. Everything here comes
 * from `src/data/mock.ts`, which stays the single source of truth for what the
 * seeded app looks like.
 */
export function seed(db: SQLiteDatabase) {
  db.withTransactionSync(() => {
    for (const table of SEEDED_TABLES) db.runSync(`DELETE FROM ${table}`);

    db.runSync(
      `INSERT INTO coach (id, name, short_name, first_name, specialty, code)
       VALUES (?, ?, ?, ?, ?, ?)`,
      ['camila', COACH.name, COACH.shortName, COACH.firstName, COACH.specialty, COACH.code],
    );

    db.runSync(
      `INSERT INTO athlete
         (id, name, first_name, goal, weight_kg, height_m, total_sessions, streak_weeks, coach_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        'nadia',
        ATHLETE.name,
        ATHLETE.firstName,
        ATHLETE.goal,
        ATHLETE.weightKg,
        ATHLETE.heightM,
        ATHLETE.totalSessions,
        ATHLETE.streakWeeks,
        'camila',
      ],
    );

    for (const e of EXERCISES) {
      db.runSync(
        `INSERT INTO exercise
           (id, name, scheme, suggested, sets, work, rest, focus, cues, overload,
            last_date, last_load, last_reps, last_note)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          e.id,
          e.name,
          e.scheme,
          e.suggested,
          e.sets,
          e.work,
          e.rest,
          e.focus,
          e.cues,
          e.overload,
          e.lastTime?.date ?? null,
          e.lastTime?.load ?? null,
          e.lastTime ? e.lastTime.reps.join(',') : null,
          e.lastTime?.note ?? null,
        ],
      );
    }

    db.runSync(
      `INSERT INTO routine
         (id, name, block, week, day, coach_id, athlete_id, estimated_minutes, seconds_per_set, is_today)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
      [
        TODAY_ROUTINE.id,
        TODAY_ROUTINE.name,
        TODAY_ROUTINE.block,
        TODAY_ROUTINE.week,
        TODAY_ROUTINE.day,
        'camila',
        TODAY_ROUTINE.athleteId,
        TODAY_ROUTINE.estimatedMinutes,
        TODAY_ROUTINE.secondsPerSet,
      ],
    );

    TODAY_ROUTINE.exercises.forEach((e, i) => {
      db.runSync(
        `INSERT INTO routine_exercise (routine_id, exercise_id, position) VALUES (?, ?, ?)`,
        [TODAY_ROUTINE.id, e.id, i],
      );
    });

    CLIENTS.forEach((c, i) => {
      db.runSync(
        `INSERT INTO client
           (id, name, status, attention, done, live_routine, live_set_index,
            live_total_sets, live_elapsed, position)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          c.id,
          c.name,
          c.status,
          bool(c.attention),
          bool(c.done),
          c.live?.routine ?? null,
          c.live?.setIndex ?? null,
          c.live?.totalSets ?? null,
          c.live?.elapsed ?? null,
          i,
        ],
      );
    });

    for (const s of HISTORY) {
      db.runSync(
        `INSERT INTO session (id, date, name, minutes, sets, volume, completion)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [s.id, s.date.toISOString(), s.name, s.minutes, s.sets, s.volume, s.completion],
      );
    }

    for (const row of OVERLOAD_ROWS) {
      db.runSync(
        `INSERT INTO overload_row
           (exercise_id, set_no, last_load, last_reps, next_load, next_reps)
         VALUES (?, ?, ?, ?, ?, ?)`,
        ['press-banca', row.set, row.lastLoad, row.lastReps, row.nextLoad, row.nextReps],
      );
    }

    WEEKLY_VOLUME.forEach((volume, i) => {
      db.runSync(`INSERT INTO weekly_volume (week, volume) VALUES (?, ?)`, [i + 1, volume]);
    });

    MONTH_GRID.forEach((mark, i) => {
      db.runSync(`INSERT INTO month_day (day_index, mark) VALUES (?, ?)`, [i, mark]);
    });

    const settings = [
      ...ATHLETE_SETTINGS.map((s) => ({ ...s, role: 'athlete' })),
      ...COACH_SETTINGS.map((s) => ({ ...s, role: 'coach' })),
    ];
    settings.forEach((s, i) => {
      db.runSync(
        `INSERT INTO setting (id, role, label, value, accent, position) VALUES (?, ?, ?, ?, ?, ?)`,
        [s.id, s.role, s.label, s.value, bool('accent' in s && s.accent), i],
      );
    });

    TEMPLATES.forEach((t, i) => {
      db.runSync(
        `INSERT INTO template (id, name, meta, assigned, position) VALUES (?, ?, ?, ?, ?)`,
        [t.id, t.name, t.meta, t.assigned, i],
      );
    });

    THREADS.forEach((t, i) => {
      db.runSync(
        `INSERT INTO thread (client_id, preview, when_label, unread, position)
         VALUES (?, ?, ?, ?, ?)`,
        [t.clientId, t.preview, t.when, bool(t.unread), i],
      );
    });

    IMPORT_RESULT.forEach((line, i) => {
      db.runSync(
        `INSERT INTO import_line
           (id, name, sets, reps, load, rest, uncertain, raw, question, option_a, option_b, position)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          line.id,
          line.name,
          line.sets,
          line.reps,
          line.load,
          line.rest,
          bool(line.uncertain),
          line.raw ?? null,
          line.question ?? null,
          line.options?.[0] ?? null,
          line.options?.[1] ?? null,
          i,
        ],
      );
    });

    const meta: [string, string | number][] = [
      ['client_count', CLIENT_COUNT],
      ['history_sessions', HISTORY_SUMMARY.sessions],
      ['history_minutes', HISTORY_SUMMARY.totalMinutes],
      ['history_completion', HISTORY_SUMMARY.completion],
      ['progress_top_load', PROGRESS_SUMMARY.topLoad],
      ['progress_window', PROGRESS_SUMMARY.windowLabel],
      ['progress_growth', PROGRESS_SUMMARY.growth],
      ['import_source_file', IMPORT_SOURCE_FILE],
      ['import_sample_text', IMPORT_SAMPLE_TEXT],
      ['import_estimate_minutes', IMPORT_ESTIMATE_MINUTES],
    ];
    for (const [key, value] of meta) {
      db.runSync(`INSERT INTO app_meta (key, value) VALUES (?, ?)`, [key, String(value)]);
    }
  });
}
