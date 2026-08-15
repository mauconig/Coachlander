#!/usr/bin/env node
/**
 * Smoke-tests the SQL layer against a real SQLite engine.
 *
 *   npm run check:sql
 *
 * Bundling and `tsc` both pass on SQL that is syntactically broken or names a
 * column that does not exist — those only blow up on device. This applies the
 * schema to an in-memory database, then prepares every statement in
 * `src/db/*.ts` against it, so a typo fails here instead of in the emulator.
 */
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

/** Pulls the SCHEMA_SQL template literal out of schema.ts. */
function extractSchema() {
  const source = read('src/db/schema.ts');
  const match = source.match(/export const SCHEMA_SQL = `([\s\S]*?)`;/);
  if (!match) throw new Error('No se encontró SCHEMA_SQL en src/db/schema.ts');
  return match[1];
}

/** Every backtick-quoted string that looks like a SQL statement. */
function extractStatements(file) {
  const source = read(file);
  const found = [];
  for (const [, sql] of source.matchAll(/`((?:SELECT|INSERT|UPDATE|DELETE|PRAGMA)[\s\S]*?)`/gi)) {
    found.push({ file, sql: sql.trim() });
  }
  // Single-quoted one-liners, e.g. db.getAllSync('SELECT * FROM exercise').
  for (const [, sql] of source.matchAll(/'((?:SELECT|INSERT|UPDATE|DELETE)\s[^']*)'/gi)) {
    found.push({ file, sql: sql.trim() });
  }
  return found;
}

/** `INSERT INTO t (a, b) VALUES (?, ?)` must list as many columns as markers. */
function checkPlaceholders({ file, sql }) {
  const insert = sql.match(/INSERT INTO\s+\w+\s*\(([^)]*)\)\s*VALUES\s*\(([^)]*)\)/i);
  if (!insert) return null;
  const columns = insert[1].split(',').length;
  const markers = insert[2].split(',').length;
  if (columns !== markers) {
    return `${file}: INSERT con ${columns} columnas y ${markers} valores\n  ${sql.replace(/\s+/g, ' ')}`;
  }
  return null;
}

const db = new DatabaseSync(':memory:');
const failures = [];

try {
  db.exec(extractSchema());
} catch (error) {
  console.error(`\n✗ El esquema no se pudo aplicar:\n  ${error.message}\n`);
  process.exit(1);
}

const statements = [
  ...extractStatements('src/db/seed.ts'),
  ...extractStatements('src/db/queries.ts'),
  ...extractStatements('src/db/migrate.ts'),
];

for (const statement of statements) {
  const mismatch = checkPlaceholders(statement);
  if (mismatch) failures.push(mismatch);

  // `DELETE FROM ${table}` is built from a constant list, not user input.
  if (statement.sql.includes('${')) continue;

  try {
    db.prepare(statement.sql).finalize?.();
  } catch (error) {
    failures.push(`${statement.file}: ${error.message}\n  ${statement.sql.replace(/\s+/g, ' ')}`);
  }
}

// The tables the seed clears must all exist.
const seeded = read('src/db/schema.ts').match(/SEEDED_TABLES = \[([\s\S]*?)\]/)?.[1] ?? '';
for (const [, table] of seeded.matchAll(/'([^']+)'/g)) {
  try {
    db.prepare(`DELETE FROM ${table}`).finalize?.();
  } catch {
    failures.push(`schema.ts: SEEDED_TABLES nombra una tabla inexistente: ${table}`);
  }
}

if (failures.length) {
  console.error(`\n✗ ${failures.length} problema(s) de SQL:\n`);
  for (const failure of failures) console.error(`  ${failure}\n`);
  process.exit(1);
}

console.log(`✓ Esquema aplicado y ${statements.length} sentencias verificadas.`);
